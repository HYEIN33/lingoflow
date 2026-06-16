import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, orderBy, limit, serverTimestamp, onSnapshot, getDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Search, Plus, ThumbsUp, AlertCircle, Loader2, MessageSquare, Volume2, Image as ImageIcon, Video, Film, X, Mic, Wand2, Flag, Share2, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { validateSlangMeaning, generateSlangExample, suggestSlangMeaning } from '../services/ai';
import { useAudio } from '../hooks/useAudio';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { SlangGuidelinesPanel } from './SlangGuidelines';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Cloud Function 调用：用户自己不能写 reputationScore / approvedSlangCount 等
// 敏感字段（Firestore rules 拦截）。所有"贡献后副作用"都走这个 CF。
const syncContributionStatsFn = httpsCallable<
  { action: 'contribute_success' | 'contribute_violation'; violationLevel?: 'L1' | 'V1' | 'V2' | 'V3' },
  { success: boolean }
>(getFunctions(), 'syncContributionStats');
import { UserProfile } from '../App';
import { DailyChallenge } from './DailyChallenge';
import { markOnboardingStep } from './OnboardingChecklist';

interface Slang {
  id: string;
  term: string;
  createdAt: any;
}

interface SlangMeaning {
  id: string;
  slangId: string;
  meaning: string;
  example: string;
  authorId: string;
  authorName?: string;
  authorTitle?: string;
  qualityScore?: number;
  upvotes: number;
  status: 'pending' | 'approved' | 'rejected';
  voiceName?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'gif';
  userAudioUrl?: string;
  createdAt: any;
}

interface SlangComment {
  id: string;
  slangId: string;
  meaningId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: any;
}

function relativeTime(date: Date, lang: 'en' | 'zh'): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return lang === 'zh' ? '刚刚' : 'just now';
  if (diffMin < 60) return lang === 'zh' ? `${diffMin}分钟前` : `${diffMin}m ago`;
  if (diffHr < 24) return lang === 'zh' ? `${diffHr}小时前` : `${diffHr}h ago`;
  return lang === 'zh' ? `${diffDay}天前` : `${diffDay}d ago`;
}

function CommentSection({ slangId, meaningId, uiLang, onCountChange }: { slangId: string; meaningId: string; uiLang: 'en' | 'zh'; onCountChange?: (n: number) => void }) {
  const [comments, setComments] = useState<SlangComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, 'slang_comments'),
      where('meaningId', '==', meaningId),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as SlangComment));
      setComments(list);
      // 把评论数上送给父组件，用来在 meaning-card 顶部显示社区信号。
      // 复用现有订阅，不新增 Firestore 查询。
      onCountChange?.(list.length);
    });
    return () => unsub();
  }, [meaningId, onCountChange]);

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !auth.currentUser) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'slang_comments'), {
        slangId,
        meaningId,
        authorId: auth.currentUser.uid,
        authorName: auth.currentUser.displayName || 'Anonymous',
        text: commentText.trim(),
        createdAt: serverTimestamp(),
      });
      setCommentText('');
    } catch (err) {
      console.error('Error submitting comment:', err);
      toast.error(uiLang === 'zh' ? '评论发送失败' : 'Failed to send comment');
      Sentry.captureException(err, { tags: { component: 'SlangDictionary', op: 'firestore.write', collection: 'slang_comments' } });
    } finally {
      setIsSubmitting(false);
    }
  };

  const visibleComments = showAll ? comments : comments.slice(0, 5);

  return (
    <div className="mt-3 pt-3 border-t border-[var(--ink-hairline)]">
      <p className="font-mono-meta text-[11px] tracking-[0.18em] uppercase text-[var(--ink-soft)] font-bold mb-2">
        {uiLang === 'zh' ? `评论 (${comments.length})` : `Comments (${comments.length})`}
      </p>
      {visibleComments.map((c) => (
        <div key={c.id} className="flex gap-2 mb-2">
          <div className="w-[22px] h-[22px] bg-[rgba(10,14,26,0.05)] rounded-full flex items-center justify-center text-[10px] font-bold text-[var(--ink-muted)] shrink-0 mt-0.5">
            {c.authorName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-[var(--ink-body)]">{c.authorName}</span>
              <span className="font-mono-meta text-[10px] text-[var(--ink-muted)]">
                {c.createdAt?.toDate ? relativeTime(c.createdAt.toDate(), uiLang) : ''}
              </span>
            </div>
            <p className="font-zh-serif text-[13px] leading-[1.75] text-[var(--ink-body)]">{c.text}</p>
          </div>
        </div>
      ))}
      {comments.length > 5 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="text-xs text-[#5B7FE8] hover:text-[#5B7FE8] font-medium flex items-center gap-0.5 mb-2"
        >
          <ChevronDown className="w-3 h-3" />
          {uiLang === 'zh' ? `查看更多 (${comments.length - 5})` : `Show more (${comments.length - 5})`}
        </button>
      )}
      {auth.currentUser && (
        <div className="flex gap-2 mt-1">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitComment(); }}
            placeholder={uiLang === 'zh' ? '写评论...' : 'Add a comment...'}
            className="flex-1 text-xs bg-gray-50 border border-[var(--ink-hairline)] rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-[#5B7FE8]/50"
          />
          <button
            onClick={handleSubmitComment}
            disabled={!commentText.trim() || isSubmitting}
            className="p-1.5 bg-[#0A0E1A] text-white rounded-lg hover:bg-[#1a2440] disabled:opacity-40 transition-colors"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

const REPORT_REASONS = [
  { value: 'duplicate', labelZh: '重复词条', labelEn: 'Duplicate entry' },
  { value: 'offensive', labelZh: '色情 / 歧视内容', labelEn: 'Offensive / discriminatory' },
  { value: 'inaccurate', labelZh: '释义不准确', labelEn: 'Inaccurate meaning' },
  { value: 'spam', labelZh: '恶意刷赞', labelEn: 'Vote manipulation / spam' },
  { value: 'other', labelZh: '其他', labelEn: 'Other' },
];

// 单条释义卡片 —— 性能重构（2026-06-16）：从父组件 meanings.map 里原样搬出，
// 包成 React.memo。父组件每次重渲染（搜索框打字、feed 30s 轮换、评论数回传、
// trending 刷新）以前都会把所有释义卡连同各自的 CommentSection（带 Firestore
// onSnapshot）整列重渲染；词条多时低端机明显卡。现在只有「这张卡自己的 props
// 真的变了」才重渲染。
// 纯结构提取：JSX、class、ARIA、点赞/举报/分享/朗读/评论逻辑全部原样，零业务改动。
// props 全是基础类型或父组件 useCallback 稳定化过的回调，保证 memo 真正生效。
interface MeaningCardProps {
  meaning: SlangMeaning;
  index: number;
  uiLang: 'en' | 'zh';
  currentSlangId: string;
  currentSlangTerm: string;
  commentCount: number;
  isUpvoted: boolean;
  isPlaying: boolean;
  isReporting: boolean;
  reportReason: string;
  onUpvote: (meaningId: string, currentUpvotes: number) => void;
  onToggleReport: (meaningId: string) => void;
  onReportReasonChange: (reason: string) => void;
  onReport: (meaningId: string) => void;
  onShare: (term: string, meaning: string) => void;
  onPlayAudio: (meaning: SlangMeaning) => void;
  onCommentCountChange: (meaningId: string, n: number) => void;
}

const MeaningCard = React.memo(function MeaningCard({
  meaning,
  index,
  uiLang,
  currentSlangId,
  currentSlangTerm,
  commentCount,
  isUpvoted,
  isPlaying,
  isReporting,
  reportReason,
  onUpvote,
  onToggleReport,
  onReportReasonChange,
  onReport,
  onShare,
  onPlayAudio,
  onCommentCountChange,
}: MeaningCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={index === 0
        ? "glass-thick p-6 hover:shadow-[0_6px_20px_rgba(10,14,26,0.1)] transition-shadow"
        : "surface p-6 !rounded-[18px] hover:shadow-[0_4px_14px_rgba(10,14,26,0.08)] transition-shadow"}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-[10px]">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-display font-semibold text-[13px] shrink-0 bg-gradient-to-br from-[#89A3F0] to-[#5B7FE8]">
            {meaning.authorName ? meaning.authorName.charAt(0).toUpperCase() : 'A'}
          </div>
          <div>
            <p className="font-zh-serif text-[14px] font-semibold text-[var(--ink)]">{meaning.authorName || 'Anonymous'}</p>
            {meaning.authorTitle && (
              <p className="font-display italic text-[11px] text-[var(--blue-accent)]">{meaning.authorTitle}</p>
            )}
          </div>
        </div>
        {meaning.qualityScore ? (
          (() => {
            const score = meaning.qualityScore as number;
            const tone =
              score >= 90
                ? 'bg-[rgba(47,99,23,0.12)] border border-[rgba(47,99,23,0.28)] text-[var(--green-ok)]'
                : score >= 70
                ? 'bg-[rgba(138,93,14,0.12)] border border-[rgba(138,93,14,0.28)] text-[var(--amber)]'
                : 'bg-[rgba(229,56,43,0.10)] border border-[rgba(229,56,43,0.28)] text-[var(--red-warn)]';
            return (
              <span className={cn('inline-flex items-center gap-1 px-[10px] py-[4px] rounded-[8px] font-mono-meta text-[10px] font-bold tracking-[0.08em]', tone)}>
                <span>AI</span>
                <span>{score}</span>
              </span>
            );
          })()
        ) : null}
      </div>

      {/* 社区热度信号 — 让页面看着"有人气"。
          只用现有 meaning.upvotes 和通过回调回传的 commentCounts，不新增 Firestore 查询。
          浏览数字段 schema 还没有，暂不显示。有了再在这里接上 "👁 browseCount ·"。 */}
      {(() => {
        const up = meaning.upvotes || 0;
        const cmt = commentCount ?? 0;
        if (up === 0 && cmt === 0) return null;
        return (
          <div className="flex items-center gap-3 mb-3 font-mono-meta text-[11px] text-[var(--ink-muted)] tracking-[0.04em]">
            {up > 0 && (
              <span className="inline-flex items-center gap-1" title={uiLang === 'zh' ? '累计点赞' : 'Total upvotes'}>
                <span aria-hidden="true">❤️</span>
                <span className="font-semibold text-[var(--ink-body)]">{up}</span>
              </span>
            )}
            {cmt > 0 && (
              <span className="inline-flex items-center gap-1" title={uiLang === 'zh' ? '评论数' : 'Comments'}>
                <span aria-hidden="true">💬</span>
                <span className="font-semibold text-[var(--ink-body)]">{cmt}</span>
              </span>
            )}
          </div>
        );
      })()}

      <p className="font-zh-serif text-[15px] leading-[1.85] text-[var(--ink)] mb-[14px] whitespace-pre-wrap">
        {meaning.meaning}
      </p>

      {meaning.mediaUrl && (
        <div className="mb-4 rounded-xl overflow-hidden border border-[var(--ink-hairline)]">
          {meaning.mediaType === 'image' || meaning.mediaType === 'gif' ? (
            <img
              src={meaning.mediaUrl}
              alt="Slang media"
              className="w-full h-auto max-h-[400px] object-contain bg-gray-50"
              referrerPolicy="no-referrer"
            />
          ) : meaning.mediaType === 'video' ? (
            <video
              src={meaning.mediaUrl}
              controls
              className="w-full h-auto max-h-[400px] bg-black"
            />
          ) : null}
        </div>
      )}

      {meaning.example && (
        <div className="p-[12px_16px] bg-[rgba(10,14,26,0.03)] border border-[var(--ink-hairline)] rounded-[12px] mb-4">
          <p className="font-display italic text-[14px] leading-[1.55] text-[var(--ink-body)]">
            "{meaning.example}"
          </p>
        </div>
      )}
      <div className="flex items-center justify-between pt-[14px] border-t border-[var(--ink-hairline)]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpvote(meaning.id, meaning.upvotes)}
            disabled={isUpvoted}
            aria-pressed={isUpvoted}
            aria-label={
              isUpvoted
                ? (uiLang === 'zh' ? `已点赞，当前 ${meaning.upvotes} 个赞` : `Upvoted, ${meaning.upvotes} upvotes`)
                : (uiLang === 'zh' ? `点赞，当前 ${meaning.upvotes} 个赞` : `Upvote, ${meaning.upvotes} upvotes`)
            }
            className={cn(
              "flex items-center gap-[6px] px-[12px] py-[7px] rounded-[10px] text-[13px] font-semibold transition-colors",
              isUpvoted
                ? "bg-[rgba(91,127,232,0.12)] text-[var(--blue-accent)]"
                : "bg-transparent text-[var(--ink-body)] hover:bg-[rgba(91,127,232,0.08)] hover:text-[var(--blue-accent)]"
            )}
          >
            <ThumbsUp className={cn("w-4 h-4", isUpvoted && "fill-current")} />
            {meaning.upvotes}
          </button>
          {/* Report/Flag button */}
          <div className="relative">
            <button
              onClick={() => onToggleReport(meaning.id)}
              className="inline-flex items-center gap-1.5 px-[12px] py-[7px] text-[13px] text-[var(--ink-muted)] hover:text-[var(--red-warn)] transition-colors rounded-[10px] hover:bg-[rgba(229,56,43,0.08)]"
              title={uiLang === 'zh' ? '举报' : 'Report'}
            >
              <Flag className="w-4 h-4" />
              <span className="font-zh-serif">{uiLang === 'zh' ? '举报' : 'Flag'}</span>
            </button>
            <AnimatePresence>
              {isReporting && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  role="dialog"
                  aria-label={uiLang === 'zh' ? '举报释义' : 'Report meaning'}
                  className="absolute left-0 bottom-full mb-[6px] bg-white border border-[rgba(10,14,26,0.08)] rounded-[12px] p-[12px] shadow-[0_10px_30px_rgba(10,14,26,0.12)] z-[var(--z-modal)] min-w-[200px]"
                >
                  <p className="font-zh-serif text-[11px] font-semibold text-[var(--ink-body)] mb-[6px]">
                    {uiLang === 'zh' ? '举报原因' : 'Report reason'}
                  </p>
                  <select
                    value={reportReason}
                    onChange={(e) => onReportReasonChange(e.target.value)}
                    className="w-full font-zh-serif text-[12px] border border-[rgba(10,14,26,0.1)] rounded-[8px] p-[6px_8px] mb-[8px] outline-none bg-white"
                  >
                    {REPORT_REASONS.map(r => (
                      <option key={r.value} value={r.value}>
                        {uiLang === 'zh' ? r.labelZh : r.labelEn}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-[6px]">
                    <button
                      onClick={() => onToggleReport(meaning.id)}
                      className="flex-1 font-zh-serif text-[11px] font-bold px-[8px] py-[6px] rounded-[8px] bg-white border border-[rgba(10,14,26,0.15)] text-[var(--ink-body)] hover:bg-[rgba(10,14,26,0.03)]"
                    >
                      {uiLang === 'zh' ? '取消' : 'Cancel'}
                    </button>
                    <button
                      onClick={() => onReport(meaning.id)}
                      className="flex-1 font-zh-serif text-[11px] font-bold px-[8px] py-[6px] rounded-[8px] bg-[var(--red-warn)] text-white border border-[var(--red-warn)] hover:bg-[var(--red-deep)]"
                    >
                      {uiLang === 'zh' ? '提交' : 'Submit'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* Share button */}
          <button
            onClick={() => onShare(currentSlangTerm, meaning.meaning)}
            className="inline-flex items-center gap-1.5 px-[12px] py-[7px] text-[13px] text-[var(--ink-muted)] hover:text-[var(--blue-accent)] transition-colors rounded-[10px] hover:bg-[rgba(91,127,232,0.08)]"
            title={uiLang === 'zh' ? '分享' : 'Share'}
          >
            <Share2 className="w-4 h-4" />
            <span className="font-zh-serif">{uiLang === 'zh' ? '分享' : 'Share'}</span>
          </button>
        </div>
        <button
          onClick={() => onPlayAudio(meaning)}
          disabled={isPlaying}
          className="p-2 text-[var(--ink-muted)] hover:text-[#5B7FE8] transition-colors disabled:opacity-50"
          title={uiLang === 'zh' ? '朗读' : 'Read aloud'}
        >
          {isPlaying ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <div className="relative">
              <Volume2 className="w-5 h-5" />
              {meaning.userAudioUrl && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-[#5B7FE8] rounded-full border border-white" />
              )}
            </div>
          )}
        </button>
      </div>
      {/* Comment Section */}
      <CommentSection
        slangId={currentSlangId}
        meaningId={meaning.id}
        uiLang={uiLang}
        onCountChange={(n) => onCommentCountChange(meaning.id, n)}
      />
    </motion.div>
  );
});

export function SlangDictionary({ uiLang, initialSearchTerm, userProfile, onOpenPaywall }: { uiLang: 'en' | 'zh', initialSearchTerm?: string, userProfile?: UserProfile | null, onOpenPaywall?: (trigger: string) => void }) {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [currentSlang, setCurrentSlang] = useState<Slang | null>(null);
  const [meanings, setMeanings] = useState<SlangMeaning[]>([]);
  const [searchResults, setSearchResults] = useState<(Slang & { topMeaning?: string; totalUpvotes?: number })[]>([]);
  // 联想下拉键盘导航：当前高亮项的下标（-1 = 无高亮，沿用输入框本身的值）。
  // ↑↓ 移动、Enter 选中、Esc 关闭都依赖它。每次联想结果变化要归零。
  const [activeIndex, setActiveIndex] = useState(-1);
  const [allSlangCache, setAllSlangCache] = useState<Slang[]>([]);
  // 联想竞态修复：缓存异步加载完成时，用这个 ref 拿到「此刻」输入框里的
  // 最新内容补算一次联想（闭包里的 val 是旧的）。
  const latestTypeaheadRef = useRef('');
  const [meaningsBySlangId, setMeaningsBySlangId] = useState<Record<string, { meaning: string; upvotes: number }[]>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showGuidelines, setShowGuidelines] = useState(false);
  const [recentSlangs, setRecentSlangs] = useState<Slang[]>([]);
  // Browse-entries panel can be collapsed into just a title + chevron so
  // users who don't care about the scroll of tag-style terms can reclaim
  // vertical space on their home screen. Persisted so the preference
  // sticks across reloads.
  const [browseCollapsed, setBrowseCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem('memeflow_browse_collapsed') === 'true'
  );
  const toggleBrowseCollapsed = () => {
    const next = !browseCollapsed;
    setBrowseCollapsed(next);
    try { localStorage.setItem('memeflow_browse_collapsed', String(next)); } catch { /* quota */ }
  };
  const [trendingCollapsed, setTrendingCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && localStorage.getItem('memeflow_trending_collapsed') === 'true'
  );
  const toggleTrendingCollapsed = () => {
    const next = !trendingCollapsed;
    setTrendingCollapsed(next);
    try { localStorage.setItem('memeflow_trending_collapsed', String(next)); } catch { /* quota */ }
  };
  const [trendingTerms, setTrendingTerms] = useState<{ term: string; count: number }[]>([]);
  const [trendingRefresh, setTrendingRefresh] = useState(0);

  // 每个 meaning 的评论数，由 CommentSection 通过 onCountChange 回传。
  // 用来在 meaning-card 顶部显示社区热度信号，不新增 Firestore 查询。
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  const [feedPage, setFeedPage] = useState(0);
  const FEED_SIZE = 12;
  const FEED_INTERVAL = 30000; // 30 seconds

  // Feed: load slangs + meanings ONCE, then rotate purely in-memory every 30s.
  // Previously both the feed effect and a separate cache effect each did full-collection
  // scans on mount, and the feed effect re-ran on every feedPage tick — triggering a
  // full re-fetch of slangs + slang_meanings every 30 seconds. This burned Firestore
  // quota and caused the repeated quota exhaustion crashes. Now we fetch once, cache,
  // and paginate the cached scored list.
  useEffect(() => {
    let cancelled = false;
    const loadOnce = async () => {
      try {
        const [allSnap, meaningsSnap] = await Promise.all([
          getDocs(collection(db, 'slangs')),
          getDocs(query(collection(db, 'slang_meanings'), where('status', '==', 'approved')))
        ]);
        if (cancelled) return;
        const allSlangs = allSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as Slang))
          .filter(s => s.term && typeof s.term === 'string');

        const mIndex: Record<string, { meaning: string; upvotes: number }[]> = {};
        meaningsSnap.forEach(d => {
          const data = d.data();
          if (!mIndex[data.slangId]) mIndex[data.slangId] = [];
          mIndex[data.slangId].push({ meaning: data.meaning, upvotes: data.upvotes || 0 });
        });
        Object.values(mIndex).forEach(arr => arr.sort((a, b) => b.upvotes - a.upvotes));
        if (cancelled) return;
        setMeaningsBySlangId(mIndex);
        setAllSlangCache(allSlangs);
      } catch (e) {
        console.error('Slang feed load failed:', e);
        Sentry.captureException(e, { tags: { component: 'SlangDictionary', op: 'firestore.read', purpose: 'feed' } });
      }
    };
    loadOnce();
    return () => { cancelled = true; };
  }, []);

  // Rotation effect: derive the visible page from cached slangs; no Firestore reads.
  useEffect(() => {
    if (allSlangCache.length === 0) { setRecentSlangs([]); return; }

    const HISTORY_KEY = 'memeflow_search_history';
    let searchedTerms: string[] = [];
    try {
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      searchedTerms = history.map((h: any) => h.term?.toLowerCase()).filter(Boolean);
    } catch {}

    const scored = allSlangCache.map(s => {
      let score = Math.random() * 10;
      const termLower = (s.term || '').toLowerCase();
      if (searchedTerms.some(t => termLower.includes(t) || t.includes(termLower))) score += 20;
      if (s.createdAt?.toDate) {
        const age = Date.now() - s.createdAt.toDate().getTime();
        const dayAge = age / 86400000;
        if (dayAge < 7) score += 15;
        else if (dayAge < 30) score += 5;
      }
      return { ...s, _score: score };
    });
    scored.sort((a, b) => b._score - a._score);
    const start = (feedPage * FEED_SIZE) % scored.length;
    const page: Slang[] = [];
    for (let i = 0; i < FEED_SIZE && i < scored.length; i++) {
      page.push(scored[(start + i) % scored.length]);
    }
    setRecentSlangs(page);
  }, [feedPage, allSlangCache]);

  // Rotation timer — in-memory only, no refetch
  useEffect(() => {
    const timer = setInterval(() => setFeedPage(p => p + 1), FEED_INTERVAL);
    return () => clearInterval(timer);
  }, []);

  // Save search to local history for personalization
  const saveSearchHistory = useCallback((term: string) => {
    const HISTORY_KEY = 'memeflow_search_history';
    try {
      const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      history.push({ term: term.toLowerCase(), ts: Date.now() });
      // Keep last 200
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-200)));
    } catch {}
  }, []);

  // Track search in Firestore for global trending.
  // Each doc carries expireAt = now + 7d so Firestore TTL policy can
  // garbage-collect old rows automatically. The trending query only
  // looks at the last 7 days anyway, so everything past that is waste.
  const trackSearch = useCallback(async (term: string) => {
    if (!auth.currentUser) return;
    try {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      await addDoc(collection(db, 'slang_searches'), {
        term: term.toLowerCase(),
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        expireAt: Timestamp.fromMillis(Date.now() + sevenDaysMs),
      });
      setTrendingRefresh(n => n + 1);
    } catch (e) {
      // Non-critical background telemetry — don't toast the user, but do
      // capture so we notice if the collection is permanently broken.
      Sentry.captureException(e, { tags: { component: 'SlangDictionary', op: 'firestore.write', collection: 'slang_searches', severity: 'low' } });
    }
  }, []);

  // Global trending: aggregate all users' searches from last 7 days
  useEffect(() => {
    const loadTrending = async () => {
      try {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const q = query(
          collection(db, 'slang_searches'),
          where('createdAt', '>=', Timestamp.fromDate(weekAgo))
        );
        const snap = await getDocs(q);
        const counts: Record<string, number> = {};
        snap.forEach(d => {
          const term = d.data().term;
          counts[term] = (counts[term] || 0) + 1;
        });
        const sorted = Object.entries(counts)
          .map(([term, count]) => ({ term, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        setTrendingTerms(sorted);
      } catch (e) {
        console.error('Failed to load trending:', e);
        Sentry.captureException(e, { tags: { component: 'SlangDictionary', op: 'firestore.read', purpose: 'trending' } });
      }
    };
    loadTrending();
  }, [trendingRefresh]);
  
  // Track the active meanings listener so re-searches don't leak subscriptions.
  const initialMeaningsUnsubRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!initialSearchTerm) return;
    setSearchTerm(initialSearchTerm);

    let cancelled = false;
    const doSearch = async () => {
      setIsSearching(true);
      setCurrentSlang(null);
      setMeanings([]);
      setShowAddForm(false);

      // Unsubscribe from previous search's meanings listener
      initialMeaningsUnsubRef.current?.();
      initialMeaningsUnsubRef.current = null;

      try {
        // 修复（2026-06-11）：term 字段大小写敏感，大写词条匹配不到 —— 改查 termLower。
        const q = query(collection(db, 'slangs'), where('termLower', '==', initialSearchTerm.trim().toLowerCase()), limit(1));
        const snapshot = await getDocs(q);
        if (cancelled) return;

        if (!snapshot.empty) {
          const slangDoc = snapshot.docs[0];
          const slangData = { id: slangDoc.id, ...slangDoc.data() } as Slang;
          setCurrentSlang(slangData);

          const meaningsQ = query(
            collection(db, 'slang_meanings'),
            where('slangId', '==', slangData.id),
            where('status', '==', 'approved'),
            orderBy('upvotes', 'desc')
          );
          initialMeaningsUnsubRef.current = onSnapshot(meaningsQ, (meaningsSnapshot) => {
            const fetchedMeanings = meaningsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SlangMeaning));
            setMeanings(fetchedMeanings);
          });

          if (auth.currentUser) {
            const upvotesQ = query(
              collection(db, 'slang_upvotes'),
              where('userId', '==', auth.currentUser.uid)
            );
            const upvotesSnapshot = await getDocs(upvotesQ);
            if (!cancelled) {
              const upvotedIds = new Set(upvotesSnapshot.docs.map(doc => doc.data().meaningId));
              setUpvotedMeanings(upvotedIds);
            }
          }
        } else {
          setCurrentSlang(null);
        }
      } catch (error) {
        console.error("Error searching slang:", error);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    };
    doSearch();
    return () => {
      cancelled = true;
      initialMeaningsUnsubRef.current?.();
      initialMeaningsUnsubRef.current = null;
    };
  }, [initialSearchTerm]);
  
  const [newMeaning, setNewMeaning] = useState('');
  const [newExample, setNewExample] = useState('');
  const [newVoiceName, setNewVoiceName] = useState('Kore');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isGeneratingExample, setIsGeneratingExample] = useState(false);
  const [upvotedMeanings, setUpvotedMeanings] = useState<Set<string>>(new Set());
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const { speak } = useAudio();
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const [reportingMeaningId, setReportingMeaningId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('spam');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // allowDraft=true lets the caller explicitly request a full template
  // draft even when input is empty. The auto-debounce path (from typing)
  // still uses allowDraft=false so we don't spam the API with drafts on
  // every keystroke toward a 3-char threshold.
  const fetchSuggestion = useCallback(async (term: string, input: string, allowDraft = false) => {
    if (!term) return;
    if (input.length < 3 && !allowDraft) {
      setAiSuggestion('');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoadingSuggestion(true);
    try {
      const suggestion = await suggestSlangMeaning(term, input);
      if (!controller.signal.aborted) {
        setAiSuggestion(suggestion);
      }
    } catch {
      if (!controller.signal.aborted) setAiSuggestion('');
    } finally {
      if (!controller.signal.aborted) setIsLoadingSuggestion(false);
    }
  }, []);

  const handleMeaningChange = (value: string) => {
    setNewMeaning(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const term = currentSlang ? currentSlang.term : searchTerm.trim().toLowerCase();
      fetchSuggestion(term, value);
    }, 800);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(uiLang === 'zh' ? '文件不能超过 10MB' : 'File size must be less than 10MB');
        return;
      }
      setMediaFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadMedia = async (file: File): Promise<{ url: string, type: 'image' | 'video' | 'gif' }> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const storageRef = ref(storage, `slang_media/${fileName}`);
    
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    
    let type: 'image' | 'video' | 'gif' = 'image';
    if (file.type.includes('video')) type = 'video';
    else if (file.type.includes('gif') || file.name.endsWith('.gif')) type = 'gif';
    
    return { url, type };
  };

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error(uiLang === 'zh' ? '音频文件不能超过 5MB' : 'Audio file size must be less than 5MB');
        return;
      }
      setAudioFile(file);
    }
  };

  const uploadFile = async (file: File, folder: string): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const storageRef = ref(storage, `${folder}/${fileName}`);
    
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  const handlePlayAudio = useCallback(async (meaning: SlangMeaning) => {
    if (playingAudioId) return;
    setPlayingAudioId(meaning.id);

    // Two-tier audio playback:
    //   1. If the submitter uploaded their own voice clip → play it directly.
    //   2. Otherwise, delegate to useAudio's speak(), which calls the
    //      Gemini TTS proxy and falls back to the browser's SpeechSynthesis
    //      on failure. Previously this component called generateSpeech()
    //      directly, which throws under USE_PROXY=true (prod). That meant
    //      the speaker icon in 梗百科 did absolutely nothing in prod —
    //      reported 2026-04-20. Switching to speak() matches what
    //      TranslateTab / WordbookPage / ReviewPage already do.
    try {
      if (meaning.userAudioUrl) {
        const audio = new Audio(meaning.userAudioUrl);
        audio.onended = () => setPlayingAudioId(null);
        await audio.play();
      } else {
        // Slang meanings are always in Chinese — pass lang explicitly so
        // the TTS model doesn't fumble Latin-letter pinyin slang inside.
        await speak(meaning.meaning, 'zh');
        // speak() manages its own playback lifecycle; clear the UI lock
        // here since we don't get an 'ended' callback surfaced.
        setPlayingAudioId(null);
      }
    } catch (error) {
      console.error("Error playing audio:", error);
      setPlayingAudioId(null);
    }
  }, [playingAudioId, speak]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }, []);

  const handleReport = useCallback(async (meaningId: string) => {
    if (!auth.currentUser) return;
    try {
      await addDoc(collection(db, 'slang_reports'), {
        meaningId,
        reporterId: auth.currentUser.uid,
        reason: reportReason,
        createdAt: serverTimestamp(),
      });
      showToast(uiLang === 'zh' ? '举报已提交，感谢反馈' : 'Report submitted, thank you');
    } catch (err) {
      console.error('Error submitting report:', err);
      toast.error(uiLang === 'zh' ? '举报提交失败' : 'Failed to submit report');
      Sentry.captureException(err, { tags: { component: 'SlangDictionary', op: 'firestore.write', collection: 'slang_reports' } });
    }
    setReportingMeaningId(null);
    setReportReason('spam');
  }, [reportReason, uiLang, showToast]);

  const handleShare = useCallback(async (term: string, meaning: string) => {
    const text = `【梗百科】${term}: ${meaning} — via MemeFlow`;
    try {
      await navigator.clipboard.writeText(text);
      showToast(uiLang === 'zh' ? '已复制到剪贴板' : 'Copied to clipboard');
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast(uiLang === 'zh' ? '已复制到剪贴板' : 'Copied to clipboard');
    }
  }, [uiLang, showToast]);

  const selectSlang = useCallback(async (slangData: Slang) => {
    setCurrentSlang(slangData);
    setSearchResults([]);
    trackSearch(slangData.term);
    saveSearchHistory(slangData.term);

    try {
      // Two equality filters + no orderBy → only needs default single-field
      // indexes (no composite). Previously this used `orderBy('upvotes', 'desc')`
      // which required a composite index that was never created, causing
      // listener errors silently and the "search does nothing" bug.
      // We now sort in memory below, which is fine because we're not paginating.
      const meaningsQ = query(
        collection(db, 'slang_meanings'),
        where('slangId', '==', slangData.id),
        where('status', '==', 'approved')
      );
      const unsubscribe = onSnapshot(
        meaningsQ,
        (meaningsSnapshot) => {
          const unsorted = meaningsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as SlangMeaning));
          unsorted.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0));
          setMeanings(unsorted);
        },
        (error) => {
          console.error('meanings onSnapshot error:', error);
          toast.error(uiLang === 'zh' ? '加载词义失败，请刷新重试' : 'Failed to load meanings, please refresh');
          Sentry.captureException(error, {
            tags: { component: 'SlangDictionary', op: 'firestore.listen', collection: 'slang_meanings' },
            contexts: { slang: { id: slangData.id, term: slangData.term } },
          });
        }
      );
      if (auth.currentUser) {
        const upvotesQ = query(collection(db, 'slang_upvotes'), where('userId', '==', auth.currentUser.uid));
        const upvotesSnapshot = await getDocs(upvotesQ);
        setUpvotedMeanings(new Set(upvotesSnapshot.docs.map(d => d.data().meaningId)));
      }
    } catch (error) {
      console.error("Error loading meanings:", error);
      toast.error(uiLang === 'zh' ? '加载词义失败' : 'Failed to load meanings');
      Sentry.captureException(error, {
        tags: { component: 'SlangDictionary', op: 'firestore.read', purpose: 'meanings_initial' },
        contexts: { slang: { id: slangData.id, term: slangData.term } },
      });
    }
  }, [trackSearch, saveSearchHistory, uiLang]);

  const doSearch = useCallback(async (termToSearch: string) => {
    if (!termToSearch.trim()) return;

    setSearchTerm(termToSearch);
    setIsSearching(true);
    setCurrentSlang(null);
    setMeanings([]);
    setSearchResults([]);
    setShowAddForm(false);
    markOnboardingStep('search_slang');

    try {
      const term = termToSearch.trim().toLowerCase();

      // Client-side fuzzy search from cache
      if (allSlangCache.length > 0) {
        const matches = allSlangCache
          .filter(s => {
            const t = s.term.toLowerCase();
            return t === term || t.includes(term) || term.includes(t);
          })
          .map(s => {
            const ms = meaningsBySlangId[s.id] || [];
            const totalUpvotes = ms.reduce((sum, m) => sum + m.upvotes, 0);
            return { ...s, topMeaning: ms[0]?.meaning, totalUpvotes };
          })
          .sort((a, b) => {
            // Exact match first, then by upvotes
            const aExact = a.term.toLowerCase() === term ? 1000000 : 0;
            const bExact = b.term.toLowerCase() === term ? 1000000 : 0;
            return (bExact + (b.totalUpvotes || 0)) - (aExact + (a.totalUpvotes || 0));
          });

        if (matches.length === 1) {
          await selectSlang(matches[0]);
          setIsSearching(false);
          return;
        } else if (matches.length > 0) {
          setSearchResults(matches);
          setIsSearching(false);
          return;
        }
      }

      // Fallback: Firestore query\u3002
      // \u4fee\u590d\uff082026-06-11\uff09\uff1a\u539f\u6765\u67e5\u7684\u662f term \u5b57\u6bb5\uff0c\u4f46\u8f93\u5165\u5df2 toLowerCase()\uff0c
      // \u5927\u5199\u5b58\u50a8\u7684\u8bcd\u6761\uff08\u5982\u300cAI\u6cd4\u6c34\u300d\uff09\u6c38\u8fdc\u7cbe\u786e\u5339\u914d\u4e0d\u5230 \u2014\u2014 \u7f13\u5b58\u6ca1\u52a0\u8f7d\u5b8c\u65f6
      // \u8d70\u5230\u8fd9\u91cc\u5c31\u62a5"\u672a\u627e\u5230\u8be5\u8bcd\u6761"\u3002\u6539\u67e5 termLower\uff08\u5168\u5e93\u5df2\u56de\u586b\u8be5\u5b57\u6bb5\uff0c
      // \u65b0\u5efa\u8bcd\u6761\u4e5f\u4f1a\u5199\u5165\uff09\uff0c\u5927\u5c0f\u5199\u4e0d\u518d\u5f71\u54cd\u641c\u7d22\u3002
      let q = query(collection(db, 'slangs'), where('termLower', '==', term), limit(1));
      let snapshot = await getDocs(q);

      if (snapshot.empty) {
        q = query(
          collection(db, 'slangs'),
          where('termLower', '>=', term),
          where('termLower', '<=', term + '\uf8ff'),
          limit(5)
        );
        snapshot = await getDocs(q);
      }

      if (!snapshot.empty) {
        const slangDoc = snapshot.docs[0];
        const slangData = { id: slangDoc.id, ...slangDoc.data() } as Slang;
        await selectSlang(slangData);
      } else {
        // Not found — show user feedback instead of silently returning.
        // Previously this left the UI unchanged and looked like the
        // search button did nothing.
        setCurrentSlang(null);
        toast.info(
          uiLang === 'zh'
            ? `没找到 "${termToSearch}"，换个词试试`
            : `No matches for "${termToSearch}". Try a different term.`
        );
      }
    } catch (error) {
      console.error("Error searching slang:", error);
      toast.error(uiLang === 'zh' ? '搜索失败，请重试' : 'Search failed, please retry');
      Sentry.captureException(error, {
        tags: { component: 'SlangDictionary', op: 'firestore.read', purpose: 'search' },
        contexts: { search: { term: termToSearch } },
      });
    } finally {
      setIsSearching(false);
    }
  }, [trackSearch, uiLang]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    doSearch(searchTerm);
  };

  const handleSubmitMeaning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) {
      setSubmitError(uiLang === 'zh' ? '请先登录' : 'Please sign in first');
      return;
    }
    if (!newMeaning.trim()) {
      setSubmitError(uiLang === 'zh' ? '请填写含义' : 'Please provide meaning');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      // Check for active penalties first
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        
        if (userData.vPenaltyLevel === 3) {
          setSubmitError(uiLang === 'zh' ? '您的账号已被永久禁止贡献词条。' : 'Your account has been permanently banned from contributing.');
          setIsSubmitting(false);
          return;
        }
        
        if (userData.vPenaltyLevel === 2) {
          setSubmitError(uiLang === 'zh' ? '您的账号正处于 30 天封禁期，无法提交词条。' : 'Your account is under a 30-day ban and cannot submit entries.');
          setIsSubmitting(false);
          return;
        }

        if (userData.l3PenaltyActive) {
          setSubmitError(uiLang === 'zh' ? '您处于 L3 惩罚状态，需完成质量挑战才能继续提交。' : 'You are under L3 penalty. Complete a quality challenge to continue.');
          setIsSubmitting(false);
          return;
        }

        if (userData.l2PenaltyUntil && userData.l2PenaltyUntil.toDate() > new Date()) {
          setSubmitError(uiLang === 'zh' ? '您因连续提交低质量内容，处于 48 小时冷却期。' : 'You are under a 48-hour cooldown due to multiple low-quality submissions.');
          setIsSubmitting(false);
          return;
        }

        // Check new user 7-day limit (3 per day)
        if (userData.createdAt) {
          const createdDate = userData.createdAt.toDate();
          const now = new Date();
          const diffDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 3600 * 24));
          
          if (diffDays <= 7) {
            const todayStr = now.toISOString().split('T')[0];
            if (userData.lastContributionDate === todayStr && (userData.dailyContributionCount || 0) >= 3) {
              setSubmitError(uiLang === 'zh' ? '新用户注册 7 天内每日最多提交 3 条词条，请明天再来。' : 'New users are limited to 3 submissions per day during the first 7 days.');
              setIsSubmitting(false);
              return;
            }
          }
        }
      }

      const termToUse = currentSlang ? currentSlang.term : searchTerm.trim().toLowerCase();
      
      // AI Validation
      const validation = await validateSlangMeaning(termToUse, newMeaning, newExample);
      
      if (!validation.isValid) {
        let errorMsg = validation.reason;
        if (validation.violationLevel === 'L1') {
          errorMsg += uiLang === 'zh'
            ? '\n💡 提示：请补充更多细节，至少写清楚这个词的含义和使用场景。'
            : '\n💡 Hint: Please add more detail — explain the meaning and usage context.';
        } else if (validation.violationLevel === 'V1') {
          errorMsg += uiLang === 'zh'
            ? '\n💡 提示：请确保内容与词条相关。'
            : '\n💡 Hint: Please ensure content is relevant to the term.';
        }
        setSubmitError(errorMsg);
        
        // Penalty — 敏感字段（reputationScore / penalty trail）客户端无权直写，
        // 走 Cloud Function syncContributionStats 走 admin SDK。
        if (validation.violationLevel && ['L1', 'V1', 'V2', 'V3'].includes(validation.violationLevel)) {
          try {
            await syncContributionStatsFn({
              action: 'contribute_violation',
              violationLevel: validation.violationLevel as 'L1' | 'V1' | 'V2' | 'V3',
            });
          } catch (e) {
            console.warn('syncContributionStats (violation) failed:', e);
            Sentry.captureException(e, { tags: { component: 'SlangDictionary', op: 'syncViolation', level: validation.violationLevel } });
          }
        }
        
        setIsSubmitting(false);
        return;
      }

      let mediaInfo = null;
      if (mediaFile) {
        setIsUploading(true);
        mediaInfo = await uploadMedia(mediaFile);
        setIsUploading(false);
      }

      let userAudioUrl = null;
      if (audioFile) {
        setIsUploading(true);
        userAudioUrl = await uploadFile(audioFile, 'slang_audio');
        setIsUploading(false);
      }

      let slangId = currentSlang?.id;

      // Create slang if it doesn't exist
      if (!slangId) {
        try {
          const slangRef = await addDoc(collection(db, 'slangs'), {
            term: termToUse,
            // termLower 是搜索/去重的统一键（2026-06-11 全库已回填）——
            // 新建词条必须同步写入，否则又会出现"搜不到"的老 bug。
            termLower: termToUse.toLowerCase().trim(),
            createdAt: serverTimestamp()
          });
          slangId = slangRef.id;
          setCurrentSlang({ id: slangId, term: termToUse, createdAt: new Date() });
        } catch (e: any) {
          console.error('[SlangDictionary] addDoc(slangs) failed', { code: e?.code, message: e?.message, term: termToUse });
          Sentry.captureException(e, {
            tags: { component: 'SlangDictionary', op: 'addDoc.slangs' },
            extra: { term: termToUse, errorCode: e?.code, errorMessage: e?.message },
          });
          const detail = e?.code === 'permission-denied'
            ? `创建词条 "${termToUse}" 被拒（slangs 集合 rule 检查未通过）`
            : (e?.message || '未知错误');
          toast.error(`提交失败（创建词条阶段）：${detail}`);
          setIsSubmitting(false);
          return;
        }
      }

      // Get current user data for denormalization
      const authorUserRef = doc(db, 'users', auth.currentUser.uid);
      const authorUserSnap = await getDoc(authorUserRef);
      let authorName = auth.currentUser.displayName || 'Anonymous';
      let authorTitle = '';
      if (authorUserSnap.exists()) {
        const userData = authorUserSnap.data() as UserProfile;
        authorTitle = userData.titleLevel3 || userData.titleLevel2 || userData.titleLevel1 || '';
      }

      // Add meaning. IMPORTANT: firestore.rules uses `'field' in data`
      // to whitelist optional fields — writing `null` for unused slots
      // makes `in data` true but `is string` false, so the rule rejects
      // the doc with "Missing or insufficient permissions". Construct
      // the payload dynamically so absent fields are truly absent.
      const meaningDoc: Record<string, any> = {
        slangId,
        meaning: newMeaning.trim(),
        example: newExample.trim(),
        authorId: auth.currentUser.uid,
        authorName,
        authorTitle,
        qualityScore: validation.qualityScore || 80,
        upvotes: 0,
        status: 'approved',
        voiceName: newVoiceName,
        createdAt: serverTimestamp(),
      };
      if (mediaInfo?.url) meaningDoc.mediaUrl = mediaInfo.url;
      if (mediaInfo?.type) meaningDoc.mediaType = mediaInfo.type;
      if (userAudioUrl) meaningDoc.userAudioUrl = userAudioUrl;

      // 前置字段健康检查 — 在 Firestore 拒绝之前先给用户友好提示，
      // 避免那个一脸懵的 "Missing or insufficient permissions"。
      // 跟 firestore.rules 里 isValidSlangMeaning 的检查项一一对应。
      const issues: string[] = [];
      if (!meaningDoc.slangId || typeof meaningDoc.slangId !== 'string') issues.push('slangId 缺失或类型错误');
      if (!meaningDoc.meaning || typeof meaningDoc.meaning !== 'string') issues.push('释义为空');
      else if (meaningDoc.meaning.length >= 1000) issues.push(`释义太长（${meaningDoc.meaning.length} > 1000 字符）`);
      if (typeof meaningDoc.example !== 'string') issues.push('例句类型错误');
      else if (meaningDoc.example.length >= 1000) issues.push(`例句太长（${meaningDoc.example.length} > 1000 字符）`);
      if (meaningDoc.authorId !== auth.currentUser?.uid) issues.push('authorId 不匹配当前用户');
      if (typeof meaningDoc.upvotes !== 'number') issues.push('upvotes 类型错误');
      if (!['approved', 'rejected', 'pending'].includes(meaningDoc.status)) issues.push(`status 非法值 "${meaningDoc.status}"`);
      if (meaningDoc.voiceName && !['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].includes(meaningDoc.voiceName)) {
        issues.push(`voiceName 非法值 "${meaningDoc.voiceName}"`);
      }
      if (meaningDoc.mediaType && !['image', 'video', 'gif'].includes(meaningDoc.mediaType)) {
        issues.push(`mediaType 非法值 "${meaningDoc.mediaType}"`);
      }
      if (issues.length > 0) {
        const msg = `提交前检查发现问题：${issues.join('；')}`;
        console.error('[SlangDictionary] pre-submit validation failed:', issues, meaningDoc);
        toast.error(msg);
        Sentry.captureMessage('Slang submit validation failed', {
          level: 'warning',
          tags: { component: 'SlangDictionary', op: 'preSubmitValidation' },
          extra: { issues, meaningDoc },
        });
        setIsSubmitting(false);
        return;
      }

      // 强制刷新 auth token —— permission-denied 经常是 token 过期，rule
      // 看到 request.auth.uid 为 null 直接拒。getIdToken(true) 会强制
      // 重新拉取一个新 token。
      try {
        await auth.currentUser?.getIdToken(true);
      } catch (tokenErr) {
        console.warn('[SlangDictionary] token refresh failed:', tokenErr);
      }

      // 客户端镜像 firestore.rules 里 isValidSlangMeaning 的每一条检查。
      // 任何条件不满足都直接 toast 出来，不再让用户看到迷之 permission-denied。
      const ruleCheck: Array<{ rule: string; pass: boolean; actual?: any }> = [
        { rule: 'slangId is string && size > 0', pass: typeof meaningDoc.slangId === 'string' && meaningDoc.slangId.length > 0, actual: meaningDoc.slangId },
        { rule: 'meaning is string && size > 0 && size < 1000', pass: typeof meaningDoc.meaning === 'string' && meaningDoc.meaning.length > 0 && meaningDoc.meaning.length < 1000, actual: `${typeof meaningDoc.meaning} len=${meaningDoc.meaning?.length}` },
        { rule: 'example is string && size < 1000', pass: typeof meaningDoc.example === 'string' && meaningDoc.example.length < 1000, actual: `${typeof meaningDoc.example} len=${meaningDoc.example?.length}` },
        { rule: 'authorId == auth.uid', pass: meaningDoc.authorId === auth.currentUser?.uid, actual: `doc=${meaningDoc.authorId} auth=${auth.currentUser?.uid}` },
        { rule: 'upvotes is number && == 0', pass: typeof meaningDoc.upvotes === 'number' && meaningDoc.upvotes === 0, actual: `${typeof meaningDoc.upvotes} val=${meaningDoc.upvotes}` },
        { rule: "status in ['approved','rejected','pending']", pass: ['approved', 'rejected', 'pending'].includes(meaningDoc.status), actual: meaningDoc.status },
        { rule: "voiceName in [Puck/Charon/Kore/Fenrir/Zephyr] OR absent", pass: !meaningDoc.voiceName || ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].includes(meaningDoc.voiceName), actual: meaningDoc.voiceName },
        { rule: 'authorName is string OR absent', pass: !('authorName' in meaningDoc) || typeof meaningDoc.authorName === 'string', actual: `${typeof meaningDoc.authorName}` },
        { rule: 'authorTitle is string OR absent', pass: !('authorTitle' in meaningDoc) || typeof meaningDoc.authorTitle === 'string', actual: `${typeof meaningDoc.authorTitle}` },
        { rule: 'qualityScore is number OR absent', pass: !('qualityScore' in meaningDoc) || typeof meaningDoc.qualityScore === 'number', actual: `${typeof meaningDoc.qualityScore} val=${meaningDoc.qualityScore}` },
      ];
      const failed = ruleCheck.filter((c) => !c.pass);
      console.log('[SlangDictionary] rule check', { passed: ruleCheck.length - failed.length, failed: failed.length, details: ruleCheck });
      if (failed.length > 0) {
        const detail = failed.map((c) => `[${c.rule}] actual: ${JSON.stringify(c.actual)}`).join(' | ');
        console.error('[SlangDictionary] rule check FAILED', failed, meaningDoc);
        Sentry.captureMessage('SlangMeaning rule check failed', {
          level: 'warning',
          tags: { component: 'SlangDictionary', op: 'ruleMirror' },
          extra: { failed, meaningDoc, authUid: auth.currentUser?.uid },
        });
        toast.error(`提交失败：${failed.length} 条规则不满足 — ${detail.slice(0, 300)}`, { duration: 15000 });
        setIsSubmitting(false);
        return;
      }

      try {
        await addDoc(collection(db, 'slang_meanings'), meaningDoc);
      } catch (e: any) {
        // Firestore SDK 抛错时，把所有提交字段连同错误文案一起塞进
        // Sentry + console，能定位到底是哪条 rule 拒的。
        // 同时把当前 auth 状态也打出来——permission-denied 经常是
        // token 问题不是 rule 问题。
        console.error('[SlangDictionary] addDoc(slang_meanings) failed', {
          code: e?.code,
          message: e?.message,
          payload: JSON.stringify(meaningDoc),
          payloadKeys: Object.keys(meaningDoc),
          authUid: auth.currentUser?.uid,
          isAnonymous: auth.currentUser?.isAnonymous,
          providerId: auth.currentUser?.providerData?.[0]?.providerId,
        });
        Sentry.captureException(e, {
          tags: { component: 'SlangDictionary', op: 'addDoc.slang_meanings' },
          extra: {
            meaningDoc,
            errorCode: e?.code,
            errorMessage: e?.message,
            authUid: auth.currentUser?.uid,
            isAnonymous: auth.currentUser?.isAnonymous,
          },
        });
        let detail = e?.message || '未知错误';
        if (e?.code === 'permission-denied') {
          detail = `权限被拒 (${meaningDoc.authorId === auth.currentUser?.uid ? 'authorId 匹配' : 'authorId 不匹配!'})。可能是登录已过期，请刷新页面重新登录后再试。`;
        }
        toast.error(`提交失败：${detail}`, { duration: 8000 });
        setIsSubmitting(false);
        return;
      }

      // 用户统计字段分两路：
      //   - 客户端直写（在 isUserSelfUpdate 白名单里）：hasCompletedOnboarding /
      //     lastContributionDate / dailyContributionCount / currentStreak /
      //     titleLevel1 / hasUploadedMedia
      //   - Cloud Function 写（rules 禁止客户端）：approvedSlangCount
      const statsUserRef = doc(db, 'users', auth.currentUser.uid);
      const statsUserSnap = await getDoc(statsUserRef);
      if (statsUserSnap.exists()) {
        const userData = statsUserSnap.data() as UserProfile;
        const newApprovedCount = (userData.approvedSlangCount || 0) + 1;  // 仅用于 titleLevel1 本地计算，真写走 CF
        let updates: Partial<UserProfile> = {
          hasCompletedOnboarding: true
        };

        const today = new Date().toISOString().split('T')[0];
        if (userData.lastContributionDate !== today) {
          updates.lastContributionDate = today;
          updates.dailyContributionCount = 1;

          if (userData.lastContributionDate) {
            const lastDate = new Date(userData.lastContributionDate);
            const currentDate = new Date(today);
            const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
              updates.currentStreak = (userData.currentStreak || 0) + 1;
            } else if (diffDays > 1) {
              updates.currentStreak = 1;
            }
          } else {
            updates.currentStreak = 1;
          }
        } else {
          updates.dailyContributionCount = (userData.dailyContributionCount || 0) + 1;
        }

        if (newApprovedCount === 1) {
          updates.titleLevel1 = '梗学徒';
        } else if (newApprovedCount >= 5) {
          updates.titleLevel1 = '文化观察员';
        }

        if ((mediaInfo || userAudioUrl) && !userData.hasUploadedMedia) {
          updates.hasUploadedMedia = true;
          updates.titleLevel1 = '多模态先锋'; // Overrides previous level 1 title if achieved simultaneously
        }

        await updateDoc(statsUserRef, updates);
      }

      // approvedSlangCount 走 CF（客户端不能直写敏感字段）
      try {
        await syncContributionStatsFn({ action: 'contribute_success' });
      } catch (e) {
        console.warn('syncContributionStats (success) failed:', e);
        Sentry.captureException(e, { tags: { component: 'SlangDictionary', op: 'syncSuccess' } });
      }

      setNewMeaning('');
      setNewExample('');
      setMediaFile(null);
      setMediaPreview(null);
      setAudioFile(null);
      setShowAddForm(false);
      markOnboardingStep('contribute_entry');
      
      // Re-trigger search to attach listener if it was a new slang
      if (!currentSlang) {
        doSearch(searchTerm);
      }
    } catch (error: any) {
      console.error("Error submitting meaning:", error);
      const msg = error?.message || '';
      const code = error?.code || '';
      if (msg.includes('不可用') || msg.includes('繁忙') || msg.includes('location')) {
        setSubmitError(uiLang === 'zh' ? 'AI 审核服务暂时不可用，请稍后重试' : 'AI review service temporarily unavailable');
      } else if (code === 'permission-denied') {
        // 把具体错误信息暴露出来，不再隐藏到一条通用 "提交失败"
        const detailMsg = `提交失败：${error?.message || '权限被拒'} (code: ${code})`;
        setSubmitError(detailMsg);
      } else if (code) {
        setSubmitError(`提交失败：${error?.message || error} (code: ${code})`);
      } else {
        setSubmitError(uiLang === 'zh'
          ? `提交失败：${error?.message || '未知错误'}`
          : `Failed to submit: ${error?.message || 'unknown error'}`);
      }
      Sentry.captureException(error, {
        tags: { component: 'SlangDictionary', op: 'slang.submit', collection: 'slang_meanings' },
        extra: { code, message: msg, stack: error?.stack },
      });
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  const handleUpvote = useCallback(async (meaningId: string, currentUpvotes: number) => {
    if (!auth.currentUser) return;
    if (upvotedMeanings.has(meaningId)) return; // Already upvoted

    try {
      const upvoteId = `${auth.currentUser.uid}_${meaningId}`;
      
      // Add upvote record
      await addDoc(collection(db, 'slang_upvotes'), {
        userId: auth.currentUser.uid,
        meaningId: meaningId,
        createdAt: serverTimestamp()
      });

      // Update meaning upvotes
      const meaningRef = doc(db, 'slang_meanings', meaningId);
      await updateDoc(meaningRef, {
        upvotes: currentUpvotes + 1
      });

      setUpvotedMeanings(prev => new Set(prev).add(meaningId));
    } catch (error) {
      console.error("Error upvoting:", error);
      toast.error(uiLang === 'zh' ? '点赞失败' : 'Upvote failed');
      Sentry.captureException(error, { tags: { component: 'SlangDictionary', op: 'firestore.write', collection: 'slang_upvotes' } });
    }
  }, [upvotedMeanings, uiLang]);

  // 稳定的评论数回传回调：用 (meaningId, n) 形式，让 memo 卡片传自己的 id。
  // 原来是写在 JSX 里的内联箭头闭包（每次渲染新建），会破坏 MeaningCard 的 memo。
  // 行为完全等价：只有计数真变了才 setState，避免无谓重渲染。
  const handleCommentCountChange = useCallback((meaningId: string, n: number) => {
    setCommentCounts(prev => (prev[meaningId] === n ? prev : { ...prev, [meaningId]: n }));
  }, []);

  // 稳定的举报面板开关回调：切换当前展开的举报项。
  const handleToggleReport = useCallback((meaningId: string) => {
    setReportingMeaningId(prev => (prev === meaningId ? null : meaningId));
  }, []);

  return (
    <div className="space-y-6">
      {/* Eyebrow label */}
      <div className="mb-3 px-1.5 flex items-baseline gap-2.5">
        <span className="inline-block w-4 h-px bg-[rgba(10,14,26,0.35)]"></span>
        <span className="font-display italic text-[13px] text-[rgba(10,14,26,0.58)]">slang dictionary</span>
        <span className="font-zh-sans text-[11px] font-light tracking-[0.15em] text-[rgba(10,14,26,0.38)]">梗百科</span>
      </div>
      {/* Toast notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            role="status"
            aria-live="polite"
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[var(--z-toast)] bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Daily Challenge */}
      <DailyChallenge uiLang={uiLang} />

      <div className="relative">
      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={searchTerm}
          role="combobox"
          aria-expanded={searchResults.length > 0 && !currentSlang && !!searchTerm.trim()}
          aria-controls="slang-typeahead-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `slang-option-${activeIndex}` : undefined}
          onKeyDown={(e) => {
            const open = searchResults.length > 0 && !currentSlang && !!searchTerm.trim();
            if (!open) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex(i => (i + 1) % searchResults.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex(i => (i <= 0 ? searchResults.length - 1 : i - 1));
            } else if (e.key === 'Enter') {
              // 有高亮项时直接选中它，拦掉表单默认提交；没高亮就交给 form onSubmit 走常规搜索。
              if (activeIndex >= 0 && activeIndex < searchResults.length) {
                e.preventDefault();
                selectSlang(searchResults[activeIndex]);
                setSearchResults([]);
                setActiveIndex(-1);
              }
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setSearchResults([]);
              setActiveIndex(-1);
            }
          }}
          onChange={(e) => {
            const val = e.target.value;
            setSearchTerm(val);
            latestTypeaheadRef.current = val;
            // 每次改输入，联想列表会重算，旧高亮下标失效，归零。
            setActiveIndex(-1);
            // 修复（2026-06-11）：看过词条后 currentSlang 一直挂着，而联想
            // 下拉的渲染条件要求 !currentSlang —— 导致点开过任何词条后联想
            // 永久失灵。打字=开始新搜索，离开当前词条页回到联想态。
            if (currentSlang && val.trim() !== currentSlang.term) {
              setCurrentSlang(null);
              setMeanings([]);
            }
            // Typeahead suggestions
            if (val.trim()) {
              const q = val.trim().toLowerCase();
              // If cache not loaded yet, load it now
              if (allSlangCache.length === 0) {
                getDocs(collection(db, 'slangs')).then(snap => {
                  const slangs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Slang));
                  setAllSlangCache(slangs);
                  // 修复（2026-06-11）缓存竞态：之前加载完只存缓存不出结果，
                  // 用户打完字下拉一直是空的。加载完成后用「此刻」输入框的
                  // 最新内容立刻补算一次联想。
                  const cur = (latestTypeaheadRef.current || '').trim().toLowerCase();
                  if (cur) {
                    const late = slangs
                      .filter(s => ((s as any).termLower || s.term.toLowerCase()).includes(cur))
                      .slice(0, 8);
                    if (late.length > 0) setSearchResults(late);
                  }
                });
              }
              const suggestions = allSlangCache
                .filter(s => s.term.toLowerCase().includes(q))
                .map(s => {
                  const ms = meaningsBySlangId[s.id] || [];
                  const totalUpvotes = ms.reduce((sum, m) => sum + m.upvotes, 0);
                  return { ...s, topMeaning: ms[0]?.meaning, totalUpvotes };
                })
                .sort((a, b) => (b.totalUpvotes || 0) - (a.totalUpvotes || 0))
                .slice(0, 8);
              // 修复（2026-06-11）：原来这里还有 && !currentSlang 守卫，但它读的是
              // 本次事件闭包里的旧值 —— 上面刚 setCurrentSlang(null) 在这里看不见，
              // 算好的联想被原地扔掉（词条页打字联想永远不出来）。打字即新搜索，
              // currentSlang 已在上方清空，这个守卫已无存在意义。
              setSearchResults(suggestions);
            } else {
              setSearchResults([]);
            }
          }}
          onFocus={() => {
            if (searchTerm.trim() && allSlangCache.length > 0 && !currentSlang) {
              const q = searchTerm.trim().toLowerCase();
              const suggestions = allSlangCache.filter(s => s.term.toLowerCase().includes(q)).slice(0, 6);
              if (suggestions.length > 0) {
                setSearchResults(suggestions);
                setActiveIndex(-1);
              }
            }
          }}
          placeholder={uiLang === 'zh' ? '搜索网络热词、梗…' : 'Search internet slang, memes…'}
          className="w-full surface !rounded-[14px] py-[14px] pl-12 pr-4 outline-none font-zh-serif text-[15px] text-[var(--ink)] placeholder:font-display placeholder:italic placeholder:text-[var(--ink-subtle)] focus:border-[var(--blue-accent)] focus:ring-[3px] focus:ring-[rgba(91,127,232,0.15)] transition-all"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--ink-muted)]" />
        {searchTerm && (
          <button
            type="button"
            onClick={() => { setSearchTerm(''); setCurrentSlang(null); setMeanings([]); setShowAddForm(false); }}
            className="absolute right-24 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink-body)] p-1"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={isSearching || !searchTerm.trim()}
          aria-label={uiLang === 'zh' ? '搜索' : 'Search'}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-h-[44px] min-w-[44px] bg-[var(--ink)] text-white px-[18px] py-[8px] rounded-[10px] font-zh-serif text-[13px] font-bold hover:bg-[#1a2440] disabled:opacity-50 transition-colors"
        >
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : (uiLang === 'zh' ? '搜索' : 'Search')}
        </button>
      </form>

      {/* Search results / typeahead */}
      {searchResults.length > 0 && !currentSlang && searchTerm.trim() && (
        <div
          id="slang-typeahead-listbox"
          role="listbox"
          aria-label={uiLang === 'zh' ? '搜索联想结果' : 'Search suggestions'}
          className="absolute left-0 right-0 z-[var(--z-dropdown)] bg-white rounded-[18px] border border-[var(--ink-hairline)] shadow-[0_12px_36px_rgba(91,127,232,0.18)] overflow-hidden mt-1.5 max-h-80 overflow-y-auto"
        >
          <div className="px-4 py-[10px] bg-[rgba(244,247,255,0.8)] font-mono-meta text-[10px] font-semibold tracking-[0.18em] uppercase text-[var(--ink-muted)] border-b border-[var(--ink-hairline)]">
            {uiLang === 'zh' ? `找到 ${searchResults.length} 个相关词条` : `${searchResults.length} matches`}
          </div>
          {searchResults.map((s, idx) => {
            // 社区深度信号：用 meaningsBySlangId 拿到该词的释义数量（cache 已有，不是新 Firestore 查询）。
            const meaningCount = (meaningsBySlangId[s.id] || []).length;
            const totalUp = s.totalUpvotes || 0;
            const isActive = idx === activeIndex;
            return (
              <button
                key={s.id}
                id={`slang-option-${idx}`}
                role="option"
                aria-selected={isActive}
                ref={(el) => { if (isActive && el) el.scrollIntoView({ block: 'nearest' }); }}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => { selectSlang(s); setSearchResults([]); setActiveIndex(-1); }}
                className={cn(
                  "w-full text-left px-4 py-3 transition-colors border-b border-[rgba(10,14,26,0.04)] last:border-0",
                  isActive ? "bg-[rgba(91,127,232,0.1)]" : "hover:bg-[rgba(91,127,232,0.06)]"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display font-semibold text-[15px] text-[var(--ink)] shrink-0">{s.term}</span>
                  {(meaningCount > 0 || totalUp > 0) && (
                    <span className="font-mono-meta text-[11px] text-[var(--ink-muted)] whitespace-nowrap">
                      {meaningCount > 0 && (
                        <>
                          {meaningCount} {uiLang === 'zh' ? '种解释' : meaningCount === 1 ? 'meaning' : 'meanings'}
                        </>
                      )}
                      {meaningCount > 0 && totalUp > 0 && <span className="mx-1">·</span>}
                      {totalUp > 0 && <>❤️ {totalUp}</>}
                    </span>
                  )}
                </div>
                {s.topMeaning && (
                  <p className="font-zh-serif text-[12.5px] text-[var(--ink-body)] mt-[3px] line-clamp-1">{s.topMeaning}</p>
                )}
              </button>
            );
          })}
        </div>
      )}
      </div>

      {/* Weekly trending — collapsible. When collapsed, the outer container
          tightens (px-4 py-2, no mb-3 on the button) so it doesn't look like
          a half-empty card. When expanded it grows back to p-4 with breathing
          room above the list. */}
      {!currentSlang && !showAddForm && trendingTerms.length > 0 && (
        <div className={cn(
          "surface transition-[padding] duration-200",
          trendingCollapsed ? "!rounded-[14px] px-4 py-2.5" : "!rounded-[14px] p-4 sm:p-5"
        )}>
          <button
            onClick={toggleTrendingCollapsed}
            className={cn(
              "flex items-center gap-2 text-[15px] font-zh-sans font-bold text-[var(--ink)] hover:text-[var(--blue-accent)] transition-colors w-full",
              !trendingCollapsed && "mb-3"
            )}
            aria-expanded={!trendingCollapsed}
          >
            <span className="font-display italic text-[14px] font-medium text-[var(--ink-muted)]">— trending this week</span>
            <span className="font-zh-sans font-light text-[11px] tracking-[0.12em] text-[var(--ink-subtle)]">
              {uiLang === 'zh' ? '大家都在搜' : ''}
            </span>
            <span className="ml-auto">
              {trendingCollapsed
                ? <ChevronDown className="w-4 h-4" />
                : <ChevronUp className="w-4 h-4" />}
            </span>
          </button>
          <AnimatePresence initial={false}>
            {!trendingCollapsed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-1.5">
                  {trendingTerms.map((item, idx) => (
                    <button
                      key={item.term}
                      onClick={() => doSearch(item.term)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[rgba(91,127,232,0.08)] transition-colors text-left"
                    >
                      {/* Previously red/orange/yellow/gray — retired the
                          rainbow in favor of a monochrome blue gradient so
                          the ranking badges don't fight the rest of the
                          page's blue palette. Depth still conveys rank. */}
                      <span className={cn(
                        "w-6 h-6 rounded-[7px] flex items-center justify-center text-[11px] font-bold font-display",
                        idx === 0 ? "bg-[#0A0E1A] text-white" :
                        idx === 1 ? "bg-[rgba(91,127,232,0.18)] text-[var(--blue-accent)]" :
                        idx === 2 ? "bg-[rgba(91,127,232,0.1)] text-[var(--blue-accent)]" :
                        "bg-[rgba(10,14,26,0.05)] text-[var(--ink-muted)]"
                      )}>
                        {idx + 1}
                      </span>
                      <span className="flex-1 font-zh-serif font-medium text-[14px] text-[var(--ink)]">{item.term}</span>
                      <span className="font-mono-meta text-[11px] text-[var(--ink-muted)]">{item.count} {uiLang === 'zh' ? '次' : 'searches'}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Feed: browse + guidelines (shown when no search active) */}
      {!searchTerm && !currentSlang && !showAddForm && (
        <div className="space-y-4">
          {/* Browse entries — collapsible. Clicking the title bar toggles
              the tag list below; preference is persisted so users who
              always want it collapsed only have to click once. */}
          {recentSlangs.length > 0 && (
            <div>
              <button
                onClick={toggleBrowseCollapsed}
                className="flex items-center gap-1.5 text-sm font-bold text-[var(--ink-muted)] hover:text-[var(--ink-body)] transition-colors mb-3"
                aria-expanded={!browseCollapsed}
              >
                <span>{uiLang === 'zh' ? '浏览词条' : 'Browse Entries'}</span>
                {browseCollapsed
                  ? <ChevronDown className="w-4 h-4" />
                  : <ChevronUp className="w-4 h-4" />}
              </button>
              <AnimatePresence initial={false}>
                {!browseCollapsed && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap gap-2">
                      {recentSlangs.map((slang) => (
                        <button
                          key={slang.id}
                          onClick={() => doSearch(slang.term)}
                          className="px-3 py-1.5 bg-[rgba(10,14,26,0.04)] border border-[var(--ink-hairline)] rounded-full text-[13px] font-zh-serif text-[var(--ink-body)] hover:bg-[rgba(91,127,232,0.08)] hover:border-[rgba(91,127,232,0.4)] hover:text-[var(--blue-accent)] transition-colors"
                        >
                          {slang.term}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Guidelines toggle — aligned with slang-dictionary.html .guide-link (em-dash + italic Clash Display) */}
          {auth.currentUser && (
            <button
              onClick={() => setShowGuidelines(!showGuidelines)}
              className="font-display italic text-[13px] text-[var(--blue-accent)] hover:text-[var(--blue-accent-deep)] flex items-center gap-1 mx-2 mb-6"
            >
              {showGuidelines
                ? (uiLang === 'zh' ? '— 收起贡献准则' : '— hide guidelines')
                : (uiLang === 'zh' ? '— view contribution guidelines · 查看贡献准则' : '— view contribution guidelines')}
            </button>
          )}
          <AnimatePresence>
            {showGuidelines && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="surface !rounded-[14px] !border-l-[3px] !border-l-[var(--blue-accent)] p-5 my-3">
                  <h4 className="font-display italic text-[14px] font-semibold text-[var(--ink-body)] mb-3">
                    — {uiLang === 'zh' ? 'how to write a good entry · 投稿准则' : 'how to write a good entry'}
                  </h4>
                  <ul className="list-none p-0 m-0 space-y-2 font-zh-serif text-[13px] leading-[1.85] text-[var(--ink-body)]">
                    <li className="flex gap-2"><span className="text-[var(--blue-accent)]">·</span>{uiLang === 'zh' ? '写清楚来源：哪个圈子、什么时候火的' : 'Explain origin: which community, when it peaked'}</li>
                    <li className="flex gap-2"><span className="text-[var(--blue-accent)]">·</span>{uiLang === 'zh' ? '说明使用场景：在什么情况下用，表达什么情绪' : 'Describe usage: when to use, what emotion it carries'}</li>
                    <li className="flex gap-2"><span className="text-[var(--blue-accent)]">·</span>{uiLang === 'zh' ? '附例句：至少一个真实语境下的例句' : 'Add example: at least one real-context example'}</li>
                    <li className="flex gap-2"><span className="text-[var(--blue-accent)]">·</span>{uiLang === 'zh' ? '不要搬运：抄百度/知乎会扣分' : 'No copy-paste: copying from other sites loses points'}</li>
                    <li className="flex gap-2"><span className="text-[var(--blue-accent)]">·</span>{uiLang === 'zh' ? '遇到低质或违规内容，点右上三点举报' : 'Report low-quality or offensive content via the menu'}</li>
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}


      {searchTerm && !isSearching && !currentSlang && !showAddForm && searchResults.length === 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface rounded-3xl p-8 text-center shadow-sm"
        >
          <MessageSquare className="w-12 h-12 text-[var(--ink-subtle)] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[var(--ink)] mb-2">
            {uiLang === 'zh' ? '未找到该词条' : 'Slang not found'}
          </h3>
          <p className="text-[var(--ink-muted)] mb-6">
            {uiLang === 'zh' ? '成为第一个解释这个梗的人吧！' : 'Be the first to explain this slang!'}
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 bg-[#0A0E1A] text-white px-6 py-3 rounded-xl font-medium hover:bg-[#1a2440] transition-colors shadow-md shadow-[rgba(91,127,232,0.2)]"
          >
            <Plus className="w-5 h-5" />
            {uiLang === 'zh' ? '添加解释' : 'Add Meaning'}
          </button>
        </motion.div>
      )}

      {currentSlang && (
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display font-bold text-[40px] sm:text-[44px] tracking-[-0.03em] text-[var(--ink)] leading-none">
                <em className="italic text-[var(--blue-accent)] font-medium">{currentSlang.term}</em>
              </h2>
              <p className="font-zh-sans font-light text-[11px] tracking-[0.12em] text-[var(--ink-muted)] mt-[6px]">
                {meanings.length} {uiLang === 'zh' ? '条释义' : 'meanings'} · {meanings.reduce((s, m) => s + (m.upvotes || 0), 0)} upvotes · {(() => {
                  const toMs = (v: any): number | null => {
                    if (!v) return null;
                    if (typeof v?.toDate === 'function') return v.toDate().getTime();
                    if (v instanceof Date) return v.getTime();
                    if (typeof v === 'number') return v;
                    return null;
                  };
                  const ts =
                    toMs((currentSlang as any)?.updatedAt) ||
                    toMs((currentSlang as any)?.createdAt) ||
                    toMs(meanings[0]?.createdAt);
                  if (!ts) return uiLang === 'zh' ? '最近' : 'recent';
                  const days = Math.floor((Date.now() - ts) / 86400000);
                  if (days <= 0) return uiLang === 'zh' ? '最新于今天' : 'updated today';
                  return uiLang === 'zh' ? `最新于 ${days} 天前` : `updated ${days}d ago`;
                })()}
              </p>
            </div>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-[6px] text-[var(--blue-accent)] bg-[rgba(91,127,232,0.12)] border border-[rgba(91,127,232,0.3)] hover:bg-[rgba(91,127,232,0.2)] px-[14px] py-[8px] rounded-[12px] font-zh-serif text-[13px] font-bold transition-colors shrink-0"
              >
                <Plus className="w-[14px] h-[14px]" strokeWidth={2.5} />
                {uiLang === 'zh' ? '补充解释' : 'Add Meaning'}
              </button>
            )}
          </div>

          <div className="space-y-4">
            {meanings.map((meaning, index) => (
              <MeaningCard
                key={meaning.id}
                meaning={meaning}
                index={index}
                uiLang={uiLang}
                currentSlangId={currentSlang.id}
                currentSlangTerm={currentSlang.term}
                commentCount={commentCounts[meaning.id] ?? 0}
                isUpvoted={upvotedMeanings.has(meaning.id)}
                isPlaying={playingAudioId === meaning.id}
                isReporting={reportingMeaningId === meaning.id}
                reportReason={reportReason}
                onUpvote={handleUpvote}
                onToggleReport={handleToggleReport}
                onReportReasonChange={setReportReason}
                onReport={handleReport}
                onShare={handleShare}
                onPlayAudio={handlePlayAudio}
                onCommentCountChange={handleCommentCountChange}
              />
            ))}

            {meanings.length === 0 && !showAddForm && (
              <p className="text-center text-[var(--ink-muted)] py-8">
                {uiLang === 'zh' ? '暂无解释，快来添加吧！' : 'No meanings yet, add one!'}
              </p>
            )}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form onSubmit={handleSubmitMeaning} className="glass-thick rounded-[18px] p-6 space-y-4 border-[1.5px] border-[rgba(91,127,232,0.25)]">
              <h3 className="font-display font-semibold text-[20px] tracking-[-0.02em] text-[var(--ink)] m-0">
                {uiLang === 'zh'
                  ? <>补充 <em className="italic text-[var(--blue-accent)] font-medium">{currentSlang?.term || searchTerm}</em> 的解释</>
                  : <>Add a meaning for <em className="italic text-[var(--blue-accent)] font-medium">{currentSlang?.term || searchTerm}</em></>}
              </h3>

              {/* Example reference card — aligned with slang-dictionary.html .example-ref */}
              <div className="bg-[rgba(91,127,232,0.08)] border border-[rgba(91,127,232,0.22)] rounded-[14px] p-[14px_16px] space-y-1.5 mb-[18px]">
                <p className="font-zh-serif font-bold text-[var(--blue-accent)] text-[13px] m-0">{uiLang === 'zh' ? '参考示例' : 'Example for reference'}</p>
                <div className="bg-white/60 rounded-[9px] p-[10px_12px] space-y-1 font-zh-serif text-[12px] leading-[1.8] text-[var(--ink-body)]">
                  <p className="m-0"><span className="font-bold text-[var(--ink)]">{uiLang === 'zh' ? '词条：' : 'Term: '}</span>yyds</p>
                  <p className="m-0"><span className="font-bold text-[var(--ink)]">{uiLang === 'zh' ? '含义：' : 'Meaning: '}</span>{uiLang === 'zh' ? '"永远的神"拼音首字母缩写，源自电竞圈，用于表达对某人或某物的极致推崇。' : '"Forever God" — acronym from Chinese gaming, used to express ultimate admiration.'}</p>
                  <p className="m-0"><span className="font-bold text-[var(--ink)]">{uiLang === 'zh' ? '例句：' : 'Example: '}</span>{uiLang === 'zh' ? '这家面馆的味道真的YYDS，每次路过都要吃。' : 'This noodle shop is YYDS, I eat here every time I pass by.'}</p>
                </div>
                <p className="text-[11px] text-[rgba(10,14,26,0.5)] font-zh-serif m-0">{uiLang === 'zh' ? '写清楚来源、使用场景，像跟朋友解释一样自然就好。' : 'Write naturally, like explaining to a friend.'}</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-[6px]">
                  <label className="block font-zh-serif text-[13px] font-semibold text-[var(--ink-body)]">
                    {uiLang === 'zh' ? '含义 · meaning' : 'Meaning'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const term = currentSlang ? currentSlang.term : searchTerm.trim().toLowerCase();
                      if (term) fetchSuggestion(term, newMeaning, true);
                    }}
                    disabled={isLoadingSuggestion}
                    className="flex items-center gap-[5px] font-display italic text-[12px] font-semibold text-[var(--blue-accent)] hover:text-[var(--blue-accent-deep)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={uiLang === 'zh' ? '让 AI 帮你起个草稿' : 'Let AI draft it for you'}
                  >
                    <Wand2 className="w-[12px] h-[12px]" />
                    {isLoadingSuggestion
                      ? (uiLang === 'zh' ? '生成中…' : 'Drafting…')
                      : (newMeaning.trim()
                          ? (uiLang === 'zh' ? '扩写' : 'Expand')
                          : (uiLang === 'zh' ? '帮我写一条 · AI draft' : 'Draft for me'))}
                  </button>
                </div>
                <textarea
                  value={newMeaning}
                  onChange={(e) => handleMeaningChange(e.target.value)}
                  placeholder={uiLang === 'zh' ? '例：源自电竞圈的缩写，后来在全网流行，用来夸赞...' : 'e.g. An acronym from gaming that went viral, used to praise...'}
                  className="w-full bg-white border border-[var(--ink-hairline)] rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#5B7FE8]/50 min-h-[100px] resize-none"
                  required
                />
                {isLoadingSuggestion && (
                  <span className="flex items-center gap-1 text-xs text-[#5B7FE8] mt-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    AI 思考中...
                  </span>
                )}
                <AnimatePresence>
                  {aiSuggestion && !isLoadingSuggestion && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="mt-2 bg-[rgba(91,127,232,0.08)] border border-[rgba(91,127,232,0.3)] rounded-xl p-3 cursor-pointer hover:bg-[rgba(91,127,232,0.15)] transition-colors group"
                      onClick={() => { setNewMeaning(aiSuggestion); setAiSuggestion(''); }}
                    >
                      <div className="flex items-start gap-2">
                        <Wand2 className="w-4 h-4 text-[#5B7FE8] mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#5B7FE8] mb-1">
                            {uiLang === 'zh' ? 'AI 建议' : 'AI Suggestion'}
                          </p>
                          <p className="text-sm text-[var(--ink-body)] leading-relaxed">{aiSuggestion}</p>
                        </div>
                        <span className="text-[10px] text-[rgba(91,127,232,0.6)] group-hover:text-[#5B7FE8] shrink-0 mt-0.5">
                          {uiLang === 'zh' ? '点击采纳' : 'Click to apply'}
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <div className="flex items-center justify-between mb-[6px]">
                  <label className="block font-zh-serif text-[13px] font-semibold text-[var(--ink-body)]">
                    {uiLang === 'zh' ? '例句 · example' : 'Example'}
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newMeaning.trim()) {
                        setSubmitError(uiLang === 'zh' ? '请先填写含义，AI 需要根据含义生成例句' : 'Please provide meaning first');
                        return;
                      }
                      setIsGeneratingExample(true);
                      setSubmitError('');
                      try {
                        const termToUse = currentSlang ? currentSlang.term : searchTerm.trim().toLowerCase();
                        const example = await generateSlangExample(termToUse, newMeaning);
                        setNewExample(example);
                      } catch (error) {
                        setSubmitError(uiLang === 'zh' ? '生成例句失败，请重试' : 'Failed to generate example');
                      } finally {
                        setIsGeneratingExample(false);
                      }
                    }}
                    disabled={isGeneratingExample}
                    className="font-display italic text-[12px] font-semibold text-[var(--blue-accent)] hover:text-[var(--blue-accent-deep)] flex items-center gap-[5px] disabled:opacity-50"
                  >
                    {isGeneratingExample ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-[12px] h-[12px]" />}
                    {uiLang === 'zh' ? 'AI 帮我写例句' : 'AI Generate'}
                  </button>
                </div>
                <textarea
                  value={newExample}
                  onChange={(e) => setNewExample(e.target.value)}
                  placeholder={uiLang === 'zh' ? '例：这家面馆的味道真的YYDS，每次路过都要吃。' : 'e.g. This noodle shop is YYDS, I eat here every time.'}
                  className="w-full bg-white border border-[var(--ink-hairline)] rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#5B7FE8]/50 min-h-[80px] resize-none"
                />
                <p className="text-xs text-[var(--ink-muted)] mt-1">
                  {uiLang === 'zh' ? '选填。如果不提供例句，词条的审核优先级和质量评分将会降低。' : 'Optional. Without an example, the review priority and quality score will be lower.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-zh-serif text-[13px] font-semibold text-[var(--ink-body)] mb-[6px]">
                    {uiLang === 'zh' ? 'AI 播报语音' : 'AI Voice'}
                  </label>
                  <select
                    value={newVoiceName}
                    onChange={(e) => setNewVoiceName(e.target.value)}
                    disabled={!!audioFile}
                    className="w-full bg-white border border-[var(--ink-hairline)] rounded-xl p-3 outline-none focus:ring-2 focus:ring-[#5B7FE8]/50 disabled:opacity-50"
                  >
                    <option value="Kore">Kore (Female)</option>
                    <option value="Puck">Puck (Male)</option>
                    <option value="Charon">Charon (Male)</option>
                    <option value="Fenrir">Fenrir (Male)</option>
                    <option value="Zephyr">Zephyr (Female)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-zh-serif text-[13px] font-semibold text-[var(--ink-body)] mb-[6px]">
                    {uiLang === 'zh' ? '上传自定义语音（可选）' : 'Upload Custom Voice (Optional)'}
                  </label>
                  <label className="flex items-center justify-center gap-2 bg-white/50 border border-dashed border-[var(--ink-rule)] rounded-xl p-3 cursor-pointer hover:border-[#5B7FE8] hover:bg-[rgba(91,127,232,0.08)]/30 transition-all">
                    <input 
                      type="file" 
                      accept="audio/*" 
                      onChange={handleAudioFileChange} 
                      className="hidden" 
                    />
                    <Mic className={cn("w-4 h-4", audioFile ? "text-[#5B7FE8]" : "text-[var(--ink-muted)]")} />
                    <span className={cn("text-xs truncate max-w-[120px]", audioFile ? "text-[#5B7FE8] font-medium" : "text-[var(--ink-muted)]")}>
                      {audioFile ? audioFile.name : (uiLang === 'zh' ? '上传录音' : 'Upload Audio')}
                    </span>
                    {audioFile && (
                      <button 
                        type="button" 
                        onClick={(e) => { e.preventDefault(); setAudioFile(null); }}
                        className="ml-1 p-0.5 hover:bg-red-100 rounded-full text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-zh-serif text-[13px] font-semibold text-[var(--ink-body)] mb-[6px]">
                  {uiLang === 'zh' ? '附件 · 图片 / 视频 / GIF（可选）' : 'Upload Media (Optional)'}
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex-1 flex items-center justify-center gap-2 bg-white/50 border border-dashed border-[var(--ink-rule)] rounded-xl p-4 cursor-pointer hover:border-[#5B7FE8] hover:bg-[rgba(91,127,232,0.08)]/30 transition-all">
                    <input 
                      type="file" 
                      accept="image/*,video/*,.gif" 
                      onChange={handleFileChange} 
                      className="hidden" 
                    />
                    {mediaFile ? (
                      <span className="text-sm text-[#5B7FE8] font-medium truncate max-w-[200px]">{mediaFile.name}</span>
                    ) : (
                      <>
                        <ImageIcon className="w-5 h-5 text-[var(--ink-muted)]" />
                        <Video className="w-5 h-5 text-[var(--ink-muted)]" />
                        <span className="text-sm text-[var(--ink-muted)]">{uiLang === 'zh' ? '点击上传图片/视频/GIF' : 'Upload Image/Video/GIF'}</span>
                      </>
                    )}
                  </label>
                  {mediaPreview && (
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-[var(--ink-hairline)] shrink-0">
                      {mediaFile?.type.includes('video') ? (
                        <div className="w-full h-full bg-black flex items-center justify-center">
                          <Film className="w-6 h-6 text-white" />
                        </div>
                      ) : (
                        <img src={mediaPreview} alt="Preview" className="w-full h-full object-cover" />
                      )}
                      <button 
                        type="button"
                        onClick={() => { setMediaFile(null); setMediaPreview(null); }}
                        className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl-lg"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-[var(--ink-muted)] mt-1">
                  {uiLang === 'zh' ? '支持格式: JPG, PNG, GIF, MP4 (最大 10MB)' : 'Formats: JPG, PNG, GIF, MP4 (Max 10MB)'}
                </p>
              </div>

              <div className="bg-[rgba(91,127,232,0.08)]/50 border border-[rgba(91,127,232,0.2)] rounded-xl p-3 text-sm text-[#0A0E1A] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#5B7FE8]" />
                <p>
                  {uiLang === 'zh' 
                    ? '提醒：您发布的每个内容都将经过 AI 严格审查，包含仇恨言论、严重脏话或无关垃圾信息的内容将被拒绝。' 
                    : 'Notice: Every content you publish will undergo strict AI review. Content containing hate speech, severe profanity, or irrelevant spam will be rejected.'}
                </p>
              </div>

              {submitError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-xl text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p>{submitError}</p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-[18px] border-t border-[var(--ink-hairline)]">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-[20px] py-[12px] rounded-[13px] bg-transparent border border-[var(--ink-rule)] font-zh-serif text-[13px] font-semibold text-[var(--ink-body)] hover:bg-[rgba(10,14,26,0.04)] transition-colors"
                >
                  {uiLang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploading}
                  className="ml-auto flex items-center gap-[6px] bg-[var(--ink)] text-white px-[26px] py-[12px] rounded-[13px] font-zh-serif text-[14px] font-bold hover:bg-[#1a2440] disabled:opacity-50 transition-colors shadow-[0_4px_12px_rgba(10,14,26,0.22)]"
                >
                  {(isSubmitting || isUploading) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isUploading ? (uiLang === 'zh' ? '上传中...' : 'Uploading...') : (uiLang === 'zh' ? '提交词条 · submit' : 'Submit')}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
