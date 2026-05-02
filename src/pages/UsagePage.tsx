/**
 * UsagePage —— 用户用量独立页面（不再藏在个人中心里）。
 *
 * 现状：用量信息原本散在两处——每个 tab 标题旁有小绿点+数字，个人中心
 * 深处藏着一个 admin-only 的 dashboard。普通用户想知道"我今天还能翻
 * 多少次"得自己一个个 tab 切过去看，体验差。
 *
 * 修后：顶部 Gauge 图标点开就到这页面，5 张大卡（翻译/课堂同传/语法/
 * 梗百科/AI 问答）一目了然，免费用户底部一个升级 CTA。
 *
 * 不修后果：免费用户对配额无感知，频繁撞限被弹"限额已用完"的时候才
 * 发现，体验割裂——他们想"主动看一眼"的入口本来就没有。
 *
 * 设计语言：沿用 glass-thick / glass-chip 容器、Clash Display 标题、
 * font-zh-sans 正文，跟现有页面 (TranslateTab / Profile / Leaderboard)
 * 完全一致。撞限快的卡（pctDay >=70%）置顶。同传连接 (live-token) 桶
 * 是纯防滥用的限速，对用户无意义，**不显示**。
 */

import { useUsage, BUCKET_LIMITS, BUCKET_LABELS_ZH, BUCKET_LABELS_EN, type BucketName } from '../hooks/useUsage';

interface UsagePageProps {
  isPro?: boolean;
  uiLang?: 'zh' | 'en';
  /** 免费用户点底部 CTA 时打开 Pro 升级弹窗 */
  onUpgrade?: () => void;
}

// 跟 0.3.4 的 UsageBadge / UsageDashboard 保持同一套阈值——既然之前用户
// 已经熟悉了"绿/黄/红"的语义，这里不要换。
function pctToColor(pct: number): { bar: string; text: string; chip: string } {
  if (pct >= 0.9) {
    return { bar: 'var(--red-warn)', text: 'var(--red-warn)', chip: 'rgba(229,56,43,0.1)' };
  }
  if (pct >= 0.7) {
    return { bar: '#E8C375', text: '#9C7A1A', chip: 'rgba(232,195,117,0.18)' };
  }
  return { bar: 'var(--green-ok)', text: 'var(--green-ok)', chip: 'rgba(47,99,23,0.1)' };
}

// 按"今天还能用 X 次"的视角写一句大白话——比"412/500"更易懂。
function describeRemaining(used: number, cap: number, uiLang: 'zh' | 'en'): string {
  if (cap === Infinity) {
    return uiLang === 'zh' ? '今天没有上限' : 'No daily limit';
  }
  const remaining = Math.max(0, cap - used);
  if (remaining === 0) {
    return uiLang === 'zh' ? '今天已经用完了' : 'You have hit today’s limit';
  }
  return uiLang === 'zh'
    ? `今天还能用 ${remaining} 次`
    : `${remaining} uses left today`;
}

// 用量页面的展示顺序（不含 live-token）。撞限快的会被置顶覆盖这个默认序。
const BUCKET_ORDER: BucketName[] = ['translate', 'classroom', 'grammar', 'slang', 'chat'];

export default function UsagePage({ isPro = false, uiLang = 'zh', onUpgrade }: UsagePageProps) {
  const { byBucket, loading } = useUsage(isPro);

  // 排序逻辑：>=70% 的卡置顶（撞限的人想第一时间看到），剩下按默认序。
  const sortedBuckets = [...BUCKET_ORDER].sort((a, b) => {
    const pa = byBucket[a]?.pctDay ?? 0;
    const pb = byBucket[b]?.pctDay ?? 0;
    const aHot = pa >= 0.7;
    const bHot = pb >= 0.7;
    if (aHot && !bHot) return -1;
    if (!aHot && bHot) return 1;
    if (aHot && bHot) return pb - pa; // 都热，更红的更靠前
    return BUCKET_ORDER.indexOf(a) - BUCKET_ORDER.indexOf(b);
  });

  const today = new Date().toLocaleDateString(uiLang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div translate="no" className="notranslate">
      {/* ============ 标题区 ============ */}
      <div className="mb-6 sm:mb-8">
        <h1
          className="m-0 mb-2"
          style={{
            fontFamily: '"Clash Display", system-ui, sans-serif',
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: '-0.02em',
            color: 'var(--ink)',
          }}
        >
          {uiLang === 'zh' ? '今日用量' : 'Today’s Usage'}
        </h1>
        <p
          className="font-zh-sans m-0"
          style={{ fontSize: 13, color: 'var(--ink-muted)', letterSpacing: '0.01em' }}
        >
          {uiLang === 'zh'
            ? `${today} · 每天凌晨 12 点重置`
            : `${today} · Resets at midnight`}
        </p>
      </div>

      {/* ============ 卡片网格 ============ */}
      {loading ? (
        <div
          className="glass-thick text-center"
          style={{ borderRadius: 24, padding: '40px 28px', color: 'var(--ink-muted)' }}
        >
          <span className="font-zh-sans" style={{ fontSize: 14 }}>
            {uiLang === 'zh' ? '正在加载用量数据……' : 'Loading usage data…'}
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {sortedBuckets.map((bucket) => {
            const usage = byBucket[bucket];
            if (!usage) return null;

            const labelZh = BUCKET_LABELS_ZH[bucket];
            const labelEn = BUCKET_LABELS_EN[bucket];
            const isInfinite = usage.capDay === Infinity;
            const pct = isInfinite ? 0 : usage.pctDay;
            const colors = pctToColor(pct);
            const pctLabel = isInfinite ? '∞' : `${Math.round(pct * 100)}%`;

            const primaryLabel = uiLang === 'zh' ? labelZh : labelEn;
            const secondaryLabel = uiLang === 'zh' ? labelEn : labelZh;
            const proCap = BUCKET_LIMITS[bucket].perDay.pro;

            return (
              <div
                key={bucket}
                className="glass-thick"
                style={{
                  borderRadius: 20,
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  minHeight: 160,
                }}
              >
                {/* 第一行：功能名 + 百分比小 chip */}
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className="font-zh-sans"
                      style={{
                        fontWeight: 600,
                        fontSize: 15,
                        color: 'var(--ink)',
                        letterSpacing: '0.01em',
                      }}
                    >
                      {primaryLabel}
                    </div>
                    <div
                      className="font-mono-meta uppercase"
                      style={{
                        fontSize: 9.5,
                        letterSpacing: '0.12em',
                        color: 'var(--ink-muted)',
                        marginTop: 2,
                      }}
                    >
                      {secondaryLabel}
                    </div>
                  </div>
                  <span
                    className="font-mono-meta tabular-nums"
                    style={{
                      fontSize: 10,
                      padding: '3px 9px',
                      borderRadius: 9999,
                      background: colors.chip,
                      color: colors.text,
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      flexShrink: 0,
                    }}
                  >
                    {pctLabel}
                  </span>
                </div>

                {/* 大数字 */}
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="tabular-nums"
                    style={{
                      fontFamily: '"Clash Display", system-ui, sans-serif',
                      fontWeight: 700,
                      fontSize: 30,
                      color: 'var(--ink)',
                      letterSpacing: '-0.02em',
                      lineHeight: 1,
                    }}
                  >
                    {usage.usedDay}
                  </span>
                  <span
                    className="font-mono-meta tabular-nums"
                    style={{ fontSize: 13, color: 'var(--ink-muted)' }}
                  >
                    / {isInfinite ? '∞' : usage.capDay}
                  </span>
                </div>

                {/* 进度条 */}
                {isInfinite ? (
                  <div
                    style={{
                      height: 6,
                      borderRadius: 9999,
                      background: 'rgba(10,14,26,0.06)',
                      backgroundImage:
                        'repeating-linear-gradient(90deg, rgba(10,14,26,0.18) 0 4px, transparent 4px 10px)',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      height: 6,
                      borderRadius: 9999,
                      background: 'rgba(10,14,26,0.06)',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.max(2, Math.round(pct * 100))}%`,
                        background: colors.bar,
                        borderRadius: 9999,
                        transition: 'width 0.4s ease, background 0.3s ease',
                      }}
                    />
                  </div>
                )}

                {/* 大白话剩余次数 + Pro 上限提示 */}
                <div className="flex flex-col gap-1">
                  <span
                    className="font-zh-sans"
                    style={{ fontSize: 12, color: 'var(--ink-body)', fontWeight: 500 }}
                  >
                    {describeRemaining(usage.usedDay, usage.capDay, uiLang)}
                  </span>
                  {!isPro && proCap !== Infinity && proCap > usage.capDay && (
                    <span
                      className="font-zh-sans"
                      style={{
                        fontSize: 11,
                        color: 'var(--ink-subtle)',
                        letterSpacing: '0.01em',
                      }}
                    >
                      {uiLang === 'zh'
                        ? `Pro 用户每天 ${proCap} 次`
                        : `Pro members get ${proCap}/day`}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ============ 底部 CTA ============ */}
      {!loading && (
        <div className="mt-6 sm:mt-8">
          {!isPro ? (
            <button
              type="button"
              onClick={onUpgrade}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 transition-all hover:translate-y-[-1px] active:translate-y-0"
              style={{
                background: 'var(--ink)',
                color: '#FFFFFF',
                padding: '14px 28px',
                borderRadius: 14,
                fontFamily: '"Clash Display", system-ui, sans-serif',
                fontWeight: 600,
                fontSize: 14,
                letterSpacing: '0.02em',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(10,14,26,0.18)',
              }}
            >
              {uiLang === 'zh'
                ? '升级 Pro · 翻译翻 6 倍 · 课堂同传翻 6 倍'
                : 'Upgrade to Pro · 6× translate · 6× classroom'}
            </button>
          ) : (
            <div
              className="font-zh-sans inline-flex items-center gap-2"
              style={{
                padding: '10px 18px',
                borderRadius: 9999,
                background: 'rgba(91,127,232,0.08)',
                color: 'var(--blue-accent-deep, #3B5BC4)',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.01em',
              }}
            >
              {uiLang === 'zh' ? '已是 Pro · 限额已升级' : 'Pro member · limits upgraded'}
            </div>
          )}
        </div>
      )}

      {/* 小字脚注：解释数据延迟（避免用户截图说"我用了但没记上"） */}
      <p
        className="font-zh-sans mt-6"
        style={{ fontSize: 11, color: 'var(--ink-subtle)', letterSpacing: '0.01em' }}
      >
        {uiLang === 'zh'
          ? '数据每 10 秒同步一次。刚用完的功能可能要等几秒才看到数字变化。'
          : 'Data syncs every 10 s. Recent calls may take a few seconds to reflect.'}
      </p>
    </div>
  );
}
