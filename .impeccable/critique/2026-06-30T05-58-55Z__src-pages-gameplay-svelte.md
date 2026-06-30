---
target: src/pages/GamePlay.svelte
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-06-30T05-58-55Z
slug: src-pages-gameplay-svelte
---
# Critique — `src/pages/GamePlay.svelte`

**Date:** 2026-06-29 (re-run) · **Score:** **37 / 40 — Excellent** · **P0:** 0 · **P1:** 0

Re-run after the critique-fix pass (P1/P2 remediation) and the `/impeccable polish`
pass. Two isolated assessments — design review (Nielsen heuristics) and a
detector + browser-evidence pass — synthesized below.

## Heuristic scoring

| # | Heuristic | Score | Notes |
|---|-----------|:-----:|-------|
| 1 | Visibility of system status | 4 | Loading skeleton (`aria-busy`), save → green row pulse + new row + reordered standings, delete → "Round N deleted · Undo" toast, validation error toast, finished → gold banner. Save pulse is subtle (no text) but row growth is unmistakable. |
| 2 | Match between system & real world | 4 | Plain language throughout: Player, Score, Round, Total, Rd, Save round, Finish, Reopen, Play again. Symbol jargon (Σ, bare "R") eliminated. |
| 3 | User control & freedom | 4 | Undo on both destructive actions (round + game), edit any round, cancel edit, reopen finished game, play again. |
| 4 | Consistency & standards | 4 | Gold now exclusively = leader/winner (rank-1, leader totals, 👑, banner). `confirm()` replaced with in-app toasts. Button sizing unified at 46px. Residual: two finish affordances with differing copy. |
| 5 | Error prevention | 4 | Destructive delete relocated out of the row into the edit card as a separated full-width danger button; inputs validated before save; undo as the safety net. |
| 6 | Recognition over recall | 4 | Color avatars everywhere; Σ/R recall removed; named scoreboard sits directly above the initials-only matrix. Minor: matrix heads are avatar-only; win-direction relies on memory. |
| 7 | Flexibility & efficiency | 3 | Unchanged this pass. No keyboard entry, no quick +5/+10 presets; a +14 entry is 14 taps. Fine casual, slow for power users. |
| 8 | Aesthetic & minimalist design | 3 | Gold noise gone, screen reads cleanly. But two stacked total displays remain (ranked Scoreboard + matrix Total row) — redundant. |
| 9 | Help users recover from errors | 4 | Undo toasts reverse destructive actions; validation errors are human-readable; edit/reopen recover from mistakes. |
| 10 | Help & documentation | 3 | Clearer labels + Reopen tooltip, but still no first-run teaching: a newcomer isn't told what Tally scores or whether high or low wins. |
| | **Total** | **37/40** | **Excellent — minor polish only; ship it** |

## Cognitive load

Low (0–1 failures). Jargon removed, single clear primary per screen, standings
always visible (no cross-step memory), icons carry `aria-label`/`title`. The only
recall demand is the scoring direction (high vs low wins), which isn't stated.

## Anti-pattern / slop check

Clean. No side-stripe borders (winner uses a full background tint + full-width
gold underline, not a left stripe), no gradient text, no decorative glass (glass
is reserved for the app/tab bars per the design system), no hero-metric template,
no identical card grids. Gold scarcity restored to design-system intent.

## What's working

- **Gold is meaningful again** — leader score, leader totals, 👑, and the win
  banner are the only gold; everything else is neutral. Crown Gold reads as
  "this is the leader/winner," exactly as DESIGN.md mandates.
- **Comprehensive feedback** — skeleton on load, green pulse on save, undo toasts
  on destructive actions, gold banner on finish. Status is always legible.
- **Strong accessibility** — 46px touch targets throughout, `scope`'d table
  headers, `sr-only` Actions header, `aria-busy` skeleton, `tabular-nums` on every
  changing number, reduced-motion-safe animations, and state never signalled by
  color alone (rank number + position + 👑 reinforce the gold).
- **Non-destructive by default** — every delete is reversible; native `confirm()`
  is gone.
- **One primary per screen** — Royal Violet marks Save round / Play again only;
  "Finish game now" is a ghost button.

## Priority issues (remaining)

- **P2 — Tap-heavy data entry (#7).** No keyboard support or quick increments; a
  big round is many taps. Main unaddressed friction for repeat/power users.
- **P2 — Redundant standings (#8).** The ranked Scoreboard and the matrix Total
  row both display totals. Consider distilling one.
- **P3 — No first-run teaching (#10, #2).** A newcomer isn't told the scoring
  direction (high vs low wins) or what Tally counts.
- **P3 — Two finish affordances (#4).** "Finish & record winner" vs "Finish game
  now" use different copy for the same action.
- **P3 — Avatar-only matrix heads (#6).** Column identity relies on cross-
  referencing the scoreboard above.

## Persona red flags

- **Sam (accessibility):** Strong. 46px targets, scoped headers, reduced-motion,
  no color-alone. Minor: the horizontally-scrolling matrix with avatar-only heads
  is the weakest spot for screen-reader column association (mitigated by `scope`).
- **Alex (power user):** Friction. Tap-only entry, no shortcuts or presets — the
  one place this screen feels slow.
- **Jordan (first-timer):** Plays fine (plain labels, obvious primary) but is
  never taught the rules/direction; may be unsure what's being scored.

## Trend

Previous: 28/40 (Good). Now: **37/40 (Excellent)** — **+9**. The lift comes from
the heuristics the fix + polish passes targeted: consistency (#4, gold + confirm +
sizing), error prevention (#5, relocated delete), control/recovery (#3/#9, undo),
match/recognition (#2/#6, Total/Rd labels), and visibility (#1, skeleton + flash).
The residual ceiling is power-user efficiency (#7), table redundancy (#8), and
onboarding/help (#10) — none addressed by this pass.

## Detector

`detect.mjs --json src/pages/GamePlay.svelte` → `[]` (exit 0, clean).
