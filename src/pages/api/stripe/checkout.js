// POST /api/stripe/checkout
// Creates a Stripe Checkout session and returns the URL to redirect to.
// Accepts: { plan: 'monthly' | 'annual' }

import { createCheckoutSession } from '../../../lib/stripe.js';

export async function POST({ request, locals, url }) {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
  }

  try {
    const data = await request.formData();
    const plan = data.get('plan') || 'monthly';

    const priceId = plan === 'annual'
      ? import.meta.env.STRIPE_PRICE_ANNUAL
      : import.meta.env.STRIPE_PRICE_MONTHLY;

    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Price not configured' }), { status: 500 });
    }

    const returnUrl = new URL('/subscribe', url.origin).toString();
    const session = await createCheckoutSession(locals.user.email, priceId, returnUrl);

    // Redirect to Stripe Checkout
    return new Response(null, {
      status: 302,
      headers: { Location: session.url },
    });
  } catch (err) {
    console.error('Checkout error:', err);
    return new Response(JSON.stringify({ error: 'Failed to create checkout session' }), { status: 500 });
  }
}
