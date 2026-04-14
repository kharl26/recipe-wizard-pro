// GET /api/account/export
// Download all user data as a JSON file. Lets a user take their data
// with them before deleting the account (GDPR-style right to portability).

import { createDB } from '../../../lib/db.js';

export async function GET({ locals }) {
  if (!locals.user || !locals.profile) {
    return new Response('Unauthorized', { status: 401 });
  }

  const db = createDB(locals.supabase, locals.profile);

  try {
    const [
      bookmarks,
      pantry,
      preferences,
      conversations,
      people,
    ] = await Promise.all([
      db.getBookmarks(),
      db.getPantry(),
      db.getPreferences(),
      db.getRecentConversations(1000),
      db.getPeople(),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      user: {
        id: locals.user.id,
        email: locals.user.email,
        created_at: locals.user.created_at,
      },
      profile: {
        display_name: locals.profile.display_name,
        experience: locals.profile.experience,
        wine_pairing: locals.profile.wine_pairing,
        tier: locals.profile.tier,
        notes: locals.profile.notes,
      },
      household_members: people,
      saved_recipes: bookmarks.map(b => ({
        recipe: b.recipe,
        saved_at: b.created_at,
        shared_by: b.shared_by,
        notes: b.notes,
      })),
      pantry: pantry.map(p => ({
        item: p.item,
        confidence: p.confidence,
        category: p.category,
        notes: p.notes,
      })),
      preferences: preferences.map(p => ({
        person: p.person_name,
        category: p.category,
        item: p.item,
        detail: p.detail,
      })),
      conversations: conversations.map(c => ({
        role: c.role,
        content: c.content,
        created_at: c.created_at,
      })),
    };

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="recipe-wizard-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    console.error('Export error:', err);
    return new Response('Export failed', { status: 500 });
  }
}
