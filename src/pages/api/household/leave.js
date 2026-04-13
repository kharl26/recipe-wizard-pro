// POST /api/household/leave
// Leave the current household (self) or remove another member.
// Creates a new solo household for the departed person.
// Notifies both parties.
// Accepts: { member_id? } — if omitted, the current user leaves.

import { createDB } from '../../../lib/db.js';
import { supabaseAdmin } from '../../../lib/supabase.js';

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ error: 'Admin client not configured' }), { status: 500 });
  }

  try {
    const body = await request.json();
    const targetId = body.member_id || locals.user.id;
    const isSelf = targetId === locals.user.id;
    const oldHouseholdId = locals.profile.household_id;

    // Verify the target is in the same household
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, display_name, household_id')
      .eq('id', targetId)
      .single();

    if (!targetProfile || targetProfile.household_id !== oldHouseholdId) {
      return new Response(JSON.stringify({ error: 'Member not found in your household' }), { status: 404 });
    }

    // Create a new solo household for the departing member
    const { data: newHousehold } = await supabaseAdmin
      .from('households')
      .insert({ name: null })
      .select('id')
      .single();

    // Copy the departing member's saved recipes
    const { data: theirBookmarks } = await supabaseAdmin
      .from('bookmarks')
      .select('recipe_json, notes')
      .eq('household_id', oldHouseholdId)
      .eq('saved_by', targetId);

    if (theirBookmarks && theirBookmarks.length > 0) {
      await supabaseAdmin.from('bookmarks').insert(
        theirBookmarks.map(b => ({
          household_id: newHousehold.id,
          saved_by: targetId,
          recipe_json: b.recipe_json,
          notes: b.notes,
        }))
      );
    }

    // Move the member to the new household
    await supabaseAdmin
      .from('profiles')
      .update({ household_id: newHousehold.id })
      .eq('id', targetId);

    // Move their preferences
    await supabaseAdmin
      .from('preferences')
      .update({ household_id: newHousehold.id })
      .eq('user_id', targetId)
      .eq('household_id', oldHouseholdId);

    // Notify the departing member
    const requesterName = locals.profile.display_name || locals.user.email;
    const targetName = targetProfile.display_name || targetId.slice(0, 8);

    if (isSelf) {
      // Self-removal: notify remaining members
      const { data: remaining } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('household_id', oldHouseholdId)
        .neq('id', targetId);

      for (const member of (remaining || [])) {
        await supabaseAdmin.from('notifications').insert({
          user_id: member.id,
          type: 'removal',
          title: 'Household member left',
          body: `${requesterName} has left the household. Their preferences and saved recipes have been preserved in their new personal household.`,
          metadata: { left_user_id: targetId },
        });
      }
    } else {
      // Removal by another member: notify both
      await supabaseAdmin.from('notifications').insert({
        user_id: targetId,
        type: 'removal',
        title: 'Removed from household',
        body: `${requesterName} removed you from the household. Your preferences and saved recipes have been preserved in your new personal household.`,
        metadata: { removed_by: locals.user.id },
      });

      // CC the requester
      await supabaseAdmin.from('notifications').insert({
        user_id: locals.user.id,
        type: 'removal',
        title: 'Member removed',
        body: `You removed ${targetName} from the household. They have been notified.`,
        metadata: { removed_user_id: targetId },
      });
    }

    return new Response(JSON.stringify({ ok: true, self: isSelf }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Leave/remove error:', err);
    return new Response(JSON.stringify({ error: 'Failed to process' }), { status: 500 });
  }
}
