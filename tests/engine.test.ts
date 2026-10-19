import { describe, it, expect } from 'vitest';
import { Engine, HONOUR_COOLDOWN_MS } from '../shared/engine';
import { seededRng } from '../shared/battle';
import { STARTER_MISSION, MISSIONS } from '../shared/missions';
const SELFIE = 'data:image/jpeg;base64,c2VsZmll'; // the first challenge is a selfie
const SELF = MISSIONS.filter((m) => m.method === 'self' && !m.starter && m.scope === 'private');
const PHOTO_M = MISSIONS.filter((m) => m.method === 'photo' && m.scope === 'private' && !m.starter);
const WIT = MISSIONS.filter((m) => m.method === 'witness');

function setup(n = 15) {
  let t = 1_000_000;
  const eng = new Engine({ now: () => t, rng: seededRng(42) });
  const ids = Array.from({ length: n }, (_, i) => `player_${String(i).padStart(3, '0')}`);
  for (const id of ids) expect(eng.auth(id, 'secret-' + id)).toBe(true);
  const r = eng.handle(ids[0], { type: 'createParty', reqId: '1', nickname: 'Hosty' });
  expect(r.ack?.ok).toBe(true);
  const code = (r.ack as any).data.code as string;
  for (let i = 1; i < n; i++) expect(eng.handle(ids[i], { type: 'joinParty', reqId: 'j', code, nickname: `Mate${i}` }).ack?.ok).toBe(true);
  const creatures = ['dragon', 'wombat', 'possum', 'owl', 'goblin', 'sprite', 'barrel', 'fox'] as const;
  ids.forEach((id, i) => expect(eng.handle(id, { type: 'chooseCreature', reqId: 'c', creature: creatures[i % 8] }).ack?.ok).toBe(true));
  eng.state.parties[code].photoMode = 'instant'; // the vote/host photo modes have their own tests
  return { eng, ids, code, party: () => eng.state.parties[code], advance: (ms: number) => { t += ms; } };
}

describe('engine', () => {
  it('rejects a bad secret for a known player', () => {
    const eng = new Engine();
    expect(eng.auth('player_abc_123', 'secret-one-1')).toBe(true);
    expect(eng.auth('player_abc_123', 'secret-two-2')).toBe(false);
  });
  it('seats 15 players with creatures and the starter mission', () => {
    const { eng, ids, party } = setup();
    expect(party().players[ids[14]].hand[0].missionId).toBe(STARTER_MISSION.id);
    expect(eng.publicView(party(), ids[0]).players.length).toBe(15);
  });
  it('starter mission claims are idempotent and cannot be double-claimed', () => {
    const { eng, ids, party } = setup();
    const a = eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, photo: SELFIE, claimId: 'claim-0001' });
    expect(a.ack?.ok).toBe(true);
    const p = party().players[ids[1]];
    const first = p.points;
    expect(first).toBeGreaterThanOrEqual(STARTER_MISSION.points);
    const dup = eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, photo: SELFIE, claimId: 'claim-0001' });
    expect(dup.ack?.ok).toBe(true); expect((dup.ack as any).data.duplicate).toBe(true);
    const again = eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, photo: SELFIE, claimId: 'claim-0002' });
    expect(again.ack?.ok).toBe(false);
    expect(party().players[ids[1]].points).toBe(first);
    expect(p.achievements).toContain('first_blood');
  });
  it('parties start on Friday by themselves; non-hosts cannot run host actions', () => {
    const { eng, ids, party } = setup();
    expect(party().phase).toBe('friday');
    expect(party().players[ids[3]].hand.length).toBe(3);
    expect(eng.handle(ids[3], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'lobby' } }).ack?.ok).toBe(false);
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'lobby' } }).ack?.ok).toBe(true);
    party().players[ids[3]].hand.push({ missionId: SELF[0].id, assignedAt: 0, status: 'active' });
    expect(eng.handle(ids[3], { type: 'claimMission', reqId: 'x', missionId: SELF[0].id, claimId: 'claim-pre-1' }).ack?.ok).toBe(false);
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } });
    const notInHand = MISSIONS.find((m) => m.scope === 'private' && !m.starter && !party().players[ids[3]].hand.some((h) => h.missionId === m.id))!;
    expect(eng.handle(ids[3], { type: 'claimMission', reqId: 'x', missionId: notInHand.id, claimId: 'claim-nih-1' }).ack?.ok).toBe(false);
    expect(JSON.stringify(eng.publicView(party(), ids[5]))).not.toContain('"hand"');
  });
  it('witness claims wait for the named mate; photo claims pay out straight away in instant mode', () => {
    const { eng, ids, party } = setup();
    const p = party().players[ids[2]];
    p.hand = [{ missionId: WIT[0].id, assignedAt: 0, status: 'active' }, { missionId: PHOTO_M[0].id, assignedAt: 0, status: 'active' }];
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: WIT[0].id, claimId: 'claim-w-0001' }).ack?.ok).toBe(false);
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: WIT[0].id, claimId: 'claim-w-0002', witnessId: ids[2] }).ack?.ok).toBe(false);
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: WIT[0].id, claimId: 'claim-w-0003', witnessId: ids[4] }).ack?.ok).toBe(true);
    expect(party().players[ids[2]].points).toBe(0);
    expect(eng.handle(ids[5], { type: 'confirmWitness', reqId: 'c', claimId: 'claim-w-0003', approve: true }).ack?.ok).toBe(false);
    expect(eng.privateView(party(), ids[4])!.pendingWitness.length).toBe(1);
    expect(eng.handle(ids[4], { type: 'confirmWitness', reqId: 'c', claimId: 'claim-w-0003', approve: true }).ack?.ok).toBe(true);
    const afterWitness = party().players[ids[2]].points;
    expect(afterWitness).toBeGreaterThanOrEqual(WIT[0].points);
    expect(party().players[ids[4]].witnessed).toBe(1);
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: PHOTO_M[0].id, claimId: 'claim-p-0001' }).ack?.ok).toBe(false);
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: PHOTO_M[0].id, claimId: 'claim-p-0002', photo: 'data:image/jpeg;base64,AAAA' }).ack?.ok).toBe(true);
    expect(party().players[ids[2]].points).toBeGreaterThanOrEqual(afterWitness + PHOTO_M[0].points);
    expect(eng.hostView(party()).approvals.length).toBe(0); // no host needed
    expect(party().feed.some((f) => f.photoUrl)).toBe(true);
  });
  it('quick battles: challenge, accept, pick a plan, the fight plays itself; rewards and timeouts', () => {
    const { eng, ids, party, advance } = setup();
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } });
    expect(eng.handle(ids[1], { type: 'challenge', reqId: 'b', opponentId: ids[1] }).ack?.ok).toBe(false);
    const ch = eng.handle(ids[1], { type: 'challenge', reqId: 'b', opponentId: ids[2] });
    expect(ch.ack?.ok).toBe(true);
    const battleId = (ch.ack as any).data.battleId as string;
    expect(eng.handle(ids[3], { type: 'respondChallenge', reqId: 'r', battleId, accept: true }).ack?.ok).toBe(false); // third party
    expect(eng.handle(ids[2], { type: 'respondChallenge', reqId: 'r', battleId, accept: true }).ack?.ok).toBe(true);
    let b = party().battles[battleId];
    expect(b.status).toBe('active'); expect(b.quick).toBe(true);
    // no more tap-every-round
    expect(eng.handle(ids[1], { type: 'battleAction', reqId: 'a', battleId, round: 1, action: 'attack' }).ack?.ok).toBe(false);
    expect(eng.handle(ids[3], { type: 'battlePlan', reqId: 'p', battleId, plan: 'aggro' }).ack?.ok).toBe(false); // outsider
    expect(eng.handle(ids[1], { type: 'battlePlan', reqId: 'p', battleId, plan: 'nonsense' as any }).ack?.ok).toBe(false);
    advance(1500);
    eng.handle(ids[1], { type: 'battlePlan', reqId: 'p', battleId, plan: 'aggro', tap: 'perfect' });
    // opponent sees "locked in" but not the plan
    const view = eng.publicView(party(), ids[2]).battles.find((x) => x.id === battleId)!;
    expect(view.a.plan).toBeUndefined(); expect(view.a.locked).toBe(true);
    expect(party().battles[battleId].status).toBe('active');
    eng.handle(ids[2], { type: 'battlePlan', reqId: 'p', battleId, plan: 'sneaky' });
    b = party().battles[battleId];
    expect(b.status).toBe('finished'); // both locked in → resolved at once with the normal round resolver
    expect(b.log.length).toBeGreaterThanOrEqual(1); expect(b.log.length).toBeLessThanOrEqual(7);
    expect(b.a.charge).toBe('perfect'); expect(b.b.charge).toBe('miss');
    expect(b.log.every((r) => r.a.action === 'counter' || r.a.tap === 'perfect')).toBe(true); // the charge applies to every swing
    const w = party().players[b.winnerId!]; const l = party().players[b.loserId!];
    expect(w.wins).toBe(1); expect(l.losses).toBe(1);
    expect(w.points).toBe(20); // 15 battle + 5 'first_win' achievement
    expect(l.points).toBe(5);
    // once it's over, both plans are public for the replay
    expect(eng.publicView(party(), ids[2]).battles.find((x) => x.id === battleId)!.a.plan).toBe('aggro');
    // nobody picks: after the timer both go Balanced and it still resolves (no forfeits, no one stuck)
    const id2 = (eng.handle(ids[5], { type: 'challenge', reqId: 'b', opponentId: ids[6] }).ack as any).data.battleId as string;
    eng.handle(ids[6], { type: 'respondChallenge', reqId: 'r', battleId: id2, accept: true });
    advance(19_000); eng.tick();
    expect(party().battles[id2].status).toBe('active');
    advance(2_000); eng.tick();
    expect(party().battles[id2].status).toBe('finished');
    expect(party().battles[id2].a.plan).toBe('balanced');
    expect(party().battles[id2].rewards).toBeTruthy();
  });
  it('host can remove players, reset claims and advance/recover phases; awards are computed from data', () => {
    const { eng, ids, party } = setup();
    eng.handle(ids[9], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, photo: SELFIE, claimId: 'claim-s-0009' });
    const earned = party().players[ids[9]].points;
    expect(earned).toBeGreaterThanOrEqual(10);
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'resetClaim', playerId: ids[9], missionId: STARTER_MISSION.id } }).ack?.ok).toBe(true);
    expect(party().players[ids[9]].points).toBe(earned - STARTER_MISSION.points);
    const kick = eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'removePlayer', playerId: ids[10] } });
    expect(kick.ack?.ok).toBe(true);
    expect(kick.direct.some((d) => d.to === ids[10] && d.msg.type === 'kicked')).toBe(true);
    expect(eng.publicView(party()).players.length).toBe(14);
    expect(eng.handle(ids[10], { type: 'joinParty', reqId: 'j', code: party().code, nickname: 'Sneaky' }).ack?.ok).toBe(false);
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'saturday' } });
    expect(party().fridayPoints).toBeTruthy();
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } }); // recover
    expect(party().phase).toBe('friday');
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'finale' } });
    const view = eng.publicView(party());
    expect(view.awards.length).toBe(15);
    expect(view.awards!.find((a) => a.id === 'unhinged')!.playerId).toBeNull();
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setAward', awardId: 'unhinged', playerId: ids[3] } });
    expect(eng.publicView(party()).awards!.find((a) => a.id === 'unhinged')!.playerId).toBe(ids[3]);
  });
  it('state survives a JSON round trip (persistence)', () => {
    const { eng, code } = setup(5);
    const copy = new Engine({}, JSON.parse(JSON.stringify(eng.state)));
    expect(copy.publicView(copy.state.parties[code]).players.length).toBe(5);
  });
  it('honour-system claims are rate limited; photo/witness/starter are exempt', () => {
    const { eng, ids, party, advance } = setup();
    const p = party().players[ids[2]];
    p.hand = [{ missionId: STARTER_MISSION.id, assignedAt: 0, status: 'active' }, { missionId: SELF[0].id, assignedAt: 0, status: 'active' }, { missionId: SELF[1].id, assignedAt: 0, status: 'active' }, { missionId: PHOTO_M[0].id, assignedAt: 0, status: 'active' }];
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, photo: SELFIE, claimId: 'cd-starter-01' }).ack?.ok).toBe(true);
    p.missionsCompleted = 10; // past the rookie boost: rookies skip the cooldown
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: SELF[0].id, claimId: 'cd-self-01' }).ack?.ok).toBe(true);
    const second = eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: SELF[1].id, claimId: 'cd-self-02' });
    expect(second.ack?.ok).toBe(false);
    expect((second.ack as any).error).toMatch(/Next honour-system claim/);
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: PHOTO_M[0].id, claimId: 'cd-photo-01', photo: 'data:image/jpeg;base64,AAAA' }).ack?.ok).toBe(true);
    expect(eng.privateView(party(), ids[2])!.honourCooldownUntil).toBeGreaterThan(1_000_000);
    advance(HONOUR_COOLDOWN_MS + 1);
    if (!party().players[ids[2]].hand.some((h) => h.missionId === SELF[1].id)) party().players[ids[2]].hand.push({ missionId: SELF[1].id, assignedAt: 0, status: 'active' });
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: SELF[1].id, claimId: 'cd-self-03' }).ack?.ok).toBe(true);
  });
  it('Call BS: two mates freeze the points, the host rules, the owner cannot self-flag', () => {
    const { eng, ids, party } = setup();
    eng.handle(ids[4], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, photo: SELFIE, claimId: 'bs-claim-01' });
    const before = party().players[ids[4]].points;
    expect(before).toBeGreaterThan(0);
    expect(eng.handle(ids[4], { type: 'flagClaim', reqId: 'f', claimId: 'bs-claim-01' }).ack?.ok).toBe(false);
    expect(eng.handle(ids[5], { type: 'flagClaim', reqId: 'f', claimId: 'bs-claim-01' }).ack?.ok).toBe(true);
    expect(eng.handle(ids[5], { type: 'flagClaim', reqId: 'f', claimId: 'bs-claim-01' }).ack?.ok).toBe(false); // once each
    expect(party().players[ids[4]].points).toBe(before);
    const ev = party().feed.find((f) => f.claimId === 'bs-claim-01')!;
    expect(ev.flags).toBe(1);
    const r = eng.handle(ids[6], { type: 'flagClaim', reqId: 'f', claimId: 'bs-claim-01' });
    expect(r.ack?.ok).toBe(true);
    expect(party().claims['bs-claim-01'].status).toBe('disputed');
    expect(party().players[ids[4]].points).toBe(before - STARTER_MISSION.points);
    expect(party().players[ids[4]].missionsCompleted).toBe(0);
    expect(eng.hostView(party()).approvals.some((c) => c.id === 'bs-claim-01')).toBe(true);
    expect(eng.publicView(party()).pendingApprovals).toBe(1);
    // host upholds → points restored
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'resolveClaim', claimId: 'bs-claim-01', approve: true } }).ack?.ok).toBe(true);
    expect(party().players[ids[4]].points).toBe(before);
    expect(party().claims['bs-claim-01'].status).toBe('approved');
    // a struck-out claim stays gone
    eng.handle(ids[7], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, photo: SELFIE, claimId: 'bs-claim-02' });
    const before7 = party().players[ids[7]].points;
    eng.handle(ids[5], { type: 'flagClaim', reqId: 'f', claimId: 'bs-claim-02' }); eng.handle(ids[6], { type: 'flagClaim', reqId: 'f', claimId: 'bs-claim-02' });
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'resolveClaim', claimId: 'bs-claim-02', approve: false } });
    expect(party().players[ids[7]].points).toBe(before7 - STARTER_MISSION.points);
    expect(party().claims['bs-claim-02'].status).toBe('rejected');
  });
  it('charge-up tap: one reported faster than the bar can slide is downgraded', () => {
    const { eng, ids, party, advance } = setup();
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } });
    const id = (eng.handle(ids[1], { type: 'challenge', reqId: 'b', opponentId: ids[2] }).ack as any).data.battleId as string;
    eng.handle(ids[2], { type: 'respondChallenge', reqId: 'r', battleId: id, accept: true });
    eng.handle(ids[1], { type: 'battlePlan', reqId: 'p', battleId: id, plan: 'balanced', tap: 'perfect' }); // instant: not plausible
    expect(party().battles[id].a.charge).toBe('miss');
    advance(1500);
    eng.handle(ids[2], { type: 'battlePlan', reqId: 'p', battleId: id, plan: 'balanced', tap: 'good' });
    expect(party().battles[id].b.charge).toBe('good');
    expect(party().battles[id].log.every((r) => r.b.action === 'counter' ? r.b.tap === 'miss' : r.b.tap === 'good')).toBe(true); // counter never taps
    // graded: the exact accuracy is kept, and a cheeky out-of-range number is clamped
    const id2 = (eng.handle(ids[3], { type: 'challenge', reqId: 'b', opponentId: ids[4] }).ack as any).data.battleId as string;
    eng.handle(ids[4], { type: 'respondChallenge', reqId: 'r', battleId: id2, accept: true });
    advance(1000);
    eng.handle(ids[3], { type: 'battlePlan', reqId: 'p', battleId: id2, plan: 'aggro', power: 0.83 });
    eng.handle(ids[4], { type: 'battlePlan', reqId: 'p', battleId: id2, plan: 'aggro', power: 7 });
    expect(party().battles[id2].a.chargePower).toBeCloseTo(0.83);
    expect(party().battles[id2].b.chargePower).toBe(1);
  });
  it('host PIN: claim from another phone, wrong guesses are limited and reported', () => {
    let t = 5_000_000;
    const eng = new Engine({ now: () => t, rng: seededRng(9) });
    const ids = ['host_phone_0001', 'new_phone_00002', 'cheeky_mate_003'];
    ids.forEach((id) => eng.auth(id, 'secret-' + id));
    expect(eng.handle(ids[0], { type: 'createParty', reqId: '1', nickname: 'Travis', hostPin: '12' }).ack?.ok).toBe(false); // too short
    const code = (eng.handle(ids[0], { type: 'createParty', reqId: '1', nickname: 'Travis', hostPin: '4821' }).ack as any).data.code as string;
    const party = eng.state.parties[code];
    expect(party.hostPinHash).toBeTruthy();
    expect(JSON.stringify(eng.publicView(party))).not.toContain('4821');
    expect(eng.publicView(party).hasHostPin).toBe(true);
    eng.handle(ids[1], { type: 'joinParty', reqId: 'j', code, nickname: 'Travis2' });
    eng.handle(ids[2], { type: 'joinParty', reqId: 'j', code, nickname: 'Cheeky' });
    // wrong guesses: reported to host, limited to 5 per player per 10 min
    const wrong = eng.handle(ids[2], { type: 'claimHost', reqId: 'c', pin: '0000' });
    expect(wrong.ack?.ok).toBe(false);
    expect(wrong.direct.some((d) => d.to === ids[0] && d.msg.type === 'toast')).toBe(true);
    for (let i = 0; i < 4; i++) eng.handle(ids[2], { type: 'claimHost', reqId: 'c', pin: '1111' });
    const locked = eng.handle(ids[2], { type: 'claimHost', reqId: 'c', pin: '4821' });
    expect((locked.ack as any).error).toMatch(/Too many wrong PINs/);
    expect(party.hostId).toBe(ids[0]);
    // the real host on a new phone gets in
    expect(eng.handle(ids[1], { type: 'claimHost', reqId: 'c', pin: '4821' }).ack?.ok).toBe(true);
    expect(party.hostId).toBe(ids[1]);
    expect(party.players[ids[0]].isHost).toBe(false);
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } }).ack?.ok).toBe(false); // old phone lost host
    // new host can change the PIN; lockout expires after 10 minutes
    expect(eng.handle(ids[1], { type: 'host', reqId: 'h', action: { kind: 'setHostPin', pin: '777777' } }).ack?.ok).toBe(true);
    t += 10 * 60_000 + 1;
    expect(eng.handle(ids[2], { type: 'claimHost', reqId: 'c', pin: '4821' }).ack?.ok).toBe(false); // old PIN no longer works
    expect(eng.handle(ids[2], { type: 'claimHost', reqId: 'c', pin: '777777' }).ack?.ok).toBe(true);
  });
  it('leaving a party lets the host start a fresh room', () => {
    const eng = new Engine();
    eng.auth('host_phone_0001', 'secret-host');
    const first = (eng.handle('host_phone_0001', { type: 'createParty', reqId: '1', nickname: 'Travis' }).ack as any).data.code;
    expect(eng.handle('host_phone_0001', { type: 'leaveParty', reqId: '2' }).ack?.ok).toBe(true);
    expect(eng.partyOf('host_phone_0001')).toBeUndefined();
    const second = (eng.handle('host_phone_0001', { type: 'createParty', reqId: '3', nickname: 'Travis' }).ack as any).data.code;
    expect(second).not.toBe(first);
    expect(eng.partyOf('host_phone_0001')?.code).toBe(second);
  });
});

describe('the groom\'s Golden Stag', () => {
  it('only the groom can have it, and the groom always gets it', () => {
    let t = 1_000_000;
    const eng = new Engine({ now: () => t, rng: seededRng(7) });
    const [host, jezza, mate] = ['player_host_0001', 'player_jezz_0001', 'player_mate_0001'];
    for (const id of [host, jezza, mate]) eng.auth(id, 'secret-' + id);
    const code = (eng.handle(host, { type: 'createParty', reqId: '1', nickname: 'Travis' }).ack as any).data.code;
    eng.handle(jezza, { type: 'joinParty', reqId: 'j', code, nickname: 'Jezza' });
    eng.handle(mate, { type: 'joinParty', reqId: 'j', code, nickname: 'Big Dave' });
    expect(eng.handle(mate, { type: 'chooseCreature', reqId: 'c', creature: 'stag' }).ack?.ok).toBe(false);
    expect(eng.handle(jezza, { type: 'chooseCreature', reqId: 'c', creature: 'dragon' }).ack?.ok).toBe(true);
    const party = eng.state.parties[code];
    expect(party.players[jezza].creature).toBe('stag');
    expect(party.players[jezza].creatureName).toBe('Goldhorn');
  });
  it('setting the groom transforms his creature, and moving the title gives the old one back', () => {
    const { eng, ids, party } = setup(4);
    const before = party().players[ids[2]].creature;
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setGroom', playerId: ids[2] } });
    expect(party().players[ids[2]].creature).toBe('stag');
    expect(party().feed.some((f) => f.text.includes('GOLDEN STAG'))).toBe(true);
    expect('creatureBefore' in eng.publicView(party(), ids[1]).players.find((p) => p.id === ids[2])!).toBe(false);
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setGroom', playerId: ids[3] } });
    expect(party().players[ids[2]].creature).toBe(before);
    expect(party().players[ids[3]].creature).toBe('stag');
    expect(Object.values(party().players).filter((p) => p.creature === 'stag').length).toBe(1);
  });
  it('an older save where Jezza already adopted something gets the Stag on load', () => {
    const { eng, ids, party } = setup(3);
    party().groomId = ids[1];
    const again = new Engine({ now: () => 2_000_000 }, eng.state);
    expect(again.state.parties[party().code].players[ids[1]].creature).toBe('stag');
  });
});
