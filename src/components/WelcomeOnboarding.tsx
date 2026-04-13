import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Languages, Sparkles, BookOpen, Award, CheckCircle, ChevronRight, ArrowRight } from 'lucide-react';

interface WelcomeOnboardingProps {
  onComplete: () => void;
  uiLang?: 'zh' | 'en';
}

const SLIDES = [
  {
    titleZh: '中文打字，地道英文秒出',
    titleEn: 'Type Chinese, Get Natural English',
    subtitleZh: 'AI 懂你想说什么，给你最地道的表达',
    subtitleEn: 'AI understands your intent and delivers authentic expressions',
    icon: Languages,
    accent: Sparkles,
    color: 'from-blue-500 to-indigo-600',
    bgBlob: 'bg-blue-400/20',
  },
  {
    titleZh: '搞懂老外说的每一个梗',
    titleEn: 'Decode Every Internet Meme',
    subtitleZh: '互联网梗百科，中英双语，社区共建',
    subtitleEn: 'Bilingual meme encyclopedia, built by the community',
    icon: BookOpen,
    accent: Sparkles,
    color: 'from-indigo-500 to-purple-600',
    bgBlob: 'bg-indigo-400/20',
  },
  {
    titleZh: '学过的不会忘',
    titleEn: "What You Learn, You Keep",
    subtitleZh: '间隔复习系统，帮你把短期记忆变成长期记忆',
    subtitleEn: 'Spaced repetition turns short-term memory into long-term mastery',
    icon: Award,
    accent: CheckCircle,
    color: 'from-amber-500 to-orange-600',
    bgBlob: 'bg-amber-400/20',
  },
];

// Animated chat bubbles for Slide 1
function TranslateAnimation() {
  return (
    <div className="flex flex-col gap-3 w-full max-w-[260px] mx-auto">
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3, duration: 0.5, ease: 'easeOut' }}
        className="self-start bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-lg border border-gray-100"
      >
        <p className="text-sm text-gray-500 mb-0.5">中文</p>
        <p className="text-lg font-bold text-gray-900">我在弄咖啡</p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.0, duration: 0.5, ease: 'easeOut' }}
        className="self-end bg-blue-600 rounded-2xl rounded-br-sm px-4 py-3 shadow-lg"
      >
        <p className="text-sm text-blue-200 mb-0.5">English</p>
        <p className="text-lg font-bold text-white">I'm making coffee.</p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.8, duration: 0.3 }}
        className="self-end flex items-center gap-1 text-xs text-green-600 font-medium"
      >
        <Sparkles className="w-3 h-3" />
        <span>地道表达 Authentic</span>
      </motion.div>
    </div>
  );
}

// Animated meme cards for Slide 2
function MemeAnimation() {
  const memes = [
    { term: 'GOAT', meaning: '史上最强' },
    { term: 'no cap', meaning: '不骗你' },
    { term: 'plot twist', meaning: '剧情反转' },
  ];
  return (
    <div className="relative w-full max-w-[240px] mx-auto h-[180px]">
      {memes.map((meme, i) => (
        <motion.div
          key={meme.term}
          initial={{ opacity: 0, y: 60, rotate: (i - 1) * 3 }}
          animate={{ opacity: 1, y: i * -8, rotate: (i - 1) * 3 }}
          transition={{ delay: 0.3 + i * 0.3, duration: 0.5, ease: 'easeOut' }}
          className="absolute inset-x-0 mx-auto w-[200px] bg-white rounded-2xl p-4 shadow-lg border border-gray-100"
          style={{ zIndex: i + 1, top: `${40 + i * 8}px` }}
        >
          <p className="text-lg font-black text-gray-900">{meme.term}</p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 + i * 0.2 }}
            className="text-sm text-indigo-600 mt-1"
          >
            {meme.meaning}
          </motion.p>
        </motion.div>
      ))}
    </div>
  );
}

// Animated review progress for Slide 3
function ReviewAnimation() {
  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-[240px] mx-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 w-full text-center"
      >
        <p className="text-2xl font-black text-gray-900 mb-1">vibe</p>
        <p className="text-sm text-gray-400">你记住了吗？</p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0 }}
        className="flex items-center gap-2"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1.2, type: 'spring', stiffness: 300 }}
        >
          <CheckCircle className="w-8 h-8 text-green-500" />
        </motion.div>
        <span className="text-sm font-bold text-green-600">记住了!</span>
      </motion.div>
      <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
        <motion.div
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ delay: 1.5, duration: 1.0, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full"
        />
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.5 }}
        className="text-xs text-amber-600 font-medium"
      >
        连续 7 天 · 掌握 50 个单词
      </motion.p>
    </div>
  );
}

const ANIMATIONS = [TranslateAnimation, MemeAnimation, ReviewAnimation];

export default function WelcomeOnboarding({ onComplete, uiLang = 'zh' }: WelcomeOnboardingProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward

  const goNext = useCallback(() => {
    if (step === SLIDES.length - 1) {
      onComplete();
    } else {
      setDirection(1);
      setStep(s => s + 1);
    }
  }, [step, onComplete]);

  const goPrev = useCallback(() => {
    if (step > 0) {
      setDirection(-1);
      setStep(s => s - 1);
    }
  }, [step]);

  const handleDragEnd = useCallback((_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    const swipe = info.offset.x;
    const velocity = info.velocity.x;
    if (swipe < -50 || velocity < -200) goNext();
    else if (swipe > 50 || velocity > 200) goPrev();
  }, [goNext, goPrev]);

  const slide = SLIDES[step];
  const AnimationComponent = ANIMATIONS[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex flex-col relative overflow-hidden">
      {/* Background decorative blobs */}
      <motion.div
        key={`blob-${step}`}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8 }}
        className={`absolute top-[10%] left-[-20%] w-[60%] h-[60%] ${slide.bgBlob} rounded-full blur-3xl pointer-events-none`}
      />
      <motion.div className="absolute bottom-[-10%] right-[-20%] w-[50%] h-[50%] bg-purple-300/20 rounded-full blur-3xl pointer-events-none" />

      {/* Skip button */}
      <div className="flex justify-end p-4 sm:p-6 relative z-10">
        <button
          onClick={onComplete}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/50"
        >
          {uiLang === 'zh' ? '跳过' : 'Skip'}
        </button>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -100 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={handleDragEnd}
            className="flex flex-col items-center text-center w-full max-w-md cursor-grab active:cursor-grabbing"
          >
            {/* Icon badge */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
              className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${slide.color} flex items-center justify-center mb-6 shadow-lg`}
            >
              <slide.icon className="w-8 h-8 text-white" />
            </motion.div>

            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight mb-2">
              {uiLang === 'zh' ? slide.titleZh : slide.titleEn}
            </h1>
            <p className="text-sm sm:text-base text-gray-500 mb-8 max-w-xs">
              {uiLang === 'zh' ? slide.subtitleZh : slide.subtitleEn}
            </p>

            {/* Animation area */}
            <div className="w-full min-h-[220px] flex items-center justify-center">
              <AnimationComponent />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="p-6 sm:p-8 relative z-10">
        {/* Dots */}
        <div className="flex justify-center gap-2 mb-6">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => { setDirection(i > step ? 1 : -1); setStep(i); }}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step ? 'w-6 bg-blue-600' : 'w-2 bg-gray-300 hover:bg-gray-400'
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>

        {/* CTA button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={goNext}
          className={`w-full max-w-sm mx-auto flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-white shadow-lg transition-all ${
            isLast
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-lg'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isLast ? (
            <>
              {uiLang === 'zh' ? '开始体验' : 'Get Started'}
              <ArrowRight className="w-5 h-5" />
            </>
          ) : (
            <>
              {uiLang === 'zh' ? '下一步' : 'Next'}
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
