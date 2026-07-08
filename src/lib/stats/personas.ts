import type { MemberStats } from './types';

/** Normalized playstyle axes (0..1), derived from a member's window of stats. */
export interface PersonaTraits {
  winRate: number;
  /** Win rate when the game was decided by a small margin. */
  clutch: number;
  /** Spread of finishing positions — high = boom-or-bust. */
  volatility: number;
  /** Share of wins led wire-to-wire. */
  frontRunning: number;
  /** Share of wins clawed back from behind. */
  comeback: number;
  /** Podium reliability tempered by low volatility. */
  consistency: number;
}

export interface Persona {
  key: string;
  name: string;
  emoji: string;
  voice: string;
  /** 0..1 strength of the match; low = "still figuring you out". */
  confidence: number;
  traits: PersonaTraits;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** ~8 finished games before a real archetype is assigned (else "Rookie"). */
export const PERSONA_MIN_GAMES = 8;

/** Derive the normalized trait vector from a member's stats. */
export function personaTraits(m: MemberStats): PersonaTraits {
  const podiumRate = m.played ? m.podiums / m.played : 0;
  const volatility = clamp01((m.finishStdev ?? 0) / 1.25);
  return {
    winRate: clamp01(m.winRate),
    // Only trust clutch once there's a few close games on record.
    clutch: m.closeGames >= 3 ? clamp01(m.closeWins / m.closeGames) : 0,
    volatility,
    frontRunning: m.wins > 0 ? clamp01(m.wireToWireWins / m.wins) : 0,
    comeback: m.wins > 0 ? clamp01(m.comebackWins / m.wins) : 0,
    consistency: clamp01(podiumRate * (1 - volatility)),
  };
}

interface Archetype {
  key: string;
  name: string;
  emoji: string;
  voice: string;
  /** Trait emphasis; the dot product with the trait vector is the match score. */
  w: Partial<Record<keyof PersonaTraits, number>>;
}

// Ordered rarest → most common so ties break toward the more distinctive persona.
const ARCHETYPES: Archetype[] = [
  { key: 'closer', name: 'The Closer', emoji: '🧊', voice: 'Ice in your veins when it’s tight.', w: { clutch: 1 } },
  { key: 'wildcard', name: 'Wildcard', emoji: '🎲', voice: 'Boom or bust, never boring.', w: { volatility: 1 } },
  { key: 'comeback', name: 'Comeback Kid', emoji: '🪦', voice: 'Down? Never out.', w: { comeback: 1 } },
  { key: 'frontrunner', name: 'Front-Runner', emoji: '🐎', voice: 'Grab the lead, never give it back.', w: { frontRunning: 1, comeback: -0.4 } },
  { key: 'consistent', name: 'Mr./Ms. Consistent', emoji: '📏', voice: 'Always there or thereabouts.', w: { consistency: 1, volatility: -0.4 } },
];

const score = (t: PersonaTraits, a: Archetype): number => {
  let s = 0;
  for (const [k, w] of Object.entries(a.w)) s += (w ?? 0) * t[k as keyof PersonaTraits];
  return s;
};

/**
 * Assign a playstyle persona from a member's stats. Under {@link PERSONA_MIN_GAMES}
 * finished games it's "The Rookie"; otherwise the best-matching archetype, or a
 * neutral "All-Rounder" when nothing stands out. The caller chooses the window
 * (e.g. a trailing ~20 games) by passing the matching {@link MemberStats}.
 */
export function assignPersona(m: MemberStats): Persona {
  const traits = personaTraits(m);
  if (m.played < PERSONA_MIN_GAMES) {
    return {
      key: 'rookie',
      name: 'The Rookie',
      emoji: '🌱',
      voice: 'Your style is still being written…',
      confidence: clamp01(m.played / PERSONA_MIN_GAMES),
      traits,
    };
  }

  let best = ARCHETYPES[0];
  let bestScore = score(traits, best);
  for (const a of ARCHETYPES.slice(1)) {
    const s = score(traits, a);
    if (s > bestScore) {
      best = a;
      bestScore = s;
    }
  }

  if (bestScore < 0.34) {
    return {
      key: 'allrounder',
      name: 'The All-Rounder',
      emoji: '⚖️',
      voice: 'No single tell — you play it all.',
      confidence: clamp01(bestScore + 0.34),
      traits,
    };
  }

  return { key: best.key, name: best.name, emoji: best.emoji, voice: best.voice, confidence: clamp01(bestScore), traits };
}
