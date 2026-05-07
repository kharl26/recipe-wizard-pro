// POST /api/constraints — add (or replace) a dietary constraint for the current user
// DELETE /api/constraints?id=xxx — remove a constraint
//
// v1 is self-only: any constraint added/removed via these endpoints belongs
// to the authenticated user. Resident-scoped constraints will get a separate
// endpoint at /api/guest/constraint.js in a later phase.

import { createDB } from '../../lib/db.js';

const VALID_METRICS = new Set(['calories', 'sodium_mg', 'carbs_g', 'fat_g', 'protein_g', 'fiber_g']);
const VALID_OPS = new Set(['lte', 'gte']);

function jsonResp(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile) {
    return jsonResp({ error: 'Unauthorized' }, 401);
  }
  const db = createDB(locals.supabase, locals.profile);
  try {
    const { metric, op, value, note } = await request.json();
    if (!metric || !op || value === undefined || value === null) {
      return jsonResp({ error: 'Missing fields' }, 400);
    }
    if (!VALID_METRICS.has(metric)) {
      return jsonResp({ error: 'Invalid metric' }, 400);
    }
    if (!VALID_OPS.has(op)) {
      return jsonResp({ error: 'Invalid op' }, 400);
    }
    const numValue = Number(value);
    if (!Number.isInteger(numValue) || numValue < 0 || numValue > 10000) {
      return jsonResp({ error: 'Value must be an integer between 0 and 10000' }, 400);
    }
    const cleanNote = (typeof note === 'string' && note.trim()) ? note.trim().slice(0, 200) : null;

    await db.addConstraint(locals.user.id, metric, op, numValue, cleanNote);
    return jsonResp({ ok: true });
  } catch (err) {
    console.error('Add constraint error:', err);
    return jsonResp({ error: 'Failed' }, 500);
  }
}

export async function DELETE({ url, locals }) {
  if (!locals.user || !locals.profile) {
    return jsonResp({ error: 'Unauthorized' }, 401);
  }
  try {
    const id = url.searchParams.get('id');
    if (!id) return jsonResp({ error: 'Missing id' }, 400);
    // RLS ensures the user can only delete their own constraints (or, when
    // we extend this for guests, household-managed guest constraints).
    await locals.supabase.from('dietary_constraints').delete().eq('id', id);
    return jsonResp({ ok: true });
  } catch (err) {
    console.error('Remove constraint error:', err);
    return jsonResp({ error: 'Failed' }, 500);
  }
}
