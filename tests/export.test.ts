// The end-of-weekend export link and keepsake contents, and the solo first selfie.
import { describe, it, expect } from 'vitest';
import { Engine, EXPORT_TOKEN_MS } from '../shared/engine';
import { seededRng } from '../shared/battle';
import { MISSION_BY_ID, ACTIVE_MISSIONS } from '../shared/missions';
import { keepsakeCsvs, keepsakeHtml, photoFileNames, safeFileName } from '../shared/keepsake';
import { crc32 } from '../server/zip';

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
  it('file names are safe on any computer', () => {
    expect(safeFileName('Cellar - 🍷 Shiraz/Grenache: "big" <3')).toBe('Cellar - ShirazGrenache big 3');
    expect(safeFileName('🔥🔥')).toBe('photo');
  });
  it('the zip checksum matches the standard', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });
});
