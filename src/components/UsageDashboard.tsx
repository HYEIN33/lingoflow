/**
 * UsageDashboard — admin-only 用量总览看板。
 *
 * 现状：每个 Tab 顶部已有 UsageBadge（小绿点 + 数字），但没有一个集中
 * 视图能让 admin 一眼看完所有 bucket 的健康度。这个组件就是那个集中视图。
 *
 * 修后：admin 进个人中心能看到 6 张 bucket 卡片（横向 grid，移动端 1 列），
 * 每张显示中文名 + 英文名、今日用量 / 上限、进度条、这分钟用量。颜色按
 * pctDay 切换：>=0.9 红 / >=0.7 黄 / 其他绿——跟 UsageBadge 一致。
 *
 * 不修后果：admin 在用户撞限时只能逐 Tab 切过去看，不能快速判断哪个
 * bucket 最危险，也无法在调容量前看到全局健康度。
 *
 * 数据来源：useUsage hook（_rate_limits/{uid} doc，10s 内有延迟）。
 * live-token bucket 的日上限是 Infinity，显示 ∞ 不画进度条。
 */

import { useUsage, BUCKET_LIMITS, BUCKET_LABELS_ZH, BUCKET_LABELS_EN, type BucketName } from '../hooks/useUsage';

interface UsageDashboardProps {
  isPro?: boolean;
  uiLang?: 'zh' | 'en';
}

// 按 pct 选颜色——跟 UsageBadge 同步：>=0.9 红、>=0.7 黄、其他绿
function pctToColor(pct: number): { bar: string; text: string; chip: string } {
  if (pct >= 0.9) {
    return {
      bar: 'var(--red-warn)',
      text: 'var(--red-warn)',
      chip: 'rgba(229,56,43,0.1)',
    };
  }
  if (pct >= 0.7) {
    return {
      bar: '#E8C375',
      text: '#9C7A1A',
      chip: 'rgba(232,195,117,0.18)',
    };
  }
  return {
    bar: 'var(--green-ok)',
    text: 'var(--green-ok)',
    chip: 'rgba(47,99,23,0.1)',
  };
}

export default function UsageDashboard({ isPro = false, uiLang = 'zh' }: UsageDashboardProps) {
  const { byBucket, worstPctDay, loading } = useUsage(isPro);

  // 整体健康度——取 worstPctDay 决定标题旁边的小色点
  const overall = pctToColor(worstPctDay);
  const overallPctLabel = `${Math.round(worstPctDay * 100)}%`;

  const bucketNames = Object.keys(BUCKET_LIMITS) as BucketName[];

  return (
    <div className="glass-thick" style={{ borderRadius: 24, padding: '24px 28px', overflow: 'hidden' }}>
      {/* ============ 标题行 ============ */}
      <div className="flex items-baseline justify-between flex-wrap gap-x-3 gap-y-1 mb-[18px]">
        <h3
          className="m-0 inline-flex items-center gap-2 whitespace-nowrap"
          style={{
            fontFamily: '"Clash Display", system-ui, sans-serif',
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 16,
            color: 'var(--ink)',
          }}
        >
          {uiLang === 'zh' ? '今日用量 · Today’s Usage' : 'Today’s Usage · 今日用量'}
        </h3>
        {/* 整体健康度 chip — 小色点 + 百分比，admin 一眼判断要不要扩容 */}
        {!loading && (
          <span
            className="inline-flex items-center gap-1.5 font-mono-meta uppercase tracking-wider"
            style={{
              fontSize: 10,
              padding: '4px 10px',
              borderRadius: 9999,
              background: overall.chip,
              color: overall.text,
              fontWeight: 600,
            }}
          >
            <span
              className="rounded-full"
              style={{ width: 6, height: 6, background: overall.bar }}
            />
            <span className="tabular-nums">{overallPctLabel}</span>
            <span style={{ opacity: 0.65 }}>{uiLang === 'zh' ? 'peak' : 'peak'}</span>
          </span>
        )}
      </div>

      {/* ============ 6 张卡片 ============ */}
      {loading ? (
        <div
          className="font-zh-sans text-sm py-6 text-center"
          style={{ color: 'var(--ink-muted)' }}
        >
          {uiLang === 'zh' ? '正在加载用量数据……' : 'Loading usage data…'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {bucketNames.map((bucket) => {
            const usage = byBucket[bucket];
            if (!usage) return null;

            const labelZh = BUCKET_LABELS_ZH[bucket];
            const labelEn = BUCKET_LABELS_EN[bucket];
            const isInfinite = usage.capDay === Infinity;
            const pct = isInfinite ? 0 : usage.pctDay;
            const colors = pctToColor(pct);
            const pctLabel = isInfinite ? '∞' : `${Math.round(pct * 100)}%`;

            // primary / secondary 标签按 uiLang 决定哪个在前
            const primaryLabel = uiLang === 'zh' ? labelZh : labelEn;
            const secondaryLabel = uiLang === 'zh' ? labelEn : labelZh;

            return (
              <div
                key={bucket}
                className="glass-chip"
                style={{
                  borderRadius: 16,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {/* 标签行：中文名 + 英文名 + pct chip */}
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className="font-zh-sans truncate"
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: 'var(--ink)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {primaryLabel}
                    </div>
                    <div
                      className="font-mono-meta uppercase truncate"
                      style={{
                        fontSize: 9,
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
                      padding: '2px 8px',
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

                {/* 大数字行：今日用量 / 上限 */}
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="tabular-nums"
                    style={{
                      fontFamily: '"Clash Display", system-ui, sans-serif',
                      fontWeight: 700,
                      fontSize: 26,
                      color: 'var(--ink)',
                      letterSpacing: '-0.02em',
                      lineHeight: 1,
                    }}
                  >
                    {usage.usedDay}
                  </span>
                  <span
                    className="font-mono-meta tabular-nums"
                    style={{
                      fontSize: 12,
                      color: 'var(--ink-muted)',
                    }}
                  >
                    / {isInfinite ? '∞' : usage.capDay}
                  </span>
                </div>

                {/* 横向进度条 — 无限额 bucket 显示一条灰色虚线占位 */}
                {isInfinite ? (
                  <div
                    style={{
                      height: 6,
                      borderRadius: 9999,
                      background: 'rgba(10,14,26,0.06)',
                      backgroundImage: 'repeating-linear-gradient(90deg, rgba(10,14,26,0.18) 0 4px, transparent 4px 10px)',
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

                {/* 小字：这分钟用量 */}
                <div
                  className="font-mono-meta uppercase tabular-nums flex items-center gap-1.5"
                  style={{
                    fontSize: 9.5,
                    letterSpacing: '0.1em',
                    color: 'var(--ink-muted)',
                  }}
                >
                  <span style={{ opacity: 0.7 }}>
                    {uiLang === 'zh' ? '这分钟' : 'this minute'}
                  </span>
                  <span style={{ color: 'var(--ink-body)', fontWeight: 600 }}>
                    {usage.usedMinute}/{usage.capMinute === Infinity ? '∞' : usage.capMinute}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 注脚——admin 才看得到的小提示，说明数据有 10s 延迟 */}
      <div
        className="font-zh-sans mt-3"
        style={{ fontSize: 11, color: 'var(--ink-subtle)', letterSpacing: '0.02em' }}
      >
        {uiLang === 'zh'
          ? '数据来自 _rate_limits/{uid}，每 10 秒刷新一次（admin only）'
          : 'Sourced from _rate_limits/{uid}, refreshes every 10 s (admin only)'}
      </div>
    </div>
  );
}
