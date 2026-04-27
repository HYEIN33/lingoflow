import * as Sentry from '@sentry/react';
import { APP_VERSION } from './version';

/**
 * Sentry initialization. Only runs in production builds AND only when a DSN
 * is configured — an empty DSN silently drops events, which used to make
 * developers think Sentry was working when it wasn't. Now we skip init and
 * log a visible warning instead.
 *
 * Release tag: defaults to the app's package version (e.g. "0.3.0"). Sentry
 * groups errors by release so you can tell which deploy introduced a bug.
 * Override with VITE_RELEASE at build time (e.g. `VITE_RELEASE=0.3.0-rc1
 * npm run build`).
 */
export function initSentry() {
  if (!import.meta.env.PROD) return;

  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined) || '';
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.warn(
      '[sentry] VITE_SENTRY_DSN not set — error reporting is disabled. ' +
        'Errors will be logged to the browser console only. ' +
        'Set the DSN in .env.local (dev) or via your deploy env (prod).',
    );
    return;
  }

  Sentry.init({
    dsn,
    integrations: [Sentry.browserTracingIntegration()],
    sampleRate: 1.0,
    tracesSampleRate: 0.5,
    environment: (import.meta.env.VITE_ENV as string) || import.meta.env.MODE,
    release: (import.meta.env.VITE_RELEASE as string) || `memeflow@${APP_VERSION}`,
  });
}
