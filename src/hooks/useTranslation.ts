import { useState } from 'react';
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

  const handleTranslate = async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    const textToTranslate = overrideText || inputText;
    if (!textToTranslate.trim()) return;

    if (userProfile && !userProfile.isPro && userProfile.translationCount >= 10) {
      onPaymentNeeded('translation_limit');
      return;
    }

    setIsTranslating(true);
    setTranslationResult(null);
    setShowDetails(false);
    setSelectedUsageIndex(0);
    setSlangInsights([]);
    markOnboardingStep('translate_word');
    try {
      const result = await translateText(textToTranslate, userProfile?.isPro ? formalityLevel : undefined);
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
        const userRef = doc(db, 'users', userProfile.userId);
        await updateDoc(userRef, {
          translationCount: userProfile.translationCount + 1
        });
        setUserProfile({ ...userProfile, translationCount: userProfile.translationCount + 1 });
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
      alert(message);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSaveWord = async (styleTag: 'authentic' | 'academic' | 'standard' = 'standard') => {
    if (!user || !translationResult || isSaving) return;

    if (userProfile && !userProfile.isPro && savedWords.length >= 50) {
      alert(uiLang === 'zh' ? '免费用户限存50个单词，请升级Pro。' : 'Free users are limited to 50 saved words. Please upgrade to Pro.');
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

      alert(uiLang === 'zh' ? '已成功保存到单词本' : 'Successfully saved to wordbook');
      setTranslationResult(null);
      setInputText('');
      setShowDetails(false);
    } catch (error: any) {
      console.error('Save word failed:', error);
      alert(uiLang === 'zh' ? `保存失败: ${error.message || '未知错误'}` : `Failed to save: ${error.message || 'Unknown error'}`);
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
    handleTranslate,
    handleSaveWord,
  };
}
