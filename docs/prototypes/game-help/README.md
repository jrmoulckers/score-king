# Tabletop game-help prototype

Review-only Skull King concept for [#335](https://github.com/jrmoulckers/score-king/issues/335).
It is not connected to production routes, storage, game drafts, or the app build.
The user-approved layout now informs the production Skull King guide in
`src/lib/games/skullking/SkullKingHelp.svelte` ([#340](https://github.com/jrmoulckers/score-king/issues/340)).
This standalone preview remains a design artifact, including its unfinished lesson placeholders;
the production guide contains only the implemented scoring reference and walkthrough.

From the repository root, using Node 24:

```powershell
node docs\prototypes\game-help\serve.mjs
```

Open the localhost URL printed by the server (it chooses an available port). Choose
a bid, tap the stacks representing tricks you won, and read the score directly below.
Each stack is a toggle, with a checkmark and pressed state when selected.
Change the round, browse topics, and switch between light and dark themes.
The preview uses the existing app CSS and serves the existing Skull King scorer
with TypeScript types stripped; it does not maintain a second scoring implementation.
No install, external assets, or network services are needed.

```powershell
node --test docs\prototypes\game-help\prototype.test.mjs
```

The test checks asset isolation and scoring across every legal bid/trick combination
in rounds 1–10. It does not replace browser, keyboard, screen-reader, or visual review.
The learning path is explicitly incomplete; its unimplemented lessons are labeled.
Card-stack artwork is original and symbolic, not a depiction of official cards or trick resolution.

## Optional browser verification

With Microsoft Edge installed, restore Playwright into an ignored, prototype-local
tools directory (not the app's dependencies), then run the interaction checks:

```powershell
npm install --no-save --no-package-lock --ignore-scripts --prefix docs\prototypes\game-help\tools.local @playwright/test
node docs\prototypes\game-help\browser-check.mjs
```

This opens only its own temporary localhost server. It checks score updates, bounds,
topic navigation, modal keyboard containment, Escape/focus return,
and viewport fit at 1440px, 390px, and 320px. Desktop and mobile captures in both themes
are written under `tools.local`. Screen-reader verification remains a separate check.
