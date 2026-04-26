// Changelog entries — newest first.
// Each entry has a date (ISO string) and a brief description.
// The popup shows all entries newer than the user's changelog_seen timestamp.

export const changelog = [
  {
    date: '2026-04-26',
    title: 'Pantry and cooking-for upgrades',
    items: [
      'Click any pantry item name to edit it inline',
      'Category selector on each item (hover to see): protein, produce, dairy, grains, spices, condiments, oils, baking, beverages, spirits, other',
      'Filter bar above pantry list — show or hide items by category',
      'Search your pantry — type to filter items instantly',
      'Pantry sidebar fills the full screen height; scroll indicators show when more items are above or below',
      'Smarter ingredient names when adding from recipes — no more quantities or "optional:" prefixes',
      'Cooking-for display is now managed by the Wizard during conversation — just say who\'s eating and it updates automatically',
      'What\'s New popup (this!) shows new features since your last visit',
    ],
  },
  {
    date: '2026-04-25',
    title: 'UI improvements',
    items: [
      'Show/Hide toggle button for recipe cards — frees up chat space',
      'Warmer background color for better contrast',
    ],
  },
  {
    date: '2026-04-19',
    title: 'New features',
    items: [
      'Nutrition estimates on every recipe (calories, protein, carbs, fat, fiber, sodium)',
      'Food photos on recipe cards (toggle in Settings)',
      'Private chat history — each household member has their own conversation',
      'Cleaner chat formatting',
      'Shopping list now uses clean item names',
    ],
  },
];

export function getNewEntries(since) {
  if (!since) return changelog;
  const sinceDate = new Date(since);
  return changelog.filter(e => new Date(e.date) > sinceDate);
}
