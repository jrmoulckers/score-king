import { describe, expect, it } from 'vitest';
import { WEREWORDS_WORDS, suggestWord } from './words';

describe('suggestWord — the offline "Need a word?" helper', () => {
  it('always returns a word from the bank', () => {
    for (let seed = 0; seed < 200; seed++) {
      expect(WEREWORDS_WORDS).toContain(suggestWord(seed));
    }
  });

  it('is deterministic for a given seed', () => {
    expect(suggestWord(42)).toBe(suggestWord(42));
  });

  it('maps the seed across the whole bank (indexes by modulo)', () => {
    expect(suggestWord(0)).toBe(WEREWORDS_WORDS[0]);
    expect(suggestWord(WEREWORDS_WORDS.length)).toBe(WEREWORDS_WORDS[0]);
    expect(suggestWord(1)).toBe(WEREWORDS_WORDS[1]);
  });

  it('never repeats the word currently in the field (steps to the next)', () => {
    // Seed 0 naturally lands on entry 0; avoiding it must pick something different.
    const natural = WEREWORDS_WORDS[0];
    const picked = suggestWord(0, natural);
    expect(picked).not.toBe(natural);
    expect(WEREWORDS_WORDS).toContain(picked);
  });

  it('is case- and whitespace-insensitive when avoiding', () => {
    const natural = WEREWORDS_WORDS[0];
    expect(suggestWord(0, `  ${natural.toLowerCase()}  `)).not.toBe(natural);
  });

  it('tolerates junk seeds without throwing', () => {
    expect(WEREWORDS_WORDS).toContain(suggestWord(Number.NaN));
    expect(WEREWORDS_WORDS).toContain(suggestWord(-7));
    expect(WEREWORDS_WORDS).toContain(suggestWord(3.9));
  });

  it('ships a clean bank — non-empty, unique, upper-case, trimmed', () => {
    expect(WEREWORDS_WORDS.length).toBeGreaterThan(20);
    const seen = new Set<string>();
    for (const w of WEREWORDS_WORDS) {
      expect(w).toBe(w.trim());
      expect(w).toBe(w.toUpperCase());
      expect(w.length).toBeGreaterThan(0);
      expect(seen.has(w)).toBe(false);
      seen.add(w);
    }
  });
});
