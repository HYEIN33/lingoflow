import * as Sentry from '@sentry/react';

/**
 * Factory for category-scoped breadcrumb + warn pairs. Each subsystem
 * (live session, AI translation, etc.) gets its own pair so Sentry
 * events carry meaningful provenance.
 *
 * All helpers swallow throws — if Sentry isn't initialised (dev), the
 * call is a cheap no-op rather than breaking the caller.
 */
export function makeSentry(category: string, component = category) {
  return {
    breadcrumb(message: string, data?: Record<string, unknown>) {
      try {
        Sentry.addBreadcrumb({ category, level: 'info', message, data });
      } catch { /* sentry not initialised */ }
    },
    warn(message: string, data?: Record<string, unknown>) {
      try {
        Sentry.captureMessage(message, {
          level: 'warning',
          tags: { component },
          extra: data,
        });
      } catch { /* sentry not initialised */ }
    },
  };
}
