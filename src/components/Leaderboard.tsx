import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { Trophy, Crown, Loader2 } from 'lucide-react';

/**
 * Leaderboard — redesigned 2026-04-21.
 *
 * Layout changes (driven by user feedback: "good looking but blurry"):
 *   - Hero is ONE glass-thick card. Podium (top 3) lives inside it with a
 *     blue-accented #1 slot, smaller #2/#3 slots beside it, and a big
 *     italic rank-number ghost-watermark behind each avatar.
 *   - Reward strip: solid white pill with a 3px blue left bar, mono label,
 *     body copy in Noto Sans SC 500 for legibility.
 *   - Table below: solid white surface + hairline rules + mono header.
 *     No glass, no tiny grey text. The user "ME" row gets a blue wash and
 *     3px blue left stroke — unmistakable.
 *
 * Data model unchanged. Same props: defaultTab / currentUserId / uiLang /
 * onUserClick. Still snapshots `users` collection ordered by
 * approvedSlangCount desc, renders group/global/monthly tabs.
 */

type TabId = 'group' | 'global' | 'monthly';

// Badge id → 身份 title 映射（和 UserProfile 的 ACHIEVEMENTS 保持一致）。
// 从 userProfile.equippedBadge 派生 displayTitle，不需要新 Firestore 字段、
// 不改 security rules — 原型里"梗百科编辑 / 多模态先锋"这种身份文案就是靠
// 装备的成就名显示的。没装备就 fallback 到"梗新人"。
const BADGE_TITLE: Record<string, { zh: string; en: string }> = {
  apprentice: { zh: '梗学徒', en: 'Apprentice' },
  observer: { zh: '文化观察员', en: 'Observer' },
  streak7: { zh: '周打卡达人', en: 'Streak master' },
  multimedia: { zh: '多模态先锋', en: 'Media pioneer' },
  expert: { zh: '梗百科编辑', en: 'Slang editor' },
  legend: { zh: '梗神', en: 'Legend' },
};

interface LbUser {
  id: string;
  username: string;
  displayTitle: string;  // 从 equippedBadge 派生，显示在 podium / table 里
  weeklyScore: number;
  weeklyCount: number;
  totalScore: number;
  totalCount: number;
  avgQuality: number;
  monthlyCount: number;
  trend: number;
}

export default function Leaderboard({
  defaultTab = 'group',
  currentUserId,
  uiLang = 'zh',
  onUserClick,
}: {
  defaultTab?: TabId;
  currentUserId: string;
  uiLang?: 'en' | 'zh';
  groupId?: string;
  onUserClick?: (uid: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);
  const [groupData, setGroupData] = useState<LbUser[]>([]);
  const [globalData, setGlobalData] = useState<LbUser[]>([]);
  const [monthlyData, setMonthlyData] = useState<LbUser[]>([]);
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nextSunday = new Date();
      nextSunday.setDate(now.getDate() + (7 - now.getDay()));
      nextSunday.setHours(23, 59, 59, 999);
      const diff = nextSunday.getTime() - now.getTime();
      setTimeLeft({
        d: Math.floor(diff / (1000 * 60 * 60 * 24)),
        h: Math.floor((diff / (1000 * 60 * 60)) % 24),
        m: Math.floor((diff / 1000 / 60) % 60),
      });
    };
    tick();
    const timer = setInterval(tick, 60000);
    return () => clearInterval(timer);
  }, [uiLang]);

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, 'users'), orderBy('approvedSlangCount', 'desc'), limit(20));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const users: LbUser[] = snap.docs
          .filter((d) => {
            const data = d.data();
            const isReal = data.displayName && data.displayName !== 'Anonymous';
            return (isReal || d.id === currentUserId) && (data.approvedSlangCount || 0) > 0;
          })
          .map((d) => {
            const data = d.data();
            const badgeInfo = data.equippedBadge ? BADGE_TITLE[data.equippedBadge] : null;
            const displayTitle = badgeInfo
              ? (uiLang === 'zh' ? badgeInfo.zh : badgeInfo.en)
              : (uiLang === 'zh' ? '梗新人' : 'Newcomer');
            return {
              id: d.id,
              username:
                data.displayName ||
                (d.id === currentUserId
                  ? uiLang === 'zh'
                    ? '你'
                    : 'You'
                  : `${uiLang === 'zh' ? '用户' : 'User'} ${d.id.slice(0, 4)}`),
              displayTitle,
              weeklyScore: (data.approvedSlangCount || 0) * 10 + (data.currentStreak || 0) * 5,
              weeklyCount: data.approvedSlangCount || 0,
              totalScore: (data.approvedSlangCount || 0) * 10 + (data.reputationScore || 100),
              totalCount: data.approvedSlangCount || 0,
              avgQuality: data.reputationScore || 100,
              monthlyCount: data.approvedSlangCount || 0,
              trend: data.currentStreak > 0 ? data.currentStreak : 0,
            };
          });
        setGroupData(users.slice(0, 10));
        setGlobalData(users);
        setMonthlyData(users.slice(0, 5));
        setIsLoading(false);
      },
      () => setIsLoading(false),
    );
    return () => unsub();
  }, [currentUserId, uiLang]);

  const data = activeTab === 'group' ? groupData : activeTab === 'global' ? globalData : monthlyData;
  const scoreKey =
    activeTab === 'group' ? 'weeklyScore' : activeTab === 'global' ? 'totalScore' : 'monthlyCount';
  const top3 = data.slice(0, 3);
  const rest = data.slice(3);

  return (
    <div className="space-y-4">
      {/* HERO — glass card with title + tabs + countdown + podium */}
      <section className="glass-thick rounded-[20px] px-5 py-3.5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 pb-3 border-b border-[var(--ink-hairline)]">
          <div className="min-w-0 flex-1">
            <h1 className="t-h1 !text-[22px] sm:!text-[24px] !mb-1">
              {uiLang === 'zh' ? '贡献者排行榜' : 'Contributors'}
            </h1>
            {/* Scoring rules — collapsed by default to save vertical space.
                Users who care can expand; first-time scanners aren't forced
                to read a math formula before seeing the leaderboard itself. */}
            <details className="group mt-0.5">
              <summary className="list-none cursor-pointer inline-flex items-center gap-1 text-[12px] font-zh-sans text-[var(--ink-muted)] hover:text-[var(--ink-body)] transition-colors">
                <span>{uiLang === 'zh' ? '积分规则' : 'Scoring rules'}</span>
                <svg className="w-3 h-3 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </summary>
              <p className="mt-1.5 text-[12.5px] font-zh-sans text-[var(--ink-body)] leading-relaxed">
                {uiLang === 'zh'
                  ? '分数 = 批准词条数 × 10 + 连击天数 × 5 · 每 5 分钟刷新 · 周日 23:59 结算'
                  : 'Score = approved × 10 + streak × 5 · refreshed every 5 min · resets Sun 23:59'}
              </p>
            </details>
            <div className="mt-2 inline-flex p-[3px] gap-[2px] bg-[rgba(10,14,26,0.06)] rounded-[11px]">
              {(['group', 'global', 'monthly'] as const).map((id) => {
                const on = activeTab === id;
                const label =
                  id === 'group'
                    ? uiLang === 'zh'
                      ? '小组'
                      : 'Weekly'
                    : id === 'global'
                      ? uiLang === 'zh'
                        ? '全球'
                        : 'Global'
                      : uiLang === 'zh'
                        ? '月榜'
                        : 'Monthly';
                return (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`px-3 py-1.5 rounded-[9px] text-[12.5px] font-zh-sans font-semibold transition-colors ${
                      on
                        ? 'bg-white text-[var(--ink)] font-bold shadow-[0_1.5px_4px_rgba(10,14,26,0.08)]'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink-body)]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sm:text-right shrink-0">
            <div className="font-mono-meta text-[10px] uppercase tracking-[0.18em] text-[var(--ink-subtle)] mb-1">
              {uiLang === 'zh' ? '本周结算倒计时' : 'Resets in'}
            </div>
            <div className="font-mono-meta text-[18px] font-semibold text-[var(--ink)] tracking-[0.04em] leading-none">
              {String(timeLeft.d).padStart(2, '0')}
              <span className="text-[var(--ink-muted)] font-normal">d</span> {String(timeLeft.h).padStart(2, '0')}
              <span className="text-[var(--ink-muted)] font-normal">h</span> {String(timeLeft.m).padStart(2, '0')}
              <span className="text-[var(--ink-muted)] font-normal">m</span>
            </div>
            <div className="font-zh-sans text-[10.5px] text-[var(--ink-muted)] mt-1">
              {uiLang === 'zh' ? '周日 23:59 自动发奖' : 'Sun 23:59 auto'}
            </div>
          </div>
        </div>

        {/* PODIUM — only on the group (weekly) view; other tabs start with the table directly */}
        {activeTab === 'group' && top3.length > 0 && (
          <div className="pt-4 grid grid-cols-1 sm:grid-cols-[1fr_1.15fr_1fr] gap-3 items-end">
            {/* #2 — smaller, translateY */}
            {top3[1] && (
              <PodiumSlot
                user={top3[1]}
                rank={2}
                score={top3[1][scoreKey as keyof LbUser] as number}
                uiLang={uiLang}
                onClick={() => onUserClick?.(top3[1].id)}
              />
            )}
            {/* #1 — hero slot */}
            {top3[0] && (
              <PodiumSlot
                user={top3[0]}
                rank={1}
                score={top3[0][scoreKey as keyof LbUser] as number}
                uiLang={uiLang}
                onClick={() => onUserClick?.(top3[0].id)}
              />
            )}
            {/* #3 — smaller */}
            {top3[2] && (
              <PodiumSlot
                user={top3[2]}
                rank={3}
                score={top3[2][scoreKey as keyof LbUser] as number}
                uiLang={uiLang}
                onClick={() => onUserClick?.(top3[2].id)}
              />
            )}
          </div>
        )}
      </section>

      {/* REWARD strip — only for the weekly tab */}
      {activeTab === 'group' && (
        <div className="surface flex items-center gap-4 px-5 py-4 !rounded-[14px] border-l-[3px] border-l-[var(--blue-accent)]">
          <span className="font-mono-meta text-[10.5px] font-bold tracking-[0.2em] uppercase text-[var(--blue-accent)] shrink-0">
            {uiLang === 'zh' ? 'Top 1 奖励' : 'Top 1 Reward'}
          </span>
          <span className="w-px h-5 bg-[var(--ink-hairline)] shrink-0" />
          <span className="t-info">
            {uiLang === 'zh' ? (
              <>
                <strong>本周梗王</strong> 称号 · <strong>100 次</strong> 翻译额度 · 个人资料金边框 <strong>7 天</strong>
              </>
            ) : (
              <>
                <strong>Weekly Champion</strong> title · <strong>100</strong> translations · <strong>7-day</strong> profile glow
              </>
            )}
          </span>
        </div>
      )}

      {/* RANK TABLE */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-[rgba(91,127,232,0.6)]" />
        </div>
      ) : data.length === 0 ? (
        <div className="surface text-center py-12 px-6">
          <Trophy className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="t-body">
            {uiLang === 'zh' ? '还没有排行数据，去梗百科贡献吧！' : 'No leaderboard data yet. Start contributing!'}
          </p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="surface overflow-hidden"
          >
            <div className="grid grid-cols-[56px_1fr_140px_80px] sm:grid-cols-[64px_1fr_160px_90px] gap-3 px-5 py-3.5 bg-[rgba(10,14,26,0.04)] border-b border-[var(--ink-rule)]">
              <span className="t-mono-strong text-center">{uiLang === 'zh' ? '排名' : 'Rank'}</span>
              <span className="t-mono-strong">{uiLang === 'zh' ? '贡献者' : 'Contributor'}</span>
              <span className="t-mono-strong text-right">{uiLang === 'zh' ? '分数' : 'Score'}</span>
              <span className="t-mono-strong text-right">Δ</span>
            </div>

            {(activeTab === 'group' ? rest : data).map((user, i) => {
              const absoluteRank = activeTab === 'group' ? i + 4 : i + 1;
              const isMe = user.id === currentUserId;
              const scoreVal = user[scoreKey as keyof LbUser] as number;
              const countLabel =
                activeTab === 'group'
                  ? `${user.weeklyCount} ${uiLang === 'zh' ? '词条' : 'entries'}`
                  : activeTab === 'global'
                    ? `${user.totalCount} ${uiLang === 'zh' ? '累计' : 'total'}`
                    : `${user.monthlyCount} ${uiLang === 'zh' ? '本月' : 'this mo'}`;
              return (
                <button
                  key={user.id}
                  onClick={() => onUserClick?.(user.id)}
                  className={`w-full text-left grid grid-cols-[56px_1fr_140px_80px] sm:grid-cols-[64px_1fr_160px_90px] gap-3 px-5 py-3.5 items-center border-b border-[var(--ink-hairline)] last:border-b-0 transition-colors ${
                    isMe
                      ? 'bg-[rgba(91,127,232,0.08)] border-l-[3px] border-l-[var(--blue-accent)] pl-[17px] hover:bg-[rgba(91,127,232,0.12)]'
                      : 'hover:bg-[rgba(91,127,232,0.04)]'
                  }`}
                >
                  <span
                    className={`text-center font-display italic font-bold text-[22px] leading-none tracking-[-0.03em] ${
                      isMe ? 'text-[var(--blue-accent)]' : 'text-[var(--ink-soft)]'
                    }`}
                  >
                    {String(absoluteRank).padStart(2, '0')}
                  </span>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-9 h-9 rounded-full bg-gradient-to-br from-[#89A3F0] to-[#5B7FE8] text-white font-display font-bold text-[13px] inline-flex items-center justify-center shrink-0">
                      {user.username.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="font-zh-serif font-bold text-[14.5px] text-[var(--ink)] truncate">
                        {user.username}
                        {isMe && (
                          <span className="ml-2 align-middle font-mono-meta font-extrabold text-[9px] tracking-[0.15em] text-[var(--blue-accent)] bg-[rgba(91,127,232,0.15)] px-1.5 py-[2px] rounded-[4px]">
                            ME
                          </span>
                        )}
                      </div>
                      <div className="font-zh-sans font-medium text-[12px] text-[var(--ink-body)] mt-0.5 truncate">
                        {user.displayTitle}
                        {user.trend > 0 && (
                          <span className="ml-1.5 text-[var(--ink-muted)]">· {user.trend} {uiLang === 'zh' ? '天连击' : 'day streak'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-display font-bold text-[18px] leading-none tracking-[-0.02em] text-[var(--ink)]">
                      {scoreVal.toLocaleString()}
                    </div>
                    <div className="font-mono-meta text-[11px] font-semibold text-[var(--ink-soft)] mt-1">
                      {user.totalCount} {uiLang === 'zh' ? '贡献' : 'contribs'}
                    </div>
                  </div>
                  <div
                    className={`text-right font-mono-meta text-[13px] font-bold ${
                      user.trend > 0
                        ? 'text-[var(--green-ok)]'
                        : user.trend < 0
                          ? 'text-[var(--red-warn)]'
                          : 'text-[var(--ink-subtle)]'
                    }`}
                  >
                    {user.trend > 0 ? `+${user.trend}` : user.trend < 0 ? user.trend : '—'}
                  </div>
                </button>
              );
            })}

            <div className="px-5 py-3.5 bg-[rgba(10,14,26,0.025)] border-t border-[var(--ink-rule)] flex justify-between items-center flex-wrap gap-2">
              <span className="font-zh-sans font-medium text-[12.5px] text-[var(--ink-body)]">
                {uiLang === 'zh' ? '榜单每 5 分钟刷新一次' : 'Refreshed every 5 minutes'}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

/** Top-3 podium slot. #1 is elevated & blue-accented; #2/#3 are smaller */
function PodiumSlot({
  user,
  rank,
  score,
  uiLang,
  onClick,
}: {
  user: LbUser;
  rank: 1 | 2 | 3;
  score: number;
  uiLang: 'en' | 'zh';
  onClick: () => void;
}) {
  const isHero = rank === 1;
  return (
    <button
      onClick={onClick}
      className={`relative text-center rounded-[16px] transition-transform hover:-translate-y-0.5 ${
        isHero
          ? 'bg-gradient-to-b from-[rgba(91,127,232,0.08)] to-white border-[2px] border-[var(--blue-accent)] shadow-[0_14px_32px_rgba(91,127,232,0.22)] px-4 py-5'
          : 'bg-white border border-[var(--border-solid)] px-4 py-4'
      } ${rank === 2 ? 'translate-y-2.5' : rank === 3 ? 'translate-y-[18px]' : ''}`}
    >
      {/* Ghost rank number watermark */}
      <span
        className={`absolute top-3 right-3.5 font-display italic font-bold leading-none tracking-[-0.05em] pointer-events-none select-none ${
          isHero ? 'text-[58px] text-[rgba(91,127,232,0.18)]' : 'text-[46px] text-[rgba(10,14,26,0.16)]'
        }`}
      >
        {String(rank).padStart(2, '0')}
      </span>

      {/* Crown only on #1 */}
      {isHero && (
        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[var(--blue-accent)] text-white inline-flex items-center justify-center shadow-[0_4px_10px_rgba(91,127,232,0.4)]">
          <Crown className="w-4 h-4" />
        </span>
      )}

      <div
        className={`mx-auto rounded-full bg-gradient-to-br from-[#89A3F0] to-[#5B7FE8] text-white font-display font-bold inline-flex items-center justify-center mb-2.5 ${
          isHero ? 'w-[62px] h-[62px] text-[22px]' : 'w-[50px] h-[50px] text-[18px]'
        }`}
      >
        {user.username.charAt(0).toUpperCase()}
      </div>
      <div className={`font-zh-serif font-bold text-[var(--ink)] ${isHero ? 'text-[17px]' : 'text-[15px]'}`}>
        {user.username}
      </div>
      <div
        className={`font-zh-sans font-medium text-[12.5px] tracking-[0.02em] mt-0.5 mb-2.5 ${
          isHero ? 'text-[var(--blue-accent)] font-semibold' : 'text-[var(--ink-body)]'
        }`}
      >
        {user.displayTitle}
      </div>
      <div
        className={`font-display font-bold leading-none tracking-[-0.02em] ${
          isHero ? 'text-[32px] text-[var(--blue-accent)]' : 'text-[24px] text-[var(--ink)]'
        }`}
      >
        {score.toLocaleString()}
      </div>
      <div className="font-mono-meta text-[10.5px] font-bold tracking-[0.2em] uppercase text-[var(--ink-soft)] mt-1.5">
        {uiLang === 'zh' ? '分数' : 'score'}
      </div>
    </button>
  );
}
