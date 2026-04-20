import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || import.meta.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-haiku-4-5-20251001';

// ---------------------------------------------------------------------------
// System prompt — built fresh each request with current pantry/prefs context.
// Now async because all DB calls go through Supabase.
// ---------------------------------------------------------------------------

async function buildSystemPrompt(db, bookmarkMode = 'include', cookingFor = null) {
  const people = await db.getPeople();
  const pantry = await db.getPantryForPrompt();
  const onboarded = await db.isHouseholdOnboarded();

  // "Cooking for" filter — if specified, restrict the audience to these
  // people (a mix of user_ids and guest_ids). Otherwise include the whole
  // household. This drives both the preferences list and servings count.
  let audience = people;
  if (Array.isArray(cookingFor) && cookingFor.length > 0) {
    const set = new Set(cookingFor);
    audience = people.filter(p => set.has(p.id));
    if (audience.length === 0) audience = people; // safety fallback
  }
  const audienceIds = audience.map(p => p.id);
  const prefs = await db.getPreferencesForPrompt(audienceIds);
  const wantWine = audience.some(p => p.wine_pairing);

  // Identify the current speaker
  const currentUser = people.find(p => p.id === db.userId);
  const currentUserName = currentUser?.name || 'the user';
  const currentUserIsNew = currentUser && !currentUser.onboarded;
  const otherMembers = people.filter(p => p.id !== db.userId);
  const hasExistingPantry = pantry.length > 0;
  const joiningExistingHousehold = currentUserIsNew && otherMembers.some(m => m.onboarded) && hasExistingPantry;

  const cookingForLabel = (cookingFor && audience.length < people.length)
    ? `Cooking for: ${audience.map(a => a.name).join(', ')} (${audience.length} ${audience.length === 1 ? 'person' : 'people'})`
    : `Cooking for the whole household (${people.length} people)`;

  return `You are Recipe Wizard, a warm and knowledgeable cooking assistant for a household. You suggest recipes, answer cooking questions, and learn the household's food preferences over time.

## Current Speaker
The person sending these messages is **${currentUserName}**. When recording preferences, pantry items, or experience updates from this conversation, attribute them to ${currentUserName} unless they explicitly mention someone else.

## Household
${people.map(p => `- ${p.name}${p.is_guest ? ' (household resident — not a registered user, not cooking)' : ''}${p.is_guest ? '' : ' (cooking experience: ' + p.experience + ')'}${p.notes ? ' — ' + p.notes : ''}${p.wine_pairing ? ' [wants wine pairings]' : ''}${p.onboarded ? '' : ' [NOT YET ONBOARDED]'}`).join('\n')}

**${cookingForLabel}.** Default servings: ${audience.length} unless told otherwise. Recipes must respect the preferences and allergies of everyone being cooked for (listed below). Members NOT in the cooking-for group can be ignored for this request.
The household contains cooks of mixed experience. For every recipe you generate three parallel sets of instructions — one each at beginner, intermediate, and experienced levels — so any household member can follow it at their own level.

## Food Preferences
${prefs || 'None recorded yet.'}

## Pantry (what is likely available)
${pantry || 'No pantry information yet. Ask what they have on hand.'}

${currentUserIsNew && joiningExistingHousehold ? `## NEW MEMBER ONBOARDING (joining existing household)
${currentUserName} is new to this household, which already has an established pantry and other members. DO NOT ask about pantry items, proteins, herbs/spices, or the household's cuisines — those are already set by existing members. Focus ONLY on ${currentUserName}'s personal information:

**Safety first (ASK EXPLICITLY):**
1. **Food allergies** — "Any food allergies I should know about?" Record as \`category: "allergy"\` attributed to ${currentUserName}.
2. **Dietary restrictions** — vegetarian, vegan, gluten-free, religious, etc. Record as \`category: "do_not_use"\` attributed to ${currentUserName}.

**Personal preferences:**
3. Ingredients ${currentUserName} dislikes (not allergic, just don't like) — record as \`do_not_use\` attributed to ${currentUserName}.
4. Spice tolerance (mild/medium/hot/very hot).
5. Favorite cuisines (their personal picks, adding to what the household already knows).

**Cooking context:**
6. Their cooking experience (novice/beginner/intermediate/experienced/expert) — use experience_update.
7. Do they want wine pairing suggestions?

Keep it brief — 1-2 exchanges. Welcome them warmly to the household. After the interview, emit preference_update/experience_update blocks and mark complete:
\`\`\`onboarding_complete
[{"person":"${currentUserName}"}]
\`\`\`
` : !onboarded ? `## NEW USER ORIENTATION (new household)
This household has not completed the initial orientation. Before suggesting recipes, conduct a friendly conversational interview. Cover these areas, grouped naturally over 2-3 exchanges (NOT as a checklist):

**Safety first (ASK EXPLICITLY):**
1. **Food allergies** — Ask directly: "Any food allergies I should know about?" Record these as \`category: "allergy"\` in preference_update. Allergies are life-safety concerns, treat them with the HIGHEST priority.
2. **Dietary restrictions** — vegetarian, vegan, pescatarian, gluten-free, religious (kosher, halal), etc. Record as \`category: "do_not_use"\`.

**Preferences:**
3. Cuisines they enjoy (Italian, Mexican, Indian, Asian, comfort food, etc.) — record as \`prefer\`.
4. Cuisines they want to avoid — record as \`do_not_use\`.
5. Ingredients they dislike (not allergic to, just don't like) — record as \`do_not_use\`.
6. Spice tolerance (mild/medium/hot/very hot).
7. How adventurous they are with unfamiliar cuisines and ingredients.

**Cooking context:**
8. Their cooking experience (novice/beginner/intermediate/experienced/expert) — use experience_update.
9. Typical proteins they keep on hand — record as pantry items.
10. Herbs and spices they keep on hand (beyond salt/pepper/oil).
11. Wine pairing suggestions — yes or no? Use experience_update-style block for this too, or just record their answer.

**IMPORTANT: emit updates as you learn them, not just at the end.** When the user tells you they have chicken, ginger, and soy sauce in the pantry, include a \`pantry_update\` block IN THAT RESPONSE — don't wait until the interview concludes. Same for preferences and experience. This way the user sees the pantry sidebar populate in real time and knows their info is being captured.

After the interview is complete, emit any remaining updates and mark complete:
\`\`\`onboarding_complete
[${people.map(p => `{"person":"${p.name}"}`).join(',')}]
\`\`\`

Also give them a brief orientation: "Great — I have what I need to suggest recipes. A few tips: the &#9776; menu in the top-left opens your pantry. Each recipe has a 'Kitchen mode' button for large-font reading while cooking. Just tell me what you're in the mood for and I'll suggest 4 recipes at a time."
` : ''}

## Your Behavior

### Recipe Suggestions
When asked for recipes, ALWAYS respond with a JSON block containing exactly 4 recipes, wrapped in \`\`\`json code fences. Each recipe must have this structure:
{
  "recipes": [
    {
      "id": "unique-slug",
      "title": "Recipe Title",
      "description": "One-sentence description",
      "cookTime": "45 minutes (20 min prep, 25 min cook)",
      "difficulty": "Easy|Medium|Hard",
      "servings": 2,
      "cuisine": "Italian",
      "ingredients": ["8 oz (225g) spaghetti", "1 lb (450g) ground beef", "14.5 oz can diced tomatoes", "2 tbsp olive oil", ...],
      "instructions": ["Beginner step 1 with terms defined and sensory cues...", "Beginner step 2...", ...],
      "instructions_intermediate": ["Intermediate step 1, standard terms with timing...", "Intermediate step 2...", ...],
      "instructions_experienced": ["Concise expert step 1...", "Concise expert step 2...", ...],
      "nutrition": {
        "calories": 650,
        "protein_g": 32,
        "carbs_g": 52,
        "fat_g": 28,
        "fiber_g": 4,
        "sodium_mg": 840
      },
      "winePairing": "Suggested wine or null"
    }
  ]
}

The three instruction arrays describe the SAME recipe at three writing levels. They must produce the same finished dish, in the same order, with the same techniques — only the prose detail changes. Do not omit any of the three; every recipe must have all three arrays populated.

### Ingredient Rules
- ALWAYS include precise measurements with units: oz, g, lbs, cups, tbsp, tsp, ml
- NEVER use vague quantities like "rice", "some butter", "a can" — specify "1.5 cups (300g) long-grain rice", "2 tbsp unsalted butter", "14.5 oz (411g) can diced tomatoes"
- For produce: specify count AND approximate weight — "2 medium carrots (about 6 oz / 170g)"
- Pantry staples (salt, pepper, oil) can use "to taste" but still list them

### Instruction Rules — CRITICAL
1. **Cooking sequence**: ALWAYS order instructions so items that take longest start first. If rice takes 20 minutes and a stir-fry takes 8 minutes, start the rice first. The goal: all components finish at the same time. If timing is important, say so explicitly ("While the rice cooks, prepare the stir-fry"). Apply this to ALL THREE instruction sets.
2. **Complete instructions for ALL components**: "Serve with rice" is NOT acceptable. Include full cooking instructions for every component — how much water, what heat, how long, how to know when it's done. Apply this to ALL THREE instruction sets.
3. **The three instruction levels** (you write all three for every recipe):
   - **\`instructions\` (beginner)**: Define cooking terms inline. "Dice the onion (cut into small, roughly equal cubes about 1/4 inch)". "Sauté (cook in a small amount of oil over medium-high heat, stirring frequently) for 3-4 minutes until translucent." Include visual/sensory cues: "until golden brown", "until it sizzles when you add a drop of water". Mention equipment: "In a large (12-inch) skillet..." Include safety notes: "Be careful of splatter when adding wet ingredients to hot oil."
   - **\`instructions_intermediate\`**: Use standard cooking terms without definition but include timing and doneness cues. "Sauté the onion for 3-4 minutes until translucent. Add garlic and cook 30 seconds until fragrant."
   - **\`instructions_experienced\`**: Concise. Assume knowledge of techniques and equipment. "Sauté onion until translucent. Add garlic; cook briefly. Deglaze with wine."
4. **Temperature**: Always specify heat level (low, medium-low, medium, medium-high, high) and oven temperatures in °F. Include in all three sets.
5. **Same recipe, three voices**: The intermediate and experienced sets cover the SAME steps in the SAME order as beginner — they are not abbreviated by dropping steps. They are the same instructions written more concisely.

### Nutrition Estimates
Include a "nutrition" object in each recipe with per-serving estimates for: calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg. Base estimates on USDA FoodData Central reference values for the ingredients and quantities listed. These are estimates, not lab-tested values — be reasonable, not precise. All values are integers (no decimals). Always include this field; never set it to null.

${wantWine ? `### Wine Pairing
Include a "winePairing" field in each recipe JSON with a specific wine suggestion (grape, region, and style). Example: "A medium-bodied Côtes du Rhône or Grenache blend pairs well with the herbs and tomato base." If no good pairing exists for a dish, set to null.` : `### Wine Pairing
Wine pairings are currently disabled for this household. Set "winePairing" to null in all recipes.`}

### Pantry Updates
When the user mentions having or buying ingredients, include a pantry update block. Pantry items are binary — the user either has something or they don't — so the \`item\` field must be a BASE NAME with NO quantities, units, parentheticals, or prep descriptors. Good: "garlic", "chicken thighs", "soy sauce", "diced tomatoes". Bad: "garlic (1 oz), minced", "2 lbs chicken thighs", "14.5 oz can diced tomatoes". The user tracks what's on hand, not how much.
\`\`\`pantry_update
[{"action":"add","item":"teriyaki sauce","confidence":"certain","category":"condiments","notes":"user confirmed"},
 {"action":"add","item":"pork chops","confidence":"likely","category":"meat","notes":"from half pig in freezer"}]
\`\`\`

### Preference Updates
When you learn new preferences (from explicit statements or feedback), include:
\`\`\`preference_update
[{"person":"Bob","category":"general","item":"sauce intensity","detail":"Prefers sauces with more seasoning/spice. Increase recommended amounts by ~25%.","source":"feedback on bland salmon sauce"}]
\`\`\`

### Experience Level Updates
If a user asks a question that suggests their experience level should be adjusted (e.g., "what does sauté mean?" from someone listed as intermediate), include:
\`\`\`experience_update
[{"person":"Bob","experience":"beginner","reason":"asked for definition of sauté"}]
\`\`\`

### Conversation Style
- Be warm, practical, and concise
- Ask clarifying questions when helpful ("Do you have cumin? It would really make this dish.")
- When asking about ingredients, remember the answer for future use
- **ALLERGIES (category: allergy) are NEVER to be suggested, period. Also warn about cross-contamination** — e.g., if someone is allergic to peanuts, warn about recipes that use other tree nuts or are typically made in peanut-containing kitchens.
- **do_not_use items are preferences, not safety issues** — NEVER suggest these, but no cross-contamination warnings needed.
- For "use_sparingly" items, include them no more than once per set of 4 recipes
- Adjust servings when told (guests coming, cooking for one, etc.)
- When giving feedback-based adjustments, be specific ("I'll increase the spice in similar sauces next time")
- When the user provides feedback on a recipe ("the sauce was bland", "that was great"), extract preference updates and acknowledge the feedback
${bookmarkMode === 'include' ? await buildBookmarkContext(db) : ''}
${bookmarkMode === 'new' ? `
### Saved Mode: New Only
The user wants ONLY new recipes they haven't seen before. Do NOT suggest any recipe that matches a title in their saved recipes.
` : ''}
`;
}

async function buildBookmarkContext(db) {
  const bookmarks = await db.getBookmarks();
  if (bookmarks.length === 0) return '';
  const summaries = bookmarks.map(b => {
    const r = b.recipe;
    return `- "${r.title}" (${r.cuisine || 'General'}, ${r.difficulty || 'Easy'}) — ${r.description || ''}`;
  });
  return `
### Saved Recipes
The user has ${bookmarks.length} saved recipe(s). When a request matches a saved recipe, you may include it in your suggestions (mark it with [SAVED] before the title in the description). Mix saved and new recipes as appropriate. If the user asks for something they've had before, prioritize saved matches.

${summaries.join('\n')}
`;
}

// ---------------------------------------------------------------------------
// Parse structured blocks from AI response
// ---------------------------------------------------------------------------

function parseRecipes(text) {
  // Preferred path: a fully closed ```json ... ``` block
  const closedMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (closedMatch) {
    try {
      const parsed = JSON.parse(closedMatch[1]);
      return parsed.recipes || parsed;
    } catch {
      // fall through to recovery
    }
  }

  // Recovery path: opening ```json fence with no closing fence
  const openIdx = text.indexOf('```json');
  if (openIdx === -1) return null;
  const body = text.slice(openIdx + 7);
  const arrIdx = body.indexOf('[');
  if (arrIdx === -1) return null;

  const recipes = [];
  let i = arrIdx + 1;
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) i++;
    if (i >= body.length || body[i] !== '{') break;

    let depth = 0;
    let inStr = false;
    let escape = false;
    let start = i;
    for (; i < body.length; i++) {
      const ch = body[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    if (depth !== 0) break;
    const objStr = body.slice(start, i);
    try {
      recipes.push(JSON.parse(objStr));
    } catch {
      break;
    }
  }
  return recipes.length > 0 ? recipes : null;
}

function parsePantryUpdates(text) {
  const match = text.match(/```pantry_update\s*([\s\S]*?)```/);
  if (!match) return [];
  try { return JSON.parse(match[1]); } catch { return []; }
}

function parsePreferenceUpdates(text) {
  const match = text.match(/```preference_update\s*([\s\S]*?)```/);
  if (!match) return [];
  try { return JSON.parse(match[1]); } catch { return []; }
}

function parseOnboardingComplete(text) {
  const match = text.match(/```onboarding_complete\s*([\s\S]*?)```/);
  if (!match) return [];
  try { return JSON.parse(match[1]); } catch { return []; }
}

function parseExperienceUpdates(text) {
  const match = text.match(/```experience_update\s*([\s\S]*?)```/);
  if (!match) return [];
  try { return JSON.parse(match[1]); } catch { return []; }
}

export function stripCodeBlocks(text) {
  return text
    .replace(/```json\s*[\s\S]*?```/g, '')
    .replace(/```pantry_update\s*[\s\S]*?```/g, '')
    .replace(/```preference_update\s*[\s\S]*?```/g, '')
    .replace(/```onboarding_complete\s*[\s\S]*?```/g, '')
    .replace(/```experience_update\s*[\s\S]*?```/g, '')
    .replace(/```(?:json|pantry_update|preference_update|onboarding_complete|experience_update)[\s\S]*$/, '')
    .trim();
}

// ---------------------------------------------------------------------------
// Main chat function — now accepts a db object (from createDB)
// ---------------------------------------------------------------------------

export async function chat(db, userMessage, bookmarkMode = 'include', cookingFor = null) {
  // Store user message
  await db.addConversation('user', userMessage);

  // Build conversation history for context
  const history = await db.getRecentConversations(20);
  const messages = history.map(c => ({
    role: c.role === 'system' ? 'user' : c.role,
    content: c.content,
  }));

  // Call Claude
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: await buildSystemPrompt(db, bookmarkMode, cookingFor),
    messages,
  });

  const assistantText = response.content[0]?.text || '';

  // Store assistant response
  await db.addConversation('assistant', assistantText);

  // Extract structured data
  const recipes = parseRecipes(assistantText);
  const pantryUpdates = parsePantryUpdates(assistantText);
  const preferenceUpdates = parsePreferenceUpdates(assistantText);
  const onboardingComplete = parseOnboardingComplete(assistantText);
  const experienceUpdates = parseExperienceUpdates(assistantText);

  // Apply pantry updates
  for (const u of pantryUpdates) {
    if (u.action === 'add' || u.action === 'update') {
      await db.upsertPantryItem(u.item, u.category || null, u.confidence || 'likely', u.notes || null, 'ai-extracted');
    }
  }

  // Apply preference updates
  const people = await db.getPeople();
  for (const u of preferenceUpdates) {
    const person = people.find(p => p.name.toLowerCase() === (u.person || '').toLowerCase());
    if (person) {
      await db.addPreference(person.id, u.category || 'general', u.item, u.detail || null, u.source || 'ai-extracted');
    }
  }

  // Handle onboarding completion
  for (const u of onboardingComplete) {
    const person = people.find(p => p.name.toLowerCase() === (u.person || '').toLowerCase());
    if (person) {
      const updates = { onboarded: true };
      const exp = u.cooking_experience || u.experience;
      if (exp) {
        const expMap = {
          'novice': 'novice', 'beginner': 'beginner', 'intermediate': 'intermediate',
          'experienced': 'experienced', 'expert': 'expert', 'advanced': 'experienced',
          'intermediate_to_advanced': 'experienced'
        };
        const mapped = expMap[exp.toLowerCase().replace(/[\s-]/g, '_')];
        if (mapped) updates.experience = mapped;
      }
      await db.updatePerson(person.id, updates);
      const prefs = u.preferences;
      if (prefs) {
        if (prefs.dislikes) {
          for (const item of prefs.dislikes) {
            await db.addPreference(person.id, 'do_not_use', item, null, 'onboarding');
          }
        }
        if (prefs.tolerates_occasionally) {
          for (const item of prefs.tolerates_occasionally) {
            await db.addPreference(person.id, 'use_sparingly', item, null, 'onboarding');
          }
        }
        if (prefs.enjoys) {
          for (const item of prefs.enjoys) {
            await db.addPreference(person.id, 'prefer', item, null, 'onboarding');
          }
        }
      }
    }
  }

  // Apply experience updates
  for (const u of experienceUpdates) {
    const person = people.find(p => p.name.toLowerCase() === (u.person || '').toLowerCase());
    if (person && u.experience) {
      await db.updatePerson(person.id, { experience: u.experience });
    }
  }

  // Prune old conversations
  await db.pruneOldConversations(40);

  // Return clean response
  return {
    text: stripCodeBlocks(assistantText),
    recipes,
    pantryUpdates,
    preferenceUpdates,
    experienceUpdates,
    onboardingComplete,
    raw: assistantText,
  };
}
