import { useState, useRef, useEffect, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';
import { doc, updateDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { UserProfile, SavedWord } from '../App';
import {
  translateText,
  TranslationResult,
  explainSlang,
  SlangExplanationResult
} from '../services/ai';
import { Timestamp, addDoc, collection } from 'firebase/firestore';
import { markOnboardingStep } from '../components/OnboardingChecklist';
import { trackEvent } from '../utils/analytics';

export type TranslateScene = 'chat' | 'business' | 'writing';

interface UseTranslationParams {
  user: User | null;
  userProfile: UserProfile | null;
  setUserProfile: (p: UserProfile | null) => void;
  savedWords: SavedWord[];
  uiLang: string;
  onPaymentNeeded: (trigger: string) => void;
}

export function useTranslation({
  user,
  userProfile,
  setUserProfile,
  savedWords,
  uiLang,
  onPaymentNeeded,
}: UseTranslationParams) {
  const [inputText, setInputText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);
  const [slangInsights, setSlangInsights] = useState<SlangExplanationResult[]>([]);
  const [isFetchingSlang, setIsFetchingSlang] = useState(false);
  const [selectedUsageIndex, setSelectedUsageIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [formalityLevel, setFormalityLevel] = useState<number>(50);
  const [isSaving, setIsSaving] = useState(false);
  const [scene, setScene] = useState<TranslateScene>('chat');

  // Auto-translate state
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(() => {
    try {
      return localStorage.getItem('memeflow_auto_translate') === 'true';
    } catch { return false; }
  });

  // Ref-based guard — survives async gap between parallel clicks, which setIsTranslating cannot
  const inFlightRef = useRef(false);
  // AbortController for cancelling in-flight auto-translate requests
  const abortControllerRef = useRef<AbortController | null>(null);
  // Track last translated text to skip duplicate requests
  const lastTranslatedRef = useRef<string>('');
  // Auto-translate rate limiter: max 6 per minute
  const autoCountRef = useRef<number[]>([]);
  // Debounce timer ref — cleared on manual submit to prevent race
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleAutoTranslate = useCallback((enabled: boolean) => {
    setAutoTranslateEnabled(enabled);
    try { localStorage.setItem('memeflow_auto_translate', String(enabled)); } catch {}
    trackEvent('auto_translate_toggle', { enabled });
  }, []);

  const handleTranslate = async (e?: React.FormEvent, overrideText?: string, isAuto = false) => {
    e?.preventDefault();
    const textToTranslate = overrideText || inputText;
    if (!textToTranslate.trim()) return;

    // H3: guard against parallel calls (double-click / rapid submit)
    if (inFlightRef.current) return;

    // Cancel pending auto-translate debounce to prevent race
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }

    // ?? 0 — never compare against undefined/NaN (legacy profile safety)
    const currentCount = userProfile?.translationCount ?? 0;
    if (userProfile && !userProfile.isPro && currentCount >= 10) {
      onPaymentNeeded('translation_limit');
      return;
    }

    // Cancel any in-flight auto-translate request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    inFlightRef.current = true;
    setIsTranslating(true);
    setTranslationResult(null);
    setShowDetails(false);
    setSelectedUsageIndex(0);
    setSlangInsights([]);
    markOnboardingStep('translate_word');

    const startTime = Date.now();
    trackEvent('translate_submit', {
      method: isAuto ? 'auto' : 'manual',
      char_count: textToTranslate.length,
      scene,
    });

    try {
      const result = await translateText(
        textToTranslate,
        userProfile?.isPro ? formalityLevel : undefined,
        scene,
        controller.signal,
      );
      setTranslationResult(result);
      setSelectedUsageIndex(0);
      lastTranslatedRef.current = textToTranslate;

      trackEvent('translate_result', { success: true, duration_ms: Date.now() - startTime });

      // Fetch slang insights in background — don't block the translation result
      if (result.slangTerms && result.slangTerms.length > 0) {
        setIsFetchingSlang(true);
        Promise.all(
          result.slangTerms.slice(0, 3).map(term => explainSlang(term))
        ).then(insights => {
          setSlangInsights(insights);
        }).catch(err => {
          console.error("Error fetching slang insights:", err);
        }).finally(() => {
          setIsFetchingSlang(false);
        });
      }

      if (userProfile && !userProfile.isPro) {
        const nextCount = currentCount + 1;
        const userRef = doc(db, 'users', userProfile.userId);
        try {
          await updateDoc(userRef, { translationCount: nextCount });
        } catch (e) {
          console.warn('Failed to sync translationCount:', e);
          Sentry.captureException(e, { tags: { component: 'useTranslation', op: 'firestore.write', field: 'translationCount' } });
        }
        setUserProfile({ ...userProfile, translationCount: nextCount });
      }
    } catch (error: any) {
      // Ignore AbortError — user typed new input, this is expected
      if (error.name === 'AbortError') return;

      console.error(error);
      trackEvent('translate_result', { success: false, duration_ms: Date.now() - startTime });

      const raw = error.message || '';
      let message: string;
      if (raw.includes('location') || raw.includes('PRECONDITION')) {
        message = uiLang === 'zh' ? '翻译服务在当前地区不可用，请使用 VPN 或稍后重试' : 'Translation service unavailable in your region';
      } else if (raw.includes('不可用') || raw.includes('繁忙')) {
        message = raw;
      } else {
        message = uiLang === 'zh' ? '翻译失败，请重试' : 'Translation failed. Please try again.';
      }
      toast.error(message);
    } finally {
      setIsTranslating(false);
      inFlightRef.current = false;
      abortControllerRef.current = null;
    }
  };

  // Auto-translate: debounced effect on inputText changes
  useEffect(() => {
    if (!autoTranslateEnabled) return;
    const text = inputText.trim();
    // Skip: empty, too short, too long, same as last, or already translating
    if (text.length < 2 || text.length > 200 || text === lastTranslatedRef.current) return;

    // Rate limit: max 6 auto-translates per minute
    const now = Date.now();
    autoCountRef.current = autoCountRef.current.filter(t => now - t < 60000);
    if (autoCountRef.current.length >= 6) return;

    autoTimerRef.current = setTimeout(() => {
      autoTimerRef.current = null;
      autoCountRef.current.push(Date.now());
      handleTranslate(undefined, text, true);
    }, 350);

    return () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current);
        autoTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputText, autoTranslateEnabled]);

  const handleSaveWord = async (styleTag: 'authentic' | 'academic' | 'standard' = 'standard') => {
    if (!user || !translationResult || isSaving) return;

    if (userProfile && !userProfile.isPro && savedWords.length >= 50) {
      toast.error(uiLang === 'zh' ? '免费用户限存 50 个单词，请升级 Pro' : 'Free users are limited to 50 saved words. Please upgrade to Pro.');
      return;
    }

    setIsSaving(true);
    markOnboardingStep('save_wordbook');
    try {
      const wordData: any = {
        original: translationResult.original,
        usages: translationResult.usages,
        userId: user.uid,
        styleTag,
        createdAt: Timestamp.now()
      };

      // Spaced Repetition fields — always add so words are reviewable
      wordData.nextReviewDate = Timestamp.now();
      wordData.interval = 0;
      wordData.easeFactor = 2.5;

      await addDoc(collection(db, 'words'), wordData);

      trackEvent('word_save', { style_tag: styleTag });
      toast.success(uiLang === 'zh' ? '已保存到单词本 ✓' : 'Saved to wordbook ✓');
      setTranslationResult(null);
      setInputText('');
      setShowDetails(false);
    } catch (error: any) {
      console.error('Save word failed:', error);
      toast.error(uiLang === 'zh' ? `保存失败：${error.message || '未知错误'}` : `Save failed: ${error.message || 'Unknown error'}`);
      Sentry.captureException(error, { tags: { component: 'useTranslation', op: 'firestore.write', collection: 'words' } });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    inputText,
    setInputText,
    isTranslating,
    translationResult,
    slangInsights,
    isFetchingSlang,
    selectedUsageIndex,
    setSelectedUsageIndex,
    showDetails,
    setShowDetails,
    formalityLevel,
    setFormalityLevel,
    isSaving,
    scene,
    setScene,
    autoTranslateEnabled,
    toggleAutoTranslate,
    handleTranslate,
    handleSaveWord,
  };
}
