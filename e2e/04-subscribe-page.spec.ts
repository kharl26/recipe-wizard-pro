import { test, expect } from '@playwright/test';

/**
 * Subscribe page tests.
 * Unauthenticated users hitting /subscribe should be redirected home.
 * (Deeper subscriber/cancel state tests need full auth mocking, which is
 * covered in a separate subscription test file once we have it set up.)
 */

test.describe('Subscribe page (logged out)', () => {
  test('redirects to home when unauthenticated', async ({ page }) => {
    const response = await page.goto('/subscribe');
    // Either we're redirected to home or we see home content
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.landing-hero')).toBeVisible();
  });
});
