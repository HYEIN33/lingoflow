// AnimatedLoginPage — 动画角色登入页
//
// 改造自社区组件 "animated-characters-login-page"。
// 现状：原模板用写死的 erik@gmail.com/1234 + 原生弹窗假登录，紫黑橙黄四个抽象
//       色块盯着鼠标看、打字时害羞偷看密码。
// 修后：
//   1) 登录逻辑全部换成真实的 Firebase 三件套（Google / 邮箱注册登录找回 /
//      邀请码匿名内测），复用 App.tsx 原 LoginPage 的全部行为与错误处理。
//   2) 四个角色按 memeflow 白蓝品牌重新配色（品牌蓝 / 深蓝墨 / 蓝光 / 暖琥珀）。
//   3) 去掉 "use client"（Vite 不需要）和原生弹窗，错误走页面内联提示 / sonner toast。
// 不修后果：登入页停留在旧的静态卡片，没有这套"角色盯鼠标 + 偷看密码"的记忆点。
//
// 无障碍：动画纯装饰，整体 aria-hidden；尊重 prefers-reduced-motion（静止角色）。

import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Languages, Loader2, LogIn } from 'lucide-react';
import { motion } from 'motion/react';
import { emailSignUp, emailSignIn, resetPassword, signIn } from '../firebase';
import { prefersReducedMotion } from '../lib/motionTokens';
import type { Language } from '../i18n';

// ── memeflow 品牌配色（替换模板的紫黑橙黄） ──────────────────────────
const C = {
  brand: '#5B7FE8',      // 品牌蓝（原紫 #6C3FF5）
  brandDeep: '#3E5FBF',  // 深蓝（渐变用）
  inkBlue: '#1E3A8A',    // 深蓝墨（原黑 #2D2D2D）
  glow: '#89A3F0',       // 蓝光（原橙 #FF9B6B）
  amber: '#E8C375',      // 暖琥珀（原黄 #E8D754，复用 CSS --amber-bright）
  pupil: '#1E2A4A',      // 瞳孔深蓝（原 #2D2D2D）
};

// ── 瞳孔（只有黑点，无眼白）：橙/黄角色用 ──────────────────────────
interface PupilProps {
  size?: number;
  maxDistance?: number;
  pupilColor?: string;
  forceLookX?: number;
  forceLookY?: number;
  reduceMotion?: boolean;
}

const Pupil = ({
  size = 12,
  maxDistance = 5,
  pupilColor = C.pupil,
  forceLookX,
  forceLookY,
  reduceMotion = false,
}: PupilProps) => {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const pupilRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduceMotion) return;
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [reduceMotion]);

  const calculatePupilPosition = () => {
    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }
    if (reduceMotion || !pupilRef.current) return { x: 0, y: 0 };

    const pupil = pupilRef.current.getBoundingClientRect();
    const pupilCenterX = pupil.left + pupil.width / 2;
    const pupilCenterY = pupil.top + pupil.height / 2;
    const deltaX = mouseX - pupilCenterX;
    const deltaY = mouseY - pupilCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  };

  const pos = calculatePupilPosition();

  return (
    <div
      ref={pupilRef}
      className="rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: pupilColor,
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transition: 'transform 0.1s ease-out',
      }}
    />
  );
};

// ── 眼球（眼白 + 瞳孔 + 眨眼）：品牌蓝/深蓝墨角色用 ──────────────────
interface EyeBallProps {
  size?: number;
  pupilSize?: number;
  maxDistance?: number;
  eyeColor?: string;
  pupilColor?: string;
  isBlinking?: boolean;
  forceLookX?: number;
  forceLookY?: number;
  reduceMotion?: boolean;
}

const EyeBall = ({
  size = 48,
  pupilSize = 16,
  maxDistance = 10,
  eyeColor = 'white',
  pupilColor = C.pupil,
  isBlinking = false,
  forceLookX,
  forceLookY,
  reduceMotion = false,
}: EyeBallProps) => {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const eyeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduceMotion) return;
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [reduceMotion]);

  const calculatePupilPosition = () => {
    if (forceLookX !== undefined && forceLookY !== undefined) {
      return { x: forceLookX, y: forceLookY };
    }
    if (reduceMotion || !eyeRef.current) return { x: 0, y: 0 };

    const eye = eyeRef.current.getBoundingClientRect();
    const eyeCenterX = eye.left + eye.width / 2;
    const eyeCenterY = eye.top + eye.height / 2;
    const deltaX = mouseX - eyeCenterX;
    const deltaY = mouseY - eyeCenterY;
    const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance);
    const angle = Math.atan2(deltaY, deltaX);
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  };

  const pos = calculatePupilPosition();

  return (
    <div
      ref={eyeRef}
      className="rounded-full flex items-center justify-center transition-all duration-150"
      style={{
        width: `${size}px`,
        height: isBlinking ? '2px' : `${size}px`,
        backgroundColor: eyeColor,
        overflow: 'hidden',
      }}
    >
      {!isBlinking && (
        <div
          className="rounded-full"
          style={{
            width: `${pupilSize}px`,
            height: `${pupilSize}px`,
            backgroundColor: pupilColor,
            transform: `translate(${pos.x}px, ${pos.y}px)`,
            transition: 'transform 0.1s ease-out',
          }}
        />
      )}
    </div>
  );
};

// ── 角色舞台：四个角色盯鼠标 / 打字对视 / 密码可见时遮挡偷瞄 ──────────
function CharacterStage({
  isTyping,
  password,
  showPassword,
  reduceMotion,
}: {
  isTyping: boolean;
  password: string;
  showPassword: boolean;
  reduceMotion: boolean;
}) {
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);
  const [isBrandBlinking, setIsBrandBlinking] = useState(false);
  const [isInkBlinking, setIsInkBlinking] = useState(false);
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false);
  const [isBrandPeeking, setIsBrandPeeking] = useState(false);

  const brandRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const amberRef = useRef<HTMLDivElement>(null);

  const passwordVisible = password.length > 0 && showPassword;
  const passwordHidden = password.length > 0 && !showPassword;

  useEffect(() => {
    if (reduceMotion) return;
    const handleMouseMove = (e: MouseEvent) => {
      setMouseX(e.clientX);
      setMouseY(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [reduceMotion]);

  // 品牌蓝角色随机眨眼（3-7s）
  useEffect(() => {
    if (reduceMotion) return;
    let inner: ReturnType<typeof setTimeout>;
    const scheduleBlink = (): ReturnType<typeof setTimeout> =>
      setTimeout(() => {
        setIsBrandBlinking(true);
        inner = setTimeout(() => {
          setIsBrandBlinking(false);
          timeout = scheduleBlink();
        }, 150);
      }, Math.random() * 4000 + 3000);
    let timeout = scheduleBlink();
    return () => {
      clearTimeout(timeout);
      clearTimeout(inner);
    };
  }, [reduceMotion]);

  // 深蓝墨角色随机眨眼
  useEffect(() => {
    if (reduceMotion) return;
    let inner: ReturnType<typeof setTimeout>;
    const scheduleBlink = (): ReturnType<typeof setTimeout> =>
      setTimeout(() => {
        setIsInkBlinking(true);
        inner = setTimeout(() => {
          setIsInkBlinking(false);
          timeout = scheduleBlink();
        }, 150);
      }, Math.random() * 4000 + 3000);
    let timeout = scheduleBlink();
    return () => {
      clearTimeout(timeout);
      clearTimeout(inner);
    };
  }, [reduceMotion]);

  // 开始打字 → 角色们互相对视一下
  useEffect(() => {
    if (isTyping) {
      setIsLookingAtEachOther(true);
      const timer = setTimeout(() => setIsLookingAtEachOther(false), 800);
      return () => clearTimeout(timer);
    }
    setIsLookingAtEachOther(false);
  }, [isTyping]);

  // 密码可见时品牌蓝角色偷瞄
  useEffect(() => {
    if (passwordVisible && !reduceMotion) {
      const t = setTimeout(() => {
        setIsBrandPeeking(true);
        setTimeout(() => setIsBrandPeeking(false), 800);
      }, Math.random() * 3000 + 2000);
      return () => clearTimeout(t);
    }
    setIsBrandPeeking(false);
  }, [password, showPassword, isBrandPeeking, passwordVisible, reduceMotion]);

  const calculatePosition = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (reduceMotion || !ref.current) return { faceX: 0, faceY: 0, bodySkew: 0 };
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 3;
    const deltaX = mouseX - centerX;
    const deltaY = mouseY - centerY;
    const faceX = Math.max(-15, Math.min(15, deltaX / 20));
    const faceY = Math.max(-10, Math.min(10, deltaY / 30));
    const bodySkew = Math.max(-6, Math.min(6, -deltaX / 120));
    return { faceX, faceY, bodySkew };
  };

  const brandPos = calculatePosition(brandRef);
  const inkPos = calculatePosition(inkRef);
  const glowPos = calculatePosition(glowRef);
  const amberPos = calculatePosition(amberRef);

  return (
    <div className="relative" style={{ width: '550px', height: '400px' }} aria-hidden="true">
      {/* 品牌蓝高个 — 后层 */}
      <div
        ref={brandRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: '70px',
          width: '180px',
          height: isTyping || passwordHidden ? '440px' : '400px',
          backgroundColor: C.brand,
          borderRadius: '10px 10px 0 0',
          zIndex: 1,
          transform: passwordVisible
            ? 'skewX(0deg)'
            : isTyping || passwordHidden
            ? `skewX(${brandPos.bodySkew - 12}deg) translateX(40px)`
            : `skewX(${brandPos.bodySkew}deg)`,
          transformOrigin: 'bottom center',
        }}
      >
        <div
          className="absolute flex gap-8 transition-all duration-700 ease-in-out"
          style={{
            left: passwordVisible ? '20px' : isLookingAtEachOther ? '55px' : `${45 + brandPos.faceX}px`,
            top: passwordVisible ? '35px' : isLookingAtEachOther ? '65px' : `${40 + brandPos.faceY}px`,
          }}
        >
          {[0, 1].map((i) => (
            <EyeBall
              key={i}
              size={18}
              pupilSize={7}
              maxDistance={5}
              isBlinking={isBrandBlinking}
              reduceMotion={reduceMotion}
              forceLookX={passwordVisible ? (isBrandPeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined}
              forceLookY={passwordVisible ? (isBrandPeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined}
            />
          ))}
        </div>
      </div>

      {/* 深蓝墨高个 — 中层 */}
      <div
        ref={inkRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: '240px',
          width: '120px',
          height: '310px',
          backgroundColor: C.inkBlue,
          borderRadius: '8px 8px 0 0',
          zIndex: 2,
          transform: passwordVisible
            ? 'skewX(0deg)'
            : isLookingAtEachOther
            ? `skewX(${inkPos.bodySkew * 1.5 + 10}deg) translateX(20px)`
            : isTyping || passwordHidden
            ? `skewX(${inkPos.bodySkew * 1.5}deg)`
            : `skewX(${inkPos.bodySkew}deg)`,
          transformOrigin: 'bottom center',
        }}
      >
        <div
          className="absolute flex gap-6 transition-all duration-700 ease-in-out"
          style={{
            left: passwordVisible ? '10px' : isLookingAtEachOther ? '32px' : `${26 + inkPos.faceX}px`,
            top: passwordVisible ? '28px' : isLookingAtEachOther ? '12px' : `${32 + inkPos.faceY}px`,
          }}
        >
          {[0, 1].map((i) => (
            <EyeBall
              key={i}
              size={16}
              pupilSize={6}
              maxDistance={4}
              isBlinking={isInkBlinking}
              reduceMotion={reduceMotion}
              forceLookX={passwordVisible ? -4 : isLookingAtEachOther ? 0 : undefined}
              forceLookY={passwordVisible ? -4 : isLookingAtEachOther ? -4 : undefined}
            />
          ))}
        </div>
      </div>

      {/* 蓝光半圆 — 前左 */}
      <div
        ref={glowRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: '0px',
          width: '240px',
          height: '200px',
          zIndex: 3,
          backgroundColor: C.glow,
          borderRadius: '120px 120px 0 0',
          transform: passwordVisible ? 'skewX(0deg)' : `skewX(${glowPos.bodySkew}deg)`,
          transformOrigin: 'bottom center',
        }}
      >
        <div
          className="absolute flex gap-8 transition-all duration-200 ease-out"
          style={{
            left: passwordVisible ? '50px' : `${82 + glowPos.faceX}px`,
            top: passwordVisible ? '85px' : `${90 + glowPos.faceY}px`,
          }}
        >
          {[0, 1].map((i) => (
            <Pupil
              key={i}
              size={12}
              maxDistance={5}
              reduceMotion={reduceMotion}
              forceLookX={passwordVisible ? -5 : undefined}
              forceLookY={passwordVisible ? -4 : undefined}
            />
          ))}
        </div>
      </div>

      {/* 暖琥珀高个 — 前右（带嘴巴） */}
      <div
        ref={amberRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          left: '310px',
          width: '140px',
          height: '230px',
          backgroundColor: C.amber,
          borderRadius: '70px 70px 0 0',
          zIndex: 4,
          transform: passwordVisible ? 'skewX(0deg)' : `skewX(${amberPos.bodySkew}deg)`,
          transformOrigin: 'bottom center',
        }}
      >
        <div
          className="absolute flex gap-6 transition-all duration-200 ease-out"
          style={{
            left: passwordVisible ? '20px' : `${52 + amberPos.faceX}px`,
            top: passwordVisible ? '35px' : `${40 + amberPos.faceY}px`,
          }}
        >
          {[0, 1].map((i) => (
            <Pupil
              key={i}
              size={12}
              maxDistance={5}
              reduceMotion={reduceMotion}
              forceLookX={passwordVisible ? -5 : undefined}
              forceLookY={passwordVisible ? -4 : undefined}
            />
          ))}
        </div>
        <div
          className="absolute w-20 h-[4px] rounded-full transition-all duration-200 ease-out"
          style={{
            backgroundColor: C.pupil,
            left: passwordVisible ? '10px' : `${40 + amberPos.faceX}px`,
            top: passwordVisible ? '88px' : `${88 + amberPos.faceY}px`,
          }}
        />
      </div>
    </div>
  );
}

// ── 主登入页 ───────────────────────────────────────────────────────
export default function AnimatedLoginPage({ uiLang, t }: { uiLang: Language; t: any }) {
  const reduceMotion = prefersReducedMotion();

  const [mode, setMode] = useState<'main' | 'email' | 'guest'>('main');
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [guestCode, setGuestCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // ── 真实 Firebase 登录逻辑（与原 LoginPage 等价） ──
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
    if (guestCode.trim() !== '8888') {
      setError(uiLang === 'zh' ? '邀请码错误' : 'Invalid invite code');
      return;
    }
    setLoading(true);
    try {
      const { signInAnonymously } = await import('firebase/auth');
      const { auth } = await import('../firebase');
      await signInAnonymously(auth);
    } catch (e: any) {
      const code = e?.code || '';
      const msg = e?.message || 'Login failed';
      let friendly: string;
      if (code === 'auth/operation-not-allowed' || msg.includes('operation-not-allowed')) {
        friendly =
          uiLang === 'zh'
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
    } catch {
      setError(uiLang === 'zh' ? '发送失败，请检查邮箱' : 'Failed to send reset email');
    }
  };

  const backToMain = () => {
    setMode('main');
    setError('');
    setResetSent(false);
    setGuestCode('');
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* ── 左侧角色舞台（仅桌面端） ── */}
      <div
        className="relative hidden lg:flex flex-col justify-between p-12 text-white overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${C.brand} 0%, ${C.brandDeep} 100%)` }}
      >
        <div className="relative z-20">
          <div className="flex items-center gap-2 text-lg font-semibold font-display">
            <div className="size-9 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
              <Languages className="size-5" />
            </div>
            <span>{t.appName}</span>
          </div>
        </div>

        <div className="relative z-20 flex items-end justify-center h-[500px]">
          <CharacterStage
            isTyping={isTyping}
            password={password}
            showPassword={showPassword}
            reduceMotion={reduceMotion}
          />
        </div>

        <div className="relative z-20 text-sm text-white/70 max-w-sm leading-relaxed">
          {t.tagline}
        </div>

        {/* 装饰光斑 */}
        <div className="absolute top-1/4 right-1/4 size-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 size-96 bg-white/5 rounded-full blur-3xl" />
      </div>

      {/* ── 右侧登录表单 ── */}
      <div className="flex items-center justify-center p-6 sm:p-8 bg-white sm:bg-[#F8F9FA]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[420px]"
        >
          {/* 移动端 Logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 text-lg font-semibold mb-10 font-display">
            <div className="size-9 rounded-xl bg-[rgba(91,127,232,0.10)] flex items-center justify-center">
              <Languages className="size-5 text-[#5B7FE8]" />
            </div>
            <span className="text-gray-900">{t.appName}</span>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2 text-gray-900 font-display">
              {uiLang === 'zh' ? '欢迎回来' : 'Welcome back!'}
            </h1>
            <p className="text-[var(--ink-subtle)] text-sm">
              {mode === 'main'
                ? t.tagline
                : uiLang === 'zh'
                ? '请输入你的账号信息'
                : 'Please enter your details'}
            </p>
          </div>

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
                onClick={() => { setMode('email'); setError(''); }}
                className="w-full bg-white hover:bg-[rgba(91,127,232,0.08)] text-[#3E5FBF] border-2 border-[rgba(91,127,232,0.3)] hover:border-[#5B7FE8] font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3"
              >
                <LogIn className="w-5 h-5" />
                {uiLang === 'zh' ? '邮箱登录 / 注册' : 'Sign in with Email'}
              </button>
              <div className="relative flex items-center my-2">
                <div className="flex-1 border-t border-gray-200" />
                <span className="px-3 text-xs text-[var(--ink-subtle)]">{uiLang === 'zh' ? '或' : 'or'}</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>
              <button
                onClick={() => { setMode('guest'); setError(''); }}
                className="w-full border-2 border-gray-200 hover:border-gray-300 text-gray-700 font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3"
              >
                {uiLang === 'zh' ? '内测体验（邀请码）' : 'Beta Access (Invite Code)'}
              </button>
            </div>
          ) : mode === 'email' ? (
            <div className="space-y-4 text-left">
              <button onClick={backToMain} className="text-sm text-[#3E5FBF] hover:text-[#5B7FE8] font-medium">
                ← {uiLang === 'zh' ? '返回' : 'Back'}
              </button>

              <h3 className="text-lg font-bold text-gray-900">
                {isSignUp ? (uiLang === 'zh' ? '注册新账号' : 'Create Account') : (uiLang === 'zh' ? '邮箱登录' : 'Sign In')}
              </h3>

              <div className="space-y-2">
                <label htmlFor="login-email" className="block text-sm font-medium text-gray-700">
                  {uiLang === 'zh' ? '邮箱' : 'Email'}
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  placeholder="you@example.com"
                  className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-[#5B7FE8] focus:ring-2 focus:ring-[rgba(91,127,232,0.2)] outline-none"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">
                  {uiLang === 'zh' ? '密码' : 'Password'}
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setIsTyping(true)}
                    onBlur={() => setIsTyping(false)}
                    placeholder={isSignUp ? (uiLang === 'zh' ? '至少 6 位' : 'At least 6 characters') : '••••••'}
                    className="w-full h-12 px-4 pr-11 rounded-xl border border-gray-200 focus:border-[#5B7FE8] focus:ring-2 focus:ring-[rgba(91,127,232,0.2)] outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={
                      showPassword
                        ? uiLang === 'zh' ? '隐藏密码' : 'Hide password'
                        : uiLang === 'zh' ? '显示密码' : 'Show password'
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
                  >
                    {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                  </button>
                </div>
              </div>

              <button
                onClick={handleEmailAuth}
                disabled={loading}
                className="w-full h-12 bg-gray-800 hover:bg-gray-900 disabled:bg-gray-400 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSignUp ? (uiLang === 'zh' ? '注册' : 'Sign Up') : (uiLang === 'zh' ? '登录' : 'Sign In')}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="text-[#3E5FBF] hover:text-[#5B7FE8] font-medium">
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
              {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            </div>
          ) : (
            <div className="space-y-4 text-left">
              <button onClick={backToMain} className="text-sm text-[#3E5FBF] hover:text-[#5B7FE8] font-medium">
                ← {uiLang === 'zh' ? '返回' : 'Back'}
              </button>
              <h3 className="text-lg font-bold text-gray-900">{uiLang === 'zh' ? '内测体验' : 'Beta Access'}</h3>
              <p className="text-sm text-gray-500">
                {uiLang === 'zh' ? '输入邀请码即可体验全部功能' : 'Enter invite code to access all features'}
              </p>
              <input
                type="text"
                value={guestCode}
                onChange={(e) => setGuestCode(e.target.value)}
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
                placeholder={uiLang === 'zh' ? '请输入邀请码' : 'Enter invite code'}
                className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-[#5B7FE8] focus:ring-2 focus:ring-[rgba(91,127,232,0.2)] outline-none text-center text-lg tracking-widest"
                maxLength={10}
                onKeyDown={(e) => e.key === 'Enter' && handleGuestLogin()}
              />
              <button
                onClick={handleGuestLogin}
                disabled={loading || !guestCode}
                className="w-full h-12 bg-[#0A0E1A] hover:bg-[#1a2440] disabled:bg-gray-300 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {uiLang === 'zh' ? '进入体验' : 'Enter'}
              </button>
              {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
