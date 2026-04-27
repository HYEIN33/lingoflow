import { Page, expect } from '@playwright/test';

/**
 * Log in with the beta invite code flow (anonymous Firebase auth).
 * Shared setup for all E2E tests — avoids creating real email accounts.
 */
export async function loginAsGuest(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle').catch(() => {});
  // If we landed in an ErrorBoundary (rare flaky Firebase init race between
  // tests), click Retry to recover before trying to log in.
  const retryBtn = page.locator('button', { hasText: /^Retry$|^重试$/ });
  if (await retryBtn.count() > 0 && await retryBtn.first().isVisible().catch(() => false)) {
    await retryBtn.first().click().catch(() => {});
    await page.waitForTimeout(500);
  }
  // If already authed (reused browser state), skip login
  const isAlreadyIn = await page.locator('button[aria-label="我的"], button[aria-label="Profile"]').count() > 0;
  if (isAlreadyIn) return;

  // Click the "Beta Access (Invite Code)" / "内测体验（邀请码）" main CTA button
  // to switch mode → 'guest' and reveal the invite code input.
  const betaButton = page.locator('button', {
    hasText: /内测体验|Beta Access/,
  }).first();
  await betaButton.click({ timeout: 10_000 });

  // Fill invite code 8888
  const input = page.locator('input[placeholder*="邀请码"], input[placeholder*="invite"]').first();
  await input.waitFor({ timeout: 10_000 });
  await input.fill('8888');
  // Click the continue / 进入体验 button
  await page.locator('button', { hasText: /进入体验|进入|Enter$/ }).first().click();
  // Wait for main app to load — the primary tab bar with 翻译 / Translate
  await page.locator('button').filter({ hasText: /^翻译$|^Translate$/ }).first().waitFor({ timeout: 20_000 });
  // Dismiss the first-time SlangOnboarding wizard if it pops up
  await dismissOnboardingIfPresent(page);
}

/** Skip the first-time slang contribution onboarding wizard. */
export async function dismissOnboardingIfPresent(page: Page) {
  const skip = page.locator('button').filter({ hasText: /^Skip$|^跳过$|Skip/ }).first();
  if (await skip.count() > 0) {
    await skip.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

/** Dismiss the changelog toast if it appears. */
export async function dismissChangelogIfPresent(page: Page) {
  const close = page.locator('button').filter({ hasText: /^知道了$|^Got it$/ }).first();
  if (await close.count() > 0) {
    await close.click({ timeout: 2000 }).catch(() => {});
  }
}

/** Click a top-level tab by its label. */
export async function switchTab(page: Page, labelRegex: RegExp) {
  await page.locator('button').filter({ hasText: labelRegex }).first().click();
}
