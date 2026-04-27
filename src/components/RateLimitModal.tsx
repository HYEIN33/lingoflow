/**
 * RateLimitModal — 玻璃风全屏遮罩，撞限流时弹出。
 *
 * 三种状态：
 *   - reason='minute': 倒计时显示秒数到期，自动关闭
 *   - reason='day':    "今日额度用完"，无倒计时
 *   - 非 Pro 用户:     底部"升级 Pro 解锁更多"CTA → 跳 PaymentScreen
 *
 * 由 App.tsx 全局拦截 RateLimitError 后挂载。卸载时 cleanup 计时器。
 *
 * 视觉：跟主页 ambient 一致的白蓝玻璃 + backdrop-blur，遮罩点击不
 * 关闭（强制用户看清 retryAfter，避免反复点请求加重限流）。
 */
import { useEffect, useState } from 'react';
import { Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { BucketName } from '../services/ai';

export interface RateLimitInfo {
  bucket: BucketName | string;
  reason: 'minute' | 'day';
  retryAfter: number; // seconds
  isPro: boolean;
}

const BUCKET_LABEL_ZH: Record<string, string> = {
  translate: '翻译',
  classroom: '课堂同传',
  grammar: '语法检查',
  chat: 'AI 问答',
  slang: '梗百科',
  'live-token': '课堂同传连接',
};

interface Props {
  info: RateLimitInfo | null;
  onClose: () => void;
  onUpgrade: () => void;
  uiLang: 'en' | 'zh';
}

export default function RateLimitModal({ info, onClose, onUpgrade, uiLang }: Props) {
  // Live countdown for minute-bucket. Updates every second.
  const [secondsLeft, setSecondsLeft] = useState<number>(info?.retryAfter || 0);

  useEffect(() => {
    if (!info) return;
    setSecondsLeft(info.retryAfter);
    if (info.reason !== 'minute') return; // day-cap doesn't tick
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          onClose();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [info, onClose]);

  if (!info) return null;

  const bucketLabel = BUCKET_LABEL_ZH[info.bucket] || info.bucket;
  const isMinute = info.reason === 'minute';
  const showProCta = !info.isPro;

  return (
    <AnimatePresence>
      <motion.div
        key="rl-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style={{
          background: 'rgba(10, 14, 26, 0.32)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        // Don't close on overlay click — make user read the retryAfter
        // before they smash buttons again. Close via X or upgrade only.
      >
        <motion.div
          key="rl-card"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative max-w-[420px] w-full rounded-[24px] p-[28px_28px_22px] border border-white/85 shadow-[0_24px_60px_rgba(91,127,232,0.22),0_4px_14px_rgba(10,14,26,0.08)]"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.94) 0%, rgba(244,247,255,0.88) 100%)',
            backdropFilter: 'blur(48px) saturate(160%)',
            WebkitBackdropFilter: 'blur(48px) saturate(160%)',
          }}
        >
          {/* Close button — top-right ghost icon */}
          <button
            type="button"
            onClick={onClose}
            aria-label={uiLang === 'zh' ? '关闭' : 'Close'}
            className="absolute top-3 right-3 w-7 h-7 inline-flex items-center justify-center rounded-full text-[var(--ink-subtle)] hover:bg-[rgba(10,14,26,0.06)] hover:text-[var(--ink)] bg-transparent border-0 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Icon + title */}
          <div className="flex items-start gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white"
              style={{
                background: isMinute
                  ? 'linear-gradient(135deg, #E8C375, #C9940F)'
                  : 'linear-gradient(135deg, #E5382B, #B81F14)',
                boxShadow: isMinute
                  ? '0 4px 10px rgba(232,195,117,0.4)'
                  : '0 4px 10px rgba(229,56,43,0.35)',
              }}
            >
              {isMinute ? '⏱' : '⚠'}
            </div>
            <div className="flex-1 min-w-0">
              <h2
                className="m-0 mb-0.5 text-[var(--ink)]"
                style={{
                  fontFamily: '"Clash Display", system-ui, sans-serif',
                  fontWeight: 600,
                  fontSize: 18,
                  letterSpacing: '-0.01em',
                }}
              >
                {isMinute
                  ? uiLang === 'zh' ? '用得有点快...' : 'Too fast'
                  : uiLang === 'zh' ? '今日额度已用完' : 'Daily limit reached'}
              </h2>
              <div
                className="font-mono-meta text-[10px] tracking-[0.12em] uppercase font-bold text-[var(--blue-accent)]"
              >
                {bucketLabel}
              </div>
            </div>
          </div>

          {/* Body */}
          <div
            className="mb-5"
            style={{
              fontFamily: '"Noto Sans SC", system-ui, sans-serif',
              fontSize: 13.5,
              lineHeight: 1.7,
              color: 'var(--ink-soft)',
            }}
          >
            {isMinute ? (
              <>
                {uiLang === 'zh' ? (
                  <>
                    这一分钟你的「{bucketLabel}」用得有点多了。
                    <br />
                    请等 <strong className="text-[var(--ink)]">{secondsLeft}</strong> 秒再继续。
                  </>
                ) : (
                  <>
                    You've used <strong className="text-[var(--ink)]">{bucketLabel}</strong> a lot this minute.
                    <br />
                    Wait <strong className="text-[var(--ink)]">{secondsLeft}</strong> seconds to continue.
                  </>
                )}
              </>
            ) : (
              <>
                {uiLang === 'zh' ? (
                  <>
                    今天「{bucketLabel}」已经用满了。
                    {showProCta ? '升级 Pro 立刻解锁更多。' : '明天会自动重置。'}
                  </>
                ) : (
                  <>
                    Today's <strong>{bucketLabel}</strong> quota is exhausted.{' '}
                    {showProCta ? 'Upgrade to Pro for more.' : 'Resets tomorrow.'}
                  </>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 justify-end">
            {showProCta && (
              <button
                type="button"
                onClick={onUpgrade}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-white border-0 cursor-pointer"
                style={{
                  background: 'linear-gradient(135deg, #F0D78A, #E88B7D)',
                  boxShadow: '0 4px 12px rgba(232,139,125,0.35)',
                  fontFamily: '"Clash Display", system-ui, sans-serif',
                  fontStyle: 'italic',
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: '0.02em',
                }}
              >
                <Zap className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
                {uiLang === 'zh' ? '升级 Pro' : 'Upgrade Pro'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center px-4 py-2 rounded-full bg-[rgba(10,14,26,0.08)] text-[var(--ink-body)] border-0 cursor-pointer hover:bg-[rgba(10,14,26,0.12)]"
              style={{
                fontFamily: '"Noto Sans SC", system-ui, sans-serif',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {isMinute ? (uiLang === 'zh' ? '继续等' : 'OK') : (uiLang === 'zh' ? '知道了' : 'Got it')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
