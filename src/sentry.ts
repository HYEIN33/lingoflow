import * as Sentry from '@sentry/react';

export function initSentry() {
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN || '',
      integrations: [Sentry.browserTracingIntegration()],
      // Error-level events: 100% (we're low-traffic, full fidelity is fine)
      sampleRate: 1.0,
      // Performance traces: 50% (still bounded but lets us see most bugs)
      tracesSampleRate: 0.5,
      // VITE_ENV lets us distinguish production from future staging channels
      // without rebuilding. Falls back to Vite's MODE (which is 'production'
      // for any vite build). Set VITE_ENV=staging in preview deploy env.
      environment: (import.meta.env.VITE_ENV as string) || import.meta.env.MODE,
      // Release tag helps Sentry group errors by deploy. Vite replaces
      // this at build time if VITE_RELEASE is set.
      release: (import.meta.env.VITE_RELEASE as string) || undefined,
    });
  }
}
