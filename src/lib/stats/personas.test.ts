import { describe, it, expect } from 'vitest';
import type { MemberStats } from './types';
import { assignPersona, personaTraits } from './personas';

function mkStats(p: Partial<MemberStats> = {}): MemberStats {
  return {
    playerId: 'me',
    played: 10,
    finished: 10,
    wins: 3,
    podiums: 5,
    winRate: 0.3,
    currentStreak: 0,
    longestStreak: 2,
    points: 100,
    rounds: 40,
    byGameType: {},
    headToHead: {},
    comebackWins: 0,
    wireToWireWins: 0,
    closeGames: 0,
    closeWins: 0,
    gameNights: 4,
    ...p,
  };
}

describe('personaTraits', () => {
  it('only trusts clutch once there are 3+ close games', () => {
    expect(personaTraits(mkStats({ closeGames: 2, closeWins: 2 })).clutch).toBe(0);
    expect(personaTraits(mkStats({ closeGames: 4, closeWins: 3 })).clutch).toBeCloseTo(0.75);
  });

  it('normalizes volatility from finish stdev and clamps to 1', () => {
    expect(personaTraits(mkStats({ finishStdev: 0 })).volatility).toBe(0);
    expect(personaTraits(mkStats({ finishStdev: 2 })).volatility).toBe(1);
  });

  it('front-running and comeback are shares of wins', () => {
    const t = personaTraits(mkStats({ wins: 4, wireToWireWins: 2, comebackWins: 1 }));
    expect(t.frontRunning).toBeCloseTo(0.5);
    expect(t.comeback).toBeCloseTo(0.25);
  });
});

describe('assignPersona', () => {
  it('is a Rookie under the minimum game count', () => {
    const p = assignPersona(mkStats({ played: 5 }));
    expect(p.key).toBe('rookie');
    expect(p.confidence).toBeCloseTo(5 / 8);
  });

  it('reads high close-game win rate as The Closer', () => {
    const p = assignPersona(mkStats({ played: 10, wins: 5, closeGames: 4, closeWins: 4, finishStdev: 0, podiums: 0 }));
    expect(p.key).toBe('closer');
  });

  it('reads high finish variance as a Wildcard', () => {
    const p = assignPersona(mkStats({ played: 10, wins: 2, finishStdev: 1.25, podiums: 0 }));
    expect(p.key).toBe('wildcard');
  });

  it('reads wins-from-behind as the Comeback Kid', () => {
    const p = assignPersona(mkStats({ played: 10, wins: 4, comebackWins: 4, finishStdev: 0, podiums: 0 }));
    expect(p.key).toBe('comeback');
  });

  it('reads wire-to-wire wins as the Front-Runner', () => {
    const p = assignPersona(mkStats({ played: 10, wins: 4, wireToWireWins: 4, comebackWins: 0, finishStdev: 0, podiums: 0 }));
    expect(p.key).toBe('frontrunner');
  });

  it('reads high podium + low volatility as Consistent', () => {
    const p = assignPersona(mkStats({ played: 10, wins: 2, podiums: 8, finishStdev: 0, wireToWireWins: 0 }));
    expect(p.key).toBe('consistent');
  });

  it('falls back to All-Rounder when nothing stands out', () => {
    const p = assignPersona(mkStats({ played: 10, wins: 1, podiums: 0, finishStdev: 0, closeGames: 0, comebackWins: 0, wireToWireWins: 0 }));
    expect(p.key).toBe('allrounder');
  });
});
