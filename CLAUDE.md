# Recipe Wizard Pro — Multi-User Paid Recipe App

## What is this?
Live at **https://recipe-wizard-pro.vercel.app** — the active production app Bob and Alice use for daily cooking. Multi-user version of Recipe Wizard with authentication, household management, and subscription billing. Week 7 bootcamp project.

The personal single-user Recipe Wizard (Week 5) has been retired and archived at `~/Documents/4TBSSD/recipe-wizard-old/` — do not modify it. All development happens here.

## Status (2026-04-15)
- **Deployed**: Vercel free tier, auto-deploys on git push to main
- **Domain**: recipe-wizard-pro.vercel.app (custom domain recipewizard.aachenor.com still pending)
- **Stripe**: sandbox/test mode (flip to live when ready for real charges)
- **Users**: Bob (admin) + Alice (friend); household `97cf39fb-fe90-4bcf-ab50-ce75d8b87c17`
- **Tests**: 28 Playwright tests, all passing

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
      auth/             # signin (magic link), signout
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
    001_schema.sql           # Core tables + RLS + auto-create-household trigger
    002_allergy_category.sql # Add 'allergy' to preference categories
    003_user_messages.sql    # Suggestions/feedback to admin
    004_household_guests.sql # Residents + preferences.guest_id
e2e/
  helpers.ts          # fakeAuth, mockAiChat, mockSignIn, MOCK_RECIPES
  01-homepage.spec.ts
  02-signin-flow.spec.ts
  03-static-pages.spec.ts
  04-subscribe-page.spec.ts
  05-api-auth-gates.spec.ts
  06-message-api.spec.ts
playwright.config.ts
```

## Key Design Decisions
- **Single source of truth for modal rendering**: `recipe-render.js::renderRecipeModalBody()` is the ONLY place modal body HTML is built. All three historical render paths (chat card, bookmark card, settings modal) consolidated here. Lesson learned: duplicate renderers caused the same bug twice in the personal instance.
- **Factory pattern for DB**: `createDB(supabase, profile)` returns an object with all methods pre-bound to the user's household context. Callers don't manipulate IDs.
- **Household-level subscription benefits**: any member's active subscription grants unlimited access to ALL members. One Stripe account covers the family.
- **Residents (non-registered household members)**: households can include people without accounts — kids, elderly relatives. Allergies/preferences tracked; "cooking for" selector filters which members' prefs apply to a given request. Residents can later be merged into a registered account.
- **Magic link auth only**: no passwords at launch. Supabase handles session cookies (HTTP-only).
- **Server-enforced gates**: usage limit, auth, and data access all enforced server-side in middleware + `canGenerate()`. RLS is the backstop if code has a bug.
- **AI prompt branches onboarding**: new household gets full interview (including pantry/cuisines); user joining existing household gets personal-only interview (allergies, dislikes, experience).
- **No recipe caching**: per-user prompts make shared caching impractical; cost-per-request is acceptable at current scale.

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
- `PUBLIC_SITE_URL` — `https://recipe-wizard-pro.vercel.app`
- `UNSPLASH_ACCESS_KEY` — Unsplash API key for food photos (set in Vercel dashboard)
- `SUPABASE_SERVICE_ROLE_KEY` — set in Vercel (Production only) for admin page; required for admin dashboard, beta tester management, and cross-user queries

## Not Yet Built (Deferred)
- Phase 10: local instance admin integration (lower priority now that personal retired)
- Dietary constraint preferences: user-specified constraints like "low sodium", "max 500 cal", "diabetic-friendly" that feed into recipe generation (nutrition display is built; constraint filtering is not yet)
- AI-generated food photos (DALL-E/Flux): separate photo_style setting with per-generation cost; tier add-on pricing TBD
- Custom domain: recipewizard.aachenor.com (Ionos CNAME → Vercel)
- Sticky modal controls (Kitchen Mode + close visible on scroll) — CSS sticky broken by Alpine.js x-show transitions; needs JavaScript approach
- Guest-to-user merge UI (endpoint exists, no UI yet)
- Switch from Stripe API check per request → webhook-based tracking
- Stripe live mode
- Voice interaction (Web Speech API)
