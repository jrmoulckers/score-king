import type { GameModule, Round, RoundContext } from '../../types';
import { RoundEditor } from '../editor';
import { saladbowlStats } from './stats';
import {
  createInput,
  describe,
  makeTeams,
  pointsPerWord,
  roundCount,
  score,
  teamCount,
  validate,
  type SaladBowlInput,
} from './logic';

export type { SaladBowlInput };

/** Build this game's teams from the round context (players + config). */
function teamsFor(ctx: RoundContext) {
  return makeTeams(
    ctx.players.map((p) => p.id),
    teamCount(ctx.config),
  );
}

export const saladbowl: GameModule = {
  id: 'saladbowl',
  name: 'Salad Bowl',
  tagline: 'One bowl of words, three ways to guess it 🥗',
  emoji: '🥗',
  keywords: [
    'fishbowl',
    'salad bowl',
    'party',
    'word game',
    'charades',
    'taboo',
    'celebrity',
    'teams',
    'guessing',
  ],
  // A word game wants a clue-giver and guessers per team, so 2 teams of 2 is the floor.
  minPlayers: 4,
  maxPlayers: 12,
  teams: true,
  configFields: [
    {
      key: 'teams',
      label: 'Number of teams',
      type: 'select',
      default: '2',
      options: [
        { value: '2', label: '2 teams' },
        { value: '3', label: '3 teams' },
        { value: '4', label: '4 teams' },
      ],
      help: 'Players split into teams by the order you pick them — first team first.',
    },
    {
      key: 'rounds',
      label: 'Number of rounds',
      type: 'number',
      default: 3,
      min: 2,
      max: 4,
      help: 'Classic Salad Bowl is 3: Describe, One Word, Charades. Add a 4th for Sculptor.',
    },
    {
      key: 'pointsPerWord',
      label: 'Points per word guessed',
      type: 'number',
      default: 1,
      min: 1,
      max: 10,
    },
    {
      key: 'turnSeconds',
      label: 'Turn timer (seconds — a reminder, not enforced)',
      type: 'number',
      default: 60,
      min: 15,
      max: 300,
      step: 15,
    },
    {
      key: 'sound',
      label: 'Buzzer sound when the turn timer ends',
      type: 'boolean',
      default: true,
      help: 'A short buzz when time’s up. Always paired with a haptic + visual cue.',
    },
  ],
  // Highest total wins (shell default). Teammates share a total, so the whole team wins.

  maxRounds: (config) => roundCount(config),

  createRoundInput: (ctx: RoundContext): SaladBowlInput => createInput(teamsFor(ctx).length),

  validateRound: (input: SaladBowlInput, ctx: RoundContext): string | null =>
    validate(input, teamsFor(ctx)),

  scoreRound: (input: SaladBowlInput, ctx: RoundContext) =>
    score(input, teamsFor(ctx), pointsPerWord(ctx.config)),

  describeRound: (round: Round): string => describe(round),

  help: [
    'Everyone secretly writes a handful of words/names and drops them in the bowl.',
    'Teams take turns: on the clock, guess as many bowl words as you can — a team',
    'scores 1 point per word guessed (adjust "points per word" in setup).',
    '',
    'The SAME words are played across each round, only the clue rule gets harder:',
    '• Round 1 — 🗣️ Describe: say anything but the word itself.',
    '• Round 2 — ☝️ One Word: exactly one word as your clue.',
    '• Round 3 — 🎭 Charades: no talking, act it out.',
    '• Round 4 — 🗿 Sculptor (optional): mould a teammate into the word.',
    '',
    'Enter each team’s words-guessed for the round. Points add up across all rounds;',
    'the team with the highest total wins. 🏆',
  ].join('\n'),

  stats: saladbowlStats,

  RoundEditor,
  editorLoader: () => import('./SaladBowlEditor.svelte'),
};
