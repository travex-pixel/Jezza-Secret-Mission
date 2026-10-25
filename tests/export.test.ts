// The end-of-weekend export link and keepsake contents, and the solo first selfie.
import { describe, it, expect } from 'vitest';
import { Engine, EXPORT_TOKEN_MS } from '../shared/engine';
import { seededRng } from '../shared/battle';
import { MISSION_BY_ID, ACTIVE_MISSIONS } from '../shared/missions';
import { keepsakeCsvs, keepsakeHtml, photoFileNames, safeFileName } from '../shared/keepsake';
import { crc32 } from '../server/zip';
import { LEVEL_XP, FRIDAY_MAX_LEVEL } from '../shared/progression';

const PHOTO = 'data:image/jpeg;base64,AAAA';
function setup() {
  let t = 9_000_000; let n = 0;
  const eng = new Engine({ now: () => t, rng: seededRng(5), storePhoto: (_d, code) => `/photos/${code}_k${(n++).toString(36)}_abc.jpeg` });
  const ids = ['player_exp_0001', 'player_exp_0002', 'player_exp_0003'];
  ids.forEach((id) => eng.auth(id, 'secret-' + id));
  const code = (eng.handle(ids[0], { type: 'createParty', reqId: '1', nickname: 'Travis' }).ack as any).data.code as string;
  eng.handle(ids[1], { type: 'joinParty', reqId: 'j', code, nickname: 'Big Dave' });
  eng.handle(ids[2], { type: 'joinParty', reqId: 'j', code, nickname: 'Tommo' });
  ids.forEach((id, i) => eng.handle(id, { type: 'chooseCreature', reqId: 'c', creature: (['dragon', 'wombat', 'owl'] as const)[i] }));
  return { eng, ids, code, party: () => eng.state.parties[code], advance: (ms: number) => { t += ms; } };
}

describe('first challenge', () => {
  it('is a selfie anyone can do from anywhere; the group selfie is still in the deck', () => {
    const m = MISSION_BY_ID.m001;
    expect(m.starter && m.selfie && m.method === 'photo').toBe(true);
    expect(m.instruction).not.toMatch(/with (Jezza|the lads|the boys|at least)|at least/i); // nobody needs to be with anyone
    const group = ACTIVE_MISSIONS.find((x) => x.title === 'Get the Boys Online')!;
    expect(group.method).toBe('photo'); expect(group.difficulty).toBe(1);
  });
});

describe('profile picture from the first selfie', () => {
  it('the face square sent with the selfie becomes the lad\'s picture; nothing else sets it', () => {
    const { eng, ids, party } = setup();
    const face = 'data:image/jpeg;base64,' + 'F'.repeat(2000);
    eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: 'm001', claimId: 'face-claim-01', photo: PHOTO, avatar: face });
    const url = party().players[ids[1]].avatarUrl;
    expect(url).toMatch(/^\/photos\//);
    expect(eng.publicView(party()).players.find((p) => p.id === ids[1])!.avatarUrl).toBe(url);
    // too big to be a thumbnail: ignored, but the selfie still counts
    const r = eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'm001', claimId: 'face-claim-02', photo: PHOTO, avatar: 'data:image/jpeg;base64,' + 'F'.repeat(90_000) });
    expect(r.ack?.ok).toBe(true); expect(party().players[ids[2]].avatarUrl).toBeUndefined();
    // any other photo challenge never touches it
    party().players[ids[2]].hand = [{ missionId: 'n13', assignedAt: 0, status: 'active' }];
    party().photoMode = 'instant';
    eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'n13', claimId: 'face-claim-03', photo: PHOTO, avatar: face });
    expect(party().players[ids[2]].avatarUrl).toBeUndefined();
  });
  it('taking the selfie down takes the picture with it; so does Delete all photos', () => {
    const deleted: string[] = [];
    let n = 0;
    const eng = new Engine({ now: () => 1_000_000, rng: seededRng(2), storePhoto: (_d, c) => `/photos/${c}_f${(n++).toString(36)}_abc.jpeg`, deletePhotos: (u) => { deleted.push(...u); } });
    const ids = ['player_face_0001', 'player_face_0002'];
    ids.forEach((id) => eng.auth(id, 'secret-' + id));
    const code = (eng.handle(ids[0], { type: 'createParty', reqId: '1', nickname: 'Travis' }).ack as any).data.code as string;
    eng.handle(ids[1], { type: 'joinParty', reqId: 'j', code, nickname: 'Tommo' });
    ids.forEach((id) => eng.handle(id, { type: 'chooseCreature', reqId: 'c', creature: 'owl' }));
    const party = eng.state.parties[code];
    const face = 'data:image/jpeg;base64,FFFF';
    ids.forEach((id, i) => eng.handle(id, { type: 'claimMission', reqId: 'x', missionId: 'm001', claimId: `face-del-0${i}`, photo: PHOTO, avatar: face }));
    const tommoFace = party.players[ids[1]].avatarUrl!;
    expect(eng.handle(ids[1], { type: 'deletePhoto', reqId: 'd', photoId: 'face-del-01' }).ack?.ok).toBe(true);
    expect(party.players[ids[1]].avatarUrl).toBeUndefined();
    expect(deleted).toContain(tommoFace);
    const hostFace = party.players[ids[0]].avatarUrl!;
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'purgePhotos' } });
    expect(party.players[ids[0]].avatarUrl).toBeUndefined();
    expect(deleted).toContain(hostFace);
  });
});

describe('keepsake export', () => {
  it('only the host gets a download link, and it stops working after 15 minutes', () => {
    const { eng, ids, code, advance } = setup();
    expect(eng.handle(ids[1], { type: 'host', reqId: 'h', action: { kind: 'exportToken' } }).ack?.ok).toBe(false);
    const r = eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'exportToken' } });
    const { token } = (r.ack as any).data;
    expect(token).toMatch(/^[a-z2-9]{24}$/);
    expect(r.changed).toBe(false); // nothing saved, so it never lands in state.json
    expect(JSON.stringify(eng.state)).not.toContain(token);
    expect(eng.exportCodeFor(token)).toBe(code);
    expect(eng.exportCodeFor('nope')).toBeNull();
    advance(EXPORT_TOKEN_MS + 1);
    expect(eng.exportCodeFor(token)).toBeNull();
  });
  it('has every photo still on the server (votes still open included, voted-out ones not), the Wall and the board', () => {
    const { eng, ids, party } = setup();
    eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: 'm001', claimId: 'exp-claim-0001', photo: PHOTO });
    eng.handle(ids[1], { type: 'wallPost', reqId: 'w', kind: 'roast', text: 'Jezza "five minutes away" since 2014, mate.' });
    eng.handle(ids[2], { type: 'wallPost', reqId: 'w', kind: 'toast', text: 'To the bloke who turns up when it counts. Cheers Jez.' });
    // one still being voted on, one voted out
    party().claims['exp-pending'] = { id: 'exp-pending', playerId: ids[2], missionId: 'n13', status: 'pending', createdAt: 9_000_100, photoUrl: '/photos/X_pend_abc.jpeg' } as any;
    party().claims['exp-rejected'] = { id: 'exp-rejected', playerId: ids[2], missionId: 'n07', status: 'rejected', createdAt: 9_000_200, photoUrl: '/photos/X_rej_abc.jpeg' } as any;
    const k = eng.keepsake(party());
    expect(k.photos.map((p) => p.caption)).toEqual(['Show Your Face', 'No Questions Asked']);
    expect(k.photos[0].author).toBe('Big Dave');
    expect(k.wall.map((w) => w.kind).sort()).toEqual(['roast', 'toast']);
    expect(k.board.length).toBe(3);
    const names = photoFileNames(k);
    expect(names).toEqual(['001 Big Dave - Show Your Face.jpeg', '002 Tommo - No Questions Asked.jpeg']);
    const csv = keepsakeCsvs(k, names);
    expect(csv['roasts-and-toasts.csv']).toContain('"Jezza ""five minutes away"" since 2014, mate."'); // quotes survive
    expect(csv['photos.csv']).toContain('001 Big Dave - Show Your Face.jpeg');
    const html = keepsakeHtml(k, (i) => `photos/${names[i]}`, '');
    expect(html).toContain('src="photos/001 Big Dave - Show Your Face.jpeg"');
    expect(html).toContain('&quot;five minutes away&quot;'); // escaped, not raw
  });
  it('keeps the whole weekend\'s feed for the keepsake and a stats row per lad, even after the live feed has rolled over', () => {
    const { eng, ids, party } = setup();
    for (let i = 0; i < 80; i++) eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'grantPoints', playerId: ids[1 + (i % 2)], points: 1, reason: `Line number ${i}` } });
    expect(party().feed.length).toBeLessThanOrEqual(60);
    const k = eng.keepsake(party());
    expect(k.feed.length).toBeGreaterThan(80); // joins, adoptions and 80 host lines
    expect(k.feed[0].at).toBeLessThanOrEqual(k.feed[k.feed.length - 1].at);
    expect(k.stats.length).toBe(3);
    const me = k.stats.find((s) => s.nickname === 'Big Dave')!;
    expect(me.creature).toBe('Wombat Warrior');
    const csv = keepsakeCsvs(k, photoFileNames(k));
    expect(csv['stats.csv'].split('\r\n')[0]).toContain('Raid damage');
    expect(csv['feed.csv']).toContain('Line number 79');
    // survives a save and reload
    const again = new Engine({ now: () => 9_000_001, rng: seededRng(1) }, JSON.parse(JSON.stringify(eng.state)));
    expect(again.keepsake(again.state.parties[party().code]).feed.length).toBe(k.feed.length);
  });
  it('file names are safe on any computer', () => {
    expect(safeFileName('Cellar - 🍷 Shiraz/Grenache: "big" <3')).toBe('Cellar - ShirazGrenache big 3');
    expect(safeFileName('🔥🔥')).toBe('photo');
  });
  it('the zip checksum matches the standard', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });
});

describe('host hype levers', () => {
  it('double XP doubles every XP gain until it runs out; only the host can call it', () => {
    const { eng, ids, party, advance } = setup();
    expect(eng.handle(ids[1], { type: 'host', reqId: 'h', action: { kind: 'xpBoost', minutes: 30 } }).ack?.ok).toBe(false);
    // the same selfie (plus its badges) earns twice as much while the boost is on
    const q = party().players[ids[2]]; const b2 = q.xp;
    eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'm001', claimId: 'boost-claim-02', photo: PHOTO });
    const plain = q.xp - b2;
    eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'xpBoost', minutes: 30 } });
    expect(eng.publicView(party()).xpBoostUntil).toBe(9_000_000 + 30 * 60_000);
    const p = party().players[ids[1]]; const before = p.xp;
    eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: 'm001', claimId: 'boost-claim-01', photo: PHOTO });
    expect(p.xp - before).toBe(plain * 2);
    advance(31 * 60_000);
    expect(eng.publicView(party()).xpBoostUntil).toBeNull();
  });
  it('unlocking final forms early lifts the Friday cap, once', () => {
    const { eng, ids, party } = setup();
    const p = party().players[ids[1]];
    p.xp = LEVEL_XP[FRIDAY_MAX_LEVEL] - 1; p.level = 7; // at the Friday ceiling
    eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: 'm001', claimId: 'cap-claim-01', photo: PHOTO });
    expect(p.level).toBe(7);
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'liftXpCap' } }).ack?.ok).toBe(true);
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'liftXpCap' } }).ack?.ok).toBe(false);
    const q = party().players[ids[2]]; q.xp = LEVEL_XP[FRIDAY_MAX_LEVEL] - 1; q.level = 7;
    eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'm001', claimId: 'cap-claim-02', photo: PHOTO });
    expect(q.level).toBeGreaterThanOrEqual(8);
    expect(eng.publicView(party()).capLifted).toBe(true);
  });
});

describe('photo drop', () => {
  it('any photo, no challenge, repeatable with a breather, counts as points but not as a challenge', () => {
    const { eng, ids, party, advance } = setup();
    const p = party().players[ids[1]];
    expect(p.hand.some((h) => h.missionId === 'f01')).toBe(false); // never dealt
    const before = { pts: p.points, done: p.missionsCompleted, xp: p.xp };
    const r = eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: 'f01', claimId: 'drop-claim-0001', photo: PHOTO, note: 'Shorty asleep in the esky' });
    expect(r.ack?.ok).toBe(true); expect((r.ack as any).data.status).toBe('approved'); // no vote
    expect(p.points - before.pts).toBe(5); expect(p.xp - before.xp).toBe(10);
    expect(p.missionsCompleted).toBe(before.done); // not a challenge
    expect(party().feed.at(-1)!.text).toContain('dropped a photo: “Shorty asleep in the esky”');
    expect(eng.publicView(party()).gallery.some((g) => g.id === 'drop-claim-0001')).toBe(true);
    const again = eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: 'f01', claimId: 'drop-claim-0002', photo: PHOTO });
    expect(again.ack?.ok).toBe(false); expect((again.ack as any).error).toMatch(/every 3 minutes/);
    advance(3 * 60_000 + 1);
    expect(eng.handle(ids[1], { type: 'claimMission', reqId: 'x', missionId: 'f01', claimId: 'drop-claim-0003', photo: PHOTO }).ack?.ok).toBe(true);
    expect(eng.handle(ids[2], { type: 'claimMission', reqId: 'x', missionId: 'f01', claimId: 'drop-claim-0004' }).ack?.ok).toBe(false); // needs a photo
  });
});

describe('the long grind', () => {
  it('level 10 is still 2200 XP, 15 takes 9600; battles stop scaling at 10', async () => {
    const { levelForXp, MAX_LEVEL, titleForLevel } = await import('../shared/progression');
    const { makeCreatureState } = await import('../shared/battle');
    expect(levelForXp(2200)).toBe(10); expect(levelForXp(3099)).toBe(10); expect(levelForXp(3100)).toBe(11);
    expect(levelForXp(9600)).toBe(15); expect(levelForXp(999_999)).toBe(15); expect(MAX_LEVEL).toBe(15);
    expect(titleForLevel(15)).toBe('{name} TIER'); expect(titleForLevel(10)).toBe('Hunter Valley Legend');
    expect(makeCreatureState('x', 'dragon', 15).maxHp).toBe(makeCreatureState('x', 'dragon', 10).maxHp);
  });
});
