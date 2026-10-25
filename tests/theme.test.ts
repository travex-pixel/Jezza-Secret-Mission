import { describe, it, expect } from 'vitest';
import { Engine } from '../shared/engine';
import { seededRng } from '../shared/battle';
import { MISSIONS, MISSION_BY_ID, starterFor, tutorialFor, inDeck } from '../shared/missions';
import { THEMES, fill } from '../shared/themes';
import { typicalAfternoon } from '../shared/runsheet';
const SELFIE = 'data:image/jpeg;base64,c2VsZmll';
const NAMES = ['Sis', '', 'Ben', 'Chloe', 'Dan', 'Ella', 'Finn', 'Grace'];

function setup(theme: 'bucks' | 'birthday' | undefined, honourName?: string, n = 8) {
  let t = 1_000_000;
  const eng = new Engine({ now: () => t, rng: seededRng(7) });
  const ids = Array.from({ length: n }, (_, i) => `player_${String(i).padStart(3, '0')}`);
  for (const id of ids) expect(eng.auth(id, 'secret-' + id)).toBe(true);
  const r = eng.handle(ids[0], { type: 'createParty', reqId: '1', nickname: 'Sis', theme, honourName } as any);
  expect(r.ack?.ok).toBe(true);
  const code = (r.ack as any).data.code as string;
  for (let i = 1; i < n; i++) expect(eng.handle(ids[i], { type: 'joinParty', reqId: 'j', code, nickname: i === 1 ? (honourName ?? 'Jezza') : NAMES[i] }).ack?.ok).toBe(true);
  const creatures = ['dragon', 'wombat', 'possum', 'owl', 'goblin', 'sprite', 'barrel', 'fox'] as const;
  ids.forEach((id, i) => expect(eng.handle(id, { type: 'chooseCreature', reqId: 'c', creature: creatures[i % 8] }).ack?.ok).toBe(true));
  eng.state.parties[code].photoMode = 'instant';
  return { eng, ids, code, party: () => eng.state.parties[code], advance: (ms: number) => { t += ms; } };
}

describe('themes', () => {
  it('a birthday party honours its guest, hands out the melon and the birthday deck, and keeps the bucks machinery off', () => {
    const { eng, ids, party } = setup('birthday', 'Vicky');
    const p = party();
    expect(p.theme).toBe('birthday'); expect(p.honourName).toBe('Vicky'); expect(p.name).toBe("Vicky's Birthday");
    expect(p.groomId).toBe(ids[1]);
    expect(p.players[ids[1]].creature).toBe('melon');
    expect(p.autoSaturdayAt).toBeNull(); expect(p.capLifted).toBe(true);
    expect(p.mole).toBeNull();
    // tutorial hand = selfie + Birthday Book entry, nothing from the bucks deck
    const hand = p.players[ids[3]].hand.map((h) => h.missionId);
    expect(hand).toContain('b001'); expect(hand).toContain('b002');
    expect(hand.every((id) => inDeck(MISSION_BY_ID[id], 'birthday'))).toBe(true);
    expect(hand.some((id) => id === 'm002' || id === 'm001')).toBe(false);
    expect(starterFor('birthday').id).toBe('b001');
    expect(tutorialFor('birthday').map((m) => m.id).sort()).toEqual(['b001', 'b002']);
    // no stag for a non-honouree, melon reserved for the birthday girl
    expect(eng.handle(ids[4], { type: 'chooseCreature', reqId: 'c', creature: 'melon' }).ack?.ok).toBe(false);
    expect(eng.handle(ids[4], { type: 'chooseCreature', reqId: 'c', creature: 'stag' }).ack?.ok).toBe(false);
    // no Cellar
    expect(eng.handle(ids[4], { type: 'cellarAdd', reqId: 'd', drink: 'Lemonade', stars: 5 }).ack?.ok).toBe(false);
    // the public view carries the theme
    const view = eng.publicView(p, ids[4]);
    expect(view.theme).toBe('birthday'); expect(view.honourName).toBe('Vicky'); expect(view.bookOpen).toBe(false);
  });

  it('the Birthday Book stays sealed until the host opens it on the TV, and nobody votes in it', () => {
    const { eng, ids, party } = setup('birthday', 'Vicky');
    const text = 'Vicky, you are the kindest person I know. Thanks for always showing up. Happy 30th!';
    const post = eng.handle(ids[3], { type: 'wallPost', reqId: 'w', kind: 'roast', text });
    expect(post.ack?.ok).toBe(true);
    expect(party().wall[0].kind).toBe('toast'); // roasts become toasts in the book
    expect(party().claims[`wall_${party().wall[0].id}`]?.status).toBe('approved'); // the tutorial entry is done by writing
    expect(eng.publicView(party(), ids[4]).wall.length).toBe(0); // sealed for the others
    expect(eng.publicView(party(), ids[3]).wall.length).toBe(1); // you see your own
    expect(eng.publicView(party(), ids[0]).wall.length).toBe(1); // the host sees everything
    expect(eng.handle(ids[4], { type: 'wallVote', reqId: 'v', postId: party().wall[0].id }).ack?.ok).toBe(false);
    expect(eng.handle(ids[1], { type: 'wallVote', reqId: 'v', postId: party().wall[0].id }).ack?.ok).toBe(true); // the birthday girl can ❤️
    expect(eng.handle(ids[5], { type: 'wallPost', reqId: 'w', kind: 'toast', text: 'x'.repeat(281) }).ack?.ok).toBe(false);
    expect(eng.handle(ids[5], { type: 'wallPost', reqId: 'w', kind: 'toast', text: 'y'.repeat(250) }).ack?.ok).toBe(true);
    expect(eng.handle(ids[4], { type: 'host', reqId: 'h', action: { kind: 'setTvMode', mode: 'book' } }).ack?.ok).toBe(false);
    const open = eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setTvMode', mode: 'book' } });
    expect(open.ack?.ok).toBe(true);
    expect(party().bookOpen).toBe(true); expect(party().tvMode).toBe('book');
    expect(eng.publicView(party(), ids[4]).wall.length).toBe(2);
    const k = eng.keepsake(party());
    expect(k.wallTitle).toBe('The Birthday Book'); expect(k.honourName).toBe('Vicky');
  });

  it('the run sheet can open the book, and a typical afternoon ends on it', () => {
    const { eng, ids, party } = setup('birthday', 'Vicky');
    const items = typicalAfternoon(Date.UTC(2026, 10, 7, 1, 0)); // 12:00 Sydney
    expect(items.map((i) => i.action)).toContain('book');
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'runSheetSet', items } }).ack?.ok).toBe(true);
    const book = party().runSheet.find((i) => i.action === 'book')!;
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'runSheetFire', id: book.id } }).ack?.ok).toBe(true);
    expect(party().bookOpen).toBe(true);
  });

  it('the host can rename the guest of honour and the crown follows', () => {
    const { eng, ids, party } = setup('birthday', 'The birthday girl', 6);
    expect(party().groomId).toBeNull();
    expect(eng.handle(ids[0], { type: 'host', reqId: 'h', action: { kind: 'setHonourName', name: 'Chloe' } }).ack?.ok).toBe(true);
    expect(party().honourName).toBe('Chloe'); expect(party().groomId).toBe(ids[3]);
    expect(party().players[ids[3]].creature).toBe('melon');
    expect(eng.publicView(party(), ids[0]).honourName).toBe('Chloe');
  });

  it('bucks parties are untouched: Jezza by default, stag, the old deck, the Wall, Saturday on its own', () => {
    const { eng, ids, party } = setup(undefined);
    const p = party();
    expect(p.theme).toBe('bucks'); expect(p.honourName).toBe('Jezza'); expect(p.name).toBe("Jezza's Bucks Weekend");
    expect(p.groomId).toBe(ids[1]); expect(p.players[ids[1]].creature).toBe('stag');
    expect(p.autoSaturdayAt).not.toBeNull(); expect(p.capLifted).toBe(false);
    const hand = p.players[ids[3]].hand.map((h) => h.missionId);
    expect(hand).toContain('m001'); expect(hand).toContain('m002'); expect(hand).not.toContain('b002');
    expect(hand.every((id) => inDeck(MISSION_BY_ID[id], 'bucks'))).toBe(true);
    expect(eng.handle(ids[4], { type: 'chooseCreature', reqId: 'c', creature: 'melon' }).ack?.ok).toBe(false);
    expect(eng.handle(ids[4], { type: 'cellarAdd', reqId: 'd', drink: 'Shiraz', stars: 4 }).ack?.ok).toBe(true);
    expect(eng.handle(ids[3], { type: 'wallPost', reqId: 'w', kind: 'roast', text: 'That haircut in 2014 though.' }).ack?.ok).toBe(true);
    expect(eng.publicView(p, ids[4]).wall.length).toBe(1); // the Wall is public at a bucks
    expect(eng.handle(ids[4], { type: 'wallVote', reqId: 'v', postId: p.wall[0].id }).ack?.ok).toBe(true);
    const k = eng.keepsake(p);
    expect(k.wallTitle).toBe('Jezza Wall'); expect(k.honourName).toBe('Jezza');
  });

  it('a pre-theme save migrates to a bucks party about Jezza with the same words as before', () => {
    const { eng, ids, code } = setup(undefined);
    const raw = JSON.parse(JSON.stringify(eng.state));
    delete raw.parties[code].theme; delete raw.parties[code].honourName; delete raw.parties[code].bookOpen;
    const again = new Engine({}, raw);
    const p = again.state.parties[code];
    expect(p.theme).toBe('bucks'); expect(p.honourName).toBe('Jezza'); expect(p.bookOpen).toBe(false);
    expect(again.publicView(p, ids[3]).honourName).toBe('Jezza');
    expect(fill(MISSION_BY_ID['m002'].title, 'bucks', 'Jezza')).toBe('Roast Jezza');
    expect(fill(MISSION_BY_ID['m002'].title, 'birthday', 'Vicky')).toBe('Roast Vicky');
    expect(fill('{Role} Whisperer: {name} said {he} loves {his} {crowd}', 'bucks', 'Jezza')).toBe('The groom Whisperer: Jezza said he loves his the lads');
    expect(fill('{Role} Whisperer', 'birthday', 'Vicky')).toBe('The birthday girl Whisperer');
  });

  it('no mission text still hard-codes Jezza, and every mission belongs to a deck', () => {
    for (const m of MISSIONS) {
      expect(`${m.title} ${m.instruction}`).not.toMatch(/jezza/i);
      expect(inDeck(m, 'bucks') || inDeck(m, 'birthday')).toBe(true);
    }
    expect(MISSIONS.filter((m) => inDeck(m, 'birthday') && !m.tutorial && !m.retired).length).toBeGreaterThanOrEqual(20);
    expect(THEMES.birthday.features.drinks).toBe(false);
  });
});
