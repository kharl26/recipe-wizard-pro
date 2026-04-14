// POST /api/message
// Store a user message/suggestion for the admin to review.
// Accepts: { context, message }
// context: 'deletion' | 'help' | 'support' | 'general'

import { supabaseAdmin } from '../../lib/supabase.js';

export async function POST({ request, locals }) {
  try {
    const body = await request.json();
    const context = body.context || 'general';
    const message = body.message?.trim();

    if (!message || message.length < 2) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (message.length > 500) {
      return new Response(JSON.stringify({ error: 'Message too long (max 500 chars)' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    const valid = ['deletion', 'help', 'support', 'general'];
    if (!valid.includes(context)) {
      return new Response(JSON.stringify({ error: 'Invalid context' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Use admin client so we can record messages even during account
    // deletion when the RLS context may be about to disappear.
    if (!supabaseAdmin) {
      return new Response(JSON.stringify({ error: 'Server not configured' }), { status: 500 });
    }

    await supabaseAdmin.from('user_messages').insert({
      user_id: locals.user?.id || null,
      user_email: locals.user?.email || null,
      context,
      message,
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Message send error:', err);
    return new Response(JSON.stringify({ error: 'Failed to send message' }), { status: 500 });
  }
}
