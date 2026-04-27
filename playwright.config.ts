import { defineConfig, devices } from '@playwright/test';

/**
 * E2E test configuration.
 *
 * Coverage goal: 95% of critical user flows (not code lines).
 * Each spec in e2e/ exercises one self-contained user journey.
 *
 * Tests run against the live Vite dev server on :3000 (user already runs
 * it in the background). If not running, playwright will start one.
 * Real Firestore + auth are used — tests log in via the invite code
 * `8888` which creates an anonymous session (throw-away, no pollution of
 * real user data).
 *
 * Tests avoid triggering Gemini / Deepgram billed calls where possible:
 *   - translate test verifies UI reaction, not translation correctness
 *   - classroom test only opens the compliance modal (no mic start)
 *   - admin panel / payment flow / Cloud Functions are NOT covered in
 *     E2E (risk of touching prod data / real money)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,  // avoid auth race conditions (shared guest session)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,  // one browser instance, one user at a time
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Reuse already-running dev server (user's :3000). If not running, start it.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
