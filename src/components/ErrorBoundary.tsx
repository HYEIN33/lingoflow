import { Component, ReactNode } from 'react';
import * as Sentry from '@sentry/react';

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
            {isQuota ? copy.quotaBody : (uiLang === 'zh' ? '遇到了技术问题，请稍后重试。如果问题持续存在，请刷新页面。' : 'A technical issue occurred. Please try again later.')}
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
