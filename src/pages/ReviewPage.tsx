import React, { useState, useEffect, useRef } from 'react';
import { BookOpen, CheckCircle, Volume2, Loader2, RotateCcw, Sparkles, Send, MessageSquare, History, Play, ChevronDown, ChevronUp } from 'lucide-react';
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
  // Empty-state CTA 需要的导航 + 明天预告。传入即可，不传 CTA 降级成静态显示。
  savedWords?: SavedWord[];
  onSwitchTab?: (tab: string) => void;
  // 已复习过、等下次到期的词。用户可以"再练一次"或"全部重练"。不传就不渲染该面板。
  reviewedWords?: SavedWord[];
  onRequeueWord?: (wordId: string) => Promise<void> | void;
  onRequeueAll?: () => Promise<void> | void;
}

export default function ReviewPage(props: ReviewPageProps) {
  const {
    userProfile, uiLang, dueWords, currentReviewWord, reviewIndex,
    showReviewAnswer, setShowReviewAnswer, onReview, onSetReviewIndex,
    onOpenOnboarding, onOpenPayment, onSpeak, loadingAudioText, totalWords = 0,
    onGetHint, onAiChat, savedWords, onSwitchTab,
    reviewedWords, onRequeueWord, onRequeueAll
  } = props;

  // "查看已复习的单词" 列表默认折叠 —— 用户要的是入口而不是总在眼前。
  const [showReviewedList, setShowReviewedList] = useState(false);
  // 正在 requeue 的单词 id，用于按钮 loading 态。
  const [requeueingId, setRequeueingId] = useState<string | null>(null);
  const [requeueingAll, setRequeueingAll] = useState(false);

  // 明天到期数 — savedWords 没传就跳过
  const tomorrowCount = (() => {
    if (!savedWords) return 0;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const dayAfter = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    return savedWords.filter(w => {
      const d = w.nextReviewDate?.toDate?.();
      return d && d >= end && d < dayAfter;
    }).length;
  })();

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
        /* ======================== PAYWALL ======================== */
        <div className="surface !rounded-[18px] border-l-[3px] border-l-[var(--blue-accent)] p-[32px_36px] max-w-2xl mx-auto mt-10 text-left">
          <div className="flex items-center gap-[14px] pb-4 mb-[18px] border-b border-[var(--ink-hairline)]">
            <div className="w-11 h-11 rounded-[14px] flex items-center justify-center text-white shrink-0 shadow-[0_6px_14px_rgba(91,127,232,0.35)]"
              style={{ background: 'linear-gradient(135deg, #5B7FE8, #89A3F0)' }}>
              <BookOpen className="w-[22px] h-[22px]" />
            </div>
            <div>
              <h3 className="font-display text-[20px] font-semibold tracking-[-0.02em] text-[var(--ink)] mb-1">
                {uiLang === 'zh' ? '艾宾浩斯复习系统 · Spaced Repetition' : 'Spaced Repetition · 艾宾浩斯复习'}
              </h3>
              <p className="font-zh-serif text-[13px] text-[var(--ink-muted)] m-0">
                {uiLang === 'zh' ? '基于 SM-2 算法，把短期记忆变成长期记忆' : 'Smart review system based on SM-2 algorithm.'}
              </p>
            </div>
          </div>
          <p className="font-zh-serif text-[14px] leading-[1.9] text-[var(--ink-muted)] mb-5">
            {uiLang === 'zh'
              ? '每天根据你收藏的词生成复习队列，到期就提醒；答对了就把间隔拉长（1 → 3 → 7 → 15 → 30 天），答错就拉回最前。坚持下来，词汇量会指数级增长。'
              : 'Review queue refreshes daily. Get each answer right and the interval extends (1 → 3 → 7 → 15 → 30 days); get it wrong and it comes back to the front.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[10px]">
            <div className="p-4 rounded-[16px] border-[1.5px] border-[rgba(232,180,60,0.45)] bg-[rgba(255,243,217,0.6)]">
              <div className="font-display italic font-bold text-[15px] text-[#8A5D0E] mb-1">
                {uiLang === 'zh' ? 'Contribute first · 先贡献' : 'Contribute first'}
              </div>
              <div className="font-zh-serif text-[12.5px] leading-[1.6] text-[var(--ink-muted)] mb-3">
                {uiLang === 'zh' ? (
                  <>写一个梗百科词条通过审核，<strong>免费试用 7 天</strong>。你的词条会让社区受益。</>
                ) : (
                  <>Contribute a slang entry to get a <strong>7-day free trial</strong>.</>
                )}
              </div>
              <button
                onClick={onOpenOnboarding}
                className="w-full inline-flex items-center justify-center gap-1.5 px-[14px] py-[9px] rounded-[11px] text-[13px] font-bold border-0 cursor-pointer"
                style={{ background: '#E8C375', color: '#5A3C08' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                {uiLang === 'zh' ? '去贡献词条' : 'Contribute Now'}
              </button>
            </div>
            <div className="p-4 rounded-[16px] border-[1.5px] border-[rgba(91,127,232,0.4)] bg-[rgba(91,127,232,0.05)]">
              <div className="font-display italic font-bold text-[15px] text-[var(--blue-accent)] mb-1">
                {uiLang === 'zh' ? 'Upgrade Pro · 直接升级' : 'Upgrade Pro'}
              </div>
              <div className="font-zh-serif text-[12.5px] leading-[1.6] text-[var(--ink-muted)] mb-3">
                {uiLang === 'zh' ? '永久解锁复习 + 高级翻译模式、梗百科 Pro 标识、Formality 滑块。' : 'Unlock review + advanced translation, Pro badge, formality slider.'}
              </div>
              <button
                onClick={() => onOpenPayment('review')}
                className="w-full inline-flex items-center justify-center gap-1.5 px-[14px] py-[9px] rounded-[11px] text-[13px] font-bold border-0 cursor-pointer bg-[var(--ink)] text-white shadow-[0_4px_12px_rgba(10,14,26,0.22)]"
              >
                {uiLang === 'zh' ? '升级 Pro' : 'Upgrade to Pro'}
                <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M3 7h8m0 0L7.5 3.5M11 7l-3.5 3.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Eyebrow */}
          <div className="flex items-baseline gap-[10px] mb-[14px] pl-[4px]">
            <span style={{ width: '18px', height: '1px', background: 'var(--ink-rule)', transform: 'translateY(-4px)' }} />
            <span className="font-display italic text-[13px] text-[var(--ink-muted)]">review</span>
            <span className="font-zh-sans text-[11.5px] tracking-[0.12em] text-[var(--ink-subtle)]">
              {uiLang === 'zh' ? '艾宾浩斯复习' : 'spaced repetition'}
            </span>
          </div>

          {/* Progress strip */}
          {dueWords.length > 0 && (
            <div className="surface !rounded-[14px] p-[14px_22px] mb-7 grid items-center gap-[18px]"
              style={{ gridTemplateColumns: 'auto 1fr auto' }}>
              <div className="font-display font-semibold text-[20px] tracking-[-0.02em] text-[var(--ink)]">
                <em className="not-italic text-[var(--blue-accent)] italic">{dueWords.length}</em>
                <span className="text-[var(--ink-muted)] text-[13px] ml-1">
                  {uiLang === 'zh' ? '个待复习' : 'due'}
                </span>
                <span className="text-[var(--ink-subtle)] text-[12px] ml-[10px]">
                  {uiLang === 'zh' ? `· 已完成 ${reviewedCount}` : `· done ${reviewedCount}`}
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-[rgba(10,14,26,0.08)] overflow-hidden">
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full block"
                  style={{ background: 'linear-gradient(90deg, #5B7FE8, #0A0E1A)', boxShadow: '0 0 12px rgba(91,127,232,0.45)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
              <span className="font-mono-meta text-[12px] text-[var(--blue-accent)] font-bold">{progress}%</span>
            </div>
          )}

          {currentReviewWord ? (
          <>
            {/* Card stage */}
            <div className="glass-thick rounded-[28px] p-[36px_28px] sm:p-[56px_48px] max-w-[760px] mx-auto text-center flex flex-col justify-between" style={{ minHeight: 520 }}>
              {/* Position + SM-2 LVL 难度标识 */}
              <div className="font-mono-meta text-[11px] tracking-[0.25em] text-[var(--ink-subtle)] uppercase">
                CARD {String(reviewIndex + 1).padStart(2, '0')} / {dueWords.length}
                <span className="ml-2 font-mono-meta text-[10px] tracking-[0.18em] uppercase text-[var(--ink-muted)]">
                  SM-2 LVL {currentReviewWord.interval ?? 1}
                </span>
              </div>

              {/* Face */}
              <div className="my-10">
                <h3 className="font-display font-semibold tracking-[-0.04em] leading-none mb-[14px] text-[var(--ink)]"
                  style={{ fontSize: 'clamp(56px, 10vw, 96px)' }}>
                  <em className="italic text-[var(--blue-accent)] font-medium">{currentReviewWord.original}</em>
                </h3>
                {currentReviewWord.pronunciation && (
                  <p className="font-mono-meta text-[14px] tracking-[0.04em] text-[var(--ink-subtle)]">{currentReviewWord.pronunciation}</p>
                )}
                {/* Context sentence — 从第一个 usage 的 example 里取。没有就不渲染。 */}
                {currentReviewWord.usages?.[0]?.examples?.[0]?.sentence && (
                  <p className="mt-3 mb-0 font-display italic text-[18px] md:text-[22px] leading-[1.5] text-[rgba(10,14,26,0.6)] max-w-[520px] mx-auto">
                    "{currentReviewWord.usages[0].examples[0].sentence}"
                  </p>
                )}
                {currentReviewWord.styleTag && currentReviewWord.styleTag !== 'standard' && (
                  <span className={cn(
                    "inline-block px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest mt-3",
                    currentReviewWord.styleTag === 'authentic' ? "bg-[rgba(91,127,232,0.1)] text-[var(--blue-accent)]" : "bg-[rgba(168,168,217,0.18)] text-[#7D6EA3]"
                  )}>
                    {currentReviewWord.styleTag === 'authentic' ? t.styleAuthentic : t.styleAcademic}
                  </span>
                )}
                {onSpeak && (
                  <button
                    onClick={() => onSpeak(currentReviewWord.original)}
                    disabled={loadingAudioText === currentReviewWord.original}
                    className="mx-auto flex items-center gap-2 text-[var(--blue-accent)] hover:text-[var(--blue-accent-deep)] transition-colors mt-4"
                  >
                    {loadingAudioText === currentReviewWord.original ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
                )}
                <div className="mt-7 font-zh-sans font-light text-[12px] tracking-[0.12em] text-[var(--ink-subtle)]">
                  {uiLang === 'zh' ? '看到这个词你脑子里的中文是什么？点下方翻看答案' : 'What comes to mind? Tap below to reveal.'}
                </div>
              </div>

              <AnimatePresence mode="wait">
                {showReviewAnswer ? (
                  <motion.div
                    key="answer"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-0"
                  >
                    {/* Answer block */}
                    <div className="surface !rounded-[18px] p-[24px_28px] text-left my-0 mb-0">
                      <div className="font-mono-meta text-[11px] tracking-[0.22em] uppercase font-extrabold text-[var(--ink-soft)] mb-[10px]">
                        {uiLang === 'zh' ? 'all meanings · 所有释义' : 'all meanings'}
                        {currentReviewWord.usages && currentReviewWord.usages.length > 1 && (
                          <span className="text-[var(--ink-muted)] normal-case tracking-[0.1em] ml-2">
                            ({uiLang === 'zh' ? `有 ${currentReviewWord.usages.length} 种语境` : `${currentReviewWord.usages.length} senses`})
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-[10px] mt-[10px]">
                        {(currentReviewWord.usages || []).map((usage: any, idx: number) => (
                          <div key={idx} className="p-[12px_14px] rounded-[0_12px_12px_0] bg-[rgba(91,127,232,0.05)] border-l-[2.5px] border-l-[var(--blue-accent)]">
                            <div className="font-mono-meta text-[9.5px] font-bold tracking-[0.15em] uppercase text-[var(--blue-accent)] mb-1">
                              {uiLang === 'zh' ? usage.labelZh : usage.label}
                            </div>
                            <p className="font-zh-serif text-[14px] text-[var(--ink)] font-medium m-0 mb-1">{usage.meaning}</p>
                            <p className="font-zh-serif text-[14px] text-[var(--blue-accent)] font-semibold m-0 mb-1.5">{usage.meaningZh}</p>
                            {usage.examples && usage.examples.length > 0 && (
                              <p className="font-display italic text-[12.5px] text-[var(--ink-muted)] m-0">"{usage.examples[0].sentence}"</p>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* AI hint section inline in answer-block */}
                      {onGetHint && (
                        <>
                          <div className="font-mono-meta text-[11px] tracking-[0.22em] uppercase font-extrabold text-[var(--ink-soft)] mt-[22px] pt-[20px] border-t border-[var(--ink-rule)] mb-[10px] flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-[var(--blue-accent)]" />
                              {uiLang === 'zh' ? 'AI memory aid · 记忆助手' : 'AI memory aid'}
                            </span>
                            {!aiHint && (
                              <button
                                onClick={async () => {
                                  setAiHintLoading(true);
                                  try {
                                    const hint = await onGetHint(currentReviewWord.original, currentReviewWord.usages[0]?.meaningZh || '');
                                    setAiHint(hint);
                                  } catch { setAiHint(uiLang === 'zh' ? '获取提示失败' : 'Failed to get hint'); }
                                  setAiHintLoading(false);
                                }}
                                disabled={aiHintLoading}
                                className="font-display italic normal-case text-[12px] text-[var(--blue-accent)] tracking-normal flex items-center gap-1"
                              >
                                {aiHintLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                {uiLang === 'zh' ? '帮我记住 →' : 'Help me remember →'}
                              </button>
                            )}
                          </div>
                          {aiHint && (
                            <p className="font-zh-sans font-medium text-[13.5px] leading-[1.9] text-[var(--ink-body)] tracking-[0.01em] whitespace-pre-line m-0">{aiHint}</p>
                          )}
                          {!aiHint && !aiHintLoading && (
                            <p className="font-display italic text-[12px] text-[var(--ink-subtle)] m-0">
                              {uiLang === 'zh' ? '点「帮我记住」获取记忆技巧、联想、易混词' : 'Click to get memory tricks, associations, and confusable words'}
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {/* Quality prompt */}
                    <div className="font-display italic text-[14px] text-[var(--ink-muted)] text-center mt-8 mb-[14px]">
                      — how well did you remember it?
                      <span className="font-zh-serif not-italic text-[13px] text-[var(--ink-body)] ml-2.5">
                        {uiLang === 'zh' ? '记得怎么样？点一个' : '· tap one'}
                      </span>
                    </div>

                    {/* Quality buttons */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { q: 1, cls: 'again', en: 'Again', zh: uiLang === 'zh' ? '完全忘了' : 'Forgot',  next: uiLang === 'zh' ? '+ 10 分钟' : '+ 10 min', bg: '#FDECEA', bc: '#E89B94', tc: '#A23B30' },
                        { q: 3, cls: 'hard',  en: 'Hard',  zh: uiLang === 'zh' ? '努力想起' : 'Hard',    next: uiLang === 'zh' ? '+ 1 天' : '+ 1 day',  bg: '#FFF3D9', bc: '#E8C375', tc: '#8A5D0E' },
                        { q: 4, cls: 'good',  en: 'Good',  zh: uiLang === 'zh' ? '顺利想起' : 'Smooth',  next: uiLang === 'zh' ? '+ 3 天' : '+ 3 days', bg: '#E4EAFD', bc: '#5B7FE8', tc: '#1E3A8A' },
                        { q: 5, cls: 'easy',  en: 'Easy',  zh: uiLang === 'zh' ? '非常容易' : 'Easy',    next: uiLang === 'zh' ? '+ 7 天' : '+ 7 days', bg: '#E4F4DC', bc: '#7DB96A', tc: '#2F6317' },
                      ].map((btn, i) => (
                        <button
                          key={btn.q}
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
                          className="relative overflow-hidden rounded-[18px] p-[18px_14px_16px] border-2 cursor-pointer flex flex-col items-center gap-1 transition-[transform,box-shadow,filter] duration-150 hover:-translate-y-0.5 hover:brightness-105"
                          style={{ background: btn.bg, borderColor: btn.bc, color: btn.tc, boxShadow: '0 4px 14px rgba(10,14,26,0.06)' }}
                        >
                          <span className="absolute top-2 right-2.5 font-mono-meta text-[10px] font-bold rounded-[5px] px-1.5 py-0.5"
                            style={{ color: 'rgba(10,14,26,0.5)', background: 'rgba(255,255,255,0.75)', border: '1px solid rgba(10,14,26,0.08)' }}>
                            {i + 1}
                          </span>
                          <span className="font-display font-bold text-[18px] tracking-[-0.01em]">{btn.en}</span>
                          <span className="font-zh-serif text-[12px] text-[rgba(10,14,26,0.72)]">{btn.zh}</span>
                          <span className="font-mono-meta text-[10px] tracking-[0.05em] mt-1 px-2 py-0.5 rounded-full font-semibold"
                            style={{ background: 'rgba(255,255,255,0.7)', color: btn.bc }}>
                            {btn.next}
                          </span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="question" className="py-10">
                    <button
                      onClick={() => setShowReviewAnswer(true)}
                      className="rounded-[16px] px-10 py-3.5 font-display italic text-[16px] cursor-pointer transition-[border-color,color,background] duration-150"
                      style={{ background: 'transparent', border: '1.5px dashed rgba(10,14,26,0.25)', color: 'rgba(10,14,26,0.7)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--blue-accent)'; e.currentTarget.style.color = 'var(--blue-accent)'; e.currentTarget.style.background = 'rgba(91,127,232,0.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(10,14,26,0.25)'; e.currentTarget.style.color = 'rgba(10,14,26,0.7)'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      {uiLang === 'zh' ? 'reveal answer · 显示答案' : 'reveal answer'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </>
          ) : reviewedCount > 0 ? (
            /* ======================== COMPLETED STATE ======================== */
            <div className="surface !rounded-[18px] p-[36px_40px] text-center space-y-4 max-w-[600px] mx-auto">
              <div className="w-[60px] h-[60px] rounded-[18px] inline-flex items-center justify-center mb-[18px] bg-[rgba(76,143,59,0.15)] text-[#2F6317]">
                <CheckCircle className="w-[26px] h-[26px]" />
              </div>
              <h3 className="font-display font-semibold text-[22px] tracking-[-0.02em] text-[var(--ink)] m-0 mb-[10px]">
                <em className="italic">{uiLang === 'zh' ? 'Review Complete!' : 'Review Complete!'}</em>
                <span className="not-italic"> · {uiLang === 'zh' ? '本轮完成' : 'done'}</span>
              </h3>
              <p className="font-zh-serif text-[14px] leading-[1.85] text-[var(--ink-muted)] max-w-[420px] mx-auto mb-6">
                {uiLang === 'zh' ? `本次复习了 ${reviewedCount} 个单词` : `You reviewed ${reviewedCount} words`}
              </p>
              <button
                onClick={() => { setReviewedCount(0); onSetReviewIndex(0); }}
                className="inline-flex items-center gap-2 bg-[var(--ink)] text-white px-6 py-3 rounded-xl font-bold hover:bg-[#1a2440] transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                {uiLang === 'zh' ? '再来一轮' : 'Review Again'}
              </button>
            </div>
          ) : (
            /* ======================== EMPTY STATE ======================== */
            <div className="surface !rounded-[18px] p-[36px_40px] text-center max-w-[600px] mx-auto">
              <div className="w-[60px] h-[60px] rounded-[18px] inline-flex items-center justify-center mb-[18px] bg-[rgba(76,143,59,0.15)] text-[#2F6317]">
                <CheckCircle className="w-[26px] h-[26px]" />
              </div>
              <h3 className="font-display font-semibold text-[22px] tracking-[-0.02em] text-[var(--ink)] m-0 mb-[10px]">
                <em className="italic">{uiLang === 'zh' ? 'All caught up!' : 'All caught up!'}</em>
                <span className="not-italic"> · {uiLang === 'zh' ? '今天都复习完了' : 'done for today'}</span>
              </h3>
              <p className="font-zh-serif text-[14px] leading-[1.85] text-[var(--ink-muted)] max-w-[420px] mx-auto m-0">
                {uiLang === 'zh'
                  ? <>没有到期的词条了。{savedWords && tomorrowCount > 0 ? <>明天根据艾宾浩斯曲线会有 <strong className="text-[var(--blue-accent)]">{tomorrowCount} 个</strong> 词到期。</> : ''}去翻译或梗百科发现新词，保持学习节奏。</>
                  : <>No words due for review. {savedWords && tomorrowCount > 0 ? <><strong className="text-[var(--blue-accent)]">{tomorrowCount}</strong> words will be due tomorrow. </> : ''}Go save new words from Translate and keep the streak.</>}
              </p>
              {/* 双 CTA —— onSwitchTab 没传就降级为静态按钮（不可点） */}
              <div className="flex gap-2.5 justify-center mt-5 flex-wrap">
                <button
                  onClick={onSwitchTab ? () => onSwitchTab('translate') : undefined}
                  disabled={!onSwitchTab}
                  className="px-5 py-3 rounded-[14px] bg-[var(--ink)] text-white font-zh-sans font-bold text-[13.5px] shadow-[0_4px_12px_rgba(10,14,26,0.25)] hover:bg-[#1a2440] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {uiLang === 'zh' ? '去翻译新词' : 'Translate new words'}
                </button>
                <button
                  onClick={onSwitchTab ? () => onSwitchTab('slang') : undefined}
                  disabled={!onSwitchTab}
                  className="px-5 py-3 rounded-[14px] bg-transparent border border-[var(--ink-hairline)] text-[var(--ink-body)] font-zh-sans font-bold text-[13.5px] hover:bg-[rgba(10,14,26,0.04)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {uiLang === 'zh' ? '看梗百科热门' : 'Browse trending slang'}
                </button>
              </div>
            </div>
          )}

          {/* ============ REVIEWED WORDS — 查看已复习 + 重新复习 ============
              只在"没有待复习的词"时（currentReviewWord 为 undefined）出现。
              正在复习中不 surface，避免把用户注意力从当前卡片拉走。
          */}
          {!currentReviewWord && reviewedWords && reviewedWords.length > 0 && onRequeueWord && (
            <div className="surface !rounded-[18px] p-[22px_26px] mt-6 max-w-[600px] mx-auto">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--ink-hairline)] mb-4">
                <button
                  onClick={() => setShowReviewedList(v => !v)}
                  className="inline-flex items-center gap-2 font-mono-meta text-[10.5px] tracking-[0.22em] uppercase font-extrabold text-[var(--ink-soft)] hover:text-[var(--ink-body)] transition-colors"
                >
                  <History className="w-3.5 h-3.5 text-[var(--blue-accent)]" />
                  {uiLang === 'zh' ? `已复习 · ${reviewedWords.length}` : `reviewed · ${reviewedWords.length}`}
                  {showReviewedList ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {onRequeueAll && reviewedWords.length > 0 && (
                  <button
                    onClick={async () => {
                      if (requeueingAll) return;
                      setRequeueingAll(true);
                      try { await onRequeueAll(); } finally { setRequeueingAll(false); }
                    }}
                    disabled={requeueingAll}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[var(--ink)] text-white font-zh-sans font-bold text-[12px] hover:bg-[#1a2440] disabled:opacity-60"
                  >
                    {requeueingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                    {uiLang === 'zh' ? '全部重练' : 'Review all again'}
                  </button>
                )}
              </div>
              {!showReviewedList ? (
                <p className="font-zh-serif text-[13px] text-[var(--ink-muted)] m-0 leading-[1.7]">
                  {uiLang === 'zh'
                    ? '这些词已经复习过，被 SM-2 推到了未来的某天。展开可以看到列表，也可以把单个词或全部拉回来再练一次。'
                    : 'These words were reviewed already and scheduled for a future day. Expand to see the list or pull them back to practice again.'}
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-[var(--ink-hairline)] m-0 p-0 list-none">
                  {reviewedWords.map(w => {
                    const meaningZh = w.usages?.[0]?.meaningZh || '';
                    const nextDate = w.nextReviewDate?.toDate?.();
                    const daysLeft = nextDate
                      ? Math.max(0, Math.round((nextDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
                      : 0;
                    const busy = requeueingId === w.id;
                    return (
                      <li key={w.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="font-display italic text-[15px] text-[var(--ink)] leading-tight truncate">
                            {w.original}
                          </div>
                          {meaningZh && (
                            <div className="font-zh-serif text-[12.5px] text-[var(--ink-muted)] mt-0.5 truncate">
                              {meaningZh}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 font-mono-meta text-[10.5px] tracking-[0.06em] text-[var(--ink-subtle)]">
                          {uiLang === 'zh'
                            ? (daysLeft === 0 ? '< 1 天' : `+${daysLeft} 天`)
                            : (daysLeft === 0 ? '< 1d' : `+${daysLeft}d`)}
                        </div>
                        <button
                          onClick={async () => {
                            if (busy) return;
                            setRequeueingId(w.id);
                            try { await onRequeueWord(w.id); } finally { setRequeueingId(null); }
                          }}
                          disabled={busy}
                          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] bg-[rgba(91,127,232,0.1)] text-[var(--blue-accent)] hover:bg-[rgba(91,127,232,0.18)] font-zh-sans font-semibold text-[11.5px] disabled:opacity-50"
                          title={uiLang === 'zh' ? '再练一次' : 'Practice again'}
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" fill="currentColor" />}
                          {uiLang === 'zh' ? '再练' : 'Again'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* ============ SIDE RAIL — AI chat always visible ============ */}
          {onAiChat && (
            <div className="surface !rounded-[14px] p-[18px_20px] mt-8 overflow-hidden">
              <button
                onClick={() => setShowChat(!showChat)}
                className="w-full flex items-center justify-between pb-[10px] mb-3 border-b border-[var(--ink-hairline)] font-mono-meta text-[10.5px] tracking-[0.22em] uppercase font-extrabold text-[var(--ink-soft)]"
              >
                <span className="inline-flex items-center gap-2 normal-case tracking-normal font-mono-meta text-[10.5px] uppercase" style={{ letterSpacing: '0.22em' }}>
                  <Sparkles className="w-3.5 h-3.5 text-[var(--blue-accent)]" />
                  {uiLang === 'zh' ? '— AI 复习助手 · 问 AI 关于这个词' : '— AI review assistant'}
                </span>
                <span className="font-display italic normal-case tracking-normal text-[12px] text-[var(--ink-muted)]">
                  {showChat
                    ? (uiLang === 'zh' ? 'collapse · 收起' : 'collapse')
                    : currentReviewWord
                      ? (uiLang === 'zh' ? `ask about "${currentReviewWord.original}"` : `ask about "${currentReviewWord.original}"`)
                      : (uiLang === 'zh' ? 'ask anything' : 'ask anything')}
                </span>
              </button>
              {showChat && (
                <div>
                  {/* Quick action buttons */}
                  {chatMessages.length === 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
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
                          onClick={() => { setChatInput(q); }}
                          className="font-zh-serif text-[12px] bg-[rgba(91,127,232,0.08)] text-[var(--blue-accent)] px-3 py-1.5 rounded-lg font-medium hover:bg-[rgba(91,127,232,0.15)] transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Chat log */}
                  <div className="flex flex-col gap-2.5 my-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className="flex gap-2 items-start">
                        <span className={cn(
                          "shrink-0 px-2 py-0.5 rounded-md font-mono-meta text-[9.5px] font-bold tracking-[0.08em] mt-0.5",
                          msg.role === 'user'
                            ? "bg-[var(--ink)] text-white"
                            : "bg-white text-[var(--blue-accent)] border border-[rgba(91,127,232,0.3)]"
                        )}>
                          {msg.role === 'user' ? 'YOU' : 'AI'}
                        </span>
                        <div className="flex-1 min-w-0 font-zh-serif text-[13px] leading-[1.75] text-[var(--ink)]">
                          {msg.role === 'ai' ? (
                            <div className="prose prose-sm max-w-none [&>p]:m-0 [&>ul]:m-0 [&>ol]:m-0 [&>p+p]:mt-2 [&_strong]:text-[var(--blue-accent)] [&_strong]:font-semibold">
                              <ReactMarkdown>{msg.text}</ReactMarkdown>
                            </div>
                          ) : msg.text}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex gap-2 items-start">
                        <span className="shrink-0 px-2 py-0.5 rounded-md font-mono-meta text-[9.5px] font-bold tracking-[0.08em] mt-0.5 bg-white text-[var(--blue-accent)] border border-[rgba(91,127,232,0.3)]">AI</span>
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--ink-muted)]" />
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  {/* Input */}
                  <div className="flex gap-2 items-center p-[10px_12px] rounded-[12px] mt-2.5 bg-white/50 border border-white/65">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--blue-accent)] shrink-0" />
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                      placeholder={currentReviewWord
                        ? (uiLang === 'zh' ? `继续问「${currentReviewWord.original}」…` : `Ask about "${currentReviewWord.original}"…`)
                        : (uiLang === 'zh' ? '继续问…' : 'Ask anything…')}
                      className="flex-1 bg-transparent border-0 outline-none font-zh-serif text-[13px] text-[var(--ink)] placeholder:font-display placeholder:italic placeholder:text-[var(--ink-subtle)]"
                    />
                    <button
                      onClick={handleChatSend}
                      disabled={chatLoading || !chatInput.trim()}
                      className="bg-[var(--ink)] text-white px-3 py-1.5 rounded-[10px] disabled:opacity-50 text-[12px] font-bold shrink-0 inline-flex items-center gap-1"
                    >
                      {uiLang === 'zh' ? '发送' : 'send'}
                      <Send className="w-3 h-3" />
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
