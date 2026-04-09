import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, Image as ImageIcon, Mic, Video, ChevronRight, Sparkles, AlertCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { cn } from '../lib/utils';
import { validateSlangMeaning } from '../services/ai';
import { db, auth, storage } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { UserProfile } from '../App';

interface SlangOnboardingProps {
  uiLang: 'en' | 'zh';
  onComplete: () => void;
  onClose: () => void;
}

const SEED_SLANGS = [
  { term: 'City Walk', desc: '城市漫游，指无目的的城市漫步' },
  { term: 'E人/I人', desc: 'MBTI人格测试中的外向/内向' },
  { term: '搭子', desc: '特定领域的社交伙伴，如饭搭子、旅游搭子' },
  { term: '显眼包', desc: '爱出风头、引人注目的人（通常带调侃意味）' }
];

export function SlangOnboarding({ uiLang, onComplete, onClose }: SlangOnboardingProps) {
  const [step, setStep] = useState(1);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  
  // Review state
  const [reviewChecks, setReviewChecks] = useState([false, false, false, false]);
  const [reviewError, setReviewError] = useState('');
  
  const isMeaningValid = meaning.length >= 10 && example.length >= 5;

  const handleNext = () => {
    if (step < 6) setStep(step + 1);
  };

  const handleReview = async () => {
    setStep(5);
    setReviewError('');
    setReviewChecks([false, false, false, false]);

    try {
      // Simulate checks with delays for animation
      setTimeout(() => setReviewChecks(prev => [true, prev[1], prev[2], prev[3]]), 600);
      setTimeout(() => setReviewChecks(prev => [prev[0], true, prev[2], prev[3]]), 1200);
      setTimeout(() => setReviewChecks(prev => [prev[0], prev[1], true, prev[3]]), 1800);

      const validation = await validateSlangMeaning(selectedTerm, meaning, example);
      
      if (!validation.isValid) {
        setReviewError(validation.reason);
        return;
      }

      setTimeout(() => setReviewChecks(prev => [prev[0], prev[1], prev[2], true]), 2400);

      // Upload files if any
      let mediaUrl = null;
      let mediaType = null;
      if (mediaFile) {
        const fileExt = mediaFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const storageRef = ref(storage, `slang_media/${fileName}`);
        await uploadBytes(storageRef, mediaFile);
        mediaUrl = await getDownloadURL(storageRef);
        mediaType = mediaFile.type.includes('video') ? 'video' : (mediaFile.type.includes('gif') ? 'gif' : 'image');
      }

      let audioUrl = null;
      if (audioFile) {
        const fileExt = audioFile.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const storageRef = ref(storage, `slang_audio/${fileName}`);
        await uploadBytes(storageRef, audioFile);
        audioUrl = await getDownloadURL(storageRef);
      }

      // Save to Firestore
      const slangRef = await addDoc(collection(db, 'slangs'), {
        term: selectedTerm,
        createdAt: serverTimestamp()
      });

      await addDoc(collection(db, 'slang_meanings'), {
        slangId: slangRef.id,
        meaning: meaning.trim(),
        example: example.trim(),
        authorId: auth.currentUser?.uid,
        upvotes: 0,
        status: 'approved',
        mediaUrl,
        mediaType,
        userAudioUrl: audioUrl,
        createdAt: serverTimestamp()
      });

      // Update user profile
      if (auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data() as UserProfile;
          await updateDoc(userRef, {
            approvedSlangCount: (userData.approvedSlangCount || 0) + 1,
            hasCompletedOnboarding: true,
            titleLevel1: '梗学徒'
          });
        }
      }

      setTimeout(() => {
        setStep(6);
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#00c9a7', '#f5a623', '#ff6b6b']
        });
      }, 3000);

    } catch (error) {
      console.error("Error during review:", error);
      setReviewError(uiLang === 'zh' ? '提交失败，请重试' : 'Submission failed, please try again');
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center space-y-6"
          >
            <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-10 h-10 text-teal-500" />
            </div>
            <h2 className="text-3xl font-black text-white">
              {uiLang === 'zh' ? '欢迎来到梗百科' : 'Welcome to Slang Dictionary'}
            </h2>
            <p className="text-teal-50 text-lg">
              {uiLang === 'zh' ? '只需 3 分钟，完成你的首次文化贡献' : 'Complete your first cultural contribution in just 3 minutes'}
            </p>
            <div className="bg-white/10 p-6 rounded-2xl text-left space-y-4">
              <div className="flex items-center gap-3 text-teal-100">
                <div className="w-6 h-6 rounded-full bg-teal-500/20 flex items-center justify-center text-sm font-bold">1</div>
                <span>{uiLang === 'zh' ? '选择一个待完善的词条' : 'Select a term to define'}</span>
              </div>
              <div className="flex items-center gap-3 text-teal-100">
                <div className="w-6 h-6 rounded-full bg-teal-500/20 flex items-center justify-center text-sm font-bold">2</div>
                <span>{uiLang === 'zh' ? '填写定义与例句' : 'Provide meaning and example'}</span>
              </div>
              <div className="flex items-center gap-3 text-teal-100">
                <div className="w-6 h-6 rounded-full bg-teal-500/20 flex items-center justify-center text-sm font-bold">3</div>
                <span>{uiLang === 'zh' ? '获得「梗学徒」专属徽章' : 'Earn your "Slang Apprentice" badge'}</span>
              </div>
            </div>
            <button
              onClick={handleNext}
              className="w-full bg-teal-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-teal-400 transition-colors shadow-lg shadow-teal-500/30"
            >
              {uiLang === 'zh' ? '开始贡献' : 'Start Contributing'}
            </button>
          </motion.div>
        );
      case 2:
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <h2 className="text-2xl font-bold text-white text-center mb-8">
              {uiLang === 'zh' ? '选择一个种子词条' : 'Select a Seed Term'}
            </h2>
            <div className="grid gap-4">
              {SEED_SLANGS.map((slang, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedTerm(slang.term);
                    handleNext();
                  }}
                  className="bg-white/10 hover:bg-white/20 border border-white/10 p-4 rounded-2xl text-left transition-all group"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">{slang.term}</h3>
                      <p className="text-teal-100/70 text-sm">{slang.desc}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        );
      case 3:
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <h2 className="text-2xl font-bold text-white text-center mb-2">
              {uiLang === 'zh' ? `解释 "${selectedTerm}"` : `Define "${selectedTerm}"`}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-teal-100 mb-2">
                  {uiLang === 'zh' ? '含义 (至少 10 个字)' : 'Meaning (min 10 chars)'}
                </label>
                <textarea
                  value={meaning}
                  onChange={(e) => setMeaning(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white placeholder:text-white/30 focus:ring-2 focus:ring-teal-500 outline-none min-h-[100px]"
                  placeholder={uiLang === 'zh' ? '用通俗易懂的语言解释...' : 'Explain in simple terms...'}
                />
                <div className="text-right text-xs text-teal-200/50 mt-1">
                  {meaning.length}/10
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-teal-100 mb-2">
                  {uiLang === 'zh' ? '例句 (至少 5 个字)' : 'Example (min 5 chars)'}
                </label>
                <textarea
                  value={example}
                  onChange={(e) => setExample(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white placeholder:text-white/30 focus:ring-2 focus:ring-teal-500 outline-none min-h-[80px]"
                  placeholder={uiLang === 'zh' ? '给出一个使用的例子...' : 'Provide an example usage...'}
                />
                <div className="text-right text-xs text-teal-200/50 mt-1">
                  {example.length}/5
                </div>
              </div>
            </div>
            <div className="bg-teal-900/50 border border-teal-500/30 rounded-xl p-3 text-sm text-teal-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>{uiLang === 'zh' ? '双语词条可获得额外积分加成' : 'Bilingual entries earn bonus points'}</span>
            </div>
            <button
              onClick={handleNext}
              disabled={!isMeaningValid}
              className="w-full bg-teal-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-teal-400 disabled:opacity-50 disabled:hover:bg-teal-500 transition-colors"
            >
              {uiLang === 'zh' ? '继续' : 'Continue'}
            </button>
          </motion.div>
        );
      case 4:
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6"
          >
            <h2 className="text-2xl font-bold text-white text-center mb-2">
              {uiLang === 'zh' ? '添加多媒体 (可选)' : 'Add Media (Optional)'}
            </h2>
            <p className="text-teal-100 text-center text-sm mb-8">
              {uiLang === 'zh' ? '丰富的多媒体内容能帮助他人更好理解' : 'Rich media helps others understand better'}
            </p>
            
            <div className="grid grid-cols-2 gap-4">
              <label className="bg-white/10 hover:bg-white/20 border border-white/20 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors">
                <input type="file" accept="image/*,video/*,.gif" onChange={(e) => setMediaFile(e.target.files?.[0] || null)} className="hidden" />
                <ImageIcon className={cn("w-8 h-8", mediaFile ? "text-teal-400" : "text-white/50")} />
                <span className="text-sm font-medium text-white text-center">
                  {mediaFile ? mediaFile.name : (uiLang === 'zh' ? '图片/视频/GIF\n(+5 积分)' : 'Image/Video/GIF\n(+5 pts)')}
                </span>
              </label>
              
              <label className="bg-white/10 hover:bg-white/20 border border-white/20 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors">
                <input type="file" accept="audio/*" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} className="hidden" />
                <Mic className={cn("w-8 h-8", audioFile ? "text-teal-400" : "text-white/50")} />
                <span className="text-sm font-medium text-white text-center">
                  {audioFile ? audioFile.name : (uiLang === 'zh' ? '原声录音\n(+10 积分)' : 'Voice Audio\n(+10 pts)')}
                </span>
              </label>
            </div>

            <div className="bg-black/20 rounded-xl p-4 text-xs text-teal-100/70">
              {uiLang === 'zh' ? '提交后将由 AI 进行内容安全与质量审核。' : 'Content will undergo AI safety and quality review after submission.'}
            </div>

            <button
              onClick={handleReview}
              className="w-full bg-teal-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-teal-400 transition-colors"
            >
              {uiLang === 'zh' ? '提交审核' : 'Submit for Review'}
            </button>
          </motion.div>
        );
      case 5:
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8 py-8"
          >
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-teal-400 animate-spin mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">
                {uiLang === 'zh' ? 'AI 智能审核中' : 'AI Review in Progress'}
              </h2>
            </div>

            <div className="space-y-4 max-w-sm mx-auto relative">
              {/* Scanning line animation */}
              <motion.div 
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute left-0 right-0 h-0.5 bg-teal-400/50 shadow-[0_0_10px_rgba(45,212,191,0.5)] z-10"
              />
              
              {[
                uiLang === 'zh' ? '内容相关性检测' : 'Relevance Check',
                uiLang === 'zh' ? '社区准则扫描' : 'Community Guidelines',
                uiLang === 'zh' ? '多媒体验证' : 'Media Validation',
                uiLang === 'zh' ? '质量评分计算' : 'Quality Scoring'
              ].map((text, idx) => (
                <div key={idx} className="flex items-center gap-4 bg-white/5 p-4 rounded-xl">
                  {reviewChecks[idx] ? (
                    <CheckCircle2 className="w-6 h-6 text-teal-400" />
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-white/20" />
                  )}
                  <span className={cn("font-medium", reviewChecks[idx] ? "text-white" : "text-white/50")}>
                    {text}
                  </span>
                </div>
              ))}
            </div>

            {reviewError && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-200 text-sm text-center">
                <AlertCircle className="w-5 h-5 inline-block mr-2 mb-0.5" />
                {reviewError}
                <button onClick={() => setStep(3)} className="block mt-4 mx-auto underline">
                  {uiLang === 'zh' ? '返回修改' : 'Go back to edit'}
                </button>
              </div>
            )}
          </motion.div>
        );
      case 6:
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-8 py-8 relative"
          >
            {/* Particle explosion effect placeholder */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-64 h-64 bg-teal-500/20 rounded-full blur-3xl animate-pulse" />
            </div>

            <div className="relative z-10">
              <div className="w-32 h-32 mx-auto bg-gradient-to-br from-amber-300 to-amber-600 rounded-3xl rotate-12 flex items-center justify-center shadow-2xl shadow-amber-500/20 mb-8">
                <div className="w-28 h-28 bg-white/10 backdrop-blur-sm rounded-2xl -rotate-12 flex items-center justify-center border border-white/30">
                  <span className="text-4xl">🎓</span>
                </div>
              </div>
              
              <h2 className="text-3xl font-black text-white mb-2">
                {uiLang === 'zh' ? '恭喜获得徽章！' : 'Badge Unlocked!'}
              </h2>
              <p className="text-amber-400 font-bold text-xl mb-8">
                {uiLang === 'zh' ? '「梗学徒」' : 'Slang Apprentice'}
              </p>

              <div className="bg-white/10 rounded-2xl p-6 mb-8">
                <p className="text-teal-100 text-sm mb-3">
                  {uiLang === 'zh' ? '下一目标进度：' : 'Next Goal Progress:'}
                </p>
                <div className="flex justify-between text-white font-bold mb-2">
                  <span>{uiLang === 'zh' ? '文化观察员' : 'Culture Observer'}</span>
                  <span>1/5</span>
                </div>
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-400 w-1/5 rounded-full" />
                </div>
              </div>

              <button
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                className="w-full bg-white text-teal-900 py-4 rounded-xl font-black text-lg hover:bg-teal-50 transition-colors"
              >
                {uiLang === 'zh' ? '进入梗百科' : 'Enter Slang Dictionary'}
              </button>
            </div>
          </motion.div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-teal-950/90 backdrop-blur-xl"
      />
      <motion.div 
        className="relative w-full max-w-md bg-white/5 border border-white/10 rounded-[2rem] p-6 sm:p-8 shadow-2xl overflow-hidden"
      >
        {/* Close button */}
        {step < 5 && (
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
        
        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
