import { chat } from '../../lib/ai.js';
import { createDB } from '../../lib/db.js';
import { escapeHtml, isInPantry, renderRecipeModalBody } from '../../lib/recipe-render.js';
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
  const showPhotos = !!locals.profile?.show_photos;

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
          html += renderRecipeCard(b.recipe, pantryItems, savedTitles, showPhotos);
        }
        html += '</div></div>';
      }

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
    const result = await chat(db, message, bookmarkMode, cookingFor);

    let html = '';

    if (result.text) {
      html += `<div class="chat-message assistant-message">
        <div class="message-content">${renderChatMarkdown(result.text)}</div>
      </div>`;
    }

    if (result.recipes && result.recipes.length > 0) {
      const pantryItems = await db.getPantryItemNames();
      const savedTitles = await getSavedTitleSet(db);
      html += `<div id="recipe-shelf" hx-swap-oob="innerHTML">
        <div class="recipe-grid shelf-grid">`;
      for (const recipe of result.recipes) {
        html += renderRecipeCard(recipe, pantryItems, savedTitles, showPhotos);
      }
      html += '</div></div>';
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

function renderChatMarkdown(text) {
  return escapeHtml(text)
    .replace(/^### (.+)$/gm, '<strong>$1</strong>')
    .replace(/^## (.+)$/gm, '<strong>$1</strong>')
    .replace(/^# (.+)$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^---$/gm, '<hr>')
    .replace(/^[-•] (.+)$/gm, '&bull; $1')
    .replace(/^\d+\. (.+)$/gm, (_, content) => `&bull; ${content}`)
    .replace(/\n/g, '<br>');
}

async function getSavedTitleSet(db) {
  const bookmarks = await db.getBookmarks();
  return new Set(bookmarks.map(b => (b.recipe.title || '').toLowerCase().trim()));
}

function isSaved(recipe, savedTitles) {
  if (/\[SAVED\]/i.test(recipe.description || '')) return true;
  if (savedTitles.has((recipe.title || '').toLowerCase().trim())) return true;
  const t = (recipe.title || '').toLowerCase().trim();
  if (t.length >= 10) {
    for (const saved of savedTitles) {
      if (saved.includes(t) || t.includes(saved)) return true;
    }
  }
  return false;
}

function renderRecipeCard(recipe, pantryItems = [], savedTitles = new Set(), showPhotos = false) {
  const difficultyClass = (recipe.difficulty || 'Easy').toLowerCase();
  const recipeB64 = Buffer.from(JSON.stringify(recipe)).toString('base64');
  const ingredients = recipe.ingredients || [];
  const needToBuyCount = ingredients.filter(i => !isInPantry(i, pantryItems)).length;
  const saved = isSaved(recipe, savedTitles);

  return `
    <div class="recipe-card" x-data="{ showModal: false }">
      ${showPhotos ? `<div class="recipe-card-img"
           hx-get="/api/image?q=${encodeURIComponent(recipe.title + ' food dish')}"
           hx-trigger="intersect once"
           hx-swap="innerHTML">
        <div class="img-placeholder recipe-placeholder">
          <span class="placeholder-cuisine">${escapeHtml(recipe.cuisine || 'Recipe')}</span>
          <span class="placeholder-difficulty ${difficultyClass}">${escapeHtml(recipe.difficulty || 'Easy')}</span>
        </div>
      </div>` : `<div class="recipe-card-img">
        <div class="img-placeholder recipe-placeholder">
          <span class="placeholder-cuisine">${escapeHtml(recipe.cuisine || 'Recipe')}</span>
          <span class="placeholder-difficulty ${difficultyClass}">${escapeHtml(recipe.difficulty || 'Easy')}</span>
        </div>
      </div>`}
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
          ${renderRecipeModalBody(recipe, pantryItems)}
        </div>
      </div>
    </div>`;
}
