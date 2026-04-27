import { test, expect } from '@playwright/test';
import { loginAsGuest, dismissChangelogIfPresent, switchTab } from './helpers';

test('复习页：打开后有卡面或 empty state / paywall', async ({ page }) => {
  await loginAsGuest(page);
  await dismissChangelogIfPresent(page);
  await switchTab(page, /复习|Review/);

  // Either a card stage, empty state, or paywall prompt — any of these means the route works
  const any = page.locator('text=/CARD|全部复习完|All caught up|升级 Pro|Upgrade/').first();
  await expect(any).toBeVisible({ timeout: 10_000 });
});
