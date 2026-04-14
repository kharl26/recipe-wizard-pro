import { test, expect } from '@playwright/test';

/**
 * Static page tests — help and support/about pages render correctly
 * and contain the expected content.
 */

test.describe('Help page', () => {
  test('loads and shows key sections', async ({ page }) => {
    await page.goto('/help');
    await expect(page.locator('.content-page h1')).toContainText('How to use Recipe Wizard');
    // Key sections
    await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chatting with the Wizard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recipe display' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Free tier' })).toBeVisible();
  });

  test('uses "the Wizard" terminology, not "the AI"', async ({ page }) => {
    await page.goto('/help');
    // After the rebrand, "The AI" shouldn't appear as user-facing text.
    // Claude references in About/support are different — this is help only.
    const content = await page.locator('.content-page').textContent();
    expect(content).not.toMatch(/\bThe AI\b/);
    expect(content).toMatch(/the Wizard/);
  });

  test('shows 10 free generations per month, not 5', async ({ page }) => {
    await page.goto('/help');
    const content = await page.locator('.content-page').textContent();
    expect(content).toMatch(/10 free recipe generations/);
    expect(content).not.toMatch(/5 free recipe generations/);
  });

  test('suggestion form is present', async ({ page }) => {
    await page.goto('/help');
    await expect(page.locator('#help-suggestion-form')).toBeVisible();
    await expect(page.locator('#help-suggestion-form textarea')).toBeVisible();
  });
});

test.describe('About/Support page', () => {
  test('loads and shows cost transparency', async ({ page }) => {
    await page.goto('/support');
    await expect(page.locator('.content-page h1')).toContainText('About');
    await expect(page.getByRole('heading', { name: 'Why it costs money' })).toBeVisible();
    await expect(page.getByRole('heading', { name: "What's free, what's not" })).toBeVisible();
  });

  test('does NOT show specific per-request dollar amounts', async ({ page }) => {
    await page.goto('/support');
    const content = await page.locator('.content-page').textContent();
    // Per Bob's feedback, the specific $0.005 figure was removed
    expect(content).not.toMatch(/\$0\.005/);
    expect(content).not.toMatch(/half a cent/);
  });

  test('mentions Claude by Anthropic', async ({ page }) => {
    await page.goto('/support');
    const content = await page.locator('.content-page').textContent();
    expect(content).toMatch(/Claude/);
    expect(content).toMatch(/Anthropic/);
  });
});
