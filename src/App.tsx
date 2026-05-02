import React, { useState, useEffect, useRef, Component, ReactNode, lazy, Suspense } from 'react';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ReactMarkdown from 'react-markdown';
import {
  Search,
  Plus,
  BookOpen,
  LogIn,
  Loader2,
  Volume2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Languages,
  History,
  PenTool,
  Mic,
  MicOff,
  MessageSquare,
  Zap,
  Trophy,
  UserCircle,
  Headphones
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db, signIn, logOut, emailSignUp, emailSignIn, resetPassword } from './firebase';
import {
  TranslationResult,
  checkGrammar,
  GrammarCheckResult,
  extractTextFromImage,
  translateSimple,
  aiChat,
  getReviewHint
} from './services/ai';
import { cn } from './lib/utils';
import { Language, translations } from './i18n';
import { APP_VERSION, APP_ENV, IS_STAGING } from './version';
import ChangelogBell from './components/ChangelogBell';
import SettingsModal from './components/SettingsModal';
import ChangelogToast from './components/ChangelogToast';
import RateLimitModal, { RateLimitInfo } from './components/RateLimitModal';
import { RateLimitError } from './services/ai';
import { useAuth } from './hooks/useAuth';
import { useAudio } from './hooks/useAudio';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useTranslation } from './hooks/useTranslation';
import { useWordbook } from './hooks/useWordbook';
import { useReview } from './hooks/useReview';
import { useSearchHistory } from './hooks/useSearchHistory';

// --- Error Handling ---
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo?.componentStack } },
      tags: { component: 'error-boundary' },
    });
  }

  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || String(this.state.error);
      const isQuota = msg.includes('Quota') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
      // Class component can't consume React context; localStorage is the
      // cross-cutting way to share uiLang with the global ErrorBoundary.
      let uiLang: 'en' | 'zh' = 'zh';
      try {
        const stored = localStorage.getItem('memeflow_uiLang');
        if (stored === 'en' || stored === 'zh') uiLang = stored;
      } catch {}
      const copy = uiLang === 'zh'
        ? {
            quotaTitle: '数据库配额已用完',
            genericTitle: '页面出错了',
            quotaBody: '今日免费数据库请求次数已达上限，请稍后再试（通常在几小时内重置）。',
            retry: '刷新重试',
          }
        : {
            quotaTitle: 'Database quota exceeded',
            genericTitle: 'Something went wrong',
            quotaBody: "Today's free database request limit was reached. Please try again in a few hours.",
            retry: 'Reload',
          };
      return (
        <div className="p-8 text-center bg-red-50 min-h-screen flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">
            {isQuota ? copy.quotaTitle : copy.genericTitle}
          </h1>
          <p className="text-gray-600 mb-4 max-w-md">
            {isQuota ? copy.quotaBody : msg}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            {copy.retry}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Types ---
export interface SavedWord extends TranslationResult {
  id: string;
  userId: string;
  styleTag?: 'authentic' | 'academic' | 'standard';
  nextReviewDate?: Timestamp;
  interval?: number;
  easeFactor?: number;
  createdAt: Timestamp;
}

export interface UserProfile {
  userId: string;
  isPro: boolean;
  translationCount: number;
  grammarCount: number;
  lastResetDate: string;
  tabOrder?: string[];
  
  // Title System
  titleLevel1?: string; // 梗学徒, 文化观察员, 打卡达人, 多模态先锋
  titleLevel2?: string; // 本周梗王, 梗百科编辑, 活跃贡献者
  titleLevel3?: string; // 梗百科大使, 首席文化官 CCO, 梗神
  
  // Stats
  approvedSlangCount: number;
  currentStreak: number;
  lastContributionDate?: string;
  dailyContributionCount?: number;
  hasUploadedMedia?: boolean;
  
  // Reputation & Penalties
  reputationScore: number; // Default 100
  l1PenaltyCount: number;
  l2PenaltyUntil?: Timestamp;
  l3PenaltyActive?: boolean;
  vPenaltyLevel?: number; // 1, 2, 3
  
  // Badge
  equippedBadge?: string; // achievement id, e.g. 'legend'

  // Onboarding
  hasCompletedOnboarding?: boolean;
  createdAt?: any;
}

// Eager: needed for first paint or auth gating
import PaymentScreen from './components/PaymentScreen';
import { OnboardingChecklist } from './components/OnboardingChecklist';
import TranslateTab from './pages/TranslateTab';

// Sortable tab — Pro users can long-press + drag to reorder. Non-Pro
// users get a normal button (no drag listeners attached). Listeners are
// fed in from the parent so we can conditionally enable drag.
interface SortableTabProps {
  tab: { id: string; label: string; icon: any; count?: number };
  isActive: boolean;
  onSelect: () => void;
}
// Tab reordering is open to every signed-in user (free tier included) —
// the tab they drag to position 0 becomes their default landing tab on
// next app open. Previously this was Pro-gated via `disabled: !isPro`,
// but the "first-tab-is-landing" UX only works if every user can actually
// reorder. Kept the prop-less signature so future Pro-only features can be
// added without reintroducing the old gate.
function SortableTab({ tab, isActive, onSelect }: SortableTabProps) {
  const sortable = useSortable({ id: tab.id });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortable;
  // Drag handle is attached ONLY to the currently-active tab. Motivation:
  //   - On mobile the tab strip scrolls horizontally to reach tabs that
  //     overflow the viewport. If every tab listens for pointer events,
  //     dnd-kit's 250 ms long-press timer competes with the swipe-to-scroll
  //     gesture — users trying to scroll accidentally grabbed a tab.
  //   - Hooking listeners only on the active tab means a quick swipe on any
  //     inactive tab falls through to the container's native
  //     `overflow-x-auto`, and only a deliberate long-press on the tab the
  //     user is already on enters reorder mode. That matches every native
  //     mobile OS pattern: "you can rearrange the thing you're holding".
  const dragListeners = isActive ? listeners : undefined;
  const dragAttributes = isActive ? attributes : undefined;
  // dnd-kit tracks the raw pointer offset in transform.{x,y,scaleX,scaleY}.
  // Lock Y to 0 so a diagonal drag doesn't lift the tab off the strip.
  const style: React.CSSProperties = {
    transform: transform
      ? CSS.Transform.toString({ ...transform, y: 0 })
      : undefined,
    transition,
    opacity: isDragging ? 0.65 : 1,
    zIndex: isDragging ? 20 : 1,
    // touchAction: 'none' suppresses native scroll — only apply on the
    // active tab so swipes on inactive tabs still scroll the strip.
    touchAction: isActive ? 'none' : 'auto',
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex-1 min-w-[80px]"
      {...dragAttributes}
      {...dragListeners}
    >
      <button
        onClick={onSelect}
        className={cn(
          "relative w-full py-2.5 sm:py-3 rounded-[17px] text-xs sm:text-sm transition-all flex flex-col items-center justify-center gap-1 whitespace-nowrap px-3 select-none",
          isActive
            ? "glass-pill-active text-[#0A0E1A] font-zh-serif font-medium"
            : "text-[rgba(10,14,26,0.58)] font-zh-sans font-normal hover:text-[#0A0E1A]"
        )}
      >
        <span className="flex items-center gap-1.5 relative z-[2]">
          <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span>
            {tab.label}
            {tab.count !== undefined && <span className="hidden xs:inline"> ({tab.count})</span>}
          </span>
        </span>
        {/* Tiny glowing blue dot under the label — only on active tab.
            The "small design" detail that quietly marks the current page. */}
        {isActive && <span className="tab-dot-active relative z-[2]" aria-hidden="true" />}
      </button>
    </div>
  );
}

// Lazy: loaded on tab switch / drawer open. Cuts the initial bundle by
// pulling SlangDictionary, UserProfile, Leaderboard, ReviewPage,
// SlangOnboarding, GrammarPage, WordbookPage out of the main chunk.
const SlangDictionary = lazy(() =>
  import('./components/SlangDictionary').then(m => ({ default: m.SlangDictionary }))
);
const SlangOnboarding = lazy(() =>
  import('./components/SlangOnboarding').then(m => ({ default: m.SlangOnboarding }))
);
const Leaderboard = lazy(() => import('./components/Leaderboard'));
const UserProfileComponent = lazy(() => import('./components/UserProfile'));
const GrammarPage = lazy(() => import('./pages/GrammarPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const WordbookPage = lazy(() => import('./pages/WordbookPage'));
const ClassroomTab = lazy(() => import('./pages/ClassroomTab'));

function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-[#5B7FE8]" />
    </div>
  );
}

function LoginPage({ uiLang, t }: { uiLang: Language; t: any }) {
  const [mode, setMode] = useState<'main' | 'email' | 'guest'>('main');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [guestCode, setGuestCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleEmailAuth = async () => {
    setError('');
    if (!email || !password) {
      setError(uiLang === 'zh' ? '请输入邮箱和密码' : 'Please enter email and password');
      return;
    }
    if (password.length < 6) {
      setError(uiLang === 'zh' ? '密码至少 6 位' : 'Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (isSignUp) {
        await emailSignUp(email, password);
      } else {
        await emailSignIn(email, password);
      }
    } catch (e: any) {
      const code = e.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        setError(uiLang === 'zh' ? '账号不存在或密码错误' : 'Account not found or wrong password');
      } else if (code === 'auth/email-already-in-use') {
        setError(uiLang === 'zh' ? '该邮箱已注册，请直接登录' : 'Email already registered, please sign in');
      } else if (code === 'auth/invalid-email') {
        setError(uiLang === 'zh' ? '邮箱格式不正确' : 'Invalid email format');
      } else if (code === 'auth/weak-password') {
        setError(uiLang === 'zh' ? '密码太弱，至少 6 位' : 'Password too weak, at least 6 characters');
      } else if (code === 'auth/too-many-requests') {
        setError(uiLang === 'zh' ? '操作太频繁，请稍后重试' : 'Too many attempts, please try later');
      } else if (code === 'auth/network-request-failed') {
        setError(uiLang === 'zh' ? '网络连接失败，请检查网络' : 'Network error, please check connection');
      } else {
        setError(uiLang === 'zh' ? '登录失败，请重试' : 'Authentication failed, please try again');
      }
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setError('');
    // Trim whitespace — previously "8888 " failed silently.
    if (guestCode.trim() !== '8888') {
      setError(uiLang === 'zh' ? '邀请码错误' : 'Invalid invite code');
      return;
    }
    setLoading(true);
    try {
      const { signInAnonymously } = await import('firebase/auth');
      const { auth } = await import('./firebase');
      await signInAnonymously(auth);
    } catch (e: any) {
      // Give the user an actionable message rather than raw Firebase codes.
      const code = e?.code || '';
      const msg = e?.message || 'Login failed';
      let friendly: string;
      if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
        friendly = uiLang === 'zh'
          ? '内测登录未启用,请联系管理员在 Firebase Console 开启 Anonymous provider'
          : 'Anonymous sign-in is disabled. Ask the admin to enable it in Firebase Console.';
      } else if (code === 'auth/admin-restricted-operation') {
        friendly = uiLang === 'zh' ? '内测登录被管理员限制' : 'Sign-in restricted by admin';
      } else if (code === 'auth/network-request-failed') {
        friendly = uiLang === 'zh' ? '网络连接失败,请检查网络' : 'Network error, check connection';
      } else {
        friendly = uiLang === 'zh' ? `登录失败: ${msg}` : `Login failed: ${msg}`;
      }
      setError(friendly);
    }
    setLoading(false);
  };

  const handleReset = async () => {
    if (!email) {
      setError(uiLang === 'zh' ? '请先输入邮箱' : 'Please enter your email first');
      return;
    }
    try {
      await resetPassword(email);
      setResetSent(true);
      setError('');
    } catch (e: any) {
      setError(uiLang === 'zh' ? '发送失败，请检查邮箱' : 'Failed to send reset email');
    }
  };

  return (
    <div className="min-h-screen bg-white sm:bg-[#F8F9FA] flex flex-col items-center justify-center p-4 sm:p-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-none sm:shadow-xl p-6 sm:p-10 border-0 sm:border sm:border-gray-100"
      >
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[rgba(91,127,232,0.08)] rounded-2xl flex items-center justify-center mx-auto mb-6 sm:mb-8">
          <Languages className="w-8 h-8 sm:w-10 sm:h-10 text-[#5B7FE8]" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-1 tracking-tight">
          {t.appName}
          {IS_STAGING && (
            <span className="ml-2 align-middle px-2 py-0.5 bg-yellow-400 text-yellow-900 text-xs font-black rounded tracking-wider">
              STAGING
            </span>
          )}
        </h1>
        <div className="text-[11px] text-gray-400 font-mono mb-3 sm:mb-4 tabular-nums">v{APP_VERSION} · {APP_ENV}</div>
        <p className="text-gray-600 mb-8 sm:mb-10 text-base sm:text-lg leading-relaxed">{t.tagline}</p>

        {mode === 'main' ? (
          <div className="space-y-3">
            <button
              onClick={signIn}
              className="w-full bg-[#0A0E1A] hover:bg-[#1a2440] text-white font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-[rgba(91,127,232,0.2)]"
            >
              <LogIn className="w-5 h-5" />
              {uiLang === 'zh' ? 'Google 账号登录' : 'Sign in with Google'}
            </button>
            <button
              onClick={() => setMode('email')}
              className="w-full bg-white hover:bg-[rgba(91,127,232,0.08)] text-[#5B7FE8] border-2 border-[rgba(91,127,232,0.3)] hover:border-[#5B7FE8] font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3"
            >
              <LogIn className="w-5 h-5" />
              {uiLang === 'zh' ? '邮箱登录 / 注册' : 'Sign in with Email'}
            </button>
            <div className="relative flex items-center my-2">
              <div className="flex-1 border-t border-gray-200" />
              <span className="px-3 text-xs text-gray-400">{uiLang === 'zh' ? '或' : 'or'}</span>
              <div className="flex-1 border-t border-gray-200" />
            </div>
            <button
              onClick={() => setMode('guest')}
              className="w-full border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3"
            >
              {uiLang === 'zh' ? '内测体验（邀请码）' : 'Beta Access (Invite Code)'}
            </button>
          </div>
        ) : mode === 'email' ? (
          <div className="space-y-4 text-left">
            <button onClick={() => { setMode('main'); setError(''); setResetSent(false); }} className="text-sm text-[#5B7FE8] hover:text-[#5B7FE8] font-medium">
              ← {uiLang === 'zh' ? '返回' : 'Back'}
            </button>

            <h3 className="text-lg font-bold text-gray-900">
              {isSignUp ? (uiLang === 'zh' ? '注册新账号' : 'Create Account') : (uiLang === 'zh' ? '邮箱登录' : 'Sign In')}
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{uiLang === 'zh' ? '邮箱' : 'Email'}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#5B7FE8] focus:ring-2 focus:ring-[rgba(91,127,232,0.2)] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{uiLang === 'zh' ? '密码' : 'Password'}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignUp ? (uiLang === 'zh' ? '至少 6 位' : 'At least 6 characters') : '••••••'}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#5B7FE8] focus:ring-2 focus:ring-[rgba(91,127,232,0.2)] outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()}
              />
            </div>

            <button
              onClick={handleEmailAuth}
              disabled={loading}
              className="w-full bg-gray-800 hover:bg-gray-900 disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSignUp ? (uiLang === 'zh' ? '注册' : 'Sign Up') : (uiLang === 'zh' ? '登录' : 'Sign In')}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="text-[#5B7FE8] hover:text-[#5B7FE8] font-medium">
                {isSignUp ? (uiLang === 'zh' ? '已有账号？登录' : 'Have an account? Sign in') : (uiLang === 'zh' ? '没有账号？注册' : 'No account? Sign up')}
              </button>
              {!isSignUp && (
                <button onClick={handleReset} className="text-gray-500 hover:text-gray-700">
                  {uiLang === 'zh' ? '忘记密码' : 'Forgot password'}
                </button>
              )}
            </div>

            {resetSent && (
              <p className="text-sm text-green-600 bg-green-50 rounded-xl px-4 py-2">
                {uiLang === 'zh' ? '重置邮件已发送，请查收' : 'Reset email sent, please check your inbox'}
              </p>
            )}

            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2">{error}</p>
            )}
          </div>
        ) : mode === 'guest' ? (
          <div className="space-y-4 text-left">
            <button onClick={() => { setMode('main'); setError(''); setGuestCode(''); }} className="text-sm text-[#5B7FE8] hover:text-[#5B7FE8] font-medium">
              ← {uiLang === 'zh' ? '返回' : 'Back'}
            </button>
            <h3 className="text-lg font-bold text-gray-900">
              {uiLang === 'zh' ? '内测体验' : 'Beta Access'}
            </h3>
            <p className="text-sm text-gray-500">
              {uiLang === 'zh' ? '输入邀请码即可体验全部功能' : 'Enter invite code to access all features'}
            </p>
            <input
              type="text"
              value={guestCode}
              onChange={(e) => setGuestCode(e.target.value)}
              placeholder={uiLang === 'zh' ? '请输入邀请码' : 'Enter invite code'}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#5B7FE8] focus:ring-2 focus:ring-[rgba(91,127,232,0.2)] outline-none text-center text-lg tracking-widest"
              maxLength={10}
              onKeyDown={(e) => e.key === 'Enter' && handleGuestLogin()}
            />
            <button
              onClick={handleGuestLogin}
              disabled={loading || !guestCode}
              className="w-full bg-[#0A0E1A] hover:bg-[#1a2440] disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {uiLang === 'zh' ? '进入体验' : 'Enter'}
            </button>
            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2">{error}</p>
            )}
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}

// ====== MAINTENANCE MODE ======
// Set to true to show maintenance page to all users
// You can bypass with ?admin in the URL
const MAINTENANCE_MODE = false;

function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F4F7FF] via-[#E8EEFC] to-[#DDE5F7] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 sm:p-10 text-center space-y-6">
        <div className="w-20 h-20 bg-[rgba(91,127,232,0.08)] rounded-2xl flex items-center justify-center mx-auto">
          <svg className="w-10 h-10 text-[#5B7FE8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900">MemeFlow 维护中</h1>
        <p className="text-gray-500 leading-relaxed">
          我们正在升级服务器，预计很快恢复。感谢你的耐心等待！
        </p>
        <div className="bg-[rgba(91,127,232,0.08)] rounded-2xl p-4">
          <p className="text-sm text-[#5B7FE8] font-medium">System Maintenance in Progress</p>
          <p className="text-xs text-[rgba(91,127,232,0.6)] mt-1">We're upgrading our servers. Back soon!</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // Maintenance mode bypass: add ?admin to URL
  const isAdmin = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('admin');
  if (MAINTENANCE_MODE && !isAdmin) {
    return <MaintenancePage />;
  }

  // Starts at 'slang' as a safe SSR/first-paint fallback. The real default
  // is the first tab in the user's tabOrder — synced in via a useEffect
  // below once userProfile loads. If the user manually switches tabs before
  // profile load finishes, we respect their choice and skip the sync (see
  // userSwitchedTabRef).
  const [activeTab, setActiveTabState] = useState<'translate' | 'slang' | 'grammar' | 'review' | 'history' | 'leaderboard' | 'profile' | 'classroom'>('slang');
  const userSwitchedTabRef = useRef(false);
  const setActiveTab: typeof setActiveTabState = (value) => {
    userSwitchedTabRef.current = true;
    setActiveTabState(value);
  };
  const [showPayment, setShowPayment] = useState(false);
  const [paymentTrigger, setPaymentTrigger] = useState('default');

  // (Retired 2026-04-20: mobile QR code entry. Users were clicking it and
  // landing on someone else's cloud-run URL — moved nothing of value there.
  // Replaced by the Settings gear which houses language + feedback + logout.)
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [grammarInput, setGrammarInput] = useState('');
  const [isCheckingGrammar, setIsCheckingGrammar] = useState(false);
  const [grammarResult, setGrammarResult] = useState<GrammarCheckResult | null>(null);
  const [isExtractingPhoto, setIsExtractingPhoto] = useState(false);
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtractingPhoto(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const text = await extractTextFromImage(base64, file.type);
        if (text && text !== 'NO_TEXT') {
          setInputText(text);
        }
        setIsExtractingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Image extraction failed:', err);
      setIsExtractingPhoto(false);
    }
    e.target.value = '';
  };

  const [uiLang, setUiLang] = useState<Language>(() => {
    // Prefer user's last explicit choice; fall back to browser locale.
    // ErrorBoundary (class component) reads this key too — keep in sync.
    try {
      const stored = localStorage.getItem('memeflow_uiLang');
      if (stored === 'en' || stored === 'zh') return stored;
    } catch {}
    return typeof navigator !== 'undefined' && navigator.language.startsWith('zh') ? 'zh' : 'en';
  });

  useEffect(() => {
    try { localStorage.setItem('memeflow_uiLang', uiLang); } catch {}
  }, [uiLang]);

  const t = translations[uiLang];

  // Shared logout confirmation — bound to both the header icon button and
  // the UserProfile page's red "Sign out" button. Using toast.warning so
  // the icon + color make it impossible to miss vs the default variant.
  const confirmLogout = () => {
    toast.warning(uiLang === 'zh' ? '确定要退出登录吗？' : 'Sign out of MemeFlow?', {
      action: {
        label: uiLang === 'zh' ? '退出' : 'Sign out',
        onClick: () => logOut(),
      },
      cancel: {
        label: uiLang === 'zh' ? '取消' : 'Cancel',
        onClick: () => {},
      },
      duration: 8000,
    });
  };

  // AI Chat state
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // --- Custom Hooks ---
  const { user, userProfile, setUserProfile, isAuthReady } = useAuth();
  const { speak, stopAllAudio, loadingAudioText } = useAudio();

  const onPaymentNeeded = (trigger: string) => {
    setPaymentTrigger(trigger);
    setShowPayment(true);
  };

  // Global RateLimitError handler. Any time a Gemini call throws 429,
  // ai.ts wraps it in RateLimitError and re-throws. The window-level
  // unhandledrejection listener catches it here and surfaces the modal.
  // Any code that swallows the error in its own catch (e.g. liveSession's
  // translateWithRetry → "翻译失败" placeholder) is fine — modal only
  // fires for errors that escape the call stack.
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      if (reason instanceof RateLimitError) {
        setRateLimitInfo({
          bucket: reason.bucket,
          reason: reason.reason,
          retryAfter: reason.retryAfter,
          isPro: reason.isPro,
        });
        // Mark handled — no console error noise for an expected-UX path.
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  const { savedWords, searchQuery, setSearchQuery, wordbookFilter, setWordbookFilter, filteredWords, selectedWordbookItem, setSelectedWordbookItem, handleDeleteWord, folders, wordFolderMap, activeFolderId, setActiveFolderId, createFolder, renameFolder, deleteFolder, moveWordsToFolder } = useWordbook(user);

  const {
    inputText, setInputText, isTranslating, translationResult, slangInsights, isFetchingSlang,
    selectedUsageIndex, setSelectedUsageIndex, showDetails, setShowDetails,
    formalityLevel, setFormalityLevel, lastTranslatedFormality, isSaving, isLoadingDetails,
    handleTranslate, handleSaveWord, ensureDetailsLoaded, clearTranslation,
  } = useTranslation({ user, userProfile, setUserProfile, savedWords, uiLang, onPaymentNeeded });

  // Fire-and-forget: when the user opens Details, lazy-load synonyms/etc for
  // the selected usage. Cached per-usage so re-expanding is free.
  const handleToggleDetails = (next: boolean) => {
    setShowDetails(next);
    if (next) { void ensureDetailsLoaded(selectedUsageIndex); }
  };
  const handleSelectUsage = (idx: number) => {
    setSelectedUsageIndex(idx);
    if (showDetails) { void ensureDetailsLoaded(idx); }
  };

  const { dueWords, reviewIndex, setReviewIndex, showReviewAnswer, setShowReviewAnswer, currentReviewWord, handleReview } = useReview(user, userProfile, savedWords);

  const { isListening, toggleListening } = useSpeechRecognition({ uiLang, activeTab, setInputText, setGrammarInput, stopAllAudio });

  const { history: searchHistory, addToHistory, removeFromHistory, clearHistory } = useSearchHistory();

  const handleTranslateWithHistory = (e?: React.FormEvent) => {
    if (inputText.trim()) addToHistory(inputText.trim());
    handleTranslate(e);
  };

  const [previousSearchWord, setPreviousSearchWord] = useState<string | null>(null);

  const handleSearchWord = (word: string) => {
    // 记住跳转前的词
    if (inputText.trim() && inputText.trim() !== word) {
      setPreviousSearchWord(inputText.trim());
    }
    setInputText(word);
    addToHistory(word);
    handleTranslate(undefined, word);
  };

  const handleGoBack = () => {
    if (!previousSearchWord) return;
    const backTo = previousSearchWord;
    setPreviousSearchWord(null);
    setInputText(backTo);
    addToHistory(backTo);
    handleTranslate(undefined, backTo);
  };

  useEffect(() => {
    const skipped = localStorage.getItem('memeflow_onboarding_skipped');
    if (activeTab === 'slang' && userProfile && !userProfile.hasCompletedOnboarding && !skipped) {
      setShowOnboarding(true);
    }
  }, [activeTab, userProfile]);

  const handleUpgrade = () => {
    setPaymentTrigger('default');
    setShowPayment(true);
  };

  const handleCheckGrammar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!grammarInput.trim() || isCheckingGrammar) return;

    const currentCount = userProfile?.grammarCount ?? 0;
    if (userProfile && !userProfile.isPro && currentCount >= 10) {
      setPaymentTrigger('translation_limit');
      setShowPayment(true);
      return;
    }

    setIsCheckingGrammar(true);
    try {
      const result = await checkGrammar(grammarInput);
      setGrammarResult(result);

      if (userProfile && !userProfile.isPro) {
        const nextCount = currentCount + 1;
        const userRef = doc(db, 'users', userProfile.userId);
        try {
          await updateDoc(userRef, { grammarCount: nextCount });
        } catch (e) {
          console.warn('Failed to sync grammarCount:', e);
          Sentry.captureException(e, { tags: { component: 'App', op: 'firestore.write', field: 'grammarCount' } });
        }
        setUserProfile({ ...userProfile, grammarCount: nextCount });
      }
    } catch (error: any) {
      console.error(error);
      const message = error.message || (uiLang === 'zh' ? '语法检查失败，请重试' : 'Grammar check failed. Please try again.');
      toast.error(message);
    } finally {
      setIsCheckingGrammar(false);
    }
  };

  const handleTabOrderChange = async (newOrder: string[]) => {
    if (!user || !userProfile) return;
    const prevOrder = userProfile.tabOrder;
    setUserProfile({ ...userProfile, tabOrder: newOrder });
    const userRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userRef, { tabOrder: newOrder });
    } catch (error) {
      console.error('Failed to update tab order, rolling back:', error);
      setUserProfile({ ...userProfile, tabOrder: prevOrder });
      toast.error(uiLang === 'zh' ? '保存失败已回滚' : 'Save failed, reverted');
      Sentry.captureException(error, { tags: { component: 'App', op: 'firestore.write', field: 'tabOrder' } });
    }
  };

  // dnd-kit sensors: PointerSensor is the default for mouse + pen on
  // desktop; it activates on an 8px drag to distinguish from a click.
  // TouchSensor on mobile uses a 250 ms long-press so taps still switch
  // tabs normally but a held finger + drag reorders. tolerance: 5 means
  // a 5 px wiggle doesn't cancel the long-press.
  // Both sensors use a 250 ms long-press before dragging "kicks in". That
  // frees up short horizontal swipes to be consumed by the tab strip's
  // native `overflow-x-auto` scrolling — critical on mobile where the
  // strip extends past the viewport. Previously the PointerSensor fired
  // on 8px movement, which stole every scroll attempt and reordered tabs.
  const tabSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  // When a drag ends, compute the new tab order based on the active
  // (dragged) tab and the tab it was dropped over. arrayMove is a
  // dnd-kit utility that returns the new array without mutating.
  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentOrder = fullOrder;
    const oldIndex = currentOrder.indexOf(active.id as string);
    const newIndex = currentOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
    handleTabOrderChange(newOrder);
  };

  const defaultTabs = ['slang', 'translate', 'classroom', 'grammar', 'history', 'review'];
  const rawOrder = userProfile?.tabOrder || defaultTabs;
  const fullOrder = [...rawOrder, ...defaultTabs.filter(t => !rawOrder.includes(t))];

  // On first userProfile load, land the user on the first tab in their
  // saved order. Whatever they dragged to position 0 becomes their home
  // screen. We bail out if they've already clicked a tab since mount —
  // their intent beats the saved preference. Only fires once per session
  // because `tabOrder` array identity changes each render; the ref guard
  // prevents re-syncing after every tabOrder mutation.
  const syncedInitialTabRef = useRef(false);
  useEffect(() => {
    if (syncedInitialTabRef.current) return;
    if (userSwitchedTabRef.current) return;
    if (!userProfile) return;
    const firstTab = fullOrder[0];
    if (firstTab && firstTab !== activeTab) {
      setActiveTabState(firstTab as typeof activeTab);
    }
    syncedInitialTabRef.current = true;
    // fullOrder is computed every render but we only care about the first
    // non-null userProfile — the ref above ensures we only fire once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile]);
  const tabs = fullOrder.map(id => {
    switch(id) {
      case 'translate': return { id, label: t.translateTab, icon: Search };
      case 'history': return { id, label: t.wordbookTab, icon: History, count: savedWords.length };
      case 'review': return { id, label: t.reviewTab, icon: BookOpen };
      case 'grammar': return { id, label: t.grammarTab, icon: PenTool };
      case 'slang': return { id, label: t.slangTab, icon: MessageSquare };
      case 'classroom': return { id, label: uiLang === 'zh' ? '课堂同传' : 'Classroom', icon: Headphones };
      // AI is now integrated into Review tab
      default: return { id, label: '', icon: Search };
    }
  });

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#5B7FE8]" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage uiLang={uiLang} t={t} />;
  }

  return (
    <div
      className="min-h-screen pb-24 relative overflow-hidden"
      style={{
        // White-blue ambient gradient (replaces the blue-via-indigo-to-purple
        // SaaS default). Multiple radial blue blobs over a vertical white-blue
        // base — reads as premium iOS 26 Liquid Glass ambient instead of
        // generic purple-gradient AI slop.
        background:
          'radial-gradient(ellipse 60% 45% at 25% 15%, rgba(137, 163, 240, 0.35) 0%, transparent 65%),' +
          'radial-gradient(ellipse 55% 50% at 85% 35%, rgba(91, 127, 232, 0.25) 0%, transparent 65%),' +
          'radial-gradient(ellipse 70% 40% at 50% 75%, rgba(184, 200, 240, 0.4) 0%, transparent 70%),' +
          'radial-gradient(ellipse 50% 45% at 15% 90%, rgba(137, 163, 240, 0.25) 0%, transparent 65%),' +
          'linear-gradient(180deg, #F4F7FF 0%, #E8EEFC 45%, #DDE5F7 100%)',
      }}
    >
      {/* Decorative blobs — same blue family, no purple */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#89A3F0]/25 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#B8C8F0]/30 rounded-full blur-3xl pointer-events-none"></div>

      {/* Pops the "v0.2.0 is here" toast once per release for returning users */}
      <ChangelogToast currentVersion={APP_VERSION} />

      {/* Header */}
      {/* translate="no" + notranslate class: 防止沉浸式翻译 / Google Translate
          等扩展把品牌/导航当翻译目标，注入 wrapper 节点把布局推乱（曾导致
          tabs 横条与 logo 重叠）。 */}
      <header translate="no" className="notranslate bg-white/85 backdrop-blur-xl border-b border-white/60 sticky top-0 z-30 shadow-[0_4px_20px_rgba(91,127,232,0.08)]">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* App icon removed — brand name alone carries identity. */}
            <span className="font-display text-xl sm:text-2xl font-semibold text-[#0A0E1A] tracking-tight">{t.appName}</span>
            <span
              className="hidden sm:inline text-[10px] font-mono-meta text-[rgba(10,14,26,0.38)] tabular-nums"
              title={`Environment: ${APP_ENV}`}
            >
              v{APP_VERSION}
            </span>
            <ChangelogBell currentVersion={APP_VERSION} />
            {userProfile?.isPro && (
              <span className="ml-2 px-2.5 py-0.5 bg-[#0A0E1A] text-white font-display font-semibold text-[10px] rounded-full uppercase tracking-[0.1em]">
                {t.proBadge}
              </span>
            )}
            {IS_STAGING && (
              <span className="ml-2 px-2 py-0.5 bg-yellow-400 text-yellow-900 text-[10px] font-black rounded shadow-sm uppercase tracking-wider" title="Staging preview build">
                STAGING
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab('leaderboard')}
              aria-label={uiLang === 'zh' ? '排行榜' : 'Leaderboard'}
              className={cn(
                "p-1.5 sm:p-2 rounded-full transition-colors",
                activeTab === 'leaderboard' ? "bg-amber-100 text-amber-600" : "hover:bg-gray-50 text-gray-400 hover:text-amber-500"
              )}
              title={uiLang === 'zh' ? '排行榜' : 'Leaderboard'}
            >
              <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              aria-label={uiLang === 'zh' ? '我的' : 'Profile'}
              className={cn(
                "p-1.5 sm:p-2 rounded-full transition-colors",
                activeTab === 'profile' ? "bg-[rgba(91,127,232,0.1)] text-[#5B7FE8]" : "hover:bg-gray-50 text-gray-400 hover:text-[#5B7FE8]"
              )}
              title={uiLang === 'zh' ? '我的' : 'Profile'}
            >
              <UserCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <SettingsModal
              uiLang={uiLang}
              setUiLang={setUiLang}
              currentVersion={APP_VERSION}
              onLogout={confirmLogout}
              onClearSearchHistory={clearHistory}
              feedbackEmail="caizewei11@gmail.com"
              wechatQrSrc="/wechat-qr.png"
            />
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 relative z-10">
        {/* Tabs — Pro users can long-press + drag to reorder */}
        <DndContext
          sensors={tabSensors}
          collisionDetection={closestCenter}
          onDragEnd={handleTabDragEnd}
        >
          <SortableContext
            items={tabs.map((t) => t.id)}
            strategy={horizontalListSortingStrategy}
          >
            {/* sticky 紧贴 header 下方（header 高度 64px mobile / 80px desktop）。
                以前不 sticky，滚下去再回来时 Tab 栏被滚出视野，看不见。
                z-20 < header z-30 — 万一布局抖动 header 仍然盖住 tab 栏，
                不会反过来。容器本身透明，让 glass-shell 自带的玻璃胶囊
                单独成为视觉重心；滚动时下方内容会从 Tab 胶囊**两侧**擦过去，
                由 header 的不透明背景在顶部挡住，不会跟 Tab 重叠。 */}
            <div translate="no" className="notranslate sticky top-16 sm:top-20 z-20 pt-2 pb-4 mb-4">
              <div className="relative">
              {/* Thick liquid-glass shell; active tab elevates on top of it
                  via .glass-pill-active (see src/index.css). The shell is
                  deliberately thinner/lighter than the active pill to push
                  the active tab forward on the z-axis. */}
              <div className="glass-shell flex p-[5px] rounded-[22px] overflow-x-auto no-scrollbar scroll-smooth">
                {tabs.map((tab) => (
                  <SortableTab
                    key={tab.id}
                    tab={tab}
                    isActive={activeTab === tab.id}
                    onSelect={() => setActiveTab(tab.id as any)}
                  />
                ))}
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute top-0 right-0 h-full w-8 rounded-r-[22px] bg-gradient-to-l from-[#F4F7FF]/70 to-transparent"
              />
              </div>
            </div>
          </SortableContext>
        </DndContext>

        <Suspense fallback={<LazyFallback />}>
          {activeTab === 'translate' ? (
            <TranslateTab
              inputText={inputText}
              setInputText={setInputText}
              isTranslating={isTranslating}
              translationResult={translationResult}
              selectedUsageIndex={selectedUsageIndex}
              setSelectedUsageIndex={handleSelectUsage}
              showDetails={showDetails}
              setShowDetails={handleToggleDetails}
              isLoadingDetails={isLoadingDetails}
              formalityLevel={formalityLevel}
              setFormalityLevel={setFormalityLevel}
              lastTranslatedFormality={lastTranslatedFormality}
              isFetchingSlang={isFetchingSlang}
              slangInsights={slangInsights}
              isSaving={isSaving}
              loadingAudioText={loadingAudioText}
              userProfile={userProfile}
              uiLang={uiLang}
              searchHistory={searchHistory}
              removeFromHistory={removeFromHistory}
              clearHistory={clearHistory}
              previousSearchWord={previousSearchWord}
              setPreviousSearchWord={setPreviousSearchWord}
              isExtractingPhoto={isExtractingPhoto}
              onPhotoCapture={handlePhotoCapture}
              isListening={isListening}
              onToggleListening={toggleListening}
              onTranslate={handleTranslateWithHistory}
              onClear={clearTranslation}
              onSearchWord={handleSearchWord}
              onGoBack={handleGoBack}
              onSaveWord={handleSaveWord}
              onSpeak={speak}
              onOpenPaywall={(trigger) => { setPaymentTrigger(trigger); setShowPayment(true); }}
              onUpgrade={handleUpgrade}
              onViewSlangEntry={(term) => { setSearchQuery(term); setActiveTab('slang'); }}
            />
          ) : activeTab === 'grammar' ? (
            <div>
              <GrammarPage
                grammarInput={grammarInput}
                setGrammarInput={setGrammarInput}
                isCheckingGrammar={isCheckingGrammar}
                grammarResult={grammarResult}
                isListening={isListening}
                uiLang={uiLang}
                onCheckGrammar={handleCheckGrammar}
                onToggleListening={toggleListening}
              />
            </div>
          ) : activeTab === 'review' ? (
            <div>
              <ReviewPage
                userProfile={userProfile}
                uiLang={uiLang}
                dueWords={dueWords}
                currentReviewWord={currentReviewWord}
                reviewIndex={reviewIndex}
                showReviewAnswer={showReviewAnswer}
                setShowReviewAnswer={setShowReviewAnswer}
                onReview={handleReview}
                onSetReviewIndex={setReviewIndex}
                onOpenOnboarding={() => setShowOnboarding(true)}
                onOpenPayment={(source) => { setPaymentTrigger(source); setShowPayment(true); }}
                onSpeak={speak}
                loadingAudioText={loadingAudioText}
                totalWords={savedWords.length}
                onGetHint={getReviewHint}
                onAiChat={aiChat}
              />
            </div>
          ) : activeTab === 'history' ? (
            <div>
              <WordbookPage
                savedWords={savedWords}
                filteredWords={filteredWords}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                wordbookFilter={wordbookFilter}
                setWordbookFilter={setWordbookFilter}
                selectedWordbookItem={selectedWordbookItem}
                setSelectedWordbookItem={setSelectedWordbookItem}
                selectedUsageIndex={selectedUsageIndex}
                setSelectedUsageIndex={setSelectedUsageIndex}
                showDetails={showDetails}
                setShowDetails={setShowDetails}
                loadingAudioText={loadingAudioText}
                uiLang={uiLang}
                onSpeak={speak}
                onDeleteWord={handleDeleteWord}
                folders={folders}
                wordFolderMap={wordFolderMap}
                activeFolderId={activeFolderId}
                onCreateFolder={createFolder}
                onRenameFolder={renameFolder}
                onDeleteFolder={deleteFolder}
                onSetActiveFolder={setActiveFolderId}
                onMoveWordsToFolder={moveWordsToFolder}
              />
            </div>
          ) : activeTab === 'slang' ? (
            <div>
              {userProfile && !userProfile.hasCompletedOnboarding && (userProfile.approvedSlangCount || 0) < 3 && (
                <OnboardingChecklist
                  uiLang={uiLang}
                  onDismiss={() => {
                    // Optional: mark onboarding as completed when dismissed
                    if (user) {
                      const userRef = doc(db, 'users', user.uid);
                      updateDoc(userRef, { hasCompletedOnboarding: true }).catch((e) => {
                        console.error(e);
                        Sentry.captureException(e, { tags: { component: 'App', op: 'firestore.write', field: 'hasCompletedOnboarding' } });
                      });
                      setUserProfile(prev => prev ? { ...prev, hasCompletedOnboarding: true } : prev);
                    }
                  }}
                />
              )}
              <SlangDictionary uiLang={uiLang} initialSearchTerm={searchQuery} />
            </div>
          ) : activeTab === 'classroom' ? (
            <div>
              <ClassroomTab uiLang={uiLang} isPro={!!userProfile?.isPro} />
            </div>
          ) : activeTab === 'leaderboard' ? (
            <div>
              <Leaderboard currentUserId={user.uid} uiLang={uiLang} />
            </div>
          ) : activeTab === 'profile' ? (
            <div>
              {!userProfile?.isPro && (
                <button
                  onClick={() => { setPaymentTrigger('default'); setShowPayment(true); }}
                  className="w-full mb-4 bg-gradient-to-r from-[#5B7FE8] to-[#0A0E1A] text-white rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-[rgba(91,127,232,0.2)] hover:from-[#1a2440] hover:to-[#0A0E1A] transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <Zap className="w-5 h-5 fill-current" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-sm">{uiLang === 'zh' ? '升级 Pro' : 'Upgrade to Pro'}</div>
                      <div className="text-xs text-[rgba(91,127,232,0.2)]">{uiLang === 'zh' ? '解锁无限翻译、复习系统、语气调节' : 'Unlimited translations, review & more'}</div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[rgba(91,127,232,0.3)]" />
                </button>
              )}
              <UserProfileComponent
                uid={user.uid}
                userProfile={userProfile}
                uiLang={uiLang}
                onOpenPayment={(source) => {
                  setPaymentTrigger(source);
                  setShowPayment(true);
                }}
                onOpenOnboarding={() => setShowOnboarding(true)}
                onLogout={confirmLogout}
              />
            </div>
          ) : null}
        </Suspense>

        {/* Rate Limit Modal — global, fires on any 429 from /api/generate */}
        <RateLimitModal
          info={rateLimitInfo}
          onClose={() => setRateLimitInfo(null)}
          onUpgrade={() => {
            setRateLimitInfo(null);
            onPaymentNeeded('rate_limit_upgrade');
          }}
          uiLang={uiLang}
        />

        {/* Payment Modal */}
        <AnimatePresence>
          {showPayment && (
            <PaymentScreen
              triggerSource={paymentTrigger}
              currentPlan={userProfile?.isPro ? 'pro' : 'free'}
              uiLang={uiLang}
              onClose={() => setShowPayment(false)}
              onSuccess={async () => {
                if (user) {
                  // isPro is guarded by firestore.rules isUserSelfUpdate
                  // whitelist on purpose — clients must not be able to
                  // self-grant Pro. Until we ship a server-side Pro
                  // activation Cloud Function, the source of truth for
                  // Pro status on the client is localStorage, overlaid
                  // by useAuth on top of the Firestore profile.
                  //
                  // This means Pro is *effectively* unverified on the
                  // server side. Any backend code that needs to trust
                  // Pro status (e.g. a premium API route) must verify
                  // it server-side, not read it from the client.
                  localStorage.setItem('memeflow_isPro', 'true');
                }
                window.location.reload();
              }}
            />
          )}
        </AnimatePresence>

        {/* Onboarding Modal */}
        <AnimatePresence>
          {showOnboarding && (
            <Suspense fallback={<LazyFallback />}>
              <SlangOnboarding
                uiLang={uiLang}
                onComplete={() => {
                  setActiveTab('slang');
                }}
                onClose={() => setShowOnboarding(false)}
              />
            </Suspense>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
