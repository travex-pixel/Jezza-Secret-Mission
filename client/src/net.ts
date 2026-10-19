// Transport layer. Live mode talks WebSocket to the authoritative server.
// Demo mode (?demo=1, or when no server is reachable at all) runs the same
// engine in the browser with simulated mates: great for previews and
// practice battles, but nothing it awards is real.
import type { ClientMessage, ClientRequest, ServerMessage } from '@shared/types';
import { Engine, type Outbound } from '@shared/engine';
import { CREATURE_IDS } from '@shared/creatures';
import { MISSION_BY_ID, STARTER_MISSION } from '@shared/missions';
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
      p.level = Math.max(1, Math.min(10, 1 + Math.floor(m.xp / 60)));
      p.online = i % 4 !== 3;
      p.categoryCounts = { toast: i % 3, jezza: i % 2, social: i % 4 };
    });
    party.feed.push(
      { id: 'd1', at: Date.now() - 540000, kind: 'mission', text: 'Big Dave completed "The Sommelier Fraud" (+20 pts)', emoji: '✅' },
      { id: 'd2', at: Date.now() - 420000, kind: 'battle', text: 'Keg (Big Dave) knocked out Bruce (Tommo)', emoji: '🏆' },
      { id: 'd3', at: Date.now() - 300000, kind: 'achievement', text: 'Shorty unlocked "Toastmaster General"', emoji: '🏅' },
      { id: 'd4', at: Date.now() - 120000, kind: 'mission', text: 'Nath completed a SECRET mission (+20 pts)', emoji: '🕵️' },
    );
  };

  // The default demo room: Jezza (a bot) hosts, Friday is already live.
  engine.auth(hostId, 'demo-secret-host');
  const created = engine.handle(hostId, { type: 'createParty', reqId: 'x', nickname: DEMO_MATES[0].nick, partyName: "Jezza's Bucks Weekend" });
  const code = (created.ack as any).data.code as string;
  seedBots(code, true);
  engine.handle(hostId, { type: 'host', reqId: 'x', action: { kind: 'setPhase', phase: 'friday' } });
  engine.handle(hostId, { type: 'host', reqId: 'x', action: { kind: 'revealGroupMission', missionId: 'm051' } });
  engine.auth(identity.playerId, identity.secret);
  useStore.getState().setConn('demo');
  useStore.setState({ pendingCode: code });

  const deliver = (outs: Outbound[]) => {
    for (const o of outs) if (o.to === identity.playerId || o.to === 'party') dispatch(o.msg);
  };
  const push = () => {
    const p = engine.partyOf(identity.playerId);
    if (!p) { dispatch({ type: 'private', priv: null }); return; }
    dispatch({ type: 'party', party: engine.publicView(p, identity.playerId) });
    const priv = engine.privateView(p, identity.playerId);
    dispatch({ type: 'private', priv, hostView: p.hostId === identity.playerId ? engine.hostView(p) : undefined });
  };
  // Bots: accept challenges, pick actions, confirm witness requests; the bot host approves claims.
  const botTick = () => {
    let changed = false;
    for (const p of Object.values(engine.state.parties)) {
      for (const b of Object.values(p.battles)) {
        if (b.status === 'challenge' && mateIds.includes(b.opponentId) && Date.now() - b.createdAt > 1200) { engine.handle(b.opponentId, { type: 'respondChallenge', reqId: 'x', battleId: b.id, accept: true }); changed = true; }
        if (b.status === 'active') {
          for (const side of [b.a, b.b]) {
            if (mateIds.includes(side.playerId) && !side.action) {
              const act = side.specialCooldown === 0 && Math.random() < 0.4 ? 'special' : Math.random() < 0.7 ? 'attack' : 'defend';
              const r = engine.handle(side.playerId, { type: 'battleAction', reqId: 'x', battleId: b.id, round: b.round, action: act });
              deliver(r.direct); changed = true;
            }
          }
        }
      }
      for (const c of Object.values(p.claims)) {
        if (c.status === 'pending' && c.method === 'witness' && c.witnessId && mateIds.includes(c.witnessId) && Date.now() - c.createdAt > 2500) { const r = engine.handle(c.witnessId, { type: 'confirmWitness', reqId: 'x', claimId: c.id, approve: true }); deliver(r.direct); changed = true; }
        if (c.status === 'pending' && c.method !== 'witness' && p.hostId === hostId && Date.now() - c.createdAt > 4000) { const r = engine.handle(hostId, { type: 'host', reqId: 'x', action: { kind: 'resolveClaim', claimId: c.id, approve: true } }); deliver(r.direct); changed = true; }
      }
      // Occasionally a bot completes a mission so the feed feels alive.
      if (p.phase === 'friday' || p.phase === 'saturday') {
        if (Math.random() < 0.012) {
          const bot = mateIds[Math.floor(Math.random() * mateIds.length)];
          const bp = p.players[bot];
          const h = bp?.hand.find((x) => x.status === 'active' && MISSION_BY_ID[x.missionId]?.method === 'self');
          if (bp && h) { const r = engine.handle(bot, { type: 'claimMission', reqId: 'x', missionId: h.missionId, claimId: `bot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` }); deliver(r.direct.filter((d) => d.to === 'party')); changed = true; }
        }
      }
    }
    const t = engine.tick(); deliver(t.direct);
    if (changed || t.changed.length) push();
  };
  setInterval(botTick, 700);

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

export function connect() {
  if (transport) return transport;
  const params = new URLSearchParams(location.search);
  // Demo when asked for explicitly, when built as a static site (GitHub Pages), or when hosted on *.github.io.
  const forceDemo = params.get('demo') === '1' || import.meta.env.VITE_STATIC_DEMO === '1' || /\.github\.io$/i.test(location.hostname);
  transport = forceDemo ? connectDemo() : connectLive();
  return transport;
}

export { STARTER_MISSION };
