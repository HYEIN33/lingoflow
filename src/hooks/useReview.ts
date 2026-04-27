import { useState } from 'react';
import * as Sentry from '@sentry/react';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { SavedWord, UserProfile } from '../App';
import { markOnboardingStep } from '../components/OnboardingChecklist';

export function useReview(user: User | null, userProfile: UserProfile | null, savedWords: SavedWord[]) {
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showReviewAnswer, setShowReviewAnswer] = useState(false);
  // Session 本地的 "again 队列"：用户点 Again 的词，在本次复习 session
  // 末尾重新出现一次。这个状态不持久化 —— 换 session 就重置。
  // 解决 "点 Again 没回流继续练，直接 Review Complete" 的 bug。
  const [againQueue, setAgainQueue] = useState<SavedWord[]>([]);

  const baseDueWords = savedWords.filter(word => {
    // Words without nextReviewDate are also due (legacy words before Pro)
    if (!word.nextReviewDate) return true;
    try {
      const nextDate = word.nextReviewDate.toDate();
      return nextDate <= new Date();
    } catch {
      return true;
    }
  });

  // 展示给用户的队列 = 今天到期的词 + 本 session 点过 Again 的词
  // 注意用 id 去重，防止 Firestore 订阅回刷了原词又把它重新塞进来
  const dueWords = [
    ...baseDueWords,
    ...againQueue.filter(aq => !baseDueWords.some(b => b.id === aq.id)),
  ];

  const currentReviewWord = dueWords[reviewIndex];

  // 已复习过的词 = 有 interval > 0 且 nextReviewDate 在未来（不在 dueWords 里）。
  // 这一列表暴露给 ReviewPage 的"查看已复习"+"重新复习"两个新按钮用。
  // 按 nextReviewDate 升序（下次复习最早的排前面）。
  const reviewedWords = savedWords
    .filter(word => {
      if (!word.nextReviewDate) return false;
      if (word.interval === undefined || word.interval <= 0) return false;
      try {
        return word.nextReviewDate.toDate() > new Date();
      } catch {
        return false;
      }
    })
    .sort((a, b) => {
      const ad = a.nextReviewDate?.toDate?.().getTime() ?? 0;
      const bd = b.nextReviewDate?.toDate?.().getTime() ?? 0;
      return ad - bd;
    });

  // 把一个已复习过的词拉回复习队列：nextReviewDate 设成现在，触发它回到 dueWords。
  // interval/easeFactor 保持原样 —— 用户只是想再刷一遍，不是惩罚它。
  const requeueForReview = async (wordId: string) => {
    if (!user || (!userProfile?.isPro && !userProfile?.hasCompletedOnboarding)) return;
    try {
      const wordRef = doc(db, 'words', wordId);
      await updateDoc(wordRef, {
        nextReviewDate: Timestamp.fromDate(new Date()),
      });
    } catch (error) {
      console.error('Failed to requeue word:', error);
      Sentry.captureException(error, { tags: { component: 'useReview', op: 'firestore.write', collection: 'words' } });
    }
  };

  // 把"已复习的词"全部拉回复习队列。用户在空队列时点"全部重练"用。
  const requeueAllReviewed = async () => {
    if (!user || (!userProfile?.isPro && !userProfile?.hasCompletedOnboarding)) return;
    if (reviewedWords.length === 0) return;
    const now = Timestamp.fromDate(new Date());
    try {
      await Promise.all(
        reviewedWords.map(w =>
          updateDoc(doc(db, 'words', w.id), { nextReviewDate: now })
        )
      );
      setReviewIndex(0);
    } catch (error) {
      console.error('Failed to requeue all reviewed words:', error);
      Sentry.captureException(error, { tags: { component: 'useReview', op: 'firestore.write', collection: 'words' } });
    }
  };

  const handleReview = async (wordId: string, quality: number) => {
    if (!user || (!userProfile?.isPro && !userProfile?.hasCompletedOnboarding)) return;

    const word = savedWords.find(w => w.id === wordId);
    if (!word) return;

    // SM-2 Algorithm
    let { interval, easeFactor } = word;
    if (interval === undefined) interval = 0;
    if (easeFactor === undefined) easeFactor = 2.5;

    // quality 1 = Again（完全忘了）；2 = Hard；3 = Good；4 = Easy
    if (quality >= 3) {
      if (interval === 0) interval = 1;
      else if (interval === 1) interval = 6;
      else interval = Math.round(interval * easeFactor);
      easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    } else if (quality === 2) {
      // Hard: 缩短间隔 + 降 ease
      interval = Math.max(1, Math.round(interval * 0.6));
      easeFactor = Math.max(1.3, easeFactor - 0.15);
    } else {
      // Again：不写 +1 天（否则今天就看不到了）。
      // SM-2 经典做法：interval 重置，但设一个"很短的重新呈现时间"（比如 10 分钟后）
      // Firestore 里记 nextReviewDate = 现在 + 10 分钟，保证刷新后这个词仍在今天到期列表
      interval = 0;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
    }

    markOnboardingStep('complete_review');

    // 写 Firestore：nextReviewDate 按 quality 决定
    //   - Again (q=1): 现在 + 10 分钟（保证当天仍可复习，F5 刷新也能找回）
    //   - 其它: 现在 + interval 天
    const nextReviewDate = new Date();
    if (quality === 1) {
      nextReviewDate.setMinutes(nextReviewDate.getMinutes() + 10);
    } else {
      nextReviewDate.setDate(nextReviewDate.getDate() + interval);
    }

    // Session 内立即回流：Again 就推到 againQueue 队尾，下一轮再考一次
    if (quality === 1) {
      setAgainQueue(prev => [...prev.filter(w => w.id !== word.id), word]);
    } else {
      // 非 Again：如果这个词之前在 againQueue 里（已经回流过一次又答对了），清掉
      setAgainQueue(prev => prev.filter(w => w.id !== word.id));
    }

    try {
      const wordRef = doc(db, 'words', wordId);
      await updateDoc(wordRef, {
        interval,
        easeFactor,
        nextReviewDate: Timestamp.fromDate(nextReviewDate)
      });
    } catch (error) {
      console.error('Failed to update review:', error);
      Sentry.captureException(error, { tags: { component: 'useReview', op: 'firestore.write', collection: 'words' } });
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
    reviewedWords,
    requeueForReview,
    requeueAllReviewed,
  };
}
