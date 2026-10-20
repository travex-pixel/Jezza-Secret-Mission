import { describe, it, expect } from 'vitest';
import { Engine, FRESH_LEGS, nextSaturdayMorning } from '../shared/engine';
import { seededRng } from '../shared/battle';
import { MISSIONS, MISSION_BY_ID, STARTER_MISSION, GROUP_MISSIONS } from '../shared/missions';
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
  it('Jezza Wall: 5 posts a day, mates vote, Jezza hearts, filter blocks nasty stuff', () => {
    const { eng, ids, party } = setup();
    expect(eng.handle(ids[2], { type: 'wallPost', reqId: 'w', kind: 'roast', text: 'hi' }).ack?.ok).toBe(false);
    for (let i = 0; i < 5; i++) expect(eng.handle(ids[2], { type: 'wallPost', reqId: 'w', kind: 'roast', text: `Jezza parallel parks like it's a group project ${i}` }).ack?.ok).toBe(true);
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
    // gallery shows it; a mate can only ASK for it to come down, the host decides
    expect(eng.publicView(party()).gallery.some((g) => g.id === 'react-claim-1')).toBe(true);
    const ask = eng.handle(ids[5], { type: 'deletePhoto', reqId: 'd', photoId: 'react-claim-1' });
    expect((ask.ack as any).data.requested).toBe(true);
    expect(eng.publicView(party()).gallery.some((g) => g.id === 'react-claim-1')).toBe(true);
    expect(eng.hostView(party()).takedowns.map((t) => t.photoId)).toEqual(['react-claim-1']);
    expect(eng.publicView(party()).pendingApprovals).toBe(1);
    expect(eng.handle(ids[5], { type: 'host', reqId: 'h', action: { kind: 'resolveTakedown', photoId: 'react-claim-1', remove: true } }).ack?.ok).toBe(false);
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'resolveTakedown', photoId: 'react-claim-1', remove: false } }); // host keeps it
    expect(eng.publicView(party()).gallery.some((g) => g.id === 'react-claim-1')).toBe(true);
    expect(eng.hostView(party()).takedowns.length).toBe(0);
    eng.handle(ids[4], { type: 'deletePhoto', reqId: 'd', photoId: 'react-claim-1' });
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'resolveTakedown', photoId: 'react-claim-1', remove: true } }); // second request: host agrees
    expect(eng.publicView(party()).gallery.some((g) => g.id === 'react-claim-1')).toBe(false);
  });
  it('the snapper can delete their own photo straight away; the host keepsake has the whole Wall', () => {
    const { eng, ids, party, give } = setup();
    const m = MISSIONS.find((x) => x.method === 'photo' && x.scope === 'private')!;
    give(ids[2], m.id);
    eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: m.id, claimId: 'own-claim-1', photo: PHOTO });
    expect((eng.handle(ids[2], { type: 'deletePhoto', reqId: 'd', photoId: 'own-claim-1' }).ack as any).data).toBeUndefined();
    expect(eng.publicView(party()).gallery.some((g) => g.id === 'own-claim-1')).toBe(false);
    eng.handle(ids[3], { type: 'wallPost', reqId: 'w', kind: 'roast', text: 'Jezza parallel parks like it is a group project' });
    eng.handle(ids[4], { type: 'wallPost', reqId: 'w', kind: 'toast', text: 'Best bloke we know. Cheers Jez.' });
    expect(eng.handle(ids[3], { type: 'host', reqId: 'k', action: { kind: 'keepsake' } }).ack?.ok).toBe(false); // host only
    const k = (eng.handle(ids[0], { type: 'host', reqId: 'k', action: { kind: 'keepsake' } }).ack as any).data;
    expect(k.wall.map((w: any) => w.text)).toEqual(expect.arrayContaining(['Jezza parallel parks like it is a group project', 'Best bloke we know. Cheers Jez.']));
    expect(k.wall.find((w: any) => w.kind === 'roast').author).toBe('Big Dave');
    expect(k.board.length).toBe(6);
    expect(k.awards.find((a: any) => a.name === 'The Jezza Legend').winner).toBeTruthy();
  });
  it('EPIC jobs: host posts, first in fill the crew, everyone on it gets points, XP and the themed item', () => {
    const { eng, ids, party } = setup();
    expect(eng.handle(ids[2], { type: 'host', reqId: 'h', action: { kind: 'postEpic', presetId: 'mac' } }).ack?.ok).toBe(false); // host only
    const id = (eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'postEpic', presetId: 'mac' } }).ack as any).data.id as string;
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'postEpic', presetId: 'mac' } }).ack?.ok).toBe(false); // already up
    const e = () => party().epics.find((x) => x.id === id)!;
    expect(eng.publicView(party()).epics.map((x) => x.title)).toContain('Mac and Cheese Crew');
    expect(eng.handle(ids[2], { type: 'finishEpic', reqId: 'f', epicId: id }).ack?.ok).toBe(false); // not on the crew
    eng.handle(ids[2], { type: 'joinEpic', reqId: 'j', epicId: id });
    expect(eng.handle(ids[2], { type: 'finishEpic', reqId: 'f', epicId: id }).ack?.ok).toBe(false); // needs 2
    eng.handle(ids[3], { type: 'joinEpic', reqId: 'j', epicId: id });
    expect(eng.handle(ids[4], { type: 'joinEpic', reqId: 'j', epicId: id }).ack?.ok).toBe(false); // only 2 spots: first in
    expect(e().crew).toEqual([ids[2], ids[3]]);
    eng.handle(ids[3], { type: 'leaveEpic', reqId: 'l', epicId: id });
    eng.handle(ids[4], { type: 'joinEpic', reqId: 'j', epicId: id }); // a spot opened up
    const before = { pts: party().players[ids[2]].points, xp: party().players[ids[2]].xp };
    const r = eng.handle(ids[4], { type: 'finishEpic', reqId: 'f', epicId: id });
    expect(r.ack?.ok).toBe(true);
    expect(e().status).toBe('done');
    for (const pid of [ids[2], ids[4]]) {
      const p = party().players[pid];
      expect(p.unlocked).toContain('hat_chef');
      expect(p.epicsDone).toBe(1);
      expect(r.direct.some((d) => d.to === pid && d.msg.type === 'reward')).toBe(true);
    }
    expect(party().players[ids[2]].points - before.pts).toBeGreaterThanOrEqual(25);
    expect(party().players[ids[2]].xp).toBeGreaterThan(before.xp);
    expect(party().players[ids[3]].unlocked).not.toContain('hat_chef'); // left before it was done
    expect((eng.handle(ids[2], { type: 'finishEpic', reqId: 'f', epicId: id }).ack as any).data.already).toBe(true); // no double rewards
    expect(party().players[ids[2]].epicsDone).toBe(1);
    // KFC/pizza: 2-3 lads; custom jobs; cancel
    const run = (eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'postEpic', presetId: 'food_run' } }).ack as any).data.id as string;
    expect(party().epics.find((x) => x.id === run)).toMatchObject({ min: 2, max: 3, item: 'hat_cap' });
    const custom = (eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'postEpic', title: 'Firewood', instruction: 'Grab wood for the fire pit', min: 1, max: 1 } }).ack as any).data.id as string;
    expect(party().epics.find((x) => x.id === custom)).toMatchObject({ title: 'Firewood', max: 1, item: 'aura_epic' });
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'cancelEpic', epicId: run } });
    expect(eng.publicView(party()).epics.some((x) => x.id === run)).toBe(false);
    expect(eng.publicView(party()).awards.find((a) => a.id === 'helpful')!.playerId).toBeTruthy();
  });
  it('EPIC jobs pay by size: the designated driver is a Legend job with the Hi-Vis Vest', () => {
    const { eng, ids, party } = setup();
    const dd = (eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'postEpic', presetId: 'dd_sat' } }).ack as any).data.id as string;
    const salad = (eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'postEpic', presetId: 'salad' } }).ack as any).data.id as string;
    const custom = (eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'postEpic', title: 'Firewood', max: 1, tier: 'big' } }).ack as any).data.id as string;
    expect(party().epics.find((e) => e.id === dd)).toMatchObject({ max: 1, tier: 'legend', points: 60, item: 'cape_hivis' });
    expect(party().epics.find((e) => e.id === salad)).toMatchObject({ tier: 'small', points: 15 });
    expect(party().epics.find((e) => e.id === custom)).toMatchObject({ tier: 'big', points: 40 });
    eng.handle(ids[3], { type: 'joinEpic', reqId: 'j', epicId: dd });
    expect(eng.handle(ids[4], { type: 'joinEpic', reqId: 'j', epicId: dd }).ack?.ok).toBe(false); // one car, one driver
    const before = party().players[ids[3]].points;
    eng.handle(ids[3], { type: 'finishEpic', reqId: 'f', epicId: dd });
    expect(party().players[ids[3]].points - before).toBeGreaterThanOrEqual(60);
    expect(party().players[ids[3]].unlocked).toContain('cape_hivis');
  });
  it('reward codes: host makes one, it unlocks the accessory once, wrong guesses are limited', () => {
    const { eng, ids, party } = setup();
    expect(eng.handle(ids[2], { type: 'host', reqId: 'h', action: { kind: 'makeCode', item: 'face_mo' } }).ack?.ok).toBe(false); // host only
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'makeCode', item: 'not_a_thing' } }).ack?.ok).toBe(false);
    const code = (eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'makeCode', item: 'face_mo' } }).ack as any).data.code as string;
    expect(code).toMatch(/^JEZZA-[A-Z0-9]{4}$/);
    expect(eng.hostView(party()).codes.map((c) => c.code)).toEqual([code]);
    expect(JSON.stringify(eng.publicView(party()))).not.toContain(code); // only the host sees codes
    const r = eng.handle(ids[2], { type: 'redeemCode', reqId: 'c', code: code.toLowerCase().replace('-', ' ') }); // forgiving about case/spaces
    expect(r.ack?.ok).toBe(true);
    expect(party().players[ids[2]].unlocked).toContain('face_mo');
    expect(r.direct.some((d) => d.to === ids[2] && d.msg.type === 'reward')).toBe(true);
    expect(eng.handle(ids[3], { type: 'redeemCode', reqId: 'c', code }).ack?.ok).toBe(false); // used up
    const multi = (eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'makeCode', item: 'aura_rainbow', uses: 3 } }).ack as any).data.code as string;
    for (const id of ids.slice(1, 4)) expect(eng.handle(id, { type: 'redeemCode', reqId: 'c', code: multi }).ack?.ok).toBe(true);
    expect(eng.handle(ids[4], { type: 'redeemCode', reqId: 'c', code: multi }).ack?.ok).toBe(false);
    for (let i = 0; i < 6; i++) eng.handle(ids[5], { type: 'redeemCode', reqId: 'c', code: `JEZZA-ZZZ${i}` });
    const fresh = (eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'makeCode', item: 'hat_viking' } }).ack as any).data.code as string;
    expect((eng.handle(ids[5], { type: 'redeemCode', reqId: 'c', code: fresh }).ack as any).error).toMatch(/Too many wrong codes/);
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
    for (const intro of ['m002', 'm003']) eng.handle(ids[4], { type: 'rerollMission', reqId: 'r', missionId: intro }); // skipping the intro is free
    expect(p.rerollsLeft).toBe(3);
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

describe('the intro, skips and the challenge library', () => {
  it('new players get the intro: group selfie, roast, toast (the groom just the selfie); roast and toast are done on the Wall, once', () => {
    const { eng, ids, party } = setup();
    const mate = party().players[ids[2]];
    expect(mate.hand.map((h) => h.missionId)).toEqual(['m001', 'm002', 'm003']);
    expect(party().players[ids[1]].hand[0].missionId).toBe('m001'); // Jezza
    expect(party().players[ids[1]].hand.some((h) => h.missionId === 'm002' || h.missionId === 'm003')).toBe(false);
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'm002', claimId: 'intro-roast-1' }).ack?.ok).toBe(false); // has to be written
    const before = mate.points;
    expect(eng.handle(ids[2], { type: 'wallPost', reqId: 'w', kind: 'roast', text: 'Jezza\'s Year 9 haircut had its own postcode' }).ack?.ok).toBe(true);
    expect(mate.completedMissionIds).toContain('m002');
    expect(mate.points).toBe(before + 5 + MISSION_BY_ID.m002.points + 5); // wall post + the roast + first in a new category
    const after = mate.points;
    eng.handle(ids[2], { type: 'wallPost', reqId: 'w', kind: 'roast', text: 'Jezza still owes me twenty bucks from 2014' });
    expect(mate.points).toBe(after + 5); // a second roast is just a Wall post: the challenge only pays once
    eng.handle(ids[2], { type: 'wallPost', reqId: 'w', kind: 'toast', text: 'Best bloke I know, worst at parallel parking' });
    expect(mate.completedMissionIds).toContain('m003');
    expect(mate.hand.some((h) => MISSION_BY_ID[h.missionId]?.tutorial && h.missionId !== 'm001')).toBe(false);
  });
  it('skipping the intro is free, the selfie stays pinned, and Jezza can veto anything without running out', () => {
    const { eng, ids, party } = setup();
    const mate = party().players[ids[3]];
    expect(eng.handle(ids[3], { type: 'rerollMission', reqId: 'r', missionId: 'm002' }).ack?.ok).toBe(true);
    expect(mate.rerollsLeft).toBe(3);
    expect(mate.points).toBe(0);
    expect(eng.handle(ids[3], { type: 'rerollMission', reqId: 'r', missionId: 'm001' }).ack?.ok).toBe(false);
    const jezza = party().players[ids[1]];
    for (let i = 0; i < 6; i++) {
      const h = jezza.hand.find((x) => x.status === 'active' && x.missionId !== 'm001')!;
      expect(eng.handle(ids[1], { type: 'rerollMission', reqId: 'r', missionId: h.missionId }).ack?.ok).toBe(true);
    }
    expect(jezza.rerollsLeft).toBe(3);
  });
  it('never deals retired or intro challenges, keeps a photo in every hand and avoids repeating a category', () => {
    const { eng, ids, party } = setup();
    const p = party().players[ids[4]];
    for (const intro of ['m002', 'm003']) eng.handle(ids[4], { type: 'rerollMission', reqId: 'r', missionId: intro });
    for (let round = 0; round < 25; round++) {
      const active = p.hand.filter((h) => h.status === 'active');
      for (const h of active) { const m = MISSION_BY_ID[h.missionId]; expect(m, h.missionId).toBeTruthy(); expect(m.retired, h.missionId).toBeFalsy(); }
      expect(active.filter((h) => h.missionId !== 'm001').some((h) => MISSION_BY_ID[h.missionId].method === 'photo')).toBe(true);
      const h = active.find((x) => x.missionId !== 'm001')!;
      const cat = MISSION_BY_ID[h.missionId].category;
      p.hand = p.hand.filter((x) => x !== h);
      p.completedMissionIds.push(h.missionId);
      (eng as any).refillHand(party(), p);
      const fresh = p.hand[p.hand.length - 1];
      if (fresh) expect(MISSION_BY_ID[fresh.missionId].category === cat && round < 10).toBe(false);
    }
  });
  it('an old save with retired or unknown challenges in hand loads cleanly; progress is kept', () => {
    const { eng, ids, party } = setup();
    const p = party().players[ids[2]];
    p.hand = [{ missionId: 'm001', assignedAt: 0, status: 'active' }, { missionId: 'd01', assignedAt: 0, status: 'active' }, { missionId: 'zz99', assignedAt: 0, status: 'active' }];
    p.completedMissionIds.push('q06', 'x05'); // retired ones they did before
    const pts = p.points = 77;
    const again = new Engine({ now: () => 2_000_000 }, JSON.parse(JSON.stringify(eng.state)));
    const q = again.state.parties[party().code].players[ids[2]];
    expect(q.hand.map((h) => h.missionId)).toContain('m001');
    expect(q.hand.every((h) => MISSION_BY_ID[h.missionId] && !MISSION_BY_ID[h.missionId].retired)).toBe(true);
    expect(q.hand.length).toBe(3);
    expect(q.points).toBe(pts);
    expect(q.completedMissionIds).toEqual(expect.arrayContaining(['q06', 'x05']));
    expect(() => again.publicView(again.state.parties[party().code], ids[2])).not.toThrow();
  });
  it('no chores or errands in the challenge pool', () => {
    const active = MISSIONS.filter((m) => !m.retired);
    for (const m of active) expect(`${m.title} ${m.instruction}`, m.id).not.toMatch(/\b(pick up|buy|shop|clean|tidy|carry|fetch|wash|dishes|the bins|rubbish|grab (the )?(snacks|ice))\b/i);
  });
});
