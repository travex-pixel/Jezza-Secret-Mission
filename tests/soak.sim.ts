// The whole weekend in fast-forward: the real engine, 15 lads, Friday 5pm to Sunday lunch (~43 game hours) on a fake
// clock, ticking like the server does. Covers the slow, clock-driven parts a short test can't: auto-battles while
// lads are away, the 5am Saturday switch, raids, EPIC jobs, fight timeouts, group challenges, giveaways with time
// limits, the finale awards and the keepsake. Fails on any crash, stuck fight or bad count.
//   npx tsx tests/soak.sim.ts
import { Engine } from '../shared/engine';
import { seededRng } from '../shared/battle';
import { MISSION_BY_ID } from '../shared/missions';
import { STARTER_COSMETICS } from '../shared/progression';
import { keepsakeCsvs, keepsakeHtml, photoFileNames } from '../shared/keepsake';
import type { Battle } from '../shared/types';

let failures = 0;
const check = (c: unknown, m: string) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };
const SEED = Number(process.env.SOAK_SEED ?? 20261024);
const rand = seededRng(SEED);
const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(rand() * xs.length)];

let t = Date.UTC(2026, 9, 23, 6, 0); // Fri 23 Oct 2026, 5pm Sydney
const END = Date.UTC(2026, 9, 25, 1, 0); // Sun 25 Oct, 12pm Sydney
let photoN = 0;
const eng = new Engine({ now: () => t, rng: seededRng(SEED + 1), storePhoto: (_d, code) => `/photos/${code}_s${(photoN++).toString(36)}_abc.jpeg`, deletePhotos: () => undefined });
const NAMES = ['Travis', 'Jezza', 'Tommo', 'Big Dave', 'Nath', 'Shorty', 'Robbo', 'Lachy', 'Mitch', 'Benno', 'Cam', 'Sully', 'Dazza', 'Kev', 'Woody'];
const ids = NAMES.map((_, i) => `soak_player_${String(i).padStart(2, '0')}`);
ids.forEach((id) => eng.auth(id, 'secret-' + id));
const PHOTO = 'data:image/jpeg;base64,AAAA';
const crashes: string[] = []; const odd: Record<string, number> = {};
let seq = 0;
// Refusals the game gives on purpose; anything else is logged as odd, anything that smells like a code fault is a crash
const EXPECTED = /cooldown|Easy, legend|already|battling|All gone|not in your hand|isn't in your hand|wait|closed|Nothing|gone|full|no longer|expired|Pick a mate|own|limit|today|Give it|Keep it|Too far|after the|first|pinned|You've|You already|swing|Catch your breath|Voting for yourself|scrolled off|Hang on|still|ended|finished|over|out of|sorted|open once|paused|not on that crew|crew|Can't react|Bold|hearts|vote|Slow|done|Only|less than|need|between/i;
function send(id: string, msg: Record<string, unknown>) {
  let r;
  try { r = eng.handle(id, { ...msg, reqId: `s${seq++}` } as any); } catch (e) { crashes.push(`${msg.type}: threw ${(e as Error).message}`); return undefined; }
  if (r.ack && !r.ack.ok) {
    const err = r.ack.error;
    if (/Cannot read|undefined|is not a function|null|NaN|Maximum call stack/.test(err)) crashes.push(`${msg.type}: ${err}`);
    else if (!EXPECTED.test(err)) odd[`${msg.type}: ${err}`] = (odd[`${msg.type}: ${err}`] ?? 0) + 1;
    return undefined;
  }
  return r.ack?.data as any;
}

// ---- Friday 5pm: everyone turns up over the first hour or so (four of them only on Saturday) ----
const code = send(ids[0], { type: 'createParty', nickname: NAMES[0] }).code as string;
const party = () => eng.state.parties[code];
const lateIds = new Set(ids.slice(11));
const online = new Set<string>();
const arrive = (id: string, i: number) => {
  send(id, { type: 'joinParty', code, nickname: NAMES[i] });
  send(id, { type: 'chooseCreature', creature: pick(['dragon', 'wombat', 'possum', 'owl', 'goblin', 'sprite', 'barrel', 'fox'] as const) });
  if (rand() < 0.85) send(id, { type: 'claimMission', missionId: 'm001', claimId: `self_${id}`, photo: PHOTO, avatar: PHOTO });
  send(id, { type: 'wallPost', kind: 'roast', text: `${NAMES[i]} reckons Jezza parallel parks like a group project.` });
  send(id, { type: 'wallPost', kind: 'toast', text: `${NAMES[i]}: to the bloke who turns up when it counts.` });
  online.add(id); eng.setOnline(id, true);
};
arrive(ids[0], 0);

let ticks = 0, actions = 0, hostMoves = 0;
const seenPhase: string[] = [];
const autoBefore = () => Object.values(party().battles).filter((b) => b.auto).length;
const planned = new Set<string>(); const answered = new Set<string>();
let lastTick = t;
while (t < END) {
  t += 5_000;
  // the server ticks every second; every 5 game seconds is plenty for deadlines measured in tens of seconds
  if (t - lastTick >= 5_000) { try { eng.tick(); } catch (e) { crashes.push(`tick: ${(e as Error).message}`); } lastTick = t; ticks++; }
  const p = party();
  if (!seenPhase.includes(p.phase)) seenPhase.push(p.phase);
  const hourSyd = (new Date(t).getUTCHours() + 11) % 24;
  const asleep = hourSyd >= 2 && hourSyd < 8; // 2am to 8am: phones down
  // arrivals: Friday lads in the first 90 minutes, the late four on Saturday morning
  ids.forEach((id, i) => {
    if (p.players[id]) return;
    const due = lateIds.has(id) ? Date.UTC(2026, 9, 23, 23, 0) + i * 600_000 : Date.UTC(2026, 9, 23, 6, 0) + i * 360_000;
    if (t >= due) arrive(id, i);
  });
  // phones come and go (away lads get auto-battled)
  if (rand() < 0.02) for (const id of ids) if (p.players[id]) {
    const want = !asleep && rand() < 0.7;
    if (want !== online.has(id)) { want ? online.add(id) : online.delete(id); eng.setOnline(id, want); }
  }
  // phones answer what lands on them: fights and witness requests
  for (const b of Object.values(p.battles) as Battle[]) {
    if (b.status === 'challenge' && online.has(b.opponentId) && !answered.has(b.id) && rand() < 0.3) { answered.add(b.id); send(b.opponentId, { type: 'respondChallenge', battleId: b.id, accept: rand() > 0.1 }); }
    if (b.status === 'active' && b.quick) for (const pid of [b.a.playerId, b.b.playerId]) {
      const k = `${b.id}:${pid}`;
      if (online.has(pid) && !planned.has(k) && rand() < 0.4) { planned.add(k); send(pid, { type: 'battlePlan', battleId: b.id, plan: pick(['balanced', 'aggro', 'sneaky'] as const), tap: pick(['perfect', 'good', 'ok', 'miss'] as const) }); }
    }
  }
  for (const id of online) for (const w of eng.privateView(p, id)?.pendingWitness ?? []) if (rand() < 0.2) send(id, { type: 'confirmWitness', claimId: w.claimId, approve: rand() > 0.1 });
  if (asleep) continue;
  // a lad does something now and then (roughly every couple of minutes each)
  for (const id of online) {
    if (rand() > 0.04) continue;
    actions++;
    const me = p.players[id]; if (!me?.creature) continue;
    const priv = eng.privateView(p, id)!;
    const hand = priv.hand.filter((h) => h.status === 'active');
    const others = Object.values(p.players).filter((x) => x.id !== id && x.creature && !x.removed);
    const r = rand();
    if (r < 0.40 && hand.length) {
      const m = MISSION_BY_ID[pick(hand)!.missionId]; if (!m || m.wall) continue;
      send(id, { type: 'claimMission', missionId: m.id, claimId: `claim_${seq}`, photo: m.method === 'photo' ? PHOTO : undefined, witnessId: m.method === 'witness' ? pick(others)?.id : undefined });
    } else if (r < 0.50) {
      const f = pick(p.feed.filter((x) => x.kind === 'mission' && x.playerId !== id)); if (f) send(id, { type: 'react', eventId: f.id, emoji: id === p.groomId && rand() < 0.3 ? '❤️' : pick(['😂', '🔥'] as const) });
    } else if (r < 0.58) {
      const v = Object.values(p.claims).find((c) => c.status === 'pending' && c.review === 'vote' && c.playerId !== id && !(c.votesUp ?? []).includes(id) && !(c.votesDown ?? []).includes(id));
      if (v) send(id, { type: 'votePhoto', claimId: v.id, up: rand() > 0.2 });
    } else if (r < 0.78) {
      const o = pick(others.filter((x) => online.has(x.id))); if (o) send(id, { type: 'challenge', opponentId: o.id });
    } else if (r < 0.84) {
      const raid = p.raids[p.raids.length - 1]; if (raid?.status === 'active') send(id, { type: 'raidHit', raidId: raid.id, tap: pick(['perfect', 'good', 'ok'] as const) });
    } else if (r < 0.86) {
      send(id, { type: 'cellarAdd', drink: pick(['Hunter Semillon', 'Cellar door Shiraz', 'Pepsi Max', 'Esky VB']), stars: 1 + Math.floor(rand() * 5), note: 'Notes of oak and regret.' });
    } else if (r < 0.87) {
      const e = pick(p.cellar.filter((x) => x.playerId !== id && !x.fires.includes(id))); if (e) send(id, { type: 'cellarFire', entryId: e.id });
    } else if (r < 0.88) {
      const g = pick(p.revealedGroupMissions.filter((gid) => !me.completedMissionIds.includes(gid)));
      if (g) send(id, { type: 'claimMission', missionId: g, claimId: `group_${seq}`, photo: MISSION_BY_ID[g].method === 'photo' ? PHOTO : undefined });
    } else if (r < 0.92) {
      const e = p.epics.find((x) => x.status === 'open'); if (e) send(id, e.crew.includes(id) ? { type: 'finishEpic', epicId: e.id } : { type: 'joinEpic', epicId: e.id });
    } else if (r < 0.95) {
      const g = p.giveaways.find((x) => x.status === 'active'); if (g) send(id, { type: 'claimGiveaway', giveawayId: g.id });
    } else if (r < 0.95) {
      const post = pick(p.wall.filter((w) => w.playerId !== id)); if (post) send(id, { type: 'wallVote', postId: post.id });
    } else if (r < 0.965) {
      const d = priv.drops[0]; if (d) send(id, { type: 'openDrop', dropId: d.id });
    } else if (r < 0.975) {
      if (p.mole && !p.mole.revealed) { if (priv.mole) send(id, { type: 'moleDone', index: Math.floor(rand() * 3) }); else { const sus = pick(others); if (sus) send(id, { type: 'moleVote', suspectId: sus.id }); } }
    } else {
      const hat = pick(me.unlocked.filter((x) => x.startsWith('hat_'))); send(id, { type: 'equip', equipped: { hat } });
    }
  }
  // the host does a few things across the weekend
  if (rand() < 0.0015) { hostMoves++; send(ids[0], { type: 'host', action: pick([{ kind: 'summonRaid' }, { kind: 'postEpic', presetId: 'mac' }, { kind: 'makeGiveaway', item: pick(['hat_viking', 'face_mo', 'aura_rainbow']), qty: 3, minutes: 20 }, { kind: 'revealGroupMission', missionId: pick(['g01', 'g02', 'g04']) }])! }); }
}

// ---- Sunday lunch: finale (the host makes the one judgement call) ----
send(ids[0], { type: 'host', action: { kind: 'setPhase', phase: 'finale' } });
send(ids[0], { type: 'host', action: { kind: 'setAward', awardId: 'unhinged', playerId: ids[6] } });
send(ids[0], { type: 'host', action: { kind: 'revealMole' } });
for (let i = 0; i < 40; i++) { t += 5_000; eng.tick(); }
const p = party();
const keep = eng.keepsake(p);
const names = photoFileNames(keep);
const html = keepsakeHtml(keep, (i) => `photos/${names[i]}`, '');
const csvs = keepsakeCsvs(keep, names);

console.log(`\nSimulated ${((END - Date.UTC(2026, 9, 23, 6, 0)) / 3600_000).toFixed(0)} game hours: ${ticks} ticks, ${actions} player actions, ${hostMoves} host moves`);
const battles = Object.values(p.battles) as Battle[];
const settled = battles.filter((b) => b.rewards);
const autos = battles.filter((b) => b.auto).length;
const players = Object.values(p.players).filter((x) => !x.removed);
const wins = players.reduce((n, x) => n + x.wins, 0), losses = players.reduce((n, x) => n + x.losses, 0);
console.log(`  ${battles.length} battles (${autos} auto while away, ${battles.filter((b) => b.status === 'expired').length} challenges expired, ${battles.filter((b) => b.reason === 'timeout').length} decided by the clock) · ${p.raids.length} raids · ${p.epics.length} EPIC jobs · ${p.giveaways.length} giveaways · ${keep.photos.length} photos · ${keep.wall.length} wall posts`);
console.log(`  board: ${players.slice().sort((a, b) => b.points - a.points).map((x) => `${x.nickname} ${x.points}`).join(', ')}`);
console.log(`  levels: ${players.map((x) => x.level).sort((a, b) => a - b).join(' ')}`);
const oddList = Object.entries(odd).sort((a, b) => b[1] - a[1]);
if (oddList.length) console.log(`  other refusals: ${oddList.slice(0, 8).map(([e, n]) => `${n}× ${e}`).join(' | ')}`);

check(crashes.length === 0, `no crashes in ${ticks + seq} engine calls${crashes.length ? `: ${[...new Set(crashes)].slice(0, 4).join(' | ')}` : ''}`);
check(seenPhase.includes('saturday') && p.autoSaturdayAt === null, `Saturday started on its own at 5am (phases: ${seenPhase.join(' → ')})`);
check(autos > 0, `lads who were away got auto-battled (${autos})`);
// (the server tidies away finished fights older than 6 hours, so count wins against losses, not against the fights on file)
check(wins > 200 && wins === losses && battles.filter((b) => b.status === 'finished').every((b) => b.rewards), `${wins} fights each counted exactly once (${wins} wins, ${losses} losses; ${settled.length} still on file, all settled)`);
check(battles.every((b) => b.status !== 'active'), 'no fight left hanging at the end');
check(battles.filter((b) => b.status === 'finished').every((b) => b.winnerId && b.loserId && b.winnerId !== b.loserId), 'every finished fight has a winner and a loser');
check(p.raids.length >= 2, `raids happened (${p.raids.length})`);
check(players.every((x) => x.level >= 1 && x.level <= 15 && x.xp >= 0 && Number.isFinite(x.points)), 'every creature has a sane level, XP and score');
check(players.every((x) => x.unlocked.length === new Set(x.unlocked).size && STARTER_COSMETICS.every((s) => x.unlocked.includes(s))), 'no duplicate items; everyone still has the starter kit');
check(p.giveaways.every((g) => g.claims.length <= g.qty && new Set(g.claims.map((c) => c.playerId)).size === g.claims.length && g.status !== 'active'), 'giveaways never over-handed and all closed by the end');
check(lateIds.size === [...lateIds].filter((id) => p.players[id]?.catchUp).length, 'the four Saturday arrivals got Fresh Legs');
const drops = players.flatMap((x) => x.drops); const opened = drops.filter((d) => d.opened);
console.log(`  drops: ${drops.length} earned, ${opened.length} opened · rarities ${['common', 'rare', 'epic', 'legendary'].map((r) => `${r} ${drops.filter((d) => d.rarity === r).length}`).join(', ')} · quests done ${players.reduce((n, x) => n + x.quests.filter((q) => q.done).length, 0)}/${players.reduce((n, x) => n + x.quests.length, 0)} · moles ${p.mole?.revealed ? p.mole.moles.map((m) => `${m.playerId.slice(-3)} ${p.mole!.caught?.[m.playerId] ? 'caught' : 'escaped'}`).join(', ') : 'none'}`);
check(drops.length > 50 && drops.some((d) => d.rarity === 'legendary'), `drops flowed all weekend and a legendary turned up (${drops.length})`);
check(players.every((x) => x.quests.length === 3) && players.some((x) => x.quests.some((q) => q.done)), 'everyone had quests and some got done');
check(!!p.mole?.revealed, 'the Mole was revealed at the finale');
check(players.filter((x) => x.morningDrop === 'saturday').length >= players.length - 2 && players.every((x) => x.drops.filter((d) => d.source === 'morning').length <= 1), `the wake-up drop landed once each (${players.filter((x) => x.morningDrop === 'saturday').length}/${players.length})`);
check(players.every((x) => x.drops.every((d) => !d.item || !d.opened || x.unlocked.includes(d.item))), 'every opened drop item is actually owned');
const awards = eng.publicView(p).awards;
const empty = awards.filter((a) => !a.playerId).map((a) => a.name);
check(awards.length === 15 && empty.length <= 1, `finale: ${awards.length} awards, ${awards.length - empty.length} with a winner${empty.length ? ` (no winner: ${empty.join(', ')})` : ''}`);
check(html.includes('The Jezza Wall') && csvs['leaderboard.csv'].split('\r\n').length > 15, 'the keepsake builds from a full weekend');
const roundTrip = new Engine({ now: () => t }, JSON.parse(JSON.stringify(eng.state)));
check(JSON.stringify(roundTrip.publicView(roundTrip.state.parties[code]).players.map((x) => x.points)) === JSON.stringify(eng.publicView(p).players.map((x) => x.points)), 'saving and loading the whole weekend keeps every score');

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nSOAK PASSED');
process.exit(failures ? 1 : 0);
