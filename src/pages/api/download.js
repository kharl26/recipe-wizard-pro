// GET /api/download?id=xxx — download a single recipe as text or JSON
// GET /api/download?all=true&format=text|json — download all saved recipes
// Query params: format=text (default) or format=json

import { createDB } from '../../lib/db.js';

function recipeToText(recipe) {
  const r = typeof recipe === 'string' ? JSON.parse(recipe) : recipe;
  const lines = [];
  lines.push(r.title || 'Untitled');
  lines.push('='.repeat((r.title || '').length));
  if (r.description) lines.push(r.description);
  lines.push('');
  if (r.cookTime) lines.push(`Cook time: ${r.cookTime}`);
  if (r.difficulty) lines.push(`Difficulty: ${r.difficulty}`);
  if (r.servings) lines.push(`Servings: ${r.servings}`);
  if (r.cuisine) lines.push(`Cuisine: ${r.cuisine}`);
  lines.push('');
  lines.push('INGREDIENTS');
  lines.push('-----------');
  for (const i of (r.ingredients || [])) {
    lines.push(`  - ${i}`);
  }
  lines.push('');
  lines.push('INSTRUCTIONS');
  lines.push('------------');
  for (let i = 0; i < (r.instructions || []).length; i++) {
    lines.push(`  ${i + 1}. ${r.instructions[i]}`);
  }
  if (r.winePairing) {
    lines.push('');
    lines.push('WINE PAIRING');
    lines.push(r.winePairing);
  }
  lines.push('');
  return lines.join('\n');
}

export async function GET({ url, locals }) {
  if (!locals.user || !locals.profile) {
    return new Response('Unauthorized', { status: 401 });
  }

  const db = createDB(locals.supabase, locals.profile);
  const format = url.searchParams.get('format') || 'text';
  const downloadAll = url.searchParams.get('all') === 'true';
  const id = url.searchParams.get('id');

  try {
    await db.logActivity('recipe_download', { format, all: downloadAll, bookmark_id: id || null });
    if (downloadAll) {
      const bookmarks = await db.getBookmarks();
      if (bookmarks.length === 0) {
        return new Response('No saved recipes to download.', { status: 404 });
      }

      if (format === 'json') {
        const recipes = bookmarks.map(b => b.recipe);
        return new Response(JSON.stringify(recipes, null, 2), {
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="recipe-wizard-all-recipes.json"',
          },
        });
      }

      // Text format
      const text = bookmarks.map(b => recipeToText(b.recipe)).join('\n' + '='.repeat(60) + '\n\n');
      return new Response(text, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="recipe-wizard-all-recipes.txt"',
        },
      });
    }

    // Single recipe download
    if (!id) return new Response('Missing id', { status: 400 });

    const bookmarks = await db.getBookmarks();
    const bookmark = bookmarks.find(b => b.id === id);
    if (!bookmark) return new Response('Recipe not found', { status: 404 });

    const r = bookmark.recipe;
    const safeTitle = (r.title || 'recipe').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();

    if (format === 'json') {
      return new Response(JSON.stringify(r, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${safeTitle}.json"`,
        },
      });
    }

    return new Response(recipeToText(r), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeTitle}.txt"`,
      },
    });
  } catch (err) {
    console.error('Download error:', err);
    return new Response('Download failed', { status: 500 });
  }
}
