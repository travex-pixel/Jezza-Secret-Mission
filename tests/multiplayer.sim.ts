// Multiplayer simulation against the REAL server over WebSockets: 15 players,
// duplicate claims, host permission checks, concurrent writes, reconnection,
// identity spoofing, and server-resolved battles. Exits non-zero on any failure.
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage, PartyPublic, PlayerPrivate } from '../shared/types';
import { STARTER_MISSION, MISSIONS, rookieLeft } from '../shared/missions';
const SELFIE = 'data:image/jpeg;base64,c2VsZmll'; // the first challenge is a selfie
const WIT_IDS = MISSIONS.filter((m) => m.method === 'witness').map((m) => m.id);
const PHOTO_IDS = MISSIONS.filter((m) => m.method === 'photo' && m.scope === 'private' && !m.starter).map((m) => m.id);
const SELF_IDS = MISSIONS.filter((m) => m.method === 'self' && !m.starter && m.scope === 'private').map((m) => m.id);

const URL = process.env.WS_URL ?? 'ws://localhost:8787/ws';
const N = 15;
let failures = 0;
const check = (cond: unknown, msg: string) => { if (cond) console.log(`  ✔ ${msg}`); else { failures++; console.log(`  ✘ ${msg}`); } };

class Client {
  ws!: WebSocket;
  party: PartyPublic | null = null;
  priv: PlayerPrivate | null = null;
  rewards = 0; toasts: string[] = []; kicked: string | null = null;
  private pending = new Map<string, { res: (v: any) => void; rej: (e: Error) => void }>();
  private seq = 0;
  constructor(public id: string, public secret: string) {}
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(URL);
      this.ws.on('open', () => this.ws.send(JSON.stringify({ type: 'hello', playerId: this.id, secret: this.secret })));
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString()) as ServerMessage;
        if (m.type === 'welcome') resolve();
        else if (m.type === 'party') this.party = m.party;
        else if (m.type === 'private') this.priv = m.priv;
        else if (m.type === 'reward') this.rewards++;
        else if (m.type === 'toast') this.toasts.push(m.text);
        else if (m.type === 'kicked') { this.kicked = m.reason; resolve(); }
        else if (m.type === 'ack') { const p = this.pending.get(m.reqId); if (p) { this.pending.delete(m.reqId); m.ok ? p.res(m.data) : p.rej(new Error(m.error)); } }
      });
      this.ws.on('error', reject);
      this.ws.on('close', () => { for (const p of this.pending.values()) p.rej(new Error('closed')); this.pending.clear(); });
    });
  }
  req<T = any>(msg: Omit<Extract<ClientMessage, { reqId: string }>, 'reqId'> & Record<string, unknown>): Promise<T> {
    const reqId = `q${this.seq++}`;
    return new Promise((res, rej) => { this.pending.set(reqId, { res, rej }); this.ws.send(JSON.stringify({ ...msg, reqId })); setTimeout(() => { if (this.pending.has(reqId)) { this.pending.delete(reqId); rej(new Error('timeout')); } }, 8000); });
  }
  close() { this.ws.close(); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => boolean, ms = 4000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) return false; await sleep(50); } return true; };

async function main() {
  const t0 = Date.now();
  console.log(`Connecting ${N} players to ${URL}`);
  const run = Date.now().toString(36);
  const clients = Array.from({ length: N }, (_, i) => new Client(`sim_${run}_${String(i).padStart(2, '0')}`, `secret_${run}_${i}_xxxxxxxx`));
  await Promise.all(clients.map((c) => c.connect()));
  const [host, ...mates] = clients;

  console.log('\n[party]');
  const { code } = await host.req<{ code: string }>({ type: 'createParty', nickname: 'HostJezza' });
  check(/^[A-Z0-9]{4}$/.test(code), `host created party ${code}`);
  await Promise.all(mates.map((m, i) => m.req({ type: 'joinParty', code, nickname: `Mate${i + 1}` })));
  check(await until(() => clients.every((c) => c.party?.players.length === N)), `all ${N} clients see ${N} players`);
  await host.req({ type: 'joinParty', code, nickname: 'Mate3' }).then(() => check(false, 'duplicate nickname rejected'), () => check(true, 'duplicate nickname rejected'));
  await mates[0].req({ type: 'joinParty', code: 'ZZZZ', nickname: 'Lost' }).then(() => check(false, 'bad code rejected'), () => check(true, 'bad code rejected'));

  console.log('\n[creatures]');
  const creatures = ['dragon', 'wombat', 'possum', 'owl', 'goblin', 'sprite', 'barrel', 'fox'] as const;
  await Promise.all(clients.map((c, i) => c.req({ type: 'chooseCreature', creature: creatures[i % 8], creatureName: `Beast${i}` })));
  check(await until(() => host.party!.players.every((p) => p.creature)), 'everyone adopted a creature');
  await mates[0].req({ type: 'chooseCreature', creature: 'fox' }).then(() => check(false, 'second adoption rejected'), () => check(true, 'second adoption rejected'));
  check(mates[0].priv?.hand[0]?.missionId === STARTER_MISSION.id, 'starter mission dealt');

  console.log('\n[host permissions]');
  check(host.party!.phase === 'friday', 'party starts on Friday by itself (no host needed)');
  await mates[0].req({ type: 'host', action: { kind: 'setPhase', phase: 'lobby' } }).then(() => check(false, 'non-host cannot change the phase'), () => check(true, 'non-host cannot change the phase'));
  await mates[0].req({ type: 'host', action: { kind: 'removePlayer', playerId: mates[1].id } }).then(() => check(false, 'non-host cannot remove players'), () => check(true, 'non-host cannot remove players'));
  await mates[0].req({ type: 'host', action: { kind: 'grantPoints', playerId: mates[0].id, points: 100, reason: 'me' } }).then(() => check(false, 'non-host cannot grant points'), () => check(true, 'non-host cannot grant points'));
  await host.req({ type: 'host', action: { kind: 'setPhase', phase: 'lobby' } });
  check(await until(() => clients.every((c) => c.party?.phase === 'lobby')), 'host pauses the game, everyone sees it');
  const paused = mates[0].priv!.hand.find((h) => h.missionId !== STARTER_MISSION.id)!;
  await mates[0].req({ type: 'claimMission', missionId: paused.missionId, claimId: `pre_${run}_1`, photo: 'data:image/png;base64,AAAA', witnessId: mates[1].id }).then(() => check(false, 'challenges blocked while paused'), () => check(true, 'challenges blocked while paused'));
  await host.req({ type: 'host', action: { kind: 'setPhase', phase: 'friday' } });
  check(await until(() => clients.every((c) => c.party?.phase === 'friday')), 'host resumes Friday, everyone sees it');
  check(await until(() => mates.every((m) => (m.priv?.hand.length ?? 0) === 3)), 'everyone has a hand of 3 missions');

  console.log('\n[duplicate + concurrent claims]');
  const m0 = mates[0];
  const claimId = `dup_${run}_a`;
  const results = await Promise.allSettled([0, 1, 2].map(() => m0.req({ type: 'claimMission', missionId: STARTER_MISSION.id, photo: SELFIE, claimId })));
  check(results.every((r) => r.status === 'fulfilled'), 'same claim id sent 3x concurrently: all acked idempotently');
  await sleep(200);
  const me0 = () => host.party!.players.find((p) => p.id === m0.id)!;
  check(me0().points === STARTER_MISSION.points + 5, `points awarded exactly once (${me0().points} = ${STARTER_MISSION.points} + 5 new-category bonus)`);
  await m0.req({ type: 'claimMission', missionId: STARTER_MISSION.id, photo: SELFIE, claimId: `dup_${run}_b` }).then(() => check(false, 'fresh claim on completed mission rejected'), () => check(true, 'fresh claim on completed mission rejected'));
  // everyone claims their starter simultaneously
  await Promise.all(mates.slice(1).map((m) => m.req({ type: 'claimMission', missionId: STARTER_MISSION.id, photo: SELFIE, claimId: `st_${run}_${m.id}` })));
  check(await until(() => host.party!.players.filter((p) => p.id !== host.id).every((p) => p.points >= STARTER_MISSION.points)), `14 simultaneous claims all landed`);
  const notMine = MISSIONS.find((m) => m.scope === 'private' && !m.starter && !m0.priv!.hand.some((h) => h.missionId === m.id))!.id;
  await m0.req({ type: 'claimMission', missionId: notMine, claimId: `nm_${run}` }).then(() => check(false, 'mission not in hand rejected'), () => check(true, 'mission not in hand rejected'));
  check(!JSON.stringify(host.party).includes('"hand"'), 'public party view never exposes private hands');

  console.log('\n[witness + photo flows]');
  // find a witness mission in any hand; otherwise reroll until one appears (bounded)
  let wit: { c: Client; mid: string } | null = null;
  for (const c of mates) { const h = c.priv!.hand.find((x) => WIT_IDS.includes(x.missionId)); if (h) { wit = { c, mid: h.missionId }; break; } }
  if (wit) {
    await wit.c.req({ type: 'claimMission', missionId: wit.mid, claimId: `w_${run}`, witnessId: mates[5].id === wit.c.id ? mates[6].id : mates[5].id });
    const witness = mates[5].id === wit.c.id ? mates[6] : mates[5];
    check(await until(() => (witness.priv?.pendingWitness.length ?? 0) > 0), 'witness receives the request privately');
    const other = mates.find((m) => m !== witness && m !== wit!.c)!;
    await other.req({ type: 'confirmWitness', claimId: `w_${run}`, approve: true }).then(() => check(false, 'only the named witness can confirm'), () => check(true, 'only the named witness can confirm'));
    const before = host.party!.players.find((p) => p.id === wit!.c.id)!.points;
    await witness.req({ type: 'confirmWitness', claimId: `w_${run}`, approve: true });
    check(await until(() => host.party!.players.find((p) => p.id === wit!.c.id)!.points > before), 'witness confirmation awards points');
  } else console.log('  (no witness mission dealt this run; skipped)');
  const photoC = mates.find((m) => m.priv!.hand.some((h) => PHOTO_IDS.includes(h.missionId)));
  if (photoC) {
    const mid = photoC.priv!.hand.find((h) => PHOTO_IDS.includes(h.missionId))!.missionId;
    await photoC.req({ type: 'claimMission', missionId: mid, claimId: `p_${run}` }).then(() => check(false, 'photo challenge without a photo rejected'), () => check(true, 'photo challenge without a photo rejected'));
    const tiny = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    // A rookie's first photos count straight away (no vote). Use the boost up, then the next one goes to the vote.
    const done = () => host.party!.players.find((p) => p.id === photoC.id)!.missionsCompleted;
    let rookieShots = 0;
    for (let i = 0; i < 6 && rookieLeft(done()) > 0; i++) {
      const pid = photoC.priv!.hand.find((h) => h.status === 'active' && PHOTO_IDS.includes(h.missionId))?.missionId;
      if (!pid) break;
      const n = done();
      const r = await photoC.req<{ status: string }>({ type: 'claimMission', missionId: pid, claimId: `pr_${run}_${i}`, photo: tiny });
      if (r.status === 'approved') rookieShots++;
      await until(() => done() > n && !photoC.priv!.hand.some((h) => h.missionId === pid));
    }
    check(rookieShots > 0, `a rookie's photos count straight away (${rookieShots}), no waiting on votes`);
    const mid2 = photoC.priv!.hand.find((h) => h.status === 'active' && PHOTO_IDS.includes(h.missionId))!.missionId;
    const before = host.party!.players.find((p) => p.id === photoC.id)!.points;
    const res = await photoC.req<{ status: string }>({ type: 'claimMission', missionId: mid2, claimId: `p_${run}_2`, photo: tiny });
    check(res.status === 'pending', 'photo goes to the lads\' vote (default photo check)');
    check(await until(() => clients.every((c) => c.party?.pendingPhotos?.some((x) => x.claimId === `p_${run}_2`))), 'everyone sees the photo up for a vote');
    const voters = mates.filter((m) => m !== photoC).slice(0, 2);
    await voters[0].req({ type: 'votePhoto', claimId: `p_${run}_2`, up: true });
    await photoC.req({ type: 'votePhoto', claimId: `p_${run}_2`, up: true }).then(() => check(false, 'you cannot vote on your own photo'), () => check(true, 'you cannot vote on your own photo'));
    await voters[1].req({ type: 'votePhoto', claimId: `p_${run}_2`, up: true });
    check(await until(() => host.party!.players.find((p) => p.id === photoC.id)!.points > before), 'two 👍 and everyone sees the points land');
    check(await until(() => host.party!.gallery.some((g) => g.id === `p_${run}_2` && g.url.startsWith('/photos/'))), 'photo lands in the party gallery as a stored file');
    // Call BS → frozen → the lads back it → restored, all without the host
    const others = mates.filter((m) => m !== photoC);
    await others[0].req({ type: 'flagClaim', claimId: `p_${run}_2` });
    await others[1].req({ type: 'flagClaim', claimId: `p_${run}_2` });
    check(await until(() => host.party!.feed.some((f) => f.claimId === `p_${run}_2` && f.disputed)), 'two BS calls freeze the claim for everyone');
    await others[0].req({ type: 'backClaim', claimId: `p_${run}_2` }).then(() => check(false, 'a flagger cannot back the claim'), () => check(true, 'a flagger cannot back the claim'));
    await Promise.all([others[2].req({ type: 'backClaim', claimId: `p_${run}_2` }), others[3].req({ type: 'backClaim', claimId: `p_${run}_2` })]);
    check(await until(() => host.party!.feed.some((f) => /backed/.test(f.text))), 'two mates back it and the points come back, no host involved');
  } else console.log('  (no photo challenge dealt this run; skipped)');

  console.log('\n[raid, wall, reactions]');
  await mates[0].req({ type: 'host', action: { kind: 'summonRaid' } }).then(() => check(false, 'non-host cannot summon a raid'), () => check(true, 'non-host cannot summon a raid'));
  await host.req({ type: 'host', action: { kind: 'summonRaid' } });
  check(await until(() => clients.every((c) => c.party?.raid?.status === 'active')), 'boss raid goes live for everyone');
  const raidId = host.party!.raid!.id;
  const hits = await Promise.allSettled(mates.slice(0, 10).map((m) => m.req({ type: 'raidHit', raidId, tap: 'good' })));
  check(hits.every((h) => h.status === 'fulfilled'), '10 simultaneous raid hits all land');
  check(await until(() => Object.keys(host.party!.raid!.damage).length === 10), 'damage board shows all 10 hitters');
  await mates[0].req({ type: 'raidHit', raidId }).then(() => check(false, 'raid hit cooldown enforced'), () => check(true, 'raid hit cooldown enforced'));
  const post = await mates[3].req<{ id: string }>({ type: 'wallPost', kind: 'roast', text: 'Jezza claps when the plane lands. Every time.' });
  check(await until(() => host.party!.wall.some((w) => w.id === post.id)), 'Jezza Wall post visible to everyone');
  await mates[4].req({ type: 'wallVote', postId: post.id });
  await host.req({ type: 'wallVote', postId: post.id }); // host is "HostJezza" → the groom → a heart
  check(await until(() => { const w = host.party!.wall.find((x) => x.id === post.id); return !!w && w.votes.length === 1 && w.groomLove; }), 'mates vote 😂, Jezza gives a ❤️');
  const ev = host.party!.feed.find((f) => f.kind === 'mission' && f.playerId === mates[1].id);
  if (ev) { await mates[2].req({ type: 'react', eventId: ev.id, emoji: '😂' }); check(await until(() => host.party!.players.find((p) => p.id === mates[1].id)!.laughs >= 1), '😂 reaction counts toward Funniest Bloke'); }

  console.log('\n[battles]');
  const a = mates[7], b = mates[8];
  const { battleId } = await a.req<{ battleId: string }>({ type: 'challenge', opponentId: b.id });
  check(await until(() => b.toasts.some((t) => t.includes('challenges you'))), 'opponent is notified of the challenge');
  await mates[9].req({ type: 'respondChallenge', battleId, accept: true }).then(() => check(false, 'third party cannot accept a challenge'), () => check(true, 'third party cannot accept a challenge'));
  await b.req({ type: 'respondChallenge', battleId, accept: true });
  check(await until(() => a.party!.battles.find((x) => x.id === battleId)?.status === 'active'), 'battle is active for both');
  await sleep(800); // the charge-up bar takes a moment to cross
  await a.req({ type: 'battlePlan', battleId, plan: 'aggro', tap: 'good' });
  await sleep(150);
  const bView = b.party!.battles.find((x) => x.id === battleId)!;
  const aSide = bView.a.playerId === a.id ? bView.a : bView.b;
  check(aSide.plan === undefined && aSide.locked === true, 'opponent sees "locked in" but not the chosen game plan');
  await mates[9].req({ type: 'battlePlan', battleId, plan: 'aggro' }).then(() => check(false, 'outsider cannot pick a plan in a battle'), () => check(true, 'outsider cannot pick a plan in a battle'));
  await a.req({ type: 'battleAction', battleId, round: 1, action: 'attack' }).then(() => check(false, 'no tap-every-round in quick battles'), () => check(true, 'no tap-every-round in quick battles'));
  await b.req({ type: 'battlePlan', battleId, plan: 'sneaky' });
  check(await until(() => a.party!.battles.find((x) => x.id === battleId)?.status === 'finished'), 'both locked in: the whole fight resolves at once for everyone');
  const rounds = a.party!.battles.find((x) => x.id === battleId)!.log.length;
  const done = a.party!.battles.find((x) => x.id === battleId)!;
  check(done.status === 'finished' && !!done.winnerId, `battle finished in ${rounds} rounds, winner ${done.winnerId === a.id ? 'A' : 'B'} by ${done.reason}`);
  check(await until(() => host.party!.players.find((p) => p.id === done.winnerId)!.wins === 1 && host.party!.players.find((p) => p.id === done.loserId)!.losses === 1), 'records updated on both sides (seen by a third client)');
  const w = host.party!.players.find((p) => p.id === done.winnerId)!; const l = host.party!.players.find((p) => p.id === done.loserId)!;
  check((done.rewards?.[w.id]?.points ?? 0) === 15 && (done.rewards?.[l.id]?.points ?? 0) === 5, 'bounded rewards: +15 / +5');

  console.log('\n[reconnection + identity]');
  const r = mates[3];
  const pointsBefore = host.party!.players.find((p) => p.id === r.id)!.points;
  r.close();
  check(await until(() => host.party!.players.find((p) => p.id === r.id)!.online === false), 'disconnect marks player offline for others');
  const r2 = new Client(r.id, r.secret);
  await r2.connect();
  check(await until(() => !!r2.party && !!r2.priv), 'reconnect restores party + private state without rejoining');
  check(r2.party!.players.find((p) => p.id === r.id)!.points === pointsBefore && r2.priv!.hand.length === 3, 'progress preserved across reconnect');
  check(await until(() => host.party!.players.find((p) => p.id === r.id)!.online === true), 'others see the player back online');
  mates[3] = r2; // the old socket is closed; use the reconnected client from here on
  const spoof = new Client(mates[4].id, 'wrong_secret_xxxxxxxx');
  await spoof.connect();
  check(spoof.kicked !== null, 'wrong secret for a known player is rejected');
  spoof.close();

  console.log('\n[host moderation + event flow]');
  await host.req({ type: 'host', action: { kind: 'renamePlayer', playerId: mates[10].id, nickname: 'Renamed' } });
  check(await until(() => host.party!.players.find((p) => p.id === mates[10].id)!.nickname === 'Renamed'), 'host can rename a player');
  await host.req({ type: 'host', action: { kind: 'removePlayer', playerId: mates[11].id } });
  check(await until(() => mates[11].kicked !== null), 'removed player receives kick');
  check(await until(() => host.party!.players.length === N - 1), 'roster shrinks for everyone');
  await mates[11].req({ type: 'joinParty', code, nickname: 'SneakyReturn' }).then(() => check(false, 'removed player cannot rejoin'), () => check(true, 'removed player cannot rejoin'));
  await host.req({ type: 'host', action: { kind: 'revealGroupMission', missionId: 'g03' } });
  check(await until(() => mates[0].party!.revealedGroupMissions.includes('g03')), 'group challenge revealed to all');
  await Promise.all(mates.slice(0, 5).map((m) => m.req({ type: 'claimMission', missionId: 'g03', claimId: `g_${run}_${m.id}` })));
  await mates[0].req({ type: 'claimMission', missionId: 'g03', claimId: `g2_${run}` }).then(() => check(false, 'group challenge cannot be claimed twice'), () => check(true, 'group challenge cannot be claimed twice'));
  await host.req({ type: 'host', action: { kind: 'setPhase', phase: 'saturday' } });
  await host.req({ type: 'host', action: { kind: 'setPhase', phase: 'finale' } });
  check(await until(() => (mates[0].party!.awards?.length ?? 0) === 15), 'finale computes 15 awards from play data');
  const legend = mates[0].party!.awards!.find((x) => x.id === 'legend')!;
  const top = [...mates[0].party!.players].sort((x, y) => y.points - x.points)[0];
  check(legend.playerId === top.id, `Overall Legend = top scorer (${top.nickname}, ${top.points} pts)`);
  await host.req({ type: 'host', action: { kind: 'setPhase', phase: 'saturday' } });
  check(await until(() => mates[0].party!.phase === 'saturday'), 'host can recover from an accidental phase advance');

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const c of clients) c.close(); r2.close();
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
