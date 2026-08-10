# Product

## Register

product

## Users

> Satisfies `PROD-STRAT-001`.

People keeping score during live, in-person card & party games — Hearts, Skull King, a generic
Tally, with more on the way. The person holding the phone is mid-game: at a table, often
one-handed, sometimes in dim lighting, frequently offline, and usually passing or propping the
device so others can see. Their job is to track scores across rounds quickly and accurately,
across a variety of games, with zero setup, no account, and no fear of losing data. Players and
history are shared across games, so regulars (game-night groups, families) come back to the same
roster and leaderboard.

## Product Purpose

> Satisfies `PROD-STRAT-001`. The local-first data posture and the optional, opt-in OneDrive
> backup also satisfy `PROD-COMP-002` (game data stays on the device unless the player chooses
> otherwise) and `PROD-COMP-008` (backup is off by default, granular, and disconnectable no less
> easily than it is connected).

Score King is a local-first, installable PWA that keeps score for card & party games so the math
and bookkeeping disappear into the night. Each game is a self-contained, pluggable module
(config, round entry, scoring, validation); players, history, and stats are shared across all of
them. Everything saves instantly to the device (IndexedDB) and works fully offline, with
optional, opt‑in OneDrive JSON backup for people who want it. Success looks like this: open the
app, pick a game, enter rounds, glance at who's winning — and never think about the tool itself.

## Brand Personality

> Satisfies `PROD-STRAT-001`.

Whimsical, Easy, Game-Night Energy. The voice is friendly and light, never corporate or verbose.
The 👑 "King" motif, emoji-forward game tiles, and a purple-and-gold palette carry the warmth
and fun; the interaction underneath stays effortless, uncluttered, and predictable. Personality
shows up in the motif, the copy, and small moments — never in noise, decoration, or redundancy.

## Anti-references

> Satisfies `PROD-STRAT-001` — naming the failure modes makes the trust and value posture
> reviewable.

This should never feel cluttered, confusing, verbose, corporate, sterile, redundant, ad-ridden,
or inconsistent. Specifically NOT:

- Enterprise / corporate SaaS dashboards — gray, sterile, dense for density's sake.
- Ad-heavy, cluttered score-keeper apps from the app stores.
- Gimmicky, over-animated "gamified" UIs that get in the way of entering a score.
- Spreadsheet-like walls of numbers with no hierarchy or glanceability.

## Design Principles

> Score King's local expression of `PROD-STRAT-001` and of Studio's design contract
> (`STUDIO-FND-001`). Citations name the central obligation a rule answers to; the local wording
> is kept because it is the score-king-specific detail that obligation does not carry.

- **The tool disappears into the table.** The fastest path from "round happened" to "score
  entered" wins. Minimal taps, big targets, glanceable standings. If a screen makes someone look
  down from the game for longer than necessary, it's too much.
- **Local-first is a trust contract.** Score King's instance of `PROD-STRAT-001`: instant saves
  and full offline reliability are the trust constraints no growth or convenience decision may
  weaken. Nothing — sync, network, accounts — is ever allowed to stand between a player and
  recording the score.
- **Whimsy, never clutter.** Personality lives in the motif, the copy, and small moments. It is
  never an excuse for noise, decoration, redundant controls, or anything that slows the core
  loop.
- **One vocabulary across every game.** Per `STUDIO-CMP-001` and `STUDIO-TOK-002`, game modules
  compose the shared component contracts and bind to semantic tokens rather than restyling or
  forking them. Locally that means a new game module inherits the same buttons, the same
  round-entry rhythm, and the same scoreboard — consistency is the feature that lets the app
  grow without growing confusing.
- **Respect everyone at the table.** Per `STUDIO-A11Y-001` and `STUDIO-A11Y-002`: inclusive and
  readable by default (color-blind-safe, reduced-motion, one-handed, legible in dim light), and
  respectful of the social moment — privacy when the phone is set down, shared visibility when
  the table wants it. One-handed reach and dim-room legibility are local obligations; the
  central principles cover contrast and accessibility modes, not the table ergonomics.

## Accessibility & Inclusion

> Satisfies `PROD-CONTENT-005`. Score King owns the obligation and the accommodations below;
> Studio owns the interface expression and the conformance floor (`STUDIO-A11Y-001`,
> `STUDIO-A11Y-002`).

Practical WCAG AA as the floor, with deliberate accommodations surfaced in Settings:

- **Color-blind support.** Color-blind-safe player colors and palette options; never rely on
  color alone to convey standing, win/loss, or state (`STUDIO-A11Y-001`).
- **Accessibility settings hub.** A dedicated place in Settings for ability accommodations
  (contrast, text size, motion, color) rather than burying them.
- **Reduced motion.** Honor `prefers-reduced-motion` and offer an explicit in-app toggle
  (`STUDIO-A11Y-002`); every animation needs a calm, instant alternative.
- **OLED-friendly dark mode.** A true-black option so the app is comfortable and battery-kind on
  OLED screens in dim rooms.
- **One-handed first.** Primary actions sit in the thumb zone; the app is usable held in one
  hand at a table.
- **Table mode (per game, where it helps).** An optional large, table-wide view so everyone can
  see standings, for games where shared visibility makes sense.
- **Privacy toggle.** Let a player hide scores when they set the phone down or step away, so
  others can't peek or cheat.
- **Stay-awake option.** An always-on / screen wake-lock setting so the device doesn't sleep
  mid-game.
- **Readable contrast and large touch targets** throughout, in both themes and all lighting.
