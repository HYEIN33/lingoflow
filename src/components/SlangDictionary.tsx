import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, setDoc, writeBatch, orderBy, limit, serverTimestamp, onSnapshot, getDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Search, Plus, ThumbsUp, AlertCircle, Loader2, MessageSquare, Volume2, Image as ImageIcon, Video, Film, X, Mic, Wand2, Flag, Share2, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { validateSlangMeaning, generateSlangExample, suggestSlangMeaning } from '../services/ai';
import { useAudio } from '../hooks/useAudio';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { SlangGuidelinesPanel } from './SlangGuidelines';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
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

function CommentSection({ slangId, meaningId, uiLang }: { slangId: string; meaningId: string; uiLang: 'en' | 'zh' }) {
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
      setComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as SlangComment)));
    });
    return () => unsub();
  }, [meaningId]);

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
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-xs font-medium text-gray-500 mb-2">
        {uiLang === 'zh' ? `评论 (${comments.length})` : `Comments (${comments.length})`}
      </p>
      {visibleComments.map((c) => (
        <div key={c.id} className="flex gap-2 mb-2">
          <div className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0 mt-0.5">
            {c.authorName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-700">{c.authorName}</span>
              <span className="text-[10px] text-gray-400">
                {c.createdAt?.toDate ? relativeTime(c.createdAt.toDate(), uiLang) : ''}
              </span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">{c.text}</p>
          </div>
        </div>
      ))}
      {comments.length > 5 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5 mb-2"
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
            className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-blue-500/50"
          />
          <button
            onClick={handleSubmitComment}
            disabled={!commentText.trim() || isSubmitting}
            className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

const REPORT_REASONS = [
  { value: 'spam', labelZh: '垃圾信息', labelEn: 'Spam' },
  { value: 'offensive', labelZh: '攻击性内容', labelEn: 'Offensive' },
  { value: 'inaccurate', labelZh: '不准确', labelEn: 'Inaccurate' },
  { value: 'other', labelZh: '其他', labelEn: 'Other' },
];

export function SlangDictionary({ uiLang, initialSearchTerm }: { uiLang: 'en' | 'zh', initialSearchTerm?: string }) {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [currentSlang, setCurrentSlang] = useState<Slang | null>(null);
  const [meanings, setMeanings] = useState<SlangMeaning[]>([]);
  const [searchResults, setSearchResults] = useState<(Slang & { topMeaning?: string; totalUpvotes?: number })[]>([]);
  const [allSlangCache, setAllSlangCache] = useState<Slang[]>([]);
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
        const q = query(collection(db, 'slangs'), where('term', '==', initialSearchTerm.trim().toLowerCase()), limit(1));
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

  const handlePlayAudio = async (meaning: SlangMeaning) => {
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
        await speak(meaning.meaning);
        // speak() manages its own playback lifecycle; clear the UI lock
        // here since we don't get an 'ended' callback surfaced.
        setPlayingAudioId(null);
      }
    } catch (error) {
      console.error("Error playing audio:", error);
      setPlayingAudioId(null);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleReport = async (meaningId: string) => {
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
  };

  const handleShare = async (term: string, meaning: string) => {
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
  };

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

      // Fallback: Firestore query
      let q = query(collection(db, 'slangs'), where('term', '==', term), limit(1));
      let snapshot = await getDocs(q);

      if (snapshot.empty) {
        q = query(
          collection(db, 'slangs'),
          where('term', '>=', term),
          where('term', '<=', term + '\uf8ff'),
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
        
        // Handle Penalties
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          let updates: any = {};
          
          if (validation.violationLevel === 'L1') {
            const newL1Count = (userData.l1PenaltyCount || 0) + 1;
            updates.l1PenaltyCount = newL1Count;
            
            if (newL1Count >= 5) { // L3 Penalty
              updates.currentStreak = 0;
              updates.l3PenaltyActive = true;
              // Downgrade title logic would go here
            } else if (newL1Count >= 3) { // L2 Penalty
              const penaltyUntil = new Date();
              penaltyUntil.setHours(penaltyUntil.getHours() + 48);
              updates.l2PenaltyUntil = penaltyUntil;
            }
          } else if (validation.violationLevel === 'V1') {
             updates.currentStreak = 0;
             updates.vPenaltyLevel = Math.max(userData.vPenaltyLevel || 0, 1);
             updates.reputationScore = (userData.reputationScore || 100) - 5;
          } else if (validation.violationLevel === 'V2') {
             updates.vPenaltyLevel = Math.max(userData.vPenaltyLevel || 0, 2);
             updates.reputationScore = (userData.reputationScore || 100) - 20;
          } else if (validation.violationLevel === 'V3') {
             updates.vPenaltyLevel = 3;
             updates.reputationScore = 0;
          }
          
          if (Object.keys(updates).length > 0) {
            await updateDoc(userRef, updates);
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
        const slangRef = await addDoc(collection(db, 'slangs'), {
          term: termToUse,
          createdAt: serverTimestamp()
        });
        slangId = slangRef.id;
        setCurrentSlang({ id: slangId, term: termToUse, createdAt: new Date() });
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
      await addDoc(collection(db, 'slang_meanings'), meaningDoc);

      // Update User Profile Stats & Titles
      const statsUserRef = doc(db, 'users', auth.currentUser.uid);
      const statsUserSnap = await getDoc(statsUserRef);
      if (statsUserSnap.exists()) {
        const userData = statsUserSnap.data() as UserProfile;
        const newApprovedCount = (userData.approvedSlangCount || 0) + 1;
        let updates: Partial<UserProfile> = {
          approvedSlangCount: newApprovedCount,
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
      if (msg.includes('不可用') || msg.includes('繁忙') || msg.includes('location')) {
        setSubmitError(uiLang === 'zh' ? 'AI 审核服务暂时不可用，请稍后重试' : 'AI review service temporarily unavailable');
      } else {
        setSubmitError(uiLang === 'zh' ? '提交失败，请重试' : 'Failed to submit, please try again');
      }
      Sentry.captureException(error, { tags: { component: 'SlangDictionary', op: 'slang.submit', collection: 'slang_meanings' } });
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  const handleUpvote = async (meaningId: string, currentUpvotes: number) => {
    if (!auth.currentUser) return;
    if (upvotedMeanings.has(meaningId)) return; // Already upvoted

    try {
      const upvoteId = `${auth.currentUser.uid}_${meaningId}`;

      // Must be atomic: firestore.rules isValidCounterUpdate uses
      // `!exists(upvote) && getAfter(upvote) != null`, which only holds
      // when both writes land in the same batch. Two serial writes fail
      // the second check because the upvote already exists by the time
      // updateDoc runs. Also: upvoteId must equal `uid + '_' + meaningId`
      // (rule line 201), so addDoc's random id could never pass anyway.
      const batch = writeBatch(db);
      batch.set(doc(db, 'slang_upvotes', upvoteId), {
        userId: auth.currentUser.uid,
        meaningId: meaningId,
        createdAt: serverTimestamp()
      });
      batch.update(doc(db, 'slang_meanings', meaningId), {
        upvotes: currentUpvotes + 1
      });
      await batch.commit();

      setUpvotedMeanings(prev => new Set(prev).add(meaningId));
    } catch (error) {
      console.error("Error upvoting:", error);
      toast.error(uiLang === 'zh' ? '点赞失败' : 'Upvote failed');
      Sentry.captureException(error, { tags: { component: 'SlangDictionary', op: 'firestore.write', collection: 'slang_upvotes' } });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-medium shadow-lg"
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
          onChange={(e) => {
            const val = e.target.value;
            setSearchTerm(val);
            // Typeahead suggestions
            if (val.trim()) {
              const q = val.trim().toLowerCase();
              // If cache not loaded yet, load it now
              if (allSlangCache.length === 0) {
                getDocs(collection(db, 'slangs')).then(snap => {
                  const slangs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Slang));
                  setAllSlangCache(slangs);
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
              setSearchResults(suggestions.length > 0 && !currentSlang ? suggestions : []);
            } else {
              setSearchResults([]);
            }
          }}
          onFocus={() => {
            if (searchTerm.trim() && allSlangCache.length > 0 && !currentSlang) {
              const q = searchTerm.trim().toLowerCase();
              const suggestions = allSlangCache.filter(s => s.term.toLowerCase().includes(q)).slice(0, 6);
              if (suggestions.length > 0) setSearchResults(suggestions);
            }
          }}
          placeholder={uiLang === 'zh' ? '搜索网络热词、梗...' : 'Search internet slang, memes...'}
          className="w-full bg-white/40 backdrop-blur-md border border-white/50 rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all shadow-sm"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        {searchTerm && (
          <button
            type="button"
            onClick={() => { setSearchTerm(''); setCurrentSlang(null); setMeanings([]); setShowAddForm(false); }}
            className="absolute right-24 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={isSearching || !searchTerm.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : (uiLang === 'zh' ? '搜索' : 'Search')}
        </button>
      </form>

      {/* Search results / typeahead */}
      {searchResults.length > 0 && !currentSlang && searchTerm.trim() && (
        <div className="absolute left-0 right-0 z-30 bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden mt-1 max-h-80 overflow-y-auto">
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 font-medium border-b border-gray-100">
            {uiLang === 'zh' ? `找到 ${searchResults.length} 个相关词条` : `${searchResults.length} matches`}
          </div>
          {searchResults.map(s => (
            <button
              key={s.id}
              onClick={() => { selectSlang(s); setSearchResults([]); }}
              className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-800">{s.term}</span>
                {(s.totalUpvotes || 0) > 0 && (
                  <span className="text-xs text-gray-400 flex items-center gap-1">👍 {s.totalUpvotes}</span>
                )}
              </div>
              {s.topMeaning && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{s.topMeaning}</p>
              )}
            </button>
          ))}
        </div>
      )}
      </div>

      {/* Weekly trending — collapsible. When collapsed, the outer container
          tightens (px-4 py-2, no mb-3 on the button) so it doesn't look like
          a half-empty card. When expanded it grows back to p-4 with breathing
          room above the list. */}
      {!currentSlang && !showAddForm && trendingTerms.length > 0 && (
        <div className={cn(
          "bg-white/70 rounded-2xl border border-white/60 shadow-sm transition-[padding] duration-200",
          trendingCollapsed ? "px-4 py-2" : "p-4"
        )}>
          <button
            onClick={toggleTrendingCollapsed}
            className={cn(
              "flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors w-full",
              !trendingCollapsed && "mb-3"
            )}
            aria-expanded={!trendingCollapsed}
          >
            <span>{uiLang === 'zh' ? '大家都在搜' : 'Trending This Week'}</span>
            {trendingCollapsed
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronUp className="w-4 h-4" />}
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
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-blue-50 transition-colors text-left"
                    >
                      {/* Previously red/orange/yellow/gray — retired the
                          rainbow in favor of a monochrome blue gradient so
                          the ranking badges don't fight the rest of the
                          page's blue palette. Depth still conveys rank. */}
                      <span className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black",
                        idx === 0 ? "bg-blue-600 text-white" :
                        idx === 1 ? "bg-blue-100 text-blue-600" :
                        idx === 2 ? "bg-blue-50 text-blue-500" :
                        "bg-gray-100 text-gray-500"
                      )}>
                        {idx + 1}
                      </span>
                      <span className="flex-1 text-sm font-semibold text-gray-800">{item.term}</span>
                      <span className="text-xs text-gray-400">{item.count} {uiLang === 'zh' ? '次' : 'searches'}</span>
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
                className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors mb-3"
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
                          className="px-3 py-1.5 bg-white/60 border border-white/60 rounded-xl text-sm font-medium text-gray-700 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 transition-colors"
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

          {/* Guidelines toggle */}
          {auth.currentUser && (
            <button
              onClick={() => setShowGuidelines(!showGuidelines)}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              {uiLang === 'zh' ? (showGuidelines ? '收起贡献准则' : '查看贡献准则') : (showGuidelines ? 'Hide Guidelines' : 'View Contribution Guidelines')}
            </button>
          )}
          <AnimatePresence>
            {showGuidelines && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <SlangGuidelinesPanel uiLang={uiLang} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}


      {searchTerm && !isSearching && !currentSlang && !showAddForm && searchResults.length === 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/40 backdrop-blur-md border border-white/50 rounded-3xl p-8 text-center shadow-sm"
        >
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {uiLang === 'zh' ? '未找到该词条' : 'Slang not found'}
          </h3>
          <p className="text-gray-500 mb-6">
            {uiLang === 'zh' ? '成为第一个解释这个梗的人吧！' : 'Be the first to explain this slang!'}
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-md shadow-blue-200"
          >
            <Plus className="w-5 h-5" />
            {uiLang === 'zh' ? '添加解释' : 'Add Meaning'}
          </button>
        </motion.div>
      )}

      {currentSlang && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">
              {currentSlang.term}
            </h2>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-1 text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" />
                {uiLang === 'zh' ? '补充解释' : 'Add Meaning'}
              </button>
            )}
          </div>

          <div className="space-y-4">
            {meanings.map((meaning, index) => (
              <motion.div 
                key={meaning.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white/60 backdrop-blur-md border border-white/60 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                      {meaning.authorName ? meaning.authorName.charAt(0).toUpperCase() : 'A'}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{meaning.authorName || 'Anonymous'}</p>
                      {meaning.authorTitle && (
                        <p className="text-xs text-blue-600 font-medium">{meaning.authorTitle}</p>
                      )}
                    </div>
                  </div>
                  {meaning.qualityScore && (
                    <div className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded-lg text-xs font-bold">
                      <span>AI 评分</span>
                      <span>{meaning.qualityScore}</span>
                    </div>
                  )}
                </div>
                
                <p className="text-gray-900 text-lg mb-4 leading-relaxed whitespace-pre-wrap">
                  {meaning.meaning}
                </p>
                
                {meaning.mediaUrl && (
                  <div className="mb-4 rounded-xl overflow-hidden border border-gray-100">
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

                <div className="bg-gray-50/50 rounded-xl p-4 mb-4 border border-gray-100/50">
                  <p className="text-gray-600 italic text-sm">
                    "{meaning.example}"
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleUpvote(meaning.id, meaning.upvotes)}
                      disabled={upvotedMeanings.has(meaning.id)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                        upvotedMeanings.has(meaning.id)
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      )}
                    >
                      <ThumbsUp className={cn("w-4 h-4", upvotedMeanings.has(meaning.id) && "fill-current")} />
                      {meaning.upvotes}
                    </button>
                    {/* Report/Flag button */}
                    <div className="relative">
                      <button
                        onClick={() => setReportingMeaningId(reportingMeaningId === meaning.id ? null : meaning.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                        title={uiLang === 'zh' ? '举报' : 'Report'}
                      >
                        <Flag className="w-4 h-4" />
                      </button>
                      <AnimatePresence>
                        {reportingMeaningId === meaning.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute left-0 bottom-full mb-1 bg-white border border-gray-200 rounded-xl p-3 shadow-lg z-10 min-w-[180px]"
                          >
                            <p className="text-xs font-medium text-gray-700 mb-2">
                              {uiLang === 'zh' ? '举报原因' : 'Report reason'}
                            </p>
                            <select
                              value={reportReason}
                              onChange={(e) => setReportReason(e.target.value)}
                              className="w-full text-xs border border-gray-200 rounded-lg p-1.5 mb-2 outline-none focus:ring-1 focus:ring-red-500/50"
                            >
                              {REPORT_REASONS.map(r => (
                                <option key={r.value} value={r.value}>
                                  {uiLang === 'zh' ? r.labelZh : r.labelEn}
                                </option>
                              ))}
                            </select>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => setReportingMeaningId(null)}
                                className="flex-1 text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                              >
                                {uiLang === 'zh' ? '取消' : 'Cancel'}
                              </button>
                              <button
                                onClick={() => handleReport(meaning.id)}
                                className="flex-1 text-xs px-2 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600"
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
                      onClick={() => handleShare(currentSlang!.term, meaning.meaning)}
                      className="p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50"
                      title={uiLang === 'zh' ? '分享' : 'Share'}
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => handlePlayAudio(meaning)}
                    disabled={playingAudioId === meaning.id}
                    className="p-2 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                    title={uiLang === 'zh' ? '朗读' : 'Read aloud'}
                  >
                    {playingAudioId === meaning.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <div className="relative">
                        <Volume2 className="w-5 h-5" />
                        {meaning.userAudioUrl && (
                          <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full border border-white" />
                        )}
                      </div>
                    )}
                  </button>
                </div>
                {/* Comment Section */}
                {currentSlang && (
                  <CommentSection slangId={currentSlang.id} meaningId={meaning.id} uiLang={uiLang} />
                )}
              </motion.div>
            ))}

            {meanings.length === 0 && !showAddForm && (
              <p className="text-center text-gray-500 py-8">
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
            <form onSubmit={handleSubmitMeaning} className="bg-white/60 backdrop-blur-md border border-white/60 rounded-3xl p-6 shadow-sm space-y-4">
              <h3 className="text-lg font-bold text-gray-900">
                {uiLang === 'zh' ? `解释 "${currentSlang?.term || searchTerm}"` : `Define "${currentSlang?.term || searchTerm}"`}
              </h3>

              {/* Example reference card */}
              <div className="bg-blue-50/80 border border-blue-100 rounded-xl p-3 text-xs text-gray-600 space-y-1.5">
                <p className="font-bold text-blue-700 text-sm">{uiLang === 'zh' ? '参考示例 💡' : 'Example for reference 💡'}</p>
                <div className="bg-white/80 rounded-lg p-2.5 space-y-1">
                  <p><span className="font-bold text-gray-800">{uiLang === 'zh' ? '词条：' : 'Term: '}</span>yyds</p>
                  <p><span className="font-bold text-gray-800">{uiLang === 'zh' ? '含义：' : 'Meaning: '}</span>{uiLang === 'zh' ? '"永远的神"拼音首字母缩写，源自电竞圈，用于表达对某人或某物的极致推崇。' : '"Forever God" — acronym from Chinese gaming, used to express ultimate admiration.'}</p>
                  <p><span className="font-bold text-gray-800">{uiLang === 'zh' ? '例句：' : 'Example: '}</span>{uiLang === 'zh' ? '这家面馆的味道真的YYDS，每次路过都要吃。' : 'This noodle shop is YYDS, I eat here every time I pass by.'}</p>
                </div>
                <p className="text-gray-400">{uiLang === 'zh' ? '写清楚来源、使用场景，像跟朋友解释一样自然就好！' : 'Write naturally, like explaining to a friend!'}</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    {uiLang === 'zh' ? '含义' : 'Meaning'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const term = currentSlang ? currentSlang.term : searchTerm.trim().toLowerCase();
                      if (term) fetchSuggestion(term, newMeaning, true);
                    }}
                    disabled={isLoadingSuggestion}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title={uiLang === 'zh' ? '让 AI 帮你起个草稿' : 'Let AI draft it for you'}
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    {isLoadingSuggestion
                      ? (uiLang === 'zh' ? '生成中…' : 'Drafting…')
                      : (newMeaning.trim()
                          ? (uiLang === 'zh' ? '扩写' : 'Expand')
                          : (uiLang === 'zh' ? '帮我写一条' : 'Draft for me'))}
                  </button>
                </div>
                <textarea
                  value={newMeaning}
                  onChange={(e) => handleMeaningChange(e.target.value)}
                  placeholder={uiLang === 'zh' ? '例：源自电竞圈的缩写，后来在全网流行，用来夸赞...' : 'e.g. An acronym from gaming that went viral, used to praise...'}
                  className="w-full bg-white/50 border border-white/50 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[100px] resize-none"
                  required
                />
                {isLoadingSuggestion && (
                  <span className="flex items-center gap-1 text-xs text-blue-500 mt-1">
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
                      className="mt-2 bg-blue-50 border border-blue-200 rounded-xl p-3 cursor-pointer hover:bg-blue-100 transition-colors group"
                      onClick={() => { setNewMeaning(aiSuggestion); setAiSuggestion(''); }}
                    >
                      <div className="flex items-start gap-2">
                        <Wand2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-blue-600 mb-1">
                            {uiLang === 'zh' ? 'AI 建议' : 'AI Suggestion'}
                          </p>
                          <p className="text-sm text-gray-700 leading-relaxed">{aiSuggestion}</p>
                        </div>
                        <span className="text-[10px] text-blue-400 group-hover:text-blue-600 shrink-0 mt-0.5">
                          {uiLang === 'zh' ? '点击采纳' : 'Click to apply'}
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">
                    {uiLang === 'zh' ? '例句' : 'Example'}
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
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 disabled:opacity-50"
                  >
                    {isGeneratingExample ? <Loader2 className="w-3 h-3 animate-spin" /> : '✨'}
                    {uiLang === 'zh' ? 'AI 帮我写' : 'AI Generate'}
                  </button>
                </div>
                <textarea
                  value={newExample}
                  onChange={(e) => setNewExample(e.target.value)}
                  placeholder={uiLang === 'zh' ? '例：这家面馆的味道真的YYDS，每次路过都要吃。' : 'e.g. This noodle shop is YYDS, I eat here every time.'}
                  className="w-full bg-white/50 border border-white/50 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[80px] resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {uiLang === 'zh' ? '选填。如果不提供例句，词条的审核优先级和质量评分将会降低。' : 'Optional. Without an example, the review priority and quality score will be lower.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {uiLang === 'zh' ? 'AI 播报语音' : 'AI Voice'}
                  </label>
                  <select
                    value={newVoiceName}
                    onChange={(e) => setNewVoiceName(e.target.value)}
                    disabled={!!audioFile}
                    className="w-full bg-white/50 border border-white/50 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
                  >
                    <option value="Kore">Kore (Female)</option>
                    <option value="Puck">Puck (Male)</option>
                    <option value="Charon">Charon (Male)</option>
                    <option value="Fenrir">Fenrir (Male)</option>
                    <option value="Zephyr">Zephyr (Female)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {uiLang === 'zh' ? '上传自定义语音 (可选)' : 'Upload Custom Voice (Optional)'}
                  </label>
                  <label className="flex items-center justify-center gap-2 bg-white/50 border border-dashed border-gray-300 rounded-xl p-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all">
                    <input 
                      type="file" 
                      accept="audio/*" 
                      onChange={handleAudioFileChange} 
                      className="hidden" 
                    />
                    <Mic className={cn("w-4 h-4", audioFile ? "text-blue-600" : "text-gray-400")} />
                    <span className={cn("text-xs truncate max-w-[120px]", audioFile ? "text-blue-600 font-medium" : "text-gray-500")}>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {uiLang === 'zh' ? '上传媒体 (可选)' : 'Upload Media (Optional)'}
                </label>
                <div className="flex items-center gap-4">
                  <label className="flex-1 flex items-center justify-center gap-2 bg-white/50 border border-dashed border-gray-300 rounded-xl p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all">
                    <input 
                      type="file" 
                      accept="image/*,video/*,.gif" 
                      onChange={handleFileChange} 
                      className="hidden" 
                    />
                    {mediaFile ? (
                      <span className="text-sm text-blue-600 font-medium truncate max-w-[200px]">{mediaFile.name}</span>
                    ) : (
                      <>
                        <ImageIcon className="w-5 h-5 text-gray-400" />
                        <Video className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-500">{uiLang === 'zh' ? '点击上传图片/视频/GIF' : 'Upload Image/Video/GIF'}</span>
                      </>
                    )}
                  </label>
                  {mediaPreview && (
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 shrink-0">
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
                <p className="text-[10px] text-gray-400 mt-1">
                  {uiLang === 'zh' ? '支持格式: JPG, PNG, GIF, MP4 (最大 10MB)' : 'Formats: JPG, PNG, GIF, MP4 (Max 10MB)'}
                </p>
              </div>

              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3 text-sm text-blue-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
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

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl text-sm font-medium transition-colors"
                >
                  {uiLang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploading}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {(isSubmitting || isUploading) && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isUploading ? (uiLang === 'zh' ? '上传中...' : 'Uploading...') : (uiLang === 'zh' ? '提交' : 'Submit')}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
