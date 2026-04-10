import { useState } from 'react';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { SavedWord, UserProfile } from '../App';
import { markOnboardingStep } from '../components/OnboardingChecklist';

export function useReview(user: User | null, userProfile: UserProfile | null, savedWords: SavedWord[]) {
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showReviewAnswer, setShowReviewAnswer] = useState(false);

  const dueWords = savedWords.filter(word => {
    if (!word.nextReviewDate) return false;
    const nextDate = word.nextReviewDate.toDate();
    return nextDate <= new Date();
  });

  const currentReviewWord = dueWords[reviewIndex];

  const handleReview = async (wordId: string, quality: number) => {
    if (!user || !userProfile?.isPro) return;

    const word = savedWords.find(w => w.id === wordId);
    if (!word) return;

    // SM-2 Algorithm
    let { interval, easeFactor } = word;
    if (interval === undefined) interval = 0;
    if (easeFactor === undefined) easeFactor = 2.5;

    if (quality >= 3) {
      if (interval === 0) interval = 1;
      else if (interval === 1) interval = 6;
      else interval = Math.round(interval * easeFactor);
      easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    } else {
      interval = 1;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
    }

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + interval);
    markOnboardingStep('complete_review');

    try {
      const wordRef = doc(db, 'words', wordId);
      await updateDoc(wordRef, {
        interval,
        easeFactor,
        nextReviewDate: Timestamp.fromDate(nextReviewDate)
      });
    } catch (error) {
      console.error('Failed to update review:', error);
    }
  };

  return {
    dueWords,
    reviewIndex,
    setReviewIndex,
    showReviewAnswer,
    setShowReviewAnswer,
    currentReviewWord,
    handleReview,
  };
}
