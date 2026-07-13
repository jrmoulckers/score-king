/**
 * A tiny, offline word bank for Werewords — the "🎲 Need a word?" helper the Mayor can
 * tap when nobody at the table has a secret word ready. Pure and Svelte-free so it can be
 * unit-tested and can't drag any network dependency into the round editor.
 *
 * The list is deliberately curated for the game: everyday, guessable, family-friendly
 * nouns (a few verbs/adjectives for spice) that give the table a fair yes/no chase — no
 * proper nouns, no obscure trivia, nothing that needs spelling out. It is not meant to be
 * exhaustive; it just breaks the "who has a word?" stall so play keeps moving.
 */
export const WEREWORDS_WORDS: readonly string[] = [
  // Around the house
  'PILLOW', 'CANDLE', 'MIRROR', 'KETTLE', 'BLANKET', 'LADDER', 'UMBRELLA', 'DRAWER',
  'TEAPOT', 'CURTAIN', 'DOORBELL', 'MATTRESS',
  // Outdoors & nature
  'VOLCANO', 'GLACIER', 'THUNDER', 'RAINBOW', 'CANYON', 'MEADOW', 'WHIRLPOOL', 'ICEBERG',
  'AVALANCHE', 'MOONLIGHT', 'FOREST', 'DESERT',
  // Creatures
  'OCTOPUS', 'PENGUIN', 'HEDGEHOG', 'DOLPHIN', 'FIREFLY', 'JELLYFISH', 'SCARECROW',
  'BUTTERFLY', 'SQUIRREL', 'FLAMINGO', 'WEREWOLF', 'DRAGON',
  // Food & drink
  'PANCAKE', 'PRETZEL', 'POPCORN', 'CUPCAKE', 'MEATBALL', 'PICKLE', 'WAFFLE', 'NOODLE',
  'MARMALADE', 'GUMBO',
  // Places & things
  'CASTLE', 'PYRAMID', 'LIGHTHOUSE', 'HARBOR', 'MARKET', 'STADIUM', 'BRIDGE', 'WINDMILL',
  'TREASURE', 'COMPASS', 'ANCHOR', 'CATAPULT',
  // Play & wonder
  'BALLOON', 'PUPPET', 'CAROUSEL', 'FIREWORK', 'MARBLE', 'KAZOO', 'YO-YO', 'ORIGAMI',
  'JIGSAW', 'TRAMPOLINE',
  // Verbs & adjectives for variety
  'WHISPER', 'SHIVER', 'TANGLE', 'WOBBLE', 'GLOW', 'SPARKLE', 'SLIPPERY', 'FLUFFY',
  'CRUNCHY', 'GIGANTIC',
];

/**
 * Pick a suggested word deterministically from {@link WEREWORDS_WORDS}.
 *
 * Deterministic for a given `seed` so it is trivially testable; the editor feeds it a
 * fresh random seed each tap to feel spontaneous. When `avoid` matches the natural pick
 * (e.g. the word already sitting in the field), we step to the next entry so a tap always
 * visibly changes the word rather than appearing to do nothing.
 */
export function suggestWord(seed: number, avoid?: string | null): string {
  const list = WEREWORDS_WORDS;
  const n = list.length;
  // A non-negative integer index from any finite seed (floats, negatives, NaN → 0).
  const base = Number.isFinite(seed) ? Math.abs(Math.floor(seed)) % n : 0;
  const wanted = avoid?.trim().toUpperCase() ?? '';
  let idx = base;
  if (wanted && list[idx] === wanted) idx = (idx + 1) % n;
  return list[idx];
}
