import { describe, expect, it } from 'vitest';
import type { ID, RoundContext, Round, Game } from '../../types';
import { canasta } from './index';
import { canastaStats } from './stats';
import {
  type CanastaHand,
  type CanastaInput,
  canastaBonus,
  describeHand,
  emptyHand,
  handScore,
  leadingTeam,
  minimumInitialMeld,
  outBonus,
  pairingFromConfig,
  redThreeBonus,
  resolveTeams,
  scoreCanasta,
  targetFromConfig,
  teamTotals,
  toTarget,
  validateCanasta,
} from './logic';

const players4 = [
  { id: 'a', name: 'Ann', color: '#111', createdAt: 0 },
  { id: 'b', name: 'Bo', color: '#222', createdAt: 0 },
  { id: 'c', name: 'Cy', color: '#333', createdAt: 0 },
  { id: 'd', name: 'Di', color: '#444', createdAt: 0 },
];

const players2 = [
  { id: 'a', name: 'Ann', color: '#111', createdAt: 0 },
  { id: 'b', name: 'Bo', color: '#222', createdAt: 0 },
];

const ADJACENT: [ID[], ID[]] = [
  ['a', 'b'],
  ['c', 'd'],
];

function hand(partial: Partial<CanastaHand> = {}): CanastaHand {
  return { ...emptyHand(), ...partial };
}

function mk(partial: Partial<CanastaInput> = {}): CanastaInput {
  return {
    teams: ADJACENT,
    hands: [emptyHand(), emptyHand()],
    ...partial,
  };
}

function ctx(config: Record<string, unknown> = {}, players = players4): RoundContext {
  return { players, config } as unknown as RoundContext;
}

describe('resolveTeams', () => {
  it('pairs adjacent picks (1&2 vs 3&4)', () => {
    expect(resolveTeams(players4, 'adjacent')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('pairs across picks (1&3 vs 2&4)', () => {
    expect(resolveTeams(players4, 'across')).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
  });

  it('gives each of two players their own team', () => {
    expect(resolveTeams(players2, 'adjacent')).toEqual([['a'], ['b']]);
    expect(resolveTeams(players2, 'across')).toEqual([['a'], ['b']]);
  });
});

describe('canastaBonus', () => {
  it('is 500 per natural and 300 per mixed canasta', () => {
    expect(canastaBonus(hand({ naturalCanastas: 2, mixedCanastas: 1 }))).toBe(1300);
    expect(canastaBonus(hand())).toBe(0);
  });
});

describe('redThreeBonus', () => {
  it('is 100 each below four', () => {
    expect(redThreeBonus(0)).toBe(0);
    expect(redThreeBonus(1)).toBe(100);
    expect(redThreeBonus(3)).toBe(300);
  });

  it('is 800 (not 400) for all four', () => {
    expect(redThreeBonus(4)).toBe(800);
  });

  it('clamps out-of-range input', () => {
    expect(redThreeBonus(-2)).toBe(0);
    expect(redThreeBonus(9)).toBe(800);
  });
});

describe('outBonus', () => {
  it('is 0 when the team did not go out', () => {
    expect(outBonus(hand())).toBe(0);
  });
  it('is 100 for going out, 200 concealed', () => {
    expect(outBonus(hand({ wentOut: true }))).toBe(100);
    expect(outBonus(hand({ wentOut: true, concealedOut: true }))).toBe(200);
  });
});

describe('handScore', () => {
  it('combines bonuses plus melded points minus hand points', () => {
    const h = hand({
      naturalCanastas: 2,
      mixedCanastas: 1,
      redThrees: 3,
      meldPoints: 100,
      handPoints: 20,
      wentOut: true,
      concealedOut: true,
    });
    // 1000 + 300 (canastas) + 300 (red threes) + 200 (concealed out) + 100 - 20
    expect(handScore(h)).toBe(1880);
  });

  it('is zero for an untouched hand', () => {
    expect(handScore(emptyHand())).toBe(0);
  });

  it('can go negative when only hand points are entered', () => {
    expect(handScore(hand({ handPoints: 40 }))).toBe(-40);
  });

  it('treats negative/garbage numeric fields as zero', () => {
    expect(handScore(hand({ meldPoints: -50, handPoints: -10 }))).toBe(0);
  });
});

describe('scoreCanasta', () => {
  it('gives both partners their team hand score', () => {
    const input = mk({
      hands: [hand({ naturalCanastas: 1 }), hand({ meldPoints: 40 })],
    });
    expect(scoreCanasta(input)).toEqual({ a: 500, b: 500, c: 40, d: 40 });
  });

  it('mirrors to a single "team" of one for a 2-player game', () => {
    const input: CanastaInput = {
      teams: [['a'], ['b']],
      hands: [hand({ meldPoints: 30 }), hand({ handPoints: 15 })],
    };
    expect(scoreCanasta(input)).toEqual({ a: 30, b: -15 });
  });

  it('returns all-zero deltas for two fully empty hands', () => {
    expect(scoreCanasta(mk())).toEqual({ a: 0, b: 0, c: 0, d: 0 });
  });
});

describe('validateCanasta', () => {
  it('accepts a normal recorded hand', () => {
    expect(validateCanasta(mk({ hands: [hand({ meldPoints: 50 }), hand()] }))).toBeNull();
  });

  it('requires at least two players', () => {
    expect(validateCanasta(mk({ teams: [[], []] }))).toMatch(/at least two players/i);
  });

  it('rejects more than one team going out', () => {
    expect(
      validateCanasta(mk({ hands: [hand({ wentOut: true }), hand({ wentOut: true })] })),
    ).toMatch(/only one team/i);
  });

  it('rejects concealed without went-out', () => {
    expect(validateCanasta(mk({ hands: [hand({ concealedOut: true }), hand()] }))).toMatch(
      /concealed/i,
    );
  });

  it('rejects out-of-range red threes', () => {
    expect(validateCanasta(mk({ hands: [hand({ redThrees: 5 }), hand()] }))).toMatch(
      /red threes/i,
    );
    expect(validateCanasta(mk({ hands: [hand({ redThrees: -1 }), hand()] }))).toMatch(
      /red threes/i,
    );
  });

  it('rejects negative canasta counts and point totals', () => {
    expect(validateCanasta(mk({ hands: [hand({ naturalCanastas: -1 }), hand()] }))).toMatch(
      /canasta counts/i,
    );
    expect(validateCanasta(mk({ hands: [hand({ meldPoints: -5 }), hand()] }))).toMatch(
      /melded points/i,
    );
    expect(validateCanasta(mk({ hands: [hand({ handPoints: -5 }), hand()] }))).toMatch(
      /points left in hand/i,
    );
  });
});

describe('describeHand', () => {
  it('summarises a plain hand with both team scores', () => {
    const input = mk({ hands: [hand({ meldPoints: 60 }), hand({ meldPoints: 10 })] });
    expect(describeHand(input, players4)).toBe('🃏 Ann & Bo 60 — Cy & Di 10');
  });

  it('calls out the team that went out', () => {
    const input = mk({ hands: [hand({ wentOut: true, meldPoints: 100 }), hand()] });
    expect(describeHand(input, players4)).toBe('🏁 Ann & Bo goes out — 200 (Cy & Di 0)');
  });

  it('flags a concealed out', () => {
    const input = mk({
      hands: [hand(), hand({ wentOut: true, concealedOut: true, meldPoints: 50 })],
    });
    expect(describeHand(input, players4)).toBe('🥷 Cy & Di goes out concealed — 250 (Ann & Bo 0)');
  });

  it('accepts pre-computed scores from stored deltas', () => {
    const input = mk({ hands: [hand({ meldPoints: 60 }), hand({ meldPoints: 10 })] });
    expect(describeHand(input, players4, [999, 1])).toBe('🃏 Ann & Bo 999 — Cy & Di 1');
  });
});

describe('race to the target', () => {
  it('reads each team total from the mirrored partner scores', () => {
    expect(teamTotals(ADJACENT, { a: 700, b: 700, c: 400, d: 400 })).toEqual([700, 400]);
  });

  it('names the leading team, or null on a tie', () => {
    expect(leadingTeam([700, 400])).toBe(0);
    expect(leadingTeam([400, 700])).toBe(1);
    expect(leadingTeam([0, 0])).toBeNull();
  });

  it('counts points still needed, never below zero', () => {
    expect(toTarget(4500, 5000)).toBe(500);
    expect(toTarget(5000, 5000)).toBe(0);
    expect(toTarget(5200, 5000)).toBe(0);
  });
});

describe('minimumInitialMeld', () => {
  it('follows the classic sliding scale', () => {
    expect(minimumInitialMeld(-100)).toBe(15);
    expect(minimumInitialMeld(0)).toBe(50);
    expect(minimumInitialMeld(1499)).toBe(50);
    expect(minimumInitialMeld(1500)).toBe(90);
    expect(minimumInitialMeld(2999)).toBe(90);
    expect(minimumInitialMeld(3000)).toBe(120);
    expect(minimumInitialMeld(6000)).toBe(120);
  });
});

describe('config coercion', () => {
  it('pairing defaults to adjacent', () => {
    expect(pairingFromConfig({})).toBe('adjacent');
    expect(pairingFromConfig({ pairing: 'across' })).toBe('across');
  });

  it('target defaults to 5000 and ignores junk', () => {
    expect(targetFromConfig({})).toBe(5000);
    expect(targetFromConfig({ target: 3000 })).toBe(3000);
    expect(targetFromConfig({ target: 0 })).toBe(5000);
    expect(targetFromConfig({ target: -10 })).toBe(5000);
  });
});

describe('canasta module', () => {
  it('declares itself a flexible-partnership 2–4 player game', () => {
    expect(canasta.id).toBe('canasta');
    expect(canasta.teams).toBe(true);
    expect(canasta.minPlayers).toBe(2);
    expect(canasta.maxPlayers).toBe(4);
    expect(canasta.lowerIsBetter).toBeFalsy();
  });

  it('creates a round input with teams resolved from pick order + pairing', () => {
    const input = canasta.createRoundInput(ctx({ pairing: 'across' })) as CanastaInput;
    expect(input.teams).toEqual([
      ['a', 'c'],
      ['b', 'd'],
    ]);
    expect(input.hands).toHaveLength(2);
    expect(input.hands[0]).toEqual(emptyHand());
  });

  it('scores through the module', () => {
    const input = mk({
      hands: [hand({ naturalCanastas: 1, meldPoints: 50 }), hand({ handPoints: 30 })],
    });
    expect(canasta.scoreRound(input, ctx())).toEqual({ a: 550, b: 550, c: -30, d: -30 });
  });

  it('validates through the module', () => {
    expect(canasta.validateRound(mk(), ctx())).toBeNull();
    expect(
      canasta.validateRound(mk({ hands: [hand({ redThrees: 9 }), hand()] }), ctx()),
    ).toMatch(/red threes/i);
  });

  it('finishes once a team reaches the configured target', () => {
    const info = (config: Record<string, unknown>) => ({ config, roundCount: 3, playerCount: 4 });
    expect(canasta.isFinished!({ a: 5000, b: 5000, c: 1200, d: 1200 }, info({}))).toBe(true);
    expect(canasta.isFinished!({ a: 4999, b: 4999, c: 1200, d: 1200 }, info({}))).toBe(false);
    expect(canasta.isFinished!({ a: 3000, b: 3000, c: 0, d: 0 }, info({ target: 3000 }))).toBe(
      true,
    );
  });

  it('describes a recorded round from its stored deltas', () => {
    const round = {
      input: mk({ hands: [hand({ wentOut: true, meldPoints: 100 }), hand()] }),
      deltas: { a: 200, b: 200, c: 0, d: 0 },
    } as unknown as Round;
    expect(canasta.describeRound!(round, players4)).toBe('🏁 Ann & Bo goes out — 200 (Cy & Di 0)');
  });

  it('plays a full 2-player game to the target', () => {
    const p2ctx = ctx({}, players2);
    const input1 = canasta.createRoundInput(p2ctx) as CanastaInput;
    input1.hands[0] = hand({ naturalCanastas: 3, meldPoints: 200, wentOut: true, concealedOut: true });
    input1.hands[1] = hand({ handPoints: 50 });
    const totals: Record<ID, number> = { a: 0, b: 0 };
    const d1 = canasta.scoreRound(input1, p2ctx);
    for (const id of Object.keys(totals)) totals[id] += d1[id] ?? 0;
    expect(totals.a).toBe(1900); // 1500 canastas + 200 concealed-out + 200 meld
    expect(totals.b).toBe(-50);
    expect(canasta.isFinished!(totals, { config: {}, roundCount: 1, playerCount: 2 })).toBe(false);
  });
});

describe('canastaStats', () => {
  const games: Game[] = [
    {
      id: 'g',
      type: 'canasta',
      config: {},
      playerIds: ['a', 'b', 'c', 'd'],
      status: 'finished',
      createdAt: 0,
      roundCount: 2,
    } as Game,
  ];
  const mkRound = (index: number, input: CanastaInput): Round =>
    ({ id: `r${index}`, gameId: 'g', index, input, deltas: {}, createdAt: 0 }) as Round;
  const rounds: Round[] = [
    mkRound(
      0,
      mk({
        hands: [
          hand({ naturalCanastas: 1, mixedCanastas: 1, redThrees: 4, wentOut: true }),
          hand(),
        ],
      }),
    ),
    mkRound(1, mk({ hands: [hand({ mixedCanastas: 1 }), hand({ mixedCanastas: 1, concealedOut: true, wentOut: true })] })),
  ];
  const out = canastaStats({ games, rounds, players: [], canonical: (id: ID) => id });

  const metric = (id: ID, key: string) => out.perPlayer?.[id]?.find((m) => m.key === key);
  const g = (key: string) => out.global?.find((m) => m.key === key);

  it('credits canastas to both partners', () => {
    expect(metric('a', 'ca_canastas')?.value).toBe('3');
    expect(metric('b', 'ca_canastas')?.value).toBe('3');
    expect(metric('c', 'ca_canastas')?.value).toBe('1');
  });

  it('tracks a full set of red threes', () => {
    expect(metric('a', 'ca_redthrees')?.value).toBe('4');
    expect(metric('a', 'ca_redthrees')?.sub).toMatch(/1 full set/);
  });

  it('counts went-out and concealed-out hands', () => {
    expect(metric('a', 'ca_wentout')?.value).toBe('1');
    expect(metric('d', 'ca_concealed')?.value).toBe('1');
    expect(metric('c', 'ca_concealed')?.value).toBe('1');
  });

  it('reports global canasta totals', () => {
    expect(g('ca_canastas_all')?.value).toBe('4');
    expect(g('ca_concealed_all')?.value).toBe('1');
  });
});
