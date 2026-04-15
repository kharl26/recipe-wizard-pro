// POST /api/guest/merge
// Merge a household guest profile into a registered user in the same
// household. Transfers all the guest's preferences to the user and marks
// the guest as converted. After this, the guest no longer appears in
// household rosters — they're "become" the registered user.

import { supabaseAdmin } from '../../../lib/supabase.js';

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ error: 'Admin client not configured' }), { status: 500 });
  }

  try {
    const { guest_id, user_id } = await request.json();
    if (!guest_id || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing guest_id or user_id' }), { status: 400 });
    }

    const householdId = locals.profile.household_id;

    // Verify guest is in the caller's household
    const { data: guest } = await supabaseAdmin
      .from('household_guests')
      .select('*')
      .eq('id', guest_id)
      .eq('household_id', householdId)
      .single();
    if (!guest) {
      return new Response(JSON.stringify({ error: 'Guest not found' }), { status: 404 });
    }
    if (guest.converted_to_user_id) {
      return new Response(JSON.stringify({ error: 'Guest already converted' }), { status: 400 });
    }

    // Verify target user is in the same household
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name')
      .eq('id', user_id)
      .eq('household_id', householdId)
      .single();
    if (!targetProfile) {
      return new Response(JSON.stringify({ error: 'Target user not found in your household' }), { status: 404 });
    }

    // Transfer preferences: set user_id, clear guest_id
    const { data: guestPrefs } = await supabaseAdmin
      .from('preferences')
      .select('id')
      .eq('guest_id', guest_id);
    if (guestPrefs && guestPrefs.length > 0) {
      await supabaseAdmin
        .from('preferences')
        .update({ user_id, guest_id: null })
        .eq('guest_id', guest_id);
    }

    // Mark the guest as converted (preserves historical record)
    await supabaseAdmin
      .from('household_guests')
      .update({ converted_to_user_id: user_id })
      .eq('id', guest_id);

    // Optionally copy display_name from guest to profile if profile has none
    if (!targetProfile.display_name && guest.display_name) {
      await supabaseAdmin
        .from('profiles')
        .update({ display_name: guest.display_name })
        .eq('id', user_id);
    }

    return new Response(JSON.stringify({
      ok: true,
      transferred: guestPrefs?.length || 0,
    }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Merge error:', err);
    return new Response(JSON.stringify({ error: 'Failed to merge' }), { status: 500 });
  }
}
