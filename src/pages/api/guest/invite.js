// POST /api/guest/invite
// Invite a household guest to register as a real user. Creates a
// household_invite + records the pending conversion so after they sign up
// their guest preferences can be transferred.
//
// Two-step flow: (1) this endpoint sends the invite; (2) after they
// sign up, an admin or any household member triggers the merge via
// /api/guest/merge, pointing the new user_id at the guest_id.

import { supabaseAdmin } from '../../../lib/supabase.js';

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ error: 'Admin client not configured' }), { status: 500 });
  }

  try {
    const { guest_id, email } = await request.json();
    const cleanEmail = email?.trim().toLowerCase();
    if (!guest_id || !cleanEmail) {
      return new Response(JSON.stringify({ error: 'Missing guest_id or email' }), { status: 400 });
    }

    const { data: guest } = await supabaseAdmin
      .from('household_guests')
      .select('*')
      .eq('id', guest_id)
      .eq('household_id', locals.profile.household_id)
      .single();
    if (!guest) {
      return new Response(JSON.stringify({ error: 'Guest not found in your household' }), { status: 404 });
    }
    if (guest.converted_to_user_id) {
      return new Response(JSON.stringify({ error: 'Guest already converted' }), { status: 400 });
    }

    // Create a household invite so auto-trigger places them in this household on signup
    await supabaseAdmin.from('household_invites').insert({
      household_id: locals.profile.household_id,
      invited_by: locals.user.id,
      invited_email: cleanEmail,
      status: 'pending',
    });

    return new Response(JSON.stringify({
      ok: true,
      message: `Invite queued for ${cleanEmail}. After they sign up, use the "Merge with registered account" option on the guest to transfer their preferences.`,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Guest invite error:', err);
    return new Response(JSON.stringify({ error: 'Failed to send invite' }), { status: 500 });
  }
}
