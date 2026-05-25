# Recipe Wizard Pro — Multi-User Paid Recipe App

## What is this?
Live at **https://recipewizard.aachenor.com** — the active production app Bob and Alice use for daily cooking. Multi-user version of Recipe Wizard with authentication, household management, and subscription billing. Week 7 bootcamp project.

The personal single-user Recipe Wizard (Week 5) has been retired and archived at `~/Documents/4TBSSD/recipe-wizard-old/` — do not modify it. All development happens here.

## Status (2026-05-06)
- **Deployed**: Vercel free tier, auto-deploys on git push to main
- **Domain**: recipewizard.aachenor.com (live)
- **Stripe**: sandbox/test mode (flip to live when ready for real charges)
- **Users**: Bob (admin) + Alice (friend); household `97cf39fb-fe90-4bcf-ab50-ce75d8b87c17`
- **Tests**: 35 Playwright tests, all passing

## Tech Stack
- Astro 5 SSR (`@astrojs/vercel` adapter)
- HTMX + Alpine.js
- Supabase (PostgreSQL + Auth + RLS) — project `lfzjpzpxndykomrxugon`
- Stripe (subscriptions: $2/month or $20/year + Customer Portal)
- Anthropic Claude Haiku 4.5 (recipe generation)
- Vercel (hosting)
- Playwright (testing)

## Development
```bash
cd ~/Documents/4TBSSD/recipe-wizard-pro
npx astro dev --port 4326
```
Note: port 4326 so it doesn't conflict with the old personal instance (4325) if it ever comes back up.

## Running tests
```bash
npx playwright test               # headless
npx playwright test --ui          # interactive
```

## Deployment
Vercel auto-deploys on push to `main`. Environment variables are configured in Vercel dashboard.

## Architecture
```
src/
  lib/
    supabase.js        # Per-request auth client (createServerClient) + admin client
    stripe.js          # Checkout, subscription status, cancel/reactivate, portal
    db.js              # createDB(supabase, profile) factory — all queries household-scoped
    ai.js              # System prompt builder, chat, parser; accepts cookingFor filter
    recipe-render.js   # SINGLE SOURCE OF TRUTH for recipe modal body (used everywhere)
    pantry-render.js   # Shared pantry sidebar renderer
  pages/
    index.astro        # Main app; landing when logged out, chat+saved when logged in
    settings.astro     # Profile, household members, residents, invites, account, data
    subscribe.astro    # Plan display, checkout, cancel, Stripe portal
    help.astro         # Feature guide + suggestion form
    support.astro      # Cost transparency (tier-aware) + suggestion form
    admin.astro        # Admin dashboard (owner only): users, usage, messages, tiers
    auth/callback.astro # Magic link exchange + "close other tab" hint
    api/
      auth/             # signin (sends email), verify-otp (6-digit code), signout
      chat.js           # Recipe generation (auth gate + usage gate + cookingFor)
      bookmarks.js      # Save/remove household recipes
      pantry.js         # POST/PATCH/DELETE — household pantry
      pantry-toggle.js  # Ingredient toggle from recipe modal
      conversations.js  # Clear chat history (household-scoped)
      image.js          # Unsplash proxy (not yet configured)
      download.js       # Recipe export (text/JSON, single/all)
      share.js          # Share recipe with another user (by email or display_name)
      message.js        # User feedback/suggestions → admin
      household/        # invite, respond, leave, profile
      guest/            # Residents: CRUD, preference, invite-to-register, merge
      stripe/           # checkout, cancel, portal
      account/          # export (JSON), delete
      admin/            # tier update, message-read (admin only)
  middleware.js         # Auth session from cookies + CSRF origin check
supabase/
  migrations/
    001_schema.sql              # Core tables + RLS + auto-create-household trigger
    002_allergy_category.sql    # Add 'allergy' to preference categories
    003_user_messages.sql       # Suggestions/feedback to admin
    004_household_guests.sql    # Residents + preferences.guest_id
    005_show_photos.sql         # Profile toggle for Unsplash photos on cards
    006_per_user_conversations.sql
    007_beta_tester_activity_log.sql
    008_changelog_seen.sql
    009_dietary_constraints.sql # Per-person numeric per-serving limits + RLS
e2e/
  helpers.ts          # fakeAuth, mockAiChat, mockSignIn, MOCK_RECIPES
  01-homepage.spec.ts
  02-signin-flow.spec.ts
  03-static-pages.spec.ts
  04-subscribe-page.spec.ts
  05-api-auth-gates.spec.ts
  06-message-api.spec.ts
  07-constraints.spec.ts        # Settings redirect + documented SSR-auth gap
playwright.config.ts
```

## Key Design Decisions
- **Single source of truth for modal rendering**: `recipe-render.js::renderRecipeModalBody()` is the ONLY place modal body HTML is built. All three historical render paths (chat card, bookmark card, settings modal) consolidated here. Lesson learned: duplicate renderers caused the same bug twice in the personal instance.
- **Factory pattern for DB**: `createDB(supabase, profile)` returns an object with all methods pre-bound to the user's household context. Callers don't manipulate IDs.
- **Household-level subscription benefits**: any member's active subscription grants unlimited access to ALL members. One Stripe account covers the family.
- **Residents (non-registered household members)**: households can include people without accounts — kids, elderly relatives. Allergies/preferences tracked; "cooking for" selector filters which members' prefs apply to a given request. Residents can later be merged into a registered account.
- **Hybrid passwordless auth (magic link + 6-digit code)**: no passwords. Same email contains BOTH a clickable magic link AND a 6-digit OTP code. User can use either. Code-entry path (`/api/auth/verify-otp`) bypasses the PKCE cookie-context bug that breaks magic-link clicks across different browser contexts (Firefox Multi-Account Containers, mobile in-app browsers like Gmail's Custom Tabs, switching browsers, incognito). Supabase handles session cookies (HTTP-only). Custom SMTP via Resend (sender `noreply@mail.aachenor.com`) configured in Supabase dashboard. Migrated off Supabase's default SMTP 2026-04-28 — default was rate-limited to ~2 emails/hour. Email template (Supabase dashboard → Auth → Emails → "Magic Link") must include both `{{ .ConfirmationURL }}` and `{{ .Token }}` for the hybrid flow to work.
- **Server-enforced gates**: usage limit, auth, and data access all enforced server-side in middleware + `canGenerate()`. RLS is the backstop if code has a bug.
- **AI prompt branches onboarding**: new household gets full interview (including pantry/cuisines); user joining existing household gets personal-only interview (allergies, dislikes, experience).
- **No recipe caching**: per-user prompts make shared caching impractical; cost-per-request is acceptable at current scale.
- **Dietary constraints (numeric)**: structured per-person per-serving limits (calories, sodium_mg, carbs_g, fat_g, protein_g, fiber_g) with `lte`/`gte` operators. Distinct from `preferences` (free-text categorical). Stored in `dietary_constraints`. Resolver in `db.getCookingForConstraints` merges across the active cooking-for set (min for `lte`, max for `gte`) and flags conflicts. AI gets a strict rules block in the prompt; `chat.js` runs a server-side filter as a backstop and shows a notice listing which limits each dropped recipe missed. Recipe modal colors any nutrition tile red when the value violates the *current viewer's* own rules. Migration 009 has more thorough RLS than `preferences` — the legacy table's "user_id = auth.uid()" write policy silently fails for guest_id rows; 009 covers both paths explicitly.

## Tiers
- **free**: 10 generations/month; resets monthly; saved recipes always accessible
- **subscriber**: $2/month or $20/year, unlimited; Pro badge
- **friend**: admin-assigned, unlimited, $2/month-equivalent; soft nudge if API cost > $10/year
- **admin**: unlimited + admin dashboard access
- **Household benefit**: any unlimited member unlocks all household members

## Environment Variables (set in Vercel)
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — local only, never in Vercel (admin access)
- `ANTHROPIC_API_KEY`
- `STRIPE_SECRET_KEY`
- `PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_ANNUAL`
- `PUBLIC_SITE_URL` — `https://recipewizard.aachenor.com`
- `UNSPLASH_ACCESS_KEY` — Unsplash API key for food photos (set in Vercel dashboard)
- `SUPABASE_SERVICE_ROLE_KEY` — set in Vercel (Production only) for admin page; required for admin dashboard, beta tester management, and cross-user queries

**SMTP credentials (NOT in Vercel — configured in Supabase dashboard):**
- Resend API key (`recipe-wizard-pro` key, sending access only)
- Host: `smtp.resend.com`, port `587`, username `resend`, password = Resend API key
- Sender: `noreply@mail.aachenor.com`
- Backup copy of API key + DNS records: `~/Documents/4TBSSD/recipe-wizard-pro/keys.txt` (mode 600, gitignored, picked up by nightly rsync + weekly rclone)

## Not Yet Built (Deferred)
- Phase 10: local instance admin integration (lower priority now that personal retired)
- AI-generated food photos (DALL-E/Flux): separate photo_style setting with per-generation cost; tier add-on pricing TBD
- Sticky modal controls (Kitchen Mode + close visible on scroll) — CSS sticky broken by Alpine.js x-show transitions; needs JavaScript approach
- Guest-to-user merge UI (endpoint exists, no UI yet)
- Switch from Stripe API check per request → webhook-based tracking
- Stripe live mode
- Voice interaction (Web Speech API)
- Multi-course meal planner (two-phase): user picks courses (appetizer / salad / protein / vegetables / starch / dessert), Wizard generates a coordinated meal with shared mise en place, equipment-aware scheduling, and a unified timeline so all hot items finish together.
  - **Phase A — Menu composition**: pick courses; each course is a lightweight recipe-like entity (title, key ingredient, cuisine). Cheap to swap. AI involvement light or optional.
  - **Phase B — Coordination**: lock the menu, generate unified mise en place + interleaved timeline once. Expensive (long prompt, lots of tokens).
  - **Minimize-churn-on-swap design**: tag every prep item and timeline step with which course(s) it serves. On dish swap, re-emit only the steps tagged with the changed course; keep everything else verbatim. Stable for the cook mid-prep, requires AI to emit consistent tags + a surgical-splice renderer. Alternative cheaper path: re-prompt with prior plan as context + diff, accept some churn.
  - Estimate ~10–15h focused work. Prompt-only spike (2026-05-06) showed Claude Haiku handles coordinated meal generation reasonably well, so the AI risk is lower than initially feared; remaining risk is the tagging consistency for swap surgery.
  - Bigger token + latency cost per Phase B generation than current 4-recipe mode (~30–60s wait, vs. ~10s).
- Test infra: e2e suite can't authenticate SSR pages (no helper to mint a Supabase session cookie). Documented in `e2e/07-constraints.spec.ts`. Unblocking it would enable rendered-settings tests and end-to-end flow tests for dietary constraints. Alternative: add a `node:test`/vitest runner for pure functions like `checkRecipeViolations` and `getCookingForConstraints` merge logic.
