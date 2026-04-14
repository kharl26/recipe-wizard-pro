import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Recipe Wizard Pro.
 * - Auto-starts the Astro dev server before tests
 * - Runs tests from e2e/ directory
 * - Uses Chromium only (faster; add Firefox/WebKit later if needed)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,  // tests share a dev server; serial avoids flakiness
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4326',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx astro dev --port 4326',
    url: 'http://localhost:4326',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // Provide minimal env so dev server starts; tests mock all
      // network calls that actually need real credentials.
      PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
      PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-service-key',
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'test-anthropic-key',
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk_test_fake',
      PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_fake',
      STRIPE_PRICE_MONTHLY: process.env.STRIPE_PRICE_MONTHLY || 'price_monthly_fake',
      STRIPE_PRICE_ANNUAL: process.env.STRIPE_PRICE_ANNUAL || 'price_annual_fake',
      PUBLIC_SITE_URL: 'http://localhost:4326',
    },
  },
});
