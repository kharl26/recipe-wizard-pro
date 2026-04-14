import { test, expect } from '@playwright/test';

/**
 * Homepage (logged-out) tests.
 * Verifies the landing page renders and the sign-in flow is discoverable.
 */

test.describe('Homepage (logged out)', () => {
  test('landing page renders with hero and features', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Recipe Wizard/);
    await expect(page.locator('h1')).toContainText('Recipe Wizard');
    // Landing hero
    await expect(page.locator('.landing-hero h2')).toBeVisible();
    await expect(page.locator('.landing-features')).toBeVisible();
    // Three feature blocks
    await expect(page.locator('.landing-feature')).toHaveCount(3);
  });

  test('sign-in button is visible and opens the modal', async ({ page }) => {
    await page.goto('/');
    // Header has a Sign in button
    const signInBtn = page.locator('.signin-trigger').first();
    await expect(signInBtn).toBeVisible();

    // Click it — modal appears
    await signInBtn.click();
    await expect(page.locator('.signin-modal')).toBeVisible();
    await expect(page.locator('.signin-modal h2')).toContainText('Sign in');
    await expect(page.locator('.signin-input')).toBeVisible();
    await expect(page.locator('.signin-btn')).toBeVisible();
  });

  test('modal closes when × is clicked', async ({ page }) => {
    await page.goto('/');
    await page.locator('.signin-trigger').first().click();
    await expect(page.locator('.signin-modal')).toBeVisible();

    await page.locator('.signin-modal .modal-close').click();
    await expect(page.locator('.signin-modal')).not.toBeVisible();
  });

  test('Help and About links are accessible when logged out', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.header-link').filter({ hasText: 'Help' })).toBeVisible();
    await expect(page.locator('.header-link').filter({ hasText: 'About' })).toBeVisible();
  });
});
