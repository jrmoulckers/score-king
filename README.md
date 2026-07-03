# 👑 Score King

A lightweight, local‑first **score‑keeping PWA** for card & party games — Hearts, Spades,
Cribbage, Finding Friends, Skull King, and a generic tally for *any* game you can think of.

Live at **[score.jrmoulckers.com](https://score.jrmoulckers.com)**. Installable on phone & desktop,
works fully offline, and can back itself up to a **JSON file in your OneDrive**.

---

## ✨ Features

- **Local‑first.** Every game is saved instantly to your device (IndexedDB). No account, no
  network needed to play.
- **Installable PWA.** Add to home screen; launches full‑screen and works offline.
- **Pluggable game modules.** Each game is a self‑contained module (config, round entry, scoring,
  validation). Adding a new game doesn't touch the rest of the app.
- **Players, history & stats** are shared across every game — reusable players, a full game log,
  and a win‑rate leaderboard.
- **Optional OneDrive sync.** Automatic (and one‑click) backup to a compact `.json` file in your own
  OneDrive, with one‑click restore. Keep **multiple titled backups** in the folder (one per group or
  occasion) and switch between them. Writes are guarded by an **ETag** and reconciled by a **per‑entity
  merge** (newest edit wins per player, game, and round), so two devices that change different things
  combine cleanly instead of one silently overwriting the other. Auto‑backup is on by default,
  push‑only, and never interrupts you. Uses your own free Azure app registration — *no secrets live in
  this repo.*
- **Local JSON export/import** as a zero‑setup backup option.
- **Play together (live).** Host a game and others follow along in real time on a shared board:
  the host stays the single source of truth and players send round entries as *intents* the host
  records. It links players in the **same browser** (multi‑tab) with **zero infrastructure**, and —
  once you deploy the tiny relay in [`relay/`](relay/README.md) and set its URL — **across devices**
  by code, link, or QR. The same engine sits behind a transport seam, so the relay swaps in without
  touching the game logic. Live play is never required — every game still works fully offline.
- **Nearby play (no internet).** Same‑room? Skip the relay entirely. Devices connect **directly over
  WebRTC**, set up by scanning (or pasting) a one‑time QR — no server, no code to type, nothing
  leaves the local network. Hosts add players from the game screen (**📡 Play nearby**); guests join
  at **/nearby**. Same host‑authoritative engine, just a serverless transport.
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
- Hosted on **GitHub Pages** (static), deployed by GitHub Actions

The MSAL library is **code‑split** and only downloaded when you actually use
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

> **Where this is heading:** see [ARCHITECTURE.md](ARCHITECTURE.md) for the target system — the
> self-owned **World**, identity/accounts, the merge model, and the live-play roadmap.

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
      onedrive.ts     # MSAL + Graph (JSON backup) implementation
    live/             # live co-play: host-authoritative engine + transport seam
      protocol.ts     # wire messages (hello/welcome/state/intent/…)
      transport.ts    # SessionTransport interface (one seam, many transports)
      broadcast.ts    # same-origin BroadcastChannel transport (same browser)
      relay.ts        # cross-device transport over the relay (WebSocket)
      webrtc.ts       # serverless nearby transport (WebRTC data channels, LAN-only)
      signal.ts       # compact QR/paste handshake codec (deflate + base64url)
      session.ts      # the engine: leader applies intents, rebroadcasts state
    stores/           # Svelte stores (games, players, settings, toast)
    types.ts          # GameModule contract + core types
    router.ts         # tiny history-based router
  pages/              # Home, GameType, GamePlay, LiveJoin, NearbyJoin, History, Stats, Players, Settings
relay/                # deploy-ready Cloudflare Worker + Durable Object live relay
```

**Data model** (mirrored in IndexedDB and the JSON backup):

- `Players(id, name, color, createdAt)`
- `Games(id, type, config, playerIds, status, createdAt, finishedAt, winnerIds)`
- `Rounds(id, gameId, index, inputs, scores, createdAt)`
- `Settings(key, value)` — your **portable preferences** (theme, OLED, text size, contrast,
  motion, colour-blind palette, keep-awake, privacy guard). Kept in `localStorage` on the
  device and included in the backup's `settings` object so they travel with a restore.
  Device-local OneDrive details (client-ID override, folder location, auto-backup toggle,
  connection flag, sync timestamps) are deliberately **not** backed up — see
  [What gets backed up](#what-gets-backed-up).

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

## ☁️ OneDrive sync setup (optional)

Sync is **opt‑in** — the app is fully usable offline without it. When enabled, each user signs in
with **their own** Microsoft account and the app writes a `Main.json` file to **their own**
OneDrive. By default the file lives in a **sandboxed app folder** (`OneDrive → Apps → Score King`)
that the app is the *only* thing able to read — it can't see the rest of your OneDrive. Power users
can switch to a **custom folder** in Settings (which needs broader access — see below). There's a
single shared app registration; the client ID is **public** (for SPAs it isn't a secret — security
comes from PKCE + the redirect‑URI allowlist), so end users never configure anything. They just open
**Settings → Connect OneDrive**. Connecting briefly redirects the whole page to Microsoft to sign in,
then returns you to Settings — there's no popup to allow or unblock.

**Multiple titled backups.** The chosen folder is the source of truth: Score King treats every
`.json` file in it as a backup, so you can keep more than one — say one for the *Friday Night
Crew* and one for *Family*. A backup's title is exactly what you type, saved as **`<Title>.json`**
(e.g. `Friday Night Crew.json`) so it reads naturally in OneDrive. New connections start
on **`Main.json`**. In **Settings → Backups** you can add a new titled backup (a copy of your current
scores), rename or delete one, and pick which backup is **active**. Switching the active backup loads
its contents onto this device; everything below — the status bubble, **Sync now**, **Restore now**,
and auto‑backup — always targets the active one.

**Automatic backup is on by default.** Once you're connected, Score King quietly pushes a fresh
backup a few seconds after you change anything (new game, saved round, finished game, edited player),
coalescing a burst of rapid edits into a single upload. It is **push‑only** (last‑write‑wins to your
own file — it never auto‑restores or auto‑pulls) and **silent**: if your sign‑in has expired it just
shows _"Sync pending — reconnect to OneDrive"_ instead of yanking you to Microsoft mid‑use. It also
pauses while you're offline and resumes on reconnect. Turn it off any time with **Settings →
Automatically back up changes**; **Sync now** and **Restore now** keep working regardless.

A small **status bubble** in the header — just left of the settings cog — shows where your backup
stands at a glance: a quiet dot when everything's synced, _"Syncing…"_ (with a translucent progress
fill washing across the bubble if an upload runs long, then a green _"Synced!"_), or a _"Pending"_ /
_"Offline"_ / _"Conflict"_ nudge when it needs attention. Tap it for a little pop and a jump to the
OneDrive settings.

### One‑time developer setup (register the shared app)

1. [Azure Portal → App registrations](https://portal.azure.com/) → **New registration**.
2. Name it *Score King*; supported accounts = **Accounts in any organizational directory and
   personal Microsoft accounts** (so anyone with a Microsoft/Outlook account can sign in).
3. **Add a platform → Single‑page application (SPA)** — this matters; don't use "Web". Redirect
   URIs: `https://score.jrmoulckers.com` and `http://localhost:5173`.
4. No client secret (public client + PKCE). Scopes are requested at sign‑in via **dynamic consent**,
   so you don't pre‑list them: the default **app‑folder** mode uses **`Files.ReadWrite.AppFolder`**
   (sandboxed to `/Apps/Score King`), while choosing a **custom folder** in Settings uses the
   broader **`Files.ReadWrite`** (Graph can't scope a delegated permission to one arbitrary folder).
5. Copy the **Application (client) ID** into `BUILT_IN_ONEDRIVE_CLIENT_ID` in
   [`src/lib/config.ts`](src/lib/config.ts) (or set `VITE_ONEDRIVE_CLIENT_ID` at build time). It's
   safe to commit.

After that, **Settings → Connect OneDrive** is one click for everyone. Power users / forks can
override with their own client ID under **Settings → Advanced**.

> Each backup is a single JSON file: a small envelope (`schema`, `version`, `exportedAt`) wrapping
> the `players`, `games`, `rounds`, and `settings` it contains. The app treats local data as the
> source of truth during play and syncs the whole snapshot automatically (debounced) — or on demand
> via **Sync now**.

### How backup & restore behave

- **Sync now** writes your current data to the **active** backup. The write is **conditional on an
  ETag**: if the file changed on another device since this one last synced, the app **merges** the two
  copies **per entity** — the newest write wins for each player, game, and round (deletions, which are
  kept as tombstones, included) — saves the combined World to both sides, and shows _“Merged changes
  from your other device.”_ So edits made on different devices both survive; only two edits to the
  **same** record settle last‑writer‑wins (a field‑level merge and a “what changed” summary are
  planned). The first write of a connection (no ETag baseline yet) is unconditional. If the file was
  deleted — or, in custom‑folder mode, the whole folder was deleted — the next backup **recreates the
  file (and folder)** automatically.
- **Restore** always fetches the **latest** remote copy of the active backup. The download bypasses
  the browser cache (`cache: 'no-store'`), so a single Restore reflects the most recent remote edit —
  no disconnect/reconnect needed.
- If you press **Restore** but no backup exists yet, the app offers to **back up your current data**
  there instead, so you're never left in a dead end.
- **Backups are independent save slots.** Adding a backup snapshots your current scores under a new
  title and makes it active; your other backups are untouched. Auto‑backup keeps pushing to whichever
  backup is active, so switching first (which loads that backup onto the device) keeps each slot
  separate.
- **Auto‑backup merges in the background, never clobbers.** If automatic backup meets a file that
  changed elsewhere, the app quietly **merges** per entity and pushes the combined World — no
  interruption, and records from the other device appear on screen as soon as the merge lands. Only if
  the merge can't settle (the remote keeps moving, or a sign‑in is needed) does the status bubble
  switch to a **conflict**/**pending** state you finish from **Settings** with a single **Merge** —
  your local edits stay safe on the device meanwhile.

### What gets backed up

A backup carries your game data **and** your portable preferences — theme, OLED, text size, high
contrast, motion, colour‑blind palette, keep‑awake, and privacy guard — in the `settings` object, so
restoring on a new device brings your accessibility/display setup along. The local JSON
export/import covers the same set.

Deliberately **left out**, to avoid dead or conflicting state on another device: the OneDrive
client‑ID override, the backup file's folder location, the active backup file and its ETag, the
auto‑backup toggle, the "connected" flag, and the last‑sync/last‑restore timestamps. (Restore is also
defensive — it only ever applies the portable keys, and a file that isn't a recognizable Score King
backup is ignored, so neither a hand‑edited nor a foreign file can clobber this device.)

> **Adding a setting?** Categorize it in [`src/lib/stores/settings.ts`](src/lib/stores/settings.ts):
> add portable user preferences to `PORTABLE_SETTING_KEYS` (so they're included in the backup) and
> device/connection state to `LOCAL_SETTING_KEYS`. A compile‑time guard fails `npm run check` until
> every setting is listed in exactly one of the two arrays, so a new preference can't silently miss
> the backup — the default expectation is that new settings **are** backed up.

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
