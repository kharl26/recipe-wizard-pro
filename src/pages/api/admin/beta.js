// POST /api/admin/beta
// Toggle a user's beta_tester flag. Admin only.
// Accepts: { user_id, beta_tester: true | false }

import { supabaseAdmin } from '../../../lib/supabase.js';

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile || locals.profile.tier !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ error: 'Admin client not configured' }), { status: 500 });
  }

  try {
    const { user_id, beta_tester } = await request.json();
    if (!user_id || typeof beta_tester !== 'boolean') {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ beta_tester })
      .eq('id', user_id);

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Beta toggle error:', err);
    return new Response(JSON.stringify({ error: 'Failed to update beta status' }), { status: 500 });
  }
}
