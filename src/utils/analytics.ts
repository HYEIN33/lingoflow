import { logEvent } from '../firebase';

/**
 * Track a user behavior event via Firebase Analytics.
 * Wraps firebase.ts logEvent with a consistent interface.
 * No-op when analytics is unavailable (SSR, test, etc.).
 */
export function trackEvent(name: string, params?: Record<string, string | number | boolean>) {
  logEvent(name, params);
}
