# Score King — live-play relay

A **dumb, stateless WebSocket bus** for Score King's live co-play (ARCHITECTURE.md, Phase 3b).
It resolves a join code to a session and forwards messages between the devices in it. It
**stores no game data** — the game stays host-authoritative on the party leader's device; this
relay only shuttles frames so guests on _other_ devices can see the board and propose rounds.

- One Cloudflare **Durable Object** instance per join code (`idFromName(code)`) = one room.
- Each frame is forwarded to the **other** sockets in the room only — never echoed to the
  sender (matching the same-browser `BroadcastChannel` semantics the app's engine relies on).
- Uses **Hibernatable WebSockets**, so idle rooms are evicted from memory and cost nothing.
- No durable storage, no logs of message contents, no accounts.

## Deploy (about two minutes)

Prereqs: a free [Cloudflare account](https://dash.cloudflare.com/sign-up) and Node 18+.

```bash
cd relay
npm install
npx wrangler login      # opens a browser to authorize Wrangler
npx wrangler deploy
```

Wrangler prints your relay's URL, e.g. `https://score-king-relay.<your-subdomain>.workers.dev`.
The WebSocket endpoint is that origin with a `wss://` scheme.

## Point the app at it

Give the app the relay origin using **`wss://`** (not `https://`). Either:

- **Per device (no rebuild):** app → **Settings → Advanced → Live relay URL**, paste
  `wss://score-king-relay.<your-subdomain>.workers.dev`, Save. Every device that should play
  together needs the same URL.
- **Baked into a build (everyone gets it):** set `VITE_RELAY_URL` at build time, or fill in
  `BUILT_IN_RELAY_URL` in `src/lib/config.ts`:

  ```bash
  VITE_RELAY_URL="wss://score-king-relay.<your-subdomain>.workers.dev" npm run build
  ```

With no relay configured, live play still works **within a single browser** (multiple tabs)
over `BroadcastChannel`; the relay is what adds real cross-device play.

## Local development

```bash
npx wrangler dev        # serves the relay at ws://localhost:8787
```

Then set the app's relay URL to `ws://localhost:8787` (Settings → Advanced) and open two
browsers/devices on the same LAN.

## Test the client transport against a stand-in

`relay-transport-test.mjs` (in the app's session artifacts, not committed) spins up a tiny
Node `ws` server with the same no-echo forwarding contract and drives the app's
`RelayTransport` against it — proving the client half without needing a deployed Worker.

## What it deliberately is not

- Not a database. It never persists a game; it forwards live frames only.
- Not authoritative. The leader's device is the single source of truth (see ARCHITECTURE.md).
- Not required to play. Offline/local and same-browser live play work with no relay at all.
