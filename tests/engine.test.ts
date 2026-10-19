import { describe, it, expect } from 'vitest';
import { Engine, HONOUR_COOLDOWN_MS } from '../shared/engine';
import { seededRng } from '../shared/battle';
import { STARTER_MISSION, MISSIONS } from '../shared/missions';

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
    const a = eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, claimId: 'claim-0001' });
    expect(a.ack?.ok).toBe(true);
    const p = party().players[ids[1]];
    expect(p.points).toBe(STARTER_MISSION.points);
    const dup = eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, claimId: 'claim-0001' });
    expect(dup.ack?.ok).toBe(true); expect((dup.ack as any).data.duplicate).toBe(true);
    const again = eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, claimId: 'claim-0002' });
    expect(again.ack?.ok).toBe(false);
    expect(party().players[ids[1]].points).toBe(STARTER_MISSION.points);
    expect(p.achievements).toContain('first_blood');
  });
  it('non-hosts cannot run host actions; hands fill when Friday starts', () => {
    const { eng, ids, party } = setup();
    expect(eng.handle(ids[3], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } }).ack?.ok).toBe(false);
    expect(party().phase).toBe('lobby');
    // a non-starter mission is blocked before the event starts
    expect(eng.handle(ids[3], { type: 'claimMission', reqId: 'x', missionId: 'm013', claimId: 'claim-pre-1' }).ack?.ok).toBe(false);
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } }).ack?.ok).toBe(true);
    expect(party().players[ids[3]].hand.length).toBe(3);
    // missions not in hand cannot be claimed
    const notInHand = MISSIONS.find((m) => m.scope === 'private' && !m.starter && !party().players[ids[3]].hand.some((h) => h.missionId === m.id))!;
    expect(eng.handle(ids[3], { type: 'claimMission', reqId: 'x', missionId: notInHand.id, claimId: 'claim-nih-1' }).ack?.ok).toBe(false);
    // secret missions never appear in the public view
    const view = JSON.stringify(eng.publicView(party(), ids[5]));
    expect(view).not.toContain('"hand"');
  });
  it('witness and photo claims stay pending until confirmed; host approves photos', () => {
    const { eng, ids, party } = setup();
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } });
    // force a witness mission into hand
    const p = party().players[ids[2]];
    p.hand = [{ missionId: 'm011', assignedAt: 0, status: 'active' }, { missionId: 'm070', assignedAt: 0, status: 'active' }];
    const noWitness = eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'm011', claimId: 'claim-w-0001' });
    expect(noWitness.ack?.ok).toBe(false);
    const selfWitness = eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'm011', claimId: 'claim-w-0002', witnessId: ids[2] });
    expect(selfWitness.ack?.ok).toBe(false);
    const w = eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'm011', claimId: 'claim-w-0003', witnessId: ids[4] });
    expect(w.ack?.ok).toBe(true);
    expect(party().players[ids[2]].points).toBe(0);
    // only the named witness can confirm
    expect(eng.handle(ids[5], { type: 'confirmWitness', reqId: 'c', claimId: 'claim-w-0003', approve: true }).ack?.ok).toBe(false);
    expect(eng.privateView(party(), ids[4])!.pendingWitness.length).toBe(1);
    expect(eng.handle(ids[4], { type: 'confirmWitness', reqId: 'c', claimId: 'claim-w-0003', approve: true }).ack?.ok).toBe(true);
    expect(party().players[ids[2]].points).toBe(10);
    expect(party().players[ids[4]].witnessed).toBe(1);
    // photo
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'm070', claimId: 'claim-p-0001' }).ack?.ok).toBe(false);
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'm070', claimId: 'claim-p-0002', photo: 'data:image/jpeg;base64,AAAA' }).ack?.ok).toBe(true);
    expect(eng.hostView(party()).approvals.length).toBe(1);
    expect(eng.handle(ids[7], { type: 'host', reqId: 'h', action: { kind: 'resolveClaim', claimId: 'claim-p-0002', approve: true } }).ack?.ok).toBe(false);
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'resolveClaim', claimId: 'claim-p-0002', approve: true } }).ack?.ok).toBe(true);
    expect(party().players[ids[2]].points).toBe(20);
    expect(party().feed.some((f) => f.photoUrl)).toBe(true);
  });
  it('battles: challenge, accept, server-resolved rounds, bounded rewards, timeouts', () => {
    const { eng, ids, party, advance } = setup();
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } });
    expect(eng.handle(ids[1], { type: 'challenge', reqId: 'b', opponentId: ids[1] }).ack?.ok).toBe(false);
    const ch = eng.handle(ids[1], { type: 'challenge', reqId: 'b', opponentId: ids[2] });
    expect(ch.ack?.ok).toBe(true);
    const battleId = (ch.ack as any).data.battleId as string;
    // third party cannot accept
    expect(eng.handle(ids[3], { type: 'respondChallenge', reqId: 'r', battleId, accept: true }).ack?.ok).toBe(false);
    expect(eng.handle(ids[2], { type: 'respondChallenge', reqId: 'r', battleId, accept: true }).ack?.ok).toBe(true);
    let b = party().battles[battleId];
    expect(b.status).toBe('active');
    // opponent view must not leak the pending action
    eng.handle(ids[1], { type: 'battleAction', reqId: 'a', battleId, round: 1, action: 'attack' });
    const view = eng.publicView(party(), ids[2]).battles.find((x) => x.id === battleId)!;
    expect(view.a.action).toBeUndefined(); expect(view.a.locked).toBe(true);
    // wrong round rejected
    expect(eng.handle(ids[2], { type: 'battleAction', reqId: 'a', battleId, round: 5, action: 'attack' }).ack?.ok).toBe(false);
    let guard = 0;
    while (party().battles[battleId].status === 'active' && guard++ < 20) {
      b = party().battles[battleId];
      eng.handle(ids[1], { type: 'battleAction', reqId: 'a', battleId, round: b.round, action: 'attack' });
      eng.handle(ids[2], { type: 'battleAction', reqId: 'a', battleId, round: b.round, action: b.b.specialCooldown ? 'attack' : 'special' });
    }
    b = party().battles[battleId];
    expect(b.status).toBe('finished');
    const w = party().players[b.winnerId!]; const l = party().players[b.loserId!];
    expect(w.wins).toBe(1); expect(l.losses).toBe(1);
    expect(w.points).toBe(20); // 15 battle + 5 'first_win' achievement
    expect(l.points).toBe(5);
    // timeout path: unanswered rounds auto-resolve, three misses forfeits
    const ch2 = eng.handle(ids[5], { type: 'challenge', reqId: 'b', opponentId: ids[6] });
    const id2 = (ch2.ack as any).data.battleId as string;
    eng.handle(ids[6], { type: 'respondChallenge', reqId: 'r', battleId: id2, accept: true });
    for (let i = 0; i < 3; i++) {
      eng.handle(ids[5], { type: 'battleAction', reqId: 'a', battleId: id2, round: party().battles[id2].round, action: 'counter' });
      advance(26_000); eng.tick();
    }
    expect(party().battles[id2].status).toBe('finished');
    expect(party().battles[id2].reason).toBe('timeout');
    expect(party().battles[id2].winnerId).toBe(ids[5]);
  });
  it('host can remove players, reset claims and advance/recover phases; awards are computed from data', () => {
    const { eng, ids, party } = setup();
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } });
    eng.handle(ids[9], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, claimId: 'claim-s-0009' });
    expect(party().players[ids[9]].points).toBe(10);
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'resetClaim', playerId: ids[9], missionId: STARTER_MISSION.id } }).ack?.ok).toBe(true);
    expect(party().players[ids[9]].points).toBe(0);
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
    expect(view.awards?.length).toBe(10);
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
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } });
    const p = party().players[ids[2]];
    p.hand = [{ missionId: STARTER_MISSION.id, assignedAt: 0, status: 'active' }, { missionId: 'm013', assignedAt: 0, status: 'active' }, { missionId: 'm017', assignedAt: 0, status: 'active' }, { missionId: 'm070', assignedAt: 0, status: 'active' }];
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, claimId: 'cd-starter-01' }).ack?.ok).toBe(true);
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'm013', claimId: 'cd-self-01' }).ack?.ok).toBe(true);
    const second = eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'm017', claimId: 'cd-self-02' });
    expect(second.ack?.ok).toBe(false);
    expect((second.ack as any).error).toMatch(/Next honour-system claim/);
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'm070', claimId: 'cd-photo-01', photo: 'data:image/jpeg;base64,AAAA' }).ack?.ok).toBe(true);
    expect(eng.privateView(party(), ids[2])!.honourCooldownUntil).toBeGreaterThan(1_000_000);
    advance(HONOUR_COOLDOWN_MS + 1);
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'm017', claimId: 'cd-self-03' }).ack?.ok).toBe(true);
  });
  it('Call BS: two mates freeze the points, the host rules, the owner cannot self-flag', () => {
    const { eng, ids, party } = setup();
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } });
    eng.handle(ids[4], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, claimId: 'bs-claim-01' });
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
    expect(party().players[ids[4]].points).toBe(0);
    expect(party().players[ids[4]].missionsCompleted).toBe(0);
    expect(eng.hostView(party()).approvals.some((c) => c.id === 'bs-claim-01')).toBe(true);
    expect(eng.publicView(party()).pendingApprovals).toBe(1);
    // host upholds → points restored
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'resolveClaim', claimId: 'bs-claim-01', approve: true } }).ack?.ok).toBe(true);
    expect(party().players[ids[4]].points).toBe(before);
    expect(party().claims['bs-claim-01'].status).toBe('approved');
    // a struck-out claim stays gone
    eng.handle(ids[7], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, claimId: 'bs-claim-02' });
    eng.handle(ids[5], { type: 'flagClaim', reqId: 'f', claimId: 'bs-claim-02' }); eng.handle(ids[6], { type: 'flagClaim', reqId: 'f', claimId: 'bs-claim-02' });
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'resolveClaim', claimId: 'bs-claim-02', approve: false } });
    expect(party().players[ids[7]].points).toBe(0);
    expect(party().claims['bs-claim-02'].status).toBe('rejected');
  });
  it('power tap: a hit reported faster than the bar can slide is downgraded; counter never taps', () => {
    const { eng, ids, party, advance } = setup();
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } });
    const id = (eng.handle(ids[1], { type: 'challenge', reqId: 'b', opponentId: ids[2] }).ack as any).data.battleId as string;
    eng.handle(ids[2], { type: 'respondChallenge', reqId: 'r', battleId: id, accept: true });
    // instant "perfect" right as the round starts → not plausible
    eng.handle(ids[1], { type: 'battleAction', reqId: 'a', battleId: id, round: 1, action: 'attack', tap: 'perfect' });
    expect(party().battles[id].a.tap).toBe('miss');
    advance(1500);
    eng.handle(ids[2], { type: 'battleAction', reqId: 'a', battleId: id, round: 1, action: 'counter', tap: 'perfect' });
    // both acted → round 1 resolved; the log records the validated taps
    expect(party().battles[id].log[0].a.tap).toBe('miss');
    expect(party().battles[id].log[0].b.tap).toBe('miss'); // counter has no tap
    advance(2000);
    eng.handle(ids[1], { type: 'battleAction', reqId: 'a', battleId: id, round: 2, action: 'attack', tap: 'perfect' });
    expect(party().battles[id].a.tap).toBe('perfect'); // plausible timing → accepted
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
