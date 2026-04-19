import { useState } from 'react';
import { motion } from 'motion/react';
import { LogIn, Loader2, Languages, Mail, KeyRound, ArrowLeft, Sparkles, Globe, MessageCircle } from 'lucide-react';
import { signIn, emailSignUp, emailSignIn, resetPassword } from '../firebase';
import { Language } from '../i18n';
import { APP_VERSION, APP_ENV, IS_STAGING } from '../version';

export default function LoginPage({ uiLang, t }: { uiLang: Language; t: any }) {
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

  /* ---------- stagger helpers ---------- */
  const stagger = (i: number) => ({
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: 0.15 * i, duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  });

  const floatAnim = (delay: number, y: number = 12) => ({
    animate: { y: [0, -y, 0] },
    transition: { duration: 5 + delay, repeat: Infinity, ease: 'easeInOut' as const },
  });

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ==================== LEFT: Brand Panel ==================== */}
      <div className="relative hidden lg:flex lg:w-[52%] flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600">
        {/* Subtle grid pattern overlay */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Floating decorative shapes */}
        <motion.div
          {...floatAnim(0, 16)}
          className="absolute top-[12%] left-[14%] w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center"
        >
          <Globe className="w-8 h-8 text-white/70" />
        </motion.div>

        <motion.div
          {...floatAnim(1.2, 10)}
          className="absolute top-[22%] right-[18%] w-14 h-14 rounded-full bg-amber-400/20 backdrop-blur-sm border border-amber-300/30 flex items-center justify-center"
        >
          <Sparkles className="w-6 h-6 text-amber-200/80" />
        </motion.div>

        <motion.div
          {...floatAnim(0.6, 14)}
          className="absolute bottom-[18%] left-[20%] w-16 h-16 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center"
        >
          <MessageCircle className="w-7 h-7 text-white/60" />
        </motion.div>

        <motion.div
          {...floatAnim(2, 8)}
          className="absolute bottom-[30%] right-[12%] w-24 h-24 rounded-3xl bg-white/5 backdrop-blur-sm border border-white/10"
        />

        {/* Radial glow behind content */}
        <div className="absolute w-[500px] h-[500px] rounded-full bg-white/5 blur-3xl" />

        {/* Brand content */}
        <div className="relative z-10 text-center px-12 max-w-lg">
          <motion.div {...stagger(0)}>
            <div className="w-20 h-20 bg-white/15 backdrop-blur-sm rounded-3xl flex items-center justify-center mx-auto mb-8 border border-white/25 shadow-lg shadow-black/10">
              <Languages className="w-10 h-10 text-white" />
            </div>
          </motion.div>

          <motion.h1
            {...stagger(1)}
            className="text-5xl font-extrabold text-white mb-4 tracking-tight"
          >
            {t.appName}
          </motion.h1>

          <motion.p
            {...stagger(2)}
            className="text-xl text-blue-100 leading-relaxed font-medium"
          >
            {uiLang === 'zh'
              ? '中文打字，地道英文秒出'
              : 'Type Chinese, get native English instantly'}
          </motion.p>

          <motion.div
            {...stagger(3)}
            className="mt-10 flex items-center justify-center gap-3"
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-sm text-blue-100 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              AI-Powered
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-sm text-blue-100 backdrop-blur-sm">
              {uiLang === 'zh' ? '梗百科' : 'Meme Dictionary'}
            </span>
          </motion.div>
        </div>
      </div>

      {/* ==================== RIGHT: Login Form ==================== */}
      <div className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/50 px-5 py-10 sm:px-8 lg:px-16 relative">
        {/* Mobile-only top brand area */}
        <motion.div
          {...stagger(0)}
          className="lg:hidden text-center mb-8"
        >
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-600/25">
            <Languages className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            {t.appName}
            {IS_STAGING && (
              <span className="ml-2 align-middle px-2 py-0.5 bg-yellow-400 text-yellow-900 text-xs font-black rounded tracking-wider">
                STAGING
              </span>
            )}
          </h1>
          <p className="text-gray-500 mt-2 text-base leading-relaxed max-w-xs mx-auto">{t.tagline}</p>
        </motion.div>

        {/* Glass card container */}
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
          className="w-full max-w-[420px]"
        >
          <div className="glass-card rounded-3xl p-7 sm:p-9 shadow-[var(--shadow-card)]">
            {/* Desktop heading inside card */}
            <div className="hidden lg:block text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-1">
                {uiLang === 'zh' ? '欢迎回来' : 'Welcome back'}
                {IS_STAGING && (
                  <span className="ml-2 align-middle px-2 py-0.5 bg-yellow-400 text-yellow-900 text-[10px] font-black rounded tracking-wider">
                    STAGING
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-500">
                {uiLang === 'zh' ? '登录以继续使用 MemeFlow' : 'Sign in to continue to MemeFlow'}
              </p>
            </div>

            {/* ---- Main mode ---- */}
            {mode === 'main' ? (
              <div className="space-y-3">
                {/* Google sign-in — primary CTA */}
                <motion.button
                  {...stagger(2)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={signIn}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-600/25 text-[15px]"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff" fillOpacity=".9"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" fillOpacity=".7"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" fillOpacity=".5"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" fillOpacity=".6"/>
                  </svg>
                  {uiLang === 'zh' ? 'Google 账号登录' : 'Sign in with Google'}
                </motion.button>

                {/* Divider */}
                <div className="relative flex items-center my-4">
                  <div className="flex-1 border-t border-gray-200/80" />
                  <span className="px-4 text-xs text-gray-400 font-medium">{uiLang === 'zh' ? '其他方式' : 'or continue with'}</span>
                  <div className="flex-1 border-t border-gray-200/80" />
                </div>

                {/* Email sign-in — secondary */}
                <motion.button
                  {...stagger(3)}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => setMode('email')}
                  className="w-full bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 font-semibold py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2.5 text-sm shadow-sm"
                >
                  <Mail className="w-4 h-4 text-gray-500" />
                  {uiLang === 'zh' ? '邮箱登录 / 注册' : 'Sign in with Email'}
                </motion.button>

                {/* Invite code — tertiary, subtle */}
                <motion.button
                  {...stagger(4)}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => setMode('guest')}
                  className="w-full text-gray-400 hover:text-gray-600 font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {uiLang === 'zh' ? '内测邀请码' : 'Beta invite code'}
                </motion.button>
              </div>

            /* ---- Email mode ---- */
            ) : mode === 'email' ? (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                className="space-y-4"
              >
                <button
                  onClick={() => { setMode('main'); setError(''); setResetSent(false); }}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {uiLang === 'zh' ? '返回' : 'Back'}
                </button>

                <h3 className="text-lg font-bold text-gray-900">
                  {isSignUp
                    ? (uiLang === 'zh' ? '注册新账号' : 'Create Account')
                    : (uiLang === 'zh' ? '邮箱登录' : 'Sign In')}
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">
                    {uiLang === 'zh' ? '邮箱' : 'Email'}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/60 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1.5">
                    {uiLang === 'zh' ? '密码' : 'Password'}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isSignUp ? (uiLang === 'zh' ? '至少 6 位' : 'At least 6 characters') : '••••••'}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/60 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-gray-900 placeholder:text-gray-400"
                    onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()}
                  />
                </div>

                <button
                  onClick={handleEmailAuth}
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSignUp
                    ? (uiLang === 'zh' ? '注册' : 'Sign Up')
                    : (uiLang === 'zh' ? '登录' : 'Sign In')}
                </button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
                    className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  >
                    {isSignUp
                      ? (uiLang === 'zh' ? '已有账号？登录' : 'Have an account? Sign in')
                      : (uiLang === 'zh' ? '没有账号？注册' : 'No account? Sign up')}
                  </button>
                  {!isSignUp && (
                    <button
                      onClick={handleReset}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {uiLang === 'zh' ? '忘记密码' : 'Forgot password'}
                    </button>
                  )}
                </div>

                {resetSent && (
                  <p className="text-sm text-emerald-600 bg-emerald-50 rounded-xl px-4 py-2.5 border border-emerald-100">
                    {uiLang === 'zh' ? '重置邮件已发送，请查收' : 'Reset email sent, please check your inbox'}
                  </p>
                )}
                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5 border border-red-100">
                    {error}
                  </p>
                )}
              </motion.div>

            /* ---- Guest / invite code mode ---- */
            ) : mode === 'guest' ? (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
                className="space-y-4"
              >
                <button
                  onClick={() => { setMode('main'); setError(''); setGuestCode(''); }}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  {uiLang === 'zh' ? '返回' : 'Back'}
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
                  className="w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white/60 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all text-center text-lg tracking-[0.25em] font-mono text-gray-900 placeholder:text-gray-400 placeholder:tracking-normal placeholder:font-sans placeholder:text-base"
                  maxLength={10}
                  onKeyDown={(e) => e.key === 'Enter' && handleGuestLogin()}
                />

                <button
                  onClick={handleGuestLogin}
                  disabled={loading || !guestCode}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 text-white font-semibold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {uiLang === 'zh' ? '进入体验' : 'Enter'}
                </button>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-2.5 border border-red-100">
                    {error}
                  </p>
                )}
              </motion.div>
            ) : null}
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="mt-8 flex items-center gap-3 text-xs text-gray-400"
        >
          <span className="font-mono tabular-nums">v{APP_VERSION}</span>
          <span className="w-1 h-1 rounded-full bg-gray-300" />
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-semibold text-[10px] uppercase tracking-wider border border-blue-100">
            Beta
          </span>
          <span className="w-1 h-1 rounded-full bg-gray-300" />
          <span className="text-gray-400">{APP_ENV}</span>
        </motion.div>
      </div>
    </div>
  );
}
