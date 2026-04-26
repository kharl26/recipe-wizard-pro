// Shared HTML for the sidebar pantry section. Used by both the SSR path
// (pages/index.astro on initial page load) and the HTMX endpoint
// (pages/api/pantry.js for live add/remove). Both call renderPantrySection
// so the markup stays in sync.

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CONFIDENCE_LABELS = { certain: 'have', likely: 'likely', maybe: 'maybe' };
const CONFIDENCE_NEXT = { certain: 'likely', likely: 'maybe', maybe: 'certain' };

const CATEGORIES = [
  'protein', 'produce', 'dairy', 'grains', 'spices',
  'condiments', 'oils', 'baking', 'beverages', 'spirits', 'other'
];

export function renderPantrySection(pantry) {
  const cats = [...new Set(pantry.map(i => i.category || 'uncategorized').filter(Boolean))].sort();

  const filterHtml = cats.length > 1 ? `
    <div class="pantry-filters" x-data="{ mode: 'all' }">
      <div class="pantry-filter-buttons">
        <button class="pantry-filter-btn" :class="mode === 'all' && 'active'" @click="mode = 'all'" title="Show all">All</button>
        <button class="pantry-filter-btn" :class="mode === 'show' && 'active'" @click="mode = mode === 'show' ? 'all' : 'show'" title="Show only checked categories">Show</button>
        <button class="pantry-filter-btn" :class="mode === 'hide' && 'active'" @click="mode = mode === 'hide' ? 'all' : 'hide'" title="Hide checked categories">Hide</button>
      </div>
      <div class="pantry-filter-cats" x-show="mode !== 'all'" x-cloak>
        ${cats.map(c => `<label class="pantry-cat-check"><input type="checkbox" value="${escapeHtml(c)}" @change="$dispatch('pantry-filter-change')"> ${escapeHtml(c)}</label>`).join('')}
      </div>
    </div>` : '';

  const itemsHtml = pantry.length === 0
    ? `<div class="sidebar-empty">Tell me what you have and I'll remember!</div>`
    : pantry.map(item => {
        const conf = item.confidence || 'likely';
        const label = CONFIDENCE_LABELS[conf] || conf;
        const nextConf = CONFIDENCE_NEXT[conf] || 'certain';
        const cat = item.category || 'uncategorized';
        const escapedItem = escapeHtml(item.item);
        const encodedItem = encodeURIComponent(item.item);
        return `
        <div class="sidebar-item pantry-item" data-category="${escapeHtml(cat)}">
          <span class="pantry-name confidence-${escapeHtml(conf)}"
                title="Click to edit name. Enter to save, Escape to cancel."
                onclick="editPantryItem(this, '${encodedItem}')">${escapedItem}</span>
          <select class="pantry-cat-select" title="Set category (hover to see)"
                  onchange="changePantryCategory('${encodedItem}', this.value)"
                  ><option value="">--</option>${CATEGORIES.map(c =>
                    `<option value="${c}"${c === item.category ? ' selected' : ''}>${c}</option>`
                  ).join('')}</select>
          <span class="pantry-confidence confidence-badge-${escapeHtml(conf)}"
                hx-patch="/api/pantry?item=${encodedItem}&confidence=${encodeURIComponent(nextConf)}"
                hx-target="#pantry-section"
                hx-swap="outerHTML"
                title="Confidence: ${conf}. Click to cycle → ${nextConf}.">${label}</span>
          <button type="button" class="pantry-remove"
                  hx-delete="/api/pantry?item=${encodedItem}"
                  hx-target="#pantry-section"
                  hx-swap="outerHTML"
                  hx-confirm="Remove ${escapedItem} from pantry?"
                  title="Remove this item from pantry">&times;</button>
        </div>`;
      }).join('');

  return `
    <div id="pantry-section" class="sidebar-section pantry-section">
      <h3>Pantry (${pantry.length} items)</h3>
      <form class="pantry-add-form"
            hx-post="/api/pantry"
            hx-target="#pantry-section"
            hx-swap="outerHTML"
            hx-on::after-request="this.reset()">
        <input type="text" name="item" placeholder="Add item..." autocomplete="off" required>
        <button type="submit" title="Add item to pantry">+</button>
      </form>
      <div class="pantry-search-row">
        <span class="pantry-search-icon">&#128269;</span>
        <input type="text" class="pantry-search" placeholder="Search pantry..." autocomplete="off"
               oninput="searchPantry(this.value)">
      </div>
      ${filterHtml}
      <div class="pantry-list-wrap">
      <div class="pantry-list"
           onscroll="updatePantryScrollIndicators(this)"
           @pantry-filter-change.window="
             const mode = $el.closest('.pantry-section')?.querySelector('.pantry-filter-buttons .active')?.textContent?.trim()?.toLowerCase();
             const checks = [...$el.closest('.pantry-section')?.querySelectorAll('.pantry-cat-check input:checked') || []].map(c => c.value);
             $el.querySelectorAll('.pantry-item').forEach(item => {
               const cat = item.dataset.category;
               if (!mode || mode === 'all' || checks.length === 0) { item.style.display = ''; }
               else if (mode === 'show') { item.style.display = checks.includes(cat) ? '' : 'none'; }
               else if (mode === 'hide') { item.style.display = checks.includes(cat) ? 'none' : ''; }
             });
           ">${itemsHtml}</div>
      </div>
    </div>`;
}
