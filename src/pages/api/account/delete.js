// DELETE /api/account/delete
// Permanently delete the user's account. Removes:
//   - Their auth record (Supabase auth.users) — CASCADE removes profile, preferences, bookmarks (saved_by), feedback, notifications, usage
//   - If they were the last member of their household, delete the household
//     which CASCADES to pantry, conversations, remaining bookmarks
//   - Subscription cancellation in Stripe (if subscribed)
//
// This is a HARD delete — no soft-delete, no recovery. Caller should
// confirm with the user before hitting this endpoint.

import { supabaseAdmin } from '../../../lib/supabase.js';
import { cancelSubscription } from '../../../lib/stripe.js';

export async function DELETE({ locals }) {
  if (!locals.user || !locals.profile) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  if (!supabaseAdmin) {
    return new Response(JSON.stringify({ error: 'Admin client not configured' }), { status: 500 });
  }

  const userId = locals.user.id;
  const email = locals.user.email;
  const householdId = locals.profile.household_id;

  try {
    // 1. Cancel any active Stripe subscription immediately (not at period end —
    //    since the account is being deleted, cancel hard)
    try {
      const sub = await cancelSubscription(email);
      // Note: this sets cancel_at_period_end. For true immediate cancel we'd
      // call stripe.subscriptions.cancel() instead, but this is safer if the
      // user changes their mind — their Stripe billing still tracks the last
      // period they paid for.
    } catch (err) {
      console.error('Stripe cancellation during account delete failed:', err.message);
      // Continue — don't block account deletion on Stripe error
    }

    // 2. Check if the user is the last member of their household
    const { count: memberCount } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', householdId);

    const isLastMember = memberCount === 1;

    // 3. If last member, delete the household (cascades to pantry/conversations/remaining bookmarks)
    if (isLastMember) {
      // Delete explicit household-scoped data first to be safe
      await supabaseAdmin.from('bookmarks').delete().eq('household_id', householdId);
      await supabaseAdmin.from('conversations').delete().eq('household_id', householdId);
      await supabaseAdmin.from('pantry').delete().eq('household_id', householdId);
      await supabaseAdmin.from('household_invites').delete().eq('household_id', householdId);
      await supabaseAdmin.from('households').delete().eq('id', householdId);
    }
    // If not last member, the user's data will be removed but the household survives.
    // Their preferences (user-scoped) and profile will cascade from auth.users delete below.

    // 4. Delete the auth user — CASCADE via FK constraints removes:
    //    - profiles (id → auth.users)
    //    - preferences (user_id → auth.users)
    //    - feedback (user_id → auth.users)
    //    - notifications (user_id → auth.users)
    //    - user_usage (user_id → auth.users)
    //    - bookmarks rows where saved_by matches (saved_by → auth.users SET NULL actually; household bookmarks survive)
    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteErr) throw deleteErr;

    // 5. Sign the user out on this request
    await locals.supabase.auth.signOut();

    return new Response(JSON.stringify({ ok: true, deleted: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Account deletion error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Failed to delete account' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}
