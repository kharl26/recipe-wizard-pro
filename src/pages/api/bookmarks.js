import { createDB } from '../../lib/db.js';
import { escapeHtml, isInPantry, renderRecipeModalBody } from '../../lib/recipe-render.js';

function renderBookmarkCard(bookmark, pantryItems) {
  const r = bookmark.recipe;
  const difficultyClass = (r.difficulty || 'Easy').toLowerCase();
  const ingredients = r.ingredients || [];
  const needToBuyCount = ingredients.filter(i => !isInPantry(i, pantryItems)).length;

  return `
    <div class="recipe-card bookmark-card" x-data="{ showModal: false }">
      <div class="recipe-card-body" @click="showModal = true">
        <h3 class="recipe-title">${escapeHtml(r.title)}</h3>
        <p class="recipe-desc">${escapeHtml(r.description)}</p>
        <div class="recipe-meta">
          <span class="recipe-time">${escapeHtml(r.cookTime)}</span>
          <span class="recipe-difficulty ${difficultyClass}">${escapeHtml(r.difficulty)}</span>
          ${r.cuisine ? `<span class="recipe-cuisine">${escapeHtml(r.cuisine)}</span>` : ''}
          ${r.servings ? `<span class="recipe-servings">${r.servings} servings</span>` : ''}
          ${needToBuyCount > 0 ? `<span class="recipe-shopping-badge" title="${needToBuyCount} ingredient(s) may need purchasing">&#128722; ${needToBuyCount}</span>` : ''}
        </div>
      </div>
      <button class="bookmark-btn bookmarked"
              hx-delete="/api/bookmarks?id=${bookmark.id}"
              hx-confirm="Remove this recipe from saved?"
              hx-swap="outerHTML"
              hx-target="closest .bookmark-card"
              title="Remove from saved">&#9733;</button>
      <div class="recipe-modal-overlay" x-show="showModal" x-cloak @click.self="showModal = false">
        <div class="recipe-modal">
          ${renderRecipeModalBody(r, pantryItems)}
        </div>
      </div>
    </div>`;
}

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response('Unauthorized', { status: 401 });
  }
  const db = createDB(locals.supabase, locals.profile);

  const data = await request.formData();
  const recipeB64 = data.get('recipe_b64');
  const recipeJson = data.get('recipe');

  let recipe;
  try {
    if (recipeB64) {
      recipe = JSON.parse(Buffer.from(recipeB64, 'base64').toString('utf-8'));
    } else if (recipeJson) {
      recipe = JSON.parse(recipeJson);
    } else {
      return new Response('Missing recipe', { status: 400 });
    }
    await db.logActivity('recipe_saved', { title: recipe.title });
    const result = await db.addBookmark(recipe);
    const bookmarks = await db.getBookmarks();
    const count = bookmarks.length;
    const newBookmark = result ? bookmarks.find(b => b.id === result.id) : null;
    const pantryItems = await db.getPantryItemNames();

    let cardHtml = '';
    if (newBookmark) {
      cardHtml = renderBookmarkCard(newBookmark, pantryItems);
    }

    return new Response(
      `<button class="bookmark-btn bookmarked" title="Saved!">&#9733;</button>
       <script>
         document.querySelector('[data-bookmark-count]').textContent = 'Saved (${count})';
         var grid = document.querySelector('#bookmarks-grid');
         if (grid) {
           var empty = document.querySelector('.empty-state');
           if (empty) empty.remove();
           grid.insertAdjacentHTML('afterbegin', ${JSON.stringify(cardHtml)});
           if (window.Alpine) Alpine.initTree(grid.firstElementChild);
           if (window.htmx) htmx.process(grid.firstElementChild);
         }
       </script>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err) {
    console.error('Bookmark error:', err);
    return new Response('Invalid recipe data', { status: 400 });
  }
}

export async function DELETE({ url, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response('Unauthorized', { status: 401 });
  }
  const db = createDB(locals.supabase, locals.profile);
  const id = url.searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });
  await db.logActivity('recipe_removed', { bookmark_id: id });
  await db.removeBookmark(id);
  const count = (await db.getBookmarks()).length;
  return new Response(
    `<script>
      document.querySelector('[data-bookmark-count]').textContent = 'Saved (${count})';
      ${count === 0 ? `
        var grid = document.querySelector('#bookmarks-grid');
        if (grid && !document.querySelector('.empty-state')) {
          grid.insertAdjacentHTML('beforebegin', '<div class="empty-state">No saved recipes yet. Save recipes from the chat to find them here.</div>');
        }
      ` : ''}
    </script>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
