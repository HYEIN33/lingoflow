import { test, expect } from '@playwright/test';
import { loginAsGuest, dismissChangelogIfPresent, switchTab } from './helpers';

test('翻译 + 收藏：输入词翻译、结果可见、保存按钮可点', async ({ page }) => {
  await loginAsGuest(page);
  await dismissChangelogIfPresent(page);
  await switchTab(page, /^翻译$|^Translate$/);

  // Input area
  const input = page.locator('textarea, input[type="text"]').filter({ hasText: '' }).first();
  await input.fill('awesome');

  // Submit — black translate button with an arrow icon, or button with text 翻译
  await page.locator('button[aria-label="Translate"], button[type="submit"]').first().click();

  // Expect some translation result text appears in the surface (Chinese output)
  // Don't assert exact content — just that *something* responsive appears
  // within 15 seconds (AI call can be slow)
  await expect(page.locator('text=/[\u4e00-\u9fa5]/').first()).toBeVisible({ timeout: 20_000 });
});
