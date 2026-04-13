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
import React, { memo, useRef, useState, useEffect } from 'react';
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
  ZapOff,
  Bookmark,
  BookmarkCheck,
  ThumbsUp,
  ThumbsDown,
  Heart,
  Share2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { TranslationResult, SlangExplanationResult } from '../services/ai';
import { cn } from '../lib/utils';
import { Language, translations } from '../i18n';
import { UserProfile, SavedWord } from '../App';
import { TranslateScene } from '../hooks/useTranslation';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';
import { trackEvent } from '../utils/analytics';
import { useTranslateContext } from '../contexts/TranslateContext';
import { TranslationSkeleton, SlangInsightSkeleton } from '../components/Skeleton';

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
  onSearchWord: (word: string) => void;
  onGoBack: () => void;
  onSaveWord: (styleTag?: 'authentic' | 'academic' | 'standard') => void;
  onSpeak: (text: string) => void;
  onOpenPaywall: (trigger: string) => void;
  onUpgrade: () => void;
  onViewSlangEntry: (term: string) => void;

  // Scene switcher
  scene: TranslateScene;
  setScene: (s: TranslateScene) => void;

  // Auto-translate toggle
  autoTranslateEnabled: boolean;
  toggleAutoTranslate: (enabled: boolean) => void;

  // For bookmark dedup check
  savedWords: SavedWord[];
  user: User | null;
}

function TranslateTab(props?: Partial<TranslateTabProps>) {
  // Use context if available (production), fall back to props (tests)
  const ctxRaw = (() => { try { return useTranslateContext(); } catch { return null; } })();
  const {
    inputText, setInputText, isTranslating, translationResult,
    selectedUsageIndex, setSelectedUsageIndex, showDetails, setShowDetails,
    formalityLevel, setFormalityLevel, isFetchingSlang, slangInsights, isSaving,
    loadingAudioText, userProfile, uiLang, searchHistory, removeFromHistory, clearHistory,
    previousSearchWord, setPreviousSearchWord, isExtractingPhoto, onPhotoCapture,
    isListening, onToggleListening, onTranslate, onSearchWord, onGoBack,
    onSaveWord, onSpeak, onOpenPaywall, onUpgrade, onViewSlangEntry,
    scene, setScene, autoTranslateEnabled, toggleAutoTranslate, savedWords, user,
  } = (ctxRaw || props) as TranslateTabProps;
  const t = translations[uiLang];
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Feedback state: track which translation the user has rated
  const [feedbackGiven, setFeedbackGiven] = useState<'up' | 'down' | null>(null);
  const [feedbackReason, setFeedbackReason] = useState('');
  const [showFeedbackReason, setShowFeedbackReason] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [suggestedTranslation, setSuggestedTranslation] = useState('');

  // Reset feedback state when a new translation arrives
  useEffect(() => {
    setFeedbackGiven(null);
    setFeedbackReason('');
    setShowFeedbackReason(false);
    setIsSubmittingFeedback(false);
    setSuggestedTranslation('');
  }, [translationResult?.original]);

  // Check if current translation is already saved
  const isAlreadySaved = (styleTag: string) => {
    if (!translationResult) return false;
    return savedWords.some(w => w.original === translationResult.original && w.styleTag === styleTag);
  };

  const handleFeedback = async (rating: 'up' | 'down') => {
    if (!user || !translationResult || feedbackGiven || isSubmittingFeedback) return;
    if (rating === 'down') {
      setShowFeedbackReason(true);
      return; // wait for reason submission
    }
    await submitFeedback(rating);
  };

  const submitFeedback = async (rating: 'up' | 'down', reason?: string) => {
    if (!user || !translationResult || isSubmittingFeedback) return;
    setIsSubmittingFeedback(true);
    try {
      // Dedup: check if user already submitted feedback for this exact query in the last hour
      const q = translationResult.original;
      const oneHourAgo = new Date(Date.now() - 3600_000);
      try {
        const existing = await import('firebase/firestore').then(m =>
          m.getDocs(m.query(
            collection(db, 'feedback'),
            m.where('uid', '==', user.uid),
            m.where('query', '==', q),
            m.where('timestamp', '>', Timestamp.fromDate(oneHourAgo)),
            m.limit(1),
          ))
        );
        if (!existing.empty) {
          toast(uiLang === 'zh' ? '你已经反馈过了' : 'Already submitted feedback');
          setFeedbackGiven(rating);
          return;
        }
      } catch (dedupErr) {
        // Dedup check failed (e.g. missing index) — proceed with write anyway
        console.warn('Feedback dedup check failed, proceeding:', dedupErr);
      }

      await addDoc(collection(db, 'feedback'), {
        uid: user.uid,
        query: translationResult.original,
        result: translationResult.authenticTranslation || translationResult.academicTranslation || '',
        scene,
        rating,
        reason: reason || '',
        timestamp: Timestamp.now(),
      });
      setFeedbackGiven(rating);
      trackEvent('feedback_submit', { rating, has_reason: !!reason });
      toast.success(uiLang === 'zh' ? '感谢反馈！' : 'Thanks for your feedback!');
      setShowFeedbackReason(false);
    } catch (e: any) {
      console.error('Feedback write failed:', e);
      Sentry.captureException(e, { tags: { component: 'TranslateTab', op: 'feedback.write' } });
      toast.error(uiLang === 'zh' ? '反馈提交失败' : 'Feedback failed');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

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
          className="w-full glass-card rounded-3xl py-5 sm:py-7 pl-6 sm:pl-8 pr-44 sm:pr-48 md:pr-52 text-lg sm:text-xl outline-none transition-all duration-300 placeholder:text-gray-300/80 text-gray-800 focus:shadow-[0_0_0_2px_rgba(37,99,235,0.15),inset_0_1px_24px_rgba(37,99,235,0.06)] hover:shadow-[var(--shadow-card-hover)]"
          style={{ boxShadow: 'var(--shadow-card)' }}
        />
        {/* Character count — only when typing long text */}
        {inputText.length > 200 && (
          <div className="absolute -bottom-7 right-4 text-[10px] text-gray-400/70 font-mono tracking-wider">
            {inputText.length} / 2000
          </div>
        )}
        {/* Clear button */}
        {inputText && (
          <button
            type="button"
            onClick={() => { setInputText(''); setPreviousSearchWord(null); }}
            className="absolute left-auto right-36 sm:right-44 top-1/2 -translate-y-1/2 p-1.5 text-gray-300 hover:text-gray-500 transition-all duration-200 hover:scale-110 z-20"
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
        <div className="absolute right-2.5 sm:right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 sm:gap-2 z-20">
          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            disabled={isExtractingPhoto}
            className="p-3 sm:p-4 rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer bg-rose-50/80 text-rose-500 hover:bg-rose-100 backdrop-blur-sm shadow-sm focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
            title={uiLang === 'zh' ? '拍照翻译' : 'Photo Translate'}
            aria-label={uiLang === 'zh' ? '拍照翻译' : 'Photo Translate'}
          >
            {isExtractingPhoto
              ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
              : <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !autoTranslateEnabled;
              toggleAutoTranslate(next);
              // First-time explanation
              if (next && !localStorage.getItem('memeflow_auto_translate_explained')) {
                toast(uiLang === 'zh' ? '输入即译已开启：打字停顿后自动翻译，无需点提交' : 'Auto-translate on: translates automatically as you type');
                try { localStorage.setItem('memeflow_auto_translate_explained', '1'); } catch {}
              }
            }}
            className={cn(
              "p-2.5 rounded-xl transition-all duration-200 cursor-pointer relative group",
              autoTranslateEnabled ? "text-amber-500 hover:text-amber-600 bg-amber-50/60" : "text-gray-300 hover:text-gray-400"
            )}
            title={autoTranslateEnabled
              ? (uiLang === 'zh' ? '输入即译：开（打字自动翻译）' : 'Auto-translate: On')
              : (uiLang === 'zh' ? '输入即译：关（点击开启自动翻译）' : 'Auto-translate: Off (click to enable)')}
            aria-label={uiLang === 'zh' ? '输入即译' : 'Auto-translate'}
            aria-pressed={autoTranslateEnabled}
          >
            {autoTranslateEnabled ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onToggleListening}
            className={cn(
              "p-2.5 rounded-xl transition-all duration-200 cursor-pointer",
              isListening ? "bg-red-500 text-white shadow-lg shadow-red-200 animate-pulse" : "text-gray-300 hover:text-gray-400"
            )}
            aria-label={isListening ? (uiLang === 'zh' ? '停止录音' : 'Stop recording') : (uiLang === 'zh' ? '语音输入' : 'Voice input')}
            aria-pressed={isListening}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button
            type="submit"
            disabled={isTranslating || !inputText.trim()}
            className="bg-gradient-to-r from-rose-500 to-pink-500 text-white p-3 sm:p-4 rounded-2xl disabled:opacity-40 transition-all duration-200 hover:scale-105 active:scale-95 shadow-lg shadow-rose-200/60 hover:shadow-blue-300/60 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
            aria-label={uiLang === 'zh' ? '翻译' : 'Translate'}
          >
            {isTranslating ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />}
          </button>
        </div>
      </form>

      {/* Scene Switcher + Progress — right below input */}
      {/* Auto-translate progress indicator */}
      {isTranslating && (
        <div className="h-0.5 bg-rose-100 rounded-full overflow-hidden -mt-4">
          <div className="h-full bg-rose-500 rounded-full animate-pulse w-full" />
        </div>
      )}

      {/* Scene Switcher — compact inline chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-gray-400/80 font-semibold mr-0.5 uppercase tracking-wider">{uiLang === 'zh' ? '场景' : 'Tone'}</span>
        {([
          { key: 'chat' as const, zh: '聊天', en: 'Chat' },
          { key: 'business' as const, zh: '商务', en: 'Business' },
          { key: 'writing' as const, zh: '写作', en: 'Writing' },
        ]).map(({ key, zh, en }) => (
          <button
            key={key}
            onClick={() => { setScene(key); trackEvent('scene_switch', { scene: key }); }}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200",
              scene === key
                ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-md shadow-rose-200/50"
                : "glass-card text-gray-400 hover:text-rose-400 hover:shadow-sm"
            )}
          >
            {uiLang === 'zh' ? zh : en}
          </button>
        ))}
      </div>

      {/* Formality Slider (Pro only — after scene chips, less prominent) */}
      {userProfile?.isPro && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-[10px] text-gray-400/80 font-semibold whitespace-nowrap uppercase tracking-wider">{uiLang === 'zh' ? '正式度' : 'Formal'}</span>
          <input
            type="range"
            min="1"
            max="100"
            value={formalityLevel}
            onChange={(e) => setFormalityLevel(Number(e.target.value))}
            className="formality-slider flex-1 h-2 rounded-full appearance-none cursor-pointer"
          />
          <span className="text-[11px] font-bold tabular-nums w-7 text-right gradient-text">{formalityLevel}</span>
        </div>
      )}

      {/* Search History (only before a result exists) */}
      {!translationResult && searchHistory.length > 0 && (
        <div className="glass-card rounded-2xl px-4 py-3" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[10px] font-black text-gray-400/80 uppercase tracking-[0.2em]">
              {uiLang === 'zh' ? '搜索记录' : 'Search History'}
            </h3>
            <button onClick={clearHistory} className="text-[10px] text-gray-400 hover:text-red-400 font-semibold transition-colors duration-200">
              {uiLang === 'zh' ? '清空' : 'Clear'}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {searchHistory.slice(0, 10).map((item, i) => (
              <div key={i} className="group flex items-center">
                <button
                  onClick={() => onSearchWord(item.text)}
                  className="glass-card hover:bg-rose-50/60 text-gray-500 hover:text-rose-500 px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-200 max-w-[180px] truncate"
                  title={item.text}
                >
                  {item.text.length > 15 ? item.text.slice(0, 15) + '...' : item.text}
                </button>
                <button
                  onClick={() => removeFromHistory(item.text)}
                  className="ml-0.5 text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200 text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick examples for new users (no history, no result) */}
      {!translationResult && searchHistory.length === 0 && !inputText && (
        <div className="text-center py-4">
          <p className="text-sm text-gray-400/70 mb-3">{uiLang === 'zh' ? '试试翻译：' : 'Try translating:'}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {['我在弄咖啡', 'plot twist', 'no cap', '这个项目太牛了'].map((ex) => (
              <button
                key={ex}
                onClick={() => onSearchWord(ex)}
                className="px-3.5 py-1.5 glass-card hover:bg-rose-50/60 text-gray-500 hover:text-rose-500 text-xs font-medium rounded-xl transition-all duration-200 hover:shadow-sm"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Screen reader announcement for translation result */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {translationResult ? (uiLang === 'zh' ? '翻译完成' : 'Translation complete') : ''}
      </div>

      {/* Translation Loading Skeleton */}
      {isTranslating && !translationResult && (
        <TranslationSkeleton />
      )}

      {/* Translation Result */}
      {translationResult && (() => {
        // Detect content length tier — affects layout, font size, and whether
        // to show word-level details.
        //   word      - single word/phrase, show full details + side panel
        //   sentence  - short sentence (< 200 chars), compact single column
        //   paragraph - long text (>= 200 chars), tightest fonts for readability
        const txt = (inputText || '').trim();
        // Chinese has no spaces — count Chinese characters as individual words
        const chineseChars = (txt.match(/[\u4e00-\u9fa5]/g) || []).length;
        const wordCount = chineseChars > 0
          ? chineseChars + txt.split(/\s+/).filter(Boolean).length
          : txt.split(/\s+/).filter(Boolean).length;
        const isSentence = wordCount > 3 || txt.length > 8;
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
          <div className={cn("grid grid-cols-1 gap-8", !isSentence && slangInsights.length > 0 && "lg:grid-cols-3")}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("liquid-glass rounded-3xl p-5 sm:p-8 space-y-8 overflow-hidden relative", !isSentence && slangInsights.length > 0 && "lg:col-span-2")}
              style={{ boxShadow: 'var(--shadow-card)' }}
            >
              {/* Dual Column Translation */}
              {(translationResult.authenticTranslation || translationResult.academicTranslation) && (
                <div className={cn("grid grid-cols-1 gap-4", !isSentence && "lg:grid-cols-2")}>
                  {/* Authentic Column */}
                  {translationResult.authenticTranslation && (
                    <motion.div
                      initial={{ opacity: 0, y: 16, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="warm-card rounded-2xl p-4 sm:p-6 relative overflow-hidden border-l-4 border-l-rose-400"
                    >
                      {/* Social post header */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 bg-gradient-to-br from-rose-400 to-pink-500 rounded-full flex items-center justify-center">
                          <Zap className="w-3 h-3 text-white fill-current" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] gradient-text">{uiLang === 'zh' ? '地道表达' : 'AUTHENTIC'}</span>
                      </div>
                      <p className={cn("text-gray-900 font-medium break-words", translationFontCls, textPadRight)}>
                        {translationResult.authenticTranslation}
                      </p>
                      <button
                        onClick={() => onSpeak(translationResult.authenticTranslation!)}
                        className={cn(volumeBtnCls, "text-blue-400 hover:text-rose-500")}
                      >
                        <Volume2 className="w-5 h-5" />
                        {isSentence && <span>{uiLang === 'zh' ? '朗读' : 'Listen'}</span>}
                      </button>
                      {/* Social action bar — heart save + speaker */}
                      <div className="mt-4 pt-3 border-t border-gray-100/50 flex items-center gap-4">
                        <button
                          onClick={() => onSaveWord('authentic')}
                          disabled={isSaving || isAlreadySaved('authentic')}
                          className={cn(
                            "flex items-center gap-1.5 text-sm font-bold transition-all duration-300 disabled:opacity-50",
                            isAlreadySaved('authentic') ? "text-rose-500" : "text-gray-400 hover:text-rose-500"
                          )}
                          title={uiLang === 'zh' ? '收藏' : 'Save'}
                        >
                          <Heart className={cn("w-5 h-5 transition-transform", isAlreadySaved('authentic') && "fill-current scale-110")} />
                          {uiLang === 'zh' ? (isAlreadySaved('authentic') ? '已收藏' : '收藏') : (isAlreadySaved('authentic') ? 'Saved' : 'Save')}
                        </button>
                      </div>
                    </motion.div>
                  )}
                  {/* Academic Column */}
                  {translationResult.academicTranslation && (
                    <motion.div
                      initial={{ opacity: 0, y: 16, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.25, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                      className="warm-card rounded-2xl p-4 sm:p-6 relative overflow-hidden border-l-4 border-l-purple-400"
                    >
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                        <BookOpen className="w-3 h-3 text-gray-500" />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-600 to-purple-600">{uiLang === 'zh' ? '学术表达 (ACADEMIC)' : 'ACADEMIC EXPRESSION'}</span>
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
                      <div className="mt-4 flex items-center gap-3">
                        <button
                          onClick={() => onSaveWord('academic')}
                          disabled={isSaving || isAlreadySaved('academic')}
                          className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition-all duration-200 disabled:opacity-50 hover:gap-2"
                          title={uiLang === 'zh' ? '收藏' : 'Save'}
                        >
                          {isAlreadySaved('academic')
                            ? <BookmarkCheck className="w-4 h-4 fill-current" />
                            : <Bookmark className="w-4 h-4" />}
                          {uiLang === 'zh' ? (isAlreadySaved('academic') ? '已收藏' : '收藏') : (isAlreadySaved('academic') ? 'Saved' : 'Save')}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {/* Inline Slang Chips — visible in sentence/paragraph mode where sidebar is hidden */}
              {isSentence && slangInsights.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    {uiLang === 'zh' ? '检测到俚语：' : 'Slang detected:'}
                  </span>
                  {slangInsights.map((insight) => (
                    <button
                      key={insight.term}
                      onClick={() => { trackEvent('slang_chip_click', { term: insight.term }); onViewSlangEntry(insight.term); }}
                      className="px-2.5 py-1 text-xs font-medium bg-rose-50/60 text-pink-500 rounded-xl border border-rose-100/60 hover:bg-rose-100 transition-all duration-200 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
                      title={insight.meaning}
                    >
                      {insight.term}
                    </button>
                  ))}
                  {isFetchingSlang && (
                    <Loader2 className="w-3 h-3 animate-spin text-pink-300" />
                  )}
                </div>
              )}

              {/* Social reaction bar — ❤️ / 💔 / Share */}
              {user && (
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-400">
                    {uiLang === 'zh' ? '觉得如何？' : 'How was it?'}
                  </span>
                  <button
                    onClick={() => handleFeedback('up')}
                    disabled={!!feedbackGiven || isSubmittingFeedback}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300",
                      feedbackGiven === 'up' ? "text-rose-500 bg-rose-50 scale-105" : "text-gray-400 hover:text-rose-500 hover:bg-rose-50",
                      feedbackGiven && feedbackGiven !== 'up' && "opacity-30"
                    )}
                    aria-label={uiLang === 'zh' ? '翻译质量好' : 'Good translation'}
                  >
                    {isSubmittingFeedback && !feedbackGiven ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className={cn("w-4 h-4", feedbackGiven === 'up' && "fill-current")} />}
                    <span className="text-xs">{uiLang === 'zh' ? '赞' : 'Like'}</span>
                  </button>
                  <button
                    onClick={() => handleFeedback('down')}
                    disabled={!!feedbackGiven || isSubmittingFeedback}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300",
                      feedbackGiven === 'down' ? "text-gray-600 bg-gray-100" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100",
                      feedbackGiven && feedbackGiven !== 'down' && "opacity-30"
                    )}
                    aria-label={uiLang === 'zh' ? '翻译质量差' : 'Poor translation'}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    <span className="text-xs">{uiLang === 'zh' ? '不太对' : 'Off'}</span>
                  </button>
                  <button
                    onClick={() => {
                      const text = `${translationResult?.original} → ${translationResult?.authenticTranslation || translationResult?.academicTranslation || ''} — via MemeFlow`;
                      navigator.clipboard.writeText(text).catch(() => {});
                      toast.success(uiLang === 'zh' ? '已复制到剪贴板' : 'Copied!');
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium text-gray-400 hover:text-pink-500 hover:bg-pink-50 transition-all duration-300 ml-auto"
                  >
                    <Share2 className="w-4 h-4" />
                    <span className="text-xs">{uiLang === 'zh' ? '分享' : 'Share'}</span>
                  </button>
                  {showFeedbackReason && (
                    <form
                      className="flex flex-col gap-2 flex-1"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        // Submit suggestion to translation_suggestions if provided
                        if (suggestedTranslation.trim() && user && translationResult) {
                          try {
                            await addDoc(collection(db, 'translation_suggestions'), {
                              uid: user.uid,
                              query: translationResult.original,
                              originalResult: translationResult.authenticTranslation || '',
                              suggestion: suggestedTranslation.trim(),
                              timestamp: Timestamp.now(),
                            });
                            trackEvent('translation_suggestion_submit');
                          } catch (err) {
                            Sentry.captureException(err, { tags: { component: 'TranslateTab' } });
                          }
                        }
                        submitFeedback('down', feedbackReason);
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={feedbackReason}
                          onChange={(e) => setFeedbackReason(e.target.value)}
                          placeholder={uiLang === 'zh' ? '哪里不好？(选填)' : 'What went wrong? (optional)'}
                          maxLength={500}
                          className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-rose-400"
                        />
                        <button
                          type="submit"
                          disabled={isSubmittingFeedback}
                          className="text-xs font-bold text-rose-500 hover:text-rose-600 disabled:opacity-50 shrink-0"
                        >
                          {uiLang === 'zh' ? '提交' : 'Submit'}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={suggestedTranslation}
                        onChange={(e) => setSuggestedTranslation(e.target.value)}
                        placeholder={uiLang === 'zh' ? '更好的翻译是？(选填，帮助我们改进)' : 'Better translation? (optional, helps us improve)'}
                        maxLength={500}
                        className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-rose-400"
                      />
                    </form>
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
                  className="flex items-center gap-1.5 text-sm font-bold text-rose-500 hover:text-rose-600 transition-colors mb-3"
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
                      {translationResult.pronunciation && (
                        <span className="text-rose-500 font-mono bg-rose-50 px-2 py-0.5 rounded-lg text-xs">{translationResult.pronunciation}</span>
                      )}
                    </div>
                    <button
                      onClick={() => onSaveWord()}
                      disabled={isSaving}
                      className="flex items-center gap-1.5 bg-rose-500 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-rose-600 transition-all shadow-md"
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
                              ? "bg-rose-500 border-blue-600 text-white shadow-lg shadow-rose-100 scale-105"
                              : "bg-white border-gray-100 text-gray-400 hover:border-rose-200 hover:text-blue-400"
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
                        <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-3 overflow-hidden">
                          <p className="text-gray-800 text-lg font-bold leading-relaxed break-words">
                            {translationResult.usages?.[selectedUsageIndex]?.meaning}
                          </p>
                          <p className="text-rose-500 text-lg font-medium leading-relaxed border-t border-gray-100 pt-3 break-words">
                            {translationResult.usages?.[selectedUsageIndex]?.meaningZh}
                          </p>
                        </div>
                      </div>

                      {/* Details Toggle */}
                      <button
                        onClick={() => setShowDetails(!showDetails)}
                        className="flex items-center gap-2 text-rose-500 font-bold text-sm hover:text-rose-600 transition-colors"
                      >
                        {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {showDetails ? t.hideDetails : t.showDetails}
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
                                      <button key={i} onClick={() => onSearchWord(syn)} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-sm font-medium hover:bg-rose-100 hover:text-rose-500 transition-colors cursor-pointer">
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
                                      <button key={i} onClick={() => onSearchWord(alt)} className="bg-rose-50 text-rose-500 px-3 py-1 rounded-lg text-sm font-medium hover:bg-rose-100 hover:text-rose-600 transition-colors cursor-pointer">
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
                            <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 space-y-3 group/ex hover:border-rose-200 transition-colors overflow-hidden">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex gap-4 min-w-0 flex-1">
                                  <span className="text-blue-200 font-black text-xl italic shrink-0">{String(i + 1).padStart(2, '0')}</span>
                                  <p className="text-gray-800 font-medium leading-relaxed text-lg break-words">{ex.sentence}</p>
                                </div>
                                <button
                                  onClick={() => onSpeak(ex.sentence)}
                                  disabled={loadingAudioText === ex.sentence}
                                  className="p-2 text-gray-300 hover:text-rose-400 transition-colors shrink-0 disabled:opacity-50"
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
                <div className="bg-gradient-to-br from-rose-500 to-indigo-700 rounded-3xl p-6 text-white shadow-xl shadow-rose-200">
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
                    <SlangInsightSkeleton />
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
                            className="w-full bg-white text-rose-500 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-50 transition-colors"
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

export default memo(TranslateTab);
