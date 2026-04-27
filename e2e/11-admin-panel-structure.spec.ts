import { test, expect } from '@playwright/test';
import { loginAsGuest, dismissChangelogIfPresent } from './helpers';

/**
 * Admin panel structure test (DEV-only bypass).
 *
 * Uses ?admin&bypass=DEV_ADMIN to skip the real admin claim check. Only works
 * against the Vite dev server (import.meta.env.DEV === true). In production
 * builds the bypass is tree-shaken away — this test would fall back to the
 * normal app and fail, which is the correct guard.
 *
 * Coverage:
 *   - All 6 admin tabs render (pending / reported / browse / import / export / repair)
 *   - Import textarea + button visible
 *   - Export "download JSON" button visible
 *   - Repair "scan data issues" button visible
 */
test('管理员面板结构（DEV bypass）：6 tab + 关键按钮可见', async ({ page }) => {
  await loginAsGuest(page);
  await dismissChangelogIfPresent(page);
  await page.goto('/?admin&bypass=DEV_ADMIN');
  await page.waitForLoadState('networkidle').catch(() => {});

  // 6 tabs visible — all should render as tab buttons in the header bar
  const tabLabels: Array<[RegExp]> = [
    [/待审核|Pending/],
    [/举报|Reported/],
    [/浏览全部|Browse/],
    [/^导入$|^Import$/],
    [/^导出$|^Export$/],
    [/修复数据|Repair/],
  ];
  for (const [pattern] of tabLabels) {
    await expect(
      page.locator('button').filter({ hasText: pattern }).first()
    ).toBeVisible({ timeout: 10_000 });
  }

  // Switch to Import tab — textarea should render
  await page.locator('button').filter({ hasText: /^导入$|^Import$/ }).first().click();
  await expect(page.locator('textarea').first()).toBeVisible({ timeout: 5_000 });

  // Switch to Export tab — download button should appear
  await page.locator('button').filter({ hasText: /^导出$|^Export$/ }).first().click();
  await expect(
    page.locator('button').filter({ hasText: /下载 JSON|Download JSON/ }).first()
  ).toBeVisible({ timeout: 5_000 });

  // Switch to Repair tab — "scan" button should appear
  await page.locator('button').filter({ hasText: /修复数据|Repair/ }).first().click();
  await expect(
    page.locator('button').filter({ hasText: /扫描数据问题|Scan data issues/ }).first()
  ).toBeVisible({ timeout: 5_000 });
});
