// Unsplash image proxy — returns an <img> tag for the recipe card
// Falls back to a placeholder if Unsplash key is not set or request fails

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || import.meta.env.UNSPLASH_ACCESS_KEY;

export async function GET({ url }) {
  const query = url.searchParams.get('q') || 'food';

  if (!UNSPLASH_KEY || UNSPLASH_KEY === 'your-unsplash-key-here') {
    // No Unsplash key — return a CSS placeholder
    return new Response(
      `<div class="img-placeholder" style="background:#f5e6d3;display:flex;align-items:center;justify-content:center;height:100%;font-size:2rem;">&#127869;</div>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  try {
    const resp = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    );

    if (!resp.ok) throw new Error(`Unsplash ${resp.status}`);

    const data = await resp.json();
    const photo = data.results?.[0];

    if (!photo) {
      return new Response(
        `<div class="img-placeholder" style="background:#f5e6d3;display:flex;align-items:center;justify-content:center;height:100%;font-size:2rem;">&#127869;</div>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    return new Response(
      `<img src="${photo.urls.regular}" alt="${photo.alt_description || query}" loading="lazy" class="recipe-img">
       <span class="img-credit">Photo by <a href="${photo.user.links.html}?utm_source=recipe_wizard&utm_medium=referral" target="_blank">${photo.user.name}</a> on <a href="https://unsplash.com/?utm_source=recipe_wizard&utm_medium=referral" target="_blank">Unsplash</a></span>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  } catch {
    return new Response(
      `<div class="img-placeholder" style="background:#f5e6d3;display:flex;align-items:center;justify-content:center;height:100%;font-size:2rem;">&#127869;</div>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}
