// Middleware: auth session + CSRF protection.
//
// Runs on every request. Reads the Supabase auth session from cookies
// and attaches the user + profile to `locals` so pages and API routes
// can access them without re-querying.
//
// Also enforces origin-based CSRF protection on mutation requests.

import { createServerClient } from './lib/supabase.js';

export async function onRequest(context, next) {
  const { request, cookies, locals } = context;

  // --- Auth: read session from cookies ---
  const supabase = createServerClient(request, cookies);
  const { data: { user } } = await supabase.auth.getUser();

  // Attach to locals so pages/API routes can use them
  locals.supabase = supabase;
  locals.user = user || null;

  // If authenticated, fetch their profile (tier, household, display name)
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*, households(id, name)')
      .eq('id', user.id)
      .single();
    locals.profile = profile || null;
  } else {
    locals.profile = null;
  }

  // --- CSRF: same-origin check on mutations (fail CLOSED) ---
  // Astro's built-in checkOrigin is disabled (astro.config.mjs), so this is the
  // ONLY CSRF layer. The previous version only validated the Origin header when
  // it was present and let the request through when it was absent — fail-open,
  // so any forged request that omits Origin (and several browser flows do)
  // sailed past. Now every state-changing method must positively prove
  // same-origin; if we can't establish it, we reject.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const host = request.headers.get('host') ?? '';
    const proto = request.headers.get('x-forwarded-proto')
      ?? new URL(request.url).protocol.slice(0, -1);
    const expectedOrigin = `${proto}://${host}`;

    const origin = request.headers.get('origin');
    const secFetchSite = request.headers.get('sec-fetch-site');
    const referer = request.headers.get('referer');

    let sameOrigin = false;
    if (origin) {
      // Browsers send Origin on all mutating fetch/XHR and on cross-origin form
      // posts; an exact match is proof of same-origin.
      sameOrigin = origin === expectedOrigin;
    } else if (secFetchSite) {
      // No Origin, but Fetch Metadata states the request's relationship to the
      // site. Allow same-origin / same-site / direct navigation; a forged
      // cross-site POST reports 'cross-site' and is rejected.
      sameOrigin = secFetchSite === 'same-origin'
        || secFetchSite === 'same-site'
        || secFetchSite === 'none';
    } else if (referer) {
      // Last resort for older clients: validate the Referer host.
      try { sameOrigin = new URL(referer).host === host; } catch { sameOrigin = false; }
    }
    // No Origin, no Sec-Fetch-Site, no Referer → cannot prove same-origin → reject.

    if (!sameOrigin) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  return next();
}
