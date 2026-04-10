import React, { useState, useEffect, useRef, Component, ReactNode } from 'react';
import { 
  Search, 
  Plus, 
  BookOpen, 
  Trash2, 
  LogOut, 
  LogIn, 
  Loader2, 
  Volume2, 
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Languages,
  History,
  Globe,
  CheckCircle,
  AlertCircle,
  PenTool,
  Mic,
  MicOff,
  Ear,
  Settings,
  MessageSquare,
  Zap,
  Trophy,
  UserCircle
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc,
  deleteDoc, 
  doc, 
  setDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db, signIn, logOut } from './firebase';
import firebaseConfig from '../firebase-applet-config.json';
import { 
  translateText, 
  TranslationResult, 
  generateSpeech, 
  checkGrammar, 
  GrammarCheckResult, 
  translateSimple, 
  AIProvider,
  explainSlang,
  SlangExplanationResult
} from './services/ai';
import { cn } from './lib/utils';
import { Language, translations } from './i18n';

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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-red-50 min-h-screen flex flex-col items-center justify-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
          <pre className="text-xs bg-white p-4 rounded border border-red-200 max-w-full overflow-auto mb-4">
            {this.state.error?.message || String(this.state.error)}
          </pre>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
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

import { SlangDictionary } from './components/SlangDictionary';
import { SlangOnboarding } from './components/SlangOnboarding';
import Leaderboard from './components/Leaderboard';
import PaymentScreen from './components/PaymentScreen';
import UserProfileComponent from './components/UserProfile';
import GrammarPage from './pages/GrammarPage';
import ReviewPage from './pages/ReviewPage';
import WordbookPage from './pages/WordbookPage';

export default function App() {

  const [activeTab, setActiveTab] = useState<'translate' | 'slang' | 'grammar' | 'review' | 'history' | 'leaderboard' | 'profile'>('slang');
  // Slang is the primary USP, always default tab
  const [showPayment, setShowPayment] = useState(false);
  const [paymentTrigger, setPaymentTrigger] = useState('default');

  useEffect(() => {
    console.log('Firebase Config Loaded:', {
      projectId: firebaseConfig.projectId,
      firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
      authDomain: firebaseConfig.authDomain
    });
    console.log('Firestore DB Instance:', db);
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [inputText, setInputText] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);
  const [slangInsights, setSlangInsights] = useState<SlangExplanationResult[]>([]);
  const [isFetchingSlang, setIsFetchingSlang] = useState(false);
  const [selectedUsageIndex, setSelectedUsageIndex] = useState(0);
  const [selectedWordbookItem, setSelectedWordbookItem] = useState<SavedWord | null>(null);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [grammarInput, setGrammarInput] = useState('');
  const [isCheckingGrammar, setIsCheckingGrammar] = useState(false);
  const [grammarResult, setGrammarResult] = useState<GrammarCheckResult | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [formalityLevel, setFormalityLevel] = useState<number>(50);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (activeTab === 'slang' && userProfile && !userProfile.hasCompletedOnboarding) {
      setShowOnboarding(true);
    }
  }, [activeTab, userProfile]);

  const [uiLang, setUiLang] = useState<Language>(
    typeof navigator !== 'undefined' && navigator.language.startsWith('zh') ? 'zh' : 'en'
  );
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const lastRequestIdRef = useRef<number>(0);
  const [loadingAudioText, setLoadingAudioText] = useState<string | null>(null);

  const t = translations[uiLang];

  const handleUpgrade = () => {
    setPaymentTrigger('default');
    setShowPayment(true);
  };

  const [wordbookFilter, setWordbookFilter] = useState<'all' | 'authentic' | 'academic' | 'standard'>('all');

  const filteredWords = savedWords.filter(word => {
    const matchesSearch = word.original.toLowerCase().includes(searchQuery.toLowerCase()) ||
      word.usages.some(u => u.meaningZh.includes(searchQuery));
    const matchesFilter = wordbookFilter === 'all' || word.styleTag === wordbookFilter;
    return matchesSearch && matchesFilter;
  });

  const dueWords = savedWords.filter(word => {
    if (!word.nextReviewDate) return false;
    const nextDate = word.nextReviewDate.toDate();
    return nextDate <= new Date();
  });

  const [reviewIndex, setReviewIndex] = useState(0);
  const [showReviewAnswer, setShowReviewAnswer] = useState(false);

  const currentReviewWord = dueWords[reviewIndex];

  const stopAllAudio = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
        currentSourceRef.current.disconnect();
      } catch (e) {
        // Ignore
      }
      currentSourceRef.current = null;
    }
  };

  const speak = async (text: string) => {
    const requestId = ++lastRequestIdRef.current;
    setLoadingAudioText(text);
    
    // Stop everything immediately
    stopAllAudio();

    try {
      const base64Audio = await generateSpeech(text);
      
      // If a newer request has started, ignore this one
      if (requestId !== lastRequestIdRef.current) return;
      
      if (!base64Audio) {
        throw new Error('No audio data received');
      }

      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      let audioBuffer: AudioBuffer;
      
      // Try to decode as MP3 first (OpenAI format)
      try {
        audioBuffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
      } catch (e) {
        // Fallback to raw PCM (Gemini format)
        audioBuffer = audioContext.createBuffer(1, bytes.length / 2, 24000);
        const channelData = audioBuffer.getChannelData(0);
        const view = new DataView(bytes.buffer);
        for (let i = 0; i < channelData.length; i++) {
          channelData[i] = view.getInt16(i * 2, true) / 32768.0;
        }
      }
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
      // Double check before starting
      if (requestId !== lastRequestIdRef.current) {
        source.disconnect();
        return;
      }

      // Stop any other source that might have started in the microtask gap
      stopAllAudio();

      currentSourceRef.current = source;
      source.onended = () => {
        if (currentSourceRef.current === source) {
          currentSourceRef.current = null;
        }
        if (requestId === lastRequestIdRef.current) {
          setLoadingAudioText(null);
        }
      };
      
      source.start();
    } catch (error) {
      console.error('Speech generation failed:', error);
      if (requestId === lastRequestIdRef.current) {
        setLoadingAudioText(null);
        stopAllAudio();
        const utterance = new SpeechSynthesisUtterance(text);
        const hasChinese = /[\u4e00-\u9fa5]/.test(text);
        utterance.lang = hasChinese ? 'zh-CN' : 'en-US';
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  // Auto-login in QA test mode
  useEffect(() => {
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('qa')) {
      import('firebase/auth').then(({ signInAnonymously }) => {
        signInAnonymously(auth).catch(console.error);
      });
    }
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setIsAuthReady(true);
      if (user) {
        // Create or update user profile
        const userRef = doc(db, 'users', user.uid);
        try {
          const userDoc = await getDoc(userRef);
          const today = new Date().toISOString().split('T')[0];
          
          if (!userDoc.exists()) {
            const newProfile: UserProfile = {
              userId: user.uid,
              isPro: false,
              translationCount: 0,
              grammarCount: 0,
              lastResetDate: today,
              tabOrder: ['slang', 'translate', 'grammar', 'history', 'review'],
              approvedSlangCount: 0,
              currentStreak: 0,
              reputationScore: 100,
              l1PenaltyCount: 0,
              hasCompletedOnboarding: false,
              createdAt: serverTimestamp()
            };
            await setDoc(userRef, newProfile);
            setUserProfile(newProfile);
          } else {
            const data = userDoc.data() as UserProfile;
            let updates: any = {};
            
            // Ensure required fields exist for older profiles
            if (data.isPro === undefined) updates.isPro = false;
            if (data.translationCount === undefined) updates.translationCount = 0;
            if (data.grammarCount === undefined) updates.grammarCount = 0;
            if (data.lastResetDate === undefined) updates.lastResetDate = today;
            
            // Reset daily limits
            if (data.lastResetDate !== today && data.lastResetDate !== undefined) {
              updates.translationCount = 0;
              updates.grammarCount = 0;
              updates.lastResetDate = today;
            }
            
            // Handle streak logic
            if (data.lastContributionDate) {
              const lastDate = new Date(data.lastContributionDate);
              const currentDate = new Date();
              const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
              
              if (diffDays > 1) {
                // Streak broken
                updates.currentStreak = 0;
              }
            }

            if (Object.keys(updates).length > 0) {
              await updateDoc(userRef, updates);
              setUserProfile({ ...data, ...updates });
            } else {
              setUserProfile(data);
            }
          }
        } catch (error) {
          console.error('Failed to sync user profile:', error);
        }

        // Test connection
        import('firebase/firestore').then(({ getDocFromServer, doc }) => {
          getDocFromServer(doc(db, '_connection_test_', 'ping')).catch(error => {
            if (error.message?.includes('client is offline')) {
              console.error("Firestore connection failed: client is offline. Check firebase-applet-config.json");
            }
          });
        });
      } else {
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Firestore Listener for Saved Words
  useEffect(() => {
    if (!user) {
      setSavedWords([]);
      return;
    }

    const path = 'words';
    console.log('Attaching onSnapshot listener for path:', path, 'userId:', user.uid);
    
    // Remove orderBy from query to avoid composite index requirement
    const q = query(
      collection(db, path),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('onSnapshot received update. Document count:', snapshot.size, 'Empty:', snapshot.empty);
      
      if (snapshot.empty) {
        console.log('No documents found for user:', user.uid);
        setSavedWords([]);
        return;
      }

      const words = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data
        };
      }) as SavedWord[];
      
      // Sort in-memory instead of in the query
      const sortedWords = words.sort((a, b) => {
        const getTime = (t: any) => {
          if (!t) return 0;
          if (typeof t.toMillis === 'function') return t.toMillis();
          if (t instanceof Date) return t.getTime();
          if (t.seconds) return t.seconds * 1000;
          if (typeof t === 'number') return t;
          return 0;
        };
        return getTime(b.createdAt) - getTime(a.createdAt);
      });
      
      setSavedWords(sortedWords);
    }, (error) => {
      console.error('onSnapshot error:', error);
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  const handleCheckGrammar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!grammarInput.trim() || isCheckingGrammar) return;

    if (userProfile && !userProfile.isPro && userProfile.grammarCount >= 10) {
      setPaymentTrigger('translation_limit'); // Reusing translation limit trigger for now
      setShowPayment(true);
      return;
    }

    setIsCheckingGrammar(true);
    try {
      const result = await checkGrammar(grammarInput);
      setGrammarResult(result);

      if (userProfile && !userProfile.isPro) {
        const userRef = doc(db, 'users', userProfile.userId);
        await updateDoc(userRef, {
          grammarCount: userProfile.grammarCount + 1
        });
        setUserProfile({ ...userProfile, grammarCount: userProfile.grammarCount + 1 });
      }
    } catch (error: any) {
      console.error(error);
      const message = error.message || (uiLang === 'zh' ? '语法检查失败，请重试。' : 'Grammar check failed. Please try again.');
      alert(message);
    } finally {
      setIsCheckingGrammar(false);
    }
  };

  const toggleListening = async () => {
    console.log('toggleListening called, current state:', { isListening, activeTab });
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert(uiLang === 'zh' ? '您的浏览器不支持麦克风访问。' : 'Your browser does not support microphone access.');
      return;
    }

    try {
      // Explicitly request microphone access to trigger the browser prompt
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err: any) {
      console.error('Microphone access denied:', err);
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        alert(uiLang === 'zh' ? '未找到麦克风设备，请检查您的设备连接。' : 'No microphone found. Please check your device connection.');
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert(uiLang === 'zh' ? '请在浏览器设置中允许麦克风访问。' : 'Please allow microphone access in your browser settings.');
      } else {
        alert(uiLang === 'zh' ? '无法访问麦克风：' + err.message : 'Could not access microphone: ' + err.message);
      }
      return;
    }

    stopAllAudio();

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = uiLang === 'zh' ? 'zh-CN' : 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
    };
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        alert(uiLang === 'zh' ? '请允许麦克风访问。' : 'Please allow microphone access.');
      } else if (event.error === 'network') {
        alert(uiLang === 'zh' ? '网络连接错误。' : 'Network connection error.');
      }
      setIsListening(false);
    };

    recognition.onresult = async (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      if (activeTab === 'translate') {
        setInputText(prev => prev + (prev ? ' ' : '') + transcript);
      } else if (activeTab === 'grammar') {
        setGrammarInput(prev => prev + (prev ? ' ' : '') + transcript);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleTranslate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isTranslating) return;

    if (userProfile && !userProfile.isPro && userProfile.translationCount >= 10) {
      setPaymentTrigger('translation_limit');
      setShowPayment(true);
      return;
    }

    setIsTranslating(true);
    setShowDetails(false);
    setSlangInsights([]);
    try {
      const result = await translateText(inputText, userProfile?.isPro ? formalityLevel : undefined);
      setTranslationResult(result);
      setSelectedUsageIndex(0);
      
      // Fetch slang insights if terms are found
      if (result.slangTerms && result.slangTerms.length > 0) {
        setIsFetchingSlang(true);
        try {
          const insights = await Promise.all(
            result.slangTerms.slice(0, 3).map(term => explainSlang(term))
          );
          setSlangInsights(insights);
        } catch (err) {
          console.error("Error fetching slang insights:", err);
        } finally {
          setIsFetchingSlang(false);
        }
      }

      if (userProfile && !userProfile.isPro) {
        const userRef = doc(db, 'users', userProfile.userId);
        await updateDoc(userRef, {
          translationCount: userProfile.translationCount + 1
        });
        setUserProfile({ ...userProfile, translationCount: userProfile.translationCount + 1 });
      }
    } catch (error: any) {
      console.error(error);
      const message = error.message || t.translationFailed;
      alert(message);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSaveWord = async (styleTag: 'authentic' | 'academic' | 'standard' = 'standard') => {
    if (!user || !translationResult || isSaving) return;

    if (userProfile && !userProfile.isPro && savedWords.length >= 50) {
      alert(uiLang === 'zh' ? '免费用户限存50个单词，请升级Pro。' : 'Free users are limited to 50 saved words. Please upgrade to Pro.');
      return;
    }

    setIsSaving(true);
    const path = 'words';
    try {
      const wordData: any = {
        original: translationResult.original,
        usages: translationResult.usages,
        userId: user.uid,
        styleTag,
        createdAt: Timestamp.now()
      };

      // Spaced Repetition fields for Pro users
      if (userProfile?.isPro) {
        wordData.nextReviewDate = Timestamp.now();
        wordData.interval = 0;
        wordData.easeFactor = 2.5;
      }
      
      const docRef = await addDoc(collection(db, 'words'), wordData);
      
      alert(uiLang === 'zh' ? '已成功保存到单词本' : 'Successfully saved to wordbook');
      setTranslationResult(null);
      setInputText('');
      setShowDetails(false);
    } catch (error: any) {
      console.error('Save word failed:', error);
      handleFirestoreError(error, OperationType.CREATE, path);
      alert(uiLang === 'zh' ? `保存失败: ${error.message || '未知错误'}` : `Failed to save: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWord = async (id: string) => {
    if (!user) return;
    const path = `words/${id}`;
    try {
      await deleteDoc(doc(db, 'words', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const handleReview = async (wordId: string, quality: number) => {
    if (!user || !userProfile?.isPro) return;
    
    const word = savedWords.find(w => w.id === wordId);
    if (!word) return;

    // SM-2 Algorithm
    let { interval, easeFactor } = word;
    if (interval === undefined) interval = 0;
    if (easeFactor === undefined) easeFactor = 2.5;

    if (quality >= 3) {
      if (interval === 0) interval = 1;
      else if (interval === 1) interval = 6;
      else interval = Math.round(interval * easeFactor);
      easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    } else {
      interval = 1;
      easeFactor = Math.max(1.3, easeFactor - 0.2);
    }

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + interval);

    try {
      const wordRef = doc(db, 'words', wordId);
      await updateDoc(wordRef, {
        interval,
        easeFactor,
        nextReviewDate: Timestamp.fromDate(nextReviewDate)
      });
    } catch (error) {
      console.error('Failed to update review:', error);
    }
  };

  const handleTabOrderChange = async (newOrder: string[]) => {
    if (!user || !userProfile) return;
    setUserProfile({ ...userProfile, tabOrder: newOrder });
    const userRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userRef, { tabOrder: newOrder });
    } catch (error) {
      console.error('Failed to update tab order:', error);
    }
  };

  const tabs = (userProfile?.tabOrder || ['slang', 'translate', 'grammar', 'history', 'review']).map(id => {
    switch(id) {
      case 'translate': return { id, label: t.translateTab, icon: Search };
      case 'history': return { id, label: t.wordbookTab, icon: History, count: savedWords.length };
      case 'review': return { id, label: t.reviewTab, icon: BookOpen };
      case 'grammar': return { id, label: t.grammarTab, icon: PenTool };
      case 'slang': return { id, label: t.slangTab, icon: MessageSquare };
      default: return { id, label: '', icon: Search };
    }
  });

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 border border-gray-100"
        >
          <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <Languages className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4 tracking-tight">{t.appName}</h1>
          <p className="text-gray-500 mb-10 text-lg leading-relaxed">
            {t.tagline}
          </p>
          <button 
            onClick={signIn}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-200"
          >
            <LogIn className="w-5 h-5" />
            {t.signIn}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 pb-24 relative overflow-hidden">
      {/* Decorative background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-300/30 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-300/30 rounded-full blur-3xl pointer-events-none"></div>

      {/* Header */}
      <header className="bg-white/40 backdrop-blur-md border-b border-white/50 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center">
              <Languages className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <span className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">{t.appName}</span>
            {userProfile?.isPro && (
              <span className="ml-2 px-2 py-0.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] font-black rounded-full shadow-sm uppercase tracking-wider">
                {t.proBadge}
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
                activeTab === 'profile' ? "bg-blue-100 text-blue-600" : "hover:bg-gray-50 text-gray-400 hover:text-blue-500"
              )}
              title={uiLang === 'zh' ? '我的' : 'Profile'}
            >
              <UserCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            {!userProfile?.isPro && (
              <button 
                onClick={handleUpgrade}
                className="hidden xs:flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
              >
                <Zap className="w-3 h-3 fill-current" />
                {t.upgradePro}
              </button>
            )}
            <button 
              onClick={() => setUiLang(uiLang === 'en' ? 'zh' : 'en')}
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-gray-50 rounded-lg transition-colors text-gray-500 text-xs sm:text-sm font-medium"
            >
              <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">{uiLang === 'en' ? '中文' : 'English'}</span>
              <span className="xs:hidden">{uiLang === 'en' ? 'ZH' : 'EN'}</span>
            </button>
            <button 
              onClick={() => setShowQrCode(true)}
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 hover:bg-gray-50 rounded-lg transition-colors text-blue-500 text-xs sm:text-sm font-medium"
              title={uiLang === 'zh' ? '在手机上使用' : 'Use on Mobile'}
            >
              <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden xs:inline">{uiLang === 'zh' ? '手机端' : 'Mobile'}</span>
            </button>
            <button
              onClick={logOut}
              aria-label={t.signOut}
              className="p-1.5 sm:p-2 hover:bg-gray-50 rounded-full transition-colors text-gray-400 hover:text-red-500"
              title={t.signOut}
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 relative z-10">
        {/* Tabs */}
        <Reorder.Group 
          axis="x" 
          values={userProfile?.tabOrder || ['slang', 'translate', 'grammar', 'history', 'review']}
          onReorder={handleTabOrderChange}
          className="flex bg-white/30 backdrop-blur-sm border border-white/50 p-1 rounded-2xl mb-6 sm:mb-8 overflow-x-auto no-scrollbar shadow-inner"
        >
          {tabs.map((tab) => (
            <Reorder.Item 
              key={tab.id} 
              value={tab.id}
              className="flex-1 min-w-[80px]"
            >
              <button 
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "w-full py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap px-3",
                  activeTab === tab.id ? "bg-white/70 text-blue-600 shadow-sm backdrop-blur-md border border-white/60" : "text-gray-500 hover:text-gray-700 hover:bg-white/20"
                )}
              >
                <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                {tab.label} {tab.count !== undefined && <span className="hidden xs:inline">({tab.count})</span>}
              </button>
            </Reorder.Item>
          ))}
        </Reorder.Group>

        <AnimatePresence mode="wait">
          {activeTab === 'translate' ? (
            <motion.div 
              key="translate"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* Search Box */}
              <form onSubmit={handleTranslate} className="relative group">
                <input 
                  type="text" 
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={t.inputPlaceholder}
                  className="w-full bg-white border-2 border-transparent focus:border-blue-500 rounded-3xl py-4 sm:py-6 pl-6 sm:pl-8 pr-28 sm:pr-32 text-lg sm:text-xl shadow-xl shadow-gray-200/50 outline-none transition-all placeholder:text-gray-300"
                />
                <div className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 sm:gap-2 z-20">
                  <button 
                    type="button"
                    onClick={toggleListening}
                    className={cn(
                      "p-3 sm:p-4 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-lg cursor-pointer",
                      isListening ? "bg-red-500 text-white shadow-red-200" : "bg-gray-100 text-gray-500 shadow-gray-100"
                    )}
                  >
                    {isListening ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
                  </button>
                  <button 
                    type="submit"
                    disabled={isTranslating || !inputText.trim()}
                    className="bg-blue-600 text-white p-3 sm:p-4 rounded-2xl disabled:opacity-50 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-200"
                  >
                    {isTranslating ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />}
                  </button>
                </div>
              </form>

              {/* Formality Slider */}
              <div 
                className={cn(
                  "bg-white/60 backdrop-blur-md border border-white/60 rounded-2xl p-4 shadow-sm relative group",
                  !userProfile?.isPro && "opacity-60 cursor-not-allowed"
                )}
              >
                {!userProfile?.isPro && (
                  <div 
                    className="absolute inset-0 z-10 cursor-pointer"
                    onClick={() => {
                      setPaymentTrigger('slider');
                      setShowPayment(true);
                    }}
                    title={uiLang === 'zh' ? 'Pro 功能 · 升级解锁' : 'Pro Feature · Upgrade to Unlock'}
                  />
                )}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-600">{uiLang === 'zh' ? '口语/俚语' : 'Casual/Slang'}</span>
                  <span className="text-sm font-bold text-blue-600">
                    {uiLang === 'zh' ? '正式程度' : 'Formality'}: {formalityLevel}
                    {!userProfile?.isPro && <span className="ml-2 text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded uppercase">Pro</span>}
                  </span>
                  <span className="text-sm font-semibold text-gray-600">{uiLang === 'zh' ? '学术/正式' : 'Academic/Formal'}</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="100" 
                  value={formalityLevel}
                  onChange={(e) => setFormalityLevel(Number(e.target.value))}
                  disabled={!userProfile?.isPro}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none accent-blue-600"
                />
              </div>

              {/* Translation Result */}
              {translationResult && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="lg:col-span-2 bg-white rounded-3xl p-5 sm:p-8 shadow-xl border border-gray-100 space-y-8"
                  >
                    {/* Dual Column Translation */}
                    {(translationResult.authenticTranslation || translationResult.academicTranslation) && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Authentic Column */}
                        {translationResult.authenticTranslation && (
                          <div className="bg-blue-50/50 rounded-2xl p-6 border border-blue-100 relative">
                            <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <Zap className="w-3 h-3 fill-current" />
                              {uiLang === 'zh' ? '地道表达 (Authentic)' : 'Authentic Expression'}
                            </h3>
                            <p className="text-gray-900 text-lg font-medium leading-relaxed">
                              {translationResult.authenticTranslation}
                            </p>
                            <button 
                              onClick={() => speak(translationResult.authenticTranslation!)}
                              className="absolute top-4 right-4 p-2 text-blue-400 hover:text-blue-600 transition-colors"
                            >
                              <Volume2 className="w-5 h-5" />
                            </button>

                            <button 
                              onClick={() => handleSaveWord('authentic')}
                              disabled={isSaving}
                              className="mt-4 flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              {uiLang === 'zh' ? '存入地道表达' : 'Save as Authentic'}
                            </button>
                          </div>
                        )}

                        {/* Academic Column */}
                        {translationResult.academicTranslation && (
                          <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200 relative">
                            <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <BookOpen className="w-3 h-3" />
                              {uiLang === 'zh' ? '学术表达 (Academic)' : 'Academic Expression'}
                            </h3>
                            <p className="text-gray-900 text-lg font-medium leading-relaxed">
                              {translationResult.academicTranslation}
                            </p>
                            <button 
                              onClick={() => speak(translationResult.academicTranslation!)}
                              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <Volume2 className="w-5 h-5" />
                            </button>

                            <button 
                              onClick={() => handleSaveWord('academic')}
                              disabled={isSaving}
                              className="mt-4 flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                              {uiLang === 'zh' ? '存入学术表达' : 'Save as Academic'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                  <div className="flex flex-col sm:flex-row justify-between items-start gap-6 sm:gap-0 mb-6 sm:mb-8">
                    <div className="w-full sm:w-auto">
                      <div className="flex items-center gap-4 mb-2">
                        <div className="flex flex-col">
                          <h2 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight break-words">
                            {translationResult.usages[selectedUsageIndex].meaning}
                          </h2>
                          <p className="text-lg sm:text-xl font-bold text-blue-600 mt-1">
                            {translationResult.usages[selectedUsageIndex].meaningZh}
                          </p>
                        </div>
                        <button 
                          onClick={() => speak(translationResult.usages[selectedUsageIndex].meaning)}
                          disabled={loadingAudioText === translationResult.usages[selectedUsageIndex].meaning}
                          className="p-2 text-blue-500 hover:bg-blue-50 rounded-full transition-colors self-start mt-2 disabled:opacity-50"
                        >
                          {loadingAudioText === translationResult.usages[selectedUsageIndex].meaning ? (
                            <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" />
                          ) : (
                            <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        {translationResult.pronunciation && (
                          <span className="text-blue-600 font-mono font-medium bg-blue-50 px-3 py-1 rounded-lg text-xs sm:text-sm">
                            {translationResult.pronunciation}
                          </span>
                        )}
                        <span className="text-gray-400 text-xs sm:text-sm font-medium">
                          {translationResult.original}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleSaveWord()}
                      disabled={isSaving}
                      className="w-full sm:w-auto bg-blue-600 text-white px-6 py-3 sm:py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      {t.save}
                    </button>
                  </div>

                  {/* Frequency Tabs */}
                  <div className="mb-8">
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                      {uiLang === 'zh' ? '使用频率' : 'Usage Frequency'}
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {translationResult.usages.map((usage, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedUsageIndex(idx);
                            setShowDetails(false);
                          }}
                          className={cn(
                            "px-4 py-2 rounded-xl text-sm font-bold transition-all border-2",
                            selectedUsageIndex === idx 
                              ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100 scale-105" 
                              : "bg-white border-gray-100 text-gray-400 hover:border-blue-200 hover:text-blue-400"
                          )}
                        >
                          {uiLang === 'zh' ? usage.labelZh : usage.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-8">
                    <motion.div 
                      key={selectedUsageIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-8"
                    >
                      <div>
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                          {uiLang === 'zh' ? '释义' : 'Meaning'}
                        </h3>
                        <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-3">
                          <p className="text-gray-800 text-lg font-bold leading-relaxed">
                            {translationResult.usages[selectedUsageIndex].meaning}
                          </p>
                          <p className="text-blue-600 text-lg font-medium leading-relaxed border-t border-gray-100 pt-3">
                            {translationResult.usages[selectedUsageIndex].meaningZh}
                          </p>
                        </div>
                      </div>

                      {/* Details Toggle */}
                      <button
                        onClick={() => setShowDetails(!showDetails)}
                        className="flex items-center gap-2 text-blue-600 font-bold text-sm hover:text-blue-700 transition-colors"
                      >
                        {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {showDetails ? t.hideDetails : t.showDetails}
                      </button>

                      <AnimatePresence>
                        {showDetails && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-6 space-y-6 border-t border-gray-100">
                              {translationResult.usages[selectedUsageIndex].synonyms && translationResult.usages[selectedUsageIndex].synonyms.length > 0 && (
                                <div>
                                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
                                    {t.synonyms}
                                  </h3>
                                  <div className="flex flex-wrap gap-2">
                                    {translationResult.usages[selectedUsageIndex].synonyms.map((syn, i) => (
                                      <span key={i} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-lg text-sm font-medium">
                                        {syn}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {translationResult.usages[selectedUsageIndex].alternatives && translationResult.usages[selectedUsageIndex].alternatives.length > 0 && (
                                <div>
                                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">
                                    {t.alternatives}
                                  </h3>
                                  <div className="flex flex-wrap gap-2">
                                    {translationResult.usages[selectedUsageIndex].alternatives.map((alt, i) => (
                                      <span key={i} className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-sm font-medium">
                                        {alt}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div>
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">
                          {t.examples}
                        </h3>
                        <div className="space-y-4">
                          {translationResult.usages[selectedUsageIndex].examples.map((ex, i) => (
                            <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 space-y-3 group/ex hover:border-blue-200 transition-colors">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex gap-4">
                                  <span className="text-blue-200 font-black text-xl italic">{String(i + 1).padStart(2, '0')}</span>
                                  <p className="text-gray-800 font-medium leading-relaxed text-lg">{ex.sentence}</p>
                                </div>
                                <button 
                                  onClick={() => speak(ex.sentence)}
                                  disabled={loadingAudioText === ex.sentence}
                                  className="p-2 text-gray-300 hover:text-blue-500 transition-colors shrink-0 disabled:opacity-50"
                                >
                                  {loadingAudioText === ex.sentence ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                  ) : (
                                    <Volume2 className="w-5 h-5" />
                                  )}
                                </button>
                              </div>
                              <p className="text-gray-500 pl-12 border-l-2 border-blue-50 italic">{ex.translation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </motion.div>

                {/* Slang Insight Sidebar (USP) */}
                <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="space-y-6"
                    >
                      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-6 text-white shadow-xl shadow-blue-200">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="bg-white/20 p-2 rounded-xl backdrop-blur-md">
                            <MessageSquare className="w-5 h-5 text-white" />
                          </div>
                          <h3 className="font-black uppercase tracking-widest text-sm">
                            {uiLang === 'zh' ? 'LingoFlow 梗百科' : 'LingoFlow Insights'}
                          </h3>
                        </div>
                        <p className="text-blue-100 text-sm leading-relaxed mb-4">
                          {uiLang === 'zh' 
                            ? '我们不仅翻译文字，更通过 AI 深度解析其背后的互联网文化与俚语背景。' 
                            : 'We don\'t just translate words; we decode the internet culture and slang context behind them.'}
                        </p>
                        <div className="h-px bg-white/20 mb-4" />
                        
                        {isFetchingSlang ? (
                          <div className="flex flex-col items-center py-8 gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-200" />
                            <p className="text-xs text-blue-200 animate-pulse">
                              {uiLang === 'zh' ? '正在解析文化背景...' : 'Decoding cultural context...'}
                            </p>
                          </div>
                        ) : slangInsights.length > 0 ? (
                          <div className="space-y-6">
                            {slangInsights.map((insight, idx) => (
                              <div key={idx} className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/10">
                                <h4 className="font-black text-lg mb-1">{insight.term}</h4>
                                <p className="text-sm text-blue-50 mb-3 leading-relaxed line-clamp-3">
                                  {uiLang === 'zh' ? insight.meaning : insight.meaningEn}
                                </p>
                                <button
                                  onClick={() => {
                                    setSearchQuery(insight.term);
                                    setActiveTab('slang');
                                  }}
                                  className="w-full bg-white text-blue-600 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-50 transition-colors"
                                >
                                  {uiLang === 'zh' ? '查看百科详情' : 'View Full Entry'}
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8">
                            <p className="text-blue-200 text-xs italic">
                              {uiLang === 'zh' ? '当前文本未检测到特定俚语' : 'No specific slang detected in this text'}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Pro Tip Card */}
                      {!userProfile?.isPro && (
                        <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6">
                          <div className="flex items-center gap-2 mb-3">
                            <Zap className="w-5 h-5 text-amber-500 fill-current" />
                            <h4 className="font-bold text-amber-900">{uiLang === 'zh' ? '解锁深度解析' : 'Unlock Deep Insights'}</h4>
                          </div>
                          <p className="text-sm text-amber-800 mb-4">
                            {uiLang === 'zh' 
                              ? '升级 Pro 以获得更精准的俚语检测和完整的文化背景分析。' 
                              : 'Upgrade to Pro for more accurate slang detection and full cultural context analysis.'}
                          </p>
                          <button
                            onClick={handleUpgrade}
                            className="w-full bg-amber-500 text-white py-3 rounded-xl font-bold hover:bg-amber-600 transition-colors shadow-lg shadow-amber-200"
                          >
                            {t.upgradePro}
                          </button>
                        </div>
                      )}
                    </motion.div>
                  </div>
                )}
            </motion.div>
          ) : activeTab === 'grammar' ? (
            <motion.div key="grammar" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
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
            </motion.div>
          ) : activeTab === 'review' ? (
            <motion.div key="review" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
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
              />
            </motion.div>
          ) : activeTab === 'history' ? (
            <motion.div key="history" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
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
              />
            </motion.div>
          ) : activeTab === 'slang' ? (
            <motion.div
              key="slang"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <SlangDictionary uiLang={uiLang} initialSearchTerm={searchQuery} />
            </motion.div>
          ) : activeTab === 'leaderboard' ? (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <Leaderboard currentUserId={user.uid} uiLang={uiLang} />
            </motion.div>
          ) : activeTab === 'profile' ? (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <UserProfileComponent
                uid={user.uid}
                userProfile={userProfile}
                uiLang={uiLang}
                onOpenPayment={(source) => {
                  setPaymentTrigger(source);
                  setShowPayment(true);
                }}
                onOpenOnboarding={() => setShowOnboarding(true)}
                onLogout={logOut}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Payment Modal */}
        <AnimatePresence>
          {showPayment && (
            <PaymentScreen
              triggerSource={paymentTrigger}
              currentPlan={userProfile?.isPro ? 'pro' : 'free'}
              uiLang={uiLang}
              onClose={() => setShowPayment(false)}
              onSuccess={() => {
                setShowPayment(false);
                if (userProfile) {
                  setUserProfile({ ...userProfile, isPro: true });
                  updateDoc(doc(db, 'users', user.uid), { isPro: true });
                }
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
            <SlangOnboarding 
              uiLang={uiLang} 
              onComplete={() => {
                setActiveTab('slang');
              }}
              onClose={() => setShowOnboarding(false)} 
            />
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}
