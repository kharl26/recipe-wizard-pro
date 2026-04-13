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

export function renderPantrySection(pantry) {
  const itemsHtml = pantry.length === 0
    ? `<div class="sidebar-empty">Tell me what you have and I'll remember!</div>`
    : pantry.map(item => {
        const conf = item.confidence || 'likely';
        const label = CONFIDENCE_LABELS[conf] || conf;
        const nextConf = CONFIDENCE_NEXT[conf] || 'certain';
        return `
        <div class="sidebar-item pantry-item">
          <span class="pantry-name confidence-${escapeHtml(conf)}">${escapeHtml(item.item)}</span>
          <span class="pantry-confidence confidence-badge-${escapeHtml(conf)}"
                hx-patch="/api/pantry?item=${encodeURIComponent(item.item)}&confidence=${encodeURIComponent(nextConf)}"
                hx-target="#pantry-section"
                hx-swap="outerHTML"
                title="Click to change (${conf} → ${nextConf})">${label}</span>
          <button type="button" class="pantry-remove"
                  hx-delete="/api/pantry?item=${encodeURIComponent(item.item)}"
                  hx-target="#pantry-section"
                  hx-swap="outerHTML"
                  hx-confirm="Remove ${escapeHtml(item.item)} from pantry?"
                  title="Remove from pantry">&times;</button>
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
        <button type="submit" title="Add to pantry">+</button>
      </form>
      <div class="pantry-list">${itemsHtml}</div>
    </div>`;
}
