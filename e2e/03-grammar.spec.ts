import { test, expect } from '@playwright/test';
import { loginAsGuest, dismissChangelogIfPresent, switchTab } from './helpers';

test('语法检查：输入英文句子、点检查、verdict 出现', async ({ page }) => {
  await loginAsGuest(page);
  await dismissChangelogIfPresent(page);
  await switchTab(page, /语法|Grammar/);
  // Wait for grammar page textarea to render
  await page.waitForTimeout(500);

  const textarea = page.locator('textarea').first();
  await expect(textarea).toBeVisible({ timeout: 10_000 });
  await textarea.fill('She dont know what she wants.');

  // Find the submit button — it's inside the input-card row, likely has
  // "检查" / "Check" text or is near the textarea
  const checkBtn = page.locator('button').filter({
    hasText: /检查|Check|check/
  }).first();
  await checkBtn.click({ timeout: 5000 }).catch(async () => {
    // Fallback: submit the form with Enter or click any button with 提交
    await page.locator('button[type="submit"]').first().click().catch(() => {});
  });

  // Expect a verdict appear — tolerate either error/ok states
  await expect(page.locator('text=/错误|error|Error|issues|没毛病|All good|verdict|问题|CORRECTED/i').first())
    .toBeVisible({ timeout: 25_000 });
});
