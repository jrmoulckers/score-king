import type { ID } from '../types';

/**
 * Merge-aware identity resolution.
 *
 * Under the World's per-entity LWW model, two member records that turn out to be
 * the same human are reconciled by tombstoning the loser with a `mergedInto`
 * redirect rather than rewriting history. Stats therefore resolve identity **on
 * read**: build an alias map once, then canonicalize every member reference
 * (game.playerIds, winnerIds, round.deltas keys) before aggregating.
 *
 * Today's `Player` has no `mergedInto`, so this is a transparent no-op — but the
 * code path exists, is tested, and turns on the moment the field lands.
 */

/** The (future) shape this reads — kept structural so it works before `Member` exists. */
export interface MergeableMember {
  id: ID;
  mergedInto?: ID;
}

/**
 * Resolve each member id to its surviving canonical id, following `mergedInto`
 * chains transitively. Cycles and dangling targets resolve to the last safe id
 * rather than looping forever.
 */
export function buildAliasMap(members: ReadonlyArray<MergeableMember>): Map<ID, ID> {
  const direct = new Map<ID, ID>();
  for (const m of members) {
    if (m.mergedInto && m.mergedInto !== m.id) direct.set(m.id, m.mergedInto);
  }

  const resolved = new Map<ID, ID>();
  const resolve = (start: ID): ID => {
    const cached = resolved.get(start);
    if (cached) return cached;
    let current = start;
    const seen = new Set<ID>([current]);
    while (direct.has(current)) {
      const next = direct.get(current)!;
      if (seen.has(next)) break; // cycle guard
      seen.add(next);
      current = next;
    }
    for (const id of seen) resolved.set(id, current);
    return current;
  };

  for (const m of members) resolve(m.id);
  return resolved;
}

/** A canonicalizer closure; ids with no alias map to themselves. */
export function canonicalizer(aliases: Map<ID, ID>): (id: ID) => ID {
  return (id: ID) => aliases.get(id) ?? id;
}

/** Canonicalize + dedupe a list of member ids, preserving first-seen order. */
export function canonicalIds(ids: ReadonlyArray<ID>, canonical: (id: ID) => ID): ID[] {
  const out: ID[] = [];
  const seen = new Set<ID>();
  for (const id of ids) {
    const c = canonical(id);
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/** Sum a per-id delta map into canonical buckets. */
export function canonicalDeltas(
  deltas: Record<ID, number>,
  canonical: (id: ID) => ID,
): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const [id, v] of Object.entries(deltas)) {
    const c = canonical(id);
    out[c] = (out[c] ?? 0) + (Number(v) || 0);
  }
  return out;
}
