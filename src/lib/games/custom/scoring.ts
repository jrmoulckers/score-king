import type { ID, Player, Round } from '../../types';
import type { CustomGameDef, CustomInput } from './types';
import { COUNTER_COLUMN_KEY, effectiveColumns } from './types';

/**
 * The pure, deterministic scoring core for custom games — no Svelte, no IndexedDB, no `eval`.
 * The {@link ./factory factory} wraps these into a `GameModule`; keeping them here (mirroring the
 * top-level `src/lib/scoring.ts`) makes the engine independently testable and reusable.
 */

/** Sum one player's row across the def's columns — columns flagged `negative` subtract. */
export function scoreCustomRow(
  row: Record<string, number> | undefined,
  def: CustomGameDef,
): number {
  let sum = 0;
  for (const c of effectiveColumns(def)) {
    const v = Number(row?.[c.key]) || 0;
    sum += c.negative ? -v : v;
  }
  return sum;
}

/** Score a whole round: every player's total for the round, in the given order. */
export function scoreCustomRound(
  input: CustomInput | undefined,
  players: Player[],
  def: CustomGameDef,
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const p of players) out[p.id] = scoreCustomRow(input?.values?.[p.id], def);
  return out;
}

/** The fixed round cap for a def, or null when it's open-ended. */
export function customMaxRounds(def: CustomGameDef): number | null {
  return def.roundLimit && def.roundLimit > 0 ? def.roundLimit : null;
}

/**
 * Whether the game should end: only when a target is set (`> 0`) and some player's running
 * total has reached it. Unifies "first to X" (high-wins) and a bust ceiling (low-wins), exactly
 * like Hearts ending when someone hits 100.
 */
export function customIsFinished(totals: Record<ID, number>, def: CustomGameDef): boolean {
  const target = def.target && def.target > 0 ? def.target : 0;
  if (target <= 0) return false;
  return Object.values(totals).some((t) => t >= target);
}

/** A concise, glanceable per-player summary of a recorded round for the history table. */
export function describeCustomRound(def: CustomGameDef, round: Round, players: Player[]): string {
  const input = round.input as CustomInput | undefined;
  if (!input?.values) return '';
  const cols = effectiveColumns(def);
  const parts: string[] = [];
  for (const p of players) {
    const row = input.values[p.id];
    if (!row) continue;
    if (def.inputShape === 'columns') {
      const vals = cols.map((c) => Number(row[c.key]) || 0);
      if (vals.some((v) => v !== 0)) parts.push(`${p.name} ${vals.join('/')}`);
    } else {
      const v = Number(row[COUNTER_COLUMN_KEY]) || 0;
      if (v !== 0) parts.push(`${p.name} ${v > 0 ? '+' : ''}${v}`);
    }
  }
  return parts.length ? parts.join(' · ') : 'no change';
}
