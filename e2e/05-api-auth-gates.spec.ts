import { test, expect } from '@playwright/test';

/**
 * API auth-gate tests.
 * Unauthenticated requests to protected endpoints must be rejected.
 * This is the server-side defense that prevents bypassing the UI.
 */

test.describe('API auth gates', () => {
  test('GET /api/account/export returns 401 when unauthenticated', async ({ request }) => {
    const resp = await request.get('/api/account/export');
    expect(resp.status()).toBe(401);
  });

  test('POST /api/chat returns error HTML when unauthenticated', async ({ request }) => {
    const resp = await request.post('/api/chat', {
      form: { message: 'hello', bookmark_mode: 'include' },
    });
    // Returns 200 with an HTML error message (HTMX-friendly)
    expect(resp.status()).toBe(200);
    const body = await resp.text();
    expect(body).toContain('Please sign in');
  });

  test('POST /api/pantry returns 401 when unauthenticated', async ({ request }) => {
    const resp = await request.post('/api/pantry', {
      form: { item: 'test-item' },
    });
    expect(resp.status()).toBe(401);
  });

  test('POST /api/bookmarks returns 401 when unauthenticated', async ({ request }) => {
    const resp = await request.post('/api/bookmarks', {
      form: { recipe: JSON.stringify({ title: 'test' }) },
    });
    expect(resp.status()).toBe(401);
  });

  test('DELETE /api/conversations returns 401 when unauthenticated', async ({ request }) => {
    const resp = await request.delete('/api/conversations');
    expect(resp.status()).toBe(401);
  });

  test('POST /api/household/invite returns 401 when unauthenticated', async ({ request }) => {
    const resp = await request.post('/api/household/invite', {
      form: { email: 'test@example.com' },
    });
    expect(resp.status()).toBe(401);
  });

  test('DELETE /api/account/delete returns 401 when unauthenticated', async ({ request }) => {
    const resp = await request.delete('/api/account/delete');
    expect(resp.status()).toBe(401);
  });

  test('POST /api/stripe/checkout returns 401 when unauthenticated', async ({ request }) => {
    const resp = await request.post('/api/stripe/checkout', {
      form: { plan: 'monthly' },
    });
    expect(resp.status()).toBe(401);
  });
});
