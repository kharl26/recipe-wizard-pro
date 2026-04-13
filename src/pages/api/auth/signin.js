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

    const { error } = await locals.supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: new URL('/auth/callback', request.url).toString(),
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
