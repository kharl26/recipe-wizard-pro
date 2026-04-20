import { createDB } from '../../lib/db.js';

export async function DELETE({ locals }) {
  if (!locals.user || !locals.profile) {
    return new Response('Unauthorized', { status: 401 });
  }
  const db = createDB(locals.supabase, locals.profile);
  try {
    await db.logActivity('chat_cleared');
    await db.clearConversations();
    return new Response(null, { status: 204 });
  } catch (err) {
    console.error('Clear conversations error:', err);
    return new Response('Failed to clear conversations', { status: 500 });
  }
}
