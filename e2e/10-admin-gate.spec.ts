import { test, expect } from '@playwright/test';
import { loginAsGuest, dismissChangelogIfPresent } from './helpers';

/**
 * Admin gate safety test.
 *
 * The admin panel is dual-gated:
 *   1. URL must have `?admin`
 *   2. auth.currentUser must have `admin: true` custom claim OR
 *      users/{uid}.role === 'admin'
 *
 * A non-admin user appending `?admin` to the URL should NOT see the admin
 * panel — they should see the normal main app. This verifies the gate.
 *
 * We don't test admin-granted flows in E2E because they'd mutate production
 * Firestore. Admin write operations (approve/reject/ban/import/export)
 * are covered by security-rules tests and manual QA with a real admin.
 */
test('管理员 gate：非 admin 用户加 ?admin URL 看不到管理后台', async ({ page }) => {
  await loginAsGuest(page);
  await dismissChangelogIfPresent(page);

  // Navigate to ?admin as the current (non-admin, anonymous guest) user
  await page.goto('/?admin');
  await page.waitForLoadState('networkidle').catch(() => {});

  // Admin panel landmarks should NOT be visible — they're gated behind
  // isAdminUser state. Guest user sees the normal main app tabs instead.
  const adminHeaderTexts = [
    /管理员面板|Admin Panel|MemeFlow 管理后台/,
    /待审核|Pending/,
  ];

  // At least one of the main-app tabs should be visible (proves we're NOT
  // in admin panel, we fell through to normal app)
  await expect(page.locator('button').filter({ hasText: /^翻译$|^Translate$/ }).first())
    .toBeVisible({ timeout: 10_000 });

  // Admin-specific heading should NOT appear
  // (It's fine if some of these words appear in the normal app — we pick the
  // most admin-specific: "MemeFlow 管理后台" or "Admin Panel" exactly)
  const adminHeading = page.locator('text=/MemeFlow 管理后台|MemeFlow Admin Panel/').first();
  expect(await adminHeading.count()).toBe(0);
});
