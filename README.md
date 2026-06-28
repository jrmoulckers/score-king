# 👑 Score King

A lightweight, local‑first **score‑keeping PWA** for card & party games — Hearts, Spades,
Cribbage, Finding Friends, Skull King, and a generic tally for *any* game you can think of.

Live at **[score.jrmoulckers.com](https://score.jrmoulckers.com)**. Installable on phone & desktop,
works fully offline, and can back itself up to an **Excel workbook in your OneDrive**.

---

## ✨ Features

- **Local‑first.** Every game is saved instantly to your device (IndexedDB). No account, no
  network needed to play.
- **Installable PWA.** Add to home screen; launches full‑screen and works offline.
- **Pluggable game modules.** Each game is a self‑contained module (config, round entry, scoring,
  validation). Adding a new game doesn't touch the rest of the app.
- **Players, history & stats** are shared across every game — reusable players, a full game log,
  and a win‑rate leaderboard.
- **Optional OneDrive Excel sync.** One‑click backup/restore to a real `.xlsx` you can open in
  Excel. Uses your own free Azure app registration — *no secrets live in this repo.*
- **Local JSON export/import** as a zero‑setup backup option.
- **Dark / light** themes.

### Games today
| Game | Notes |
|------|-------|
| 🏴‍☠️ **Skull King** | 10 rounds, bid vs. tricks, configurable bonus handling |
| ♥️ **Hearts** | 26‑point validation, shoot‑the‑moon, optional J♦ variant, lower‑is‑better |
| 🎲 **Tally** | Generic counter — pick high‑ or low‑score‑wins and an optional target |

### Games on the roadmap
Spades (bags/nil), Cribbage (121 pegboard + skunks), Finding Friends / Zhao Pengyou
(needs house‑rule config). See [Adding a game](#-adding-a-game).

---

## 🧱 Tech stack

- **[Svelte 5](https://svelte.dev)** (runes) + **[Vite](https://vite.dev)** + **TypeScript**
- **[vite-plugin-pwa](https://vite-pwa-org.netlify.app/)** (Workbox) for offline + installability
- **[idb](https://github.com/jakearchibald/idb)** for IndexedDB
- **[@azure/msal-browser](https://github.com/AzureAD/microsoft-authentication-library-for-js)** +
  **Microsoft Graph** for OneDrive sync
- **[SheetJS / xlsx](https://sheetjs.com)** to read/write the Excel workbook
- Hosted on **GitHub Pages** (static), deployed by GitHub Actions

The MSAL and SheetJS libraries are **code‑split** and only downloaded when you actually use
OneDrive sync, so the core app stays ~34 KB gzipped.

---

## 🚀 Local development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build
npm run check      # type-check (svelte-check + tsc)
```

Requires Node 20.19+ or 22.12+ (Vite 8).

---

## 📦 Architecture

```
src/
  lib/
    games/            # one folder per game = a GameModule + its round editor
      registry.ts     # MODULES array — register new games here
      skullking/  hearts/  tally/
    components/        # shared UI (Scoreboard, Stepper, Avatar, PlayerSelect, …)
    storage/
      db.ts           # IndexedDB (players, games, rounds)
      sync.ts         # Snapshot + SyncProvider interface
      onedrive.ts     # MSAL + Graph + xlsx implementation
    stores/           # Svelte stores (games, players, settings, toast)
    types.ts          # GameModule contract + core types
    router.ts         # tiny history-based router
  pages/              # Home, GameType, GamePlay, History, Stats, Players, Settings
```

**Data model** (mirrored in IndexedDB and the Excel sheets):

- `Players(id, name, color, createdAt)`
- `Games(id, type, config, playerIds, status, createdAt, finishedAt, winnerIds)`
- `Rounds(id, gameId, index, inputs, scores, createdAt)`

---

## 🧩 Adding a game

1. Create `src/lib/games/<id>/index.ts` exporting a `GameModule` (see `types.ts`):
   - `id, name, emoji, minPlayers, maxPlayers`
   - `defaultConfig`, optional `configFields` for variant toggles
   - `createRoundInput`, `validateRound`, `scoreRound`
   - `maxRounds?`, `isFinished?`, `pickWinners?`, `resolveLowerIsBetter?`, `describeRound?`
   - `RoundEditor` — a Svelte component bound to the round draft
2. Create `src/lib/games/<id>/<Name>Editor.svelte` for round entry.
3. Register it in `src/lib/games/registry.ts`.

That's it — routing (`/<id>`), players, history, stats, and persistence all work automatically.

---

## ☁️ OneDrive / Excel sync setup (optional)

Sync is **opt‑in** — the app is fully usable offline without it. When enabled, each user signs in
with **their own** Microsoft account and the app writes a `Score King.xlsx` to **their own**
OneDrive. By default the file lives in a **sandboxed app folder** (`OneDrive → Apps → Score King`)
that the app is the *only* thing able to read — it can't see the rest of your OneDrive. Power users
can switch to a **custom folder** in Settings (which needs broader access — see below). There's a
single shared app registration; the client ID is **public** (for SPAs it isn't a secret — security
comes from PKCE + the redirect‑URI allowlist), so end users never configure anything. They just open
**Settings → Connect OneDrive**.

### One‑time developer setup (register the shared app)

1. [Azure Portal → App registrations](https://portal.azure.com/) → **New registration**.
2. Name it *Score King*; supported accounts = **Accounts in any organizational directory and
   personal Microsoft accounts** (so anyone with a Microsoft/Outlook account can sign in).
3. **Add a platform → Single‑page application (SPA)** — this matters; don't use "Web". Redirect
   URIs (add **all four** — the `/auth.html` ones are the minimal page the sign‑in popup returns
   to so it closes cleanly):
   - `https://score.jrmoulckers.com/auth.html`
   - `https://score.jrmoulckers.com`
   - `http://localhost:5173/auth.html`
   - `http://localhost:5173`
4. No client secret (public client + PKCE). Scopes are requested at sign‑in via **dynamic consent**,
   so you don't pre‑list them: the default **app‑folder** mode uses **`Files.ReadWrite.AppFolder`**
   (sandboxed to `/Apps/Score King`), while choosing a **custom folder** in Settings uses the
   broader **`Files.ReadWrite`** (Graph can't scope a delegated permission to one arbitrary folder).
5. Copy the **Application (client) ID** into `BUILT_IN_ONEDRIVE_CLIENT_ID` in
   [`src/lib/config.ts`](src/lib/config.ts) (or set `VITE_ONEDRIVE_CLIENT_ID` at build time). It's
   safe to commit.

After that, **Settings → Connect OneDrive** is one click for everyone. Power users / forks can
override with their own client ID under **Settings → Advanced**.

> The workbook has `Players`, `Games`, `Rounds`, and `RoundScores` sheets. The app treats local
> data as the source of truth during play and syncs the whole snapshot on demand.

### Google Drive (future)

The `SyncProvider` interface (`src/lib/storage/sync.ts`) is storage‑agnostic, so a Google Drive
provider can be added later using Google Identity Services + the `drive.file` scope (the app only
ever sees the backup file it creates). Note Google may show an "unverified app" notice to external
users until the OAuth consent screen is verified.

---

## 🌐 Deployment & domains

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes to GitHub
Pages.

- **Custom domain:** `public/CNAME` pins `score.jrmoulckers.com`. In your DNS, point that host at
  GitHub Pages, and set **Settings → Pages → Source = GitHub Actions**.
- **SPA deep links:** a build step copies `index.html` → `404.html` so refreshes on deep routes
  (e.g. `/play/abc`) resolve correctly on Pages.

### Vanity subdomains (later)
GitHub Pages serves a single custom domain, so per‑game subdomains like
`skullking.jrmoulckers.com` are done with a redirect layer (e.g. a **Cloudflare** redirect rule:
`skullking.jrmoulckers.com/*` → `https://score.jrmoulckers.com/skullking`). The app already routes
`/skullking`, `/hearts`, etc., so only the DNS/redirect side is left.

---

## 📄 License

Personal project — all rights reserved for now.
