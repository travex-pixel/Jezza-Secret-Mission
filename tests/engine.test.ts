import { describe, it, expect } from 'vitest';
import { Engine } from '../shared/engine';
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
      eng.handle(ids[5], { type: 'battleAction', reqId: 'a', battleId: id2, round: party().battles[id2].round, action: 'defend' });
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
});
