import { Page, Route } from '@playwright/test';

/**
 * Test fixtures and helpers for Recipe Wizard Pro e2e tests.
 *
 * All external dependencies (Supabase auth, Claude API, Stripe) are mocked
 * via page.route() so tests run fully offline and deterministically.
 */

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

export const MOCK_USER = {
  id: 'user-test-123',
  email: 'test@example.com',
  display_name: 'TestUser',
};

export const MOCK_PROFILE_FREE = {
  id: MOCK_USER.id,
  household_id: 'household-test-456',
  display_name: MOCK_USER.display_name,
  experience: 'beginner',
  wine_pairing: false,
  tier: 'free',
  onboarded: true,
  households: { id: 'household-test-456', name: 'Test Household' },
};

export const MOCK_PROFILE_PRO = {
  ...MOCK_PROFILE_FREE,
  tier: 'subscriber',
};

export const MOCK_RECIPES = [
  {
    id: 'spag-bol',
    title: 'Classic Spaghetti Bolognese',
    description: 'Hearty Italian pasta with rich meat sauce.',
    cookTime: '45 min',
    difficulty: 'Easy',
    servings: 2,
    cuisine: 'Italian',
    ingredients: ['8 oz spaghetti', '1 lb ground beef', '14.5 oz diced tomatoes', '2 tbsp olive oil'],
    instructions: ['Boil water', 'Cook pasta', 'Brown beef', 'Add tomatoes', 'Combine and serve'],
    instructions_intermediate: ['Cook pasta al dente', 'Brown beef, drain', 'Simmer with tomatoes', 'Combine'],
    instructions_experienced: ['Pasta to al dente. Brown beef. Simmer tomatoes. Combine.'],
    winePairing: 'A medium-bodied Chianti',
  },
  {
    id: 'stir-fry',
    title: 'Quick Vegetable Stir Fry',
    description: 'Fast weeknight stir fry with whatever veggies you have.',
    cookTime: '20 min',
    difficulty: 'Easy',
    servings: 2,
    cuisine: 'Asian',
    ingredients: ['2 cups mixed vegetables', '2 tbsp soy sauce', '1 tbsp oil'],
    instructions: ['Heat oil', 'Stir-fry veggies', 'Add soy sauce'],
    instructions_intermediate: ['Heat wok, stir-fry veggies 4 min, soy sauce, serve'],
    instructions_experienced: ['Stir-fry, soy, plate.'],
    winePairing: null,
  },
  {
    id: 'chicken-curry',
    title: 'Coconut Chicken Curry',
    description: 'Creamy coconut curry with tender chicken.',
    cookTime: '35 min',
    difficulty: 'Medium',
    servings: 4,
    cuisine: 'Indian',
    ingredients: ['1 lb chicken thighs', '1 can coconut milk', '2 tbsp curry powder'],
    instructions: ['Season chicken', 'Brown chicken', 'Add coconut milk', 'Simmer'],
    instructions_intermediate: ['Brown chicken, add coconut milk + curry, simmer 20 min'],
    instructions_experienced: ['Sear chicken. Deglaze with coconut. Simmer.'],
    winePairing: 'Off-dry Riesling',
  },
  {
    id: 'salad',
    title: 'Mediterranean Chickpea Salad',
    description: 'Fresh salad with chickpeas, feta, and herbs.',
    cookTime: '10 min',
    difficulty: 'Easy',
    servings: 2,
    cuisine: 'Mediterranean',
    ingredients: ['1 can chickpeas', '1/2 cup feta', '1 cucumber'],
    instructions: ['Drain chickpeas', 'Dice cucumber', 'Crumble feta', 'Combine'],
    instructions_intermediate: ['Drain chickpeas, dice cucumber, crumble feta, toss'],
    instructions_experienced: ['Toss ingredients, season.'],
    winePairing: null,
  },
];

// ---------------------------------------------------------------------------
// Auth mocking
// ---------------------------------------------------------------------------

/**
 * Fake an authenticated session. The middleware reads cookies to determine
 * auth; instead of setting real cookies, we mock the Supabase SDK response
 * at the network level. We also inject window.__user for client-side needs.
 *
 * Call this BEFORE navigating to a page that requires auth.
 */
export async function fakeAuth(page: Page, profile = MOCK_PROFILE_FREE) {
  // Inject a flag the app can read if it wants to; mostly for debugging tests
  await page.addInitScript((data) => {
    (window as any).__user = data.user;
    (window as any).__profile = data.profile;
  }, { user: MOCK_USER, profile });

  // Intercept Supabase auth calls
  await page.route(/\/auth\/v1\/user/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: MOCK_USER.id,
        email: MOCK_USER.email,
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
      }),
    });
  });

  // Intercept profile fetch
  await page.route(/\/rest\/v1\/profiles/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([profile]),
    });
  });

  // Intercept all other Supabase REST calls with empty success responses
  await page.route(/\/rest\/v1\/(pantry|bookmarks|conversations|preferences|user_usage|user_messages|notifications|households|household_invites)/, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    // Return empty arrays for GETs, success for writes
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
    } else {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: '[]',
      });
    }
  });
}

/**
 * Mock the AI chat endpoint to return a canned set of 4 recipes.
 * Used in tests where we want to verify the UI handles recipe results.
 */
export async function mockAiChat(page: Page, opts: { recipes?: any[]; atLimit?: boolean } = {}) {
  await page.route('**/api/chat', async (route) => {
    if (opts.atLimit) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<div class="chat-message assistant-message upgrade-prompt">
          <div class="message-content">
            <strong>You've used all 10 free recipe generations this month.</strong><br>
            <a href="/subscribe" class="upgrade-btn">Upgrade to Pro</a>
          </div>
        </div>`,
      });
      return;
    }

    const recipes = opts.recipes || MOCK_RECIPES;
    const cards = recipes.map(r => `
      <div class="recipe-card" x-data="{ showModal: false }">
        <div class="recipe-card-body" @click="showModal = true">
          <h3 class="recipe-title">${r.title}</h3>
          <p class="recipe-desc">${r.description}</p>
          <div class="recipe-meta">
            <span class="recipe-time">${r.cookTime}</span>
            <span class="recipe-difficulty ${r.difficulty.toLowerCase()}">${r.difficulty}</span>
          </div>
        </div>
        <button class="bookmark-btn">&#9734;</button>
      </div>`).join('');

    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<div class="chat-message assistant-message">
        <div class="message-content">Here are some ideas:</div>
      </div>
      <div id="recipe-shelf" hx-swap-oob="innerHTML">
        <div class="recipe-grid shelf-grid">${cards}</div>
      </div>`,
    });
  });
}

/**
 * Mock the sign-in endpoint to simulate success without sending real email.
 */
export async function mockSignIn(page: Page, opts: { success?: boolean; error?: string } = {}) {
  await page.route('**/api/auth/signin', async (route) => {
    if (opts.success === false) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: opts.error || 'Failed to send sign-in email' }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
  });
}

/**
 * Mock the OTP code-verification endpoint.
 */
export async function mockVerifyOtp(page: Page, opts: { success?: boolean; error?: string } = {}) {
  await page.route('**/api/auth/verify-otp', async (route) => {
    if (opts.success === false) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: opts.error || 'Invalid or expired code.' }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      });
    }
  });
}

/**
 * Mock Stripe checkout to capture the request without hitting Stripe.
 */
export async function mockStripeCheckout(page: Page) {
  await page.route('**/api/stripe/checkout', async (route) => {
    // Pretend we redirected to Stripe, then back
    await route.fulfill({
      status: 302,
      headers: { Location: 'https://checkout.stripe.com/test-session' },
    });
  });
}
