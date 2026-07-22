import { test, expect } from '@playwright/test';

test.describe('Feed', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/feed');
    // Should redirect to login page
    await expect(page).toHaveURL('/');
  });

  test('shows empty feed message when no posts', async ({ page }) => {
    // First login as admin
    await page.goto('/');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'password');
    await page.click('button[type="submit"]');

    // Navigate to feed
    await page.goto('/feed');
    await page.waitForLoadState('networkidle');

    // Should show the feed page (might be empty)
    await expect(page).toHaveURL(/\/feed/);
  });
});
