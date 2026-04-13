// POST /api/household/invite
// Sends a household invite to an email address. If the person already has
// an account, they get a notification. If not, the invite is queued and
// auto-accepted when they sign up via magic link.

import { createDB } from '../../../lib/db.js';
import { supabaseAdmin } from '../../../lib/supabase.js';

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  const db = createDB(locals.supabase, locals.profile);

  try {
    const data = await request.formData();
    const email = data.get('email')?.toString().trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Valid email required' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    if (email === locals.user.email) {
      return new Response(JSON.stringify({ error: "You can't invite yourself" }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create the invite
    const invite = await db.sendInvite(email);

    // Check if the invitee already has an account — send them a notification
    if (supabaseAdmin) {
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', (await supabaseAdmin.auth.admin.listUsers()).data.users.find(u => u.email === email)?.id)
        .single();

      if (existingProfile) {
        const inviterName = locals.profile.display_name || locals.user.email;
        await supabaseAdmin.from('notifications').insert({
          user_id: existingProfile.id,
          type: 'invite',
          title: 'Household invitation',
          body: `${inviterName} invited you to join their household.`,
          metadata: { invite_id: invite.id, household_id: locals.profile.household_id },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, invite }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Invite error:', err);
    return new Response(JSON.stringify({ error: 'Failed to send invite' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
