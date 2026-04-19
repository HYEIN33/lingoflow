import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, CheckCircle, Volume2, Loader2, RotateCcw, Sparkles, Send, MessageSquare, XCircle, HelpCircle, ThumbsUp, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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
  onGetHint?: (word: string, meaningZh: string) => Promise<string>;
  onAiChat?: (messages: { role: 'user' | 'ai'; text: string }[]) => Promise<string>;
}

export default function ReviewPage(props: ReviewPageProps) {
  const {
    userProfile, uiLang, dueWords, currentReviewWord, reviewIndex,
    showReviewAnswer, setShowReviewAnswer, onReview, onSetReviewIndex,
    onOpenOnboarding, onOpenPayment, onSpeak, loadingAudioText, totalWords = 0,
    onGetHint, onAiChat
  } = props;

  const t = translations[uiLang];
  const [reviewedCount, setReviewedCount] = useState(0);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [aiHintLoading, setAiHintLoading] = useState(false);
  // AI Chat state
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Reset chat when word changes
  useEffect(() => {
    setChatMessages([]);
    setAiHint(null);
    setShowChat(false);
  }, [currentReviewWord?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading || !onAiChat) return;
    const q = chatInput.trim();
    const contextPrefix = currentReviewWord
      ? `[用户正在复习单词 "${currentReviewWord.original}"（${currentReviewWord.usages[0]?.meaningZh || ''}）] `
      : '';
    const newMessages: { role: 'user' | 'ai'; text: string }[] = [...chatMessages, { role: 'user', text: q }];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);
    try {
      const messagesWithContext = newMessages.map((m, i) =>
        i === 0 && m.role === 'user' ? { ...m, text: contextPrefix + m.text } : m
      );
      const answer = await onAiChat(messagesWithContext);
      setChatMessages(prev => [...prev, { role: 'ai', text: answer }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'ai', text: '抱歉，回答失败，请重试' }]);
    }
    setChatLoading(false);
  };

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
              : 'Smart review system based on SM-2 algorithm.'}
          </p>
          <div className="space-y-3">
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-amber-800 font-bold mb-2">
                {uiLang === 'zh' ? '贡献一个梗百科词条，免费试用 7 天' : 'Contribute a slang entry for 7-day free trial'}
              </p>
              <button
                onClick={onOpenOnboarding}
                className="w-full bg-amber-500 text-white py-3 rounded-xl font-bold hover:bg-amber-600 transition-colors shadow-lg shadow-amber-200"
              >
                {uiLang === 'zh' ? '去贡献词条' : 'Contribute Now'}
              </button>
            </div>
            <button
              onClick={() => onOpenPayment('review')}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
            >
              {uiLang === 'zh' ? '或 升级 Pro 永久解锁' : 'Or Upgrade to Pro'}
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
            <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-500">
                  {uiLang === 'zh' ? `进度 ${reviewedCount}/${dueWords.length}` : `Progress ${reviewedCount}/${dueWords.length}`}
                </span>
                <span className="text-xs font-bold text-blue-600">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-400 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          )}

          {currentReviewWord ? (
          <>
            {/* 3D Flip Card — both faces always in DOM, absolute stacked */}
            <div className="[perspective:1000px]">
              <motion.div
                animate={{ rotateY: showReviewAnswer ? 180 : 0 }}
                transition={{ duration: 0.5, type: 'spring', stiffness: 260, damping: 20 }}
                className="relative [transform-style:preserve-3d]"
              >
                {/* Front face — question (always in DOM) */}
                <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-xl border border-gray-100 text-center [backface-visibility:hidden]">
                  <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6">
                    {reviewIndex + 1} / {dueWords.length}
                  </div>

                  <div className="space-y-3 py-8">
                    <h3 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">{currentReviewWord.original}</h3>
                    {currentReviewWord.pronunciation && (
                      <p className="text-blue-500 font-mono text-sm">{currentReviewWord.pronunciation}</p>
                    )}
                    {currentReviewWord.styleTag && currentReviewWord.styleTag !== 'standard' && (
                      <span className={cn(
                        "inline-block px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest",
                        currentReviewWord.styleTag === 'authentic' ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-purple-50 text-purple-600 border border-purple-100"
                      )}>
                        {currentReviewWord.styleTag === 'authentic' ? t.styleAuthentic : t.styleAcademic}
                      </span>
                    )}
                    {onSpeak && (
                      <button
                        onClick={() => onSpeak(currentReviewWord.original)}
                        disabled={loadingAudioText === currentReviewWord.original}
                        className="mx-auto flex items-center gap-2 text-blue-500 hover:text-blue-600 transition-colors mt-2 p-2 rounded-xl hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                        aria-label={uiLang === 'zh' ? '朗读' : 'Read aloud'}
                      >
                        {loadingAudioText === currentReviewWord.original ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Volume2 className="w-5 h-5" />
                        )}
                      </button>
                    )}
                  </div>

                  <div className="py-6">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setShowReviewAnswer(true)}
                      className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-xl shadow-blue-200/50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      {uiLang === 'zh' ? '查看答案' : 'Show Answer'}
                    </motion.button>
                  </div>
                </div>

                {/* Back face — answer + rating (always in DOM, absolute on top) */}
                <div
                  className="absolute inset-0 bg-white rounded-3xl p-5 sm:p-8 shadow-xl border border-gray-100 [transform:rotateY(180deg)] [backface-visibility:hidden] overflow-y-auto"
                >
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 text-center">
                      {reviewIndex + 1} / {dueWords.length}
                    </div>

                    {/* Word at top of answer */}
                    <h3 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight text-center mb-6">{currentReviewWord.original}</h3>

                    {/* Meanings */}
                    <div className="space-y-3 mb-6">
                      {(currentReviewWord.usages || []).map((usage: any, idx: number) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + idx * 0.1 }}
                          className="text-left bg-gray-50 rounded-2xl p-4 sm:p-5 space-y-2 border border-gray-100"
                        >
                          <p className="font-bold text-blue-600 text-base">{usage.meaningZh}</p>
                          <p className="text-sm text-gray-700">{usage.meaning}</p>
                          {usage.examples && usage.examples.length > 0 && (
                            <div className="pt-2 border-t border-gray-100">
                              <p className="text-sm text-gray-600 italic">"{usage.examples[0].sentence}"</p>
                              <p className="text-xs text-gray-400 mt-1">{usage.examples[0].translation}</p>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>

                    {/* AI Memory Hint */}
                    {onGetHint && (
                      <div className="bg-gradient-to-r from-rose-50 to-amber-50 rounded-2xl p-4 border border-blue-100 mb-6">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-indigo-400" />
                            <span className="text-xs font-bold text-indigo-500 uppercase tracking-wider">
                              {uiLang === 'zh' ? 'AI 记忆助手' : 'AI Memory Aid'}
                            </span>
                          </div>
                          {!aiHint && (
                            <button
                              onClick={async () => {
                                setAiHintLoading(true);
                                try {
                                  const hint = await onGetHint(currentReviewWord.original, currentReviewWord.usages[0]?.meaningZh || '');
                                  setAiHint(hint);
                                } catch (err: any) {
                                  console.error('AI hint failed:', err);
                                  const msg = err?.message || '';
                                  if (msg.includes('location') || msg.includes('PRECONDITION')) {
                                    setAiHint(uiLang === 'zh' ? 'AI 服务在当前地区不可用，请使用 VPN 或稍后重试' : 'AI service unavailable in your region');
                                  } else if (msg.includes('繁忙') || msg.includes('不可用')) {
                                    setAiHint(msg);
                                  } else {
                                    setAiHint(uiLang === 'zh' ? '获取提示失败，请重试' : 'Failed to get hint, please retry');
                                  }
                                }
                                setAiHintLoading(false);
                              }}
                              disabled={aiHintLoading}
                              className="text-xs font-bold text-indigo-400 hover:text-indigo-600 transition-colors flex items-center gap-1"
                            >
                              {aiHintLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              {uiLang === 'zh' ? '帮我记住' : 'Help me remember'}
                            </button>
                          )}
                        </div>
                        {aiHint && (
                          <p className="text-sm text-indigo-700 leading-relaxed whitespace-pre-line">{aiHint}</p>
                        )}
                        {!aiHint && !aiHintLoading && (
                          <p className="text-xs text-indigo-400 italic">
                            {uiLang === 'zh' ? '点击「帮我记住」获取记忆技巧、联想、易混词' : 'Click to get memory tricks, associations, and confusable words'}
                          </p>
                        )}
                      </div>
                    )}

                    {/* SM-2 Rating Buttons — game-style with icons and colors */}
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] text-center mb-3">
                      {uiLang === 'zh' ? '你记住了吗？' : 'HOW WELL DID YOU KNOW?'}
                    </p>
                    {/* Emoji reaction buttons — social media feel */}
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { q: 1, emoji: '😫', label: uiLang === 'zh' ? '忘记' : 'Forgot', bg: 'bg-red-50 hover:bg-red-100 border-red-200/60', text: 'text-red-500', hint: uiLang === 'zh' ? '1天后' : '1d' },
                        { q: 3, emoji: '🤔', label: uiLang === 'zh' ? '模糊' : 'Hard', bg: 'bg-amber-50 hover:bg-amber-100 border-amber-200/60', text: 'text-amber-600', hint: uiLang === 'zh' ? '~3天' : '~3d' },
                        { q: 4, emoji: '😊', label: uiLang === 'zh' ? '记得' : 'Good', bg: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200/60', text: 'text-emerald-600', hint: uiLang === 'zh' ? '~1周' : '~1w' },
                        { q: 5, emoji: '🤩', label: uiLang === 'zh' ? '秒杀' : 'Easy', bg: 'bg-blue-50 hover:bg-blue-100 border-blue-200/60', text: 'text-blue-600', hint: uiLang === 'zh' ? '~2周' : '~2w' }
                      ].map((btn) => (
                        <motion.button
                          key={btn.q}
                          whileHover={{ scale: 1.1, y: -4 }}
                          whileTap={{ scale: 0.85 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                          onClick={() => {
                            onReview(currentReviewWord.id, btn.q);
                            setShowReviewAnswer(false);
                            setReviewedCount(c => c + 1);
                            setAiHint(null);
                            if (reviewIndex < dueWords.length - 1) {
                              onSetReviewIndex(reviewIndex + 1);
                            } else {
                              onSetReviewIndex(0);
                            }
                          }}
                          aria-label={`${btn.label} — ${btn.hint}`}
                          className={cn(
                            "py-3 sm:py-4 rounded-2xl font-bold flex flex-col items-center gap-0.5 border transition-all duration-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                            btn.bg, btn.text
                          )}
                        >
                          <span className="text-2xl sm:text-3xl leading-none select-none">{btn.emoji}</span>
                          <span className="text-[10px] font-bold mt-1">{btn.label}</span>
                          <span className="text-[9px] opacity-40">{btn.hint}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
              </motion.div>
            </div>
          </>
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

          {/* AI Chat — always visible in review tab */}
          {onAiChat && (
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <button
                onClick={() => setShowChat(!showChat)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-bold text-gray-700">
                    {uiLang === 'zh' ? 'AI 复习助手' : 'AI Review Assistant'}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {showChat
                    ? (uiLang === 'zh' ? '收起' : 'Collapse')
                    : currentReviewWord
                      ? (uiLang === 'zh' ? `关于「${currentReviewWord.original}」提问` : `Ask about "${currentReviewWord.original}"`)
                      : (uiLang === 'zh' ? '自由提问语言学习问题' : 'Ask any language question')}
                </span>
              </button>
              {showChat && (
                <div className="border-t border-gray-100">
                  {/* Quick action buttons */}
                  {chatMessages.length === 0 && (
                    <div className="p-3 flex flex-wrap gap-2">
                      {(currentReviewWord ? [
                        uiLang === 'zh' ? '怎么记住这个词？' : 'How to remember this?',
                        uiLang === 'zh' ? '造几个句子' : 'Make some sentences',
                        uiLang === 'zh' ? '有哪些易混词？' : 'Similar words?',
                        uiLang === 'zh' ? '词根词缀分析' : 'Root/prefix analysis',
                      ] : [
                        uiLang === 'zh' ? '今天学什么好？' : 'What should I learn today?',
                        uiLang === 'zh' ? '推荐一些高频词汇' : 'Recommend high-frequency words',
                        uiLang === 'zh' ? '怎么提高英语口语？' : 'How to improve speaking?',
                        uiLang === 'zh' ? '语法常见错误有哪些？' : 'Common grammar mistakes?',
                      ]).map((q, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            if (!onAiChat || chatLoading) return;
                            const contextPrefix = currentReviewWord
                              ? `[用户正在复习单词 "${currentReviewWord.original}"（${currentReviewWord.usages[0]?.meaningZh || ''}）] `
                              : '';
                            const newMessages: { role: 'user' | 'ai'; text: string }[] = [{ role: 'user', text: q }];
                            setChatMessages(newMessages);
                            setChatInput('');
                            setChatLoading(true);
                            const messagesWithContext = [{ role: 'user' as const, text: contextPrefix + q }];
                            onAiChat(messagesWithContext).then(answer => {
                              setChatMessages(prev => [...prev, { role: 'ai', text: answer }]);
                            }).catch(() => {
                              setChatMessages(prev => [...prev, { role: 'ai', text: '抱歉，回答失败，请重试' }]);
                            }).finally(() => setChatLoading(false));
                          }}
                          className="text-xs bg-blue-50 text-indigo-500 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-100 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Messages */}
                  <div className="max-h-[40vh] overflow-y-auto p-4 space-y-3">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                          {msg.role === 'ai' ? (
                            <div className="prose prose-sm max-w-none [&>p]:m-0 [&>ul]:m-0 [&>ol]:m-0 [&>p+p]:mt-2">
                              <ReactMarkdown>{msg.text}</ReactMarkdown>
                            </div>
                          ) : msg.text}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="bg-gray-100 px-3.5 py-2 rounded-2xl"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  {/* Input */}
                  <div className="border-t border-gray-100 p-3 flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                      placeholder={currentReviewWord
                        ? (uiLang === 'zh' ? `关于「${currentReviewWord.original}」的问题...` : `Ask about "${currentReviewWord.original}"...`)
                        : (uiLang === 'zh' ? '问任何语言学习问题...' : 'Ask any language question...')}
                      className="flex-1 px-3.5 py-2 rounded-xl border border-gray-200 outline-none focus:border-blue-400 text-sm"
                    />
                    <button
                      onClick={handleChatSend}
                      disabled={chatLoading || !chatInput.trim()}
                      className="bg-indigo-600 text-white px-3.5 py-2 rounded-xl disabled:opacity-50 text-sm font-bold shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
