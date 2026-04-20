// POST /api/household/profile
// Update the current user's profile fields (display_name, experience,
// wine_pairing). Also handles marking notifications as read.

import { createDB } from '../../../lib/db.js';

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const db = createDB(locals.supabase, locals.profile);

  try {
    const body = await request.json();

    // Handle notification mark-read (piggyback on this endpoint for simplicity)
    if (body.mark_notification_read) {
      await db.markNotificationRead(body.mark_notification_read);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update profile fields
    const update = {};
    if ('display_name' in body) {
      const name = body.display_name?.trim() || null;
      if (name && (name.length < 3 || name.length > 30)) {
        return new Response(JSON.stringify({ error: 'Display name must be 3-30 characters' }), {
          status: 400, headers: { 'Content-Type': 'application/json' },
        });
      }
      update.display_name = name;
    }
    if ('experience' in body) {
      const valid = ['novice', 'beginner', 'intermediate', 'experienced', 'expert'];
      if (valid.includes(body.experience)) update.experience = body.experience;
    }
    if ('wine_pairing' in body) {
      update.wine_pairing = !!body.wine_pairing;
    }
    if ('show_photos' in body) {
      update.show_photos = !!body.show_photos;
    }

    if (Object.keys(update).length > 0) {
      const { error } = await locals.supabase
        .from('profiles')
        .update(update)
        .eq('id', locals.user.id);

      if (error) {
        // Unique constraint on display_name
        if (error.code === '23505') {
          return new Response(JSON.stringify({ error: 'That display name is already taken' }), {
            status: 409, headers: { 'Content-Type': 'application/json' },
          });
        }
        throw error;
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Profile update error:', err);
    return new Response(JSON.stringify({ error: 'Failed to update profile' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
