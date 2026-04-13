// POST /api/stripe/cancel
// Sets the user's subscription to cancel at period end.
// POST with action=reactivate to undo the cancellation.

import { cancelSubscription, reactivateSubscription } from '../../../lib/stripe.js';

export async function POST({ request, locals }) {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  try {
    const data = await request.formData();
    const action = data.get('action') || 'cancel';

    let sub;
    if (action === 'reactivate') {
      sub = await reactivateSubscription(locals.user.email);
    } else {
      sub = await cancelSubscription(locals.user.email);
    }

    if (!sub) {
      return new Response(JSON.stringify({ error: 'No active subscription found' }), { status: 404 });
    }

    // Redirect back to the subscribe page to see updated status
    return new Response(null, {
      status: 302,
      headers: { Location: '/subscribe' },
    });
  } catch (err) {
    console.error('Cancel/reactivate error:', err);
    return new Response(JSON.stringify({ error: 'Failed to update subscription' }), { status: 500 });
  }
}
