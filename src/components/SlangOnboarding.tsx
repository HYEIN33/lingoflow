import React, { useState, useRef, useCallback } from 'react';
import * as Sentry from '@sentry/react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Loader2, Image as ImageIcon, Mic, ChevronRight, Sparkles, AlertCircle, Wand2, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { cn } from '../lib/utils';
import { validateSlangMeaning, suggestSlangMeaning } from '../services/ai';
import { db, auth, storage } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { UserProfile } from '../App';

// Bump approvedSlangCount via Cloud Function — rules forbid direct client writes.
const syncContributionStatsFn = httpsCallable<
  { action: 'contribute_success' },
  { success: boolean }
>(getFunctions(), 'syncContributionStats');

interface SlangOnboardingProps {
  uiLang: 'en' | 'zh';
  onComplete: () => void;
  onClose: () => void;
}

const SEED_SLANGS = [
  { term: 'yolo' },
  { term: 'rizz' },
  { term: 'skibidi' },
  { term: 'gyatt' },
  { term: 'fanum tax' },
  { term: 'sigma' },
  { term: 'cap' },
  { term: 'mid' },
  { term: 'cope' },
];

export function SlangOnboarding({ uiLang, onComplete, onClose }: SlangOnboardingProps) {
  const [step, setStep] = useState(1);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  // AI suggestion state
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Review state
  const [reviewChecks, setReviewChecks] = useState([false, false, false, false]);
  const [reviewError, setReviewError] = useState('');

  const isMeaningValid = meaning.length >= 10 && example.length >= 5;

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
    setMeaning(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestion(selectedTerm, value);
    }, 800);
  };

  const applySuggestion = () => {
    if (aiSuggestion) {
      setMeaning(aiSuggestion);
      setAiSuggestion('');
    }
  };

  const handleNext = () => {
    if (step < 6) setStep(step + 1);
  };

  const handleBack = () => {
    setStep(prev => Math.max(1, prev - 1));
  };

  const handleReview = async () => {
    setStep(5);
    setReviewError('');
    setReviewChecks([false, false, false, false]);

    try {
      setTimeout(() => setReviewChecks(prev => [true, prev[1], prev[2], prev[3]]), 600);
      setTimeout(() => setReviewChecks(prev => [prev[0], true, prev[2], prev[3]]), 1200);
      setTimeout(() => setReviewChecks(prev => [prev[0], prev[1], true, prev[3]]), 1800);

      const validation = await validateSlangMeaning(selectedTerm, meaning, example);

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
        setReviewError(errorMsg);
        return;
      }

      setTimeout(() => setReviewChecks(prev => [prev[0], prev[1], prev[2], true]), 2400);

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

      if (auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        // 低敏字段（hasCompletedOnboarding / titleLevel1）客户端直写，在 rules 白名单里
        await updateDoc(userRef, {
          hasCompletedOnboarding: true,
          titleLevel1: '梗学徒',
        });
        // approvedSlangCount 走 CF（rules 禁止客户端直写敏感字段）
        try {
          await syncContributionStatsFn({ action: 'contribute_success' });
        } catch (e) {
          console.warn('syncContributionStats (onboarding) failed:', e);
          Sentry.captureException(e, { tags: { component: 'SlangOnboarding', op: 'syncSuccess' } });
        }
      }

      setTimeout(() => {
        setStep(6);
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#3b82f6', '#8b5cf6', '#f59e0b']
        });
      }, 3000);

    } catch (error: any) {
      console.error("Error during review:", error);
      const msg = error?.message || '';
      if (msg.includes('不可用') || msg.includes('繁忙') || msg.includes('location')) {
        setReviewError(uiLang === 'zh' ? 'AI 审核服务暂时不可用，请稍后重试' : 'AI review service temporarily unavailable');
      } else {
        setReviewError(uiLang === 'zh' ? '提交失败，请重试' : 'Submission failed, please try again');
      }
      Sentry.captureException(error, { tags: { component: 'SlangOnboarding', op: 'slang.submit' } });
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
            className="space-y-5"
          >
            <div className="text-center">
              <div className="w-16 h-16 bg-[rgba(91,127,232,0.1)] rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-[var(--blue-accent)]" />
              </div>
              <h2 className="font-display font-bold text-[22px] tracking-[-0.02em] text-[var(--ink)] mb-1.5">
                <em className="not-italic">
                  <span className="italic text-[var(--blue-accent)]">Welcome</span>
                </em>
                {' · '}
                {uiLang === 'zh' ? '欢迎来到梗百科' : 'Slang Dictionary'}
              </h2>
              <p className="font-zh-serif text-[13px] text-[var(--ink-muted)] m-0">
                {uiLang === 'zh' ? '只需 3 分钟，完成你的首次文化贡献，解锁「梗学徒」徽章' : 'Just 3 minutes to complete your first contribution and unlock the Slang Apprentice badge'}
              </p>
            </div>

            <div>
              <h3 className="font-display italic text-[14px] font-medium text-[var(--ink-muted)] m-0 mb-3">
                — {uiLang === 'zh' ? '你将会' : 'You will'}
              </h3>
              <ul className="m-0 pl-5 list-none font-zh-serif text-[14px] leading-[2] text-[var(--ink-soft)] space-y-0">
                <li>{uiLang === 'zh' ? '① 选择一个待完善的词条' : '① Select a term to define'}</li>
                <li>{uiLang === 'zh' ? '② 填写定义和例句（AI 可以帮你起草）' : '② Fill in meaning and example (AI can help draft)'}</li>
                <li>{uiLang === 'zh' ? '③ AI 审核词条质量（通常 5 秒）' : '③ AI reviews quality (usually 5 seconds)'}</li>
                <li>{uiLang === 'zh' ? '④ 获得「梗学徒」青铜徽章' : '④ Earn the Slang Apprentice bronze badge'}</li>
              </ul>
            </div>

            <button
              onClick={handleNext}
              className="w-full bg-[var(--ink)] text-white py-3.5 rounded-[14px] font-zh-serif font-bold text-[14px] hover:bg-[#1a2440] transition-colors shadow-[0_4px_12px_rgba(10,14,26,0.25)]"
            >
              {uiLang === 'zh' ? '开始 · begin' : 'Begin · 开始'}
            </button>
          </motion.div>
        );
      case 2:
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-5"
          >
            <div>
              <h2 className="font-display font-bold text-[22px] tracking-[-0.02em] text-[var(--ink)] m-0 mb-1.5">
                {uiLang === 'zh' ? '选一个' : 'Pick a'}
                <em className="italic text-[var(--blue-accent)]">
                  {uiLang === 'zh' ? '待完善的词条' : ' seed term'}
                </em>
              </h2>
              <p className="font-zh-serif text-[13px] text-[var(--ink-muted)] m-0">
                {uiLang === 'zh' ? '这些是目前社区投稿数最少的热搜词，最容易通过审核' : 'These are trending terms with fewest submissions — easiest to get approved'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SEED_SLANGS.map((slang, idx) => {
                const on = selectedTerm === slang.term;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      setSelectedTerm(slang.term);
                      handleNext();
                    }}
                    className={
                      'px-3.5 py-2 rounded-full border-[1.5px] font-display italic text-[14px] font-medium transition-all ' +
                      (on
                        ? 'bg-[var(--ink)] border-[var(--ink)] text-white'
                        : 'bg-white/55 border-[rgba(10,14,26,0.1)] text-[var(--ink-muted)] hover:border-[rgba(91,127,232,0.4)] hover:text-[var(--blue-accent)]')
                    }
                  >
                    {slang.term}
                  </button>
                );
              })}
            </div>
            <p className="font-zh-serif text-[12.5px] text-[var(--ink-subtle)] m-0">
              {uiLang === 'zh' ? '点选即进入下一步' : 'Click to continue'}
            </p>
            <button
              onClick={handleBack}
              className="w-full bg-transparent border border-[var(--ink-body)] text-[var(--ink-body)] py-3 rounded-[14px] font-zh-serif font-semibold text-[13px] hover:bg-[rgba(10,14,26,0.04)] transition-colors"
            >
              {uiLang === 'zh' ? '← 上一步' : '← Back'}
            </button>
          </motion.div>
        );
      case 3:
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-5"
          >
            <div>
              <h2 className="font-display font-bold text-[22px] tracking-[-0.02em] text-[var(--ink)] m-0 mb-1.5">
                {uiLang === 'zh' ? '解释 ' : 'Define '}
                <em className="italic text-[var(--blue-accent)]">"{selectedTerm}"</em>
              </h2>
              <p className="font-zh-serif text-[13px] text-[var(--ink-muted)] m-0">
                {uiLang === 'zh' ? '用通俗语言写清含义和例句，至少 10 / 5 字' : 'Write meaning and example in plain language (10 / 5 chars min)'}
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block font-zh-sans font-semibold text-[13px] text-[var(--ink-body)] mb-2 tracking-[0.01em]">
                  {uiLang === 'zh' ? '含义 (至少 10 个字)' : 'Meaning (min 10 chars)'}
                </label>
                <textarea
                  value={meaning}
                  onChange={(e) => handleMeaningChange(e.target.value)}
                  className="w-full bg-white border border-[var(--ink-hairline)] rounded-[14px] p-4 text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:ring-2 focus:ring-[var(--blue-accent)] focus:border-transparent outline-none min-h-[100px] font-zh-serif text-[14px] leading-[1.7]"
                  placeholder={uiLang === 'zh' ? '用通俗易懂的语言解释...' : 'Explain in simple terms...'}
                />
                <div className="flex items-center justify-between mt-1">
                  <div className="flex items-center gap-1">
                    {isLoadingSuggestion && (
                      <span className="flex items-center gap-1 font-mono-meta text-[11px] text-[var(--blue-accent)]">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        AI 思考中...
                      </span>
                    )}
                  </div>
                  <span className={cn("font-mono-meta text-[11px]", meaning.length >= 10 ? "text-[var(--green-ok)]" : "text-[var(--ink-subtle)]")}>
                    {meaning.length}/10
                  </span>
                </div>

                {/* AI Suggestion */}
                <AnimatePresence>
                  {aiSuggestion && !isLoadingSuggestion && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="mt-2 bg-[rgba(91,127,232,0.08)] border border-[rgba(91,127,232,0.2)] rounded-[14px] p-4 cursor-pointer hover:bg-[rgba(91,127,232,0.12)] transition-colors group"
                      onClick={applySuggestion}
                      style={{ background: 'linear-gradient(135deg, rgba(91,127,232,0.08), rgba(137,163,240,0.05))' }}
                    >
                      <div className="flex items-start gap-2">
                        <Wand2 className="w-4 h-4 text-[var(--blue-accent)] mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-display italic text-[13px] font-semibold text-[var(--blue-accent)] m-0 mb-1">
                            — {uiLang === 'zh' ? 'AI 建议' : 'AI Suggestion'}
                          </p>
                          <p className="font-zh-serif text-[13px] text-[var(--ink-soft)] leading-[1.7] m-0">{aiSuggestion}</p>
                        </div>
                        <span className="font-mono-meta text-[10px] text-[rgba(91,127,232,0.6)] group-hover:text-[var(--blue-accent)] shrink-0 mt-0.5">
                          {uiLang === 'zh' ? '点击采纳' : 'apply'}
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div>
                <label className="block font-zh-sans font-semibold text-[13px] text-[var(--ink-body)] mb-2 tracking-[0.01em]">
                  {uiLang === 'zh' ? '例句 (至少 5 个字)' : 'Example (min 5 chars)'}
                </label>
                <textarea
                  value={example}
                  onChange={(e) => setExample(e.target.value)}
                  className="w-full bg-white border border-[var(--ink-hairline)] rounded-[14px] p-4 text-[var(--ink)] placeholder:text-[var(--ink-subtle)] focus:ring-2 focus:ring-[var(--blue-accent)] focus:border-transparent outline-none min-h-[80px] font-zh-serif text-[14px] leading-[1.7]"
                  placeholder={uiLang === 'zh' ? '给出一个使用的例子...' : 'Provide an example usage...'}
                />
                <div className="text-right mt-1">
                  <span className={cn("font-mono-meta text-[11px]", example.length >= 5 ? "text-[var(--green-ok)]" : "text-[var(--ink-subtle)]")}>
                    {example.length}/5
                  </span>
                </div>
              </div>
            </div>
            <div className="border border-[rgba(138,93,14,0.25)] bg-[rgba(240,215,138,0.12)] rounded-[14px] p-3 font-zh-serif text-[13px] text-[var(--amber)] flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--amber)]" />
              <span>{uiLang === 'zh' ? '双语词条可获得额外积分加成' : 'Bilingual entries earn bonus points'}</span>
            </div>
            <button
              onClick={handleNext}
              disabled={!isMeaningValid}
              className="w-full bg-[var(--ink)] text-white py-3.5 rounded-[14px] font-zh-serif font-bold text-[14px] hover:bg-[#1a2440] disabled:opacity-50 disabled:hover:bg-[#1a2440] transition-colors shadow-[0_4px_12px_rgba(10,14,26,0.25)]"
            >
              {uiLang === 'zh' ? '继续 →' : 'Continue →'}
            </button>
            <button
              onClick={handleBack}
              className="w-full bg-transparent border border-[var(--ink-body)] text-[var(--ink-body)] py-3 rounded-[14px] font-zh-serif font-semibold text-[13px] hover:bg-[rgba(10,14,26,0.04)] transition-colors"
            >
              {uiLang === 'zh' ? '← 上一步' : '← Back'}
            </button>
          </motion.div>
        );
      case 4:
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-5"
          >
            <div>
              <h2 className="font-display font-bold text-[22px] tracking-[-0.02em] text-[var(--ink)] m-0 mb-1.5">
                {uiLang === 'zh' ? '添加 ' : 'Add '}
                <em className="italic text-[var(--blue-accent)]">
                  {uiLang === 'zh' ? '多媒体' : 'media'}
                </em>
                {uiLang === 'zh' ? '（可选）' : ' (optional)'}
              </h2>
              <p className="font-zh-serif text-[13px] text-[var(--ink-muted)] m-0">
                {uiLang === 'zh' ? '丰富的多媒体内容能帮助他人更好理解' : 'Rich media helps others understand better'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="bg-white/55 hover:bg-[rgba(91,127,232,0.06)] border-[1.5px] border-dashed border-[var(--ink-rule)] hover:border-[var(--blue-accent)] rounded-[14px] p-5 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all">
                <input type="file" accept="image/*,video/*,.gif" onChange={(e) => setMediaFile(e.target.files?.[0] || null)} className="hidden" />
                <ImageIcon className={cn("w-7 h-7", mediaFile ? "text-[var(--blue-accent)]" : "text-[var(--ink-subtle)]")} strokeWidth={1.8} />
                <span className="font-zh-serif text-[12.5px] font-medium text-[var(--ink-body)] text-center whitespace-pre-line">
                  {mediaFile ? mediaFile.name : (uiLang === 'zh' ? '图片 / 视频 / GIF\n+5 积分' : 'Image / Video / GIF\n+5 pts')}
                </span>
              </label>

              <label className="bg-white/55 hover:bg-[rgba(91,127,232,0.06)] border-[1.5px] border-dashed border-[var(--ink-rule)] hover:border-[var(--blue-accent)] rounded-[14px] p-5 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all">
                <input type="file" accept="audio/*" onChange={(e) => setAudioFile(e.target.files?.[0] || null)} className="hidden" />
                <Mic className={cn("w-7 h-7", audioFile ? "text-[var(--blue-accent)]" : "text-[var(--ink-subtle)]")} strokeWidth={1.8} />
                <span className="font-zh-serif text-[12.5px] font-medium text-[var(--ink-body)] text-center whitespace-pre-line">
                  {audioFile ? audioFile.name : (uiLang === 'zh' ? '原声录音\n+10 积分' : 'Voice audio\n+10 pts')}
                </span>
              </label>
            </div>

            <div className="border border-[var(--ink-hairline)] bg-white/55 rounded-[12px] p-3 font-zh-serif text-[12.5px] text-[var(--ink-muted)] leading-[1.7]">
              {uiLang === 'zh' ? '提交后将由 AI 进行内容安全与质量审核。通常 5 秒内完成。' : 'Content will undergo AI safety and quality review after submission. Usually completes in 5 seconds.'}
            </div>

            <button
              onClick={handleReview}
              className="w-full bg-[var(--ink)] text-white py-3.5 rounded-[14px] font-zh-serif font-bold text-[14px] hover:bg-[#1a2440] transition-colors shadow-[0_4px_12px_rgba(10,14,26,0.25)]"
            >
              {uiLang === 'zh' ? '提交审核' : 'Submit for review'}
            </button>
            <button
              onClick={handleBack}
              className="w-full bg-transparent border border-[var(--ink-body)] text-[var(--ink-body)] py-3 rounded-[14px] font-zh-serif font-semibold text-[13px] hover:bg-[rgba(10,14,26,0.04)] transition-colors"
            >
              {uiLang === 'zh' ? '← 上一步' : '← Back'}
            </button>
          </motion.div>
        );
      case 5:
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-5"
          >
            <div>
              <h2 className="font-display font-bold text-[22px] tracking-[-0.02em] text-[var(--ink)] m-0 mb-1.5">
                <em className="italic text-[var(--blue-accent)]">
                  {uiLang === 'zh' ? 'AI 审核中' : 'AI reviewing'}
                </em>
                {uiLang === 'zh' ? ' · 通常 5 秒' : ' · ~5 seconds'}
              </h2>
              <p className="font-zh-serif text-[13px] text-[var(--ink-muted)] m-0">
                {uiLang === 'zh' ? '正在检查你的词条是否符合准则。通过后会立即发布到梗百科。' : 'Checking your entry against guidelines. Will publish immediately on approval.'}
              </p>
            </div>

            <div
              className="p-4 rounded-[14px] border border-[rgba(91,127,232,0.2)]"
              style={{ background: 'linear-gradient(135deg, rgba(91,127,232,0.08), rgba(137,163,240,0.05))' }}
            >
              <h4 className="font-display italic text-[14px] font-semibold text-[var(--blue-accent)] m-0 mb-3">
                — {uiLang === 'zh' ? 'AI 正在检查' : 'AI checks'}
              </h4>

              <div className="flex flex-col gap-2 relative">
                <motion.div
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute left-0 right-0 h-0.5 bg-[rgba(91,127,232,0.5)] shadow-[0_0_10px_rgba(91,127,232,0.5)] z-10 pointer-events-none"
                />

                {[
                  uiLang === 'zh' ? '内容相关性检测' : 'Relevance check',
                  uiLang === 'zh' ? '社区准则扫描' : 'Community guidelines',
                  uiLang === 'zh' ? '多媒体验证' : 'Media validation',
                  uiLang === 'zh' ? '质量评分计算' : 'Quality scoring'
                ].map((text, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 font-zh-serif text-[13px]">
                    <span className={cn(
                      "w-[18px] h-[18px] shrink-0 rounded-full inline-flex items-center justify-center",
                      reviewChecks[idx]
                        ? "bg-[var(--blue-accent)] text-white"
                        : "border-2 border-[rgba(91,127,232,0.3)] border-t-[var(--blue-accent)] animate-spin"
                    )}>
                      {reviewChecks[idx] && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                    <span className={reviewChecks[idx] ? "text-[var(--ink)]" : "text-[var(--ink-muted)]"}>
                      {text}
                      {reviewChecks[idx] ? (uiLang === 'zh' ? ' · 通过' : ' · passed') : (uiLang === 'zh' ? ' · 进行中…' : ' · in progress…')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {!reviewError && (
              <div className="text-center">
                <Loader2 className="w-6 h-6 text-[var(--blue-accent)] animate-spin mx-auto" />
              </div>
            )}

            {reviewError && (
              <div className="bg-[rgba(229,56,43,0.06)] border border-[rgba(229,56,43,0.25)] rounded-[14px] p-4 font-zh-serif text-[13px] text-[var(--red-warn)] text-center leading-[1.7]">
                <AlertCircle className="w-5 h-5 inline-block mr-2 -mt-0.5" />
                {reviewError}
                <button
                  onClick={() => setStep(3)}
                  className="block mt-3 mx-auto font-display italic text-[13px] underline text-[var(--red-warn)] hover:text-[var(--red-deep)]"
                >
                  {uiLang === 'zh' ? '返回修改' : 'Go back to edit'}
                </button>
              </div>
            )}
          </motion.div>
        );
      case 6:
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-5 py-2 relative"
          >
            <div
              className="w-[84px] h-[84px] rounded-full mx-auto inline-flex items-center justify-center font-zh-sans font-extrabold text-[30px]"
              style={{
                background: 'radial-gradient(ellipse at 30% 20%, #F5DEB3, #D4A76A 40%, #B8860B 70%, #8B5E3C)',
                boxShadow: 'inset 0 2px 4px rgba(245,222,179,0.5), inset 0 -2px 4px rgba(107,66,38,0.4), 0 8px 20px rgba(139,94,60,0.3)',
                color: '#5C3310',
                textShadow: '0 1px 0 rgba(245,222,179,0.6)',
              }}
            >
              初
            </div>

            <div>
              <h2 className="font-display font-bold text-[24px] tracking-[-0.02em] text-[var(--ink)] m-0 mb-1.5">
                <em className="italic text-[var(--blue-accent)]">
                  {uiLang === 'zh' ? '完成' : 'Done'}
                </em>
                {uiLang === 'zh' ? ' · 你的词条已发布' : ' · your entry is live'}
              </h2>
              <p className="font-zh-serif text-[13px] text-[var(--ink-muted)] m-0 leading-[1.85]">
                {uiLang === 'zh' ? (
                  <>你的词条 <strong className="text-[var(--blue-accent)]">{selectedTerm}</strong> 已通过 AI 审核，立即发布。<br />你解锁的「梗学徒」徽章是贡献之旅的第一枚铜章。</>
                ) : (
                  <>Your entry <strong className="text-[var(--blue-accent)]">{selectedTerm}</strong> passed AI review and is now live.<br />The Slang Apprentice bronze badge is the first milestone of your journey.</>
                )}
              </p>
            </div>

            <h3 className="font-display font-bold text-[20px] text-[var(--ink)] m-0">
              <em className="italic text-[var(--blue-accent)]">
                {uiLang === 'zh' ? '梗学徒' : 'Slang Apprentice'}
              </em>
              {uiLang === 'zh' ? ' 徽章已解锁' : ' badge unlocked'}
            </h3>

            <div
              className="p-4 rounded-[14px] border border-[rgba(91,127,232,0.22)] text-left"
              style={{ background: 'linear-gradient(135deg, rgba(91,127,232,0.08), rgba(137,163,240,0.05))' }}
            >
              <p className="font-zh-serif text-[12.5px] text-[var(--ink-muted)] m-0 mb-2">
                {uiLang === 'zh' ? '下一目标进度' : 'Next goal progress'}
              </p>
              <div className="flex justify-between font-zh-serif font-bold text-[13px] text-[var(--ink)] mb-2">
                <span>{uiLang === 'zh' ? '文化观察员' : 'Culture Observer'}</span>
                <span className="font-mono-meta text-[12px] text-[var(--blue-accent)]">1 / 5</span>
              </div>
              <div className="h-[6px] bg-[rgba(91,127,232,0.15)] rounded-full overflow-hidden">
                <div className="h-full rounded-full w-1/5" style={{ background: 'linear-gradient(90deg, #5B7FE8, #0A0E1A)' }} />
              </div>
            </div>

            <button
              onClick={() => {
                onComplete();
                onClose();
              }}
              className="w-full bg-[var(--ink)] text-white py-3.5 rounded-[14px] font-zh-serif font-bold text-[14px] hover:bg-[#1a2440] transition-colors shadow-[0_4px_12px_rgba(10,14,26,0.25)]"
            >
              {uiLang === 'zh' ? '进入梗百科' : 'Enter Slang Dictionary'}
            </button>
          </motion.div>
        );
    }
  };

  // 6-step dot indicator for the wizard header
  const renderSteps = () => {
    const total = 6;
    const items: React.ReactNode[] = [];
    for (let i = 1; i <= total; i++) {
      const state: 'done' | 'cur' | 'todo' = i < step ? 'done' : i === step ? 'cur' : 'todo';
      items.push(
        <span
          key={`dot-${i}`}
          className={
            'flex-shrink-0 w-7 h-7 rounded-full inline-flex items-center justify-center font-mono-meta text-[11px] font-extrabold border-[1.5px] transition-colors ' +
            (state === 'cur'
              ? 'bg-[var(--ink)] border-[var(--ink)] text-white shadow-[0_0_0_4px_rgba(10,14,26,0.08)]'
              : state === 'done'
              ? 'bg-[var(--blue-accent)] border-[var(--blue-accent)] text-white'
              : 'bg-white border-[var(--ink-rule)] text-[var(--ink-muted)]')
          }
        >
          {state === 'done' ? '✓' : i}
        </span>
      );
      if (i < total) {
        items.push(
          <span
            key={`conn-${i}`}
            className={
              'flex-1 h-0.5 rounded-full ' +
              (i < step ? 'bg-[var(--blue-accent)]' : 'bg-[var(--ink-hairline)]')
            }
          />
        );
      }
    }
    return <div className="flex gap-2 items-center mb-4">{items}</div>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <motion.div className="relative w-full max-w-[520px] glass-thick rounded-[28px] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Wizard head: step dots + close/skip controls */}
        <div
          className="px-7 pt-5 pb-4 border-b border-[var(--ink-hairline)] relative"
          style={{ background: 'linear-gradient(180deg, rgba(91,127,232,0.06), transparent)' }}
        >
          {step < 5 && (
            <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
              <button
                onClick={async () => {
                  // Mark as completed locally + Firestore
                  localStorage.setItem('memeflow_onboarding_skipped', 'true');
                  if (auth.currentUser) {
                    try {
                      await updateDoc(doc(db, 'users', auth.currentUser.uid), { hasCompletedOnboarding: true });
                    } catch (e) {
                      console.error('Skip onboarding failed:', e);
                    }
                  }
                  onClose();
                }}
                className="px-3 py-1.5 font-zh-serif text-[11.5px] font-bold text-[var(--ink-muted)] hover:text-[var(--ink-body)] bg-transparent border border-[var(--ink-hairline)] hover:border-[var(--ink-rule)] rounded-[9px] transition-colors"
              >
                {uiLang === 'zh' ? '跳过' : 'Skip'}
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 inline-flex items-center justify-center text-[var(--ink-subtle)] hover:text-[var(--ink)] hover:bg-[rgba(10,14,26,0.04)] rounded-[9px] transition-colors"
                aria-label={uiLang === 'zh' ? '关闭' : 'Close'}
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          )}
          {renderSteps()}
        </div>

        {/* Wizard body */}
        <div className="px-7 py-6 overflow-y-auto flex-1">
          <AnimatePresence mode="wait">
            {renderStep()}
          </AnimatePresence>
        </div>

        {/* Wizard foot: step count */}
        {step < 6 && (
          <div className="px-7 py-3 border-t border-[var(--ink-hairline)]">
            <span className="font-mono-meta text-[11px] text-[var(--ink-subtle)] tracking-[0.1em] uppercase">
              STEP {step} / 6
            </span>
          </div>
        )}
      </motion.div>
    </div>
  );
}
