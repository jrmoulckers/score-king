import type { Component } from 'svelte';
import type { GameModule, ID, RoundContext } from '../../types';
import type { CustomGameDef, CustomInput } from './types';
import { effectiveColumns } from './types';
import {
  scoreCustomRound,
  customMaxRounds,
  customIsFinished,
  describeCustomRound,
} from './scoring';
import CustomRoundEditor from './CustomRoundEditor.svelte';

/**
 * Compile a declarative {@link CustomGameDef} into a real, first-class `GameModule`.
 *
 * Scoring is pure and deterministic (see {@link ./scoring}): a round score is the sum of the
 * def's columns per player (columns flagged `negative` subtract). There is no `eval` and no
 * per-instance config — win direction, target, and round limit are baked into the definition,
 * so the new-game form is just player selection.
 */
export function buildCustomModule(def: CustomGameDef): GameModule {
  return {
    id: def.id,
    name: def.name || 'Custom game',
    tagline: def.tagline || (def.lowerIsBetter ? 'Lowest score wins' : 'Highest score wins'),
    emoji: def.emoji || '🎲',
    minPlayers: def.minPlayers,
    maxPlayers: def.maxPlayers,
    lowerIsBetter: def.lowerIsBetter,

    createRoundInput: (ctx: RoundContext): CustomInput => {
      const cols = effectiveColumns(def);
      return {
        values: Object.fromEntries(
          ctx.players.map((p) => [p.id, Object.fromEntries(cols.map((c) => [c.key, 0]))]),
        ),
      };
    },

    validateRound: () => null,

    scoreRound: (input: CustomInput, ctx: RoundContext): Record<ID, number> =>
      scoreCustomRound(input, ctx.players, def),

    maxRounds: () => customMaxRounds(def),

    isFinished: (totals) => customIsFinished(totals, def),

    describeRound: (round, players) => describeCustomRound(def, round, players),

    help: def.help || undefined,
    RoundEditor: CustomRoundEditor as Component<any>,
  };
}
