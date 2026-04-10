import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, orderBy, limit, serverTimestamp, onSnapshot, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Search, Plus, ThumbsUp, AlertCircle, Loader2, MessageSquare, Volume2, Image as ImageIcon, Video, Film, X, Mic, Wand2 } from 'lucide-react';
import { validateSlangMeaning, generateSpeech, generateSlangExample, suggestSlangMeaning } from '../services/ai';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { UserProfile } from '../App';

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

export function SlangDictionary({ uiLang, initialSearchTerm }: { uiLang: 'en' | 'zh', initialSearchTerm?: string }) {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  const [currentSlang, setCurrentSlang] = useState<Slang | null>(null);
  const [meanings, setMeanings] = useState<SlangMeaning[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  
  useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
      // Trigger search
      const doSearch = async () => {
        setIsSearching(true);
        setCurrentSlang(null);
        setMeanings([]);
        setShowAddForm(false);

        try {
          const q = query(collection(db, 'slangs'), where('term', '==', initialSearchTerm.trim().toLowerCase()), limit(1));
          const snapshot = await getDocs(q);
          
          if (!snapshot.empty) {
            const slangDoc = snapshot.docs[0];
            const slangData = { id: slangDoc.id, ...slangDoc.data() } as Slang;
            setCurrentSlang(slangData);
            
            // Fetch meanings
            const meaningsQ = query(
              collection(db, 'slang_meanings'), 
              where('slangId', '==', slangData.id),
              where('status', '==', 'approved'),
              orderBy('upvotes', 'desc')
            );
            
            const unsubscribe = onSnapshot(meaningsQ, (meaningsSnapshot) => {
              const fetchedMeanings = meaningsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SlangMeaning));
              setMeanings(fetchedMeanings);
            });
            
            // Check user upvotes
            if (auth.currentUser) {
              const upvotesQ = query(
                collection(db, 'slang_upvotes'),
                where('userId', '==', auth.currentUser.uid)
              );
              const upvotesSnapshot = await getDocs(upvotesQ);
              const upvotedIds = new Set(upvotesSnapshot.docs.map(doc => doc.data().meaningId));
              setUpvotedMeanings(upvotedIds);
            }
          } else {
            setCurrentSlang(null);
          }
        } catch (error) {
          console.error("Error searching slang:", error);
        } finally {
          setIsSearching(false);
        }
      };
      doSearch();
    }
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
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSuggestion = useCallback(async (term: string, input: string) => {
    if (input.length < 3) {
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
        alert(uiLang === 'zh' ? '文件不能超过10MB' : 'File size must be less than 10MB');
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
        alert(uiLang === 'zh' ? '音频文件不能超过5MB' : 'Audio file size must be less than 5MB');
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
    
    try {
      if (meaning.userAudioUrl) {
        const audio = new Audio(meaning.userAudioUrl);
        audio.onended = () => setPlayingAudioId(null);
        await audio.play();
      } else {
        const audioData = await generateSpeech(meaning.meaning, meaning.voiceName || 'Kore');
        if (audioData) {
          const audio = new Audio(`data:audio/mp3;base64,${audioData}`);
          audio.onended = () => setPlayingAudioId(null);
          await audio.play();
        } else {
          setPlayingAudioId(null);
        }
      }
    } catch (error) {
      console.error("Error playing audio:", error);
      setPlayingAudioId(null);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    setCurrentSlang(null);
    setMeanings([]);
    setShowAddForm(false);

    try {
      const q = query(collection(db, 'slangs'), where('term', '==', searchTerm.trim().toLowerCase()), limit(1));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const slangDoc = snapshot.docs[0];
        const slangData = { id: slangDoc.id, ...slangDoc.data() } as Slang;
        setCurrentSlang(slangData);
        
        // Fetch meanings
        const meaningsQ = query(
          collection(db, 'slang_meanings'), 
          where('slangId', '==', slangData.id),
          where('status', '==', 'approved'),
          orderBy('upvotes', 'desc')
        );
        
        const unsubscribe = onSnapshot(meaningsQ, (meaningsSnapshot) => {
          const fetchedMeanings = meaningsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SlangMeaning));
          setMeanings(fetchedMeanings);
        });
        
        // Check user upvotes
        if (auth.currentUser) {
          const upvotesQ = query(
            collection(db, 'slang_upvotes'),
            where('userId', '==', auth.currentUser.uid)
          );
          const upvotesSnapshot = await getDocs(upvotesQ);
          const upvotedIds = new Set(upvotesSnapshot.docs.map(doc => doc.data().meaningId));
          setUpvotedMeanings(upvotedIds);
        }
      } else {
        // Not found
        setCurrentSlang(null);
      }
    } catch (error) {
      console.error("Error searching slang:", error);
    } finally {
      setIsSearching(false);
    }
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
        setSubmitError((uiLang === 'zh' ? '内容不符合规范: ' : 'Content rejected: ') + validation.reason);
        
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

      // Add meaning
      await addDoc(collection(db, 'slang_meanings'), {
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
        mediaUrl: mediaInfo?.url || null,
        mediaType: mediaInfo?.type || null,
        userAudioUrl: userAudioUrl || null,
        createdAt: serverTimestamp()
      });

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
      
      // Re-trigger search to attach listener if it was a new slang
      if (!currentSlang) {
        handleSearch();
      }
    } catch (error) {
      console.error("Error submitting meaning:", error);
      setSubmitError(uiLang === 'zh' ? '提交失败，请重试' : 'Failed to submit, please try again');
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
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={uiLang === 'zh' ? '搜索网络热词、梗...' : 'Search internet slang, memes...'}
          className="w-full bg-white/40 backdrop-blur-md border border-white/50 rounded-2xl py-4 pl-12 pr-4 outline-none focus:ring-2 focus:ring-blue-500/50 transition-all shadow-sm"
        />
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <button 
          type="submit"
          disabled={isSearching || !searchTerm.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : (uiLang === 'zh' ? '搜索' : 'Search')}
        </button>
      </form>

      {searchTerm && !isSearching && !currentSlang && !showAddForm && (
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
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {uiLang === 'zh' ? '含义' : 'Meaning'}
                </label>
                <textarea
                  value={newMeaning}
                  onChange={(e) => handleMeaningChange(e.target.value)}
                  placeholder={uiLang === 'zh' ? '用通俗易懂的语言解释这个梗...' : 'Explain this slang...'}
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
                  placeholder={uiLang === 'zh' ? '给出一个使用的例子...' : 'Provide an example sentence...'}
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
