# PROJECT JEZZA: HUNTER VALLEY LEGENDS

A mobile-first, real-time multiplayer party game for Jezza's bucks weekend in the Hunter Valley.
Mates join a shared vineyard from their phone browser, adopt an original creature, complete ridiculous
missions, battle each other, and compete for weekend glory across Friday and Saturday.

![Opening screen](docs/preview-opening.png)

More screenshots at every tested viewport live in [`docs/screenshots/`](docs/screenshots/)
(320×568, 360×640, 390×844, 412×915, plus `live/` from a real two-browser session).

---

## What's in the box

| Area | Status |
| --- | --- |
| Cinematic Three.js opening (moonlit vineyard, fog, gold particles, cellar) with CSS/SVG fallback | ✅ |
| 30-second onboarding: enter → nickname + code → choose creature → reveal → first mission → lobby | ✅ |
| 8 original SVG creatures, 3 colourways each, idle/happy/victory/defeat/attack/hit animations | ✅ |
| 13 cosmetics (hats, face, capes, auras, poses) unlocked by level and achievements | ✅ |
| 78 original missions across 10 categories, 4 completion methods (honour, photo, witness, host) | ✅ |
| Real multiplayer: party codes, join links, live roster, feed, presence, reconnection | ✅ |
| Server-authoritative scoring, duplicate-claim protection, private mission hands | ✅ |
| Turn-based creature battles resolved on the server, timeouts, surrender, rematch, practice mode | ✅ |
| Host controls: phases, pause missions, approvals, group missions, rename/remove, reset, grant, awards, finalise | ✅ |
| Friday → Saturday → Finale → Ended event structure with host recovery | ✅ |
| 19 achievements, 10 data-driven weekend awards (+1 host pick), compact leaderboard, finale recap | ✅ |
| Original synthesised audio with mute, haptics, reduced-motion support | ✅ |
| Persistence across server restarts (JSON snapshot + photo files) | ✅ |

Deliberately **not** built (per the brief): Wine Snob Championship, Mr & Mrs Hot Seat, Jezza Bingo.

---

## Try it right now (no install)

**https://travex-pixel.github.io/Jezza-Secret-Mission/** runs the browser-only **demo**: the full game engine
runs on your phone with 14 simulated mates. Tap *I'm the host* to get the host controls, or join with any code
to drop into Jezza's room on Friday night. It is published automatically by `.github/workflows/pages.yml`.

> First-time setup (once, in GitHub): **Settings → Pages → Build and deployment → Source: GitHub Actions**.
> Until that is switched on, the Pages URL shows a 404.

The demo is for playing around. **Real multiplayer** (your actual mates on their actual phones, shared scores,
photo approvals, live battles) needs the Node server: see *Quick start* below or *Deployment*.

## Quick start (local)

Requires Node 22+.

```bash
npm install
npm run dev          # game server on :8787 + Vite client on :5173 (proxied)
```

Open http://localhost:5173 on your phone (same Wi-Fi: use the "Network" URL Vite prints).

* Add `?demo=1` to the URL to run the **demo mode**: the whole engine runs in the browser with 14
  simulated mates. Great for previews; nothing it awards is real.
* Add `?no3d=1` to force the CSS fallback for the opening scene.

Production build and run (single process serves API, WebSocket and the built client):

```bash
npm run build
npm start            # http://localhost:8787
```

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | HTTP + WebSocket port |
| `DATA_DIR` | `./data` | Where `state.json` and `photos/` are written. Put this on a persistent disk. |

No API keys, no third-party accounts, no secrets are needed. `.env.example` documents the two variables.

---

## How a weekend runs

1. **Host** opens the game, taps *I'm the host*, picks a nickname → gets a 4-letter party code and a share link
   (`https://your-host/?p=CODE`). Share it in the group chat.
2. **Mates** open the link, type a nickname, adopt a creature, do Mission 001, land in the lobby.
3. Host taps **Start Friday** (lobby or Host → Event). Everyone's hand fills with 3 missions; battles open.
4. Players complete missions (honour system / photo → host approves / witness → mate confirms on their phone /
   host-approved specials), earn weekend points + creature XP, unlock cosmetics, challenge each other.
5. Saturday: host moves the phase. Rerolls reset, new pool (harder missions, new secrets), Friday points are
   snapshotted for the *Unexpected MVP* award.
6. Host reveals **group missions** when the moment is right (The Cellar Ceremony, Sunset Salute…).
7. **Finale**: host moves to Finale. Awards are computed from real play; the host can override any award and
   must hand-pick *Most Unhinged Strategy*. Tap through the reveal on the big screen. **Finalise** locks it.

Host safety: any phase can be re-entered (accidental advance is recoverable), claims can be reset, points
granted/removed (±100 with a reason, visible in the feed), players renamed or removed, host transferable.

---

## Architecture

```
client/   React 19 + TypeScript + Vite. Hand-written CSS design system, SVG creatures, vanilla three.js
          for the opening scene (lazy-loaded chunk, WebGL → CSS fallback, perf watchdog, reduced-motion).
shared/   The game. Pure TypeScript shared by server and client:
            types.ts        protocol + domain types
            engine.ts       authoritative rules engine (parties, missions, claims, battles, host actions)
            battle.ts       deterministic combat resolution (seedable RNG)
            missions.ts     78 missions · creatures.ts 8 creatures · progression.ts XP/levels/cosmetics/achievements/awards
            names.ts        nickname moderation
server/   Node 22 + express + ws. Wraps the engine: WebSocket fan-out, per-viewer redaction, rate limiting,
          heartbeat presence, JSON persistence (debounced, atomic rename), photo storage.
tests/    vitest unit tests (engine rules, balance), 15-client WebSocket simulation, two-browser live e2e,
          restart persistence, viewport/layout QA with screenshots.
```

**Why a self-hosted Node server instead of Firebase/Supabase?**
The brief requires server-side validation of claims, points, battle turns and host privileges. On Firebase that
means Cloud Functions (Blaze/paid plan) plus security rules; on Supabase it means Edge Functions plus RLS
policies, and neither could be verified here without credentials. A single Node process gives one
provider, zero accounts, trivially trustworthy rules (the engine *is* the server), full offline testability,
and costs nothing to run locally. For 15 people over one weekend a single instance is the right size.
Trade-off: it is one process with a JSON snapshot on disk, not a replicated database. That is adequate for
this event; if you ever need multi-instance scale, the engine is already pure and could sit behind a store.

### Security model (what the server enforces)

* Anonymous identity: `playerId` + random `secret` generated on the device, stored in `localStorage`.
  A known id with a wrong secret is rejected. Refreshing keeps your progress.
* Party membership, host-only actions, mission eligibility (in-hand, phase, open/closed), completion method
  requirements (photo present/size, witness is another present player, host approval), idempotent claim ids,
  no double completion, no claiming another player's missions.
* Private mission hands are never in the public party payload; secret missions appear in the feed only as
  "a SECRET mission".
* Battles: only participants act, only for the current round, special obeys cooldown, the opponent's pending
  action is redacted (`locked` flag only), rounds resolve on the server with server RNG, rewards are fixed and
  bounded (max 3 scored bouts per opponent per phase, then "friendly").
* Timeouts: 25 s per round (auto-defend), 3 missed rounds = forfeit, challenges expire after 2 minutes,
  disconnect mid-battle = forfeit. Practice battles run locally and award nothing.
* Client never sends scores. Rewards shown to a player come from server `reward` messages after the write.
* Rate limit of 60 messages / 10 s per socket; 1 MB payload cap; photos ≤ ~330 KB (compressed client-side).

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Server (tsx watch) + Vite dev server |
| `npm run build` | Production client (Vite) + server bundle (esbuild) into `dist/` |
| `npm start` | Run the production server |
| `npm test` | Unit tests: engine rules, battle balance, content, names (vitest) |
| `npm run test:multiplayer` | 15 real WebSocket clients against a running server (`WS_URL`, default `ws://localhost:8787/ws`) |
| `npm run test:viewports` | Playwright walkthrough at 4 phone viewports → `test-results/screenshots/` (curated copies live in `docs/screenshots/`), fails on overflow/scroll/console errors |
| `npx tsx tests/e2e.live.ts` | Two separate browser sessions playing together against a built server (`BASE_URL`) |
| `npx tsx tests/e2e.static.ts` | Serves the GitHub Pages demo build under its base path and plays it headless (no server) |
| `npx tsx tests/e2e.host.ts` | Host UI against a built server: phases, group reveal, photo approval → feed, witness confirmation, finale awards |
| `npx tsx tests/persistence.sim.ts` | Boots a server, creates a party, restarts it, verifies the party is restored |
| `npx tsx scripts/balance.ts` | Prints simulated win rates for every creature |

Playwright tests use the Chromium that ships with `playwright-core`'s matching browser revision
(set `CHROME_PATH` if yours lives elsewhere).

---

## Deployment

The app is **one Node process** that serves static files, `/api/*`, `/photos/*` and `/ws`. Any host that runs
Node 22 with a persistent disk works. The build was verified locally; **it has not been deployed publicly from
this environment** (no hosting credentials were available), so pick one of these:

### Fly.io (recommended, Sydney region, ~free for one small machine + 1 GB volume)
```bash
fly launch --copy-config --no-deploy      # uses fly.toml + Dockerfile
fly volumes create jezza_data -s 1 -r syd
fly deploy
```
### Render
Connect the repo; `render.yaml` defines the service. The persistent disk needs the Starter plan (~US$7/mo).
The free plan works for a trial but **loses state on restart/sleep** (no disk), so don't use it for the real weekend.
### Railway / any Docker host
`docker build -t jezza . && docker run -p 8787:8787 -v jezza-data:/data jezza`
### Behind a reverse proxy
Make sure WebSocket upgrades are forwarded for `/ws` (nginx: `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`).
Use HTTPS: the camera input and `navigator.share` need a secure origin on phones.

Costs: no paid APIs, no third-party services. Only the host's compute/disk. Free tiers that sleep are
fine for testing but will drop live connections (the client reconnects automatically) and, without a disk, lose state.

---

## Content and design notes

* Palette: Deep Merlot `#571827`, Vineyard Burgundy `#76243A`, Champagne Gold `#E5AD48`, Cellar Cream
  `#F6EBDD`, Barrel Charcoal `#242127`, Warm Rose `#B98286`, Ember Orange `#F07842`.
  Type: Cinzel (display) + Nunito (body) via Google Fonts, with system fallbacks.
* Creatures, missions, sounds and the 3D scene are all original and procedural: no third-party art,
  audio or model assets.
* Drinking theme: toasts, sips and cheers appear throughout the copy, but no mission requires alcohol,
  nothing penalises declining, and no mission rewards volume or speed. Water and mocktails count for every toast.
* Audio is WebAudio-synthesised, never autoplays, and has a visible mute control on the opening screen that persists.

---

## Known limitations / honest notes

* **Not deployed publicly** from this environment; deployment configs are provided and the production build
  runs locally (`npm run build && npm start`).
* **Preview image**: no image-generation tool was available, so `docs/preview-opening.png` is a real
  screenshot of the running opening screen, not a generated concept image.
* Persistence is a JSON snapshot (debounced ~400 ms, atomic write). A crash inside that window can lose the
  last action or two. Acceptable for the event; not a general-purpose database.
* Single server instance. Horizontal scaling would need the engine behind a shared store (the engine is
  pure, so this is a server-only change).
* Photos are stored unencrypted on the server disk and visible to everyone in the party via the feed.
  Tell your mates. Delete `DATA_DIR/photos` after the weekend.
* Creature "evolutions" are cosmetic (crown, auras, capes at levels 8–10) rather than new silhouettes.
* iOS Safari needs a user gesture before audio plays; the first tap on *Enter the Vineyard* unlocks it.
* The three.js opening is lazily loaded (~123 KB gzipped). On weak GPUs a watchdog swaps to the CSS
  fallback automatically after the first ~90 frames.
