# Recipe Wizard Pro — Multi-User Paid Recipe App

## What is this?
Multi-user version of Recipe Wizard with authentication, household management, and subscription billing. Forked from the personal single-user Recipe Wizard (Week 5 bootcamp project) for the Week 7 "paid product" project.

## Tech Stack
- Astro 5 (SSR, `@astrojs/vercel` adapter)
- HTMX + Alpine.js (same UI patterns as personal version)
- Supabase (PostgreSQL + Auth + RLS)
- Stripe (subscriptions: $2/month or $20/year)
- Anthropic Claude Haiku 4.5 (recipe generation)
- Vercel (hosting, free tier)
- Playwright (testing)

## Development
```bash
cd ~/Documents/4TBSSD/recipe-wizard-pro
cp .env.example .env  # fill in real keys
npx astro dev --port 4326
```

Port 4326 to avoid conflicting with the personal instance on 4325.

## Architecture
```
src/
  lib/
    supabase.js        # Supabase client helpers (per-request + admin)
    stripe.js          # Stripe checkout, subscription checks, cancellation
    db.js              # Data access layer (Supabase queries, replaces SQLite)
    ai.js              # Anthropic API (same as personal, but user/household-scoped)
    recipe-render.js   # Shared recipe modal renderer (same as personal)
    pantry-render.js   # Shared pantry sidebar renderer (same as personal)
  pages/
    index.astro        # Main app (same UI as personal, plus auth state)
    auth/
      callback.astro   # Magic link callback handler
    subscribe.astro    # Stripe checkout + subscription management
    help.astro         # Feature guide and UI explanation
    support.astro      # Cost transparency page (tier-aware)
    admin.astro        # Admin dashboard (protected — owner only)
    api/
      chat.js          # Recipe generation (auth + usage gate)
      bookmarks.js     # Save/remove recipes (auth + household-scoped)
      pantry.js        # Pantry CRUD (auth + household-scoped)
      pantry-toggle.js # Ingredient toggle from recipe modal
      conversations.js # Clear chat history
      image.js         # Unsplash proxy
      auth/signin.js   # Magic link send
      auth/signout.js  # Sign out
      household/       # Invite, accept, leave, remove
      download.js      # Recipe download (text/JSON, individual/all)
      share.js         # Share recipe with another user
      stripe/
        checkout.js    # Create checkout session
        status.js      # Check subscription status
        cancel.js      # Cancel/reactivate subscription
  middleware.js        # Auth session + CSRF + user attachment
supabase/
  migrations/
    001_schema.sql     # All tables, RLS policies, indexes
public/
  styles.css           # Same as personal version
.env.example           # Template for environment variables
```

## Key Differences from Personal Version
- **Auth required**: magic link sign-in via Supabase; unauthenticated users see login prompt
- **Multi-tenant**: all data scoped by user_id or household_id; RLS enforced at DB level
- **Household model**: auto-created on signup; invite others by email; shared pantry/recipes/conversations
- **Usage tracking**: 5 free generations/month for free tier; unlimited for subscribers
- **Stripe billing**: $2/month or $20/year; Pro badge; upgrade prompt at limit
- **Friend tier**: manually assigned in admin; $2/month unlimited; soft nudge if API cost > $10/year
- **Saved recipes always accessible**: free tier only gates new generation, not viewing saved recipes

## Domain
recipewizard.aachenor.com (CNAME → Vercel)

## Tiers
- **free**: 5 generations/month, counter resets monthly, saved recipes always accessible
- **subscriber**: $2/month or $20/year, unlimited generations, Pro badge
- **friend**: admin-assigned, same price as subscriber, unlimited, soft cost nudge at $10/year

## Relationship to Personal Instance
The personal Recipe Wizard at ~/Documents/4TBSSD/recipe-wizard/ is a separate codebase:
- Runs on localhost:4325, SQLite, no auth, no limits
- UI/UX identical to Pro
- Has admin dashboard that reads from Pro's production Supabase
- Changes to shared rendering (recipe-render.js, pantry-render.js, styles.css) should be synced between both

## Port
4326 (dev), production on Vercel
