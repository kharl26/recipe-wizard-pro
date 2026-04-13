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
  const supabase = createServerClient(cookies);
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

  // --- CSRF: origin check on mutations ---
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin) {
      const host = request.headers.get('host') ?? '';
      const proto = request.headers.get('x-forwarded-proto')
        ?? new URL(request.url).protocol.slice(0, -1);
      if (origin !== `${proto}://${host}`) {
        return new Response('Forbidden', { status: 403 });
      }
    }
  }

  return next();
}
