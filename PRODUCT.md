# Product

## Register

product

## Users

People keeping score during live, in-person card & party games — Hearts, Skull King,
a generic Tally, with more on the way. The person holding the phone is mid-game: at a
table, often one-handed, sometimes in dim lighting, frequently offline, and usually
passing or propping the device so others can see. Their job is to track scores across
rounds quickly and accurately, across a variety of games, with zero setup, no account,
and no fear of losing data. Players and history are shared across games, so regulars
(game-night groups, families) come back to the same roster and leaderboard.

## Product Purpose

Score King is a local-first, installable PWA that keeps score for card & party games so
the math and bookkeeping disappear into the night. Each game is a self-contained,
pluggable module (config, round entry, scoring, validation); players, history, and stats
are shared across all of them. Everything saves instantly to the device (IndexedDB) and
works fully offline, with optional, opt‑in OneDrive JSON backup for people who want it.
Success looks like this: open the app, pick a game, enter rounds, glance at who's
winning — and never think about the tool itself.

## Brand Personality

Whimsical, Easy, Game-Night Energy. The voice is friendly and light, never corporate or
verbose. The 👑 "King" motif, emoji-forward game tiles, and a purple-and-gold palette
carry the warmth and fun; the interaction underneath stays effortless, uncluttered, and
predictable. Personality shows up in the motif, the copy, and small moments — never in
noise, decoration, or redundancy.

## Anti-references

This should never feel cluttered, confusing, verbose, corporate, sterile, redundant,
ad-ridden, or inconsistent. Specifically NOT:

- Enterprise / corporate SaaS dashboards — gray, sterile, dense for density's sake.
- Ad-heavy, cluttered score-keeper apps from the app stores.
- Gimmicky, over-animated "gamified" UIs that get in the way of entering a score.
- Spreadsheet-like walls of numbers with no hierarchy or glanceability.

## Design Principles

- **The tool disappears into the table.** The fastest path from "round happened" to
  "score entered" wins. Minimal taps, big targets, glanceable standings. If a screen
  makes someone look down from the game for longer than necessary, it's too much.
- **Local-first is a trust contract.** Instant saves and full offline reliability are
  non-negotiable. Nothing — sync, network, accounts — is ever allowed to stand between a
  player and recording the score.
- **Whimsy, never clutter.** Personality lives in the motif, the copy, and small
  moments. It is never an excuse for noise, decoration, redundant controls, or anything
  that slows the core loop.
- **One vocabulary across every game.** A new game module should feel instantly familiar:
  the same buttons, the same round-entry rhythm, the same scoreboard. Consistency is the
  feature that lets the app grow without growing confusing.
- **Respect everyone at the table.** Inclusive and readable by default (color-blind-safe,
  reduced-motion, one-handed, legible in dim light), and respectful of the social moment —
  privacy when the phone is set down, shared visibility when the table wants it.

## Accessibility & Inclusion

Practical WCAG AA as the floor, with deliberate accommodations surfaced in Settings:

- **Color-blind support.** Color-blind-safe player colors and palette options; never rely
  on color alone to convey standing, win/loss, or state.
- **Accessibility settings hub.** A dedicated place in Settings for ability accommodations
  (contrast, text size, motion, color) rather than burying them.
- **Reduced motion.** Honor `prefers-reduced-motion` and offer an explicit in-app toggle;
  every animation needs a calm, instant alternative.
- **OLED-friendly dark mode.** A true-black option so the app is comfortable and
  battery-kind on OLED screens in dim rooms.
- **One-handed first.** Primary actions sit in the thumb zone; the app is usable held in
  one hand at a table.
- **Table mode (per game, where it helps).** An optional large, table-wide view so
  everyone can see standings, for games where shared visibility makes sense.
- **Privacy toggle.** Let a player hide scores when they set the phone down or step away,
  so others can't peek or cheat.
- **Stay-awake option.** An always-on / screen wake-lock setting so the device doesn't
  sleep mid-game.
- **Readable contrast and large touch targets** throughout, in both themes and all
  lighting.
