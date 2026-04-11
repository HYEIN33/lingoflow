import React, { useState } from 'react';
import { BookOpen, CheckCircle, Volume2, Loader2, RotateCcw } from 'lucide-react';
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
  onSpeak?: (text: string) => void;
  loadingAudioText?: string | null;
  totalWords?: number;
}

export default function ReviewPage(props: ReviewPageProps) {
  const {
    userProfile, uiLang, dueWords, currentReviewWord, reviewIndex,
    showReviewAnswer, setShowReviewAnswer, onReview, onSetReviewIndex,
    onOpenOnboarding, onOpenPayment, onSpeak, loadingAudioText, totalWords = 0
  } = props;

  const t = translations[uiLang];
  const [reviewedCount, setReviewedCount] = useState(0);
  const [reviewMode, setReviewMode] = useState<'card' | 'quiz'>('card');

  const progress = dueWords.length > 0 ? Math.round((reviewedCount / dueWords.length) * 100) : 0;

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
          {/* Header with stats */}
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">{uiLang === 'zh' ? '复习' : 'Review'}</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                {dueWords.length} {uiLang === 'zh' ? '个待复习' : 'due'}
              </span>
              <span className="text-sm font-medium text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                {totalWords} {uiLang === 'zh' ? '总词数' : 'total'}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          {dueWords.length > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-500">
                  {uiLang === 'zh' ? `进度 ${reviewedCount}/${dueWords.length}` : `Progress ${reviewedCount}/${dueWords.length}`}
                </span>
                <span className="text-xs font-bold text-blue-600">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          )}

          {currentReviewWord ? (
            <div className="bg-white rounded-3xl p-8 shadow-xl border border-gray-100 text-center space-y-8">
              {/* Card number */}
              <div className="text-xs font-bold text-gray-300">
                {reviewIndex + 1} / {dueWords.length}
              </div>

              <div className="space-y-3">
                <h3 className="text-4xl font-black text-gray-900 tracking-tight">{currentReviewWord.original}</h3>
                {currentReviewWord.pronunciation && (
                  <p className="text-blue-500 font-mono text-sm">{currentReviewWord.pronunciation}</p>
                )}
                {currentReviewWord.styleTag && currentReviewWord.styleTag !== 'standard' && (
                  <span className={cn(
                    "inline-block px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest",
                    currentReviewWord.styleTag === 'authentic' ? "bg-blue-100 text-blue-600" : "bg-purple-100 text-purple-600"
                  )}>
                    {currentReviewWord.styleTag === 'authentic' ? t.styleAuthentic : t.styleAcademic}
                  </span>
                )}
                {/* Audio button */}
                {onSpeak && (
                  <button
                    onClick={() => onSpeak(currentReviewWord.original)}
                    disabled={loadingAudioText === currentReviewWord.original}
                    className="mx-auto flex items-center gap-2 text-blue-500 hover:text-blue-600 transition-colors mt-2"
                  >
                    {loadingAudioText === currentReviewWord.original ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
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
                        <div key={idx} className="text-left bg-gray-50 rounded-2xl p-4 space-y-2">
                          <p className="font-bold text-blue-600">{usage.meaningZh}</p>
                          <p className="text-sm text-gray-700">{usage.meaning}</p>
                          {usage.examples && usage.examples.length > 0 && (
                            <div className="pt-2 border-t border-gray-100">
                              <p className="text-sm text-gray-600 italic">"{usage.examples[0].sentence}"</p>
                              <p className="text-xs text-gray-400 mt-1">{usage.examples[0].translation}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { q: 1, label: uiLang === 'zh' ? '忘记' : 'Forgot', color: 'bg-red-500', hint: uiLang === 'zh' ? '1天后' : 'in 1d' },
                        { q: 3, label: uiLang === 'zh' ? '模糊' : 'Hard', color: 'bg-orange-500', hint: uiLang === 'zh' ? '~3天' : '~3d' },
                        { q: 4, label: uiLang === 'zh' ? '记得' : 'Good', color: 'bg-green-500', hint: uiLang === 'zh' ? '~1周' : '~1w' },
                        { q: 5, label: uiLang === 'zh' ? '秒杀' : 'Easy', color: 'bg-blue-500', hint: uiLang === 'zh' ? '~2周' : '~2w' }
                      ].map((btn) => (
                        <button
                          key={btn.q}
                          onClick={() => {
                            onReview(currentReviewWord.id, btn.q);
                            setShowReviewAnswer(false);
                            setReviewedCount(c => c + 1);
                            if (reviewIndex < dueWords.length - 1) {
                              onSetReviewIndex(reviewIndex + 1);
                            } else {
                              onSetReviewIndex(0);
                            }
                          }}
                          className={cn(
                            "py-3 rounded-xl text-white font-bold transition-transform active:scale-95 shadow-lg flex flex-col items-center",
                            btn.color
                          )}
                        >
                          <span className="text-xs">{btn.label}</span>
                          <span className="text-[10px] opacity-70 mt-0.5">{btn.hint}</span>
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
          ) : reviewedCount > 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-gray-100 shadow-sm space-y-4">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto" />
              <h3 className="text-2xl font-black text-gray-900">{uiLang === 'zh' ? '复习完成！' : 'Review Complete!'}</h3>
              <p className="text-gray-500">{uiLang === 'zh' ? `本次复习了 ${reviewedCount} 个单词` : `You reviewed ${reviewedCount} words`}</p>
              <button
                onClick={() => { setReviewedCount(0); onSetReviewIndex(0); }}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors mt-4"
              >
                <RotateCcw className="w-4 h-4" />
                {uiLang === 'zh' ? '再来一轮' : 'Review Again'}
              </button>
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
