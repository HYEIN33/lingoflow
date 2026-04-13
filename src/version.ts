import pkg from '../package.json';

// Single source of truth for app version + environment tag, surfaced
// in the UI so you can tell at a glance which deploy you're looking at.
// Bumped by editing package.json version.
export const APP_VERSION: string = pkg.version;

// VITE_ENV is set to 'staging' at build time for preview channel builds
// (see npm run build:staging). Regular `npm run build` leaves it unset,
// which we treat as production. Use this to gate "STAGING" banners,
// Sentry environment, and any env-specific behavior.
export const APP_ENV: 'production' | 'staging' | 'development' = (() => {
  const raw = (import.meta.env.VITE_ENV as string | undefined) || '';
  if (raw === 'staging') return 'staging';
  if (import.meta.env.DEV) return 'development';
  return 'production';
})();

export const IS_STAGING = APP_ENV === 'staging';
export const IS_DEV = APP_ENV === 'development';
export const IS_PROD = APP_ENV === 'production';
