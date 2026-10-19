import { describe, it, expect } from 'vitest';
import { Engine, FRESH_LEGS, nextSaturdayMorning } from '../shared/engine';
import { seededRng } from '../shared/battle';
import { MISSIONS, STARTER_MISSION, GROUP_MISSIONS } from '../shared/missions';
import { LEVEL_XP, FRIDAY_MAX_LEVEL, stageForLevel } from '../shared/progression';
import { RAID_THRESHOLD, RAID_HIT_COOLDOWN_MS, BOSSES } from '../shared/raid';

const PHOTO = 'data:image/jpeg;base64,AAAA';
function setup(names = ['Travis', 'Jezza', 'Tommo', 'Big Dave', 'Nath', 'Shorty']) {
  let t = Date.UTC(2026, 9, 23, 6, 0); // Fri 23 Oct 2026, 5pm Sydney
  const eng = new Engine({ now: () => t, rng: seededRng(7) });
  const ids = names.map((_, i) => `player_${String(i).padStart(4, '0')}`);
  ids.forEach((id) => eng.auth(id, 'secret-' + id));
  const code = (eng.handle(ids[0], { type: 'createParty', reqId: '1', nickname: names[0] }).ack as any).data.code as string;
  ids.slice(1).forEach((id, i) => eng.handle(id, { type: 'joinParty', reqId: 'j', code, nickname: names[i + 1] }));
  ids.forEach((id, i) => eng.handle(id, { type: 'chooseCreature', reqId: 'c', creature: (['dragon', 'wombat', 'possum', 'owl', 'goblin', 'fox'] as const)[i % 6] }));
  const party = () => eng.state.parties[code];
  party().photoMode = 'instant'; // these tests cover the instant flow; vote/host modes have their own tests
  const advance = (ms: number) => { t += ms; };
  const give = (id: string, missionId: string) => { party().players[id].hand = [{ missionId, assignedAt: t, status: 'active' }]; };
  return { eng, ids, code, party, advance, now: () => t, give };
}

describe('self-running weekend', () => {
  it('starts on Friday with challenges open, no host needed, and finds the groom', () => {
    const { party, ids } = setup();
    expect(party().phase).toBe('friday');
    expect(party().missionsOpen).toBe(true);
    expect(party().groomId).toBe(ids[1]);
    expect(party().players[ids[3]].hand.length).toBe(3);
  });
  it('switches to Saturday on its own at 5am Sydney time', () => {
    const { eng, party, advance } = setup();
    const at = party().autoSaturdayAt!;
    expect(new Date(at).toISOString()).toBe('2026-10-23T18:00:00.000Z'); // Sat 24 Oct 05:00 AEDT
    advance(at - Date.now() > 0 ? 0 : 0);
    expect(nextSaturdayMorning(at + 1)).toBeGreaterThan(at);
    while (party().phase === 'friday') { advance(3600_000); eng.tick(); }
    expect(party().phase).toBe('saturday');
  });
  it('in instant mode photo challenges pay out straight away; the lads settle BS calls themselves', () => {
    const { eng, ids, party, give, advance } = setup();
    const photoM = MISSIONS.find((m) => m.method === 'photo' && m.scope === 'private')!;
    give(ids[2], photoM.id);
    const r = eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: photoM.id, claimId: 'ph-claim-01', photo: PHOTO });
    expect((r.ack as any).data.status).toBe('approved');
    const pts = party().players[ids[2]].points;
    expect(pts).toBeGreaterThanOrEqual(photoM.points);
    eng.handle(ids[3], { type: 'flagClaim', reqId: 'f', claimId: 'ph-claim-01' });
    eng.handle(ids[4], { type: 'flagClaim', reqId: 'f', claimId: 'ph-claim-01' });
    expect(party().claims['ph-claim-01'].status).toBe('disputed');
    expect(eng.handle(ids[3], { type: 'backClaim', reqId: 'b', claimId: 'ph-claim-01' }).ack?.ok).toBe(false); // flagger can't back
    eng.handle(ids[1], { type: 'backClaim', reqId: 'b', claimId: 'ph-claim-01' });
    eng.handle(ids[5], { type: 'backClaim', reqId: 'b', claimId: 'ph-claim-01' });
    expect(party().claims['ph-claim-01'].status).toBe('approved');
    // a second dispute nobody backs is struck after 30 minutes
    const p2 = MISSIONS.filter((m) => m.method === 'photo' && m.scope === 'private')[1];
    give(ids[4], p2.id);
    eng.handle(ids[4], { type: 'claimMission', reqId: 'x', missionId: p2.id, claimId: 'ph-claim-02', photo: PHOTO });
    eng.handle(ids[2], { type: 'flagClaim', reqId: 'f', claimId: 'ph-claim-02' });
    eng.handle(ids[3], { type: 'flagClaim', reqId: 'f', claimId: 'ph-claim-02' });
    advance(31 * 60_000); eng.tick();
    expect(party().claims['ph-claim-02'].status).toBe('rejected');
  });
  it('witness can be swapped after two minutes of silence', () => {
    const { eng, ids, party, give, advance } = setup();
    const w = MISSIONS.find((m) => m.method === 'witness')!;
    give(ids[2], w.id);
    eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: w.id, claimId: 'wit-claim-01', witnessId: ids[3] });
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: w.id, claimId: 'wit-claim-02', witnessId: ids[4] }).ack?.ok).toBe(false);
    advance(2 * 60_000 + 1);
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: w.id, claimId: 'wit-claim-03', witnessId: ids[4] }).ack?.ok).toBe(true);
    expect(party().claims['wit-claim-01'].status).toBe('rejected');
    eng.handle(ids[4], { type: 'confirmWitness', reqId: 'c', claimId: 'wit-claim-03', approve: true });
    expect(party().claims['wit-claim-03'].status).toBe('approved');
  });
  it('Friday caps creatures at one evolution; Saturday unlocks the final form', () => {
    const { eng, ids, party, advance } = setup();
    const p = party().players[ids[2]];
    (eng as any).grant(party(), p, 0, 5000, []);
    expect(p.level).toBe(FRIDAY_MAX_LEVEL);
    expect(stageForLevel(p.level)).toBe(2);
    expect(p.xp).toBe(LEVEL_XP[FRIDAY_MAX_LEVEL] - 1);
    expect(party().feed.some((f) => f.kind === 'evolve')).toBe(true);
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'saturday' } });
    const r = (eng as any).grant(party(), p, 0, 200, []);
    expect(p.level).toBeGreaterThanOrEqual(8);
    expect(r.evolved).toEqual({ from: 2, to: 3 });
    advance(1);
  });
  it('Saturday arrivals get fresh legs: double points on their first challenges', () => {
    const { eng, ids, party, code } = setup();
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'saturday' } });
    eng.auth('late_arrival_01', 'secret-late');
    eng.handle('late_arrival_01', { type: 'joinParty', reqId: 'j', code, nickname: 'Latecomer' });
    eng.handle('late_arrival_01', { type: 'chooseCreature', reqId: 'c', creature: 'sprite' });
    const late = party().players['late_arrival_01'];
    expect(late.freshLegs).toBe(FRESH_LEGS);
    const photoM = MISSIONS.find((m) => m.method === 'photo' && m.scope === 'private' && m.category !== 'jezza')!;
    late.hand = [{ missionId: photoM.id, assignedAt: 0, status: 'active' }];
    const before = late.points;
    eng.handle('late_arrival_01', { type: 'claimMission', reqId: 'x', missionId: photoM.id, claimId: 'late-claim-01', photo: PHOTO });
    expect(late.points - before).toBeGreaterThanOrEqual(photoM.points * 2);
    expect(late.freshLegs).toBe(FRESH_LEGS - 1);
  });
  it('boss raid spawns from group activity, has a hit cooldown, and pays everyone who swung', () => {
    const { eng, ids, party, give, advance } = setup();
    const selfMissions = MISSIONS.filter((m) => m.method === 'photo' && m.scope === 'private');
    let n = 0;
    while (!party().raids.length && n < 60) {
      const id = ids[n % ids.length]; const m = selfMissions[n % selfMissions.length];
      if (!party().players[id].completedMissionIds.includes(m.id)) { give(id, m.id); eng.handle(id, { type: 'claimMission', reqId: 'x', missionId: m.id, claimId: `raid-claim-${n}`, photo: PHOTO }); }
      n++;
    }
    expect(party().phaseMissions.friday).toBeGreaterThanOrEqual(RAID_THRESHOLD.friday);
    const raid = party().raids[0];
    expect(raid.boss).toBe('ibis');
    const hit = eng.handle(ids[2], { type: 'raidHit', reqId: 'r', raidId: raid.id, tap: 'perfect' });
    expect(hit.ack?.ok).toBe(true);
    expect(eng.handle(ids[2], { type: 'raidHit', reqId: 'r', raidId: raid.id }).ack?.ok).toBe(false); // cooldown
    advance(RAID_HIT_COOLDOWN_MS);
    let guard = 0;
    while (party().raids[0].status === 'active' && guard++ < 400) {
      for (const id of ids) eng.handle(id, { type: 'raidHit', reqId: 'r', raidId: raid.id, tap: 'good' });
      advance(RAID_HIT_COOLDOWN_MS);
    }
    expect(party().raids[0].status).toBe('won');
    for (const id of ids) {
      expect(party().players[id].unlocked).toContain(BOSSES.ibis.cosmetic);
      expect(party().players[id].raidsJoined).toBe(1);
    }
    expect(party().raids.length).toBe(1); // one auto raid per day
  });
  it('a raid nobody finishes escapes after 15 minutes but still pays out', () => {
    const { eng, ids, party, advance } = setup();
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'summonRaid' } });
    const raid = party().raids[0];
    eng.handle(ids[3], { type: 'raidHit', reqId: 'r', raidId: raid.id });
    advance(15 * 60_000 + 1); eng.tick();
    expect(party().raids[0].status).toBe('escaped');
    expect(party().players[ids[3]].unlocked).toContain(raid.cosmetic);
    expect(party().players[ids[4]].unlocked).not.toContain(raid.cosmetic);
  });
  it('Jezza Wall: 3 posts a day, mates vote, Jezza hearts, filter blocks nasty stuff', () => {
    const { eng, ids, party } = setup();
    expect(eng.handle(ids[2], { type: 'wallPost', reqId: 'w', kind: 'roast', text: 'hi' }).ack?.ok).toBe(false);
    for (let i = 0; i < 3; i++) expect(eng.handle(ids[2], { type: 'wallPost', reqId: 'w', kind: 'roast', text: `Jezza parallel parks like it's a group project ${i}` }).ack?.ok).toBe(true);
    expect(eng.handle(ids[2], { type: 'wallPost', reqId: 'w', kind: 'toast', text: 'One more for the road mate' }).ack?.ok).toBe(false);
    const post = party().wall[0];
    expect(eng.handle(ids[2], { type: 'wallVote', reqId: 'v', postId: post.id }).ack?.ok).toBe(false);
    eng.handle(ids[3], { type: 'wallVote', reqId: 'v', postId: post.id });
    eng.handle(ids[3], { type: 'wallVote', reqId: 'v', postId: post.id }); // idempotent
    eng.handle(ids[1], { type: 'wallVote', reqId: 'v', postId: post.id }); // groom = heart
    expect(post.votes.length).toBe(1);
    expect(post.groomLove).toBe(true);
    expect(party().players[ids[2]].wallVotes).toBe(1);
    expect(party().players[ids[2]].groomLoves).toBe(1);
    expect(eng.handle(ids[4], { type: 'wallPost', reqId: 'w', kind: 'roast', text: 'you absolute retard' }).ack?.ok).toBe(false);
    expect(eng.handle(ids[4], { type: 'wallHide', reqId: 'h', postId: post.id }).ack?.ok).toBe(false);
    expect(eng.handle(ids[1], { type: 'wallHide', reqId: 'h', postId: post.id }).ack?.ok).toBe(true); // Jezza can take it down
    expect(eng.publicView(party()).wall.find((w) => w.id === post.id)).toBeUndefined();
  });
  it('Cellar: only the first three reviews a day score, any drink counts', () => {
    const { eng, ids, party } = setup();
    const p = party().players[ids[3]];
    const start = p.points;
    for (let i = 0; i < 5; i++) expect(eng.handle(ids[3], { type: 'cellarAdd', reqId: 'c', drink: `Sparkling water ${i}`, stars: 4, note: 'crisp, hydrating, confident' }).ack?.ok).toBe(true);
    const scored = p.points - start;
    expect(scored).toBeLessThanOrEqual(3 * 5 + 15); // 3 rewarded reviews + the one-off achievement
    expect(p.cellarCount).toBe(5);
    const e = party().cellar[0];
    eng.handle(ids[2], { type: 'cellarFire', reqId: 'f', entryId: e.id });
    expect(party().players[ids[3]].cellarFires).toBe(1);
  });
  it('reactions feed the awards; only Jezza can heart', () => {
    const { eng, ids, party, give } = setup();
    const m = MISSIONS.find((x) => x.method === 'photo' && x.scope === 'private')!;
    give(ids[2], m.id);
    eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: m.id, claimId: 'react-claim-1', photo: PHOTO });
    const ev = party().feed.find((f) => f.claimId === 'react-claim-1')!;
    expect(eng.handle(ids[2], { type: 'react', reqId: 'r', eventId: ev.id, emoji: '😂' }).ack?.ok).toBe(false);
    eng.handle(ids[3], { type: 'react', reqId: 'r', eventId: ev.id, emoji: '😂' });
    eng.handle(ids[4], { type: 'react', reqId: 'r', eventId: ev.id, emoji: '🔥' });
    expect(eng.handle(ids[4], { type: 'react', reqId: 'r', eventId: ev.id, emoji: '❤️' }).ack?.ok).toBe(false);
    expect(eng.handle(ids[1], { type: 'react', reqId: 'r', eventId: ev.id, emoji: '❤️' }).ack?.ok).toBe(true);
    const pl = party().players[ids[2]];
    expect([pl.laughs, pl.fires, pl.groomLoves]).toEqual([1, 1, 1]);
    const awards = eng.publicView(party()).awards;
    expect(awards.find((a) => a.id === 'funniest')!.playerId).toBe(ids[2]);
    expect(awards.find((a) => a.id === 'jezzafav')!.playerId).toBe(ids[2]);
    // gallery shows it and anyone can take it down
    expect(eng.publicView(party()).gallery.some((g) => g.id === 'react-claim-1')).toBe(true);
    expect(eng.handle(ids[5], { type: 'deletePhoto', reqId: 'd', photoId: 'react-claim-1' }).ack?.ok).toBe(true);
    expect(eng.publicView(party()).gallery.some((g) => g.id === 'react-claim-1')).toBe(false);
  });
  it('beating the leader claims the bounty; streaks and ratings move', () => {
    const { eng, ids, party } = setup();
    party().players[ids[3]].points = 500; // Big Dave leads
    const id = (eng.handle(ids[2], { type: 'challenge', reqId: 'b', opponentId: ids[3] }).ack as any).data.battleId as string;
    expect(party().battles[id].bountyOn).toBe(ids[3]);
    eng.handle(ids[3], { type: 'respondChallenge', reqId: 'r', battleId: id, accept: true });
    eng.handle(ids[3], { type: 'surrender', reqId: 's', battleId: id });
    const w = party().players[ids[2]];
    expect(w.bounties).toBe(1);
    expect(w.streak).toBe(1);
    expect(w.rating).toBeGreaterThan(1000);
    expect(party().battles[id].rewards![ids[2]].points).toBe(30);
  });
  it('low-key mode never deals performing challenges; swaps keep difficulty and refill over time', () => {
    const { eng, ids, party, advance } = setup();
    eng.handle(ids[4], { type: 'setPrefs', reqId: 'p', lowKey: true });
    const p = party().players[ids[4]];
    for (let i = 0; i < 3; i++) {
      for (const h of p.hand) expect(MISSIONS.find((m) => m.id === h.missionId)!.loud).toBeFalsy();
      const h = p.hand.find((x) => x.missionId !== STARTER_MISSION.id)!;
      const d = MISSIONS.find((m) => m.id === h.missionId)!.difficulty;
      eng.handle(ids[4], { type: 'rerollMission', reqId: 'r', missionId: h.missionId });
      expect(p.hand.some((x) => MISSIONS.find((m) => m.id === x.missionId)!.difficulty === d)).toBe(true);
    }
    expect(p.rerollsLeft).toBe(0);
    expect(eng.handle(ids[4], { type: 'rerollMission', reqId: 'r', missionId: p.hand.find((x) => x.missionId !== STARTER_MISSION.id)!.missionId }).ack?.ok).toBe(false);
    advance(20 * 60_000 + 1); eng.tick();
    expect(p.rerollsLeft).toBe(1);
  });
  it('group challenges go live by themselves', () => {
    const { eng, party, advance } = setup();
    expect(party().revealedGroupMissions.length).toBe(0);
    advance(21 * 60_000); eng.tick();
    expect(party().revealedGroupMissions.length).toBe(1);
    expect(GROUP_MISSIONS.map((g) => g.id)).toContain(party().revealedGroupMissions[0]);
  });
});
