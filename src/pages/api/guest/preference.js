// POST /api/guest/preference — add a preference for a guest
// DELETE /api/guest/preference?id=xxx — remove a preference

import { createDB } from '../../../lib/db.js';

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const db = createDB(locals.supabase, locals.profile);
  try {
    const { guest_id, category, item, detail } = await request.json();
    if (!guest_id || !category || !item) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 });
    }
    const valid = ['do_not_use', 'use_sparingly', 'prefer', 'substitute', 'general', 'allergy'];
    if (!valid.includes(category)) {
      return new Response(JSON.stringify({ error: 'Invalid category' }), { status: 400 });
    }
    await db.addPreference(guest_id, category, item, detail || null, 'manual-guest-add');
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Add guest preference error:', err);
    return new Response(JSON.stringify({ error: 'Failed' }), { status: 500 });
  }
}

export async function DELETE({ url, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  try {
    const id = url.searchParams.get('id');
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
    // RLS ensures we can only delete preferences from our own household
    await locals.supabase.from('preferences').delete().eq('id', id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Remove guest preference error:', err);
    return new Response(JSON.stringify({ error: 'Failed' }), { status: 500 });
  }
}
