import { useState, useRef } from 'react';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';
import { doc, updateDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { UserProfile, SavedWord } from '../App';
import {
  translateText,
  translateSimple,
  loadTranslationDetails,
  TranslationResult,
  explainSlang,
  SlangExplanationResult
} from '../services/ai';
import { Timestamp, addDoc, collection } from 'firebase/firestore';
import { markOnboardingStep } from '../components/OnboardingChecklist';

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
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  // Ref-based guard — survives async gap between parallel clicks, which setIsTranslating cannot
  const inFlightRef = useRef(false);
  // Per-usage memo of loaded detail payloads so expanding different usages
  // (or collapsing/re-expanding) doesn't re-fetch. Keyed by usage label.
  const detailsCacheRef = useRef<Map<string, Awaited<ReturnType<typeof loadTranslationDetails>>>>(new Map());

  // Resets the translate surface back to its "no result yet" state. Called by
  // the Clear (×) button in the input box so the user can get back to the
  // search history + trending meme list after reading a translation.
  // Without this, clearing the input keeps the old result on screen because
  // the history/trending UI is gated on `!translationResult`.
  const clearTranslation = () => {
    setInputText('');
    setTranslationResult(null);
    setShowDetails(false);
    setSelectedUsageIndex(0);
    setSlangInsights([]);
  };

  const handleTranslate = async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    const textToTranslate = overrideText || inputText;
    if (!textToTranslate.trim()) return;

    // H3: guard against parallel calls (double-click / rapid submit)
    if (inFlightRef.current) return;

    // ?? 0 — never compare against undefined/NaN (legacy profile safety)
    const currentCount = userProfile?.translationCount ?? 0;
    if (userProfile && !userProfile.isPro && currentCount >= 10) {
      onPaymentNeeded('translation_limit');
      return;
    }

    inFlightRef.current = true;
    setIsTranslating(true);
    setTranslationResult(null);
    setShowDetails(false);
    setSelectedUsageIndex(0);
    setSlangInsights([]);
    markOnboardingStep('translate_word');

    // Progressive rendering: fire translateSimple for a sub-second preview,
    // then translateText in parallel for the full structured result. Whichever
    // finishes first shows; the full result replaces the preview when ready.
    // If translateText finishes first (rare), the preview is simply ignored.
    const fullPromise = translateText(textToTranslate, userProfile?.isPro ? formalityLevel : undefined);
    let fullDone = false;
    fullPromise.finally(() => { fullDone = true; });

    try {
      // Preview path — streamed, best-effort, never blocks the full path.
      // Each chunk appends to authenticTranslation so the user sees a
      // typewriter effect starting ~200-400ms after pressing translate.
      // Once the full structured result lands, it replaces the preview —
      // fullDone guard prevents any tail-end chunks from overwriting it.
      let previewText = '';
      translateSimple(textToTranslate, (delta) => {
        if (fullDone) return;
        previewText += delta;
        setTranslationResult({
          original: textToTranslate,
          authenticTranslation: previewText,
          usages: [],
        });
      })
        .catch(() => {
          // Silent: the full result will cover the user experience
        });

      const result = await fullPromise;
      setTranslationResult(result);
      setSelectedUsageIndex(0);

      // Fetch slang insights if terms are found
      if (result.slangTerms && result.slangTerms.length > 0) {
        setIsFetchingSlang(true);
        try {
          const insights = await Promise.all(
            result.slangTerms.slice(0, 3).map(term => explainSlang(term))
          );
          setSlangInsights(insights);
        } catch (err) {
          console.error("Error fetching slang insights:", err);
        } finally {
          setIsFetchingSlang(false);
        }
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
      console.error(error);
      const raw = error.message || '';
      // Show friendly message, never raw JSON/API errors
      let message: string;
      if (raw.includes('location') || raw.includes('PRECONDITION')) {
        message = uiLang === 'zh' ? '翻译服务在当前地区不可用，请使用 VPN 或稍后重试' : 'Translation service unavailable in your region';
      } else if (raw.includes('不可用') || raw.includes('繁忙')) {
        message = raw; // Already friendly
      } else {
        message = uiLang === 'zh' ? '翻译失败，请重试' : 'Translation failed. Please try again.';
      }
      toast.error(message);
    } finally {
      setIsTranslating(false);
      inFlightRef.current = false;
    }
  };

  // Fetches synonyms/antonyms/alternatives/conjugations for the currently
  // selected usage and merges them into the cached translationResult. No-op
  // if the details are already loaded. Triggered by TranslateTab when the
  // user first expands "Show Details".
  const ensureDetailsLoaded = async (usageIndex: number) => {
    if (!translationResult) return;
    const usage = translationResult.usages?.[usageIndex];
    if (!usage) return;
    const cacheKey = `${translationResult.original}::${usage.label}`;

    // Already present on the usage object — nothing to do
    if (usage.synonyms || usage.antonyms || usage.alternatives || usage.conjugations) return;

    // Hot cache (different usage index pointing at same usage? unlikely but cheap)
    const cached = detailsCacheRef.current.get(cacheKey);
    if (cached) {
      mergeDetailsIntoResult(usageIndex, cached);
      return;
    }

    setIsLoadingDetails(true);
    try {
      const details = await loadTranslationDetails(translationResult.original, usage.label, usage.meaning);
      detailsCacheRef.current.set(cacheKey, details);
      mergeDetailsIntoResult(usageIndex, details);
    } catch (e) {
      console.warn('Failed to load translation details', e);
      Sentry.captureException(e, { tags: { component: 'useTranslation', op: 'loadTranslationDetails' } });
      // Surface but non-blocking — user still has the core translation
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const mergeDetailsIntoResult = (usageIndex: number, details: Awaited<ReturnType<typeof loadTranslationDetails>>) => {
    setTranslationResult((prev) => {
      if (!prev || !prev.usages) return prev;
      const nextUsages = prev.usages.map((u, i) =>
        i === usageIndex
          ? {
              ...u,
              synonyms: details.synonyms,
              antonyms: details.antonyms,
              alternatives: details.alternatives,
              conjugations: details.conjugations,
            }
          : u
      );
      return { ...prev, usages: nextUsages };
    });
  };

  const handleSaveWord = async (styleTag: 'authentic' | 'academic' | 'standard' = 'standard') => {
    if (!user || !translationResult || isSaving) return;

    if (userProfile && !userProfile.isPro && savedWords.length >= 50) {
      toast.error(uiLang === 'zh' ? '免费用户限存 50 个单词，请升级 Pro' : 'Free users are limited to 50 saved words. Please upgrade to Pro.');
      return;
    }

    setIsSaving(true);
    markOnboardingStep('save_wordbook');
    const path = 'words';
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
    isLoadingDetails,
    handleTranslate,
    handleSaveWord,
    ensureDetailsLoaded,
    clearTranslation,
  };
}
