// Supabase client helpers for Recipe Wizard Pro.
//
// Two clients:
//   - createServerClient(cookies): per-request client that respects the
//     user's auth session (read from cookies). Used by API routes and
//     pages. Enforces RLS — users only see their own data.
//   - supabaseAdmin: service-role client that bypasses RLS. Used ONLY
//     for admin operations (tier management, usage monitoring). Never
//     exposed to the browser.

import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

// Per-request client — reads auth session from request headers,
// writes session updates to Astro's cookies object.
// Pass both the Request object and Astro's cookies helper.
export function createServerClient(request, cookies) {
  return createSupabaseServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('cookie') ?? '');
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, {
            path: '/',
            ...options,
          });
        });
      },
    },
  });
}

// Admin client — bypasses RLS. For admin dashboard and tier management only.
export const supabaseAdmin = SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// Parse raw cookie header into the [{name, value}] format Supabase expects.
function parseCookieHeader(header) {
  if (!header) return [];
  return header.split(';').map(pair => {
    const [name, ...rest] = pair.trim().split('=');
    return { name: name?.trim(), value: rest.join('=')?.trim() };
  }).filter(c => c.name);
}
