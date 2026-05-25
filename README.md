# Recipe Wizard Pro

AI-powered recipe generator with household management, dietary tracking, and subscription billing.

**Live:** https://recipewizard.aachenor.com

## What it does

Tell the Wizard what you feel like eating — it generates four full recipes tailored to your household's preferences, allergies, experience level, and what's actually in your pantry. Sign in once per household; everyone's preferences and saved recipes are shared.

### Features

- **Conversational recipe generation** — chat with Claude Haiku to refine ideas; the model learns your household's tastes over time
- **Household accounts** — invite family members; one subscription covers everyone
- **Residents** — track preferences for non-account members (kids, elderly relatives) and toggle "cooking for" to filter who you're feeding tonight
- **Dietary constraints** — per-person numeric limits (calories, sodium, carbs, fat, protein, fiber) merged across whoever's eating; the AI honors them and a server-side filter is the backstop
- **Pantry-aware** — recipes prefer what you already have; ingredient toggles update the pantry from the recipe modal
- **Passwordless auth** — magic link + 6-digit code in the same email; both work, code-entry bypasses the PKCE cookie-context issues that break magic links in some browser contexts
- **Tiers** — free (10 recipes/month) or unlimited via $2/month / $20/year subscription; Stripe Customer Portal for self-service

## Tech stack

- [Astro 5](https://astro.build/) (SSR via `@astrojs/vercel`)
- [HTMX](https://htmx.org/) + [Alpine.js](https://alpinejs.dev/)
- [Supabase](https://supabase.com/) — Postgres + Auth + RLS
- [Anthropic Claude Haiku 4.5](https://www.anthropic.com/) — recipe generation
- [Stripe](https://stripe.com/) — subscriptions + Customer Portal
- [Vercel](https://vercel.com/) — hosting (auto-deploys on push to `main`)
- [Playwright](https://playwright.dev/) — e2e tests

## Local development

```bash
git clone https://github.com/kharl26/recipe-wizard-pro.git
cd recipe-wizard-pro
npm install
cp .env.example .env   # fill in your own keys
npx astro dev --port 4326
```

Required environment variables are listed in `.env.example`. You'll need:

- A Supabase project (run the migrations in `supabase/migrations/` against it)
- An Anthropic API key
- Stripe test keys + two price IDs (monthly and annual)

### Tests

```bash
npx playwright test            # headless
npx playwright test --ui       # interactive
```

## Architecture

See [`CLAUDE.md`](./CLAUDE.md) for the full design-decisions writeup. Highlights:

- **Single source of truth** for recipe-modal rendering (`src/lib/recipe-render.js`) — all card paths and the saved-recipe modal share one renderer
- **Factory pattern** for DB access (`createDB(supabase, profile)`) — every query is scoped to the user's household by construction
- **Server-side gates** — auth, usage limits, and data access enforced in middleware and `canGenerate()`; RLS is the backstop
- **Hybrid passwordless auth** — magic link + 6-digit OTP in the same email so users have two redundant paths

```
src/
  lib/        # supabase, stripe, db, ai, recipe-render, pantry-render
  pages/      # Astro routes (index, settings, subscribe, admin, …) + api/
  middleware.js
supabase/
  migrations/ # 001 schema → 009 dietary constraints
e2e/          # Playwright specs
```

## License

[MIT](./LICENSE)
