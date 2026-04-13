// Stripe client for Recipe Wizard Pro.
//
// Handles subscription checks, checkout session creation, and
// cancellation. Queries the Stripe API directly each time rather
// than maintaining a local subscription database — simpler for v1,
// per Flavio's recommendation.

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = import.meta.env.STRIPE_SECRET_KEY;

export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY)
  : null;

// Retrieve the active subscription for a customer email.
// Returns the subscription object if active/trialing, null otherwise.
export async function getActiveSubscription(email) {
  if (!stripe || !email) return null;
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length === 0) return null;
  const customer = customers.data[0];
  const subs = await stripe.subscriptions.list({
    customer: customer.id,
    status: 'active',
    limit: 1,
  });
  if (subs.data.length > 0) return subs.data[0];
  // Also check trialing
  const trialing = await stripe.subscriptions.list({
    customer: customer.id,
    status: 'trialing',
    limit: 1,
  });
  return trialing.data.length > 0 ? trialing.data[0] : null;
}

// Check if a user is a paying subscriber.
export async function isSubscriber(email) {
  const sub = await getActiveSubscription(email);
  return !!sub;
}

// Create a Stripe Checkout session for subscribing.
// priceId: the Stripe Price ID (monthly or annual).
// returnUrl: where to redirect after checkout.
export async function createCheckoutSession(email, priceId, returnUrl) {
  if (!stripe) throw new Error('Stripe not configured');
  // Find or create the Stripe customer
  let customers = await stripe.customers.list({ email, limit: 1 });
  let customer;
  if (customers.data.length > 0) {
    customer = customers.data[0];
  } else {
    customer = await stripe.customers.create({ email });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: returnUrl,
  });
  return session;
}

// Cancel a subscription at period end (don't cancel immediately).
export async function cancelSubscription(email) {
  const sub = await getActiveSubscription(email);
  if (!sub) return null;
  return await stripe.subscriptions.update(sub.id, {
    cancel_at_period_end: true,
  });
}

// Reactivate a subscription that was set to cancel at period end.
export async function reactivateSubscription(email) {
  const sub = await getActiveSubscription(email);
  if (!sub) return null;
  return await stripe.subscriptions.update(sub.id, {
    cancel_at_period_end: false,
  });
}
