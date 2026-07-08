import { describe, expect, it } from 'vitest';
import { MODULES, getModule } from './registry';

/**
 * Guards the auto-discovery contract (see registry.ts): every built-in game is found
 * purely by dropping a `./‹id›/index.ts` that exports a GameModule — no central list.
 * This is also the safety net that catches a new game whose module is malformed.
 */
describe('game registry (auto-discovery)', () => {
  it('discovers the built-in game modules from their folders', () => {
    const ids = MODULES.map((m) => m.id);
    expect(ids).toContain('skullking');
    expect(ids).toContain('hearts');
    expect(ids).toContain('tally');
  });

  it('every discovered module structurally satisfies GameModule', () => {
    expect(MODULES.length).toBeGreaterThan(0);
    for (const m of MODULES) {
      expect(typeof m.id, `id of ${m.name}`).toBe('string');
      expect(m.id.length, `id of ${m.name}`).toBeGreaterThan(0);
      expect(typeof m.name).toBe('string');
      expect(typeof m.emoji).toBe('string');
      expect(typeof m.tagline).toBe('string');
      expect(m.maxPlayers).toBeGreaterThanOrEqual(m.minPlayers);
      expect(typeof m.createRoundInput).toBe('function');
      expect(typeof m.validateRound).toBe('function');
      expect(typeof m.scoreRound).toBe('function');
      expect(m.RoundEditor).toBeTruthy();
    }
  });

  it('resolves each built-in by id', () => {
    for (const m of MODULES) expect(getModule(m.id)).toBe(m);
  });

  it('has no duplicate ids', () => {
    const ids = MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is ordered alphabetically by display name', () => {
    const names = MODULES.map((m) => m.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});
