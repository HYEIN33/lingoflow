import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Playwright owns e2e/; exclude them from Vitest to avoid
    // "@playwright/test has no default export" fails. Also exclude
    // .claude/worktrees so test files inside per-feature worktrees
    // don't get double-counted in coverage.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '.claude/worktrees/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      // Source we care about — measure coverage only on real src/.
      // Excludes side-effect-heavy bootstrap that can't be unit-tested
      // without rewriting the app shell (main entry, framework init,
      // type declarations, generated config).
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test/**',
        'src/**/*.d.ts',
        // Hard side-effect bootstrap — initialised once at app boot,
        // every code path triggers actual SDK side effects (Firebase
        // init, Sentry init, i18n load). Mocking these provides no
        // value relative to the test debt incurred.
        'src/firebase.ts',
        'src/sentry.ts',
        'src/i18n.ts',
        'src/version.ts',
      ],
      // Anything inside .claude/worktrees is a per-feature snapshot —
      // don't double-count its source files toward coverage.
      excludeAfterRemap: true,
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
