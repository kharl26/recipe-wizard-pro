// POST /api/share
// Share a saved recipe with another user by email or display name.
// Copies the recipe into their household's bookmarks with a "shared_by" tag.
// Free to share — no generation cost.

import { createDB } from '../../lib/db.js';
import { supabaseAdmin } from '../../lib/supabase.js';

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500 });
  }

  try {
    const body = await request.json();
    const { bookmark_id, recipient } = body;

    if (!bookmark_id || !recipient) {
      return new Response(JSON.stringify({ error: 'Missing bookmark_id or recipient' }), { status: 400 });
    }

    // Get the recipe to share
    const db = createDB(locals.supabase, locals.profile);
    const bookmarks = await db.getBookmarks();
    const bookmark = bookmarks.find(b => b.id === bookmark_id);
    if (!bookmark) {
      return new Response(JSON.stringify({ error: 'Recipe not found' }), { status: 404 });
    }

    // Find the recipient by display name or email
    const recipientLower = recipient.trim().toLowerCase();
    let recipientProfile = null;

    // Try display_name first
    const { data: byName } = await supabaseAdmin
      .from('profiles')
      .select('id, household_id, display_name')
      .ilike('display_name', recipientLower)
      .limit(1)
      .single();

    if (byName) {
      recipientProfile = byName;
    } else {
      // Try email
      const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
      const recipientUser = users.find(u => u.email?.toLowerCase() === recipientLower);
      if (recipientUser) {
        const { data: byId } = await supabaseAdmin
          .from('profiles')
          .select('id, household_id, display_name')
          .eq('id', recipientUser.id)
          .single();
        recipientProfile = byId;
      }
    }

    if (!recipientProfile) {
      return new Response(JSON.stringify({ error: 'User not found. Check the email or display name.' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (recipientProfile.id === locals.user.id) {
      return new Response(JSON.stringify({ error: "That's you — you already have this recipe!" }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    await db.logActivity('recipe_shared', { title: bookmark.recipe.title, recipient: recipientProfile.display_name || recipient });

    // Copy the recipe to the recipient's household
    const sharedBy = locals.profile.display_name || locals.user.email;
    await supabaseAdmin.from('bookmarks').insert({
      household_id: recipientProfile.household_id,
      saved_by: recipientProfile.id,
      recipe_json: bookmark.recipe,
      shared_by: sharedBy,
    });

    // Notify the recipient
    await supabaseAdmin.from('notifications').insert({
      user_id: recipientProfile.id,
      type: 'share',
      title: 'Recipe shared with you',
      body: `${sharedBy} shared "${bookmark.recipe.title}" with you. Check your Saved tab!`,
      metadata: { recipe_title: bookmark.recipe.title },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Share error:', err);
    return new Response(JSON.stringify({ error: 'Failed to share recipe' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
