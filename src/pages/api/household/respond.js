// POST /api/household/respond
// Accept or decline a household invite. On accept, moves the user to the
// new household and optionally carries over unique pantry items.
// Accepts: { invite_id, action: 'accept' | 'decline', carry_pantry: [...item names] }

import { createDB } from '../../../lib/db.js';
import { supabaseAdmin } from '../../../lib/supabase.js';

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  try {
    const body = await request.json();
    const { invite_id, action, carry_pantry = [] } = body;

    if (!invite_id || !['accept', 'decline'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
    }

    // Fetch the invite
    const { data: invite } = await locals.supabase
      .from('household_invites')
      .select('*')
      .eq('id', invite_id)
      .single();

    if (!invite || invite.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Invite not found or already handled' }), { status: 404 });
    }

    if (invite.invited_email !== locals.user.email) {
      return new Response(JSON.stringify({ error: 'This invite is not for you' }), { status: 403 });
    }

    // Update invite status
    await locals.supabase
      .from('household_invites')
      .update({ status: action === 'accept' ? 'accepted' : 'declined' })
      .eq('id', invite_id);

    if (action === 'decline') {
      return new Response(JSON.stringify({ ok: true, action: 'declined' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ACCEPT: move user to the new household
    const oldHouseholdId = locals.profile.household_id;
    const newHouseholdId = invite.household_id;

    // Carry over selected pantry items to the new household
    if (carry_pantry.length > 0 && supabaseAdmin) {
      const newDb = createDB(supabaseAdmin, { ...locals.profile, household_id: newHouseholdId });
      for (const item of carry_pantry) {
        await newDb.upsertPantryItem(item, null, 'certain', null, 'carried-from-previous');
      }
    }

    // Copy saved recipes to new household
    if (supabaseAdmin) {
      const { data: myBookmarks } = await supabaseAdmin
        .from('bookmarks')
        .select('recipe_json, notes')
        .eq('household_id', oldHouseholdId)
        .eq('saved_by', locals.user.id);

      if (myBookmarks && myBookmarks.length > 0) {
        const copies = myBookmarks.map(b => ({
          household_id: newHouseholdId,
          saved_by: locals.user.id,
          recipe_json: b.recipe_json,
          notes: b.notes,
          shared_by: null,
        }));
        await supabaseAdmin.from('bookmarks').insert(copies);
      }
    }

    // Move user's profile to the new household
    await locals.supabase
      .from('profiles')
      .update({ household_id: newHouseholdId })
      .eq('id', locals.user.id);

    // Move user's preferences to the new household
    await locals.supabase
      .from('preferences')
      .update({ household_id: newHouseholdId })
      .eq('user_id', locals.user.id);

    // Clean up old solo household if it's now empty
    if (supabaseAdmin) {
      const { count } = await supabaseAdmin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', oldHouseholdId);
      if (count === 0) {
        // Delete the empty household and its orphaned data
        await supabaseAdmin.from('pantry').delete().eq('household_id', oldHouseholdId);
        await supabaseAdmin.from('conversations').delete().eq('household_id', oldHouseholdId);
        await supabaseAdmin.from('households').delete().eq('id', oldHouseholdId);
      }
    }

    return new Response(JSON.stringify({ ok: true, action: 'accepted' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Invite response error:', err);
    return new Response(JSON.stringify({ error: 'Failed to process invite' }), { status: 500 });
  }
}
