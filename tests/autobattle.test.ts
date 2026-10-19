import { describe, it, expect } from 'vitest';
import { Engine, AUTO_REWARDS, type EngineState } from '../shared/engine';
import { seededRng } from '../shared/battle';
import { STARTER_MISSION, MISSIONS } from '../shared/missions';
import { ACHIEVEMENTS } from '../shared/progression';
import { buildTimeline } from '../client/src/battle/timeline';

const PHOTO = 'data:image/jpeg;base64,AAAA';
const MIN = 60_000;

function setup(n = 8, seed = 11) {
  let t = Date.UTC(2026, 9, 23, 6, 0); // Fri 5pm Sydney
  const deleted: string[] = [];
  const opts = { now: () => t, rng: seededRng(seed), deletePhotos: (u: string[]) => { deleted.push(...u); } };
  const eng = new Engine(opts);
  const ids = Array.from({ length: n }, (_, i) => `auto_player_${String(i).padStart(3, '0')}`);
  ids.forEach((id) => eng.auth(id, 'secret-' + id));
  const code = (eng.handle(ids[0], { type: 'createParty', reqId: '1', nickname: 'Travis' }).ack as any).data.code as string;
  ids.slice(1).forEach((id, i) => eng.handle(id, { type: 'joinParty', reqId: 'j', code, nickname: `Mate${i + 1}` }));
  const creatures = ['dragon', 'wombat', 'possum', 'owl', 'goblin', 'sprite', 'barrel', 'fox'] as const;
  ids.forEach((id, i) => eng.handle(id, { type: 'chooseCreature', reqId: 'c', creature: creatures[i % 8] }));
  ids.forEach((id) => eng.setOnline(id, false)); // everyone's phone is in their pocket
  const party = () => eng.state.parties[code];
  const autos = () => Object.values(party().battles).filter((b) => b.auto);
  return { eng, ids, code, party, autos, deleted, advance: (ms: number) => { t += ms; }, now: () => t, opts };
}

describe('auto-battles', () => {
  it('run with every player offline, reuse the engine, and pay XP + rating but never weekend points', () => {
    const { eng, ids, party, autos, advance } = setup();
    const before = Object.fromEntries(ids.map((id) => [id, structuredClone(party().players[id])]));
    eng.tick();
    expect(autos().length).toBe(0); // first one waits ~10 min
    advance(11 * MIN); eng.tick();
    expect(autos().length).toBeGreaterThanOrEqual(1);
    const b = autos()[0];
    expect(b.status).toBe('finished');
    expect(b.log.length).toBeGreaterThanOrEqual(1);
    expect(b.winnerId && b.loserId).toBeTruthy();
    const w = party().players[b.winnerId!]; const l = party().players[b.loserId!];
    expect(w.rating).toBeGreaterThan(before[w.id].rating);
    expect(l.rating).toBeLessThan(before[l.id].rating);
    expect(w.wins).toBe(1); expect(l.losses).toBe(1);
    expect(b.rewards![w.id]).toEqual(AUTO_REWARDS.win);
    expect(b.rewards![l.id]).toEqual(AUTO_REWARDS.lose);
    expect(w.scoredBattlesVs[l.id] ?? 0).toBe(0); // manual battle quota untouched
    expect(w.h2h[l.id]).toEqual({ w: 1, l: 0 });
    expect(l.h2h[w.id]).toEqual({ w: 0, l: 1 });
    // points only move through achievements (Into the Arena / Taste of Victory), never the battle itself
    for (const p of [w, l]) {
      const achPts = p.achievements.filter((a) => !before[p.id].achievements.includes(a)).reduce((s, a) => s + ACHIEVEMENTS.find((x) => x.id === a)!.points, 0);
      expect(p.points - before[p.id].points).toBe(achPts);
    }
    // both players get a "while you were away" entry with the real result
    const aw = eng.privateView(party(), w.id)!; const al = eng.privateView(party(), l.id)!;
    expect(aw.away[0]).toMatchObject({ battleId: b.id, opponentId: l.id, won: true, xp: AUTO_REWARDS.win.xp });
    expect(al.away[0]).toMatchObject({ battleId: b.id, opponentId: w.id, won: false, xp: AUTO_REWARDS.lose.xp });
    expect(aw.awayBattles[0].id).toBe(b.id);
    expect(party().feed.some((f) => f.battleId === b.id)).toBe(true);
    // acknowledging clears it
    eng.handle(w.id, { type: 'ackAway', reqId: 'a' });
    expect(eng.privateView(party(), w.id)!.away.length).toBe(0);
  });

  it('the replay timeline rebuilt from the round log lands exactly on the engine\'s final HP', () => {
    const { eng, autos, advance } = setup(8, 3);
    for (let i = 0; i < 40; i++) { advance(10 * MIN); eng.tick(); }
    expect(autos().length).toBeGreaterThan(10);
    for (const b of autos()) {
      const tl = buildTimeline(b);
      expect(tl.final.a).toBe(b.a.hp);
      expect(tl.final.b).toBe(b.b.hp);
      expect(tl.winner).toBe(b.winnerId === b.a.playerId ? 'a' : 'b');
    }
  });

  it('never settles a battle twice and catches up (capped) after the server sleeps', () => {
    const { eng, ids, party, autos, advance } = setup();
    advance(11 * MIN); eng.tick();
    const n1 = autos().length;
    const xp = ids.map((id) => party().players[id].xp);
    eng.tick(); eng.tick(); // nothing due: nothing changes
    expect(autos().length).toBe(n1);
    expect(ids.map((id) => party().players[id].xp)).toEqual(xp);
    // asleep for 5 hours (Cloud Run scaled down) → one catch-up burst, capped, each avatar at most once
    advance(5 * 3600_000); eng.tick();
    const burst = autos().length - n1;
    expect(burst).toBeGreaterThanOrEqual(3);
    expect(burst).toBeLessThanOrEqual(ids.length / 2);
    const fresh = autos().slice(n1);
    const fighters = fresh.flatMap((b) => [b.a.playerId, b.b.playerId]);
    expect(new Set(fighters).size).toBe(fighters.length);
    // wins + losses always equals the number of battles each player was in
    for (const id of ids) {
      const p = party().players[id];
      const inn = autos().filter((b) => b.a.playerId === id || b.b.playerId === id).length;
      expect(p.wins + p.losses).toBe(inn);
    }
  });

  it('spreads battles fairly, avoids instant rematches, and skips players who opted out or are mid-fight', () => {
    const { eng, ids, party, autos, advance } = setup(8, 5);
    eng.handle(ids[7], { type: 'setAutoBattles', reqId: 's', on: false });
    for (let i = 0; i < 60; i++) { advance(6 * MIN); eng.tick(); } // 6 hours
    const count = (id: string) => autos().filter((b) => b.a.playerId === id || b.b.playerId === id).length;
    expect(count(ids[7])).toBe(0);
    const counts = ids.slice(0, 7).map(count);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(4); // roughly one per 45 min each
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(3);
    // no back-to-back rematch for anyone
    for (const id of ids.slice(0, 7)) {
      const opp = autos().filter((b) => b.a.playerId === id || b.b.playerId === id).sort((x, y) => x.createdAt - y.createdAt).map((b) => (b.a.playerId === id ? b.b.playerId : b.a.playerId));
      for (let i = 1; i < opp.length; i++) expect(opp[i]).not.toBe(opp[i - 1]);
    }
    // a player in a live manual battle is left alone
    eng.handle(ids[0], { type: 'challenge', reqId: 'c', opponentId: ids[1] });
    const before = autos().length;
    for (let i = 0; i < 10; i++) { advance(6 * MIN); eng.tick(); }
    const later = autos().slice(before);
    expect(later.length).toBeGreaterThan(0);
    void party;
  });

  it('pauses with the game and survives a save/restore without duplicating anything', () => {
    const { eng, ids, party, autos, advance, opts } = setup();
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'lobby' } });
    for (let i = 0; i < 10; i++) { advance(10 * MIN); eng.tick(); }
    expect(autos().length).toBe(0);
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhase', phase: 'friday' } });
    for (let i = 0; i < 6; i++) { advance(10 * MIN); eng.tick(); }
    const n = autos().length;
    expect(n).toBeGreaterThan(0);
    const saved: EngineState = JSON.parse(JSON.stringify(eng.state));
    const eng2 = new Engine(opts, saved);
    const p2 = () => eng2.state.parties[party().code];
    expect(Object.values(p2().battles).filter((b) => b.auto).length).toBe(n);
    const xp = ids.map((id) => p2().players[id].xp);
    eng2.tick(); // restored straight away: nothing replays
    expect(ids.map((id) => p2().players[id].xp)).toEqual(xp);
    advance(60 * MIN); eng2.tick();
    expect(Object.values(p2().battles).filter((b) => b.auto).length).toBeGreaterThan(n);
    const all = Object.keys(p2().battles);
    expect(new Set(all).size).toBe(all.length);
  });

  it('migrates an old save that has none of the new fields', () => {
    const { eng, ids, party, opts } = setup(4);
    const raw = JSON.parse(JSON.stringify(eng.state));
    const pr = raw.parties[party().code];
    delete pr.photoMode; delete pr.nextAutoAt;
    for (const p of Object.values<any>(pr.players)) { delete p.h2h; delete p.away; delete p.autoBattles; delete p.lastAutoAt; delete p.recentAuto; delete p.upsetLosses; delete p.reactionsGiven; }
    const eng2 = new Engine(opts, raw);
    const p = eng2.state.parties[party().code];
    expect(p.photoMode).toBe('vote');
    expect(p.players[ids[1]].autoBattles).toBe(true);
    expect(eng2.privateView(p, ids[1])!.away).toEqual([]);
  });
});

describe('photo checks', () => {
  const photoM = MISSIONS.filter((m) => m.method === 'photo' && m.scope === 'private' && !m.starter);
  // a seasoned player: rookies' first few photos skip the vote (tested below)
  const give = (s: ReturnType<typeof setup>, id: string, missionId: string) => { const p = s.party().players[id]; p.hand = [{ missionId, assignedAt: s.now(), status: 'active' }]; p.missionsCompleted = Math.max(p.missionsCompleted, 10); };

  it('the first-challenge selfie and a rookie\'s first photos count straight away, with double XP for rookies', () => {
    const s = setup(5);
    const { eng, ids, party } = s;
    expect(party().photoMode).toBe('vote');
    const selfie = eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: STARTER_MISSION.id, claimId: 'selfie-0001', photo: PHOTO });
    expect((selfie.ack as any).data.status).toBe('approved');
    expect(party().players[ids[2]].level).toBe(2);
    const p = party().players[ids[2]];
    p.hand = [{ missionId: photoM[0].id, assignedAt: s.now(), status: 'active' }];
    const xpBefore = p.xp;
    const r = eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: photoM[0].id, claimId: 'rookie-0001', photo: PHOTO });
    expect((r.ack as any).data.status).toBe('approved');
    expect(p.xp - xpBefore).toBeGreaterThanOrEqual(photoM[0].xp * 2);
    // the boost runs out after three
    p.missionsCompleted = 4;
    p.hand = [{ missionId: photoM[1].id, assignedAt: s.now(), status: 'active' }];
    expect((eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: photoM[1].id, claimId: 'rookie-0002', photo: PHOTO }).ack as any).data.status).toBe('pending');
  });

  it('vote mode: two 👍 from mates count it, the snapper can\'t vote, nothing pays out early', () => {
    const s = setup(5);
    const { eng, ids, party } = s;
    expect(party().photoMode).toBe('vote');
    give(s, ids[1], photoM[0].id);
    const r = eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: photoM[0].id, claimId: 'vote-claim-1', photo: PHOTO });
    expect((r.ack as any).data.status).toBe('pending');
    expect(party().players[ids[1]].points).toBe(0);
    expect(eng.publicView(party()).pendingPhotos.map((x) => x.claimId)).toEqual(['vote-claim-1']);
    expect(party().feed.some((f) => f.kind === 'vote' && f.claimId === 'vote-claim-1')).toBe(true);
    expect(eng.handle(ids[1], { type: 'votePhoto', reqId: 'v', claimId: 'vote-claim-1', up: true }).ack?.ok).toBe(false);
    eng.handle(ids[2], { type: 'votePhoto', reqId: 'v', claimId: 'vote-claim-1', up: true });
    eng.handle(ids[2], { type: 'votePhoto', reqId: 'v', claimId: 'vote-claim-1', up: true }); // one vote each
    expect(party().claims['vote-claim-1'].status).toBe('pending');
    eng.handle(ids[3], { type: 'votePhoto', reqId: 'v', claimId: 'vote-claim-1', up: true });
    expect(party().claims['vote-claim-1'].status).toBe('approved');
    expect(party().players[ids[1]].points).toBeGreaterThanOrEqual(photoM[0].points);
    expect(eng.publicView(party()).pendingPhotos.length).toBe(0);
    expect(party().feed.some((f) => f.kind === 'vote')).toBe(false); // vote card replaced by the normal post
    expect(eng.publicView(party()).gallery.some((g) => g.id === 'vote-claim-1')).toBe(true);
  });

  it('vote mode: two 👎 bin it (photo deleted, challenge back in hand); an unsettled vote times out in the snapper\'s favour', () => {
    const s = setup(5);
    const { eng, ids, party, deleted, advance } = s;
    give(s, ids[1], photoM[0].id);
    eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: photoM[0].id, claimId: 'vote-claim-2', photo: PHOTO });
    eng.handle(ids[2], { type: 'votePhoto', reqId: 'v', claimId: 'vote-claim-2', up: false });
    eng.handle(ids[3], { type: 'votePhoto', reqId: 'v', claimId: 'vote-claim-2', up: false });
    expect(party().claims['vote-claim-2'].status).toBe('rejected');
    expect(deleted.length).toBe(1);
    expect(party().players[ids[1]].points).toBe(0);
    expect(party().players[ids[1]].hand.find((h) => h.missionId === photoM[0].id)?.status).toBe('active');
    // second try: one up, one down → tie at the 20 minute mark goes to the snapper
    eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: photoM[0].id, claimId: 'vote-claim-3', photo: PHOTO });
    eng.handle(ids[2], { type: 'votePhoto', reqId: 'v', claimId: 'vote-claim-3', up: true });
    eng.handle(ids[3], { type: 'votePhoto', reqId: 'v', claimId: 'vote-claim-3', up: false });
    advance(19 * MIN); eng.tick();
    expect(party().claims['vote-claim-3'].status).toBe('pending');
    advance(2 * MIN); eng.tick();
    expect(party().claims['vote-claim-3'].status).toBe('approved');
  });

  it('host mode: photos queue for the host, who can approve, or they go through on their own after 45 min', () => {
    const s = setup(4);
    const { eng, ids, party, advance } = s;
    expect(eng.handle(ids[1], { type: 'host', reqId: 'h', action: { kind: 'setPhotoMode', mode: 'host' } }).ack?.ok).toBe(false);
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhotoMode', mode: 'host' } });
    give(s, ids[1], photoM[0].id); give(s, ids[2], photoM[1].id);
    eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: photoM[0].id, claimId: 'host-claim-1', photo: PHOTO });
    eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: photoM[1].id, claimId: 'host-claim-2', photo: PHOTO });
    expect(eng.hostView(party()).approvals.map((c) => c.id)).toEqual(['host-claim-1', 'host-claim-2']);
    expect(eng.publicView(party()).pendingApprovals).toBe(2);
    expect(eng.publicView(party()).pendingPhotos.length).toBe(0); // not public until approved
    expect(eng.handle(ids[3], { type: 'votePhoto', reqId: 'v', claimId: 'host-claim-1', up: true }).ack?.ok).toBe(false);
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'resolveClaim', claimId: 'host-claim-1', approve: true } });
    expect(party().claims['host-claim-1'].status).toBe('approved');
    advance(46 * MIN); eng.tick();
    expect(party().claims['host-claim-2'].status).toBe('approved');
    // instant mode still exists
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setPhotoMode', mode: 'instant' } });
    give(s, ids[3], photoM[2].id);
    const r = eng.handle(ids[3], { type: 'claimMission', reqId: 'x', missionId: photoM[2].id, claimId: 'host-claim-3', photo: PHOTO });
    expect((r.ack as any).data.status).toBe('approved');
  });

  it('pulling a pending photo withdraws it with no points and no stuck challenge', () => {
    const s = setup(4);
    const { eng, ids, party } = s;
    give(s, ids[1], photoM[0].id);
    eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: photoM[0].id, claimId: 'pull-claim-1', photo: PHOTO });
    eng.handle(ids[1], { type: 'deletePhoto', reqId: 'd', photoId: 'pull-claim-1' });
    expect(party().claims['pull-claim-1'].status).toBe('rejected');
    expect(party().players[ids[1]].hand.find((h) => h.missionId === photoM[0].id)?.status).toBe('active');
    expect(eng.publicView(party()).pendingPhotos.length).toBe(0);
  });

  it('reactions given are counted for Best Hype Man', () => {
    const s = setup(4);
    const { eng, ids, party } = s;
    party().photoMode = 'instant';
    give(s, ids[1], photoM[0].id);
    eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: photoM[0].id, claimId: 'hype-claim-1', photo: PHOTO });
    const ev = party().feed.find((f) => f.claimId === 'hype-claim-1')!;
    eng.handle(ids[2], { type: 'react', reqId: 'r', eventId: ev.id, emoji: '😂' });
    eng.handle(ids[2], { type: 'react', reqId: 'r', eventId: ev.id, emoji: '🔥' });
    expect(party().players[ids[2]].reactionsGiven).toBe(2);
    expect(eng.publicView(party()).awards.find((a) => a.id === 'hypeman')!.playerId).toBe(ids[2]);
  });
});

describe('battle timeline', () => {
  it('matches the engine round by round for 300 random fights across every creature pairing', async () => {
    const { makeCreatureState, resolveRound, autoPick } = await import('../shared/battle');
    const { CREATURE_IDS } = await import('../shared/creatures');
    const { roundSteps } = await import('../client/src/battle/timeline');
    const rng = seededRng(99);
    for (let i = 0; i < 300; i++) {
      const ca = CREATURE_IDS[i % CREATURE_IDS.length]; const cb = CREATURE_IDS[Math.floor(i / CREATURE_IDS.length) % CREATURE_IDS.length];
      const b: any = { id: 't', challengerId: 'x', opponentId: 'y', status: 'active', createdAt: 0, round: 1, a: makeCreatureState('x', ca, 1 + (i % 10)), b: makeCreatureState('y', cb, 1 + ((i * 3) % 10)), log: [], scored: false };
      let hp = { a: b.a.maxHp, b: b.b.maxHp };
      while (b.status === 'active') {
        for (const s of [b.a, b.b]) { const p = autoPick(s, rng); s.action = p.action; s.tap = p.tap; }
        resolveRound(b, rng, {}, 0);
        const r = roundSteps(b, b.log[b.log.length - 1], hp);
        expect(r.after).toEqual({ a: b.a.hp, b: b.b.hp });
        expect(r.steps[r.steps.length - 1]).toMatchObject({ kind: 'settle', hp: r.after });
        hp = r.after;
      }
      expect(buildTimeline(b).final).toEqual({ a: b.a.hp, b: b.b.hp });
    }
  });
});
