import React, { useState } from 'react';
import { Search, Plus, BookOpen, Loader2, Volume2, ChevronRight, ChevronDown, ChevronUp, Mic, MicOff, MessageSquare, Zap, Camera } from 'lucide-react';
import { extractTextFromImage } from '../services/ai';
import { motion, AnimatePresence } from 'motion/react';
import { TranslationResult, SlangExplanationResult } from '../services/ai';
import { cn } from '../lib/utils';
import { Language, translations } from '../i18n';
import { UserProfile } from '../App';

interface TranslatePageProps {
  inputText: string;
  setInputText: (v: string) => void;
  isTranslating: boolean;
  translationResult: TranslationResult | null;
  slangInsights: SlangExplanationResult[];
  isFetchingSlang: boolean;
  selectedUsageIndex: number;
  setSelectedUsageIndex: (v: number) => void;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
  formalityLevel: number;
  setFormalityLevel: (v: number) => void;
  isListening: boolean;
  isSaving: boolean;
  loadingAudioText: string | null;
  userProfile: UserProfile | null;
  uiLang: Language;
  onTranslate: (e?: React.FormEvent) => void;
  onToggleListening: () => void;
  onSpeak: (text: string) => void;
  onSaveWord: (styleTag?: 'authentic' | 'academic' | 'standard') => void;
  onUpgrade: () => void;
  onNavigateToSlang: (term: string) => void;
}

export default function TranslatePage(props: TranslatePageProps) {
  const {
    inputText, setInputText, isTranslating, translationResult,
    slangInsights, isFetchingSlang, selectedUsageIndex, setSelectedUsageIndex,
    showDetails, setShowDetails, formalityLevel, setFormalityLevel,
    isListening, isSaving, loadingAudioText, userProfile, uiLang,
    onTranslate, onToggleListening, onSpeak, onSaveWord, onUpgrade, onNavigateToSlang
  } = props;

  const t = translations[uiLang];
  const [isExtracting, setIsExtracting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtracting(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const text = await extractTextFromImage(base64, file.type);
        if (text && text !== 'NO_TEXT') {
          setInputText(text);
        }
        setIsExtracting(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Image extraction failed:', err);
      setIsExtracting(false);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Search Box */}
      <form onSubmit={onTranslate} className="relative group">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={t.inputPlaceholder}
          className="w-full bg-white border-2 border-transparent focus:border-blue-500 rounded-3xl py-4 sm:py-6 pl-6 sm:pl-8 pr-40 sm:pr-48 text-lg sm:text-xl shadow-xl shadow-gray-200/50 outline-none transition-all placeholder:text-gray-300"
        />
        <div className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 sm:gap-2 z-20">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isExtracting}
            className="p-3 sm:p-4 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-lg cursor-pointer bg-blue-100 text-blue-600 shadow-blue-100"
            title={uiLang === 'zh' ? '拍照翻译' : 'Photo Translate'}
          >
            {isExtracting ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : <Camera className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageCapture}
            className="hidden"
          />
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

      {/* Formality Slider */}
      <div
        className={cn(
          "bg-white/60 backdrop-blur-md border border-white/60 rounded-2xl p-4 shadow-sm relative group",
          !userProfile?.isPro && "opacity-60 cursor-not-allowed"
        )}
      >
        {!userProfile?.isPro && (
          <div
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={onUpgrade}
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

      {/* Translation Result */}
      {translationResult && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2 bg-white rounded-3xl p-5 sm:p-8 shadow-xl border border-gray-100 space-y-8"
          >
            {/* Dual Column Translation */}
            {(translationResult.authenticTranslation || translationResult.academicTranslation) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {translationResult.authenticTranslation && (
                  <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100 relative">
                    <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Zap className="w-3 h-3 fill-current" />
                      {uiLang === 'zh' ? '地道表达 (Authentic)' : 'Authentic Expression'}
                    </h3>
                    <p className="text-gray-900 text-lg font-medium leading-relaxed">{translationResult.authenticTranslation}</p>
                    <button onClick={() => onSpeak(translationResult.authenticTranslation!)} className="absolute top-4 right-4 p-2 text-blue-400 hover:text-blue-600 transition-colors">
                      <Volume2 className="w-5 h-5" />
                    </button>
                    <button onClick={() => onSaveWord('authentic')} disabled={isSaving} className="mt-4 flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors">
                      <Plus className="w-3 h-3" />{uiLang === 'zh' ? '存入地道表达' : 'Save as Authentic'}
                    </button>
                  </div>
                )}
                {translationResult.academicTranslation && (
                  <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200 relative">
                    <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <BookOpen className="w-3 h-3" />
                      {uiLang === 'zh' ? '学术表达 (Academic)' : 'Academic Expression'}
                    </h3>
                    <p className="text-gray-900 text-lg font-medium leading-relaxed">{translationResult.academicTranslation}</p>
                    <button onClick={() => onSpeak(translationResult.academicTranslation!)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors">
                      <Volume2 className="w-5 h-5" />
                    </button>
                    <button onClick={() => onSaveWord('academic')} disabled={isSaving} className="mt-4 flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors">
                      <Plus className="w-3 h-3" />{uiLang === 'zh' ? '存入学术表达' : 'Save as Academic'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start gap-6 sm:gap-0 mb-6 sm:mb-8">
              <div className="w-full sm:w-auto">
                <div className="flex items-center gap-4 mb-2">
                  <div className="flex flex-col">
                    <h2 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight break-words">
                      {translationResult.usages[selectedUsageIndex].meaning}
                    </h2>
                    <p className="text-lg sm:text-xl font-bold text-blue-600 mt-1">
                      {translationResult.usages[selectedUsageIndex].meaningZh}
                    </p>
                  </div>
                  <button
                    onClick={() => onSpeak(translationResult.usages[selectedUsageIndex].meaning)}
                    disabled={loadingAudioText === translationResult.usages[selectedUsageIndex].meaning}
                    className="p-2 text-blue-500 hover:bg-blue-50 rounded-full transition-colors self-start mt-2 disabled:opacity-50"
                  >
                    {loadingAudioText === translationResult.usages[selectedUsageIndex].meaning ? (
                      <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                    ) : (
                      <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  {translationResult.pronunciation && (
                    <span className="text-blue-600 font-mono font-medium bg-blue-50 px-3 py-1 rounded-lg text-xs sm:text-sm">{translationResult.pronunciation}</span>
                  )}
                  <span className="text-gray-400 text-xs sm:text-sm font-medium">{translationResult.original}</span>
                </div>
              </div>
              <button
                onClick={() => onSaveWord()}
                disabled={isSaving}
                className="w-full sm:w-auto bg-blue-600 text-white px-6 py-3 sm:py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {t.save}
              </button>
            </div>

            {/* Frequency Tabs */}
            <div className="mb-8">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">{uiLang === 'zh' ? '使用频率' : 'Usage Frequency'}</h3>
              <div className="flex flex-wrap gap-2">
                {translationResult.usages.map((usage, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setSelectedUsageIndex(idx); setShowDetails(false); }}
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
              <motion.div key={selectedUsageIndex} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                <div>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">{uiLang === 'zh' ? '释义' : 'Meaning'}</h3>
                  <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-3">
                    <p className="text-gray-800 text-lg font-bold leading-relaxed">{translationResult.usages[selectedUsageIndex].meaning}</p>
                    <p className="text-blue-600 text-lg font-medium leading-relaxed border-t border-gray-100 pt-3">{translationResult.usages[selectedUsageIndex].meaningZh}</p>
                  </div>
                </div>

                <button onClick={() => setShowDetails(!showDetails)} className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:text-blue-700 transition-colors">
                  {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showDetails ? t.hideDetails : t.showDetails}
                </button>

                <AnimatePresence>
                  {showDetails && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="pt-6 space-y-6 border-t border-gray-100">
                        {translationResult.usages[selectedUsageIndex].synonyms && translationResult.usages[selectedUsageIndex].synonyms!.length > 0 && (
                          <div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">{t.synonyms}</h3>
                            <div className="flex flex-wrap gap-2">
                              {translationResult.usages[selectedUsageIndex].synonyms!.map((syn, i) => (
                                <span key={i} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-sm font-medium">{syn}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {translationResult.usages[selectedUsageIndex].alternatives && translationResult.usages[selectedUsageIndex].alternatives!.length > 0 && (
                          <div>
                            <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">{t.alternatives}</h3>
                            <div className="flex flex-wrap gap-2">
                              {translationResult.usages[selectedUsageIndex].alternatives!.map((alt, i) => (
                                <span key={i} className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-sm font-medium">{alt}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div>
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">{t.examples}</h3>
                  <div className="space-y-4">
                    {translationResult.usages[selectedUsageIndex].examples.map((ex, i) => (
                      <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 space-y-3 group/ex hover:border-blue-200 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex gap-4">
                            <span className="text-blue-200 font-black text-xl italic">{String(i + 1).padStart(2, '0')}</span>
                            <p className="text-gray-800 font-medium leading-relaxed text-lg">{ex.sentence}</p>
                          </div>
                          <button onClick={() => onSpeak(ex.sentence)} disabled={loadingAudioText === ex.sentence} className="p-2 text-gray-300 hover:text-blue-500 transition-colors shrink-0 disabled:opacity-50">
                            {loadingAudioText === ex.sentence ? <Loader2 className="w-5 h-5 animate-spin" /> : <Volume2 className="w-5 h-5" />}
                          </button>
                        </div>
                        <p className="text-gray-500 pl-12 border-l-2 border-blue-50 italic">{ex.translation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>

          {/* Slang Insight Sidebar */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl shadow-blue-200">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-black uppercase tracking-widest text-sm">{uiLang === 'zh' ? 'MemeFlow 梗百科' : 'MemeFlow Insights'}</h3>
              </div>
              <p className="text-blue-100 text-sm leading-relaxed mb-4">
                {uiLang === 'zh' ? '我们不仅翻译文字，更通过 AI 深度解析其背后的互联网文化与俚语背景。' : "We don't just translate words; we decode the internet culture and slang context behind them."}
              </p>
              <div className="h-px bg-white/20 mb-4" />

              {isFetchingSlang ? (
                <div className="flex flex-col items-center py-8 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-200" />
                  <p className="text-xs text-blue-200 animate-pulse">{uiLang === 'zh' ? '正在解析文化背景...' : 'Decoding cultural context...'}</p>
                </div>
              ) : slangInsights.length > 0 ? (
                <div className="space-y-6">
                  {slangInsights.map((insight, idx) => (
                    <div key={idx} className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                      <h4 className="font-black text-lg mb-1">{insight.term}</h4>
                      <p className="text-sm text-blue-50 mb-3 leading-relaxed line-clamp-3">{uiLang === 'zh' ? insight.meaning : insight.meaningEn}</p>
                      <button onClick={() => onNavigateToSlang(insight.term)} className="w-full bg-white text-blue-600 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-50 transition-colors">
                        {uiLang === 'zh' ? '查看百科详情' : 'View Full Entry'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-blue-200 text-xs italic">{uiLang === 'zh' ? '当前文本未检测到特定俚语' : 'No specific slang detected in this text'}</p>
                </div>
              )}
            </div>

            {!userProfile?.isPro && (
              <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-5 h-5 text-amber-500 fill-current" />
                  <h4 className="font-bold text-amber-900">{uiLang === 'zh' ? '解锁深度解析' : 'Unlock Deep Insights'}</h4>
                </div>
                <p className="text-sm text-amber-800 mb-4">{uiLang === 'zh' ? '升级 Pro 以获得更精准的俚语检测和完整的文化背景分析。' : 'Upgrade to Pro for more accurate slang detection and full cultural context analysis.'}</p>
                <button onClick={onUpgrade} className="w-full bg-amber-500 text-white py-3 rounded-xl font-bold hover:bg-amber-600 transition-colors shadow-lg shadow-amber-200">{t.upgradePro}</button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
