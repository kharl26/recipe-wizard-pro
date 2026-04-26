// POST /api/changelog-seen
// Mark the changelog as seen by updating the user's changelog_seen timestamp.

export async function POST({ locals }) {
  if (!locals.user || !locals.profile) {
    return new Response('Unauthorized', { status: 401 });
  }

  await locals.supabase
    .from('profiles')
    .update({ changelog_seen: new Date().toISOString() })
    .eq('id', locals.user.id);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
