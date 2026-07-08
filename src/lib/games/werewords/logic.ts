import type { ID } from '../../types';

/**
 * Pure, Svelte-free Werewords logic — the twist outcomes, per-player scoring, and
 * validation live here so `werewords.test.ts` can exercise the real rules without
 * pulling in the round editor. `index.ts` wires these into the GameModule.
 *
 * Werewords is a scoreless, timed social-deduction word game. Each round has one
 * secret word. The **Village** team (Mayor, Seer, and Villagers) races to guess it
 * from yes/no questions before time runs out; the **Werewolves** — who also know the
 * word — try to run out the clock. We model this into the point-oriented GameModule
 * contract by banking one point per round for every player on the winning side, so a
 * player's total is simply the number of rounds their side won.
 */

export type WerewordsTeam = 'village' | 'werewolf';

export interface WerewordsInput {
  /** The secret magic word for this round. */
  word: string;
  /** The Mayor (knows the word, answers questions). Optional role reference. */
  mayor: ID | null;
  /** The Seer (knows the word and the wolves). Optional; only when the Seer is in play. */
  seer: ID | null;
  /** Everyone tapped as a werewolf this round — the hidden side. Drives scoring. */
  werewolves: ID[];
  /** Did the Village guess the word before time ran out? */
  guessed: boolean;
  /** Guessed twist: a werewolf then correctly named the Seer, stealing the win. */
  werewolfFoundSeer: boolean;
  /** Not-guessed twist: the Mayor correctly named a werewolf, stealing the win back. */
  mayorFoundWerewolf: boolean;
}

/** The runtime config an editor/scorer reads (all optional — defaults live in `index.ts`). */
export interface WerewordsConfig {
  werewolves?: number;
  seer?: boolean;
  timer?: number;
}

export interface WerewordsOutcome {
  /** Which side won the round after the twists resolve. */
  team: WerewordsTeam;
  /** True when a twist overturned the base guessed/not-guessed result. */
  twist: boolean;
  /** Short, past-tense reason describing how the round landed. */
  reason: string;
}

/**
 * Resolve the winning side of a round, applying both twist rules:
 *
 *  • Guessed → Village wins, UNLESS a werewolf identifies the Seer → Werewolves.
 *  • Not guessed → Werewolves win, UNLESS the Mayor identifies a werewolf → Village.
 */
export function resolveOutcome(input: WerewordsInput): WerewordsOutcome {
  if (input.guessed) {
    if (input.werewolfFoundSeer) {
      return {
        team: 'werewolf',
        twist: true,
        reason: 'guessed in time — but a werewolf unmasked the Seer',
      };
    }
    return { team: 'village', twist: false, reason: 'the word was guessed in time' };
  }
  if (input.mayorFoundWerewolf) {
    return {
      team: 'village',
      twist: true,
      reason: 'never guessed — but the Mayor unmasked a werewolf',
    };
  }
  return { team: 'werewolf', twist: false, reason: 'the word ran out the clock' };
}

/** True when a player sat on the werewolf side this round. */
export function isWerewolf(input: WerewordsInput, id: ID): boolean {
  return (input.werewolves ?? []).includes(id);
}

/** Which side a player was on this round (everyone not tapped as a wolf is Village). */
export function teamOf(input: WerewordsInput, id: ID): WerewordsTeam {
  return isWerewolf(input, id) ? 'werewolf' : 'village';
}

/**
 * Per-player deltas: every player on the winning side banks +1, everyone else 0.
 * Totals therefore read as "rounds won", and the leader is whoever has won most.
 */
export function scoreWerewords(
  input: WerewordsInput,
  playerIds: ID[],
): Record<ID, number> {
  const winner = resolveOutcome(input).team;
  const out: Record<ID, number> = {};
  for (const id of playerIds) {
    out[id] = teamOf(input, id) === winner ? 1 : 0;
  }
  return out;
}

/** Return null when the round is valid to save, otherwise a friendly message. */
export function validateWerewords(input: WerewordsInput, playerIds: ID[]): string | null {
  if (!input.word || !input.word.trim()) return 'Enter the secret magic word 🔮.';

  const roster = new Set(playerIds);
  const wolves = new Set((input.werewolves ?? []).filter((id) => roster.has(id)));
  if (wolves.size < 1) return 'Tap at least one werewolf 🐺.';
  if (wolves.size > playerIds.length - 1) {
    return 'At least one villager has to stay in the village.';
  }
  if (input.mayor && wolves.has(input.mayor)) return 'The Mayor can’t also be a werewolf.';
  if (input.seer && wolves.has(input.seer)) return 'The Seer can’t also be a werewolf.';
  if (input.mayor && input.seer && input.mayor === input.seer) {
    return 'The Mayor and the Seer have to be different players.';
  }
  return null;
}

/** A one-line summary of a round for the scorecard / history: the word + how it landed. */
export function describeWerewords(input: WerewordsInput): string {
  const { team, reason } = resolveOutcome(input);
  const word = input.word?.trim() ? `“${input.word.trim().toUpperCase()}”` : 'the word';
  const badge = team === 'werewolf' ? '🐺 Werewolves' : '🏘️ Villagers';
  return `${badge} win · ${word} — ${reason}`;
}
