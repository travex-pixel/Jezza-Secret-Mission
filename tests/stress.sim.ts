// Weekend stress test against the REAL built server, which it boots on its own data folder.
// More phones than the real party, all at once: joins, full-size selfie uploads, roasts and toasts, challenges
// (tap, photo, mate-confirm), photo votes, reactions, non-stop battles, a boss raid, a giveaway race, Friday→Saturday
// mid-game, and phones dropping off and coming back (some mid-battle). Then it checks nothing got stuck or
// counted twice, every phone sees the same scores, memory stays inside Cloud Run's 512 MB, and a restart keeps it all.
//   npm run build && npx tsx tests/stress.sim.ts            (STRESS_PLAYERS=20 STRESS_SECONDS=90 by default)
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import type { Battle, ClientMessage, PartyPublic, PlayerPrivate, ServerMessage } from '../shared/types';
import { MISSION_BY_ID } from '../shared/missions';
import { PLAN_SECONDS } from '../shared/battle';

const PORT = Number(process.env.STRESS_PORT ?? 8796);
const N = Number(process.env.STRESS_PLAYERS ?? 20);
const SECONDS = Number(process.env.STRESS_SECONDS ?? 90);
const DATA = path.resolve(process.env.SCRATCH ?? 'test-results', 'stress-data');
const MEM_LIMIT_MB = 400; // Cloud Run gives the container 512 MB
let failures = 0;
const check = (c: unknown, m: string) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];
// A phone-sized photo (~300 KB as base64, like the app sends after shrinking) and a face square (~10 KB)
const photo = () => 'data:image/jpeg;base64,' + crypto.randomBytes(225_000).toString('base64');
const FACE = 'data:image/jpeg;base64,' + crypto.randomBytes(7_500).toString('base64');

// ---------- the server ----------
let server: ChildProcess; let serverErrors: string[] = [];
async function boot() {
  serverErrors = [];
  server = spawn('node', ['dist/server/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stderr!.on('data', (d) => serverErrors.push(String(d)));
  await new Promise<void>((res) => server.stdout!.on('data', (d) => { if (String(d).includes('server on')) res(); }));
}
const rssMb = () => { try { const m = /VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${server.pid}/status`, 'utf8')); return m ? Number(m[1]) / 1024 : 0; } catch { return 0; } };

// ---------- a phone ----------
type Stat = { n: number; ms: number[]; errors: Record<string, number> };
const stats: Record<string, Stat> = {};
// Refusals the game gives on purpose (cooldowns, races lost, already done): normal play, not faults
const EXPECTED = /cooldown|Easy, legend|already|battling|All gone|not in your hand|Not your|isn't in your hand|wait|closed|Nothing|gone|full|no longer|expired|Pick a mate|vote on your own|can't vote|own photo|limit|today|Give it a bit more|Keep it|Too far|not live|after the|first\.|pinned|You've|You already|swing|cooled|Catch your breath|Voting for yourself|scrolled off|Hang on|still|ended|finished|over|out of|sorted/i;
class Phone {
  ws!: WebSocket; party: PartyPublic | null = null; priv: PlayerPrivate | null = null;
  pend = new Map<string, { res: (v: any) => void; rej: (e: Error) => void; t0: number; type: string; timer: NodeJS.Timeout }>();
  seq = 0; open = false; planned = new Set<string>(); answered = new Set<string>(); witnessed = new Set<string>();
  unexpected: string[] = [];
  constructor(public id: string, public secret: string, public nick: string) {}
  connect() {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
      this.ws.on('open', () => this.ws.send(JSON.stringify({ type: 'hello', playerId: this.id, secret: this.secret })));
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString()) as ServerMessage;
        if (m.type === 'welcome') { this.open = true; resolve(); }
        else if (m.type === 'party') { this.party = m.party; this.react(); }
        else if (m.type === 'private') { this.priv = m.priv; this.react(); }
        else if (m.type === 'ack') {
          const p = this.pend.get(m.reqId); if (!p) return;
          this.pend.delete(m.reqId); clearTimeout(p.timer);
          const st = (stats[p.type] ??= { n: 0, ms: [], errors: {} }); st.n++; st.ms.push(Date.now() - p.t0);
          if (m.ok) p.res(m.data); else { st.errors[m.error] = (st.errors[m.error] ?? 0) + 1; if (!EXPECTED.test(m.error)) this.unexpected.push(`${p.type}: ${m.error}`); p.rej(new Error(m.error)); }
        }
      });
      this.ws.on('error', reject);
      this.ws.on('close', () => { this.open = false; for (const p of this.pend.values()) { clearTimeout(p.timer); p.rej(new Error('closed')); } this.pend.clear(); });
    });
  }
  req<T = any>(msg: Record<string, unknown> & { type: ClientMessage['type'] }): Promise<T> {
    if (!this.open) return Promise.reject(new Error('closed'));
    const reqId = `r${this.seq++}`;
    return new Promise<T>((res, rej) => {
      const timer = setTimeout(() => { if (this.pend.delete(reqId)) { this.unexpected.push(`${msg.type}: no answer in 10s`); rej(new Error('timeout')); } }, 10_000);
      this.pend.set(reqId, { res, rej, t0: Date.now(), type: msg.type, timer });
      this.ws.send(JSON.stringify({ ...msg, reqId }));
    });
  }
  try(msg: Record<string, unknown> & { type: ClientMessage['type'] }) { return this.req(msg).catch(() => undefined); }
  /** What a real phone does on its own when something lands: accept the fight, pick a plan, confirm a mate. */
  react() {
    if (!this.open || !this.party) return;
    for (const b of this.party.battles as Battle[]) {
      if (b.status === 'challenge' && b.opponentId === this.id && !this.answered.has(b.id)) { this.answered.add(b.id); void this.try({ type: 'respondChallenge', battleId: b.id, accept: Math.random() > 0.1 }); }
      if (b.status === 'active' && b.quick && (b.a.playerId === this.id || b.b.playerId === this.id) && !this.planned.has(b.id)) {
        this.planned.add(b.id);
        // most tap a plan within a few seconds; a few leave it to the timer
        if (Math.random() > 0.15) setTimeout(() => void this.try({ type: 'battlePlan', battleId: b.id, plan: pick(['balanced', 'aggro', 'sneaky'] as const)!, tap: pick(['perfect', 'good', 'ok', 'miss'] as const) }), 300 + Math.random() * 4000);
      }
    }
    for (const w of this.priv?.pendingWitness ?? []) if (!this.witnessed.has(w.claimId)) { this.witnessed.add(w.claimId); setTimeout(() => void this.try({ type: 'confirmWitness', claimId: w.claimId, approve: Math.random() > 0.1 }), 500 + Math.random() * 3000); }
  }
  inBattle() { return (this.party?.battles as Battle[] | undefined)?.some((b) => (b.status === 'active' || b.status === 'challenge') && (b.challengerId === this.id || b.opponentId === this.id)); }
}

function pct(xs: number[], p: number) { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; }

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  await boot();
  console.log(`Stress: ${N} phones, ${SECONDS}s of play, server pid ${server.pid}, data ${DATA}`);
  const run = Date.now().toString(36);
  const NAMES = ['Travis', 'Jezza', 'Tommo', 'Big Dave', 'Nath', 'Shorty', 'Robbo', 'Lachy', 'Mitch', 'Benno', 'Cam', 'Sully', 'Dazza', 'Kev', 'Woody', 'Macca', 'Hendo', 'Gaz', 'Jonno', 'Fitzy', 'Stevo', 'Pete', 'Chook', 'Rossco'];
  const phones = Array.from({ length: N }, (_, i) => new Phone(`stress_${run}_${String(i).padStart(2, '0')}`, `secret_${run}_${i}_xxxxxxxx`, NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${i}` : '')));
  let peakRss = 0; let worstHealth = 0;
  const watch = setInterval(async () => {
    peakRss = Math.max(peakRss, rssMb());
    const t0 = Date.now(); await fetch(`http://localhost:${PORT}/api/health`).catch(() => undefined); worstHealth = Math.max(worstHealth, Date.now() - t0);
  }, 1000);

  // ---- everyone arrives at once ----
  console.log('\n[arrival]');
  await Promise.all(phones.map((p) => p.connect()));
  const [host, ...mates] = phones;
  const code = (await host.req<{ code: string }>({ type: 'createParty', nickname: host.nick })).code;
  const joins = await Promise.allSettled(mates.map((p) => p.req({ type: 'joinParty', code, nickname: p.nick })));
  check(joins.every((j) => j.status === 'fulfilled'), `${mates.length} lads join at the same moment`);
  const kinds = ['dragon', 'wombat', 'possum', 'owl', 'goblin', 'sprite', 'barrel', 'fox'] as const;
  await Promise.all(phones.map((p, i) => p.req({ type: 'chooseCreature', creature: kinds[i % kinds.length] })));
  const t0 = Date.now();
  const selfies = await Promise.allSettled(phones.map((p, i) => p.req({ type: 'claimMission', missionId: 'm001', claimId: `sf_${run}_${i}`, photo: photo(), avatar: FACE })));
  check(selfies.every((s) => s.status === 'fulfilled'), `${N} full-size selfies uploaded at once (${Date.now() - t0} ms)`);
  await Promise.all(phones.map((p) => p.try({ type: 'wallPost', kind: 'roast', text: `${p.nick} reckons Jezza parallel parks like a group project.` })));
  await Promise.all(phones.filter((p) => p.nick !== 'Jezza').map((p) => p.try({ type: 'wallPost', kind: 'toast', text: `${p.nick} says: to the bloke who turns up when it counts.` })));
  await sleep(500);
  check(host.party?.players.filter((p) => p.avatarUrl).length === N, 'every lad has their selfie as a profile picture');
  check(host.party?.groomId === phones[1].id, 'Jezza is spotted as the groom');

  // ---- the weekend, compressed ----
  console.log(`\n[play: ${SECONDS}s]`);
  const stopAt = Date.now() + SECONDS * 1000;
  let claimSeq = 0; let drops = 0; let midBattleDrops = 0;
  const giveaway = { id: '' as string };
  const host$ = (async () => {
    await sleep(SECONDS * 150);
    await host.try({ type: 'host', action: { kind: 'summonRaid' } });
    await sleep(SECONDS * 150);
    giveaway.id = (await host.req<{ id: string }>({ type: 'host', action: { kind: 'makeGiveaway', item: 'hat_viking', qty: 5 } }).catch(() => ({ id: '' }))).id;
    await sleep(SECONDS * 200);
    await host.try({ type: 'host', action: { kind: 'setPhase', phase: 'saturday' } });
  })();
  const loop = async (p: Phone) => {
    while (Date.now() < stopAt) {
      await sleep(300 + Math.random() * 1200);
      if (!p.open) continue;
      const r = Math.random();
      const hand = p.priv?.hand.filter((h) => h.status === 'active') ?? [];
      const others = (p.party?.players ?? []).filter((x) => x.id !== p.id && x.creature);
      if (giveaway.id && Math.random() < 0.5) { void p.try({ type: 'claimGiveaway', giveawayId: giveaway.id }); }
      if (r < 0.32 && hand.length) {
        const h = pick(hand)!; const m = MISSION_BY_ID[h.missionId];
        if (!m || m.wall) continue;
        const msg: Record<string, unknown> = { type: 'claimMission', missionId: m.id, claimId: `c_${run}_${claimSeq++}` };
        if (m.method === 'photo') msg.photo = photo();
        if (m.method === 'witness') msg.witnessId = pick(others)?.id;
        void p.try(msg as any);
      } else if (r < 0.47) {
        const f = pick((p.party?.feed ?? []).filter((x) => x.kind === 'mission' && x.playerId !== p.id));
        if (f) void p.try({ type: 'react', eventId: f.id, emoji: pick(['😂', '🔥'] as const)! });
      } else if (r < 0.55) {
        const v = pick((p.party?.pendingPhotos ?? []).filter((x) => x.playerId !== p.id && !x.up.includes(p.id) && !x.down.includes(p.id)));
        if (v) void p.try({ type: 'votePhoto', claimId: v.claimId, up: Math.random() > 0.2 });
      } else if (r < 0.80) {
        if (!p.inBattle()) { const o = pick(others.filter((x) => x.online)); if (o) void p.try({ type: 'challenge', opponentId: o.id }); }
      } else if (r < 0.86) {
        const raid = p.party?.raid; if (raid?.status === 'active') void p.try({ type: 'raidHit', raidId: raid.id, tap: pick(['perfect', 'good', 'ok'] as const) });
      } else if (r < 0.90) {
        void p.try({ type: 'wallVote', postId: pick(p.party?.wall ?? [])?.id ?? 'none' });
      } else if (r < 0.93 && p !== host) {
        // phone goes to sleep / loses signal, comes back a few seconds later
        drops++; if (p.inBattle()) midBattleDrops++;
        p.ws.terminate(); await sleep(1500 + Math.random() * 4000); await p.connect().catch(() => undefined);
      }
    }
  };
  await Promise.all([...phones.map(loop), host$]);

  // ---- let every fight, vote and confirm finish ----
  console.log('\n[settle]');
  await Promise.all(phones.filter((p) => !p.open).map((p) => p.connect()));
  await sleep((PLAN_SECONDS + 12) * 1000);
  clearInterval(watch);

  const party = host.party!;
  // every phone sees the same scoreboard
  const board = (p: Phone) => JSON.stringify((p.party?.players ?? []).map((x) => [x.id, x.points, x.wins, x.losses]).sort());
  const agree = phones.filter((p) => board(p) === board(host)).length;
  check(agree === N, `all ${N} phones show the same scores, wins and losses (${agree}/${N})`);
  const stuck = (party.battles as Battle[]).filter((b) => b.status === 'active');
  check(stuck.length === 0, `no fight left stuck mid-battle (${stuck.length} active)`);

  // ---- the numbers ----
  console.log('\n[numbers]');
  const types = Object.entries(stats).sort((a, b) => b[1].n - a[1].n);
  let total = 0;
  for (const [t, s] of types) { total += s.n; console.log(`    ${t.padEnd(17)} ${String(s.n).padStart(5)} reqs · p50 ${pct(s.ms, 50)}ms · p95 ${pct(s.ms, 95)}ms · max ${Math.max(...s.ms)}ms${Object.keys(s.errors).length ? ` · refused: ${Object.entries(s.errors).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([e, n]) => `${n}× "${e.slice(0, 40)}"`).join(', ')}` : ''}`); }
  const all = types.flatMap(([, s]) => s.ms);
  console.log(`    ${total} requests · ${drops} phone drops (${midBattleDrops} mid-battle) · peak memory ${Math.round(peakRss)} MB · slowest health check ${worstHealth} ms`);
  check(pct(all, 95) < 250, `95% of requests answered in under 250 ms (p95 ${pct(all, 95)} ms)`);
  check(peakRss > 0 && peakRss < MEM_LIMIT_MB, `server memory stays well inside Cloud Run's 512 MB (peak ${Math.round(peakRss)} MB)`);
  const unexpected = phones.flatMap((p) => p.unexpected);
  const uniq = [...new Set(unexpected)];
  check(unexpected.length === 0, `no unexpected errors or unanswered requests (${unexpected.length}${uniq.length ? `: ${uniq.slice(0, 6).join(' | ')}` : ''})`);
  check(!serverErrors.some((e) => /TypeError|ReferenceError|RangeError|at .*engine/.test(e)), `no crashes in the server log${serverErrors.length ? ` (${serverErrors.join(' ').slice(0, 200)})` : ''}`);

  // ---- restart: everything comes back exactly ----
  console.log('\n[restart]');
  for (const p of phones) p.ws.close();
  await sleep(1200); // > save debounce
  server.kill('SIGTERM'); await new Promise((r) => server.once('exit', r));
  const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'state.json'), 'utf8'));
  const sp = saved.parties[code];
  const battles = Object.values<any>(sp.battles);
  const settled = battles.filter((b) => b.rewards);
  const wins = Object.values<any>(sp.players).reduce((n, p) => n + p.wins, 0);
  const losses = Object.values<any>(sp.players).reduce((n, p) => n + p.losses, 0);
  check(settled.length > 0 && wins === settled.length && losses === settled.length, `${settled.length} fights finished, each counted exactly once (${wins} wins, ${losses} losses)`);
  check(battles.filter((b) => b.status === 'finished').every((b) => b.winnerId && b.loserId && b.winnerId !== b.loserId && [b.challengerId, b.opponentId].includes(b.winnerId)), 'every finished fight has one winner, one loser, both in the fight');
  const g = sp.giveaways.find((x: any) => x.id === giveaway.id);
  const claimers = g ? g.claims.map((c: any) => c.playerId) : [];
  check(!!g && claimers.length === 5 && new Set(claimers).size === 5 && g.status === 'exhausted', `giveaway race: exactly 5 Viking Helmets went to 5 different lads (${claimers.length} claimed, ${g?.status})`);
  check(claimers.every((id: string) => sp.players[id].unlocked.filter((x: string) => x === 'hat_viking').length === 1), 'each winner owns exactly one');
  check(Object.values<any>(sp.players).every((p) => p.unlocked.length === new Set(p.unlocked).size), 'nobody has a duplicate item');
  check(sp.phase === 'saturday', 'Friday → Saturday switched cleanly mid-game');
  const before = Object.fromEntries(Object.values<any>(sp.players).map((p) => [p.id, p.points]));
  await boot();
  const back = new Phone(phones[3].id, phones[3].secret, phones[3].nick); await back.connect(); await sleep(600);
  const after = Object.fromEntries((back.party?.players ?? []).map((p) => [p.id, p.points]));
  check(JSON.stringify(after) === JSON.stringify(Object.fromEntries(Object.keys(before).filter((id) => after[id] !== undefined).map((id) => [id, before[id]]))) && Object.keys(after).length === N, 'after a restart every lad is back with exactly the same points');
  const pics = (back.party?.players ?? []).filter((p) => p.avatarUrl);
  const picOk = await Promise.all(pics.slice(0, 5).map((p) => fetch(`http://localhost:${PORT}${p.avatarUrl}`).then((r) => r.ok)));
  check(picOk.length > 0 && picOk.every(Boolean), 'profile pictures still load after the restart');
  back.ws.close(); server.kill('SIGTERM'); await sleep(400);
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nSTRESS PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); try { server?.kill('SIGTERM'); } catch { /* */ } process.exit(1); });
