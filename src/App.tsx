import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
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
  arrayMove,
} from '@dnd-kit/sortable';
import {
  Search,
  Plus,
  BookOpen,
  LogOut,
  Loader2,
  Volume2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Languages,
  History,
  Globe,
  PenTool,
  Mic,
  MicOff,
  MessageSquare,
  Zap,
  Trophy,
  UserCircle
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
import { useAuth } from './hooks/useAuth';
import { useAudio } from './hooks/useAudio';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useTranslation } from './hooks/useTranslation';
import { useWordbook } from './hooks/useWordbook';
import { useReview } from './hooks/useReview';
import { useSearchHistory } from './hooks/useSearchHistory';

// ErrorBoundary extracted to src/components/ErrorBoundary.tsx
export { ErrorBoundary } from './components/ErrorBoundary';

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
import { TranslateProvider } from './contexts/TranslateContext';

// SortableTab extracted to src/components/SortableTab.tsx
import { SortableTab } from './components/SortableTab';

// Lazy: loaded on tab switch / drawer open. Cuts the initial bundle by
// pulling SlangDictionary, UserProfile, Leaderboard, ReviewPage,
// SlangOnboarding, GrammarPage, WordbookPage out of the main chunk.
import WelcomeOnboarding from './components/WelcomeOnboarding';
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

function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
    </div>
  );
}

// LoginPage extracted to src/components/LoginPage.tsx
import LoginPage from './components/LoginPage';

// ====== MAINTENANCE MODE ======
// Set to true to show maintenance page to all users
// You can bypass with ?admin in the URL
const MAINTENANCE_MODE = false;

function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 sm:p-10 text-center space-y-6">
        <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto">
          <svg className="w-10 h-10 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-gray-900">MemeFlow 维护中</h1>
        <p className="text-gray-500 leading-relaxed">
          我们正在升级服务器，预计很快恢复。感谢你的耐心等待！
        </p>
        <div className="bg-blue-50 rounded-2xl p-4">
          <p className="text-sm text-blue-600 font-medium">System Maintenance in Progress</p>
          <p className="text-xs text-blue-400 mt-1">We're upgrading our servers. Back soon!</p>
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

  const [activeTab, setActiveTab] = useState<'translate' | 'slang' | 'grammar' | 'review' | 'history' | 'leaderboard' | 'profile'>(() => {
    try {
      const saved = localStorage.getItem('memeflow_active_tab');
      if (saved && ['translate', 'slang', 'grammar', 'review', 'history', 'leaderboard', 'profile'].includes(saved)) {
        return saved as any;
      }
    } catch {}
    return 'slang';
  });
  const [showPayment, setShowPayment] = useState(false);
  const [paymentTrigger, setPaymentTrigger] = useState('default');

  const [showQrCode, setShowQrCode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [grammarInput, setGrammarInput] = useState('');
  const [isCheckingGrammar, setIsCheckingGrammar] = useState(false);
  const [grammarResult, setGrammarResult] = useState<GrammarCheckResult | null>(null);
  const [isExtractingPhoto, setIsExtractingPhoto] = useState(false);
  const photoInputRef = React.useRef<HTMLInputElement>(null);

  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, []);

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

  const { savedWords, searchQuery, setSearchQuery, wordbookFilter, setWordbookFilter, filteredWords, selectedWordbookItem, setSelectedWordbookItem, handleDeleteWord, folders, wordFolderMap, activeFolderId, setActiveFolderId, createFolder, renameFolder, deleteFolder, moveWordsToFolder } = useWordbook(user);

  const {
    inputText, setInputText, isTranslating, translationResult, slangInsights, isFetchingSlang,
    selectedUsageIndex, setSelectedUsageIndex, showDetails, setShowDetails,
    formalityLevel, setFormalityLevel, isSaving, scene, setScene,
    autoTranslateEnabled, toggleAutoTranslate, handleTranslate, handleSaveWord,
  } = useTranslation({ user, userProfile, setUserProfile, savedWords, uiLang, onPaymentNeeded });

  const { dueWords, reviewIndex, setReviewIndex, showReviewAnswer, setShowReviewAnswer, currentReviewWord, handleReview } = useReview(user, userProfile, savedWords);

  const { isListening, toggleListening } = useSpeechRecognition({ uiLang, activeTab, setInputText, setGrammarInput, stopAllAudio });

  const { history: searchHistory, addToHistory, removeFromHistory, clearHistory } = useSearchHistory();

  const handleTranslateWithHistory = useCallback((e?: React.FormEvent) => {
    if (inputText.trim()) addToHistory(inputText.trim());
    handleTranslate(e);
  }, [inputText, addToHistory, handleTranslate]);

  const [previousSearchWord, setPreviousSearchWord] = useState<string | null>(null);

  const handleSearchWord = useCallback((word: string) => {
    if (inputText.trim() && inputText.trim() !== word) {
      setPreviousSearchWord(inputText.trim());
    }
    setInputText(word);
    addToHistory(word);
    handleTranslate(undefined, word);
  }, [inputText, addToHistory, handleTranslate]);

  const handleGoBack = useCallback(() => {
    if (!previousSearchWord) return;
    const backTo = previousSearchWord;
    setPreviousSearchWord(null);
    setInputText(backTo);
    addToHistory(backTo);
    handleTranslate(undefined, backTo);
  }, [previousSearchWord, addToHistory, handleTranslate]);

  useEffect(() => {
    const skipped = localStorage.getItem('memeflow_onboarding_skipped');
    if (activeTab === 'slang' && userProfile && !userProfile.hasCompletedOnboarding && !skipped) {
      setShowOnboarding(true);
    }
  }, [activeTab, userProfile]);

  // D4: Dismiss stale toasts when switching tabs
  useEffect(() => {
    toast.dismiss();
  }, [activeTab]);

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
  const tabSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
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

  const defaultTabs = ['slang', 'translate', 'grammar', 'history', 'review'];
  const rawOrder = userProfile?.tabOrder || defaultTabs;
  const fullOrder = [...rawOrder, ...defaultTabs.filter(t => !rawOrder.includes(t))];
  const tabs = fullOrder.map(id => {
    switch(id) {
      case 'translate': return { id, label: t.translateTab, icon: Search };
      case 'history': return { id, label: t.wordbookTab, icon: History, count: savedWords.length };
      case 'review': return { id, label: t.reviewTab, icon: BookOpen };
      case 'grammar': return { id, label: t.grammarTab, icon: PenTool };
      case 'slang': return { id, label: t.slangTab, icon: MessageSquare };
      // AI is now integrated into Review tab
      default: return { id, label: '', icon: Search };
    }
  });

  // E2: Memoize TranslateContext value to prevent unnecessary re-renders
  const handleOpenPaywall = useCallback((trigger: string) => { setPaymentTrigger(trigger); setShowPayment(true); }, []);
  const handleViewSlangEntry = useCallback((term: string) => { setSearchQuery(term); setActiveTab('slang'); }, []);

  const translateContextValue = useMemo(() => ({
    inputText, setInputText, isTranslating, translationResult,
    selectedUsageIndex, setSelectedUsageIndex, showDetails, setShowDetails,
    formalityLevel, setFormalityLevel, isFetchingSlang, slangInsights, isSaving,
    loadingAudioText, userProfile, uiLang, savedWords, user,
    searchHistory, removeFromHistory, clearHistory,
    previousSearchWord, setPreviousSearchWord,
    isExtractingPhoto, onPhotoCapture: handlePhotoCapture,
    isListening, onToggleListening: toggleListening,
    onTranslate: handleTranslateWithHistory, onSearchWord: handleSearchWord,
    onGoBack: handleGoBack, onSaveWord: handleSaveWord, onSpeak: speak,
    onOpenPaywall: handleOpenPaywall, onUpgrade: handleUpgrade,
    onViewSlangEntry: handleViewSlangEntry,
    scene, setScene, autoTranslateEnabled, toggleAutoTranslate,
  }), [
    inputText, isTranslating, translationResult, selectedUsageIndex, showDetails,
    formalityLevel, isFetchingSlang, slangInsights, isSaving, loadingAudioText,
    userProfile, uiLang, savedWords, user, searchHistory, previousSearchWord,
    isExtractingPhoto, isListening, scene, autoTranslateEnabled,
    handlePhotoCapture, toggleListening, handleTranslateWithHistory,
    handleSearchWord, handleGoBack, handleSaveWord, speak, handleOpenPaywall,
    handleUpgrade, handleViewSlangEntry, removeFromHistory, clearHistory,
    toggleAutoTranslate,
  ]);

  // Show animated welcome onboarding for first-time visitors (before any auth)
  const hasSeenWelcome = (() => { try { return localStorage.getItem('memeflow_welcome_seen') === 'true'; } catch { return false; } })();
  if (!hasSeenWelcome) {
    return <WelcomeOnboarding onComplete={() => { try { localStorage.setItem('memeflow_welcome_seen', 'true'); } catch {} window.location.reload(); }} uiLang={uiLang} />;
  }

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage uiLang={uiLang} t={t} />;
  }

  return (
    <div className="min-h-screen pb-24 relative overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Decorative warm blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-rose-200/40 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-amber-200/30 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-5%] w-[25%] h-[25%] bg-pink-200/25 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header — liquid glass warm */}
      <header className="liquid-glass-heavy border-b border-white/40 sticky top-0 z-10">
        <div className="max-w-2xl lg:max-w-5xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-rose-400 to-pink-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-rose-400/25">
              <Languages className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-extrabold text-gray-900 tracking-tight truncate">{t.appName}</span>
            <span
              className="hidden sm:inline text-[10px] text-gray-400 font-mono tabular-nums"
              title={`Environment: ${APP_ENV}`}
            >
              v{APP_VERSION}
            </span>
            {userProfile?.isPro && (
              <span className="ml-1 px-2 py-0.5 bg-gradient-to-r from-rose-400 to-pink-500 text-white text-[9px] font-black rounded-full shadow-sm shadow-rose-300/30 uppercase tracking-wider">
                {t.proBadge}
              </span>
            )}
            {IS_STAGING && (
              <span className="ml-1 px-2 py-0.5 bg-yellow-400 text-yellow-900 text-[10px] font-black rounded shadow-sm uppercase tracking-wider" title="Staging preview build">
                STAGING
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              onClick={() => setActiveTab('leaderboard')}
              aria-label={uiLang === 'zh' ? '排行榜' : 'Leaderboard'}
              className={cn(
                "p-2 rounded-xl transition-all",
                activeTab === 'leaderboard' ? "bg-rose-50 text-rose-500 shadow-sm" : "hover:bg-white/50 text-gray-400 hover:text-rose-400"
              )}
              title={uiLang === 'zh' ? '排行榜' : 'Leaderboard'}
            >
              <Trophy className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
            <button
              onClick={() => setActiveTab('profile')}
              aria-label={uiLang === 'zh' ? '我的' : 'Profile'}
              className={cn(
                "p-2 rounded-xl transition-all",
                activeTab === 'profile' ? "bg-pink-50 text-pink-500 shadow-sm" : "hover:bg-white/50 text-gray-400 hover:text-pink-400"
              )}
              title={uiLang === 'zh' ? '我的' : 'Profile'}
            >
              <UserCircle className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
            <button
              onClick={() => setUiLang(uiLang === 'en' ? 'zh' : 'en')}
              className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-white/50 rounded-xl transition-all text-gray-500 text-xs font-semibold"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{uiLang === 'en' ? '中文' : 'EN'}</span>
            </button>
            <button
              onClick={() => setShowQrCode(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/50 rounded-xl transition-all text-blue-600 text-xs font-semibold"
              title={uiLang === 'zh' ? '在手机上使用' : 'Use on Mobile'}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{uiLang === 'zh' ? '手机端' : 'Mobile'}</span>
            </button>
            <button
              onClick={confirmLogout}
              aria-label={t.signOut}
              className="p-2 hover:bg-red-50 rounded-xl transition-all text-gray-400 hover:text-red-500"
              title={t.signOut}
            >
              <LogOut className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl lg:max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 relative z-10">
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
            <div className="flex liquid-glass p-1 rounded-2xl mb-6 sm:mb-8 overflow-x-auto no-scrollbar sm:[mask-image:none] [mask-image:linear-gradient(to_right,black_90%,transparent)] [-webkit-mask-image:linear-gradient(to_right,black_90%,transparent)]">
              {tabs.map((tab) => (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  isActive={activeTab === tab.id}
                  onSelect={() => { setActiveTab(tab.id as any); try { localStorage.setItem('memeflow_active_tab', tab.id); } catch {} }}
                  isPro={!!userProfile?.isPro}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <Suspense fallback={<LazyFallback />}>
          {activeTab === 'translate' ? (
            <TranslateProvider value={translateContextValue}>
              <TranslateTab />
            </TranslateProvider>
          ) : activeTab === 'grammar' ? (
            <div className="max-w-3xl mx-auto">
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
            <div className="max-w-3xl mx-auto">
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
            <div className="max-w-3xl mx-auto">
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
                onNavigateToTranslate={() => setActiveTab('translate')}
              />
            </div>
          ) : activeTab === 'slang' ? (
            <div className="max-w-3xl mx-auto">
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
              <SlangDictionary uiLang={uiLang} initialSearchTerm={searchQuery} onTryTranslate={(term) => { setInputText(term); setActiveTab('translate'); }} />
            </div>
          ) : activeTab === 'leaderboard' ? (
            <div>
              <Leaderboard currentUserId={user.uid} uiLang={uiLang} onContribute={() => setActiveTab('slang')} />
            </div>
          ) : activeTab === 'profile' ? (
            <div>
              {!userProfile?.isPro && (
                <button
                  onClick={() => { setPaymentTrigger('default'); setShowPayment(true); }}
                  className="w-full mb-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-blue-200 hover:from-blue-700 hover:to-indigo-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <Zap className="w-5 h-5 fill-current" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-sm">{uiLang === 'zh' ? '升级 Pro' : 'Upgrade to Pro'}</div>
                      <div className="text-xs text-blue-100">{uiLang === 'zh' ? '解锁无限翻译、复习系统、语气调节' : 'Unlimited translations, review & more'}</div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-blue-200" />
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

        {/* QR Code Modal */}
        <AnimatePresence>
          {showQrCode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowQrCode(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full text-center"
              >
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {uiLang === 'zh' ? '在手机上继续' : 'Continue on Mobile'}
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                  {uiLang === 'zh' ? '扫描二维码，随时随地练习口译' : 'Scan to practice interpretation anywhere'}
                </p>
                <div className="bg-gray-50 p-4 rounded-2xl inline-block mb-6 border border-gray-100">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent('https://ais-pre-hn2czyzfyzap4frb73keh6-648001708369.asia-southeast1.run.app')}`}
                    alt="QR Code"
                    className="w-48 h-48"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <button 
                  onClick={() => setShowQrCode(false)}
                  className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold rounded-xl transition-colors"
                >
                  {uiLang === 'zh' ? '关闭' : 'Close'}
                </button>
              </motion.div>
            </div>
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
