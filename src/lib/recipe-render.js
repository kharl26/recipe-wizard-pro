// Shared rendering helpers for recipe cards and modals.
//
// All three render paths — api/chat.js (live AI cards), api/bookmarks.js
// (newly-saved bookmark cards injected via HTMX), and pages/index.astro
// (SSR bookmark grid on page load) — call into this module so the modal
// markup stays in sync. Card previews still differ per caller; only the
// modal body is shared.

const STAPLES = [
  'salt', 'pepper', 'black pepper', 'white pepper', 'kosher salt', 'sea salt',
  'water', 'oil', 'olive oil', 'vegetable oil', 'neutral oil', 'canola oil',
  'cooking spray', 'butter', 'unsalted butter', 'salted butter',
];

// Remove "[SAVED]" markers the AI used to insert. Saved-state is now
// represented by the filled bookmark star, not by visible text. Returns a
// shallow clone (does NOT mutate the input) so callers passing shared or
// cached recipe objects don't lose markers globally.
export function stripSavedMarker(recipe) {
  if (!recipe || typeof recipe !== 'object') return recipe;
  const clean = (s) => typeof s === 'string'
    ? s.replace(/\s*\[saved\]\s*/gi, ' ').replace(/\s+/g, ' ').trim()
    : s;
  return {
    ...recipe,
    title: clean(recipe.title),
    description: clean(recipe.description),
  };
}

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Extract the item name from an ingredient line by stripping quantities/units.
// "2 tbsp soy sauce" → "soy sauce"; "14.5 oz (411g) can diced tomatoes" → "diced tomatoes"
export function extractItemName(line) {
  return line
    .replace(/^optional:\s*/i, '')                                                              // "optional:"
    .replace(/^[\d.\/\-\s]+/, '')                                                               // leading numbers, fractions, ranges
    .replace(/^\s*(oz|g|lb|lbs|cups?|tbsp|tsp|ml|kg|quarts?|pints?|gallons?|liters?)\b\.?\s*/i, '') // units
    .replace(/^\s*\([^)]*\)\s*/, '')                                                            // parenthetical (411g)
    .replace(/^\s*(cans?|bottles?|packages?|bags?|bunch(?:es)?|heads?|stalks?|cloves?|slices?|pieces?|pinch(?:es)?|dash(?:es)?|sprigs?|medium|large|small|whole|fresh|dried)\b\s*/i, '') // containers/sizes/descriptors
    .replace(/^\s*of\s+/i, '')                                                                  // "of"
    .replace(/\s*,?\s*to taste\s*$/i, '')                                                       // trailing "to taste"
    .replace(/\s*,?\s*optional\s*$/i, '')                                                       // trailing "optional"
    .replace(/\s*,?\s*divided\s*$/i, '')                                                        // trailing "divided"
    .replace(/\s*,?\s*plus more.*$/i, '')                                                       // trailing "plus more..."
    .trim();
}

// Word-boundary test — prevents "apple" from matching "pineapple" or
// "oil" from matching "foil".
function wordMatch(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('\\b' + escaped + '\\b', 'i').test(text);
}

export function isInPantry(ingredientLine, pantryItems = []) {
  const line = ingredientLine.toLowerCase();
  if (STAPLES.some(s => wordMatch(line, s))) return true;
  return pantryItems.some(item => wordMatch(line, item));
}

export function renderChatMarkdown(text) {
  return escapeHtml(text)
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^---$/gm, '')
    .replace(/^[-•]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n/g, '<br>');
}

// Build the inner HTML of a recipe modal — image placeholder, title,
// description, meta, ingredient checkboxes, shopping list, three instruction
// lists (one per experience bucket, gated by Alpine $store.cook.bucket), and
// wine pairing. Returns a string for use with set:html / template literals.
//
// Includes a "Kitchen mode" button that toggles a class on the modal for
// full-viewport layout with extra-large fonts.
// Build one nutrition tile, marking it as a violation when the value falls
// outside the viewer's own dietary rules. `viewerRules` is the same rules
// shape returned by db.getCookingForConstraints({metric: {lte?, gte?}}).
function nutItem(rawValue, displayValue, label, metricKey, viewerRules) {
  const rule = viewerRules?.[metricKey];
  let cls = 'nut-item';
  let title = '';
  if (rule && typeof rawValue === 'number') {
    if (typeof rule.lte === 'number' && rawValue > rule.lte) {
      cls += ' nut-violation';
      title = `Exceeds your limit of ${rule.lte}`;
    } else if (typeof rule.gte === 'number' && rawValue < rule.gte) {
      cls += ' nut-violation';
      title = `Below your minimum of ${rule.gte}`;
    }
  }
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `<div class="${cls}"${titleAttr}><span class="nut-value">${displayValue}</span><span class="nut-label">${label}</span></div>`;
}

export function renderRecipeModalBody(recipe, pantryItems = [], viewerRules = {}) {
  const r = stripSavedMarker(recipe);
  const difficultyClass = (r.difficulty || 'Easy').toLowerCase();
  const ingredients = r.ingredients || [];
  const needToBuy = ingredients.filter(i => !isInPantry(i, pantryItems));
  const needToBuyCount = needToBuy.length;

  // Ingredient rows: pantry-toggle icon (click to flip pantry state) +
  // a label-wrapped checkbox + text (click to mark used during cooking).
  const ingredientHtml = ingredients.map(i => {
    const inP = isInPantry(i, pantryItems);
    const itemName = extractItemName(i);
    const escaped = escapeHtml(i);
    const escapedName = escapeHtml(itemName).replace(/'/g, "\\'");
    return `<li class="${inP ? 'in-pantry' : 'need-to-buy'}">
      <span class="ingredient-toggle" onclick="togglePantry(this, '${escapedName}', ${inP})"
            title="${inP ? 'I have this — click to mark as used up or not on hand' : 'I don&#39;t have this — keep it on the shopping list. Click to confirm you do have it.'}"
            style="cursor:pointer">${inP ? '&#9989;' : '&#128722;'}</span>
      <label class="check-row">
        <input type="checkbox">
        <span class="check-text">${escaped}</span>
      </label>
    </li>`;
  }).join('');

  // Instruction rows: checkbox (click → strike-through) + step text.
  const instructionHtml = (steps) => {
    return steps.map((s) => `
    <li class="step-li">
      <input type="checkbox" class="step-check">
      <span class="step-text">${escapeHtml(s)}</span>
    </li>`).join('');
  };

  // Fall through experienced → intermediate → beginner so old bookmarks
  // (only `instructions`) keep rendering at every viewer level.
  const beginner = r.instructions || [];
  const intermediate = r.instructions_intermediate || beginner;
  const experienced = r.instructions_experienced || intermediate;

  let shoppingHtml;
  if (needToBuyCount > 0) {
    shoppingHtml = `<div class="shopping-list-actions">
      <button class="shopping-list-btn" onclick="copyShoppingList(this)">&#128203; Copy shopping list (${needToBuyCount} items)</button>
    </div>`;
  } else {
    shoppingHtml = '<div class="all-in-pantry">&#9989; You have everything for this recipe!</div>';
  }

  return `
    <div class="modal-toolbar-placeholder"></div>
    <div class="recipe-modal-image">
      <span class="placeholder-cuisine">${escapeHtml(r.cuisine || 'Recipe')}</span>
      <span class="placeholder-difficulty ${difficultyClass}">${escapeHtml(r.difficulty || 'Easy')}</span>
    </div>
    <h2>${escapeHtml(r.title)}</h2>
    <p class="recipe-desc">${escapeHtml(r.description || '')}</p>
    <div class="recipe-meta">
      <span class="recipe-time">${escapeHtml(r.cookTime || '')}</span>
      <span class="recipe-difficulty ${difficultyClass}">${escapeHtml(r.difficulty || '')}</span>
      ${r.servings ? `<span class="recipe-servings">${r.servings} servings</span>` : ''}
    </div>
    <div class="recipe-columns">
      <div class="recipe-col-ingredients">
        <h3>Ingredients</h3>
        <ul class="ingredient-list">${ingredientHtml}</ul>
        ${shoppingHtml}
      </div>
      <div class="recipe-col-resizer" onmousedown="startRecipeColResize(event)" title="Drag to resize"></div>
      <div class="recipe-col-instructions">
        <h3>Instructions</h3>
        <ol class="instruction-list" x-show="$store.cook.bucket === 'beginner'">${instructionHtml(beginner)}</ol>
        <ol class="instruction-list" x-show="$store.cook.bucket === 'intermediate'" x-cloak>${instructionHtml(intermediate)}</ol>
        <ol class="instruction-list" x-show="$store.cook.bucket === 'experienced'" x-cloak>${instructionHtml(experienced)}</ol>
      </div>
    </div>
    ${r.nutrition ? `
    <div class="nutrition-info">
      <h3>Nutrition <span class="nutrition-per-serving">(per serving)</span></h3>
      <div class="nutrition-grid">
        ${nutItem(r.nutrition.calories, `${r.nutrition.calories}`, 'cal', 'calories', viewerRules)}
        ${nutItem(r.nutrition.protein_g, `${r.nutrition.protein_g}g`, 'protein', 'protein_g', viewerRules)}
        ${nutItem(r.nutrition.carbs_g, `${r.nutrition.carbs_g}g`, 'carbs', 'carbs_g', viewerRules)}
        ${nutItem(r.nutrition.fat_g, `${r.nutrition.fat_g}g`, 'fat', 'fat_g', viewerRules)}
        ${nutItem(r.nutrition.fiber_g, `${r.nutrition.fiber_g}g`, 'fiber', 'fiber_g', viewerRules)}
        ${nutItem(r.nutrition.sodium_mg, `${r.nutrition.sodium_mg}mg`, 'sodium', 'sodium_mg', viewerRules)}
      </div>
      <p class="nutrition-disclaimer">Estimates based on USDA reference data. Not lab-tested.</p>
    </div>` : ''}
    ${r.winePairing ? `
    <div class="wine-pairing">
      <h3>&#127863; Wine Pairing</h3>
      <p>${escapeHtml(r.winePairing)}</p>
    </div>` : ''}`;
}
