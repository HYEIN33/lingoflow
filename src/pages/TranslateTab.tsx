/**
 * TranslateTab — the entire translate page UI.
 *
 * Extracted from App.tsx (previously ~555 lines inlined inside the activeTab
 * switch) on 2026-04-13 so there's a single place to own the translate
 * surface. Keeps all the features that were in the inline version:
 *
 *   - Input with 2000-char cap, char counter when > 200
 *   - Clear button + photo OCR trigger + mic + submit
 *   - Formality slider (Pro-gated, overlay click opens paywall)
 *   - Search history (shown when no result yet)
 *   - 3-tier adaptive layout: word / sentence / paragraph
 *   - Dual-column translation (authentic + academic)
 *   - Word-level details (meaning, synonyms, antonyms, alternatives, conjugations)
 *   - Examples list with per-example TTS
 *   - Slang insight sidebar (word mode only)
 *   - Pro upsell card (non-Pro users only)
 *   - Back button for synonym/antonym navigation
 */
import React, { useRef } from 'react';
import {
  Plus,
  BookOpen,
  Loader2,
  Volume2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Mic,
  MicOff,
  MessageSquare,
  Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TranslationResult, SlangExplanationResult } from '../services/ai';
import { cn } from '../lib/utils';
import { Language, translations } from '../i18n';
import { UserProfile } from '../App';

interface SearchHistoryItem {
  text: string;
  timestamp: number;
}

interface TranslateTabProps {
  // Input state
  inputText: string;
  setInputText: (v: string) => void;
  isTranslating: boolean;

  // Result state
  translationResult: TranslationResult | null;
  selectedUsageIndex: number;
  setSelectedUsageIndex: (v: number) => void;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;

  // Formality (Pro gated)
  formalityLevel: number;
  setFormalityLevel: (v: number) => void;

  // Slang insights sidebar
  isFetchingSlang: boolean;
  slangInsights: SlangExplanationResult[];

  // Save
  isSaving: boolean;

  // Lazy-loaded word-level details (synonyms/antonyms/conjugations) — shown
  // as a small spinner next to "Show Details" while fetching.
  isLoadingDetails?: boolean;

  // Audio
  loadingAudioText: string | null;

  // User + i18n
  userProfile: UserProfile | null;
  uiLang: Language;

  // Search history
  searchHistory: SearchHistoryItem[];
  removeFromHistory: (text: string) => void;
  clearHistory: () => void;

  // Navigation memory
  previousSearchWord: string | null;
  setPreviousSearchWord: (v: string | null) => void;

  // Photo OCR
  isExtractingPhoto: boolean;
  onPhotoCapture: (e: React.ChangeEvent<HTMLInputElement>) => void;

  // Speech
  isListening: boolean;
  onToggleListening: () => void;

  // Actions
  onTranslate: (e?: React.FormEvent) => void;
  // Called by the × button in the input box. Wipes input AND result so the
  // user returns to the search-history + trending-memes landing view.
  onClear: () => void;
  onSearchWord: (word: string) => void;
  onGoBack: () => void;
  onSaveWord: (styleTag?: 'authentic' | 'academic' | 'standard') => void;
  onSpeak: (text: string) => void;
  onOpenPaywall: (trigger: string) => void;
  onUpgrade: () => void;
  onViewSlangEntry: (term: string) => void;
}

// IPA pronunciation only makes sense for a single lookup word. Hide it when:
//   - the original is a multi-word phrase or full sentence (no speaker
//     expects IPA for "we promise you will understand everything"), OR
//   - it's a short all-caps acronym like WSG / CAPM, where IPA reads
//     the letters one-by-one ("double-you es gee") which is useless noise.
function shouldHidePronunciation(text: string | undefined): boolean {
  if (!text) return true;
  const t = text.trim();
  if (!t) return true;
  // Multi-word → hide (phrases and sentences don't want IPA).
  if (/\s/.test(t)) return true;
  // Punctuation-heavy → probably a sentence fragment, hide.
  if (/[.!?;:]/.test(t)) return true;
  // Short all-caps/digit cluster → acronym, hide.
  if (t.length >= 2 && t.length <= 6 && /^[A-Z0-9]+$/.test(t)) return true;
  return false;
}

export default function TranslateTab({
  inputText,
  setInputText,
  isTranslating,
  translationResult,
  selectedUsageIndex,
  setSelectedUsageIndex,
  showDetails,
  setShowDetails,
  formalityLevel,
  setFormalityLevel,
  isFetchingSlang,
  slangInsights,
  isSaving,
  isLoadingDetails,
  loadingAudioText,
  userProfile,
  uiLang,
  searchHistory,
  removeFromHistory,
  clearHistory,
  previousSearchWord,
  setPreviousSearchWord,
  isExtractingPhoto,
  onPhotoCapture,
  isListening,
  onToggleListening,
  onTranslate,
  onClear,
  onSearchWord,
  onGoBack,
  onSaveWord,
  onSpeak,
  onOpenPaywall,
  onUpgrade,
  onViewSlangEntry,
}: TranslateTabProps) {
  const t = translations[uiLang];
  const photoInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6">
      {/* Search Box */}
      <form onSubmit={onTranslate} className="relative group">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value.slice(0, 2000))}
          placeholder={t.inputPlaceholder}
          maxLength={2000}
          className="w-full bg-white border-2 border-transparent focus:border-blue-500 rounded-3xl py-4 sm:py-6 pl-6 sm:pl-8 pr-40 sm:pr-48 text-lg sm:text-xl shadow-xl shadow-gray-200/50 outline-none transition-all placeholder:text-gray-300"
        />
        {/* Character count — only when typing long text */}
        {inputText.length > 200 && (
          <div className="absolute -bottom-6 right-4 text-[10px] text-gray-400 font-mono">
            {inputText.length} / 2000
          </div>
        )}
        {/* Clear button — wipes the translation surface back to the landing
            view (search history + trending memes). Previously this only
            cleared inputText, leaving the old translation visible on screen,
            so users who finished reading a word couldn't see their history
            again without reloading. */}
        {(inputText || translationResult) && (
          <button
            type="button"
            onClick={() => { onClear(); setPreviousSearchWord(null); }}
            className="absolute left-auto right-36 sm:right-44 top-1/2 -translate-y-1/2 p-1.5 text-gray-300 hover:text-gray-500 transition-colors z-20"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
          </button>
        )}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPhotoCapture}
          className="hidden"
        />
        <div className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 sm:gap-2 z-20">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={isExtractingPhoto}
            className="p-3 sm:p-4 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-lg cursor-pointer bg-blue-100 text-blue-600 shadow-blue-100"
            title={uiLang === 'zh' ? '拍照翻译' : 'Photo Translate'}
          >
            {isExtractingPhoto
              ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
              : <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>}
          </button>
          <button
            type="button"
            onClick={onToggleListening}
            className={cn(
              "p-2 rounded-xl transition-all cursor-pointer",
              isListening ? "bg-red-500 text-white" : "text-gray-300 hover:text-gray-400"
            )}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            type="submit"
            disabled={isTranslating || !inputText.trim()}
            className="bg-blue-600 text-white p-3 sm:p-4 rounded-2xl disabled:opacity-50 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-200"
          >
            {isTranslating ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
        </div>
      </form>

      {/* Formality Slider (Pro-gated) */}
      <div
        className={cn(
          "bg-white/60 backdrop-blur-md border border-white/60 rounded-2xl p-4 shadow-sm relative group",
          !userProfile?.isPro && "opacity-60 cursor-not-allowed"
        )}
      >
        {!userProfile?.isPro && (
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={() => onOpenPaywall('slider')}
            title={uiLang === 'zh' ? 'Pro 功能 · 升级解锁' : 'Pro Feature · Upgrade to Unlock'}
          />
        )}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-600">{uiLang === 'zh' ? '口语/俚语' : 'Casual/Slang'}</span>
          <span className="text-sm font-bold text-blue-600">
            {uiLang === 'zh' ? '正式程度' : 'Formality'}: {formalityLevel}
            {!userProfile?.isPro && <span className="ml-2 text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded uppercase">Pro</span>}
          </span>
          <span className="text-sm font-semibold text-gray-600">{uiLang === 'zh' ? '学术/正式' : 'Academic/Formal'}</span>
        </div>
        <input
          type="range"
          min="1"
          max="100"
          value={formalityLevel}
          onChange={(e) => setFormalityLevel(Number(e.target.value))}
          disabled={!userProfile?.isPro}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none accent-blue-600"
        />
      </div>

      {/* Search History (only before a result exists) */}
      {!translationResult && searchHistory.length > 0 && (
        <div className="bg-white/60 backdrop-blur-md border border-white/60 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              {uiLang === 'zh' ? '搜索记录' : 'Search History'}
            </h3>
            <button onClick={clearHistory} className="text-[10px] text-gray-400 hover:text-red-400 font-medium transition-colors">
              {uiLang === 'zh' ? '清空' : 'Clear'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {searchHistory.slice(0, 10).map((item, i) => (
              <div key={i} className="group flex items-center">
                <button
                  onClick={() => onSearchWord(item.text)}
                  className="bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-600 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors max-w-[200px] truncate"
                  title={item.text}
                >
                  {item.text.length > 15 ? item.text.slice(0, 15) + '...' : item.text}
                </button>
                <button
                  onClick={() => removeFromHistory(item.text)}
                  className="ml-0.5 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Translation Result */}
      {translationResult && (() => {
        // Detect content length tier — affects layout, font size, and whether
        // to show word-level details.
        //   word      - single word/phrase, show full details + side panel
        //   sentence  - short sentence (< 200 chars), compact single column
        //   paragraph - long text (>= 200 chars), tightest fonts for readability
        const txt = (inputText || '').trim();
        const wordCount = txt.split(/\s+/).filter(Boolean).length;
        const isSentence = wordCount > 3 || txt.length > 20;
        const isParagraph = txt.length >= 200;
        const translationFontCls = isParagraph
          ? "text-xs sm:text-sm leading-relaxed"
          : isSentence
            ? "text-sm sm:text-base leading-relaxed"
            : "text-lg";
        // In sentence/paragraph mode the Volume button sits below the text
        // (no wasted right-side whitespace); in word mode it floats top-right.
        const volumeBtnCls = isSentence
          ? "mt-3 inline-flex items-center gap-1 text-xs font-bold transition-colors"
          : "absolute top-4 right-4 p-2 transition-colors";
        const textPadRight = isSentence ? "" : "pr-8";

        return (
          <div className={cn("grid grid-cols-1 gap-8", !isSentence && "lg:grid-cols-3")}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("bg-white rounded-3xl p-5 sm:p-8 shadow-xl border border-gray-100 space-y-8 overflow-hidden", !isSentence && "lg:col-span-2")}
            >
              {/* Dual Column Translation */}
              {(translationResult.authenticTranslation || translationResult.academicTranslation) && (
                <div className={cn("grid grid-cols-1 gap-4", !isSentence && "lg:grid-cols-2")}>
                  {/* Authentic Column */}
                  {translationResult.authenticTranslation && (
                    <div className="bg-blue-50/50 rounded-2xl p-4 sm:p-6 border border-blue-100 relative overflow-hidden">
                      <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Zap className="w-3 h-3 fill-current" />
                        {uiLang === 'zh' ? '地道表达 (Authentic)' : 'Authentic Expression'}
                      </h3>
                      <p className={cn("text-gray-900 font-medium break-words", translationFontCls, textPadRight)}>
                        {translationResult.authenticTranslation}
                      </p>
                      <button
                        onClick={() => onSpeak(translationResult.authenticTranslation!)}
                        className={cn(volumeBtnCls, "text-blue-400 hover:text-blue-600")}
                      >
                        <Volume2 className="w-5 h-5" />
                        {isSentence && <span>{uiLang === 'zh' ? '朗读' : 'Listen'}</span>}
                      </button>
                      <button
                        onClick={() => onSaveWord('authentic')}
                        disabled={isSaving}
                        className="mt-4 flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        {uiLang === 'zh' ? '存入地道表达' : 'Save as Authentic'}
                      </button>
                    </div>
                  )}
                  {/* Academic Column */}
                  {translationResult.academicTranslation && (
                    <div className="bg-gray-50 rounded-2xl p-4 sm:p-6 border border-gray-200 relative overflow-hidden">
                      <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <BookOpen className="w-3 h-3" />
                        {uiLang === 'zh' ? '学术表达 (Academic)' : 'Academic Expression'}
                      </h3>
                      <p className={cn("text-gray-900 font-medium break-words", translationFontCls, textPadRight)}>
                        {translationResult.academicTranslation}
                      </p>
                      <button
                        onClick={() => onSpeak(translationResult.academicTranslation!)}
                        className={cn(volumeBtnCls, "text-gray-400 hover:text-gray-600")}
                      >
                        <Volume2 className="w-5 h-5" />
                        {isSentence && <span>{uiLang === 'zh' ? '朗读' : 'Listen'}</span>}
                      </button>
                      <button
                        onClick={() => onSaveWord('academic')}
                        disabled={isSaving}
                        className="mt-4 flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        {uiLang === 'zh' ? '存入学术表达' : 'Save as Academic'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Sentence mode: show original text with matching font tier */}
              {isSentence && (
                <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
                    {uiLang === 'zh' ? '原文' : 'Original'}
                  </h3>
                  <p className={cn("text-gray-700 break-words whitespace-pre-wrap", translationFontCls)}>
                    {translationResult.original}
                  </p>
                </div>
              )}

              {/* Back to original word (word mode) */}
              {!isSentence && previousSearchWord && (
                <button
                  onClick={onGoBack}
                  className="flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-700 transition-colors mb-3"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  {uiLang === 'zh' ? `返回「${previousSearchWord}」` : `Back to "${previousSearchWord}"`}
                </button>
              )}

              {/* Word-level details (hidden for sentence translation) */}
              {!isSentence && (
                <>
                  <div className="flex items-center justify-between mb-4 gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <h2 className="text-xl sm:text-2xl font-black text-gray-900 break-words">{translationResult.original}</h2>
                      {translationResult.pronunciation && !shouldHidePronunciation(translationResult.original) && (
                        <span className="text-blue-600 font-mono bg-blue-50 px-2 py-0.5 rounded-lg text-xs">{translationResult.pronunciation}</span>
                      )}
                    </div>
                    <button
                      onClick={() => onSaveWord()}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-all shadow-md"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      {t.save}
                    </button>
                  </div>

                  {/* Frequency Tabs */}
                  <div className="mb-8">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                      {uiLang === 'zh' ? '使用频率' : 'Usage Frequency'}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {(translationResult.usages || []).map((usage, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedUsageIndex(idx);
                            setShowDetails(false);
                          }}
                          className={cn(
                            "px-4 py-2 rounded-xl text-sm font-bold transition-all border-2",
                            selectedUsageIndex === idx
                              ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100 scale-105"
                              : "bg-white border-gray-100 text-gray-400 hover:border-blue-200 hover:text-blue-400"
                          )}
                        >
                          {uiLang === 'zh' ? usage.labelZh : usage.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-8">
                    <motion.div
                      key={selectedUsageIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-8"
                    >
                      <div>
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                          {uiLang === 'zh' ? '释义' : 'Meaning'}
                        </h3>
                        <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 overflow-hidden">
                          {/* Single definition, following UI language.
                              Previously rendered English + Chinese stacked;
                              0.2.1 schema change produces only one language,
                              so rendering both would duplicate the same line. */}
                          <p className="text-gray-800 text-lg font-bold leading-relaxed break-words">
                            {uiLang === 'zh'
                              ? (translationResult.usages?.[selectedUsageIndex]?.meaningZh
                                  || translationResult.usages?.[selectedUsageIndex]?.meaning)
                              : (translationResult.usages?.[selectedUsageIndex]?.meaning
                                  || translationResult.usages?.[selectedUsageIndex]?.meaningZh)}
                          </p>
                        </div>
                      </div>

                      {/* Details Toggle */}
                      <button
                        onClick={() => setShowDetails(!showDetails)}
                        className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:text-blue-700 transition-colors"
                      >
                        {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {showDetails ? t.hideDetails : t.showDetails}
                        {isLoadingDetails && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                      </button>

                      <AnimatePresence>
                        {showDetails && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-6 space-y-6 border-t border-gray-100">
                              {translationResult.usages?.[selectedUsageIndex]?.synonyms && translationResult.usages?.[selectedUsageIndex]?.synonyms.length > 0 && (
                                <div>
                                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">{t.synonyms}</h3>
                                  <div className="flex flex-wrap gap-2">
                                    {translationResult.usages?.[selectedUsageIndex]?.synonyms.map((syn, i) => (
                                      <button key={i} onClick={() => onSearchWord(syn)} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-sm font-medium hover:bg-blue-100 hover:text-blue-600 transition-colors cursor-pointer">
                                        {syn}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {translationResult.usages?.[selectedUsageIndex]?.alternatives && translationResult.usages?.[selectedUsageIndex]?.alternatives.length > 0 && (
                                <div>
                                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">{t.alternatives}</h3>
                                  <div className="flex flex-wrap gap-2">
                                    {translationResult.usages?.[selectedUsageIndex]?.alternatives.map((alt, i) => (
                                      <button key={i} onClick={() => onSearchWord(alt)} className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-sm font-medium hover:bg-blue-100 hover:text-blue-700 transition-colors cursor-pointer">
                                        {alt}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Antonyms */}
                              {(translationResult.usages?.[selectedUsageIndex] as any)?.antonyms && (translationResult.usages?.[selectedUsageIndex] as any)?.antonyms.length > 0 && (
                                <div>
                                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
                                    {uiLang === 'zh' ? '反义词' : 'Antonyms'}
                                  </h3>
                                  <div className="flex flex-wrap gap-2">
                                    {(translationResult.usages?.[selectedUsageIndex] as any)?.antonyms.map((ant: string, i: number) => (
                                      <button key={i} onClick={() => onSearchWord(ant)} className="bg-red-50 text-red-600 px-3 py-1 rounded-lg text-sm font-medium hover:bg-red-100 hover:text-red-700 transition-colors cursor-pointer">
                                        {ant}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Verb conjugations / Word forms */}
                              {(translationResult.usages?.[selectedUsageIndex] as any)?.conjugations && (() => {
                                const conj = (translationResult.usages?.[selectedUsageIndex] as any)?.conjugations;
                                const labels: Record<string, string> = {
                                  pastTense: '过去式', pastParticiple: '过去分词',
                                  presentParticiple: '现在分词', presentPerfect: '现在完成时',
                                  thirdPerson: '第三人称', plural: '复数',
                                  comparative: '比较级', superlative: '最高级'
                                };
                                const labelsEn: Record<string, string> = {
                                  pastTense: 'Past', pastParticiple: 'Past Part.',
                                  presentParticiple: 'Pres. Part.', presentPerfect: 'Pres. Perfect',
                                  thirdPerson: '3rd Person', plural: 'Plural',
                                  comparative: 'Comparative', superlative: 'Superlative'
                                };
                                const entries: { key: string; label: string; value: string }[] = [];
                                const pastT = conj.pastTense;
                                const pastP = conj.pastParticiple;
                                if (pastT && pastP && pastT === pastP) {
                                  entries.push({ key: 'pastCombined', label: uiLang === 'zh' ? '过去式/过去分词' : 'Past / Past Part.', value: pastT });
                                } else {
                                  if (pastT) entries.push({ key: 'pastTense', label: uiLang === 'zh' ? labels.pastTense : labelsEn.pastTense, value: pastT });
                                  if (pastP) entries.push({ key: 'pastParticiple', label: uiLang === 'zh' ? labels.pastParticiple : labelsEn.pastParticiple, value: pastP });
                                }
                                ['presentParticiple', 'presentPerfect', 'thirdPerson', 'plural', 'comparative', 'superlative'].forEach(k => {
                                  if (conj[k]) entries.push({ key: k, label: uiLang === 'zh' ? labels[k] : labelsEn[k], value: conj[k] });
                                });
                                if (entries.length === 0) return null;
                                return (
                                  <div>
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
                                      {uiLang === 'zh' ? '词形变化' : 'Word Forms'}
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                      {entries.map(({ key, label, value }) => (
                                        <button key={key} onClick={() => onSearchWord(value.replace(/^have\/has\s+/, ''))} className="bg-purple-50 text-purple-600 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-purple-100 transition-colors cursor-pointer border border-purple-100">
                                          <span className="text-[10px] text-purple-400 mr-1.5 font-bold">{label}</span>
                                          {value}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div>
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">{t.examples}</h3>
                        <div className="space-y-4">
                          {(translationResult.usages?.[selectedUsageIndex]?.examples || []).map((ex, i) => (
                            <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 space-y-3 group/ex hover:border-blue-200 transition-colors overflow-hidden">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex gap-4 min-w-0 flex-1">
                                  <span className="text-blue-200 font-black text-xl italic shrink-0">{String(i + 1).padStart(2, '0')}</span>
                                  <p className="text-gray-800 font-medium leading-relaxed text-lg break-words">{ex.sentence}</p>
                                </div>
                                <button
                                  onClick={() => onSpeak(ex.sentence)}
                                  disabled={loadingAudioText === ex.sentence}
                                  className="p-2 text-gray-300 hover:text-blue-500 transition-colors shrink-0 disabled:opacity-50"
                                >
                                  {loadingAudioText === ex.sentence ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                  ) : (
                                    <Volume2 className="w-5 h-5" />
                                  )}
                                </button>
                              </div>
                              <p className="text-gray-500 pl-12 border-l-2 border-blue-50 italic">{ex.translation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </>
              )}
            </motion.div>

            {/* Slang Insight Sidebar — only for word mode */}
            {!isSentence && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl shadow-blue-200">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                      <MessageSquare className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="font-black uppercase tracking-widest text-sm">
                      {uiLang === 'zh' ? 'MemeFlow 梗百科' : 'MemeFlow Insights'}
                    </h3>
                  </div>
                  <p className="text-blue-100 text-sm leading-relaxed mb-4">
                    {uiLang === 'zh'
                      ? '我们不仅翻译文字，更通过 AI 深度解析其背后的互联网文化与俚语背景。'
                      : "We don't just translate words; we decode the internet culture and slang context behind them."}
                  </p>
                  <div className="h-px bg-white/20 mb-4" />

                  {isFetchingSlang ? (
                    <div className="flex flex-col items-center py-8 gap-3">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-200" />
                      <p className="text-xs text-blue-200 animate-pulse">
                        {uiLang === 'zh' ? '正在解析文化背景...' : 'Decoding cultural context...'}
                      </p>
                    </div>
                  ) : slangInsights.length > 0 ? (
                    <div className="space-y-6">
                      {slangInsights.map((insight, idx) => (
                        <div key={idx} className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                          <h4 className="font-black text-lg mb-1">{insight.term}</h4>
                          <p className="text-sm text-blue-50 mb-3 leading-relaxed line-clamp-3">
                            {uiLang === 'zh' ? insight.meaning : insight.meaningEn}
                          </p>
                          <button
                            onClick={() => onViewSlangEntry(insight.term)}
                            className="w-full bg-white text-blue-600 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-50 transition-colors"
                          >
                            {uiLang === 'zh' ? '查看百科详情' : 'View Full Entry'}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-blue-200 text-xs italic">
                        {uiLang === 'zh' ? '当前文本未检测到特定俚语' : 'No specific slang detected in this text'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Pro Tip Card */}
                {!userProfile?.isPro && (
                  <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-5 h-5 text-amber-500 fill-current" />
                      <h4 className="font-bold text-amber-900">{uiLang === 'zh' ? '解锁深度解析' : 'Unlock Deep Insights'}</h4>
                    </div>
                    <p className="text-sm text-amber-800 mb-4">
                      {uiLang === 'zh'
                        ? '升级 Pro 以获得更精准的俚语检测和完整的文化背景分析。'
                        : 'Upgrade to Pro for more accurate slang detection and full cultural context analysis.'}
                    </p>
                    <button
                      onClick={onUpgrade}
                      className="w-full bg-amber-500 text-white py-3 rounded-xl font-bold hover:bg-amber-600 transition-colors shadow-lg shadow-amber-200"
                    >
                      {t.upgradePro}
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
