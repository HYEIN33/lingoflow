import { test, expect } from '@playwright/test';
import { loginAsGuest, dismissChangelogIfPresent, switchTab } from './helpers';

test('拍照翻译菜单：点相机图标弹出「拍照 / 从相册选取」', async ({ page }) => {
  await loginAsGuest(page);
  await dismissChangelogIfPresent(page);
  await switchTab(page, /^翻译$|^Translate$/);

  // Camera icon button (title="图片翻译" or "Image Translate")
  const cameraBtn = page.locator('button[title*="图片翻译"], button[title*="Image Translate"], button[title*="拍照翻译"], button[title*="Photo Translate"]').first();
  await cameraBtn.click();

  // Menu with two items
  await expect(page.locator('text=/^拍照$|Take photo/').first()).toBeVisible();
  await expect(page.locator('text=/从相册选取|Choose from library/').first()).toBeVisible();
});
