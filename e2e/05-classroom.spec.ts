import { test, expect } from '@playwright/test';
import { loginAsGuest, dismissChangelogIfPresent, switchTab } from './helpers';

test('课堂同传：打开 tab、首次使用 compliance modal 或 config card 显示', async ({ page }) => {
  await loginAsGuest(page);
  await dismissChangelogIfPresent(page);
  await switchTab(page, /课堂|Classroom/);

  // Either compliance modal or the config-card (audio/mode/course 3 rows) visible
  const complianceOrConfig = page.locator('text=/首次使用须知|compliance|声音来源|audio|mode|mic|tab audio/').first();
  await expect(complianceOrConfig).toBeVisible({ timeout: 10_000 });
});
