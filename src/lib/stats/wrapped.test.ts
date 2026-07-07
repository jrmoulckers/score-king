import { describe, expect, it } from 'vitest';
import type { Game, ID, Player, Round } from '../types';
import { computeStats } from './engine';
import { compareStats } from './compare';
import { assignPersona } from './personas';
import { buildWrapped, buildRecap, type WrappedInput } from './wrapped';

const DAY = 86_400_000;
const BASE = 1_700_000_000_000;
const player = (id: string): Player => ({ id, name: id, color: '#7c5cff', createdAt: 0 });

function mkGame(p: Partial<Game> & { id: string; type: string; playerIds: ID[]; winnerIds: ID[] }): Game {
  return { config: {}, status: 'finished', createdAt: p.finishedAt ?? BASE, finishedAt: p.finishedAt ?? BASE, roundCount: 1, ...p } as Game;
}
function mkRound(gameId: string, deltas: Record<ID, number>): Round {
  return { id: `${gameId}-r0`, gameId, index: 0, input: {}, deltas, createdAt: BASE };
}

/** A pumps out a strong personal season: 6 games, wins 4, incl. comebacks. */
function season() {
  const players = [player('A'), player('B'), player('C')];
  const games: Game[] = [];
  const rounds: Round[] = [];
  const winByType: [string, ID][] = [
    ['skullking', 'A'],
    ['skullking', 'A'],
    ['skullking', 'B'],
    ['hearts', 'A'],
    ['hearts', 'A'],
    ['hearts', 'C'],
  ];
  winByType.forEach(([type, w], i) => {
    const id = `g${i}`;
    games.push(mkGame({ id, type, playerIds: ['A', 'B', 'C'], winnerIds: [w], finishedAt: BASE + i * DAY }));
    // Winner gets the best score in the game's direction (Hearts = lower is better).
    const others = ['A', 'B', 'C'].filter((p) => p !== w);
    const deltas: Record<ID, number> = {};
    if (type === 'hearts') {
      deltas[w] = 5;
      others.forEach((p, k) => (deltas[p] = 10 + k * 10));
    } else {
      deltas[w] = 40;
      others.forEach((p, k) => (deltas[p] = 10 + k * 10));
    }
    rounds.push(mkRound(id, deltas));
  });
  return { players, games, rounds };
}

function inputFor(range?: { from?: number; to?: number }): WrappedInput {
  const { players, games, rounds } = season();
  const result = computeStats({ players, games, rounds }, { playerId: 'A', range });
  const me = result.perPlayer['A'];
  const persona = assignPersona(me);
  return {
    meId: 'A',
    me,
    result,
    persona,
    label: '2026',
    nameOf: (id) => id,
    gameName: (t) => t,
    gameEmoji: () => '🎲',
    roast: true,
  };
}

describe('wrapped — year arc', () => {
  const cards = buildWrapped(inputFor());

  it('opens on a cover and ends on a group toast', () => {
    expect(cards[0].kind).toBe('cover');
    expect(cards[cards.length - 1].kind).toBe('toast');
  });

  it('includes the marquee moments', () => {
    const kinds = cards.map((c) => c.kind);
    expect(kinds).toContain('numbers');
    expect(kinds).toContain('record');
    expect(kinds).toContain('persona');
    expect(kinds).toContain('crown');
    expect(kinds).toContain('title');
  });

  it('reserves gold for the crowned and title cards only', () => {
    for (const c of cards) {
      if (c.kind === 'crown' || c.kind === 'title') expect(c.gold).toBe(true);
      else expect(c.gold).toBeFalsy();
    }
  });

  it('reports the real record on the record card', () => {
    const rec = cards.find((c) => c.kind === 'record');
    expect(rec?.headline).toBe('4–2'); // A won 4 of 6
  });

  it('surfaces vs-prior deltas when a comparison is supplied', () => {
    const cur = inputFor();
    // Prior window with zero games -> +4 wins improvement.
    const priorResult = computeStats({ players: [player('A')], games: [], rounds: [] }, { playerId: 'A' });
    cur.prior = compareStats(cur.result, priorResult, 'A');
    const rec = buildWrapped(cur).find((c) => c.kind === 'record');
    expect(rec?.lines?.some((l) => l.includes('▲'))).toBe(true);
  });
});

describe('wrapped — recap arc', () => {
  it('is short, MVP-led and toast-tailed', () => {
    const cards = buildRecap({ ...inputFor(), label: 'tonight' });
    expect(cards.length).toBeLessThanOrEqual(6);
    expect(cards.some((c) => c.kind === 'crown')).toBe(true); // MVP card
    expect(cards[cards.length - 1].kind).toBe('toast');
  });
});

describe('wrapped — low data', () => {
  it('gives a single welcome card when nothing was finished', () => {
    const empty = computeStats({ players: [player('A')], games: [], rounds: [] }, { playerId: 'A' });
    const cards = buildWrapped({
      meId: 'A',
      me: empty.perPlayer['A'],
      result: empty,
      label: '2026',
      nameOf: (id) => id,
      gameName: (t) => t,
      gameEmoji: () => '🎲',
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe('lowdata');
  });
});
