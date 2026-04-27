import { test, expect } from '@playwright/test';
import { loginAsGuest, dismissChangelogIfPresent, switchTab } from './helpers';

test('梗百科搜索：输入关键词、搜索框接受输入', async ({ page }) => {
  await loginAsGuest(page);
  await dismissChangelogIfPresent(page);
  await switchTab(page, /梗百科|Slang/);

  const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="Search"]').first();
  await expect(searchInput).toBeVisible();
  await searchInput.fill('rizz');

  // Typeahead dropdown or trending list should respond — wait 1s for debounce
  await page.waitForTimeout(1500);
  // At minimum the input value is what we typed
  await expect(searchInput).toHaveValue('rizz');
});
