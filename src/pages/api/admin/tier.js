// POST /api/admin/tier
// Update a user's tier. Admin only.
// Accepts: { user_id, tier: 'free' | 'friend' | 'subscriber' | 'admin' }

import { supabaseAdmin } from '../../../lib/supabase.js';

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile || locals.profile.tier !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ error: 'Admin client not configured' }), { status: 500 });
  }

  try {
    const { user_id, tier } = await request.json();
    const valid = ['free', 'friend', 'subscriber', 'admin'];
    if (!user_id || !valid.includes(tier)) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ tier })
      .eq('id', user_id);

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Tier update error:', err);
    return new Response(JSON.stringify({ error: 'Failed to update tier' }), { status: 500 });
  }
}
