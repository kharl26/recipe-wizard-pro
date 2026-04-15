// POST /api/guest — add a household guest (non-registered member)
// PATCH /api/guest?id=xxx — update guest fields
// DELETE /api/guest?id=xxx — remove guest

import { createDB } from '../../../lib/db.js';

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const db = createDB(locals.supabase, locals.profile);
  try {
    const body = await request.json();
    const name = body.name?.trim();
    if (!name || name.length < 1 || name.length > 30) {
      return new Response(JSON.stringify({ error: 'Name is required (1-30 chars)' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const guest = await db.addGuest(
      name,
      body.experience || 'beginner',
      !!body.wine_pairing,
      body.notes || null,
    );
    return new Response(JSON.stringify({ ok: true, guest }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Add guest error:', err);
    return new Response(JSON.stringify({ error: 'Failed to add guest' }), { status: 500 });
  }
}

export async function PATCH({ request, url, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const db = createDB(locals.supabase, locals.profile);
  try {
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
    const fields = await request.json();
    await db.updateGuest(id, fields);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Update guest error:', err);
    return new Response(JSON.stringify({ error: 'Failed to update guest' }), { status: 500 });
  }
}

export async function DELETE({ url, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const db = createDB(locals.supabase, locals.profile);
  try {
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
    await db.removeGuest(id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Remove guest error:', err);
    return new Response(JSON.stringify({ error: 'Failed to remove guest' }), { status: 500 });
  }
}
