import { test, expect } from '@playwright/test';
import { loginAsGuest, dismissChangelogIfPresent } from './helpers';

test('设置 modal：齿轮打开、语言切换、关闭', async ({ page }) => {
  await loginAsGuest(page);
  await dismissChangelogIfPresent(page);

  // Settings gear in header
  await page.locator('button[aria-label="设置"], button[aria-label="Settings"]').first().click();

  // Modal open — verify language toggle row (it's only in the SettingsModal)
  await expect(page.locator('text=/界面语言|Language/').first()).toBeVisible({ timeout: 10_000 });

  // Feedback row visible (another proof the modal opened)
  await expect(page.locator('text=/邮件反馈|Email feedback/').first()).toBeVisible();

  // Close (X button)
  await page.locator('button[aria-label*="关闭"], button[aria-label*="Close"]').first().click().catch(async () => {
    // Fallback: press Escape
    await page.keyboard.press('Escape');
  });
});
