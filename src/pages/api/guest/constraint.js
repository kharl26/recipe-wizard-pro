// POST /api/guest/constraint — add/replace a dietary constraint for a resident
// DELETE /api/guest/constraint?id=xxx — remove a constraint
//
// Resident-scoped counterpart to /api/constraints (which is self-only). Any
// household member can manage any resident's constraints, gated by RLS via
// the household_id check on dietary_constraints rows.

import { createDB } from '../../../lib/db.js';

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
    const { guest_id, metric, op, value, note } = await request.json();
    if (!guest_id || !metric || !op || value === undefined || value === null) {
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

    // db.addConstraint detects guest vs user by lookup; for guest-id callers
    // we still pass through this path so the same UNIQUE-key upsert works.
    await db.addConstraint(guest_id, metric, op, numValue, cleanNote);
    return jsonResp({ ok: true });
  } catch (err) {
    console.error('Add resident constraint error:', err);
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
    await locals.supabase.from('dietary_constraints').delete().eq('id', id);
    return jsonResp({ ok: true });
  } catch (err) {
    console.error('Remove resident constraint error:', err);
    return jsonResp({ error: 'Failed' }, 500);
  }
}
