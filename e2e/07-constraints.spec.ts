import { test, expect } from '@playwright/test';

// Coverage scope — what these tests can and can't reach:
//
// CAN test (network/HTTP boundary): unauthenticated GETs/POSTs/DELETEs to
// the constraint API endpoints, and the unauthenticated /settings redirect.
//
// CAN'T test from here: authenticated /settings rendering, or end-to-end
// "add a constraint, see it persist" flows. The middleware reads a real
// Supabase session cookie that the test fixtures don't manufacture, so
// SSR pages always see locals.user as null. To cover the authenticated
// rendering, we'd need either (a) a session-cookie helper that round-trips
// through Supabase auth, or (b) a unit test runner (vitest/node:test) for
// the prompt builder, the validator, and the cooking-for resolver in
// isolation. Neither exists today; this file documents that gap.
//
// What IS covered elsewhere:
//   - 401 auth gates for /api/constraints + /api/guest/constraint
//     are in e2e/05-api-auth-gates.spec.ts.

test.describe('Dietary constraints — page-level access', () => {
  test('settings redirects to home when unauthenticated', async ({ page }) => {
    await page.goto('/settings');
    expect(page.url()).toMatch(/\/$/);
  });
});
