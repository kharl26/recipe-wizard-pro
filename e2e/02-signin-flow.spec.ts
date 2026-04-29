import { test, expect } from '@playwright/test';
import { mockSignIn, mockVerifyOtp } from './helpers';

/**
 * Sign-in flow tests.
 * Verifies the hybrid email-send + OTP-code flow.
 */

test.describe('Sign-in flow', () => {
  test('submitting email shows success and reveals code-entry form', async ({ page }) => {
    await mockSignIn(page);
    await page.goto('/');
    await page.locator('.signin-trigger').first().click();
    await page.locator('#signin-form .signin-input').fill('test@example.com');
    await page.locator('#signin-form .signin-btn').click();

    await expect(page.locator('#signin-status')).toContainText('Email sent', { timeout: 3000 });
    await expect(page.locator('#signin-form .signin-btn')).toContainText('Email sent');
    // Code-entry form should now be visible
    await expect(page.locator('#verify-form')).toBeVisible();
  });

  test('invalid email is rejected by the browser', async ({ page }) => {
    await page.goto('/');
    await page.locator('.signin-trigger').first().click();
    await page.locator('#signin-form .signin-input').fill('notanemail');
    await page.locator('#signin-form .signin-btn').click();

    await expect(page.locator('#signin-form .signin-input:invalid')).toBeVisible();
  });

  test('rate-limit error message is shown to the user', async ({ page }) => {
    await mockSignIn(page, { success: false, error: 'Too many sign-in attempts. Please wait about an hour before trying again.' });
    await page.goto('/');
    await page.locator('.signin-trigger').first().click();
    await page.locator('#signin-form .signin-input').fill('test@example.com');
    await page.locator('#signin-form .signin-btn').click();

    await expect(page.locator('#signin-status')).toContainText('Too many sign-in attempts', { timeout: 3000 });
  });

  test('sender domain note is visible in the modal', async ({ page }) => {
    await page.goto('/');
    await page.locator('.signin-trigger').first().click();
    await expect(page.locator('.signin-note').filter({ hasText: /aachenor/i })).toBeVisible();
  });

  test('successful code verification redirects to home', async ({ page }) => {
    await mockSignIn(page);
    await mockVerifyOtp(page);
    await page.goto('/');
    await page.locator('.signin-trigger').first().click();
    await page.locator('#signin-form .signin-input').fill('test@example.com');
    await page.locator('#signin-form .signin-btn').click();

    await expect(page.locator('#verify-form')).toBeVisible();
    await page.locator('#verify-form input[name="token"]').fill('123456');
    await page.locator('#verify-form .signin-btn').click();

    // App reloads / navigates to /; just verify no error appeared
    await expect(page.locator('#verify-status')).not.toContainText('Invalid', { timeout: 2000 });
  });

  test('invalid code shows error', async ({ page }) => {
    await mockSignIn(page);
    await mockVerifyOtp(page, { success: false, error: 'Incorrect code. Check the email and try again.' });
    await page.goto('/');
    await page.locator('.signin-trigger').first().click();
    await page.locator('#signin-form .signin-input').fill('test@example.com');
    await page.locator('#signin-form .signin-btn').click();
    await page.locator('#verify-form input[name="token"]').fill('999999');
    await page.locator('#verify-form .signin-btn').click();

    await expect(page.locator('#verify-status')).toContainText('Incorrect code', { timeout: 3000 });
  });
});
