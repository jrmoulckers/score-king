import type { ID, Round } from '../../types';
import type { GameSpecificStats, GameStatsInput, Metric } from '../../stats/types';
import { fmtPct } from '../../stats/format';
import { outcomeOf, roleSetup, winningSide, type AvalonInput, type Side } from './logic';

interface Agg {
  goodGames: number;
  goodWins: number;
  evilGames: number;
  evilWins: number;
}

interface Resolution {
  winners: Set<ID>;
  side: Side;
  assassinated: boolean;
}

/**
 * Avalon stats, derived purely from each finished game's recorded quests. Roles are secret
 * during play, but a finished game's *winning side* (recorded at the clinch) plus the seat
 * list fully partitions the table: winners sat on the winning side, everyone else on the
 * other — so per-player Good/Evil win rates fall out without ever storing a role. Pure and
 * unit-testable; mirrors the module's own `logic.ts`.
 */
export function avalonStats({ games, rounds, canonical }: GameStatsInput): GameSpecificStats {
  const gameIds = new Set(games.map((g) => g.id));
  const roundsByGame = new Map<ID, Round[]>();
  for (const r of rounds) {
    if (!gameIds.has(r.gameId)) continue;
    const arr = roundsByGame.get(r.gameId);
    if (arr) arr.push(r);
    else roundsByGame.set(r.gameId, [r]);
  }

  const per = new Map<ID, Agg>();
  const get = (id: ID): Agg => {
    let a = per.get(id);
    if (!a) {
      a = { goodGames: 0, goodWins: 0, evilGames: 0, evilWins: 0 };
      per.set(id, a);
    }
    return a;
  };

  let questsPlayed = 0;
  let questFails = 0;
  let assassinations = 0;
  let resolvedGames = 0;

  for (const g of games) {
    const grounds = (roundsByGame.get(g.id) ?? []).slice().sort((a, b) => a.index - b.index);
    const setup = roleSetup(g.playerIds.length);

    let resolution: Resolution | null = null;
    for (const r of grounds) {
      const inp = r.input as AvalonInput | undefined;
      if (!inp) continue;
      const twoFail = setup.twoFailQuests[r.index] ?? false;
      const outcome = outcomeOf(inp, twoFail);
      questsPlayed += 1;
      if (outcome === 'fail') questFails += 1;

      const winners = inp.winners ?? [];
      if (winners.length) {
        const clinchedBy: Side = outcome === 'fail' ? 'evil' : 'good';
        const side = winningSide(clinchedBy, inp.assassinFoundMerlin);
        resolution = {
          winners: new Set(winners.map(canonical)),
          side,
          assassinated: clinchedBy === 'good' && side === 'evil',
        };
      }
    }

    if (!resolution) continue;
    resolvedGames += 1;
    if (resolution.assassinated) assassinations += 1;

    const other: Side = resolution.side === 'good' ? 'evil' : 'good';
    for (const raw of g.playerIds) {
      const id = canonical(raw);
      const won = resolution.winners.has(id);
      const side = won ? resolution.side : other;
      const a = get(id);
      if (side === 'good') {
        a.goodGames += 1;
        if (won) a.goodWins += 1;
      } else {
        a.evilGames += 1;
        if (won) a.evilWins += 1;
      }
    }
  }

  const perPlayer: Record<ID, Metric[]> = {};
  for (const [id, a] of per) {
    const metrics: Metric[] = [];
    if (a.goodGames) {
      metrics.push({
        key: 'av_good',
        label: 'Win rate as Good',
        value: fmtPct(a.goodWins / a.goodGames),
        sub: `${a.goodWins}/${a.goodGames}`,
        emoji: '🛡️',
      });
    }
    if (a.evilGames) {
      metrics.push({
        key: 'av_evil',
        label: 'Win rate as Evil',
        value: fmtPct(a.evilWins / a.evilGames),
        sub: `${a.evilWins}/${a.evilGames}`,
        emoji: '🗡️',
      });
    }
    const total = a.goodGames + a.evilGames;
    if (total) {
      metrics.push({
        key: 'av_loyalty',
        label: 'Dealt to Good',
        value: fmtPct(a.goodGames / total),
        sub: `${a.goodGames}/${total}`,
        emoji: '⚜️',
      });
    }
    if (metrics.length) perPlayer[id] = metrics;
  }

  const global: Metric[] = [];
  if (questsPlayed) {
    global.push({ key: 'av_quests', label: 'Quests undertaken', value: `${questsPlayed}`, emoji: '🗺️' });
    global.push({
      key: 'av_fails',
      label: 'Quests failed',
      value: fmtPct(questFails / questsPlayed),
      sub: `${questFails}/${questsPlayed}`,
      emoji: '💥',
    });
  }
  if (resolvedGames) {
    global.push({
      key: 'av_assassin',
      label: 'Merlin assassinated',
      value: fmtPct(assassinations / resolvedGames),
      sub: `${assassinations}/${resolvedGames}`,
      emoji: '🗡️',
    });
  }

  return { perPlayer, global };
}
