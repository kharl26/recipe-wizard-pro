import { test, expect } from '@playwright/test';
import { mockSignIn } from './helpers';

/**
 * Sign-in flow tests.
 * Verifies the magic-link request flow and error handling.
 */

test.describe('Sign-in flow', () => {
  test('submitting email shows success message', async ({ page }) => {
    await mockSignIn(page);
    await page.goto('/');
    await page.locator('.signin-trigger').first().click();
    await page.locator('.signin-input').fill('test@example.com');
    await page.locator('.signin-btn').click();

    // Status message shows success
    await expect(page.locator('#signin-status')).toContainText('Check your email', { timeout: 3000 });
    await expect(page.locator('.signin-btn')).toContainText('Link sent');
  });

  test('invalid email is rejected by the browser', async ({ page }) => {
    await page.goto('/');
    await page.locator('.signin-trigger').first().click();
    await page.locator('.signin-input').fill('notanemail');
    await page.locator('.signin-btn').click();

    // Browser's native validation prevents submission; input is :invalid
    await expect(page.locator('.signin-input:invalid')).toBeVisible();
  });

  test('rate-limit error message is shown to the user', async ({ page }) => {
    await mockSignIn(page, { success: false, error: 'Too many sign-in attempts. Please wait about an hour before trying again.' });
    await page.goto('/');
    await page.locator('.signin-trigger').first().click();
    await page.locator('.signin-input').fill('test@example.com');
    await page.locator('.signin-btn').click();

    await expect(page.locator('#signin-status')).toContainText('Too many sign-in attempts', { timeout: 3000 });
  });

  test('Supabase sender note is visible in the modal', async ({ page }) => {
    await page.goto('/');
    await page.locator('.signin-trigger').first().click();
    // Case-insensitive match — text contains "supabase.io" (lowercase)
    await expect(page.locator('.signin-note')).toContainText(/supabase/i);
  });
});
