// POST /api/stripe/portal
// Create a Stripe Customer Portal session and redirect the user there.
// The portal is hosted by Stripe — users can view invoices, update
// payment methods, and manage their subscription there.

import { stripe } from '../../../lib/stripe.js';

export async function POST({ locals, url }) {
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!stripe) {
    return new Response('Stripe not configured', { status: 500 });
  }

  try {
    // Find the customer by email
    const customers = await stripe.customers.list({ email: locals.user.email, limit: 1 });
    if (customers.data.length === 0) {
      return new Response('No Stripe customer record found', { status: 404 });
    }
    const customerId = customers.data[0].id;

    const returnUrl = new URL('/subscribe', url.origin).toString();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return new Response(null, {
      status: 302,
      headers: { Location: session.url },
    });
  } catch (err) {
    console.error('Portal error:', err);
    return new Response('Failed to open customer portal: ' + err.message, { status: 500 });
  }
}
