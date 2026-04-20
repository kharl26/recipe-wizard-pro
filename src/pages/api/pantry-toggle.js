import { createDB } from '../../lib/db.js';

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ ok: false }), { status: 401 });
  }
  const db = createDB(locals.supabase, locals.profile);

  try {
    const body = await request.json();
    const item = body.item?.trim();
    const action = body.action;

    if (!item || !action) {
      return new Response('Missing item or action', { status: 400 });
    }

    await db.logActivity('pantry_toggle', { item, action });

    if (action === 'add') {
      await db.upsertPantryItem(item, null, 'certain', null, 'user-confirmed');
    } else if (action === 'remove') {
      const existing = await db.getPantryItemByName(item);
      if (existing) await db.updatePantryConfidence(existing.id, 'depleted');
    }

    return new Response(JSON.stringify({ ok: true, inPantry: action === 'add' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Pantry toggle error:', err);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
}
