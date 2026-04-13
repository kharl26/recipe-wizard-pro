// POST /api/auth/signin
// Sends a magic link email to the provided address.
// Returns JSON with success/error status.

export async function POST({ request, locals }) {
  try {
    const data = await request.formData();
    const email = data.get('email')?.toString().trim().toLowerCase();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build the redirect URL from the Site URL env var (or x-forwarded
    // headers on Vercel) instead of request.url, which can resolve to
    // an internal hostname and produce localhost links.
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const origin = import.meta.env.PUBLIC_SITE_URL || `${proto}://${host}`;
    const redirectTo = `${origin}/auth/callback`;

    const { error } = await locals.supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (error) {
      console.error('Sign-in error:', error.message);
      return new Response(JSON.stringify({ error: 'Failed to send magic link' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Sign-in error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
