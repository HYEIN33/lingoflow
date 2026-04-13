import { useState } from 'react';
import { motion } from 'motion/react';
import { LogIn, Loader2, Languages } from 'lucide-react';
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

  return (
    <div className="min-h-screen bg-white sm:bg-[#F8F9FA] flex flex-col items-center justify-center p-4 sm:p-6 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-none sm:shadow-xl p-6 sm:p-10 border-0 sm:border sm:border-gray-100"
      >
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-6 sm:mb-8">
          <Languages className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600" />
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
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-blue-200"
            >
              <LogIn className="w-5 h-5" />
              {uiLang === 'zh' ? 'Google 账号登录' : 'Sign in with Google'}
            </button>
            <button
              onClick={() => setMode('email')}
              className="w-full bg-white hover:bg-blue-50 text-blue-600 border-2 border-blue-200 hover:border-blue-400 font-semibold py-4 rounded-2xl transition-all flex items-center justify-center gap-3"
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
            <button onClick={() => { setMode('main'); setError(''); setResetSent(false); }} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              ← {uiLang === 'zh' ? '返回' : 'Back'}
            </button>
            <h3 className="text-lg font-bold text-gray-900">
              {isSignUp ? (uiLang === 'zh' ? '注册新账号' : 'Create Account') : (uiLang === 'zh' ? '邮箱登录' : 'Sign In')}
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{uiLang === 'zh' ? '邮箱' : 'Email'}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{uiLang === 'zh' ? '密码' : 'Password'}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignUp ? (uiLang === 'zh' ? '至少 6 位' : 'At least 6 characters') : '••••••'}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleEmailAuth()} />
            </div>
            <button onClick={handleEmailAuth} disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isSignUp ? (uiLang === 'zh' ? '注册' : 'Sign Up') : (uiLang === 'zh' ? '登录' : 'Sign In')}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button onClick={() => { setIsSignUp(!isSignUp); setError(''); }} className="text-blue-600 hover:text-blue-700 font-medium">
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
        ) : mode === 'guest' ? (
          <div className="space-y-4 text-left">
            <button onClick={() => { setMode('main'); setError(''); setGuestCode(''); }} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              ← {uiLang === 'zh' ? '返回' : 'Back'}
            </button>
            <h3 className="text-lg font-bold text-gray-900">{uiLang === 'zh' ? '内测体验' : 'Beta Access'}</h3>
            <p className="text-sm text-gray-500">{uiLang === 'zh' ? '输入邀请码即可体验全部功能' : 'Enter invite code to access all features'}</p>
            <input type="text" value={guestCode} onChange={(e) => setGuestCode(e.target.value)}
              placeholder={uiLang === 'zh' ? '请输入邀请码' : 'Enter invite code'}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-center text-lg tracking-widest"
              maxLength={10} onKeyDown={(e) => e.key === 'Enter' && handleGuestLogin()} />
            <button onClick={handleGuestLogin} disabled={loading || !guestCode}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {uiLang === 'zh' ? '进入体验' : 'Enter'}
            </button>
            {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
