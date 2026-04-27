import { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, History, Ban, X, AlertTriangle, CheckCircle } from 'lucide-react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  getCountFromServer,
  documentId,
  Timestamp,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, auth } from '../firebase';
import type { Language } from '../i18n';

// ──────────────────────────────────────────────────────────────────────────
// Admin console for MemeFlow.
//
// Activation:
//   - URL has `?admin` AND the signed-in user is an admin (custom claim or
//     users/{uid}.role == 'admin'). App.tsx does the gate; this component
//     assumes the check already passed.
//
// All write operations go through Cloud Functions callables — never direct
// client writes. That keeps rule-bypass logic (reputation deltas, audit
// log) in one server-side place.
// ──────────────────────────────────────────────────────────────────────────

type MeaningDoc = {
  id: string;
  slangId: string;
  meaning: string;
  example?: string;
  authorId: string;
  authorName?: string;
  authorTitle?: string;
  upvotes?: number;
  status: 'pending' | 'approved' | 'rejected';
  qualityScore?: number;
  rejectionReason?: string;
  createdAt?: Timestamp;
};

type ReportDoc = {
  id: string;
  meaningId: string;
  reporterId: string;
  reason: string;
  status?: string;
  createdAt?: Timestamp;
};

type Tab = 'pending' | 'reported' | 'browse' | 'import' | 'export' | 'repair';

interface Stats {
  total: number | null;
  pending: number | null;
  reported: number | null;
  approvedToday: number | null;
  contributors: number | null;
}

interface Props {
  uiLang: Language;
  onExit?: () => void;
}

const fns = getFunctions();
const approveFn = httpsCallable<{ meaningId: string }, { ok: boolean }>(fns, 'approveSlangMeaning');
const rejectFn = httpsCallable<{ meaningId: string; reason: string }, { ok: boolean }>(fns, 'rejectSlangMeaning');
const batchApproveFn = httpsCallable<{ meaningIds: string[] }, { approved: number; failed: number }>(fns, 'batchApprove');
const batchRejectFn = httpsCallable<{ meaningIds: string[]; reason: string }, { rejected: number; failed: number }>(fns, 'batchReject');
const dismissReportFn = httpsCallable<{ reportId: string }, { ok: boolean }>(fns, 'dismissReport');

type BulkImportEntry = { term: string; meaning: string; example?: string; authorName?: string };
type BulkImportResult = { created: number; skipped: number; failures: Array<{ term: string; reason: string }> };
const bulkImportFn = httpsCallable<{ entries: BulkImportEntry[] }, BulkImportResult>(fns, 'bulkImportSlangs');

// Export 现在走 cursor 分页：首页 (!cursor) 返回 slangs + totalMeanings + 第一页
// meanings，后续页只带 meanings。前端循环调用直到 hasMore=false，再本地拼完整包。
type ExportPageRequest = { cursor?: number };
type ExportPageResponse = {
  slangs?: Array<Record<string, unknown>>;
  meanings: Array<Record<string, unknown>>;
  hasMore: boolean;
  nextCursor: number | null;
  totalMeanings?: number;
};
const exportAllFn = httpsCallable<ExportPageRequest, ExportPageResponse>(fns, 'exportAllData');

// 新增 mini 操作的 callables
const rescoreFn = httpsCallable<
  { meaningId: string },
  { score: number; reason: string; oldScore: number | null }
>(fns, 'rescoreMeaning');

const banAuthorFn = httpsCallable<
  { authorId: string; reason: string },
  { success: boolean; affectedMeanings: number; truncated?: boolean }
>(fns, 'banAuthor');

const unbanAuthorFn = httpsCallable<
  { authorId: string },
  { success: boolean }
>(fns, 'unbanAuthor');

// Repair tab — 数据健康扫描 + 批量修复
type ScanResult = {
  orphanMeanings: Array<{ meaningId: string; slangId: string; meaning: string }>;
  duplicateTerms: Array<{ term: string; docIds: string[] }>;
  missingAuthor: Array<{ meaningId: string; slangId: string; meaning: string }>;
  missingQualityScore: Array<{ meaningId: string; slangId: string }>;
  totals: { slangs: number; meanings: number };
  truncated?: boolean;
  scannedAt: number;
};
type RepairAction = 'delete_orphans' | 'merge_duplicates' | 'backfill_quality' | 'delete_missing_author';
type RepairResult = { processed: number; failed: Array<{ id: string; reason: string }> };

const scanIssuesFn = httpsCallable<Record<string, never>, ScanResult>(fns, 'scanDataIssues');
const repairIssuesFn = httpsCallable<
  { action: RepairAction; ids?: string[]; groups?: Array<{ term: string; docIds: string[] }> },
  RepairResult
>(fns, 'repairDataIssues');

function aiBand(score: number | undefined): 'hi' | 'mid' | 'low' | null {
  if (typeof score !== 'number') return null;
  if (score >= 90) return 'hi';
  if (score >= 70) return 'mid';
  return 'low';
}

function aiBandColors(band: 'hi' | 'mid' | 'low' | null) {
  if (band === 'hi') return { bg: 'rgba(76,143,59,0.12)', fg: '#2F6317' };
  if (band === 'mid') return { bg: 'rgba(232,180,60,0.18)', fg: '#8A5D0E' };
  if (band === 'low') return { bg: 'rgba(229,56,43,0.12)', fg: 'var(--red-warn)' };
  return { bg: 'rgba(10,14,26,0.06)', fg: 'var(--ink-muted)' };
}

function shortUid(uid: string | undefined): string {
  if (!uid) return '—';
  return uid.length > 10 ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : uid;
}

function fmtRelative(ts: Timestamp | undefined, uiLang: Language): string {
  if (!ts) return '';
  const ms = ts.toMillis();
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return uiLang === 'zh' ? '刚刚' : 'just now';
  if (mins < 60) return uiLang === 'zh' ? `${mins} 分钟前` : `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return uiLang === 'zh' ? `${hrs} 小时前` : `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return uiLang === 'zh' ? `${days} 天前` : `${days}d ago`;
}

export default function AdminPanel({ uiLang, onExit }: Props) {
  // Sentry 全局上下文：AdminPanel 挂载期间所有 Sentry 事件自动带 adminUid。
  // 卸载时清掉避免污染普通用户会话。
  useEffect(() => {
    const adminUid = auth.currentUser?.uid || '';
    const adminEmail = auth.currentUser?.email || '';
    Sentry.setTag('admin', 'true');
    Sentry.setContext('admin', { adminUid, adminEmail });
    return () => {
      Sentry.setTag('admin', undefined as unknown as string);
      Sentry.setContext('admin', null);
    };
  }, []);

  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending] = useState<MeaningDoc[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [reports, setReports] = useState<ReportDoc[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [browseDocs, setBrowseDocs] = useState<MeaningDoc[]>([]);
  const [loadingBrowse, setLoadingBrowse] = useState(false);
  const [browseCursor, setBrowseCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const [browseStatusFilter, setBrowseStatusFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [browseSearch, setBrowseSearch] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [aiFilter, setAiFilter] = useState<'all' | 'hi' | 'mid' | 'low'>('all');
  const [sortMode, setSortMode] = useState<'new' | 'old' | 'score'>('new');

  const [stats, setStats] = useState<Stats>({
    total: null,
    pending: null,
    reported: null,
    approvedToday: null,
    contributors: null,
  });

  // slangId -> term cache, populated on demand from slangs/{id}
  const [termMap, setTermMap] = useState<Record<string, string>>({});

  // mini 操作状态
  const [rescoringIds, setRescoringIds] = useState<Set<string>>(new Set());
  const [authorHistoryTarget, setAuthorHistoryTarget] = useState<{ authorId: string; authorName?: string } | null>(null);
  const [banTarget, setBanTarget] = useState<{ authorId: string; authorName?: string } | null>(null);
  const [banning, setBanning] = useState(false);

  const adminUid = auth.currentUser?.uid || '';
  const adminEmail = auth.currentUser?.email || '';

  // ── Pending subscription (only active when pending tab is in view to
  //    avoid useless listener on unrelated tabs) ──────────────────────────
  useEffect(() => {
    if (tab !== 'pending') return;
    setLoadingPending(true);
    const q = query(
      collection(db, 'slang_meanings'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: MeaningDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MeaningDoc, 'id'>) }));
        setPending(rows);
        setLoadingPending(false);
      },
      (err) => {
        console.error('pending onSnapshot failed:', err);
        Sentry.captureException(err, { tags: { component: 'AdminPanel', op: 'pending.listen' } });
        toast.error(uiLang === 'zh' ? '加载待审核列表失败' : 'Failed to load pending');
        setLoadingPending(false);
      }
    );
    return () => unsub();
  }, [tab, uiLang]);

  // ── Reports subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'reported') return;
    setLoadingReports(true);
    const q = query(collection(db, 'slang_reports'), orderBy('createdAt', 'desc'), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: ReportDoc[] = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<ReportDoc, 'id'>) }))
          .filter((r) => r.status !== 'dismissed');
        setReports(rows);
        setLoadingReports(false);
      },
      (err) => {
        console.error('reports onSnapshot failed:', err);
        Sentry.captureException(err, { tags: { component: 'AdminPanel', op: 'reports.listen' } });
        toast.error(uiLang === 'zh' ? '加载举报列表失败' : 'Failed to load reports');
        setLoadingReports(false);
      }
    );
    return () => unsub();
  }, [tab, uiLang]);

  // ── Browse (paginated, 50 per page, filtered by status) ────────────────
  // Cursor-based pagination with Firestore startAfter. Page size 50 keeps
  // the list manageable and Firestore query cost low. Status filter uses
  // a where() clause; "all" skips the where. Search is client-side over
  // meaning/example text (after the current page loads).
  const BROWSE_PAGE_SIZE = 50;

  const loadBrowsePage = useCallback(async (reset = false) => {
    setLoadingBrowse(true);
    try {
      const col = collection(db, 'slang_meanings');
      const constraints: any[] = [];
      if (browseStatusFilter !== 'all') constraints.push(where('status', '==', browseStatusFilter));
      constraints.push(orderBy('createdAt', 'desc'));
      if (!reset && browseCursor) constraints.push(startAfter(browseCursor));
      constraints.push(limit(BROWSE_PAGE_SIZE + 1));
      const snap = await getDocs(query(col, ...constraints));
      const allDocs = snap.docs;
      const hasMore = allDocs.length > BROWSE_PAGE_SIZE;
      const pageDocs = hasMore ? allDocs.slice(0, BROWSE_PAGE_SIZE) : allDocs;
      const rows = pageDocs.map((d) => ({ id: d.id, ...(d.data() as Omit<MeaningDoc, 'id'>) }));
      setBrowseDocs((prev) => (reset ? rows : [...prev, ...rows]));
      setBrowseCursor(pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null);
      setBrowseHasMore(hasMore);
    } catch (err) {
      console.error('browse load failed:', err);
      Sentry.captureException(err, { tags: { component: 'AdminPanel', op: 'browse.get' } });
      toast.error(uiLang === 'zh' ? '加载列表失败' : 'Failed to load list');
    } finally {
      setLoadingBrowse(false);
    }
  }, [browseCursor, browseStatusFilter, uiLang]);

  // Reset + reload when tab opens or filter changes
  useEffect(() => {
    if (tab !== 'browse') return;
    setBrowseCursor(null);
    setBrowseHasMore(false);
    setBrowseDocs([]);
    loadBrowsePage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, browseStatusFilter]);

  const filteredBrowseDocs = useMemo(() => {
    const q = browseSearch.trim().toLowerCase();
    if (!q) return browseDocs;
    return browseDocs.filter(
      (m) =>
        (m.meaning || '').toLowerCase().includes(q) ||
        (m.example || '').toLowerCase().includes(q) ||
        (termMap[m.slangId] || m.slangId).toLowerCase().includes(q),
    );
  }, [browseDocs, browseSearch, termMap]);

  // ── Stats ──────────────────────────────────────────────────────────────
  const loadStats = useCallback(async () => {
    try {
      const meanings = collection(db, 'slang_meanings');
      const reportsCol = collection(db, 'slang_reports');

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [totalSnap, pendSnap, reportedSnap, approvedSnap] = await Promise.all([
        getCountFromServer(meanings),
        getCountFromServer(query(meanings, where('status', '==', 'pending'))),
        getCountFromServer(reportsCol),
        getCountFromServer(
          query(
            meanings,
            where('status', '==', 'approved'),
            where('approvedAt', '>=', Timestamp.fromDate(startOfDay))
          )
        ).catch(() => ({ data: () => ({ count: 0 }) }) as unknown as Awaited<ReturnType<typeof getCountFromServer>>),
      ]);

      // Contributors — unique authorIds. No aggregate, so sample up to 500.
      let contributors = 0;
      try {
        const sample = await getDocs(query(meanings, limit(500)));
        const uniq = new Set<string>();
        sample.docs.forEach((d) => {
          const a = (d.data() as { authorId?: string }).authorId;
          if (a) uniq.add(a);
        });
        contributors = uniq.size;
      } catch {
        contributors = 0;
      }

      setStats({
        total: totalSnap.data().count,
        pending: pendSnap.data().count,
        reported: reportedSnap.data().count,
        approvedToday: approvedSnap.data().count,
        contributors,
      });
    } catch (e) {
      console.error('loadStats failed:', e);
      Sentry.captureException(e, { tags: { component: 'AdminPanel', op: 'stats' } });
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats, pending.length, reports.length]);

  // ── Resolve slangId → term (batched in chunks of 10 for `in` query) ───
  useEffect(() => {
    const need = new Set<string>();
    [...pending, ...browseDocs].forEach((m) => {
      if (m.slangId && !termMap[m.slangId]) need.add(m.slangId);
    });
    if (need.size === 0) return;
    const ids = Array.from(need).slice(0, 30);
    // Firestore `in` caps at 30 values per query; batch if needed
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
    Promise.all(
      chunks.map((c) =>
        getDocs(query(collection(db, 'slangs'), where(documentId(), 'in', c))).catch(() => null)
      )
    ).then((snaps) => {
      const next: Record<string, string> = {};
      snaps.forEach((snap) => {
        if (!snap) return;
        snap.docs.forEach((d) => {
          const term = (d.data() as { term?: string }).term;
          if (term) next[d.id] = term;
        });
      });
      if (Object.keys(next).length > 0) {
        setTermMap((prev) => ({ ...prev, ...next }));
      }
    });
  }, [pending, browseDocs, termMap]);

  // ── Filtered pending ──────────────────────────────────────────────────
  const filteredPending = useMemo(() => {
    let rows = pending;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => {
        const term = (termMap[r.slangId] || '').toLowerCase();
        const name = (r.authorName || '').toLowerCase();
        return term.includes(q) || name.includes(q) || r.meaning.toLowerCase().includes(q);
      });
    }
    if (aiFilter !== 'all') {
      rows = rows.filter((r) => aiBand(r.qualityScore) === aiFilter);
    }
    if (sortMode === 'old') {
      rows = [...rows].sort((a, b) => (a.createdAt?.toMillis() || 0) - (b.createdAt?.toMillis() || 0));
    } else if (sortMode === 'score') {
      rows = [...rows].sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));
    }
    return rows;
  }, [pending, search, aiFilter, sortMode, termMap]);

  // ── Selection helpers ─────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  // ── Action handlers ────────────────────────────────────────────────────
  const handleApprove = async (meaningId: string) => {
    try {
      await approveFn({ meaningId });
      toast.success(uiLang === 'zh' ? '已通过' : 'Approved');
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(meaningId);
        return next;
      });
    } catch (e) {
      console.error('approve failed:', e);
      Sentry.captureException(e, { tags: { component: 'AdminPanel', op: 'approve' } });
      toast.error(uiLang === 'zh' ? '通过失败，稍后重试' : 'Approve failed');
    }
  };

  const handleReject = async (meaningId: string) => {
    const reason = window.prompt(uiLang === 'zh' ? '请输入拒绝理由（必填，小于 500 字）：' : 'Rejection reason (required, <500 chars):');
    if (!reason || !reason.trim()) {
      toast.info(uiLang === 'zh' ? '已取消' : 'Cancelled');
      return;
    }
    try {
      await rejectFn({ meaningId, reason: reason.trim().slice(0, 490) });
      toast.success(uiLang === 'zh' ? '已拒绝' : 'Rejected');
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(meaningId);
        return next;
      });
    } catch (e) {
      console.error('reject failed:', e);
      Sentry.captureException(e, { tags: { component: 'AdminPanel', op: 'reject' } });
      toast.error(uiLang === 'zh' ? '拒绝失败，稍后重试' : 'Reject failed');
    }
  };

  const handleBatchApprove = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (ids.length > 50) {
      toast.error(uiLang === 'zh' ? '单批最多 50 条' : 'Max 50 per batch');
      return;
    }
    try {
      const res = await batchApproveFn({ meaningIds: ids });
      const { approved, failed } = res.data || { approved: 0, failed: 0 };
      toast.success(
        uiLang === 'zh'
          ? `批量通过：成功 ${approved}，失败 ${failed}`
          : `Batch approved: ${approved} ok, ${failed} failed`
      );
      clearSelection();
    } catch (e) {
      console.error('batchApprove failed:', e);
      Sentry.captureException(e, { tags: { component: 'AdminPanel', op: 'batchApprove' } });
      toast.error(uiLang === 'zh' ? '批量通过失败' : 'Batch approve failed');
    }
  };

  const handleBatchReject = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (ids.length > 50) {
      toast.error(uiLang === 'zh' ? '单批最多 50 条' : 'Max 50 per batch');
      return;
    }
    const reason = window.prompt(uiLang === 'zh' ? `批量拒绝 ${ids.length} 条，请输入共同理由：` : `Batch reject ${ids.length}. Reason:`);
    if (!reason || !reason.trim()) {
      toast.info(uiLang === 'zh' ? '已取消' : 'Cancelled');
      return;
    }
    try {
      const res = await batchRejectFn({ meaningIds: ids, reason: reason.trim().slice(0, 490) });
      const { rejected, failed } = res.data || { rejected: 0, failed: 0 };
      toast.success(
        uiLang === 'zh'
          ? `批量拒绝：成功 ${rejected}，失败 ${failed}`
          : `Batch rejected: ${rejected} ok, ${failed} failed`
      );
      clearSelection();
    } catch (e) {
      console.error('batchReject failed:', e);
      Sentry.captureException(e, { tags: { component: 'AdminPanel', op: 'batchReject' } });
      toast.error(uiLang === 'zh' ? '批量拒绝失败' : 'Batch reject failed');
    }
  };

  const handleDismissReport = async (reportId: string) => {
    try {
      await dismissReportFn({ reportId });
      toast.success(uiLang === 'zh' ? '已驳回举报' : 'Report dismissed');
    } catch (e) {
      console.error('dismissReport failed:', e);
      Sentry.captureException(e, { tags: { component: 'AdminPanel', op: 'dismissReport' } });
      toast.error(uiLang === 'zh' ? '驳回失败' : 'Dismiss failed');
    }
  };

  // ── Mini 操作：AI 重新评分 ────────────────────────────────────────────
  const handleRescore = async (meaningId: string) => {
    if (rescoringIds.has(meaningId)) return;
    setRescoringIds((prev) => {
      const next = new Set(prev);
      next.add(meaningId);
      return next;
    });
    try {
      const res = await rescoreFn({ meaningId });
      const { score, reason, oldScore } = res.data;
      const prefix = oldScore !== null ? `${oldScore} → ${score}` : `${score}`;
      toast.success(
        uiLang === 'zh'
          ? `重新评分：${prefix}${reason ? `（${reason}）` : ''}`
          : `Rescored: ${prefix}${reason ? ` (${reason})` : ''}`,
        { duration: 6000 }
      );
    } catch (e) {
      console.error('rescore failed:', e);
      Sentry.captureException(e, { tags: { component: 'AdminPanel', op: 'rescore' } });
      toast.error(uiLang === 'zh' ? 'AI 重新评分失败' : 'Rescore failed');
    } finally {
      setRescoringIds((prev) => {
        const next = new Set(prev);
        next.delete(meaningId);
        return next;
      });
    }
  };

  // ── Mini 操作：查看作者历史（打开弹窗）────────────────────────────────
  const openAuthorHistory = (authorId: string, authorName?: string) => {
    if (!authorId) {
      toast.error(uiLang === 'zh' ? '该条缺少 authorId' : 'Missing authorId');
      return;
    }
    setAuthorHistoryTarget({ authorId, authorName });
  };

  // ── Mini 操作：封禁作者（打开二次确认弹窗）────────────────────────────
  const askBanAuthor = (authorId: string, authorName?: string) => {
    if (!authorId) {
      toast.error(uiLang === 'zh' ? '该条缺少 authorId' : 'Missing authorId');
      return;
    }
    if (authorId === adminUid) {
      toast.error(uiLang === 'zh' ? '不能封禁自己' : 'Cannot ban yourself');
      return;
    }
    setBanTarget({ authorId, authorName });
  };

  const confirmBanAuthor = async (reason: string) => {
    if (!banTarget) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.info(uiLang === 'zh' ? '请输入封禁理由' : 'Reason required');
      return;
    }
    setBanning(true);
    try {
      const res = await banAuthorFn({
        authorId: banTarget.authorId,
        reason: trimmed.slice(0, 490),
      });
      const { affectedMeanings, truncated } = res.data;
      toast.success(
        uiLang === 'zh'
          ? `已封禁${banTarget.authorName ? ` ${banTarget.authorName}` : ''}，连带拒绝 ${affectedMeanings} 条 pending${truncated ? '（已截断，可能还有残留）' : ''}`
          : `Banned${banTarget.authorName ? ` ${banTarget.authorName}` : ''}. Rejected ${affectedMeanings} pending${truncated ? ' (truncated)' : ''}`,
        { duration: 6000 }
      );
      setBanTarget(null);
    } catch (e) {
      console.error('banAuthor failed:', e);
      Sentry.captureException(e, { tags: { component: 'AdminPanel', op: 'banAuthor' } });
      toast.error(uiLang === 'zh' ? '封禁失败，稍后重试' : 'Ban failed');
    } finally {
      setBanning(false);
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────
  const T = (zh: string, en: string) => (uiLang === 'zh' ? zh : en);

  const renderStats = () => (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
      <StatCell label={T('总词条', 'TOTAL')} value={stats.total} />
      <StatCell label={T('待审核', 'PENDING')} value={stats.pending} accent="#C9940F" numColor="#8A5D0E" />
      <StatCell label={T('举报', 'REPORTED')} value={stats.reported} accent="var(--red-warn)" numColor="var(--red-warn)" />
      <StatCell
        label={T('今日通过', 'APPROVED TODAY')}
        value={stats.approvedToday}
        accent="var(--green-ok)"
        numColor="var(--green-ok)"
      />
      <StatCell label={T('贡献者', 'CONTRIBUTORS')} value={stats.contributors} />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--ink-rule, #F2F4F9)' }}>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        {/* HEAD */}
        <div
          className="flex items-center gap-3 p-4 md:p-5 mb-5 rounded-xl bg-white"
          style={{ border: '1px solid var(--ink-hairline)', borderLeft: '3px solid var(--red-warn)' }}
        >
          <div
            className="w-9 h-9 rounded-[11px] flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(229,56,43,0.12)', color: 'var(--red-warn)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
          </div>
          <div className="min-w-0">
            <h2 className="font-black text-lg md:text-xl tracking-tight" style={{ color: 'var(--ink)' }}>
              {T('MemeFlow 管理后台', 'MemeFlow Admin')}
            </h2>
            <div className="text-[11.5px] font-mono" style={{ color: 'var(--ink-muted)' }}>
              {T('需 admin 身份 · 所有操作走 Cloud Function + 审计日志', 'admin only · mutations via Cloud Functions + audit log')}
            </div>
          </div>
          <span
            className="ml-auto hidden md:inline-flex items-center gap-1.5 font-mono text-[11px] px-2.5 py-1.5 rounded-lg"
            style={{ color: 'var(--red-warn)', background: 'rgba(229,56,43,0.08)', border: '1px solid rgba(229,56,43,0.25)' }}
          >
            {shortUid(adminUid)}
            {adminEmail ? ` · ${adminEmail}` : ''}
          </span>
          {onExit && (
            <button
              onClick={onExit}
              className="ml-2 px-3 py-1.5 rounded-lg text-[12px] font-semibold"
              style={{ background: 'transparent', border: '1px solid var(--ink-hairline)', color: 'var(--ink-body)' }}
            >
              {T('退出', 'Exit')}
            </button>
          )}
        </div>

        {renderStats()}

        {/* TABS */}
        <div className="flex gap-0 border-b mb-5 overflow-x-auto" style={{ borderColor: 'var(--ink-rule)' }}>
          <TabBtn on={tab === 'pending'} onClick={() => setTab('pending')} label={T('待审核', 'Pending')} badge={stats.pending} />
          <TabBtn on={tab === 'reported'} onClick={() => setTab('reported')} label={T('举报', 'Reported')} badge={stats.reported} />
          <TabBtn on={tab === 'browse'} onClick={() => setTab('browse')} label={T('浏览全部', 'Browse')} />
          <TabBtn on={tab === 'import'} onClick={() => setTab('import')} label={T('导入', 'Import')} />
          <TabBtn on={tab === 'export'} onClick={() => setTab('export')} label={T('导出', 'Export')} />
          <TabBtn on={tab === 'repair'} onClick={() => setTab('repair')} label={T('修复数据', 'Repair')} />
        </div>

        {tab === 'pending' && (
          <>
            {/* FILTER */}
            <div className="flex gap-2.5 flex-wrap items-center p-3 mb-4 bg-white rounded-xl" style={{ border: '1px solid var(--ink-hairline)' }}>
              <input
                type="search"
                placeholder={T('搜索词条或作者…', 'Search term or author…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 rounded-[10px] bg-transparent outline-none text-[13.5px]"
                style={{ border: '1px solid var(--ink-hairline)', color: 'var(--ink)', fontFamily: '"Noto Serif SC", serif' }}
              />
              <select
                value={aiFilter}
                onChange={(e) => setAiFilter(e.target.value as typeof aiFilter)}
                className="px-3 py-2 rounded-[10px] bg-white outline-none text-[13px] cursor-pointer"
                style={{ border: '1px solid var(--ink-hairline)', color: 'var(--ink)' }}
              >
                <option value="all">{T('AI 评分：全部', 'AI score: all')}</option>
                <option value="hi">{T('≥ 90（高质）', '≥ 90')}</option>
                <option value="mid">{T('70-89（复核）', '70-89')}</option>
                <option value="low">{T('< 70（建议拒绝）', '< 70')}</option>
              </select>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as typeof sortMode)}
                className="px-3 py-2 rounded-[10px] bg-white outline-none text-[13px] cursor-pointer"
                style={{ border: '1px solid var(--ink-hairline)', color: 'var(--ink)' }}
              >
                <option value="new">{T('时间：最新', 'Newest')}</option>
                <option value="old">{T('时间：最早', 'Oldest')}</option>
                <option value="score">{T('评分：高到低', 'Score ↓')}</option>
              </select>
            </div>

            {/* BATCH BAR */}
            {selected.size > 0 && (
              <div
                className="flex gap-2.5 items-center p-3 mb-3.5 rounded-xl"
                style={{ border: '1px solid var(--ink-hairline)', borderLeft: '3px solid var(--blue-accent)', background: 'rgba(91,127,232,0.04)' }}
              >
                <span className="font-bold text-[14px]" style={{ color: 'var(--blue-accent)' }}>
                  {T(`已选 ${selected.size} 条`, `${selected.size} selected`)}
                </span>
                <button onClick={handleBatchApprove} className="px-4 py-2 rounded-[10px] font-bold text-[13px] text-white" style={{ background: 'var(--green-ok)' }}>
                  {T('批量通过', 'Approve all')}
                </button>
                <button onClick={handleBatchReject} className="px-4 py-2 rounded-[10px] font-bold text-[13px] text-white" style={{ background: 'var(--red-warn)' }}>
                  {T('批量拒绝', 'Reject all')}
                </button>
                <button onClick={clearSelection} className="ml-auto px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold" style={{ background: 'transparent', border: '1px solid var(--ink-hairline)', color: 'var(--ink-body)' }}>
                  {T('清除选择', 'Clear')}
                </button>
              </div>
            )}

            {/* PENDING LIST */}
            {loadingPending ? (
              <div className="py-12 text-center text-[13px]" style={{ color: 'var(--ink-muted)' }}>
                {T('加载中…', 'Loading…')}
              </div>
            ) : filteredPending.length === 0 ? (
              <div className="py-12 text-center text-[13px]" style={{ color: 'var(--ink-muted)' }}>
                {T('没有待审核的词条 🎉', 'No pending meanings 🎉')}
              </div>
            ) : (
              filteredPending.map((m) => (
                <PendingCard
                  key={m.id}
                  m={m}
                  term={termMap[m.slangId]}
                  selected={selected.has(m.id)}
                  rescoring={rescoringIds.has(m.id)}
                  onToggle={() => toggleSelect(m.id)}
                  onApprove={() => handleApprove(m.id)}
                  onReject={() => handleReject(m.id)}
                  onRescore={() => handleRescore(m.id)}
                  onViewAuthor={() => openAuthorHistory(m.authorId, m.authorName)}
                  onBanAuthor={() => askBanAuthor(m.authorId, m.authorName)}
                  uiLang={uiLang}
                />
              ))
            )}
          </>
        )}

        {tab === 'reported' && (
          <>
            {loadingReports ? (
              <div className="py-12 text-center text-[13px]" style={{ color: 'var(--ink-muted)' }}>
                {T('加载中…', 'Loading…')}
              </div>
            ) : reports.length === 0 ? (
              <div className="py-12 text-center text-[13px]" style={{ color: 'var(--ink-muted)' }}>
                {T('没有待处理的举报 ✅', 'No pending reports ✅')}
              </div>
            ) : (
              reports.map((r) => (
                <div
                  key={r.id}
                  className="p-5 mb-3 bg-white rounded-xl"
                  style={{ border: '1px solid var(--ink-hairline)', borderLeft: '3px solid var(--red-warn)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-mono font-extrabold px-2 py-0.5 rounded" style={{ background: 'rgba(229,56,43,0.15)', color: 'var(--red-warn)', letterSpacing: '0.12em' }}>
                      REPORT
                    </span>
                    <span className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
                      {fmtRelative(r.createdAt, uiLang)} · {T('举报人', 'reporter')}: <span className="font-mono">{shortUid(r.reporterId)}</span>
                    </span>
                  </div>
                  <div className="p-3 rounded-[10px] mb-3" style={{ background: 'rgba(229,56,43,0.06)', border: '1px solid rgba(229,56,43,0.25)' }}>
                    <div className="text-[12.5px] font-bold mb-1" style={{ color: 'var(--red-warn)' }}>
                      {T('举报原因', 'Reason')}
                    </div>
                    <div className="text-[13.5px]" style={{ color: 'var(--ink-body)', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.7 }}>
                      {r.reason}
                    </div>
                  </div>
                  <div className="text-[12px] font-mono mb-3" style={{ color: 'var(--ink-muted)' }}>
                    meaningId: {r.meaningId}
                  </div>
                  <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid var(--ink-hairline)' }}>
                    <button
                      onClick={async () => {
                        // meaningId 不是 slangId 也不是 term — 要先 lookup：
                        //   meanings/{meaningId} → slangId
                        //   slangs/{slangId}     → term
                        // 然后跳 /?slang=<term>，主应用读这个参数走 SlangDictionary 搜索。
                        try {
                          const meaningSnap = await getDocs(
                            query(collection(db, 'slang_meanings'), where(documentId(), '==', r.meaningId))
                          );
                          const slangId = meaningSnap.docs[0]?.data()?.slangId;
                          if (!slangId) {
                            toast.error(T('该条 meaning 已被删除', 'Meaning has been deleted'));
                            return;
                          }
                          const slangSnap = await getDocs(
                            query(collection(db, 'slangs'), where(documentId(), '==', slangId))
                          );
                          const term = slangSnap.docs[0]?.data()?.term;
                          if (!term) {
                            toast.error(T('找不到对应 slang', 'Slang not found'));
                            return;
                          }
                          window.open(`/?slang=${encodeURIComponent(term)}`, '_blank');
                        } catch (e) {
                          Sentry.captureException(e, { tags: { component: 'AdminPanel', op: 'reports.viewMeaning' } });
                          toast.error(T('查看失败', 'Failed to open'));
                        }
                      }}
                      className="px-4 py-2 rounded-[10px] text-[13px] font-semibold"
                      style={{ background: 'transparent', border: '1px solid var(--ink-hairline)', color: 'var(--ink-body)' }}
                    >
                      {T('查看 meaning', 'View meaning')}
                    </button>
                    <button
                      onClick={() => handleDismissReport(r.id)}
                      className="px-4 py-2 rounded-[10px] text-[13px] font-semibold text-white"
                      style={{ background: 'var(--blue-accent)' }}
                    >
                      {T('驳回举报', 'Dismiss')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {tab === 'browse' && (
          <>
            {/* 筛选栏：状态 + 搜索 */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="inline-flex gap-1 p-1 bg-[rgba(10,14,26,0.05)] rounded-[10px]">
                {([
                  { k: 'all', zh: '全部', en: 'All' },
                  { k: 'approved', zh: '已通过', en: 'Approved' },
                  { k: 'pending', zh: '待审', en: 'Pending' },
                  { k: 'rejected', zh: '已拒绝', en: 'Rejected' },
                ] as const).map((f) => (
                  <button
                    key={f.k}
                    onClick={() => setBrowseStatusFilter(f.k)}
                    className={`px-3 py-1 rounded-[7px] text-[12px] font-semibold transition-colors ${
                      browseStatusFilter === f.k
                        ? 'bg-white text-[var(--ink)] shadow-[0_1px_3px_rgba(10,14,26,0.1)]'
                        : 'text-[var(--ink-muted)] hover:text-[var(--ink-body)]'
                    }`}
                  >
                    {T(f.zh, f.en)}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={browseSearch}
                onChange={(e) => setBrowseSearch(e.target.value)}
                placeholder={T('搜索含义 / 例句 / term', 'Search meaning / example / term')}
                className="flex-1 min-w-[200px] px-3 py-1.5 rounded-[10px] bg-white text-[13px] font-zh-serif"
                style={{ border: '1px solid var(--ink-hairline)', outline: 'none' }}
              />
              <span className="font-mono-meta text-[11px] text-[var(--ink-muted)]">
                {filteredBrowseDocs.length} / {browseDocs.length}
              </span>
            </div>

            {loadingBrowse && browseDocs.length === 0 ? (
              <div className="py-12 text-center text-[13px]" style={{ color: 'var(--ink-muted)' }}>
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--blue-accent)]" />
                {T('加载中…', 'Loading…')}
              </div>
            ) : filteredBrowseDocs.length === 0 ? (
              <div className="py-12 text-center text-[13px]" style={{ color: 'var(--ink-muted)' }}>
                {browseSearch ? T('没有匹配的条目', 'No matching entries') : T('暂无数据', 'No data')}
              </div>
            ) : (
              <>
                {filteredBrowseDocs.map((m) => (
                  <div key={m.id} className="p-4 mb-2.5 bg-white rounded-xl" style={{ border: '1px solid var(--ink-hairline)' }}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="italic font-bold text-[18px]" style={{ color: 'var(--ink)', fontFamily: '"Clash Display", system-ui, sans-serif' }}>
                        {termMap[m.slangId] || m.slangId}
                      </span>
                      <StatusPill status={m.status} />
                      {typeof m.qualityScore === 'number' && <AiPill score={m.qualityScore} />}
                      <span className="ml-auto text-[11.5px]" style={{ color: 'var(--ink-subtle)' }}>
                        {fmtRelative(m.createdAt, uiLang)}
                      </span>
                    </div>
                    <div className="text-[13.5px]" style={{ color: 'var(--ink-body)', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.75 }}>
                      {m.meaning}
                    </div>
                    {m.example && (
                      <div className="mt-1.5 text-[12.5px] italic" style={{ color: 'var(--ink-muted)', fontFamily: '"Clash Display", system-ui, sans-serif' }}>
                        "{m.example}"
                      </div>
                    )}
                  </div>
                ))}

                {/* 分页按钮 */}
                {browseHasMore && !browseSearch && (
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={() => loadBrowsePage(false)}
                      disabled={loadingBrowse}
                      className="px-5 py-2.5 rounded-[12px] bg-[var(--ink)] text-white font-zh-sans font-bold text-[13px] shadow-[0_4px_12px_rgba(10,14,26,0.22)] hover:bg-[#1a2440] disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {loadingBrowse ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {T('加载更多', 'Load more')}
                    </button>
                  </div>
                )}
                {!browseHasMore && browseDocs.length > 0 && !browseSearch && (
                  <div className="mt-4 text-center text-[11.5px] font-mono-meta" style={{ color: 'var(--ink-subtle)' }}>
                    {T('— 到底了 · end —', '— end —')}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === 'import' && <ImportTab uiLang={uiLang} />}

        {tab === 'export' && <ExportTab uiLang={uiLang} />}

        {tab === 'repair' && <RepairTab uiLang={uiLang} />}
      </div>

      {/* 作者历史弹窗 */}
      <AuthorHistoryModal
        target={authorHistoryTarget}
        onClose={() => setAuthorHistoryTarget(null)}
        termMap={termMap}
        onBanFromHistory={(authorId, authorName) => {
          setAuthorHistoryTarget(null);
          askBanAuthor(authorId, authorName);
        }}
        onUnbanFromHistory={async (authorId, authorName) => {
          try {
            await unbanAuthorFn({ authorId });
            toast.success(uiLang === 'zh'
              ? `已解除封禁：${authorName || authorId.slice(0,6)}`
              : `Unbanned: ${authorName || authorId.slice(0,6)}`);
            setAuthorHistoryTarget(null);
          } catch (e: any) {
            console.error('unban failed:', e);
            Sentry.captureException(e, {
              tags: { component: 'AdminPanel', op: 'unbanAuthor' },
              contexts: { admin: { adminUid: auth.currentUser?.uid || '', targetAuthorId: authorId } },
            });
            toast.error(uiLang === 'zh'
              ? '解除封禁失败：' + (e?.message || '请重试')
              : 'Unban failed: ' + (e?.message || 'retry'));
          }
        }}
        uiLang={uiLang}
      />

      {/* 封禁作者二次确认弹窗 */}
      <ConfirmBanDialog
        target={banTarget}
        busy={banning}
        onCancel={() => {
          if (!banning) setBanTarget(null);
        }}
        onConfirm={confirmBanAuthor}
        uiLang={uiLang}
      />
    </div>
  );
}

function StatCell({ label, value, accent, numColor }: { label: string; value: number | null; accent?: string; numColor?: string }) {
  return (
    <div
      className="p-4 bg-white rounded-xl"
      style={{
        border: '1px solid var(--ink-hairline)',
        borderLeft: accent ? `3px solid ${accent}` : undefined,
      }}
    >
      <div className="font-mono text-[10.5px] font-bold mb-1.5" style={{ color: 'var(--ink-muted)', letterSpacing: '0.18em' }}>
        — {label}
      </div>
      <div className="font-black text-[28px] leading-none tracking-tight" style={{ color: numColor || 'var(--ink)', fontFamily: '"Clash Display", system-ui, sans-serif' }}>
        {value === null ? '—' : value.toLocaleString()}
      </div>
    </div>
  );
}

function TabBtn({ on, onClick, label, badge }: { on: boolean; onClick: () => void; label: string; badge?: number | null }) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-3 text-[13.5px] inline-flex items-center gap-1.5 whitespace-nowrap bg-transparent -mb-px transition-colors"
      style={{
        color: on ? 'var(--ink)' : 'var(--ink-soft)',
        borderBottom: on ? '2px solid var(--ink)' : '2px solid transparent',
        fontWeight: on ? 800 : 600,
      }}
    >
      {label}
      {typeof badge === 'number' && badge > 0 && (
        <span
          className="font-mono text-[10px] font-extrabold px-1.5 py-px rounded-full text-white min-w-[16px] text-center"
          style={{ background: 'var(--red-warn)' }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function StatusPill({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const map = {
    pending: { bg: 'rgba(232,180,60,0.18)', fg: '#8A5D0E', label: 'PENDING' },
    approved: { bg: 'rgba(76,143,59,0.18)', fg: '#2F6317', label: 'APPROVED' },
    rejected: { bg: 'rgba(229,56,43,0.15)', fg: 'var(--red-warn)', label: 'REJECTED' },
  }[status];
  return (
    <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-extrabold" style={{ background: map.bg, color: map.fg, letterSpacing: '0.12em' }}>
      {map.label}
    </span>
  );
}

function AiPill({ score }: { score: number }) {
  const band = aiBand(score);
  const { bg, fg } = aiBandColors(band);
  return (
    <span
      className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold"
      style={{ background: bg, color: fg, letterSpacing: '0.08em' }}
    >
      AI {score}
    </span>
  );
}

function PendingCard({
  m,
  term,
  selected,
  rescoring,
  onToggle,
  onApprove,
  onReject,
  onRescore,
  onViewAuthor,
  onBanAuthor,
  uiLang,
}: {
  m: MeaningDoc;
  term: string | undefined;
  selected: boolean;
  rescoring: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRescore: () => void;
  onViewAuthor: () => void;
  onBanAuthor: () => void;
  uiLang: Language;
}) {
  const T = (zh: string, en: string) => (uiLang === 'zh' ? zh : en);
  return (
    <article
      className="p-5 mb-3 bg-white rounded-xl"
      style={{
        border: selected ? '1px solid var(--blue-accent)' : '1px solid var(--ink-hairline)',
        borderLeft: '3px solid #C9940F',
      }}
    >
      <div className="flex items-center gap-3 mb-3.5 flex-wrap">
        <button
          onClick={onToggle}
          className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 text-white"
          style={{
            border: selected ? '1.5px solid var(--blue-accent)' : '1.5px solid rgba(10,14,26,0.25)',
            background: selected ? 'var(--blue-accent)' : 'rgba(255,255,255,0.7)',
          }}
          aria-label="select"
        >
          {selected && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          )}
        </button>
        <span className="italic font-bold text-[22px] tracking-tight" style={{ color: 'var(--ink)', fontFamily: '"Clash Display", system-ui, sans-serif' }}>
          {term || m.slangId}
        </span>
        <StatusPill status={m.status} />
        {typeof m.qualityScore === 'number' && <AiPill score={m.qualityScore} />}
        <div className="ml-auto flex items-center gap-1.5 text-[12px]" style={{ color: 'var(--ink-subtle)', fontFamily: '"Noto Serif SC", serif' }}>
          <span
            className="w-5.5 h-5.5 rounded-full text-white inline-flex items-center justify-center text-[10px] font-bold"
            style={{ width: 22, height: 22, background: 'linear-gradient(135deg,#89A3F0,#5B7FE8)', fontFamily: '"Clash Display", system-ui, sans-serif' }}
          >
            {(m.authorName || '?').charAt(0).toUpperCase()}
          </span>
          <span className="truncate max-w-[140px]">{m.authorName || T('匿名', 'Anonymous')}</span>
          <span className="font-mono text-[10.5px] ml-1" style={{ color: 'var(--ink-subtle)' }}>
            {shortUid(m.authorId)}
          </span>
          <span>· {fmtRelative(m.createdAt, uiLang)}</span>
        </div>
      </div>
      <div className="text-[14px] mb-3" style={{ color: 'var(--ink-body)', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.85 }}>
        {m.meaning}
      </div>
      {m.example && (
        <div
          className="italic text-[13.5px] px-3.5 py-2.5 mb-3 rounded-r-lg"
          style={{ color: 'var(--ink-muted)', background: 'rgba(10,14,26,0.04)', borderLeft: '2px solid var(--ink-hairline)', fontFamily: '"Clash Display", system-ui, sans-serif' }}
        >
          "{m.example}"
        </div>
      )}
      {/* Mini 操作行 — AI 重新评分 / 作者历史 / 封禁作者。放在通过/拒绝之前，
          视觉上低一阶（ghost 风格 + 小号字体），避免与主动作按钮抢焦点。*/}
      <div className="flex gap-1.5 mb-2 flex-wrap">
        <button
          onClick={onRescore}
          disabled={rescoring}
          className="font-zh-sans font-medium inline-flex items-center gap-1 px-[8px] h-[26px] text-[11px] rounded-[8px] transition-colors disabled:opacity-60"
          style={{
            border: '1px solid var(--ink-hairline)',
            color: 'var(--ink-body)',
            background: 'transparent',
          }}
          onMouseEnter={(e) => {
            if (!rescoring) (e.currentTarget.style.background = 'rgba(10,14,26,0.04)');
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          title={T('让 Gemini 重新评这条解释的质量', 'Ask Gemini to rescore quality')}
        >
          {rescoring ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <RefreshCw className="w-3 h-3" />
          )}
          {T('AI 重新评分', 'Rescore')}
        </button>
        <button
          onClick={onViewAuthor}
          className="font-zh-sans font-medium inline-flex items-center gap-1 px-[8px] h-[26px] text-[11px] rounded-[8px] transition-colors"
          style={{
            border: '1px solid var(--ink-hairline)',
            color: 'var(--ink-body)',
            background: 'transparent',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(10,14,26,0.04)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title={T('查看该作者的所有贡献', 'View all contributions by this author')}
        >
          <History className="w-3 h-3" />
          {T('作者历史', 'Author history')}
        </button>
        <button
          onClick={onBanAuthor}
          className="font-zh-sans font-medium inline-flex items-center gap-1 px-[8px] h-[26px] text-[11px] rounded-[8px] transition-colors"
          style={{
            border: '1px solid rgba(229,56,43,0.2)',
            color: 'var(--red-warn)',
            background: 'transparent',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(229,56,43,0.06)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          title={T('封禁该作者并拒绝其所有 pending', 'Ban this author and reject all their pending')}
        >
          <Ban className="w-3 h-3" />
          {T('封禁作者', 'Ban author')}
        </button>
      </div>
      <div className="flex gap-2 flex-wrap pt-3" style={{ borderTop: '1px solid var(--ink-hairline)' }}>
        <button onClick={onApprove} className="px-4 py-2.5 rounded-[10px] font-bold text-[13px] text-white inline-flex items-center gap-1.5" style={{ background: 'var(--blue-accent)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          {T('通过', 'Approve')}
        </button>
        <button
          onClick={onReject}
          className="px-4 py-2.5 rounded-[10px] font-bold text-[13px] inline-flex items-center gap-1.5"
          style={{ background: 'transparent', border: '1px solid rgba(229,56,43,0.35)', color: 'var(--red-warn)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m18 6-12 12" /><path d="m6 6 12 12" /></svg>
          {T('拒绝', 'Reject')}
        </button>
      </div>
    </article>
  );
}

function Placeholder({ title, hint, btnLabel, uiLang }: { title: string; hint: string; btnLabel: string; uiLang: Language }) {
  return (
    <div className="p-6 bg-white rounded-2xl" style={{ border: '1px solid var(--ink-hairline)' }}>
      <h3 className="font-bold text-[16px] mb-2.5" style={{ color: 'var(--ink)', fontFamily: '"Clash Display", system-ui, sans-serif' }}>
        {title}
      </h3>
      <p className="text-[13px] mb-3" style={{ color: 'var(--ink-muted)', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.7 }}>
        {hint}
      </p>
      <button
        onClick={() => toast.info(uiLang === 'zh' ? '功能开发中' : 'Coming soon')}
        className="px-4 py-2 rounded-[10px] text-[13px] font-semibold"
        style={{ background: 'transparent', border: '1px solid var(--ink-hairline)', color: 'var(--ink-body)' }}
      >
        {btnLabel}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Import tab — paste a JSON array of { term, meaning, example?, authorName? }
// and push through the `bulkImportSlangs` callable. Validation is done
// client-side first (format, length cap, required fields) so we fail fast
// without burning a Function call on obviously bad input.
// ──────────────────────────────────────────────────────────────────────
const IMPORT_PLACEHOLDER_ZH = `粘贴 JSON 数组，格式：
[
  {"term": "rizz", "meaning": "魅力 / charisma", "example": "He's got so much rizz"},
  {"term": "no cap", "meaning": "说真的 / not lying"}
]
不限条数（自动 50 条一片分批上传）。term 和 meaning 必填。`;

const IMPORT_PLACEHOLDER_EN = `Paste a JSON array, format:
[
  {"term": "rizz", "meaning": "charisma", "example": "He's got so much rizz"},
  {"term": "no cap", "meaning": "not lying"}
]
No entry cap (auto-chunked into batches of 50). term and meaning are required.`;

// 分片大小：Cloud Function 服务端硬上限是 50，前端保持一致，超出就分片顺序调用
const IMPORT_CHUNK_SIZE = 50;

type ImportProgress = { current: number; total: number; phase: 'idle' | 'running' | 'done' };

function ImportTab({ uiLang }: { uiLang: Language }) {
  const T = (zh: string, en: string) => (uiLang === 'zh' ? zh : en);
  const [text, setText] = useState('');
  const [lastResult, setLastResult] = useState<BulkImportResult | null>(null);
  const [progress, setProgress] = useState<ImportProgress>({ current: 0, total: 0, phase: 'idle' });

  const isRunning = progress.phase === 'running';

  const handleImport = async () => {
    const raw = text.trim();
    if (!raw) {
      toast.error(T('请先粘贴 JSON', 'Paste JSON first'));
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      toast.error(T('JSON 格式错误', 'Invalid JSON'));
      return;
    }
    if (!Array.isArray(parsed)) {
      toast.error(T('JSON 必须是数组', 'JSON must be an array'));
      return;
    }
    if (parsed.length === 0) {
      toast.error(T('数组为空', 'Array is empty'));
      return;
    }
    // 不再拒绝 >50 —— 客户端自己按 CHUNK 分片顺序调用
    const entries: BulkImportEntry[] = [];
    for (let i = 0; i < parsed.length; i += 1) {
      const item = parsed[i] as Record<string, unknown> | null;
      if (!item || typeof item !== 'object') {
        toast.error(T(`第 ${i + 1} 条不是对象`, `Entry #${i + 1} is not an object`));
        return;
      }
      const term = item.term;
      const meaning = item.meaning;
      if (typeof term !== 'string' || !term.trim() || typeof meaning !== 'string' || !meaning.trim()) {
        toast.error(T('每条必须有 term 和 meaning', 'Each entry needs term and meaning'));
        return;
      }
      entries.push({
        term: term.trim(),
        meaning: meaning.trim(),
        example: typeof item.example === 'string' ? item.example.trim() : undefined,
        authorName: typeof item.authorName === 'string' ? item.authorName.trim() : undefined,
      });
    }

    const total = entries.length;
    let totalCreated = 0;
    let totalSkipped = 0;
    const totalFailures: Array<{ term: string; reason: string }> = [];

    setLastResult(null);
    setProgress({ current: 0, total, phase: 'running' });

    for (let i = 0; i < total; i += IMPORT_CHUNK_SIZE) {
      const slice = entries.slice(i, i + IMPORT_CHUNK_SIZE);
      try {
        const res = await bulkImportFn({ entries: slice });
        const data = res.data || { created: 0, skipped: 0, failures: [] };
        totalCreated += data.created;
        totalSkipped += data.skipped;
        if (Array.isArray(data.failures)) totalFailures.push(...data.failures);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        // 中途某一片失败不中断：把这一片的每条都记为 failure，继续下一片
        totalFailures.push(...slice.map((s) => ({ term: s.term, reason })));
        console.error('bulkImport chunk failed:', e);
        Sentry.captureException(e, {
          tags: { component: 'AdminPanel', op: 'bulkImport.chunk' },
          extra: { offset: i, chunkSize: slice.length, total },
        });
      }
      setProgress({ current: Math.min(i + IMPORT_CHUNK_SIZE, total), total, phase: 'running' });
    }

    const aggregated: BulkImportResult = {
      created: totalCreated,
      skipped: totalSkipped,
      failures: totalFailures,
    };
    setLastResult(aggregated);
    setProgress({ current: total, total, phase: 'done' });

    toast.success(
      T(
        `导入完成：${totalCreated} 成功，${totalSkipped} 跳过，${totalFailures.length} 失败`,
        `Import done: ${totalCreated} ok, ${totalSkipped} skipped, ${totalFailures.length} failed`
      )
    );
    if (totalFailures.length === 0) setText('');
  };

  const progressPct =
    progress.total > 0 ? (progress.current / Math.max(progress.total, 1)) * 100 : 0;

  return (
    <div className="surface !rounded-[18px] p-6 md:p-8">
      <h3 className="font-display font-semibold text-[20px] mb-2" style={{ color: 'var(--ink)' }}>
        {T('批量导入', 'Bulk import')}
      </h3>
      <p className="font-zh-serif text-[13px] mb-5" style={{ color: 'var(--ink-muted)' }}>
        {T(
          '粘贴 JSON 数组，不限条数（前端自动 50 条一片分批上传）。每条会写入 slang + meaning（已自动设为 approved）。',
          'Paste a JSON array, any length (auto-chunked into batches of 50 on the client). Each writes a slang + meaning (auto-approved).'
        )}
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={uiLang === 'zh' ? IMPORT_PLACEHOLDER_ZH : IMPORT_PLACEHOLDER_EN}
        rows={14}
        disabled={isRunning}
        className="w-full px-3.5 py-3 rounded-[12px] bg-white outline-none text-[13px] font-mono resize-y"
        style={{ border: '1px solid var(--ink-hairline)', color: 'var(--ink)', minHeight: 240 }}
      />

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleImport}
          disabled={isRunning || !text.trim()}
          className="px-5 py-2.5 rounded-[12px] font-bold text-[13.5px] text-white inline-flex items-center gap-2"
          style={{ background: 'var(--ink)', opacity: isRunning || !text.trim() ? 0.6 : 1 }}
        >
          {isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {isRunning ? T('导入中…', 'Importing…') : T('导入', 'Import')}
        </button>
        {lastResult && !isRunning && (
          <span className="text-[12.5px]" style={{ color: 'var(--ink-muted)' }}>
            {T(
              `上次：${lastResult.created} 成功 · ${lastResult.skipped} 跳过 · ${lastResult.failures.length} 失败`,
              `Last: ${lastResult.created} ok · ${lastResult.skipped} skipped · ${lastResult.failures.length} failed`
            )}
          </span>
        )}
      </div>

      {(progress.phase === 'running' || progress.phase === 'done') && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between mb-2">
            <span className="font-mono-meta text-[10px] tracking-[0.15em] uppercase font-bold text-[var(--ink-soft)]">
              {T('导入进度', 'Import progress')}
            </span>
            <span className="font-mono-meta text-[11px] text-[var(--ink-body)]">
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="h-[6px] bg-[rgba(91,127,232,0.15)] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#5B7FE8] to-[#0A0E1A] rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {progress.phase === 'running' && (
            <p className="mt-2 font-zh-serif text-[12px] text-[var(--ink-muted)]">
              {T(
                `正在导入第 ${progress.current} / ${progress.total} 条，请勿关闭窗口…`,
                `Importing ${progress.current} / ${progress.total} — please keep this window open…`
              )}
            </p>
          )}
        </div>
      )}

      {lastResult && lastResult.failures.length > 0 && (
        <div
          className="mt-5 p-4 rounded-[12px]"
          style={{ border: '1px solid rgba(229,56,43,0.25)', background: 'rgba(229,56,43,0.05)' }}
        >
          <div className="font-bold text-[13px] mb-2" style={{ color: 'var(--red-warn)' }}>
            {T(`失败条目（${lastResult.failures.length}）`, `Failures (${lastResult.failures.length})`)}
          </div>
          <ul className="space-y-1.5">
            {lastResult.failures.map((f, i) => (
              <li key={i} className="text-[12.5px]" style={{ color: 'var(--ink-body)' }}>
                <span className="font-mono font-bold">{f.term}</span>
                <span className="mx-1.5" style={{ color: 'var(--ink-subtle)' }}>→</span>
                <span>{f.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Export tab — cursor 分页导出。
//
// 现状（已废弃）：一次 callable 拉全库，>5000 条直接 hard reject。
// 修后：前端 while 循环拉页，每页 ≤2000 条；首页顺便拉全 slangs + totalMeanings；
//       所有页拼到内存里，最后一次性打包 Blob 下载。进度条实时显示 current/total。
// 不修后果：meaning 过 5000 就再也导不出，备份/迁移被堵死。
// ──────────────────────────────────────────────────────────────────────
type ExportProgress =
  | { phase: 'idle' }
  | { phase: 'running'; current: number; total: number }
  | { phase: 'done'; current: number; total: number }
  | { phase: 'error' };

function ExportTab({ uiLang }: { uiLang: Language }) {
  const T = (zh: string, en: string) => (uiLang === 'zh' ? zh : en);
  const [loading, setLoading] = useState(false);
  const [lastCount, setLastCount] = useState<{ slangs: number; meanings: number; at: number } | null>(null);
  const [progress, setProgress] = useState<ExportProgress>({ phase: 'idle' });

  const handleExport = async () => {
    setLoading(true);
    const allMeanings: Array<Record<string, unknown>> = [];
    let slangs: Array<Record<string, unknown>> = [];
    let cursor: number | null | undefined = undefined;
    let total: number | undefined;
    let page = 0;
    setProgress({ phase: 'running', current: 0, total: 0 });
    const toastId = toast.loading(T('正在导出第 1 页…', 'Exporting page 1…'));
    try {
      // 循环拉页 —— 首页不带 cursor；后续页用上一页返回的 nextCursor。
      // 服务端 hasMore=false 时退出。
      // 潜在边界：超大数据集（几十万条）时 allMeanings 驻留在浏览器内存，
      // 可能 OOM。现阶段 meanings 总量在万级，JSON 串约 10-30 MB，可接受。
      // 若未来需要更大体量，改成流式 ReadableStream + TransformStream 即可。
      // eslint-disable-next-line no-constant-condition
      while (true) {
        page += 1;
        const req: ExportPageRequest = cursor != null ? { cursor } : {};
        const { data } = await exportAllFn(req);
        if (!data) throw new Error('empty export page');
        // 首页带 slangs + totalMeanings
        if (page === 1) {
          slangs = Array.isArray(data.slangs) ? data.slangs : [];
          total = typeof data.totalMeanings === 'number' ? data.totalMeanings : undefined;
        }
        allMeanings.push(...data.meanings);
        const effectiveTotal = total ?? allMeanings.length;
        setProgress({ phase: 'running', current: allMeanings.length, total: effectiveTotal });
        toast.loading(
          T(
            `已导出 ${allMeanings.length} / ${total ?? '?'} 条…`,
            `Exported ${allMeanings.length} / ${total ?? '?'}…`
          ),
          { id: toastId }
        );
        if (!data.hasMore || data.nextCursor == null) break;
        cursor = data.nextCursor;
      }

      // 拼完整包
      const payload = {
        slangs,
        meanings: allMeanings,
        exportedAt: Date.now(),
        count: { slangs: slangs.length, meanings: allMeanings.length },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `memeflow-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastCount({ slangs: slangs.length, meanings: allMeanings.length, at: Date.now() });
      setProgress({ phase: 'done', current: allMeanings.length, total: allMeanings.length });
      toast.success(
        T(
          `已导出：${slangs.length} slangs，${allMeanings.length} meanings`,
          `Exported: ${slangs.length} slangs, ${allMeanings.length} meanings`
        ),
        { id: toastId }
      );
    } catch (e) {
      console.error('exportAllData failed:', e);
      Sentry.captureException(e, { tags: { component: 'AdminPanel', op: 'exportAll' } });
      toast.error(T('导出失败，稍后重试', 'Export failed'), { id: toastId });
      setProgress({ phase: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 进度条 —— 液态玻璃风，复用 --ink 主色。
  const pct =
    progress.phase === 'running' || progress.phase === 'done'
      ? progress.total > 0
        ? Math.min(100, Math.round((progress.current / progress.total) * 100))
        : 0
      : 0;

  return (
    <div className="surface !rounded-[18px] p-6 md:p-8">
      <h3 className="font-display font-semibold text-[20px] mb-2" style={{ color: 'var(--ink)' }}>
        {T('导出数据', 'Export data')}
      </h3>
      <p className="font-zh-serif text-[13px] mb-5" style={{ color: 'var(--ink-muted)' }}>
        {T(
          '导出所有 slangs + meanings 为 JSON（用于备份或迁移）。分页拉取（每页 2000 条 meaning），前端自动拼接完整数据后下载。',
          'Export all slangs + meanings as JSON (backup / migration). Paginated server-side (2000 meanings/page), stitched client-side into a single download.'
        )}
      </p>

      <button
        onClick={handleExport}
        disabled={loading}
        className="px-5 py-2.5 rounded-[12px] font-bold text-[13.5px] text-white inline-flex items-center gap-2"
        style={{ background: 'var(--ink)', opacity: loading ? 0.6 : 1 }}
      >
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {loading ? T('导出中…', 'Exporting…') : T('下载 JSON', 'Download JSON')}
      </button>

      {(progress.phase === 'running' || progress.phase === 'done') && (
        <div className="mt-5">
          <div className="flex items-center justify-between mb-1.5 text-[12px]" style={{ color: 'var(--ink-muted)' }}>
            <span>
              {progress.phase === 'done'
                ? T('完成', 'Done')
                : T(
                    `已拉取 ${progress.current} / ${progress.total || '?'} 条 meaning`,
                    `Fetched ${progress.current} / ${progress.total || '?'} meanings`
                  )}
            </span>
            <span className="font-mono">{pct}%</span>
          </div>
          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.06)', border: '1px solid var(--ink-hairline)' }}
          >
            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${pct}%`,
                background: progress.phase === 'done' ? 'var(--green-ok, #16a34a)' : 'var(--ink)',
              }}
            />
          </div>
        </div>
      )}

      {lastCount && (
        <div className="mt-5 text-[12.5px]" style={{ color: 'var(--ink-muted)' }}>
          {T(
            `上次导出：${lastCount.slangs} slangs，${lastCount.meanings} meanings · ${new Date(lastCount.at).toLocaleTimeString()}`,
            `Last export: ${lastCount.slangs} slangs, ${lastCount.meanings} meanings · ${new Date(lastCount.at).toLocaleTimeString()}`
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Repair tab — 数据健康仪表盘
//
// 现状：Repair tab 一直是 Placeholder，admin 想排查脏数据只能跑脚本。
// 修后：点一下"扫描数据问题"→ 看到四类问题各有多少条 → 每类一个按钮
//       直接批量修复，所有动作写 admin_audit_log。
// 不修后果：数据越积越脏，规则变更时没法快速 sanity-check。
//
// 四类问题：
//   - orphan meaning：meaning.slangId 对应的 slang doc 不存在 → 删除
//   - duplicate term：多个 slang doc 共享同一个 term（大小写不敏感）
//     → 保留最早的，其他 doc 上的 meanings 重指向，再删除多余 doc
//   - missing author：meaning.authorId 为空 → 删除（无主信息）
//   - missing qualityScore：meaning 没有 qualityScore → 回填 70（默认及格）
// ──────────────────────────────────────────────────────────────────────

function RepairTab({ uiLang }: { uiLang: Language }) {
  const T = (zh: string, en: string) => (uiLang === 'zh' ? zh : en);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  // 每类问题独立的 in-flight 状态，避免互相遮蔽
  const [repairBusy, setRepairBusy] = useState<Record<RepairAction, boolean>>({
    delete_orphans: false,
    merge_duplicates: false,
    backfill_quality: false,
    delete_missing_author: false,
  });

  const doScan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await scanIssuesFn({} as Record<string, never>);
      setScan(res.data);
    } catch (e) {
      console.error('scanDataIssues failed:', e);
      Sentry.captureException(e, { tags: { component: 'AdminPanel', op: 'scanDataIssues' } });
      toast.error(T('扫描失败，稍后重试', 'Scan failed'));
    } finally {
      setScanning(false);
    }
  }, [T]);

  // 执行修复 —— 共用逻辑：
  //   1. 先 toast 二次确认（参考 App.tsx 的 confirmLogout 模式）
  //   2. 用户点"确定"才真正调 callable
  //   3. 成功后重新 scan 刷新列表
  const performRepair = useCallback(
    async (action: RepairAction) => {
      if (!scan) return;
      let payload: { action: RepairAction; ids?: string[]; groups?: Array<{ term: string; docIds: string[] }> } = {
        action,
      };
      let targetCount = 0;

      if (action === 'delete_orphans') {
        const ids = scan.orphanMeanings.map((o) => o.meaningId);
        targetCount = ids.length;
        payload = { action, ids };
      } else if (action === 'delete_missing_author') {
        const ids = scan.missingAuthor.map((o) => o.meaningId);
        targetCount = ids.length;
        payload = { action, ids };
      } else if (action === 'backfill_quality') {
        const ids = scan.missingQualityScore.map((o) => o.meaningId);
        targetCount = ids.length;
        payload = { action, ids };
      } else if (action === 'merge_duplicates') {
        targetCount = scan.duplicateTerms.length;
        payload = { action, groups: scan.duplicateTerms };
      }

      if (targetCount === 0) return;

      setRepairBusy((prev) => ({ ...prev, [action]: true }));
      try {
        const res = await repairIssuesFn(payload);
        const data = res.data || { processed: 0, failed: [] };
        toast.success(
          T(
            `修复完成：成功 ${data.processed}，失败 ${data.failed.length}`,
            `Repair done: ${data.processed} ok, ${data.failed.length} failed`
          )
        );
        if (data.failed.length > 0) {
          console.warn('repair failures:', data.failed);
        }
        // 重新 scan 刷新 UI
        await doScan();
      } catch (e) {
        console.error('repairDataIssues failed:', e);
        Sentry.captureException(e, { tags: { component: 'AdminPanel', op: 'repairDataIssues', action } });
        toast.error(T('修复失败，稍后重试', 'Repair failed'));
      } finally {
        setRepairBusy((prev) => ({ ...prev, [action]: false }));
      }
    },
    [scan, T, doScan]
  );

  // 用 toast.warning + action/cancel 做二次确认（和 App.tsx confirmLogout 同款）
  const askRepair = (action: RepairAction, countLabel: string) => {
    toast.warning(
      T(
        `将修复 ${countLabel}，操作不可撤销。确定？`,
        `Will repair ${countLabel}. This cannot be undone. Continue?`
      ),
      {
        action: {
          label: T('确定', 'Confirm'),
          onClick: () => {
            void performRepair(action);
          },
        },
        cancel: {
          label: T('取消', 'Cancel'),
          onClick: () => {},
        },
        duration: 10000,
      }
    );
  };

  const orphanCount = scan?.orphanMeanings.length ?? 0;
  const dupCount = scan?.duplicateTerms.length ?? 0;
  const missingAuthorCount = scan?.missingAuthor.length ?? 0;
  const missingQualityCount = scan?.missingQualityScore.length ?? 0;

  return (
    <div className="surface !rounded-[18px] p-6 md:p-8">
      <div className="flex items-center gap-3 flex-wrap mb-5">
        <h3 className="font-display font-semibold text-[20px] mr-auto" style={{ color: 'var(--ink)' }}>
          {T('数据健康体检', 'Data health check')}
        </h3>
        {scan && (
          <span className="text-[12px]" style={{ color: 'var(--ink-muted)' }}>
            {T(
              `上次扫描：${new Date(scan.scannedAt).toLocaleTimeString()} · ${scan.totals.slangs} slangs / ${scan.totals.meanings} meanings${scan.truncated ? '（已截断 5000）' : ''}`,
              `Last scan: ${new Date(scan.scannedAt).toLocaleTimeString()} · ${scan.totals.slangs} slangs / ${scan.totals.meanings} meanings${scan.truncated ? ' (truncated at 5000)' : ''}`
            )}
          </span>
        )}
        <button
          onClick={doScan}
          disabled={scanning}
          className="px-5 py-2.5 rounded-[12px] font-bold text-[13.5px] text-white inline-flex items-center gap-2"
          style={{ background: 'var(--ink)', opacity: scanning ? 0.6 : 1 }}
        >
          {scanning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {scanning ? T('扫描中…', 'Scanning…') : T('扫描数据问题', 'Scan data issues')}
        </button>
      </div>

      <p className="font-zh-serif text-[13px] mb-5" style={{ color: 'var(--ink-muted)' }}>
        {T(
          '扫描孤儿 meaning / 重复 term / 缺 authorId / 缺 qualityScore。每次修复动作写 admin_audit_log 留痕。',
          'Scans for orphan meanings, duplicate terms, missing author/quality fields. Every repair is logged.'
        )}
      </p>

      {!scan ? (
        <div className="py-12 text-center text-[13px]" style={{ color: 'var(--ink-muted)' }}>
          {T('点击上方按钮开始扫描', 'Click Scan to begin')}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <WarningRow
            count={orphanCount}
            title={T('孤儿 meaning', 'Orphan meanings')}
            hint={T(
              'meaning.slangId 对应的 slang 已被删除 —— 会导致前端点进去 404。',
              'meaning.slangId points to a deleted slang doc.'
            )}
            actionLabel={T('删除', 'Delete')}
            actionTone="danger"
            busy={repairBusy.delete_orphans}
            onAction={() => askRepair('delete_orphans', T(`${orphanCount} 条孤儿 meaning`, `${orphanCount} orphan meaning(s)`))}
            uiLang={uiLang}
          />

          <WarningRow
            count={dupCount}
            title={T('重复 term', 'Duplicate terms')}
            hint={T(
              '多个 slang doc 共享同一个 term（大小写不敏感）—— 会导致同义查重失败。',
              'Multiple slang docs share the same term (case-insensitive).'
            )}
            actionLabel={T('合并保留最早', 'Merge (keep earliest)')}
            actionTone="blue"
            busy={repairBusy.merge_duplicates}
            onAction={() =>
              askRepair(
                'merge_duplicates',
                T(`${dupCount} 组重复 term`, `${dupCount} duplicate term group(s)`)
              )
            }
            uiLang={uiLang}
          />

          <WarningRow
            count={missingAuthorCount}
            title={T('缺作者信息', 'Missing author')}
            hint={T(
              'authorId 为空 —— 封禁 / 声誉累计都无法归因，且无法追溯。',
              'authorId is empty — ban / reputation logic cannot attribute it.'
            )}
            actionLabel={T('删除', 'Delete')}
            actionTone="danger"
            busy={repairBusy.delete_missing_author}
            onAction={() =>
              askRepair(
                'delete_missing_author',
                T(`${missingAuthorCount} 条无主 meaning`, `${missingAuthorCount} author-less meaning(s)`)
              )
            }
            uiLang={uiLang}
          />

          <WarningRow
            count={missingQualityCount}
            title={T('缺 AI 评分', 'Missing AI score')}
            hint={T(
              'qualityScore 缺失 —— 客户端 AI 评分过滤 / 排序都失效。回填为 70（及格默认）。',
              'qualityScore is missing — breaks AI score filter / sort. Backfills 70 (passing default).'
            )}
            actionLabel={T('补 70 分', 'Backfill 70')}
            actionTone="blue"
            busy={repairBusy.backfill_quality}
            onAction={() =>
              askRepair(
                'backfill_quality',
                T(`${missingQualityCount} 条缺评分 meaning`, `${missingQualityCount} meaning(s) missing score`)
              )
            }
            uiLang={uiLang}
          />
        </div>
      )}
    </div>
  );
}

function WarningRow({
  count,
  title,
  hint,
  actionLabel,
  actionTone,
  busy,
  onAction,
  uiLang,
}: {
  count: number;
  title: string;
  hint: string;
  actionLabel: string;
  actionTone: 'danger' | 'blue';
  busy: boolean;
  onAction: () => void;
  uiLang: Language;
}) {
  const T = (zh: string, en: string) => (uiLang === 'zh' ? zh : en);
  const hasIssue = count > 0;
  const borderColor = hasIssue ? 'rgba(232,180,60,0.4)' : 'var(--ink-hairline)';
  const bg = hasIssue ? 'rgba(232,180,60,0.08)' : 'transparent';

  const btnBg = actionTone === 'danger' ? 'var(--red-warn)' : 'var(--blue-accent)';

  return (
    <div
      className="flex items-center gap-4 p-4 rounded-[14px]"
      style={{ border: `1px solid ${borderColor}`, background: bg }}
    >
      {/* ICON 36×36 */}
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          background: hasIssue ? 'rgba(232,180,60,0.18)' : 'rgba(76,143,59,0.14)',
          color: hasIssue ? '#8A5D0E' : '#2F6317',
        }}
      >
        {hasIssue ? <AlertTriangle size={18} strokeWidth={2} /> : <CheckCircle size={18} strokeWidth={2} />}
      </div>

      {/* 中间文案 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span
            className="font-bold text-[14px]"
            style={{
              color: 'var(--ink)',
              fontFamily: '"Clash Display", system-ui, sans-serif',
            }}
          >
            {title}
          </span>
          <span
            className="font-mono text-[12px] font-extrabold"
            style={{ color: hasIssue ? '#8A5D0E' : '#2F6317' }}
          >
            {hasIssue ? T(`${count} 条`, `${count} issue${count === 1 ? '' : 's'}`) : T('无问题', 'OK')}
          </span>
        </div>
        <div
          className="text-[12.5px] mt-0.5"
          style={{ color: 'var(--ink-muted)', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.6 }}
        >
          {hint}
        </div>
      </div>

      {/* 右侧操作按钮 */}
      {hasIssue ? (
        <button
          onClick={onAction}
          disabled={busy}
          className="px-4 py-2 rounded-[10px] font-bold text-[13px] text-white inline-flex items-center gap-1.5 flex-shrink-0"
          style={{ background: btnBg, opacity: busy ? 0.6 : 1 }}
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
          {busy ? T('处理中…', 'Working…') : actionLabel}
        </button>
      ) : (
        <span
          className="text-[12px] font-mono flex-shrink-0"
          style={{ color: 'var(--ink-subtle)' }}
        >
          —
        </span>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// AuthorHistoryModal — 弹一个 modal 把某个作者的所有 meanings 列出来。
//
// 现状：admin 在 Pending 卡片上只看得到一条 meaning，无法判断作者是
//       "偶尔贡献好内容" 还是 "专刷垃圾"。
// 修后：点 "作者历史" → 弹窗展示该作者所有 meanings（含 term、meaning、
//       status、createdAt）+ 通过/拒绝计数汇总 + "封禁作者" 入口。
// 不修后果：admin 靠肉眼一条条查，漏抓 spammer 或误封好作者。
//
// 不需要 Cloud Function — 直接前端按 authorId 查 slang_meanings。
// Firestore 规则允许 admin 读全部 slang_meanings。
// ──────────────────────────────────────────────────────────────────────────
function AuthorHistoryModal({
  target,
  onClose,
  termMap,
  onBanFromHistory,
  onUnbanFromHistory,
  uiLang,
}: {
  target: { authorId: string; authorName?: string } | null;
  onClose: () => void;
  termMap: Record<string, string>;
  onBanFromHistory: (authorId: string, authorName?: string) => void;
  onUnbanFromHistory: (authorId: string, authorName?: string) => void;
  uiLang: Language;
}) {
  const T = (zh: string, en: string) => (uiLang === 'zh' ? zh : en);
  const [rows, setRows] = useState<MeaningDoc[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [localTermMap, setLocalTermMap] = useState<Record<string, string>>({});
  const [isBanned, setIsBanned] = useState<boolean | null>(null);

  useEffect(() => {
    if (!target) {
      setRows(null);
      setLocalTermMap({});
      setIsBanned(null);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        // 拉该作者所有 meanings，按 createdAt 倒序，先上限 200 条够判断画像
        const q = query(
          collection(db, 'slang_meanings'),
          where('authorId', '==', target.authorId),
          orderBy('createdAt', 'desc'),
          limit(200)
        );
        const snap = await getDocs(q);
        const list: MeaningDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<MeaningDoc, 'id'>),
        }));
        setRows(list);

        // 顺带补上这个弹窗需要的 slangId -> term map
        const missing = Array.from(
          new Set(list.map((r) => r.slangId).filter((id) => id && !termMap[id]))
        ).slice(0, 30);
        if (missing.length > 0) {
          const chunks: string[][] = [];
          for (let i = 0; i < missing.length; i += 10) chunks.push(missing.slice(i, i + 10));
          const snaps = await Promise.all(
            chunks.map((c) =>
              getDocs(query(collection(db, 'slangs'), where(documentId(), 'in', c))).catch(() => null)
            )
          );
          const next: Record<string, string> = {};
          snaps.forEach((s) => {
            if (!s) return;
            s.docs.forEach((d) => {
              const term = (d.data() as { term?: string }).term;
              if (term) next[d.id] = term;
            });
          });
          setLocalTermMap(next);
        }

        // 读一下 users/{authorId}，看是否已经被 ban 过（避免重复封禁）
        try {
          const userSnap = await getDocs(
            query(collection(db, 'users'), where(documentId(), '==', target.authorId), limit(1))
          );
          if (!userSnap.empty) {
            const data = userSnap.docs[0].data() as { isBanned?: boolean };
            setIsBanned(Boolean(data.isBanned));
          } else {
            setIsBanned(false);
          }
        } catch {
          setIsBanned(null);
        }
      } catch (e) {
        console.error('AuthorHistoryModal load failed:', e);
        Sentry.captureException(e, { tags: { component: 'AdminPanel', op: 'authorHistory' } });
        toast.error(uiLang === 'zh' ? '加载作者历史失败' : 'Load failed');
      } finally {
        setLoading(false);
      }
    })();
  }, [target, termMap, uiLang]);

  const summary = useMemo(() => {
    if (!rows) return null;
    let approved = 0;
    let rejected = 0;
    let pending = 0;
    rows.forEach((r) => {
      if (r.status === 'approved') approved += 1;
      else if (r.status === 'rejected') rejected += 1;
      else if (r.status === 'pending') pending += 1;
    });
    return { approved, rejected, pending, total: rows.length };
  }, [rows]);

  const resolveTerm = (slangId: string) => termMap[slangId] || localTermMap[slangId] || slangId;

  if (!target) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="author-history-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl w-full max-w-[720px] max-h-[85vh] flex flex-col overflow-hidden"
          style={{ border: '1px solid var(--ink-hairline)' }}
        >
          {/* HEAD */}
          <div
            className="flex items-center gap-3 px-5 py-4"
            style={{ borderBottom: '1px solid var(--ink-hairline)' }}
          >
            <span
              className="w-8 h-8 rounded-full text-white inline-flex items-center justify-center text-[12px] font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#89A3F0,#5B7FE8)', fontFamily: '"Clash Display", system-ui, sans-serif' }}
            >
              {(target.authorName || '?').charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[15px] truncate" style={{ color: 'var(--ink)' }}>
                {target.authorName || T('匿名作者', 'Anonymous author')}
              </div>
              <div className="font-mono text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                {shortUid(target.authorId)}
                {isBanned === true && (
                  <span
                    className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-extrabold"
                    style={{ background: 'rgba(229,56,43,0.15)', color: 'var(--red-warn)', letterSpacing: '0.08em' }}
                  >
                    BANNED
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center flex-shrink-0"
              style={{ border: '1px solid var(--ink-hairline)', color: 'var(--ink-body)', background: 'transparent' }}
              aria-label="close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* SUMMARY */}
          {summary && (
            <div className="px-5 py-3 flex gap-4 text-[12px]" style={{ borderBottom: '1px solid var(--ink-hairline)', background: 'rgba(10,14,26,0.025)' }}>
              <SummaryStat label={T('总数', 'Total')} value={summary.total} />
              <SummaryStat label={T('通过', 'Approved')} value={summary.approved} color="var(--green-ok)" />
              <SummaryStat label={T('拒绝', 'Rejected')} value={summary.rejected} color="var(--red-warn)" />
              <SummaryStat label={T('待审', 'Pending')} value={summary.pending} color="#C9940F" />
            </div>
          )}

          {/* LIST */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="py-8 text-center text-[13px] inline-flex items-center justify-center w-full gap-2" style={{ color: 'var(--ink-muted)' }}>
                <Loader2 className="w-4 h-4 animate-spin" />
                {T('加载中…', 'Loading…')}
              </div>
            ) : !rows || rows.length === 0 ? (
              <div className="py-8 text-center text-[13px]" style={{ color: 'var(--ink-muted)' }}>
                {T('该作者没有任何贡献', 'No contributions')}
              </div>
            ) : (
              rows.map((r) => (
                <div
                  key={r.id}
                  className="py-3"
                  style={{ borderBottom: '1px solid var(--ink-hairline)' }}
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="italic font-bold text-[15px]" style={{ color: 'var(--ink)', fontFamily: '"Clash Display", system-ui, sans-serif' }}>
                      {resolveTerm(r.slangId)}
                    </span>
                    <StatusPill status={r.status} />
                    {typeof r.qualityScore === 'number' && <AiPill score={r.qualityScore} />}
                    <span className="ml-auto text-[11px]" style={{ color: 'var(--ink-subtle)' }}>
                      {fmtRelative(r.createdAt, uiLang)}
                    </span>
                  </div>
                  <div className="text-[13px]" style={{ color: 'var(--ink-body)', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.7 }}>
                    {r.meaning}
                  </div>
                  {r.rejectionReason && (
                    <div className="mt-1 text-[11.5px]" style={{ color: 'var(--red-warn)' }}>
                      {T('拒绝理由：', 'Rejection: ')}
                      {r.rejectionReason}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* FOOT */}
          <div
            className="px-5 py-3 flex gap-2 justify-end"
            style={{ borderTop: '1px solid var(--ink-hairline)' }}
          >
            {isBanned === true ? (
              <button
                onClick={() => onUnbanFromHistory(target.authorId, target.authorName)}
                className="px-4 py-2 rounded-[10px] font-semibold text-[13px] inline-flex items-center gap-1.5"
                style={{ background: 'transparent', border: '1px solid rgba(47,99,23,0.35)', color: 'var(--green-ok)' }}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {T('解除封禁', 'Unban')}
              </button>
            ) : (
              <button
                onClick={() => onBanFromHistory(target.authorId, target.authorName)}
                className="px-4 py-2 rounded-[10px] font-semibold text-[13px] inline-flex items-center gap-1.5"
                style={{ background: 'transparent', border: '1px solid rgba(229,56,43,0.35)', color: 'var(--red-warn)' }}
              >
                <Ban className="w-3.5 h-3.5" />
                {T('封禁作者', 'Ban author')}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-[10px] font-semibold text-[13px]"
              style={{ background: 'var(--ink)', color: 'white' }}
            >
              {T('关闭', 'Close')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}

function SummaryStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10px] font-bold" style={{ color: 'var(--ink-muted)', letterSpacing: '0.12em' }}>
        {label.toUpperCase()}
      </span>
      <span className="font-black text-[16px] leading-tight" style={{ color: color || 'var(--ink)', fontFamily: '"Clash Display", system-ui, sans-serif' }}>
        {value}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// ConfirmBanDialog — 封禁二次确认 + 理由输入。
//
// 现状：封禁是高杀伤力操作（会连带拒掉该作者所有 pending），直接触发
//       风险太高。
// 修后：点 "封禁作者" 先弹 modal，必须填理由才能提交，给 admin 一次
//       反悔机会。CLAUDE.md 禁 alert/confirm，prompt 精神一致，用正式
//       modal 而不是 window.prompt。
// 不修后果：误点击一下就把一个用户 nuke 掉，连带他所有 pending 全被拒，
//       不可撤销。
// ──────────────────────────────────────────────────────────────────────────
function ConfirmBanDialog({
  target,
  busy,
  onCancel,
  onConfirm,
  uiLang,
}: {
  target: { authorId: string; authorName?: string } | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  uiLang: Language;
}) {
  const T = (zh: string, en: string) => (uiLang === 'zh' ? zh : en);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (target) setReason('');
  }, [target]);

  if (!target) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="confirm-ban-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
        onClick={() => {
          if (!busy) onCancel();
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-2xl w-full max-w-[440px] overflow-hidden"
          style={{ border: '1px solid var(--ink-hairline)', borderLeft: '3px solid var(--red-warn)' }}
        >
          <div className="px-5 pt-4 pb-3 flex items-center gap-2">
            <span
              className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(229,56,43,0.12)', color: 'var(--red-warn)' }}
            >
              <Ban className="w-4 h-4" />
            </span>
            <h3 className="font-bold text-[15px]" style={{ color: 'var(--ink)' }}>
              {T('确认封禁作者？', 'Confirm ban author?')}
            </h3>
          </div>
          <div className="px-5 pb-3 text-[13px]" style={{ color: 'var(--ink-body)', fontFamily: '"Noto Serif SC", serif', lineHeight: 1.7 }}>
            {T(
              `将封禁 ${target.authorName || '该作者'}（${shortUid(target.authorId)}）并拒绝其所有待审核内容。此操作会写入审计日志。`,
              `Will ban ${target.authorName || 'this author'} (${shortUid(target.authorId)}) and reject all their pending meanings. Writes audit log.`
            )}
          </div>
          <div className="px-5 pb-4">
            <label className="block font-mono text-[10px] font-bold mb-1.5" style={{ color: 'var(--ink-muted)', letterSpacing: '0.12em' }}>
              {T('封禁理由（必填，≤ 490 字）', 'REASON (required, ≤490 chars)')}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 490))}
              rows={3}
              placeholder={T('例：连续刷 spam、辱骂、商业引流…', 'e.g. repeated spam, abuse, commercial promotion…')}
              className="w-full px-3 py-2 rounded-[10px] bg-transparent outline-none text-[13px] resize-none"
              style={{ border: '1px solid var(--ink-hairline)', color: 'var(--ink)', fontFamily: '"Noto Serif SC", serif' }}
              disabled={busy}
              autoFocus
            />
            <div className="text-right font-mono text-[10px] mt-1" style={{ color: 'var(--ink-subtle)' }}>
              {reason.length} / 490
            </div>
          </div>
          <div className="px-5 py-3 flex gap-2 justify-end" style={{ borderTop: '1px solid var(--ink-hairline)', background: 'rgba(10,14,26,0.025)' }}>
            <button
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2 rounded-[10px] font-semibold text-[13px] disabled:opacity-60"
              style={{ background: 'transparent', border: '1px solid var(--ink-hairline)', color: 'var(--ink-body)' }}
            >
              {T('取消', 'Cancel')}
            </button>
            <button
              onClick={() => onConfirm(reason)}
              disabled={busy || !reason.trim()}
              className="px-4 py-2 rounded-[10px] font-bold text-[13px] text-white inline-flex items-center gap-1.5 disabled:opacity-60"
              style={{ background: 'var(--red-warn)' }}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {busy ? T('封禁中…', 'Banning…') : T('确认封禁', 'Confirm ban')}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
