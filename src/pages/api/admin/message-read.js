// POST /api/admin/message-read — mark a user message as read. Admin only.
import { supabaseAdmin } from '../../../lib/supabase.js';

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile || locals.profile.tier !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }
  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ error: 'Admin client not configured' }), { status: 500 });
  }
  try {
    const { id } = await request.json();
    if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
    await supabaseAdmin.from('user_messages').update({ read: true }).eq('id', id);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Mark read error:', err);
    return new Response(JSON.stringify({ error: 'Failed' }), { status: 500 });
  }
}
