// Data access layer for Recipe Wizard Pro.
//
// All functions are async and scoped to the current user's household
// via Supabase RLS. The factory function createDB(supabase, profile)
// returns an object with every query method pre-bound to the user's
// context, so callers don't need to pass IDs around.
//
// Usage in API routes / pages:
//   const db = createDB(locals.supabase, locals.profile);
//   const pantry = await db.getPantry();

// ---------------------------------------------------------------------------
// Pure helpers (no DB access)
// ---------------------------------------------------------------------------

// Normalize a pantry item name to a base form: strip quantities, units,
// parentheticals, and trailing prep descriptors.
export function normalizePantryItem(name) {
  return String(name || '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/^[\d./\s]+/, '')
    .replace(/^\s*(oz|g|lb|lbs|cups?|tbsp|tsp|ml|kg|quarts?|pints?|gallons?|liters?)\b\.?\s*/i, '')
    .replace(/^\s*(cans?|bottles?|packages?|bags?|bunche?s?|heads?|stalks?|cloves?|slices?|pieces?|medium|large|small|whole)\b\s*/i, '')
    .replace(/^\s*of\s+/i, '')
    .replace(/,.*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function pluralVariants(name) {
  const v = [name];
  if (name.endsWith('ies')) {
    v.push(name.slice(0, -3) + 'y');
  } else if (name.endsWith('es')) {
    v.push(name.slice(0, -2));
    v.push(name.slice(0, -1));
  } else if (name.endsWith('s') && !name.endsWith('ss')) {
    v.push(name.slice(0, -1));
  } else {
    v.push(name + 's');
    v.push(name + 'es');
  }
  return v;
}

function preferPlural(a, b) {
  if (a.endsWith('s') && !b.endsWith('s')) return a;
  if (b.endsWith('s') && !a.endsWith('s')) return b;
  return a.length >= b.length ? a : b;
}

// ---------------------------------------------------------------------------
// Factory: create a household-scoped DB access object
// ---------------------------------------------------------------------------

export function createDB(supabase, profile) {
  const userId = profile?.id;
  const householdId = profile?.household_id;

  // Guard: most functions need a household. If the user has no profile
  // yet (e.g., during onboarding), return safe empty results.
  const needsHousehold = !householdId;

  return {
    // --- People (household members) ---

    async getPeople() {
      if (needsHousehold) return [];
      const [{ data: profiles }, { data: guests }] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('household_id', householdId)
          .order('created_at'),
        supabase
          .from('household_guests')
          .select('*')
          .eq('household_id', householdId)
          .is('converted_to_user_id', null)
          .order('created_at'),
      ]);
      const people = [];
      for (const p of (profiles || [])) {
        people.push({
          id: p.id,
          name: p.display_name || p.id.slice(0, 8),
          notes: p.notes,
          experience: p.experience,
          wine_pairing: p.wine_pairing,
          onboarded: p.onboarded,
          is_guest: false,
        });
      }
      for (const g of (guests || [])) {
        people.push({
          id: g.id,
          name: g.display_name,
          notes: g.notes,
          experience: g.experience,
          wine_pairing: g.wine_pairing,
          onboarded: true, // guests don't need onboarding
          is_guest: true,
        });
      }
      return people;
    },

    async updatePerson(personId, fields) {
      const allowed = ['display_name', 'notes', 'experience', 'wine_pairing', 'onboarded'];
      const update = {};
      for (const [k, v] of Object.entries(fields)) {
        if (allowed.includes(k)) update[k] = v;
      }
      if ('name' in fields && !('display_name' in fields)) {
        update.display_name = fields.name;
      }
      if (Object.keys(update).length === 0) return;

      // Detect whether personId is a registered profile or a guest
      const { data: guest } = await supabase
        .from('household_guests')
        .select('id')
        .eq('id', personId)
        .eq('household_id', householdId)
        .maybeSingle();
      if (guest) {
        // Guests don't have an 'onboarded' column; drop it if present
        delete update.onboarded;
        await supabase.from('household_guests').update(update).eq('id', personId);
      } else {
        await supabase.from('profiles').update(update).eq('id', personId);
      }
    },

    async isHouseholdOnboarded() {
      if (needsHousehold) return false;
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', householdId)
        .eq('onboarded', false);
      return count === 0;
    },

    // --- Guest members (non-registered household members) ---

    async getGuests() {
      if (needsHousehold) return [];
      const { data } = await supabase
        .from('household_guests')
        .select('*')
        .eq('household_id', householdId)
        .is('converted_to_user_id', null)
        .order('created_at');
      return data || [];
    },

    async addGuest(name, experience = 'beginner', wine_pairing = false, notes = null) {
      if (needsHousehold || !userId) return null;
      const { data } = await supabase
        .from('household_guests')
        .insert({
          household_id: householdId,
          display_name: name,
          experience,
          wine_pairing,
          notes,
          added_by: userId,
        })
        .select()
        .single();
      return data;
    },

    async updateGuest(guestId, fields) {
      const allowed = ['display_name', 'experience', 'wine_pairing', 'notes'];
      const update = {};
      for (const [k, v] of Object.entries(fields)) {
        if (allowed.includes(k)) update[k] = v;
      }
      if (Object.keys(update).length === 0) return;
      await supabase.from('household_guests').update(update).eq('id', guestId);
    },

    async removeGuest(guestId) {
      await supabase.from('household_guests').delete().eq('id', guestId);
    },

    // --- Preferences ---
    //
    // Preferences can be attached to either a registered user (user_id)
    // or a household guest (guest_id). Both are scoped to the household.

    async getPreferences() {
      if (needsHousehold) return [];
      // Fetch preferences and resolve display names from both profiles and guests
      const { data: prefs } = await supabase
        .from('preferences')
        .select('*')
        .eq('household_id', householdId)
        .order('category')
        .order('item');
      if (!prefs?.length) return [];

      // Resolve display names
      const userIds = [...new Set(prefs.map(p => p.user_id).filter(Boolean))];
      const guestIds = [...new Set(prefs.map(p => p.guest_id).filter(Boolean))];
      const nameMap = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds);
        for (const p of (profiles || [])) {
          nameMap['u:' + p.id] = p.display_name || 'Member';
        }
      }
      if (guestIds.length > 0) {
        const { data: guests } = await supabase
          .from('household_guests')
          .select('id, display_name')
          .in('id', guestIds);
        for (const g of (guests || [])) {
          nameMap['g:' + g.id] = g.display_name;
        }
      }
      return prefs.map(p => ({
        ...p,
        person_name: p.user_id ? nameMap['u:' + p.user_id] : nameMap['g:' + p.guest_id] || 'Unknown',
        is_guest: !!p.guest_id,
      }));
    },

    async getPreferencesForPrompt(forPersonIds = null) {
      // If forPersonIds is provided, filter to only those people (mix of
      // user_ids and guest_ids). Otherwise include all household members.
      let prefs = await this.getPreferences();
      if (forPersonIds && Array.isArray(forPersonIds) && forPersonIds.length > 0) {
        const set = new Set(forPersonIds);
        prefs = prefs.filter(p => set.has(p.user_id) || set.has(p.guest_id));
      }
      if (!prefs.length) return '';
      return prefs.map(p => {
        let line = `${p.person_name}${p.is_guest ? ' (resident)' : ''}: ${p.category.replace(/_/g, ' ')} — ${p.item}`;
        if (p.detail) line += ` (${p.detail})`;
        return line;
      }).join('\n');
    },

    async addPreference(personId, category, item, detail = null, source = null) {
      // personId might be a user_id (auth.users) or a guest_id
      // (household_guests). Detect by checking which table has it.
      let userIdToUse = null;
      let guestIdToUse = null;

      // Check guests first (smaller table per household, faster)
      const { data: guest } = await supabase
        .from('household_guests')
        .select('id')
        .eq('id', personId)
        .eq('household_id', householdId)
        .maybeSingle();
      if (guest) {
        guestIdToUse = personId;
      } else {
        userIdToUse = personId;
      }

      await supabase.from('preferences').insert({
        user_id: userIdToUse,
        guest_id: guestIdToUse,
        household_id: householdId,
        category, item, detail, source,
      });
    },

    // --- Pantry ---

    async getPantry() {
      if (needsHousehold) return [];
      const { data } = await supabase
        .from('pantry')
        .select('*')
        .eq('household_id', householdId)
        .neq('confidence', 'depleted')
        .order('item');
      return data || [];
    },

    async getPantryForPrompt() {
      const items = await this.getPantry();
      if (!items.length) return '';
      return items.map(i => {
        let line = `${i.item} (${i.confidence})`;
        if (i.category) line = `[${i.category}] ${line}`;
        if (i.notes) line += ` — ${i.notes}`;
        return line;
      }).join('\n');
    },

    async getPantryItemNames() {
      const items = await this.getPantry();
      return items.map(i => i.item.toLowerCase());
    },

    async upsertPantryItem(item, category = null, confidence = 'likely', notes = null, source = null) {
      const normalized = normalizePantryItem(item);
      if (!normalized || needsHousehold) return;

      // Check exact match first, then plural variants
      let existing = null;
      for (const variant of [normalized, ...pluralVariants(normalized)]) {
        const { data } = await supabase
          .from('pantry')
          .select('id, item')
          .eq('household_id', householdId)
          .ilike('item', variant)
          .limit(1)
          .single();
        if (data) { existing = data; break; }
      }

      if (existing) {
        const preferred = preferPlural(normalized, existing.item.toLowerCase());
        const update = {
          confidence,
          modified_at: new Date().toISOString(),
        };
        if (notes) update.notes = notes;
        if (category) update.category = category;
        if (source) update.source = source;
        if (preferred !== existing.item.toLowerCase()) update.item = preferred;
        await supabase.from('pantry').update(update).eq('id', existing.id);
      } else {
        await supabase.from('pantry').insert({
          household_id: householdId,
          item: normalized, category, confidence, notes, source,
        });
      }
    },

    async removePantryItem(id) {
      await supabase.from('pantry').update({
        confidence: 'depleted',
        modified_at: new Date().toISOString(),
      }).eq('id', id);
    },

    async getPantryItemByName(name) {
      if (needsHousehold) return null;
      const { data } = await supabase
        .from('pantry')
        .select('id, item, confidence')
        .eq('household_id', householdId)
        .ilike('item', name)
        .neq('confidence', 'depleted')
        .limit(1)
        .single();
      return data || null;
    },

    async updatePantryConfidence(id, confidence) {
      await supabase.from('pantry').update({
        confidence,
        modified_at: new Date().toISOString(),
      }).eq('id', id);
    },

    // --- Conversations ---

    async getRecentConversations(limit = 20) {
      if (needsHousehold || !userId) return [];
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('household_id', householdId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);
      return (data || []).reverse();
    },

    async addConversation(role, content) {
      if (needsHousehold || !userId) return;
      await supabase.from('conversations').insert({
        household_id: householdId,
        user_id: userId,
        role, content,
      });
    },

    async clearConversations() {
      if (needsHousehold || !userId) return;
      await supabase
        .from('conversations')
        .delete()
        .eq('household_id', householdId)
        .eq('user_id', userId);
    },

    async pruneOldConversations(keepCount = 40) {
      if (needsHousehold || !userId) return;
      const { data } = await supabase
        .from('conversations')
        .select('id')
        .eq('household_id', householdId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(keepCount);
      if (!data || data.length < keepCount) return;
      const keepIds = data.map(r => r.id);
      await supabase
        .from('conversations')
        .delete()
        .eq('household_id', householdId)
        .eq('user_id', userId)
        .not('id', 'in', `(${keepIds.join(',')})`);
    },

    // --- Bookmarks (Saved Recipes) ---

    async getBookmarks() {
      if (needsHousehold) return [];
      const { data } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false });
      return (data || []).map(b => ({
        ...b,
        recipe: typeof b.recipe_json === 'string' ? JSON.parse(b.recipe_json) : b.recipe_json,
      }));
    },

    async addBookmark(recipe, notes = null) {
      if (needsHousehold) return null;
      const { data } = await supabase
        .from('bookmarks')
        .insert({
          household_id: householdId,
          saved_by: userId,
          recipe_json: recipe,
          notes,
        })
        .select('id')
        .single();
      return data;
    },

    async removeBookmark(id) {
      await supabase.from('bookmarks').delete().eq('id', id);
    },

    async searchBookmarks(query) {
      const bookmarks = await this.getBookmarks();
      if (!query || !query.trim()) return bookmarks;
      const terms = query.toLowerCase().split(/\s+/);
      return bookmarks.filter(b => {
        const r = b.recipe;
        const searchable = [
          r.title, r.description, r.cuisine, r.difficulty,
          ...(r.ingredients || []),
          r.winePairing || ''
        ].join(' ').toLowerCase();
        return terms.every(term => searchable.includes(term));
      });
    },

    // --- Usage tracking ---

    async getUsage() {
      if (!userId) return 0;
      const { data } = await supabase.rpc('get_usage', { p_user_id: userId });
      return data || 0;
    },

    async incrementUsage() {
      if (!userId) return 0;
      const { data } = await supabase.rpc('increment_usage', { p_user_id: userId });
      return data || 0;
    },

    // --- Usage gate: can this user generate recipes? ---
    // Household-level benefit: if ANY member of the household has an
    // unlimited tier (subscriber/friend/admin), all members get unlimited
    // access. This is fairer than per-user billing for shared households
    // and encourages one person to subscribe on behalf of the family.

    async canGenerate() {
      if (!profile) return { allowed: false, reason: 'not_authenticated' };
      const myTier = profile.tier || 'free';
      // Self unlimited: fastest path, no extra query
      if (myTier === 'subscriber' || myTier === 'friend' || myTier === 'admin') {
        return { allowed: true, tier: myTier, usage: null, limit: null };
      }
      // Household unlimited: check if any other member has unlimited tier
      if (!needsHousehold) {
        const { data } = await supabase
          .from('profiles')
          .select('tier')
          .eq('household_id', householdId)
          .in('tier', ['subscriber', 'friend', 'admin']);
        if (data && data.length > 0) {
          return { allowed: true, tier: myTier, householdTier: data[0].tier, usage: null, limit: null };
        }
      }
      // Free tier: 10 per month
      const usage = await this.getUsage();
      const limit = 10;
      if (usage >= limit) {
        return { allowed: false, reason: 'limit_reached', tier: myTier, usage, limit };
      }
      return { allowed: true, tier: myTier, usage, limit };
    },

    // --- Feedback (deferred) ---

    async addFeedback(bookmarkId, rating, comment) {
      await supabase.from('feedback').insert({
        user_id: userId,
        bookmark_id: bookmarkId,
        rating, comment,
      });
    },

    // --- Notifications ---

    async getNotifications(unreadOnly = false) {
      if (!userId) return [];
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (unreadOnly) query = query.eq('read', false);
      const { data } = await query;
      return data || [];
    },

    async markNotificationRead(id) {
      await supabase.from('notifications').update({ read: true }).eq('id', id);
    },

    // --- Household management ---

    async getHousehold() {
      if (needsHousehold) return null;
      const { data } = await supabase
        .from('households')
        .select('*')
        .eq('id', householdId)
        .single();
      return data;
    },

    async getHouseholdMembers() {
      return this.getPeople();
    },

    async sendInvite(email) {
      if (needsHousehold || !userId) return null;
      const { data } = await supabase
        .from('household_invites')
        .insert({
          household_id: householdId,
          invited_by: userId,
          invited_email: email.toLowerCase().trim(),
        })
        .select()
        .single();
      return data;
    },

    async getPendingInvites() {
      if (needsHousehold) return [];
      const { data } = await supabase
        .from('household_invites')
        .select('*')
        .eq('household_id', householdId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      return data || [];
    },

    // --- Activity Logging ---

    async logActivity(action, detail = null) {
      if (!userId || !profile?.beta_tester) return;
      await supabase.from('activity_log').insert({
        user_id: userId,
        household_id: householdId || null,
        action,
        detail,
      }).then(() => {}).catch(() => {});
    },

    // Expose context for callers that need it
    userId,
    householdId,
    profile,
  };
}
