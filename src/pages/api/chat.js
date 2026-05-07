import { chat, checkRecipeViolations } from '../../lib/ai.js';
import { createDB } from '../../lib/db.js';
import { escapeHtml, isInPantry, renderRecipeModalBody, renderChatMarkdown, stripSavedMarker } from '../../lib/recipe-render.js';
import { renderPantrySection } from '../../lib/pantry-render.js';

export async function POST({ request, locals }) {
  // Auth gate
  if (!locals.user || !locals.profile) {
    return new Response(
      `<div class="chat-message error-message">Please sign in to use Recipe Wizard.</div>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  }

  const db = createDB(locals.supabase, locals.profile);

  try {
    const data = await request.formData();
    const message = data.get('message')?.trim();
    const bookmarkMode = data.get('bookmark_mode') || 'include';
    // cooking_for is a comma-separated list of person IDs (user_ids or guest_ids)
    const cookingForRaw = data.get('cooking_for')?.toString() || '';
    const cookingFor = cookingForRaw
      ? cookingForRaw.split(',').map(s => s.trim()).filter(Boolean)
      : null;

    if (!message) {
      return new Response('Message is required', { status: 400 });
    }

    // The viewer's own dietary rules (used for per-row violation styling in
    // the recipe modal — separate from the cooking-for set, which can include
    // others' constraints merged in). Hoisted above all branches so the
    // saved-mode path can also pass it to renderRecipeCard.
    const { rules: viewerRules } = await db.getCookingForConstraints([locals.user.id]);

    // Saved Only — local search, no AI call, no usage cost
    if (bookmarkMode === 'saved') {
      await db.addConversation('user', message);
      const matches = await db.searchBookmarks(message);
      const pantryItems = await db.getPantryItemNames();

      let html = '';
      if (matches.length === 0) {
        html += `<div class="chat-message assistant-message">
          <div class="message-content">No saved recipes match "${escapeHtml(message)}". Try different keywords or switch to "Chat + Saved" or "Chat only" mode.</div>
        </div>`;
      } else {
        const shown = matches.slice(0, 4);
        html += `<div class="chat-message assistant-message">
          <div class="message-content">Found ${matches.length} saved recipe${matches.length === 1 ? '' : 's'} matching "${escapeHtml(message)}"${matches.length > 4 ? ' (showing first 4)' : ''}:</div>
        </div>`;
        html += `<div id="recipe-shelf" hx-swap-oob="innerHTML">
          <div class="recipe-grid shelf-grid">`;
        const savedTitles = await getSavedTitleSet(db);
        for (const b of shown) {
          html += renderRecipeCard(b.recipe, pantryItems, savedTitles, viewerRules);
        }
        html += '</div></div>';
      }

      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    // Dietary-constraint conflict check: if a user has both a min and max for
    // the same metric and they cross (e.g., calories ≤ 400 AND ≥ 600), every
    // recipe is impossible. Surface this clearly BEFORE charging usage or
    // calling the AI — there's no recipe that can satisfy the request.
    const { rules: dietaryRules, conflicts: dietaryConflicts } =
      await db.getCookingForConstraints(cookingFor);
    if (dietaryConflicts.length > 0) {
      await db.addConversation('user', message);
      const list = dietaryConflicts.join(', ');
      const html = `<div class="chat-message assistant-message">
        <div class="message-content">Your dietary limits conflict for: <strong>${escapeHtml(list)}</strong>. No recipe can satisfy both a minimum and maximum that overlap. Please adjust your limits in <a href="/settings">Settings</a> and try again.</div>
      </div>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    // Usage gate: check free tier limit before calling the AI
    const gate = await db.canGenerate();
    if (!gate.allowed) {
      const html = `<div class="chat-message assistant-message upgrade-prompt">
        <div class="message-content">
          <strong>You've used all ${gate.limit} free recipe generations this month.</strong><br>
          Your saved recipes are always available. To generate unlimited new recipes, subscribe for just $2/month.<br><br>
          <a href="/subscribe" class="upgrade-btn">Upgrade to Pro</a>
        </div>
      </div>`;
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    // Increment usage and call AI
    await db.incrementUsage();
    await db.logActivity('chat_message', { message: message.slice(0, 200), bookmarkMode, cookingFor });
    const result = await chat(db, message, bookmarkMode, cookingFor, dietaryRules);

    let html = '';

    if (result.text) {
      html += `<div class="chat-message assistant-message">
        <div class="message-content">${renderChatMarkdown(result.text)}</div>
      </div>`;
    }

    if (result.recipes && result.recipes.length > 0) {
      // Server-side dietary filter — backstop in case the AI emits a recipe
      // whose nutrition values violate the active rules. Drop violators and
      // show a notice listing the specific limits each one missed (OQ#3).
      const kept = [];
      const dropped = [];
      for (const recipe of result.recipes) {
        const violations = checkRecipeViolations(recipe, dietaryRules);
        if (violations.length > 0) {
          dropped.push({ title: recipe.title, violations });
        } else {
          kept.push(recipe);
        }
      }

      if (dropped.length > 0) {
        await db.logActivity('recipes_filtered_dietary', {
          count: dropped.length,
          titles: dropped.map(d => d.title),
        });
        const lines = dropped.map(d =>
          `<li><strong>${escapeHtml(d.title)}</strong> — ${escapeHtml(d.violations.join('; '))}</li>`
        ).join('');
        html += `<div class="chat-message assistant-message dietary-filter-notice">
          <div class="message-content">
            Filtered ${dropped.length} recipe${dropped.length === 1 ? '' : 's'} that exceeded your dietary limits:
            <ul>${lines}</ul>
          </div>
        </div>`;
      }

      if (kept.length > 0) {
        await db.logActivity('recipes_generated', { count: kept.length, titles: kept.map(r => r.title) });
        const pantryItems = await db.getPantryItemNames();
        const savedTitles = await getSavedTitleSet(db);
        html += `<div id="recipe-shelf" hx-swap-oob="innerHTML">
          <div class="recipe-grid shelf-grid">`;
        for (const recipe of kept) {
          html += renderRecipeCard(recipe, pantryItems, savedTitles, viewerRules);
        }
        html += '</div></div>';
      }
    }

    if (result.pantryUpdates.length > 0) {
      const items = result.pantryUpdates.map(u => u.item).join(', ');
      html += `<div class="update-notice pantry-notice">Pantry updated: ${escapeHtml(items)}</div>`;
      // Out-of-band swap the pantry sidebar so the list reflects the new items
      const pantry = await db.getPantry();
      html += renderPantrySection(pantry).replace(
        'id="pantry-section"',
        'id="pantry-section" hx-swap-oob="true"'
      );
    }

    if (result.preferenceUpdates.length > 0) {
      const items = result.preferenceUpdates.map(u => `${u.person}: ${u.item}`).join(', ');
      html += `<div class="update-notice pref-notice">Preferences updated: ${escapeHtml(items)}</div>`;
    }

    // Update cooking-for display via OOB swap
    if (result.cookingForUpdate) {
      const cfu = result.cookingForUpdate;
      const members = (cfu.members || []).map(m => escapeHtml(m));
      const guests = cfu.guests || 0;
      const guestLabel = guests > 0 ? `${guests} guest${guests === 1 ? '' : 's'}` : '';
      const parts = [...members, ...(guestLabel ? [guestLabel] : [])];
      let listText = parts.length > 2
        ? parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1]
        : parts.join(' and ');
      if (cfu.notes) listText += ` (${escapeHtml(cfu.notes)})`;
      html += `<div id="cooking-for-display" hx-swap-oob="innerHTML" class="cooking-for-row">
        <span class="cooking-for-label">Cooking for:</span>
        <span class="cooking-for-list">${listText}</span>
      </div>`;
    }

    // Update usage counter via OOB swap
    const newGate = await db.canGenerate();
    if (newGate.limit) {
      html += `<span id="usage-counter" hx-swap-oob="innerHTML">${newGate.usage} of ${newGate.limit} this month</span>`;
    }

    return new Response(html, { headers: { 'Content-Type': 'text/html' } });

  } catch (err) {
    console.error('Chat error:', err);
    let errorMsg = 'Something went wrong. Please try again.';
    if (err.status === 429) errorMsg = 'Rate limited. Please wait a moment and try again.';
    if (err.status === 401) errorMsg = 'API key issue. Check configuration.';
    return new Response(
      `<div class="chat-message error-message">${errorMsg}</div>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

function normalizeTitle(t) {
  return (t || '')
    .toLowerCase()
    .replace(/\[saved\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getSavedTitleSet(db) {
  const bookmarks = await db.getBookmarks();
  return new Set(bookmarks.map(b => normalizeTitle(b.recipe.title)));
}

function isSaved(recipe, savedTitles) {
  return savedTitles.has(normalizeTitle(recipe.title));
}

function renderRecipeCard(recipe, pantryItems = [], savedTitles = new Set(), viewerRules = {}) {
  recipe = stripSavedMarker(recipe);
  const difficultyClass = (recipe.difficulty || 'Easy').toLowerCase();
  const recipeB64 = Buffer.from(JSON.stringify(recipe)).toString('base64');
  const ingredients = recipe.ingredients || [];
  const needToBuyCount = ingredients.filter(i => !isInPantry(i, pantryItems)).length;
  const saved = isSaved(recipe, savedTitles);

  return `
    <div class="recipe-card" x-data="{ showModal: false }">
      <div class="recipe-card-img"
           hx-get="/api/image?q=${encodeURIComponent(recipe.title + ' food dish')}"
           hx-trigger="intersect once"
           hx-swap="innerHTML">
        <div class="img-placeholder recipe-placeholder">
          <span class="placeholder-cuisine">${escapeHtml(recipe.cuisine || 'Recipe')}</span>
          <span class="placeholder-difficulty ${difficultyClass}">${escapeHtml(recipe.difficulty || 'Easy')}</span>
        </div>
      </div>
      <div class="recipe-card-body" @click="showModal = true">
        <h3 class="recipe-title">${escapeHtml(recipe.title)}</h3>
        <p class="recipe-desc">${escapeHtml(recipe.description)}</p>
        <div class="recipe-meta">
          <span class="recipe-time">${escapeHtml(recipe.cookTime)}</span>
          <span class="recipe-difficulty ${difficultyClass}">${escapeHtml(recipe.difficulty)}</span>
          ${recipe.cuisine ? `<span class="recipe-cuisine">${escapeHtml(recipe.cuisine)}</span>` : ''}
          ${recipe.servings ? `<span class="recipe-servings">${recipe.servings} servings</span>` : ''}
          ${needToBuyCount > 0 ? `<span class="recipe-shopping-badge" title="${needToBuyCount} ingredient(s) may need purchasing">&#128722; ${needToBuyCount}</span>` : ''}
        </div>
      </div>
      ${saved
        ? `<button class="bookmark-btn bookmarked" title="Already saved">&#9733;</button>`
        : `<button class="bookmark-btn"
              hx-post="/api/bookmarks"
              hx-include="none"
              hx-vals='{"recipe_b64": "${recipeB64}"}'
              hx-swap="outerHTML"
              title="Save this recipe">&#9734;</button>`
      }
      <div class="recipe-modal-overlay" x-show="showModal" x-cloak @click.self="showModal = false">
        <div class="recipe-modal">
          ${renderRecipeModalBody(recipe, pantryItems, viewerRules)}
        </div>
      </div>
    </div>`;
}
