# PROJECT JEZZA: HUNTER VALLEY LEGENDS

A mobile-first, real-time multiplayer party game for Jezza's bucks weekend in the Hunter Valley.
Mates join a shared vineyard from their phone browser, adopt an original creature, complete ridiculous
missions, battle each other, and compete for weekend glory across Friday and Saturday.

![Project Jezza](docs/social-card.jpg)

<img src="docs/preview-opening.png" alt="Opening screen on a phone" width="260" />

More screenshots at every tested viewport live in [`docs/screenshots/`](docs/screenshots/)
(320×568, 360×640, 390×844, 412×915, plus `live/` from a real two-browser session).

---

## What's in the box

| Area | Status |
| --- | --- |
| Cinematic Three.js opening (moonlit vineyard, fog, gold particles, cellar) with CSS/SVG fallback | ✅ |
| 30-second onboarding. From the invite link it's one screen (whose party it is, how many lads are already in, your name, **I'm in**), then creature → reveal → the intro: **Show Your Face** (a solo selfie from wherever you are, in-game camera, so lads who aren't there yet can still play; the group selfie, *Get the Boys Online*, is a normal easy challenge later) → **Roast Jezza** → **Toast Jezza** (one line each, posted to the Jezza Wall) → straight into a real challenge. One job and one big button per screen; after each step you see what you earned and a button that names the next step (no pop-ups during the intro). Every step scores once, can be skipped without penalty, and can be replayed from ❓ (done steps are skipped). The groom just gets the selfie | ✅ |
| Rookie boost: the next 3 challenges are easy, give double XP, count straight away (photos skip the vote) and skip the honour cooldown. Every hand always has a photo challenge, and never the same category twice in a row | ✅ |
| **Jezza Lore**: 16 challenges for childhood, UNSW and newer mates to compare notes (old nicknames, hidden lore, first impressions, then-and-now photos, two truths and a lie). Jezza can veto any topic | ✅ |
| **Runs itself, no host needed**: Friday starts on creation, Saturday at 5am Sydney, group challenges every 40 min | ✅ |
| 101 quick challenges in Aussie English (make Jezza laugh, cooked photos, get Jezza in, cheers, sneaky, low-key, group, Jezza Lore), including the lads' own list (Jezza's glasses, clothes pegs, arm wrestles, "I love you, mate"…). No singing or dancing challenges | ✅ |
| Self-service checks: honour system (8-min cooldown), photo (the lads vote 👍/👎 by default; host can switch to *I approve* or *Instant*), a mate confirms. 🚩 Call BS, settled by the lads or the host | ✅ |
| Low-key mode: no performing challenges for anyone who'd rather not | ✅ |
| Boss raids on Friday (Bin Chicken King) and Saturday (Hangover Hydra): 15 min, loot for everyone who swings | ✅ |
| Evolutions at Lv4 and Lv8, max one on Friday, teased ahead ("twitching…", mystery silhouette), full reveal animation | ✅ |
| Saturday arrivals: Fresh Legs (2× points on first 6 challenges, 2× XP until caught up). Also given automatically when Saturday starts to anyone with fewer than 3 real challenges done, and the host can switch it on or off per lad | ✅ |
| Quick battles with mates: pick a game plan + one charge-up tap, then watch the fight play itself (~10 s). Ranked ladder, win streaks, bounty on the leader | ✅ |
| **Animated battles**: creatures enter, dash across the arena, hit-stop, knockback, per-creature specials, KO and victory, all replayed from the engine's real round log; Fast / Skip / replay; reduced motion respected | ✅ |
| **Auto-battles**: every avatar fights a mate's avatar about every 45 min, phones away or not; "While you were away" summary with replays | ✅ |
| Rivalries (head-to-head, nemesis / bunny), battle highlights, Battles tab on the leaderboard | ✅ |
| The Jezza Wall (roasts and toasts, votes, Jezza's ❤️, Roast Reel at the finale) | ✅ |
| The Cellar: drink reviews with label photos (any drink counts; only 3 a day score) | ✅ |
| 😂 🔥 reactions (❤️ for Jezza only) that drive the awards | ✅ |
| **Live feed**: every line shows the lad's face (a small square cut from their first selfie, else their creature) with the moment's emoji, names in bold, a colour edge by type (challenges, battles, level-ups, the cellar, EPIC jobs), a glow for big moments (evolutions, raids, phase changes), photo thumbnails, and new lines slide in. Lobby shows the latest few under a pulsing LIVE; *See all* opens the full feed | ✅ |
| The groom's own creature: the **Golden Stag** (groom only, given automatically) | ✅ |
| Party camera roll; delete your own photos any time, ask the host to take down anyone else's | ✅ |
| Host keepsake download (every roast, toast, review, award and the final board) and a scan-to-join QR code | ✅ |
| **🟣 EPIC jobs**: the host posts real jobs (dinner, brekkie, food runs, designated driver, Chief Hydration Officers, clean-up…); first in fill the crew; everyone on it gets points, XP and a themed item. Bigger jobs pay more | ✅ |
| **🎁 Reward codes**: the host makes a code for any accessory (plus three code-only items) and gives it to whoever deserves it | ✅ |
| **🎁 Up for grabs**: the host releases a few of any accessory for everyone; first in, first served, one each, stock enforced by the server | ✅ |
| **Starter kit**: every creature starts with eight hats (gold cone, five coloured party hats, Santa hat, bunny ears) | ✅ |
| 14 data-driven awards (The Jezza Legend, The Weekend Menace, Best Hype Man, Biggest Choke…) + live "Award race" tab; animated finale ceremony with podium and weekend recap | ✅ |
| **🎁 Lucky Drops**: a crate every third challenge, for each quest, a wake-up chest on Saturday morning, and host gifts. Four rarities (50/30/15/5), 16 drop-only cosmetics, duplicates turn into points, full-screen opening animation | ✅ |
| **📜 Saturday Quests**: three personal goals per lad, tracked from live stats, points + a drop each | ✅ |
| **🕵️ The Mole**: one or two lads (host can add a third) get secret sabotage missions; everyone names suspects; host reveals; points for escaping, catching and right names. Only the host can see who they are | ✅ |
| Battle taunts, boss **weak spot** (25 s of double damage at half health), **Comeback** boost (1.5× challenge points while well behind the leader) | ✅ |
| Host PIN, leave/new room, join-by-link, link previews, persistence, keepsake photo export | ✅ |

Deliberately **not** built: Wine Snob Championship, Mr & Mrs Hot Seat, Jezza Bingo, video uploads
(a mate confirming covers it, and video would be heavy on phones and the server). Singing and dancing challenges are
retired (ids kept so old progress resolves); the only song left is getting Jezza himself to sing.

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
| `VITE_PUBLIC_URL` | *(empty)* | Build-time only. Absolute URL of the deployed site, used for the link-preview image when the URL is shared (e.g. `https://jezza.fly.dev`). |

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
            missions.ts     101 active missions (+42 retired, kept so old progress resolves) · creatures.ts 8 creatures + the groom's Golden Stag · progression.ts XP/levels/cosmetics/achievements/awards
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

### How the weekend runs (no host required)

* **Friday** starts the moment the party is created. Everyone gets 3 challenges; finish one and a new one lands.
  Skips: hold up to 3, one comes back every 20 minutes, and a skip gives you the same difficulty (no farming easy ones).
  Skipping the intro is free, and **Jezza's skips are unlimited** (his veto). Nobody loses points for skipping.
  Challenges nobody touches for 2 hours rotate out.
* **Group challenges** go live on their own every 40 minutes. They're optional; everyone who's in claims their own.
* **Boss raid**: once the party has done 18 challenges on Friday (25 on Saturday) a boss turns up for 15 minutes.
  Tap to hit (20 s cooldown, power tap for crits). Finishing challenges mid-raid hits it too. Everyone who lands a hit
  gets the raid cosmetic and XP; top three damage get bonus points. It still pays out if it escapes.
* **Saturday** kicks in by itself at 5am Sydney time: final evolutions unlock, new challenges appear, a new raid.
* **Auto-battles** start ~10 minutes in. The matchmaker pairs whoever has waited longest, avoids recent rematches,
  usually (65%) picks someone of similar rating so upsets stay possible, and resolves the fight with the same engine
  and the same moves a person has. Players can switch it off on the Battle tab.
* **Finale** is the one thing the host does: Host → Event → Finale, then reveal the awards one tap at a time.
  The Weekend Menace (last on points) opens, The Jezza Legend (first) closes. Suggested prize: a cheap trophy or
  sash, optionally a $50–$100 pool. The Menace's forfeit (a 20-second speech) is optional and easy to decline.

### EPIC jobs (purple)

Real jobs that keep the weekend running, posted by the host from Host → Event (one tap from the list, or make your
own). Everyone gets a ping; the job shows on the Lobby and at the top of Missions. The first lads to tap
**I'm on it** fill the spots (mac and cheese takes 2, the KFC/pizza run 2–3, the designated driver 1). When it's
done, anyone on the crew taps **Done** and every one of them gets the points, XP and the job's item. Leaving before
it's done gives your spot back; nobody is rewarded twice.

| Size | Points / XP | Examples |
| --- | --- | --- |
| Small | 15 / 35 | Salad, garlic bread, chimichurri, bacon, sausages, eggs, toast |
| Medium | 25 / 60 | Mac and cheese, potatoes, KFC and pizza run, ice run, Chief Hydration Officer (drinks / water), party setup, dishes |
| Big | 40 / 90 | BBQ, clean-up |
| Legend | 60 / 120 | Designated driver (Saturday) |

Items: Chef's Toque (cooking), Delivery Cap (runs), BBQ Apron, Hi-Vis Vest (designated driver), Esky Hat (drinks
officer), DJ Headphones (setup), Squeaky Clean and Epic Helper auras. Most EPIC jobs → the **Captain Helpful** award.

### Reward codes

Host → Event → Reward codes: pick any accessory (⭐ marks the code-only ones: The Mo, Viking Helmet, Rainbow Aura),
choose who can use it (1 lad, 3, or everyone) and tap *Make a code*. Tell someone the code (e.g. `JEZZA-K7Q2`);
they type it on their Me screen to unlock the item. Only the host can see codes. Six wrong guesses lock a player
out for ten minutes.

### Up for grabs (giveaways)

Host → Event → Up for grabs: pick an accessory, how many (1, 3, 5 or one for everyone), optionally a time limit and a
title, tap *Release…* and confirm. A card appears on every lad's Lobby and Me screen with one button: **Claim**. The
server hands out the item and records the claim in the same step, so two lads tapping at once can't both get the last
one, a second tap never grants twice, and someone who already owns the item is told to leave it for a mate. When the
last one goes the card says *All gone*; the host sees who got what and can *Close* a giveaway early (whoever already
claimed keeps theirs). This sits beside reward codes: a code is for one lad you pick; a giveaway is for whoever's quick.

### Starter kit

Every creature owns eight hats from the moment it's adopted: the gold Party Cone, Blue / Purple / White / Yellow /
Green Party Hats, a Santa Hat and Bunny Ears. Players from before the kit existed get it the next time the server
loads their party (a set-union, so it can run any number of times without duplicates and never touches what they
already own). Everything else is still earned: levels, badges, EPIC jobs, raids, codes and giveaways.

### Being the host (optional, but you can run a lot of it)

Host → Event: pause/resume, summon a raid, reveal group challenges, and **Photo checks**:
*The lads vote* (default: two 👍 count it, two 👎 bin it and delete the photo, unsettled after 20 min counts),
*I approve them* (photos wait in your Queue; anything left 45 min goes through), or *Instant*. The Queue also shows
photos being voted on, so you can settle them early, plus any BS disputes. Players tab: rename, reset, grant points,
remove. Awards tab: override any award, pick *Most Unhinged*.

### The groom's Golden Stag

Jezza gets a creature nobody else can have: the **Golden Stag** (gold antlers, a tux, light rays and twinkles; at
Lv8 it gets wings and a halo like everyone else's final form). Whoever is the groom gets it automatically: a player
called "Jezza" is offered only the Stag when they pick, and if the host taps **🤵 This is Jezza** on someone who has
already adopted, their creature transforms (name, level and XP kept). Move the title to someone else and the old
groom gets their original creature back. Its special, **Last Hurrah**, is a golden charge that goes straight through
a counter stance. It's tuned to win about 55% of fights: a groom's edge, but the lads can absolutely beat him.

### Progression

* Creature levels 1–10, quick at the start (the first-challenge selfie alone is Level 2; first evolution after about
  five challenges) and slower later. Evolves at **Lv4** and **Lv8**. On Friday XP stops just short of Lv8, so max one evolution;
  the final form unlocks Saturday. Points still count while capped.
* Saturday arrivals get **Fresh Legs**: double points on their first 6 challenges and double XP until they reach the
  group's median level. When Saturday starts, anyone already in the party with fewer than **3** real challenges done
  (the selfie/roast/toast intro doesn't count) gets it too, so lads who joined from home on Friday aren't left behind.
  The host can switch it on or off for anyone: Host → tap the lad → 🦵 Fresh Legs (🦵 shows in the roster).
* Cosmetics are earned, never bought (the starter kit of hats aside): by level, by achievements (jester hat, karaoke mic for getting Jezza to sing, disco aura for Jezza Lore,
  groomsman sash…), and by raids (Bin Chicken Plume, Hydra Slayer Cape).

### Saturday systems (Lucky Drops, Quests, The Mole)

All three are generic: nothing in `shared/saturday.ts` knows whose party it is.

* **Lucky Drops.** A crate lands every third real challenge (the intro selfie/roast/toast don't count), for every quest
  finished, as a welcome gift with Fresh Legs, as the **Morning Drop** the first time a lad opens the game on Saturday
  (rare, always holds an item; if they own every rare it steps up a tier), and whenever the host sends one
  (Host → Hype → *Drop one on every lad*, or Players → tap a lad → *Gift a Lucky Drop*, with a rarity picker). Odds
  are Common 50 / Rare 30 / Epic 15 / Legendary 5. Epics and legendaries always carry an item while one is left for
  that lad; duplicates become points. Contents are decided server-side when the drop is earned, so opening is only a
  reveal and can't be re-rolled. The 16 drop-only items (Bucket Hat, Koala Ears, Emu Plume, Cockatoo Crest, The Mullet,
  Croc Jaws, Bintang Singlet, Batik Sarong, Gold Chain, Barong Mask, Zinc Stripes, Aviators, Bali Belly, Volcano Aura,
  Garuda Wings, Southern Cross) never come from levels, codes or giveaways.
* **Quests.** At the Saturday switch (or on join / server load if it's already Saturday) each lad gets three of ten
  quests, with a baseline so only today's progress counts. They complete themselves off the stats the game already
  tracks and pay points plus a drop of the quest's rarity.
* **The Mole.** Picked at the Saturday switch: one Mole, or two when eight or more lads are eligible (host and groom
  never are). Each gets three secret missions (no two Moles share one) ticked off privately with no feed line. Everyone
  else names one suspect per Mole from the Lobby (tap again to take a name back). Host → Hype shows the Moles and their
  progress to the host alone, offers *Pick 1 / Pick 2* before the switch, *Make them a Mole too* on any lad (max three)
  and *Reveal*. At the reveal a Mole is **caught** if more than half the voters named them (+30) or **gets away**
  (+100); every right name pays +30. Everyone also sees a one-time **Saturday briefing** sheet the first morning.

### The TV and the finale

`…/?tv=CODE` is the read-only telly page. Besides the photo slideshow, every fourth slide is a roast or toast off the
Wall, live fights show in the corner with health bars and the result, and two host-driven moments take it over:

* **Spotlight** (Host → Event → 🎤 Spotlight on the TV): a scheduled countdown, by default *The Loser's Speech* at
  10 pm on the host's phone clock for 2 minutes, with a lad attached (the list is sorted so last place is first).
  Every Lobby shows the strip; the TV shows a banner until the host taps *Start the clock*, then a giant mm:ss with
  the lad's creature, red for the last ten seconds, then TIME. Change the time, length, label or lad whenever.
* **Ceremony**: in the finale phase the TV follows the host's award reveals (`setCeremony`), one award at a time,
  then the podium, confetti and the Jezza Legend. Lads' phones follow too and can tap ahead on their own screen.

Host → Event ends with **Build …**, the short commit and deploy time the deploy script stamps into `build.json`
(also at `/api/health`), so you can tell at a glance whether a deploy has landed.

### Keeping it honest (anti-spam)

* **Honour-system cooldown.** "I did it" missions are limited to one per player every 8 minutes (server-side; the
  card shows the countdown). Photo, witness, host-approved, the first challenge and rookies' first 3 are exempt. Honest play is
  rarely faster than that; a liar is capped at about six honour missions an hour.
* **Call BS.** Every completion is public in the feed with a 🚩 button. Two different mates flagging it freezes the
  points. Then the lads settle it: two other mates tapping 🤝 *Legit* restores it, otherwise it's struck out after
  30 minutes. The host can rule early from the queue but never has to. Flags are one per player per claim, within
  45 minutes, never on your own claim.
* **Photos go to a vote** (or the host, or instant: the host's choice). Nothing ever gets stuck: unsettled checks resolve in the snapper's favour. Witnesses confirm from their own phone.
* **Nothing rewards drinking.** Any drink counts for every cheers challenge, only the first 3 Cellar reviews a day
  score, and the content test fails the build if a challenge mentions shots, chugging or finishing a drink.
* **Bounded battles.** Fixed rewards, three scored bouts per opponent per day, then "friendly".
* **Host tools.** Reset any approved claim, grant or remove points with a visible reason, remove a player.

### Battles

**Quick battles (with a mate).** Challenge → they accept → each of you makes **one** choice: a game plan and a
single charge-up power tap. Then the whole fight plays itself and both phones show the same ~8–10 s animated fight
(skippable). About three taps, then phones down. Nobody can stall it: if someone doesn't pick within 20 s they get
*Balanced* with no charge, and it plays out anyway.

* **Game plans** change *how* your creature fights, not whether it wins: *Balanced* (a bit of everything, the odd
  counter), *All-out* (never blocks, keeps swinging), *Sneaky* (specials whenever they're ready). They're tuned to
  within a few percent of each other (`npx tsx scripts/plans-balance.ts`), so the creature, the charge and luck decide it.
* **Charge-up tap**: a marker sweeps back and forth across a bar (about 0.8 s each way) until you tap. The closer
  to dead centre, the harder you hit: the bonus rises smoothly from +0% at the edges to +22% in the middle, and
  applies to every hit that fight (boss raid hits use the same bar). No tap in 5 s counts as a whiff, so nobody can
  stall. The server clamps the value and ignores a tap that arrives before the marker could reach the middle.
* Every round is still resolved by the same engine (Attack / Counter / Special, the creature specials, reflect
  damage); the plan only decides which move the creature picks each round. Both creatures hit at the same time, so
  if both would drop in the same round, whoever had more health (as a %) going into that round **hangs on with
  1 HP** and wins (speed breaks an exact tie). A fight never ends with both on 0. Rewards, bounty, streaks, ratings and
  the 3-scored-bouts-per-opponent rule are unchanged. The result pop-up and achievements wait until the fight has
  played out on screen, so nothing spoils it.
* **Practice** against a sparring bot works the same way, on your phone only, with no rewards.

**Auto-battles and scoring.** Auto-battles call the same `resolveRound` and the same `grant()` as everything else,
but pay **XP (win 15 / loss 8), battle rating, streaks and win/loss records only, never weekend points or bounties**,
and don't use up the 3-scored-bouts-per-opponent quota. Weekend points still come only from challenges, raids, the
Wall/Cellar and fights you play yourself, so the points scoring is unchanged. (Battle achievements such as *Taste of
Victory* can still trigger from an auto win and pay their usual small bonus.) The Friday XP cap still applies.

**Animations.** `client/src/battle/timeline.ts` turns `battle.log` into steps (stance, strike, heal, reflect, recoil,
settle). Each round ends on HP recomputed with the engine's own formula, so a replay always lands on the real result;
a unit test checks this for 300 random fights. `BattleStage.tsx` plays the steps with the Web Animations API.
Skipping jumps straight to the engine's final state.

### Photos and privacy

* Rewards you cause yourself (tapped I did it, snapped a photo, finished a fight) take over the screen. Rewards that land
  later (a mate confirmed, the lads voted a photo in, the host upheld a dispute, a raid ended) arrive as a toast, never a
  pop-up over whatever you're doing. During the intro, rewards show on the step itself.
* Photos are taken with a camera **inside the game** (the page never switches to the phone's camera app, which Android
  can close for memory: "Unable to complete previous operation due to low memory"). Three states you can tell apart at a
  glance: live (shutter, with a hint of what to get in the shot) → taken (flash, framed still, "Photo taken", Retake /
  **Use this photo**) → sending. One photo per shutter tap, however fast you hit it. If the camera is blocked, one tap
  opens the phone's own camera instead, and 🖼️ always picks from the library.
* Mission photos are resized on the phone (1600 px on the long edge, JPEG ~82%, usually 250–500 KB) and uploaded over the WebSocket to **your own game
  server**. They are written to `DATA_DIR/photos/` and served from `/photos/<random-id>.jpeg`. No third-party
  service ever sees them.
* URLs are long random ids (not guessable), but anyone holding a URL can open it; there is no per-photo login.
  Treat them as visible to the party.
* **Taking photos down.** The person who took a photo, or the host, deletes it instantly (the file is gone for good).
  Anyone else taps *Ask the host*: the photo stays up and a request lands in Host → Queue, where the host picks
  *Take it down* or *Keep it up*.
* **The end-of-weekend export (do this first).** Host → Event → 📦 Keepsake → **Download everything** saves one
  `.zip` (best on a laptop): `Open me - keepsake.html` (every roast and toast with votes and Jezza's ❤️, the awards,
  the final board, the cellar and every photo; works offline), a `photos/` folder with every photo named
  `001 Nickname - Challenge.jpeg` in the order taken, spreadsheets (`roasts-and-toasts.csv`, `leaderboard.csv`,
  `awards.csv`, `cellar.csv`, `photos.csv`) and `keepsake.json`. The download link is made on the host's phone and
  lasts 15 minutes. *Just the page* saves the single page whose photos load from the server while it's running.
* The host has a **Delete all photos** button (Host → Event → Photos) that removes the files from disk and strips
  them from the feed. Do this at the end of the weekend. Points already awarded are kept.
* In the GitHub Pages demo nothing leaves the phone: photos live in that browser tab's memory only.
* **Viewing them**: in the app, Lobby → 📸 Photos. On Google Cloud, the bucket browser at
  `https://console.cloud.google.com/storage/browser/<project-id>-jezza-data/photos` (only the project owner can open it).
* **Backup route (if the app is down).** On Cloud Run the photos live in the storage bucket `<project-id>-jezza-data`,
  folder `photos/`. In Cloud Shell:
  ```bash
  cd ~/Jezza-Secret-Mission && git pull && npm install
  mkdir -p ~/jezza-data && gcloud storage cp -r "gs://jezza-e9de9-jezza-data/*" ~/jezza-data/
  npx tsx scripts/export-photos.ts ~/jezza-data ~/jezza-photos
  cd ~ && zip -qr jezza-photos.zip jezza-photos
  ```
  then Cloud Shell's ⋮ menu → **Download** → `jezza-photos.zip`. Each photo is named
  `001 Nickname - Mission.jpeg`, with a `captions.txt` listing times and notes. Do this *before* pressing Delete all.

### The save file (and what protects it)

`state.json` in the data folder (the Cloud Storage bucket on Cloud Run) is the whole weekend. The server writes it
through a temp file and rename after every change, and keeps `state.prev.json` (refreshed at most once a minute) plus
`backups/state-<time>.json` every five minutes for the last three hours. On boot it reads `state.json`, falling back to
the previous copy and then the newest backup if the file won't parse. With `REQUIRE_STATE=1` (the deploy script sets it
once a save exists in the bucket) a copy that finds no readable save waits up to 40 seconds for the volume and then
exits rather than serve a blank game. And a copy that never loaded the save will exit instead of writing over a real
one it finds on disk later. To restore by hand: copy a backup over `state.json` in the bucket and restart the service.

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
| `npx tsx tests/e2e.static.ts` | (build first with `VITE_BASE=/Jezza-Secret-Mission/ VITE_STATIC_DEMO=1 npm run build:client`) Serves the GitHub Pages demo build under its base path and plays it headless (no server) |
| `npx tsx tests/stress.sim.ts` | (build first) Boots its own server and throws 20 phones at it: simultaneous joins and full-size selfie uploads, challenges, votes, witness confirms, non-stop battles, a raid, a giveaway race, Friday→Saturday mid-game, phones dropping out mid-battle. Checks latency, memory against Cloud Run's 512 MB, every phone agreeing on scores, every fight counted once, and a restart keeping it all. `STRESS_PLAYERS` / `STRESS_SECONDS` to push harder |
| `npx tsx tests/soak.sim.ts` | The whole weekend in fast-forward on the real engine (Fri 5pm → Sun lunch, ~9 s): auto-battles while lads are away, the 5am Saturday switch, raids, EPIC jobs, Saturday arrivals, finale awards and the keepsake. `SOAK_SEED` for a different weekend |
| `npx tsx tests/e2e.giveaway.ts` | Starter kit and giveaways against a built server: host release with confirm, a claim race over the last item, the Lobby claim card, every starter hat drawn and persisted |
| `npx tsx tests/e2e.host.ts` | Host UI against a built server: phases, group reveal, photo vote → gallery, BS dispute, witness confirmation, finale ceremony |
| `npx tsx tests/persistence.sim.ts` | Boots a server, creates a party, restarts it, verifies the party is restored |
| `npx tsx tests/handover.sim.ts` | Two server copies on one data folder (a redeploy): the old one hands its players to the new one and stops saving |
| `npx tsx tests/shots.anim.ts` | Battle animation QA in demo mode at 4 viewports: creatures really move, replay lands on the engine's HP, ~8–9 s, Fast/Skip, reduced motion. Filmstrips → `test-results/screenshots/anim/` |
| `npx tsx scripts/balance.ts` | Prints simulated win rates for every creature |

Playwright tests use the Chromium that ships with `playwright-core`'s matching browser revision
(set `CHROME_PATH` if yours lives elsewhere).

---

## Deployment

The app is **one Node process** that serves static files, `/api/*`, `/photos/*` and `/ws`. Any host that runs
Node 22 with a persistent disk works. The build was verified locally; **it has not been deployed publicly from
this environment** (no hosting credentials were available), so pick one of these:

### Google Cloud Run (if you already have a Firebase / Google account)
```bash
PROJECT_ID=<your-firebase-project-id> ./scripts/deploy-cloudrun.sh
```
Needs the Blaze plan on the project (Cloud Run requires billing; a weekend costs a few dollars at most). Details in `docs/DEPLOY.md`.

### Fly.io (Sydney region, ~free for one small machine + 1 GB volume)
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
* **Redeploys during play.** While a new version starts, Cloud Run briefly runs the old one too, and each copy has
  its own memory. Two guards: the deploy script deletes old revisions, and an old copy that sees a newer one has
  claimed the data folder drops its players (they reconnect to the new copy) and stops saving. Actions made on the
  old copy in its last few seconds can still be lost, so **don't redeploy mid-weekend**, and start a fresh room
  after the final deploy.
* **Auto-battles and background time.** The server checks for due auto-battles every second while it is running.
  Cloud Run is deployed with one always-on instance, but by default Cloud Run may throttle the CPU when no requests
  or connections are open. If that happens, nothing is lost: on the next tick the matchmaker catches up on the
  battles it missed (capped at about one per avatar per catch-up) and resolves them then. It does **not** pretend
  they happened at the earlier time. To keep it truly continuous, add `--no-cpu-throttling` to the
  `gcloud run deploy` line (always-on CPU; roughly US$1–2 a day at this size, check Google's Cloud Run pricing page).
* Photos are stored unencrypted on the server disk and reachable by anyone with the link; the host's *Delete all photos*
  button clears them. Tell your mates.
* Creature "evolutions" are cosmetic (crown, auras, capes at levels 8–10) rather than new silhouettes.
* iOS Safari needs a user gesture before audio plays; the first tap on *Enter the Vineyard* unlocks it.
* The three.js opening is lazily loaded (~123 KB gzipped). On weak GPUs a watchdog swaps to the CSS
  fallback automatically after the first ~90 frames.
