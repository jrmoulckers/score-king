---
name: Score King
description: A whimsical, local-first PWA that keeps score for card & party games.
colors:
  primary: "#7c5cff"
  primary-strong: "#6b46f0"
  accent: "#ffd166"
  good: "#34d399"
  bad: "#f87171"
  warn: "#fbbf24"
  dark-bg: "#0f1020"
  dark-surface: "#1a1b2e"
  dark-surface-2: "#24263f"
  dark-surface-3: "#2c2e4d"
  dark-border: "#313357"
  dark-text: "#e9e9f4"
  dark-muted: "#a3a6cb"
  light-bg: "#f4f4fb"
  light-surface: "#ffffff"
  light-surface-2: "#f1f1f9"
  light-surface-3: "#e7e7f4"
  light-border: "#dcdcea"
  light-text: "#1c1d2e"
  light-muted: "#5b5e7e"
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.6rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
    lineHeight: 1.4
  overline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  sm: "9px"
  md: "14px"
  chip: "10px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "12px 18px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.primary-strong}"
  button-default:
    backgroundColor: "{colors.dark-surface-2}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.sm}"
    padding: "12px 18px"
    height: "46px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.dark-text}"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.bad}"
  card:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.md}"
    padding: "16px"
  input:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.sm}"
    padding: "11px 12px"
    height: "46px"
  pill:
    backgroundColor: "{colors.dark-surface-2}"
    textColor: "{colors.dark-muted}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  gametile:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.md}"
    padding: "16px"
  iconbtn:
    backgroundColor: "{colors.dark-surface-2}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.chip}"
    size: "42px"
---

# Design System: Score King

## 1. Overview

**Creative North Star: "The Game-Night LARPer"**

Score King is a whimsical game-night host that role-plays through thematic elements
customized per game, while the interaction underneath stays effortless and identical
everywhere. The chrome is the costume; the mechanics are the actor. A self-contained,
calm dark-violet shell — top app bar, scrollable stage, bottom tab bar — never changes,
so the muscle memory of entering a score is the same in Skull King as in Hearts as in a
generic Tally. The theming lives on top of that shell: each game brings its own emoji,
its own accent moments, its own round-entry flavor (🏴‍☠️, ♥️, 🎲), the way a LARPer
swaps costumes but keeps the same easy patter. The single phone is the table — held
one-handed, passed around, propped up for everyone to see, or (ahead) networked across
devices — so every surface is built first for a thumb in a dimly lit room.

The palette is royal by design: deep indigo-violet fields, a single **Royal Violet**
that marks the one action that matters, and a scarce **Crown Gold** that appears only on
the leader and the winner. Personality comes from the 👑 motif, the warmth of the violet,
and small earned moments — never from noise. Depth is built from layered surfaces, not
stacked shadows; motion is fast and functional, never choreography you have to wait for.

This system explicitly rejects everything in PRODUCT.md's anti-references: it is never
**cluttered, confusing, verbose, corporate, sterile, redundant, ad-ridden, or
inconsistent**. No enterprise-SaaS grayness. No app-store ad chrome. No gamified
over-animation that gets in the way of typing a number.

**Key Characteristics:**
- Consistent chrome, thematic costume — one shell, per-game flavor on top.
- Royal violet + scarce crown gold on a deep indigo field.
- Dark-first, OLED-friendly, readable in dim light; light theme is a faithful inversion.
- One-handed, thumb-zone-first, ≥46px touch targets.
- Glanceable: tabular numbers, clear standings, the crown tells the story at a glance.

## 2. Colors

A royal, low-light palette: saturated violet and gold playing against deep indigo
neutrals, with a tight semantic set for win/loss/caution. Every component binds to CSS
custom properties that swap between the **dark** (default) and **light** themes, so the
roles below are theme-agnostic; the frontmatter carries the dark values as canonical
because the app boots `data-theme="dark"`.

### Primary
- **Royal Violet** (`#7c5cff`): The one brand action color. Primary buttons, the active
  tab, focus rings, links, and the avatar default. Exactly one Royal Violet button per
  screen — the single most important action.
- **Deep Violet** (`#6b46f0`): The pressed/hover state of Royal Violet. Never a fill on
  its own; only the darker echo of a primary action under interaction.

### Secondary
- **Crown Gold** (`#ffd166`): Reserved for the current leader (👑) and the winner (🏆 +
  the winner-row highlight) — nothing else. The **crown** marks who's reigning *right now*;
  the **trophy** marks who *won*. Same gold, two distinct icons so the two are never
  confused. Scarcity is the whole point — it is never a button, link, or decoration.
- **Crown Gold Ink** (`--accent-ink`: `#ffd166` dark / `#806600` light): The text form of
  Crown Gold for the leader/winner *number* (`.lead`). Pure `#ffd166` fails WCAG on light
  surfaces, so light theme darkens it to `#806600` (≥4.5:1 on white) while keeping the gold
  identity. Use `--accent-ink` for gold text, `--accent` for gold washes/fills.

### Tertiary (Semantic)
- **Win Green** (`#34d399`): Positive deltas, good scores, success/synced states.
- **Loss Coral** (`#f87171`): Negative deltas, destructive actions (text only), errors.
- **Caution Amber** (`#fbbf24`): Warnings and pending/attention states.

### Neutral — Dark (default)
- **Midnight Court** (`#0f1020`): App background, behind a faint violet radial glow
  (`radial-gradient(1200px 600px at 50% -10%, #1c1d3a, #0f1020)`).
- **Indigo Slate** (`#1a1b2e`) → **Raised Slate** (`#24263f`) → **Lifted Slate**
  (`#2c2e4d`): The three-step surface ramp. Depth is built by climbing this ramp, not by
  adding shadow.
- **Court Line** (`#313357`): Borders, dividers, table rules.
- **Moonlight** (`#e9e9f4`): Primary text. **Lavender Gray** (`#a3a6cb`): muted text,
  labels, secondary metadata.

### Neutral — Light
- **Lilac Mist** (`#f4f4fb`) bg, **White** (`#ffffff`) surface, **Frost** (`#f1f1f9`) /
  **Haze** (`#e7e7f4`) raised surfaces, **Cloud Line** (`#dcdcea`) borders, **Ink**
  (`#1c1d2e`) text, **Slate Gray** (`#5b5e7e`) muted.

### Player Palette
- A fixed 12-color avatar palette (`#7c5cff, #34d399, #f87171, #fbbf24, #38bdf8, #fb7185,
  #a78bfa, #4ade80, #f59e0b, #22d3ee, #e879f9, #facc15`), assigned in order so each
  player at the table is instantly distinguishable. Identity is always reinforced by
  initials inside the avatar, never color alone.

### Named Rules
**The Crown Gold Rule.** Crown Gold (`#ffd166`) belongs to the leader and the winner —
nothing else. The moment gold appears on an ordinary button, link, or flourish, it stops
meaning "you're winning," and the 👑 loses its power.

**The One Voice Rule.** Royal Violet marks a single primary action and the active tab.
One violet fill per screen. Everything else is surface, neutral, or semantic.

**The Color-Is-Never-Alone Rule.** Standing, win/loss, and state are never carried by
hue alone (rank number, the 👑, initials, +/- sign, and text always co-signal) so the app
stays legible for color-blind players.

## 3. Typography

**Display / Body Font:** System UI stack (`system-ui, -apple-system, "Segoe UI", Roboto,
Helvetica, Arial, sans-serif`).

**Character:** One native sans does everything — headings, buttons, labels, dense score
columns. It loads instantly, renders crisply on every phone, and never competes with the
game's own personality. There is no display/body pairing here on purpose: the *game* is
the display typeface; the UI type stays quiet.

### Hierarchy
- **Display / h1** (700, 1.6rem, 1.2): Page titles. The ceiling — Score King never shouts
  larger than this.
- **Title / h2** (700, 1.25rem, 1.2): Section and card headings.
- **Body** (400, 1rem, 1.5): Default text, list rows, descriptions. Cap prose at 65–75ch.
- **Label** (400, 0.9rem, 1.4, Lavender Gray): Form labels and secondary metadata, always
  muted, always above their field.
- **Overline / section-title** (600, 0.8rem, +0.08em tracking, UPPERCASE, muted): The
  quiet "Continue / Start a game / Recent results" group headers. One short word or
  phrase — this is the *only* sanctioned uppercase-tracked label in the system.

### Named Rules
**The Tabular Score Rule.** Every number that can change — scores, totals, round counts —
renders with `font-variant-numeric: tabular-nums` and weight 700, so columns never jitter
as values update and the leader is readable at a glance across the table.

**The Quiet-Type Rule.** UI type never tries to be the personality. No display fonts in
labels, buttons, or data. Whimsy comes from the motif, the emoji, and the copy — not from
the letterforms.

## 4. Elevation

A layered-surface system with one soft shadow, not a shadow-stack. Depth is built by
climbing the surface ramp (`surface` → `surface-2` → `surface-3`); the single drop shadow
exists only to float genuinely floating objects (cards, game tiles, the toast) off the
background. The faint violet radial glow behind the body adds atmosphere without a single
box-shadow.

### Shadow Vocabulary
- **Soft Lift** (`box-shadow: 0 10px 30px rgba(0,0,0,0.45)` dark / `0 10px 30px
  rgba(60,50,120,0.12)` light): The only shadow. Cards, game tiles, toast.
- **Inset Hairline** (`inset 0 0 0 1px rgba(0,0,0,0.18)`): A 1px inner ring on avatars so
  light-colored player dots keep their edge on light surfaces.

### Named Rules
**The Soft-Lift Rule.** One shadow token, used sparingly. If something needs to feel
deeper, raise it one step up the surface ramp instead of darkening or stacking shadows.

**The Glass-Chrome Rule.** Backdrop blur (`backdrop-filter: blur(10–12px)`) is permitted
on exactly two surfaces — the sticky top app bar and the fixed bottom tab bar — because
they are persistent navigation floating over scrolling content. Glass appears nowhere
else; it is structural here, never decoration.

## 5. Components

The chrome is consistent and quiet; per-game theming layers on top. Every interactive
element shares one shape language (9px controls, 14px containers) and one state model
(hover → active press → focus ring → disabled).

### Buttons
- **Shape:** Gently rounded (9px / `--radius-sm`), min-height 46px, weight 600, 12×18px
  padding, 8px gap for icon+label.
- **Primary:** Royal Violet fill, white text, Deep Violet border; hover deepens to Deep
  Violet. The single most important action on a screen.
- **Default:** Raised Slate (`surface-2`) fill with a Court Line border; hover climbs to
  Lifted Slate (`surface-3`).
- **Ghost:** Transparent fill, same sizing — for low-emphasis inline actions.
- **Danger:** Transparent with Loss Coral text and a coral-tinted border — destructive
  actions only.
- **States:** `:active` presses down 1px (`translateY(1px)`); `:focus-visible` shows a 2px
  Royal Violet outline at 1px offset; disabled drops to 50% opacity. `small` variant is
  36px tall; `block` spans full width.

### Pills
- **Style:** Raised Slate fill, Court Line border, fully rounded (999px), 0.8rem muted
  text, 3×10px padding. Used for compact status ("Round 4") and meta tags — never as a
  button.

### Cards / Tiles
- **Corner Style:** 14px (`--radius`).
- **Background:** Indigo Slate (`surface`), Court Line border, Soft Lift shadow, 16px
  padding.
- **Game Tile:** A card variant for picking a game — large emoji, bold name, muted
  tagline; hover lifts 1px and the border becomes Royal Violet. This is the primary place
  per-game theming shows up.

### Inputs / Fields
- **Style:** Indigo Slate (`surface`) fill, Court Line border, 9px radius, min-height
  46px, full-width by default.
- **Focus:** 2px Royal Violet outline at 1px offset (matches buttons — one focus
  vocabulary everywhere).
- **Label:** muted 0.9rem, block, 6px below.

### Stepper (signature)
- A horizontal − / number / + control for round entry: two 46px Lifted-Slate icon
  buttons flanking a centered 62px tabular-number input, `inputmode="numeric"`. The
  fastest way to nudge a score one-handed without summoning the keyboard. Min/max disable
  the relevant button. This is the heartbeat of round entry — keep it identical across
  every game.

### Avatar (signature)
- A circular initials chip filled with the player's palette color, white text, weight 700,
  Inset Hairline ring. Size-parameterized (24–28px in lists). Always shows initials, so a
  player is identifiable without relying on color.

### Scoreboard (signature)
- A right-aligned numeric table (rank · player · score). Header row in muted overline
  caps; tabular-nums body; the rank-1 score uses Crown Gold (`.lead`); the winner row gets
  a restrained (~13%) Crown Gold wash under a Crown Gold underline — the 🏆 and gold score
  carry the win, so gold stays a hint, never a muddy block. The whole standing is legible
  at a glance from across the table.

### Feedback (loading & save)
- **Loading skeleton:** While a screen's data resolves, shaped shimmer blocks mirror the
  content silhouette (meta bar → board → entry card) instead of a bare "Loading…". No
  layout shift on arrival; the shimmer sweep settles to a static block under reduced motion.
- **Round-saved pulse:** A saved round briefly pulses its new scorecard row in Win Green
  (~0.9s) — positive confirmation kept distinct from Crown Gold (leader only). The row is
  already visible; the pulse just points to where the entry landed.
- **Undo toasts:** Destructive actions (delete round/game) confirm via an in-app toast with
  an Undo action rather than a native dialog — themed, dismissible, and reversible.

### Navigation
- **Top App Bar:** Sticky, glass (blurred translucent bg), Court Line bottom border; brand
  lockup (favicon + "Score King", weight 800) left, settings icon-button right.
- **Bottom Tab Bar:** Fixed, glass, four emoji+label tabs (Games / Players / History /
  Stats). Inactive tabs are muted; the active tab gets Moonlight text on a Raised Slate
  pill. Built for thumbs and `env(safe-area-inset-*)`.
- **Icon Button:** 46px square, 10px radius, Raised Slate fill — settings, steppers, and
  compact actions.

## 6. Do's and Don'ts

### Do:
- **Do** keep Crown Gold (`#ffd166`) for the leader and winner only — the crown earns its
  meaning through scarcity.
- **Do** ship exactly one Royal Violet primary action per screen; everything else is
  neutral, surface, or semantic.
- **Do** render every changing number with `tabular-nums` and weight 700 so columns stay
  glanceable.
- **Do** build depth by climbing the surface ramp (`surface` → `surface-2` → `surface-3`),
  and use the single Soft Lift shadow only for truly floating objects.
- **Do** keep touch targets ≥46px and primary actions in the thumb zone — this is played
  one-handed in dim light.
- **Do** co-signal state with shape, number, icon, and text — never color alone — for
  color-blind players.
- **Do** keep the chrome identical game to game; express per-game personality through
  emoji, copy, and accent moments, not by restyling the shell.
- **Do** give every animation a `prefers-reduced-motion` alternative (instant or crossfade).

### Don't:
- **Don't** ship anything **cluttered, confusing, verbose, corporate, sterile, redundant,
  ad-ridden, or inconsistent** — the named anti-references from PRODUCT.md.
- **Don't** let the UI look like an enterprise/corporate SaaS dashboard — no gray, sterile,
  density-for-its-own-sake screens.
- **Don't** import app-store score-keeper habits: ad chrome, banner clutter, upsell rails.
- **Don't** over-animate or "gamify" the core loop; motion stays 150–250ms and conveys
  state, never decoration you wait for.
- **Don't** use Crown Gold on buttons, links, or flourishes; don't add a second violet
  fill to compete with the primary action.
- **Don't** add `border-left`/`border-right` colored stripes, gradient text, or decorative
  glass — glass is only the app bar and tab bar.
- **Don't** introduce a display font into labels, buttons, or data; the system sans stays
  quiet so the game can be loud.
- **Don't** restyle the navigation, button, or stepper vocabulary per game — consistency
  is the feature that lets new games feel instantly familiar.
