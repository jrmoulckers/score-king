---
target: GamePlay
total_score: 28
p0_count: 0
p1_count: 3
timestamp: 2026-06-30T01-11-16Z
slug: src-pages-gameplay-svelte
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | No positive "round saved" confirmation; loading is bare text, not a skeleton |
| 2 | Match System / Real World | 3 | `Σ` and bare `R` column headers are math/abbreviation jargon; "Reopen" slightly ambiguous |
| 3 | User Control and Freedom | 3 | Edit/delete/reopen/play-again all present, but deletes are permanent (no undo) |
| 4 | Consistency and Standards | 2 | Gold "lead" means leader-only in one table, every-total in another; native confirm() breaks toast vocabulary; three button-size systems |
| 5 | Error Prevention | 3 | confirm() guards + validateRound, but tiny destructive trash sits next to edit |
| 6 | Recognition Rather Than Recall | 3 | Avatars-as-column-headers is great; Σ/R still require recall |
| 7 | Flexibility and Efficiency | 3 | Stepper + type entry, edit any round; no shortcuts, no quick +5/+10, slow for big scores |
| 8 | Aesthetic and Minimalist Design | 3 | Clean and well-spaced; two stacked tables are redundant; gold over-use adds noise |
| 9 | Error Recovery | 3 | Toasts for validation; edit/reopen recover; no undo after delete |
| 10 | Help and Documentation | 2 | No inline help for Σ/R, no first-round teaching, tagline absent on play screen |
| **Total** | | **28/40** | **Good — solid foundation, clear refinement opportunities** |

## Anti-Patterns Verdict

**Not AI slop.** This passes the product slop test: a Linear/Notion-fluent user would sit down and trust it. Genuine identity (crown logo, per-game emoji "costume", restrained violet/gold system), no gradient text, no side-stripe borders, no decorative glassmorphism (glass is correctly confined to the app bar + tab bar per DESIGN.md). Hierarchy reads cleanly, spacing has rhythm, the finish moment has real personality.

**Deterministic scan**: `detect.mjs` on `src/pages/GamePlay.svelte` returned `[]` (exit 0) — zero token-level slop tells. Clean.

**Browser evidence**: The skill's live-server overlay was not injected (the in-app browser automation times out in this environment), so no user-visible overlay exists. Instead I rendered the real screen via headless Edge across 5 states (active dark/light, finished, XL text, CVD). The visual review caught two contract violations the token detector structurally cannot see: Crown Gold over-application and gold-on-white contrast failure.

## Overall Impression

A confident, well-built scorekeeping screen that mostly honors its own design contract — and then breaks it in exactly the place the contract cares most about: **Crown Gold scarcity.** The single biggest opportunity is to make gold mean "leader/winner" and nothing else, and to make it survive light mode.

## What's Working

1. **Avatars as scorecard column headers** — recognition over recall, compact, and on-brand. You read the matrix by face/color, not by re-parsing names each row.
2. **Dual round entry (stepper + numeric input)** with constrained `inputmode="numeric"` — fast for ±1, forgiving for big numbers, and mobile-keyboard aware.
3. **The finish moment is a genuine peak** — 👑 on the winner row, 🏆 "<name> wins!" banner, gold-tinted standings, and "Play again" that preserves the roster. Strong peak-end payoff.

## Priority Issues

- **[P1] Crown Gold scarcity is broken in the Scorecard Σ row.** Every player's grand total renders in Crown Gold (`<td class="num lead">` on all columns, GamePlay.svelte L283-285; `.lead { color: var(--accent) }`). DESIGN.md reserves gold for *the leader and the winner only*. Right now four golds compete and the leader's specialness is gone — and it contradicts the top Scoreboard, which correctly golds only rank 1.
  - **Fix**: In the footer, apply `lead` only to the current leader's total (or drop gold entirely there and let the Scoreboard own the leader signal).
  - **Suggested command**: `/impeccable colorize`

- **[P1] Gold-as-text fails contrast in light mode.** `--accent: #ffd166` is defined once in `:root` and never remapped for `html[data-theme="light"]`. On the white surface that's ≈1.35:1 — well under WCAG 4.5:1. Both the legitimate leader number and the Σ totals are barely legible (visible in the light screenshot). This also brushes the "never signal by color alone" rule.
  - **Fix**: Give light theme a darker gold token that hits 4.5:1, or render gold as a medal/chip/background with dark ink rather than as text color, paired with weight/icon.
  - **Suggested command**: `/impeccable colorize`

- **[P1] Row-action touch targets are far below spec.** The `.mini` edit (✎) and delete (🗑) buttons are `padding: 2px 4px` (~20px tall) — against the ≥46px non-negotiable for one-handed, dim-light use — and the destructive delete sits immediately beside edit, inviting mis-taps on an irreversible action.
  - **Fix**: ≥44-46px targets; separate or demote the destructive action (overflow menu, swipe-to-reveal, or an explicit edit mode) so delete isn't a fat-finger away from edit.
  - **Suggested command**: `/impeccable adapt`

- **[P2] Native `confirm()` dialogs break the themed chrome.** Delete round (L149) and delete game (L170) drop a gray OS dialog into the "Game-Night LARPer" experience, bypassing the app's own toast vocabulary, theme, and motion settings.
  - **Fix**: In-app confirmation — ideally an undo toast ("Round deleted · Undo") rather than a blocking prompt.
  - **Suggested command**: `/impeccable harden`

- **[P2] Two primary (violet) buttons can co-exist.** When `finishedReady && canAddRound` are both true (e.g. a target is hit but rounds remain), "Save round" and "Finish & record winner" are both violet — violating one-primary-per-screen.
  - **Fix**: Keep round entry primary and demote "Finish & record winner" to secondary while a round can still be added (or vice-versa); never two violets at once.
  - **Suggested command**: `/impeccable layout`

## Persona Red Flags

**Sam (Accessibility-Dependent)**: The ~20px ✎/🗑 targets are unusable with low motor precision; gold-on-white totals fail contrast in light mode. Mitigations exist and are good — avatar initials + CVD palette mean color isn't the only cue, and `confirm()` is at least screen-reader native — but the touch-target and contrast gaps are real blockers.

**Alex (Power User)**: No keyboard shortcuts. Entering a 14-point round means 14 taps on `+` (no quick +5/+10 or focus-to-type affordance signposted). Every delete requires a separate confirm. Bulk/round-template entry would be natural and is absent.

**Jordan (First-Timer)**: `Σ` and `R` are unexplained symbols. No teaching on the very first round (what does "Tally" score? highest or lowest wins?). "Reopen" is ambiguous before you've finished a game.

## Minor Observations

- `Σ` / `R` headers are terse; consider "Total"/"Rd" or a tooltip.
- No positive confirmation toast after a round saves (the board just grows).
- Loading is a bare "Loading…" — product register prefers a skeleton.
- `.iconbtn` (42px) and the stepper +/− (≈42px) sit just under the 46px target spec — close, but inconsistent with `.btn`'s 46px.
- Scoreboard score column and Scorecard Σ row both show totals — mild redundancy.
- The leader/winner tint (`accent` mixed into a dark surface) reads brown/muddy rather than celebratory gold.

## Questions to Consider

- If gold marked exactly one number on this screen, would the leader feel more special than four golds do now?
- Should deleting a round be undoable instead of confirmed — fewer dialogs, more safety?
- Does the screen need both a ranked Scoreboard and a Σ row, or could one table carry standings + history?
- What would the fastest possible "+12 for Mia" entry look like for a power user?
