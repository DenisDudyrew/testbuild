import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('shows login page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Логин')).toBeVisible();
    await expect(page.getByText('Регистрация')).toBeVisible();
  });

  test('shows error on invalid login', async ({ page }) => {
    await page.goto('/');

    await page.fill('input[name="username"]', 'nonexistent');
    await page.fill('input[name="password"]', 'wrong');
    await page.click('button[type="submit"]');

    await expect(page.getByText('Invalid credentials')).toBeVisible();
  });

  test('shows registration form and validates fields', async ({ page }) => {
    await page.goto('/');
    await page.click('text=Регистрация');

    // Try to submit with empty fields
    await page.click('button[type="submit"]');

    await expect(page.getByText('Логин должен быть')).toBeVisible();
  });
});
