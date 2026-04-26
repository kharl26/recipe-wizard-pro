import { createDB } from '../../lib/db.js';
import { renderPantrySection } from '../../lib/pantry-render.js';

async function htmlResponse(db) {
  const pantry = await db.getPantry();
  return new Response(renderPantrySection(pantry), {
    headers: { 'Content-Type': 'text/html' },
  });
}

export async function POST({ request, locals }) {
  if (!locals.user || !locals.profile) return new Response('Unauthorized', { status: 401 });
  const db = createDB(locals.supabase, locals.profile);
  try {
    const data = await request.formData();
    const item = data.get('item')?.toString().trim();
    if (!item) return new Response('Missing item', { status: 400 });
    await db.logActivity('pantry_add', { item });
    await db.upsertPantryItem(item, null, 'certain', null, 'sidebar-add');
    return htmlResponse(db);
  } catch (err) {
    console.error('Pantry add error:', err);
    return new Response('Failed to add item', { status: 500 });
  }
}

export async function PATCH({ url, locals }) {
  if (!locals.user || !locals.profile) return new Response('Unauthorized', { status: 401 });
  const db = createDB(locals.supabase, locals.profile);
  try {
    const item = url.searchParams.get('item')?.trim();
    const confidence = url.searchParams.get('confidence')?.trim();
    const rename = url.searchParams.get('rename')?.trim();
    const category = url.searchParams.get('category');
    const row = item ? await db.getPantryItemByName(item) : null;

    if (confidence) {
      const valid = ['certain', 'likely', 'maybe'];
      if (!item || !valid.includes(confidence)) return new Response('Invalid', { status: 400 });
      await db.logActivity('pantry_update', { item, confidence });
      if (row) await db.updatePantryConfidence(row.id, confidence);
    } else if (rename) {
      if (!item || !row) return new Response('Item not found', { status: 404 });
      await db.logActivity('pantry_rename', { from: item, to: rename });
      await db.renamePantryItem(row.id, rename);
    } else if (category !== null && category !== undefined) {
      if (!item || !row) return new Response('Item not found', { status: 404 });
      await db.logActivity('pantry_category', { item, category });
      await db.updatePantryCategory(row.id, category);
    } else {
      return new Response('Missing action', { status: 400 });
    }

    return htmlResponse(db);
  } catch (err) {
    console.error('Pantry update error:', err);
    return new Response('Failed to update item', { status: 500 });
  }
}

export async function DELETE({ url, locals }) {
  if (!locals.user || !locals.profile) return new Response('Unauthorized', { status: 401 });
  const db = createDB(locals.supabase, locals.profile);
  try {
    const item = url.searchParams.get('item')?.trim();
    if (!item) return new Response('Missing item', { status: 400 });
    await db.logActivity('pantry_remove', { item });
    const row = await db.getPantryItemByName(item);
    if (row) await db.removePantryItem(row.id);
    return htmlResponse(db);
  } catch (err) {
    console.error('Pantry remove error:', err);
    return new Response('Failed to remove item', { status: 500 });
  }
}
