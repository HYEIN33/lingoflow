import { test, expect } from '@playwright/test';
import { loginAsGuest, dismissChangelogIfPresent } from './helpers';

test('个人页：avatar + 名字 + subscription 卡 + 数据导出可见', async ({ page }) => {
  await loginAsGuest(page);
  await dismissChangelogIfPresent(page);

  // Click top-right avatar button (profile)
  await page.locator('button[aria-label="我的"], button[aria-label="Profile"]').first().click();

  // Name heading appears
  await expect(page.locator('h1').first()).toBeVisible();

  // Subscription card text
  await expect(page.locator('text=/订阅|subscription|Free|Pro/').first()).toBeVisible();

  // Data export card
  await expect(page.locator('text=/导出我的数据|Export my data/').first()).toBeVisible();
});
