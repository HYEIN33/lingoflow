import React from 'react';
import { BookOpen, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Language, translations } from '../i18n';
import { SavedWord, UserProfile } from '../App';

interface ReviewPageProps {
  userProfile: UserProfile | null;
  uiLang: Language;
  dueWords: SavedWord[];
  currentReviewWord: SavedWord | undefined;
  reviewIndex: number;
  showReviewAnswer: boolean;
  setShowReviewAnswer: (v: boolean) => void;
  onReview: (wordId: string, quality: number) => void;
  onSetReviewIndex: (v: number) => void;
  onOpenOnboarding: () => void;
  onOpenPayment: (source: string) => void;
}

export default function ReviewPage(props: ReviewPageProps) {
  const {
    userProfile, uiLang, dueWords, currentReviewWord, reviewIndex,
    showReviewAnswer, setShowReviewAnswer, onReview, onSetReviewIndex,
    onOpenOnboarding, onOpenPayment
  } = props;

  const t = translations[uiLang];

  return (
    <div className="space-y-6">
      {!userProfile?.isPro && !userProfile?.hasCompletedOnboarding ? (
        <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 text-center space-y-6 max-w-md mx-auto mt-12">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto">
            <BookOpen className="w-10 h-10 text-blue-500" />
          </div>
          <h3 className="text-2xl font-black text-gray-900">
            {uiLang === 'zh' ? '艾宾浩斯复习系统' : 'Spaced Repetition'}
          </h3>
          <p className="text-gray-500">
            {uiLang === 'zh'
              ? '基于 SM-2 算法的智能复习系统，帮助你将短期记忆转化为长期记忆。'
              : 'Smart review system based on SM-2 algorithm to help you convert short-term memory into long-term memory.'}
          </p>
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
            <p className="text-amber-800 font-bold mb-2">
              {uiLang === 'zh' ? '完成首次梗百科贡献，解锁 7 天试用' : 'Complete your first Slang Dictionary contribution to unlock a 7-day trial'}
            </p>
            <button
              onClick={onOpenOnboarding}
              className="w-full bg-amber-500 text-white py-3 rounded-xl font-bold hover:bg-amber-600 transition-colors shadow-lg shadow-amber-200"
            >
              {uiLang === 'zh' ? '去贡献词条' : 'Contribute Now'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">{uiLang === 'zh' ? '复习' : 'Review'}</h2>
            <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              {dueWords.length} {uiLang === 'zh' ? '个待复习' : 'due'}
            </span>
          </div>

          {currentReviewWord ? (
            <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 text-center space-y-8">
              <div className="space-y-2">
                <h3 className="text-4xl font-black text-gray-900 tracking-tight">{currentReviewWord.original}</h3>
                {currentReviewWord.styleTag && currentReviewWord.styleTag !== 'standard' && (
                  <span className={cn(
                    "inline-block px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest",
                    currentReviewWord.styleTag === 'authentic' ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"
                  )}>
                    {currentReviewWord.styleTag === 'authentic' ? t.styleAuthentic : t.styleAcademic}
                  </span>
                )}
              </div>

              <AnimatePresence mode="wait">
                {showReviewAnswer ? (
                  <motion.div
                    key="answer"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6 pt-6 border-t border-gray-100"
                  >
                    <div className="space-y-4">
                      {currentReviewWord.usages.map((usage: any, idx: number) => (
                        <div key={idx} className="text-left bg-gray-50 rounded-2xl p-4">
                          <p className="font-bold text-blue-600 mb-1">{usage.meaningZh}</p>
                          <p className="text-sm text-gray-600 italic">"{usage.example}"</p>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { q: 1, label: uiLang === 'zh' ? '忘记' : 'Forgot', color: 'bg-red-500' },
                        { q: 3, label: uiLang === 'zh' ? '模糊' : 'Hard', color: 'bg-orange-500' },
                        { q: 4, label: uiLang === 'zh' ? '记得' : 'Good', color: 'bg-green-500' },
                        { q: 5, label: uiLang === 'zh' ? '秒杀' : 'Easy', color: 'bg-blue-500' }
                      ].map((btn) => (
                        <button
                          key={btn.q}
                          onClick={() => {
                            onReview(currentReviewWord.id, btn.q);
                            setShowReviewAnswer(false);
                            if (reviewIndex < dueWords.length - 1) {
                              onSetReviewIndex(reviewIndex + 1);
                            } else {
                              onSetReviewIndex(0);
                            }
                          }}
                          className={cn(
                            "py-3 rounded-xl text-white text-[10px] font-black uppercase tracking-wider shadow-lg transition-transform active:scale-95",
                            btn.color
                          )}
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="question" className="py-12">
                    <button
                      onClick={() => setShowReviewAnswer(true)}
                      className="bg-gray-900 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-gray-800 transition-all shadow-xl shadow-gray-200"
                    >
                      {uiLang === 'zh' ? '查看答案' : 'Show Answer'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">{uiLang === 'zh' ? '太棒了！' : 'Well done!'}</h3>
              <p className="text-gray-400">{uiLang === 'zh' ? '目前没有需要复习的单词。' : 'No words due for review right now.'}</p>
              <p className="text-gray-300 text-sm mt-2">{uiLang === 'zh' ? '去翻译页面保存单词，系统会自动安排复习' : 'Save words from the Translate tab to start reviewing'}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
