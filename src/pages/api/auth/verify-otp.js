// POST /api/auth/verify-otp
// Verifies a 6-digit code that was emailed to the user.
// Establishes a session via Set-Cookie on success.

export async function POST({ request, locals }) {
  try {
    const data = await request.formData();
    const email = data.get('email')?.toString().trim().toLowerCase();
    const token = data.get('token')?.toString().trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!token || !/^\d{6}$/.test(token)) {
      return new Response(JSON.stringify({ error: 'Code must be 6 digits' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { error } = await locals.supabase.auth.verifyOtp({
      email,
      token,
      type: 'email',
    });

    if (error) {
      console.error('Verify OTP error:', error.message, error.status);
      let userMessage = 'Invalid or expired code. Request a new one.';
      const msg = error.message?.toLowerCase() || '';
      if (msg.includes('expired')) {
        userMessage = 'This code has expired. Request a new one.';
      } else if (msg.includes('invalid')) {
        userMessage = 'Incorrect code. Check the email and try again.';
      } else if (msg.includes('rate limit')) {
        userMessage = 'Too many attempts. Please wait about an hour and request a new code.';
      }
      return new Response(JSON.stringify({ error: userMessage }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
