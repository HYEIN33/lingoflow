/**
 * 用量徽章 — 嵌在每个 Tab 的 eyebrow（"translate · 翻译"那条）右边。
 *
 * 设计：
 *   - 默认状态：一个绿色小点 + "今日 N / cap"小字
 *   - 70%+ 用量：黄色小点
 *   - 90%+ 用量：红色小点 + （免费用户）显示"升级 Pro"按钮
 *   - 鼠标 hover：tooltip 显示分钟用量 + 详细数字
 *
 * 视觉很轻——不打扰阅读，但用户瞥一眼就知道还能用多少。
 */

import { useUsage, BUCKET_LABELS_ZH, BUCKET_LABELS_EN, type BucketName } from '../hooks/useUsage';
import { cn } from '../lib/utils';

interface UsageBadgeProps {
  bucket: BucketName;
  isPro?: boolean;
  uiLang?: 'zh' | 'en';
  /** 免费用户撞 90% 时点"升级"会调这个回调 */
  onUpgrade?: () => void;
  className?: string;
}

export function UsageBadge({ bucket, isPro = false, uiLang = 'zh', onUpgrade, className }: UsageBadgeProps) {
  const { byBucket, loading } = useUsage(isPro);
  const usage = byBucket[bucket];

  if (loading || !usage) return null;
  const label = (uiLang === 'zh' ? BUCKET_LABELS_ZH : BUCKET_LABELS_EN)[bucket];
  if (usage.capDay === Infinity) return null; // 无限额的 bucket 不显示

  const pct = usage.pctDay;
  const dotColor =
    pct >= 0.9 ? 'bg-[var(--red-warn)]' :
    pct >= 0.7 ? 'bg-[#E8C375]' :
                 'bg-[#4C8F3B]';

  const showUpgrade = !isPro && pct >= 0.9 && onUpgrade;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono-meta text-[10px] tracking-[0.05em] text-[rgba(10,14,26,0.5)]',
        className
      )}
      title={
        uiLang === 'zh'
          ? `${label}：今日 ${usage.usedDay}/${usage.capDay} · 这分钟 ${usage.usedMinute}/${usage.capMinute}`
          : `${label}: today ${usage.usedDay}/${usage.capDay} · this minute ${usage.usedMinute}/${usage.capMinute}`
      }
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} />
      <span className="tabular-nums">
        {usage.usedDay}/{usage.capDay}
      </span>
      {showUpgrade && (
        <button
          type="button"
          onClick={onUpgrade}
          className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--blue-accent)] text-white font-bold text-[9px] tracking-[0.05em] hover:bg-[var(--blue-accent-deep)] cursor-pointer border-0"
        >
          {uiLang === 'zh' ? '升级 Pro' : 'Upgrade'}
        </button>
      )}
    </span>
  );
}
