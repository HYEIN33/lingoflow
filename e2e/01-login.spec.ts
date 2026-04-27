import { test, expect } from '@playwright/test';
import { loginAsGuest } from './helpers';

test('登录流程：邀请码 8888 可以进入主应用', async ({ page }) => {
  await loginAsGuest(page);
  // Verify we see the main tab bar — at least the 翻译 tab is visible
  await expect(page.locator('button').filter({ hasText: /^翻译$|^Translate$/ }).first()).toBeVisible();
  // Verify one more tab is rendered (梗百科 or 单词本 or 复习)
  await expect(page.locator('button').filter({ hasText: /梗百科|Slang|单词本|Wordbook|复习|Review/ }).first()).toBeVisible();
});
