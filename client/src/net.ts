// Transport layer. Live mode talks WebSocket to the authoritative server.
// Demo mode (?demo=1, or when no server is reachable at all) runs the same
// engine in the browser with simulated mates: great for previews and
// practice battles, but nothing it awards is real.
import type { ClientMessage, ClientRequest, ServerMessage } from '@shared/types';
import { Engine, type Outbound } from '@shared/engine';
import { CREATURE_IDS } from '@shared/creatures';
import { MISSION_BY_ID, STARTER_MISSION } from '@shared/missions';
import { levelForXp } from '@shared/progression';
import { RAID_THRESHOLD } from '@shared/raid';
import { useStore } from './store';

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void; timer: number };

export interface Transport {
  send(msg: ClientMessage): void;
  kind: 'live' | 'demo';
}

let transport: Transport | null = null;
const pending = new Map<string, Pending>();
let seq = 0;
export const isDemo = () => transport?.kind === 'demo';

export function reqId() { return `r${Date.now().toString(36)}${(seq++).toString(36)}`; }
export function newClaimId() { return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`; }

/** Send a request and resolve with the ack's data (rejects with the server's error text). */
export function request<T = unknown>(msg: ClientRequest): Promise<T> {
  const id = reqId();
  return new Promise<T>((resolve, reject) => {
    if (!transport) { reject(new Error('Not connected yet. Hang on a sec.')); return; }
    const timer = window.setTimeout(() => { pending.delete(id); reject(new Error('The vineyard is slow to respond. Try again.')); }, 10000);
    pending.set(id, { resolve, reject, timer });
    transport.send({ ...(msg as any), reqId: id });
  });
}

function dispatch(m: ServerMessage) {
  if (m.type === 'ack') {
    const p = pending.get(m.reqId);
    if (p) { pending.delete(m.reqId); clearTimeout(p.timer); if (m.ok) p.resolve(m.data); else p.reject(new Error(m.error)); }
    return;
  }
  useStore.getState().applyServer(m);
}

// ---------------- live ----------------
function connectLive(): Transport {
  const store = useStore.getState();
  let ws: WebSocket | null = null;
  let attempts = 0;
  let closedByUs = false;
  let pingTimer: number | undefined;
  const queue: ClientMessage[] = [];

  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    useStore.getState().setConn(attempts === 0 ? 'connecting' : 'offline');
    ws.onopen = () => {
      attempts = 0;
      const { identity, pendingCode } = useStore.getState();
      ws!.send(JSON.stringify({ type: 'hello', playerId: identity.playerId, secret: identity.secret, code: pendingCode ?? undefined }));
      useStore.getState().setConn('online');
      while (queue.length) ws!.send(JSON.stringify(queue.shift()));
      pingTimer = window.setInterval(() => { if (ws?.readyState === 1) ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); }, 20000);
    };
    ws.onmessage = (ev) => { try { dispatch(JSON.parse(ev.data)); } catch (e) { console.warn('bad message', e); } };
    ws.onclose = () => {
      clearInterval(pingTimer);
      if (closedByUs) return;
      useStore.getState().setConn('offline');
      for (const [id, p] of pending) { clearTimeout(p.timer); p.reject(new Error('Connection dropped. Reconnecting…')); pending.delete(id); }
      const delay = Math.min(8000, 500 * 2 ** Math.min(attempts++, 4)) + Math.random() * 300;
      setTimeout(open, delay);
    };
    ws.onerror = () => { /* onclose follows */ };
  };
  open();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ws && ws.readyState !== 1 && ws.readyState !== 0) { try { ws.close(); } catch { /* */ } } });
  void store;
  return {
    kind: 'live',
    send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); else queue.push(msg); },
  };
}

// ---------------- demo ----------------
const DEMO_MATES: { nick: string; creature: (typeof CREATURE_IDS)[number]; name: string; xp: number; pts: number; w: number; l: number }[] = [
  { nick: 'Jezza', creature: 'dragon', name: 'Smoulder', xp: 310, pts: 120, w: 2, l: 1 },
  { nick: 'Tommo', creature: 'wombat', name: 'Bruce', xp: 180, pts: 95, w: 1, l: 2 },
  { nick: 'Big Dave', creature: 'barrel', name: 'Keg', xp: 460, pts: 160, w: 3, l: 0 },
  { nick: 'Nath', creature: 'possum', name: 'Nugget', xp: 90, pts: 55, w: 0, l: 1 },
  { nick: 'Shorty', creature: 'owl', name: 'Professor', xp: 240, pts: 110, w: 1, l: 1 },
  { nick: 'Robbo', creature: 'goblin', name: 'Grimble', xp: 60, pts: 40, w: 0, l: 0 },
  { nick: 'Lachy', creature: 'sprite', name: 'Pinot', xp: 150, pts: 70, w: 1, l: 0 },
  { nick: 'Mitch', creature: 'fox', name: 'Dapper', xp: 200, pts: 85, w: 2, l: 2 },
  { nick: 'Woody', creature: 'wombat', name: 'Thumper', xp: 30, pts: 20, w: 0, l: 1 },
  { nick: 'Benno', creature: 'dragon', name: 'Crispy', xp: 120, pts: 65, w: 1, l: 1 },
  { nick: 'Sticks', creature: 'fox', name: 'Slick', xp: 75, pts: 45, w: 0, l: 0 },
  { nick: 'Pez', creature: 'owl', name: 'Hootie', xp: 15, pts: 10, w: 0, l: 0 },
  { nick: 'Cam', creature: 'goblin', name: 'Corky', xp: 280, pts: 100, w: 1, l: 3 },
  { nick: 'Jonesy', creature: 'sprite', name: 'Fizz', xp: 45, pts: 30, w: 0, l: 0 },
];

function connectDemo(): Transport {
  const engine = new Engine({ codeLength: 4 });
  const { identity } = useStore.getState();
  const hostId = 'demo_host_0000000001';
  const mateIds: string[] = [];
  const seeded = new Set<string>();

  /** Join the simulated mates into a party and give them believable progress. */
  const seedBots = (code: string, includeJezzaAsHost: boolean) => {
    if (seeded.has(code)) return;
    seeded.add(code);
    const party = engine.state.parties[code];
    DEMO_MATES.forEach((m, i) => {
      const isHostBot = i === 0 && includeJezzaAsHost;
      const id = i === 0 ? hostId : `demo_mate_${String(i).padStart(12, '0')}`;
      engine.auth(id, 'demo-secret-mate');
      if (!isHostBot) engine.handle(id, { type: 'joinParty', reqId: 'x', code, nickname: m.nick });
      if (!mateIds.includes(id)) mateIds.push(id);
      engine.handle(id, { type: 'chooseCreature', reqId: 'x', creature: m.creature, creatureName: m.name });
      const p = party.players[id];
      if (!p) return;
      p.xp = m.xp; p.points = m.pts; p.wins = m.w; p.losses = m.l; p.missionsCompleted = Math.floor(m.pts / 15);
      p.level = levelForXp(m.xp);
      p.rating = 1000 + (m.w - m.l) * 18; p.streak = m.w > m.l ? 1 : 0; p.bestStreak = Math.max(1, m.w);
      p.online = i % 4 !== 3;
      p.categoryCounts = { laugh: i % 3, jezza: i % 2, photo: i % 4, dance: (i + 1) % 3 };
      p.laughs = (i * 3) % 7; p.fires = (i * 5) % 6; p.wallVotes = i % 4; p.raidDamage = 0;
    });
    party.groomId = includeJezzaAsHost ? hostId : party.groomId;
    party.phaseMissions.friday = RAID_THRESHOLD.friday - 2; // the boss turns up after a couple more challenges
    const roasts: [number, 'roast' | 'toast', string][] = [
      [2, 'roast', 'Jezza parallel parks like it\'s a group assignment nobody else turned up to.'],
      [5, 'toast', 'To the only bloke who brings a spare phone charger for everyone. Legend.'],
      [3, 'roast', 'Jezza\'s idea of a big night is the extended edition of anything.'],
      [7, 'roast', 'Mate has been "five minutes away" since 2014.'],
      [9, 'toast', 'Best mate, worst dancer, absolute rock. Cheers Jez.'],
    ];
    const t0 = Date.now();
    roasts.forEach(([who, kind, text], n) => {
      const pid = mateIds[who]; if (!pid) return;
      party.wall.push({ id: `w_demo_${n}`, at: t0 - (n + 1) * 240000, playerId: pid, kind, text, phase: 'friday', votes: mateIds.filter((_, k) => (k + n) % 3 === 0 && k !== who).slice(0, 2 + n), groomLove: n === 1 });
    });
    const drinks: [number, string, number, string][] = [[4, '2019 Hunter Semillon', 5, 'Crisp. Smug. Expensive-tasting.'], [6, 'Pepsi Max', 4, 'Hydrating. Reliable. No regrets.'], [1, 'Cellar door Shiraz', 3, 'Notes of oak and a long finish of Friday']];
    drinks.forEach(([who, drink, stars, note], n) => {
      const pid = mateIds[who]; if (!pid) return;
      party.cellar.push({ id: `ce_demo_${n}`, at: t0 - (n + 2) * 300000, playerId: pid, drink, stars, note, phase: 'friday', fires: mateIds.filter((_, k) => k % (n + 2) === 0 && k !== who) });
    });
    party.feed.push(
      { id: 'd1', at: t0 - 540000, kind: 'mission', text: 'Big Dave did "Ripper Dance" (+15)', emoji: '🕺', playerId: mateIds[2], claimId: 'demo-c1', reactions: { '😂': [mateIds[1], mateIds[4], mateIds[6]] } },
      { id: 'd2', at: t0 - 420000, kind: 'battle', text: 'Keg (Big Dave) knocked out Bruce (Tommo) · 🔥3 streak', emoji: '🏆' },
      { id: 'd3', at: t0 - 300000, kind: 'evolve', text: '🧬 Shorty\'s Professor EVOLVED into a Midnight Owl!', emoji: '🧬' },
      { id: 'd4', at: t0 - 120000, kind: 'mission', text: 'Nath did a sneaky one (+20)', emoji: '🕵️', playerId: mateIds[3], claimId: 'demo-c2' },
    );
  };

  // The default demo room: Jezza (a bot) hosts, Friday is already live.
  engine.auth(hostId, 'demo-secret-host');
  const created = engine.handle(hostId, { type: 'createParty', reqId: 'x', nickname: DEMO_MATES[0].nick, partyName: "Jezza's Bucks Weekend" });
  const code = (created.ack as any).data.code as string;
  seedBots(code, true);
  engine.handle(hostId, { type: 'host', reqId: 'x', action: { kind: 'revealGroupMission', missionId: 'g01' } });
  engine.state.parties[code].nextAutoAt = Date.now() + 90_000; // demo: first auto-battle in ~90s rather than 10 min
  engine.handle(hostId, { type: 'host', reqId: 'x', action: { kind: 'postEpic', presetId: 'mac' } }); // an EPIC job to grab
  engine.auth(identity.playerId, identity.secret);
  useStore.getState().setConn('demo');
  useStore.setState({ pendingCode: code });

  const deliver = (outs: Outbound[]) => {
    for (const o of outs) if (o.to === identity.playerId || o.to === 'party') dispatch(o.msg);
  };
  const push = () => {
    const p = engine.partyOf(identity.playerId);
    if (!p) { dispatch({ type: 'private', priv: null }); return; }
    // Clone like the wire would: the engine mutates its objects in place and the UI must never share them.
    dispatch({ type: 'party', party: structuredClone(engine.publicView(p, identity.playerId)) });
    const priv = structuredClone(engine.privateView(p, identity.playerId));
    dispatch({ type: 'private', priv, hostView: p.hostId === identity.playerId ? engine.hostView(p) : undefined });
  };
  const chance = (x: number) => Math.random() < x;
  const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
  // Bots: accept fights, play rounds, confirm witnesses, hit bosses, react, vote, and do the odd challenge.
  const botTick = () => {
    let changed = false;
    for (const p of Object.values(engine.state.parties)) {
      for (const b of Object.values(p.battles)) {
        if (b.status === 'challenge' && mateIds.includes(b.opponentId) && Date.now() - b.createdAt > 1200) { engine.handle(b.opponentId, { type: 'respondChallenge', reqId: 'x', battleId: b.id, accept: true }); changed = true; }
        if (b.status === 'active' && b.quick) {
          // bots pick a plan after a moment (with a plausible charge-up tap)
          for (const side of [b.a, b.b]) {
            if (mateIds.includes(side.playerId) && !side.plan && Date.now() - (b.startedAt ?? 0) > 1800) {
              const r = engine.handle(side.playerId, { type: 'battlePlan', reqId: 'x', battleId: b.id, plan: pick(['balanced', 'aggro', 'sneaky'] as const), tap: chance(0.3) ? 'perfect' : chance(0.5) ? 'good' : 'miss' });
              deliver(r.direct); changed = true;
            }
          }
        } else if (b.status === 'active') {
          for (const side of [b.a, b.b]) {
            if (mateIds.includes(side.playerId) && !side.action) {
              const act = side.specialCooldown === 0 && chance(0.4) ? 'special' : chance(0.7) ? 'attack' : 'counter';
              const tap = act === 'counter' ? undefined : chance(0.3) ? 'perfect' : chance(0.5) ? 'good' : 'miss';
              const r = engine.handle(side.playerId, { type: 'battleAction', reqId: 'x', battleId: b.id, round: b.round, action: act, tap });
              deliver(r.direct); changed = true;
            }
          }
        }
      }
      for (const c of Object.values(p.claims)) {
        if (c.status === 'pending' && c.method === 'witness' && c.witnessId && mateIds.includes(c.witnessId) && Date.now() - c.createdAt > 2500) { const r = engine.handle(c.witnessId, { type: 'confirmWitness', reqId: 'x', claimId: c.id, approve: true }); deliver(r.direct); changed = true; }
        // photo votes: a few bots have a look and (mostly) thumbs it up
        if (c.status === 'pending' && c.review === 'vote' && Date.now() - c.createdAt > 3500 && chance(0.25)) {
          const voter = mateIds.find((id) => id !== c.playerId && p.players[id] && !(c.votesUp ?? []).includes(id) && !(c.votesDown ?? []).includes(id));
          if (voter) { const r = engine.handle(voter, { type: 'votePhoto', reqId: 'x', claimId: c.id, up: chance(0.9) }); deliver(r.direct); changed = true; }
        }
      }
      const online = mateIds.filter((id) => p.players[id]?.online);
      // raid: a few bots swing each tick
      const raid = p.raids[p.raids.length - 1];
      if (raid && raid.status === 'active') for (const id of online) if (chance(0.12)) { const r = engine.handle(id, { type: 'raidHit', reqId: 'x', raidId: raid.id, tap: chance(0.3) ? 'perfect' : 'good' }); deliver(r.direct.filter((d) => d.to === 'party')); if (r.ack?.ok) changed = true; }
      // react to the human's challenges and vote their wall posts
      for (const ev of p.feed.slice(-8)) if (ev.kind === 'mission' && ev.playerId === identity.playerId && chance(0.08)) { const r = engine.handle(pick(online), { type: 'react', reqId: 'x', eventId: ev.id, emoji: chance(0.6) ? '😂' : '🔥' }); if (r.ack?.ok) changed = true; }
      for (const w of p.wall.slice(-6)) if (w.playerId === identity.playerId && chance(0.1)) { const r = engine.handle(pick(online), { type: 'wallVote', reqId: 'x', postId: w.id }); if (r.ack?.ok) changed = true; }
      // EPIC jobs: bots grab spots (leaving the human a fair go first) and finish their own jobs
      for (const e of p.epics ?? []) {
        if (e.status !== 'open') continue;
        const age = Date.now() - e.createdAt;
        const left = e.max - e.crew.length;
        if (left > 0 && age > 8000 && (left > 1 || age > 25_000) && chance(0.05)) {
          const bot = online.find((id) => !e.crew.includes(id) && p.players[id]?.creature);
          if (bot) { engine.handle(bot, { type: 'joinEpic', reqId: 'x', epicId: e.id }); changed = true; }
        }
        if (left === 0 && !e.crew.includes(identity.playerId) && age > 30_000 && chance(0.05)) { const r = engine.handle(e.crew[0], { type: 'finishEpic', reqId: 'x', epicId: e.id }); deliver(r.direct.filter((d) => d.to === 'party')); changed = true; }
      }
      // the odd bot challenge so the feed and the raid counter move
      if (chance(0.03)) {
        const bot = pick(online); const bp = p.players[bot];
        const h = bp?.hand.find((x) => x.status === 'active' && MISSION_BY_ID[x.missionId]?.method === 'self');
        if (bp && h) { const r = engine.handle(bot, { type: 'claimMission', reqId: 'x', missionId: h.missionId, claimId: `bot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` }); deliver(r.direct.filter((d) => d.to === 'party')); changed = true; }
      }
    }
    const t = engine.tick(); deliver(t.direct);
    if (changed || t.changed.length) push();
  };
  setInterval(botTick, 700);
  // Demo-only hooks so the visual QA can show timing-dependent moments on demand.
  (window as any).__demo = {
    summonRaid: () => { const p = engine.partyOf(identity.playerId); if (!p) return; const r = engine.handle(p.hostId, { type: 'host', reqId: 'x', action: { kind: 'summonRaid' } }); deliver(r.direct); push(); },
    /** Run a real auto-battle involving you right now (same matchmaker + engine as the server). */
    autoBattle: () => {
      const p = engine.partyOf(identity.playerId); if (!p) return;
      const now = Date.now();
      for (const pl of Object.values(p.players)) (pl as any).lastAutoAt = pl.id === identity.playerId ? 0 : now;
      p.nextAutoAt = now - 1;
      const t = engine.tick(); deliver(t.direct); push();
    },
    openAway: () => useStore.getState().setAwayOpen(true),
    giveXp: (xp: number) => { const p = engine.partyOf(identity.playerId); const me = p?.players[identity.playerId]; if (!p || !me) return; const out: Outbound[] = []; const r = (engine as any).grant(p, me, 0, xp, out); dispatch({ type: 'reward', points: 0, xp, ...r, title: 'Demo boost' }); push(); },
  };

  setTimeout(() => dispatch({ type: 'welcome', playerId: identity.playerId, serverTime: Date.now(), inParty: false }), 0);
  return {
    kind: 'demo',
    send(msg) {
      if (msg.type === 'hello' || msg.type === 'ping') return;
      // Demo rooms: any join code lands in the demo party; hosting a party fills it with bots.
      const m = msg.type === 'joinParty' ? { ...msg, code } : msg;
      const res = engine.handle(identity.playerId, m as ClientMessage);
      if (m.type === 'createParty' && res.ack?.ok) seedBots((res.ack.data as any).code, false);
      setTimeout(() => {
        push();
        if ('reqId' in m && res.ack) dispatch(res.ack.ok ? { type: 'ack', reqId: m.reqId, ok: true, data: res.ack.data } : { type: 'ack', reqId: m.reqId, ok: false, error: res.ack.error });
        deliver(res.direct);
      }, 60 + Math.random() * 120);
    },
  };
}

/** Leave the current party and go back to the join screen (e.g. to make a fresh room after testing). */
export async function leaveParty() {
  await request({ type: 'leaveParty' });
  useStore.setState({ party: null, priv: null, hostView: null, flow: 'join', tab: 'home', pendingCode: null, focusBattleId: null });
}

export function connect() {
  if (transport) return transport;
  const params = new URLSearchParams(location.search);
  // Demo when asked for explicitly, when built as a static site (GitHub Pages), or when hosted on *.github.io.
  const forceDemo = params.get('demo') === '1' || import.meta.env.VITE_STATIC_DEMO === '1' || /\.github\.io$/i.test(location.hostname);
  transport = forceDemo ? connectDemo() : connectLive();
  return transport;
}

export { STARTER_MISSION };
