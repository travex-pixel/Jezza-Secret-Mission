// Starter kit cosmetics and host giveaways ("up for grabs"): ownership is decided by the engine, never the phone.
import { describe, it, expect } from 'vitest';
import { Engine, GIVEAWAY_MAX_QTY } from '../shared/engine';
import { seededRng } from '../shared/battle';
import { COSMETIC_BY_ID, COSMETICS, STARTER_COSMETICS, cosmeticsForLevel } from '../shared/progression';

const STARTER_KIT = ['hat_party_blue', 'hat_party_purple', 'hat_party_white', 'hat_party_yellow', 'hat_party_green', 'hat_santa', 'hat_bunny'];

function setup(n = 6) {
  let t = 5_000_000;
  const eng = new Engine({ now: () => t, rng: seededRng(11) });
  const ids = Array.from({ length: n }, (_, i) => `player_${String(i).padStart(3, '0')}`);
  ids.forEach((id) => eng.auth(id, 'secret-' + id));
  const code = (eng.handle(ids[0], { type: 'createParty', reqId: '1', nickname: 'Travis' }).ack as any).data.code as string;
  ids.slice(1).forEach((id, i) => eng.handle(id, { type: 'joinParty', reqId: 'j', code, nickname: `Mate${i + 1}` }));
  ids.forEach((id, i) => eng.handle(id, { type: 'chooseCreature', reqId: 'c', creature: (['dragon', 'wombat', 'possum', 'owl', 'goblin', 'fox'] as const)[i % 6] }));
  const party = () => eng.state.parties[code];
  const host = (action: any) => eng.handle(ids[0], { type: 'host', reqId: 'h', action });
  const claim = (id: string, giveawayId: string) => eng.handle(id, { type: 'claimGiveaway', reqId: 'g', giveawayId });
  const release = (item: string, extra: Record<string, unknown> = {}) => (host({ kind: 'makeGiveaway', item, ...extra }).ack as any).data.id as string;
  return { eng, ids, code, party, host, claim, release, advance: (ms: number) => { t += ms; }, now: () => t };
}

describe('starter kit', () => {
  it('has the seven hats in the catalogue, all distinct, all in the hat slot', () => {
    for (const id of STARTER_KIT) { expect(COSMETIC_BY_ID[id], id).toBeDefined(); expect(COSMETIC_BY_ID[id].slot).toBe('hat'); }
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
    expect(new Set(STARTER_KIT.map((id) => COSMETIC_BY_ID[id].name)).size).toBe(7);
    for (const id of STARTER_KIT) expect(STARTER_COSMETICS).toContain(id);
    expect(cosmeticsForLevel(1)).toEqual(expect.arrayContaining(STARTER_KIT));
  });
  it('a new creature owns the kit and can wear any piece of it', () => {
    const { eng, ids, party } = setup();
    const p = party().players[ids[2]];
    expect(p.unlocked).toEqual(expect.arrayContaining(STARTER_KIT));
    expect(eng.handle(ids[2], { type: 'equip', reqId: 'e', equipped: { hat: 'hat_santa' } }).ack?.ok).toBe(true);
    expect(p.equipped.hat).toBe('hat_santa');
    expect(eng.handle(ids[2], { type: 'equip', reqId: 'e', equipped: { hat: 'hat_bunny' } }).ack?.ok).toBe(true);
    expect(eng.handle(ids[2], { type: 'equip', reqId: 'e', equipped: { hat: '' } }).ack?.ok).toBe(true);
    expect(p.equipped.hat).toBeUndefined();
    expect(eng.handle(ids[2], { type: 'equip', reqId: 'e', equipped: { hat: 'hat_viking' } }).ack?.ok).toBe(false); // not owned
    expect(eng.handle(ids[2], { type: 'equip', reqId: 'e', equipped: { face: 'hat_santa' } }).ack?.ok).toBe(false); // wrong slot
  });
  it('a saved party from before the kit existed gets it on load, without touching anything else, and loading twice is the same', () => {
    const { eng, ids, code } = setup();
    const p = eng.state.parties[code].players[ids[3]];
    p.unlocked = ['hat_party', 'face_mo']; // what an older save would hold
    p.equipped.hat = 'hat_party';
    const saved = JSON.parse(JSON.stringify(eng.state));
    const again = new Engine({ now: () => 6_000_000, rng: seededRng(1) }, saved);
    const q = again.state.parties[code].players[ids[3]];
    expect(q.unlocked).toEqual(expect.arrayContaining([...STARTER_KIT, 'hat_party', 'face_mo']));
    expect(q.unlocked.length).toBe(new Set(q.unlocked).size);
    expect(q.equipped.hat).toBe('hat_party');
    const third = new Engine({ now: () => 7_000_000, rng: seededRng(1) }, JSON.parse(JSON.stringify(again.state)));
    expect(third.state.parties[code].players[ids[3]].unlocked).toEqual(q.unlocked);
    // a player who hasn't adopted yet gets nothing (the kit arrives with the creature)
    const fresh = again.state.parties[code].players[ids[4]]; fresh.creature = null; fresh.unlocked = [];
    const fourth = new Engine({ now: () => 7_000_000, rng: seededRng(1) }, JSON.parse(JSON.stringify(again.state)));
    expect(fourth.state.parties[code].players[ids[4]].unlocked).toEqual([]);
  });
});

describe('giveaways', () => {
  it('only the host can release, and bad input is rejected or clamped', () => {
    const { eng, ids, host, party } = setup();
    expect(eng.handle(ids[2], { type: 'host', reqId: 'h', action: { kind: 'makeGiveaway', item: 'hat_viking' } }).ack?.ok).toBe(false);
    expect(host({ kind: 'makeGiveaway', item: 'not_a_thing' }).ack?.ok).toBe(false);
    expect(host({ kind: 'makeGiveaway', item: 'hat_viking', qty: 999, title: 'x'.repeat(200), minutes: 99999 }).ack?.ok).toBe(true);
    const g = party().giveaways[0];
    expect(g.qty).toBe(GIVEAWAY_MAX_QTY);
    expect(g.title.length).toBe(60);
    expect(g.endsAt).toBe(5_000_000 + 24 * 3600_000);
    expect(host({ kind: 'makeGiveaway', item: 'face_mo', qty: -4 }).ack?.ok).toBe(true);
    expect(party().giveaways[1].qty).toBe(1);
    expect(party().giveaways[1].title).toBe('The Mo up for grabs');
    expect(party().giveaways[1].endsAt).toBeNull();
    expect(party().feed.some((f) => /UP FOR GRABS: 1× The Mo/.test(f.text))).toBe(true);
  });
  it('starter items can\'t be given away or put on a code: everyone already has them', () => {
    const { host, party } = setup();
    for (const item of ['hat_santa', 'hat_bunny', 'hat_party_blue', 'hat_party']) {
      const g = host({ kind: 'makeGiveaway', item, qty: 3 });
      expect(g.ack?.ok, item).toBe(false); expect((g.ack as any).error).toMatch(/Everyone already has/);
      expect(host({ kind: 'makeCode', item }).ack?.ok, item).toBe(false);
    }
    expect(party().giveaways.length).toBe(0); expect(party().codes.length).toBe(0);
  });
  it('a double tap on Release does not release twice', () => {
    const { host, party, advance } = setup();
    const a = (host({ kind: 'makeGiveaway', item: 'hat_viking', qty: 2 }).ack as any).data;
    const b = (host({ kind: 'makeGiveaway', item: 'hat_viking', qty: 2 }).ack as any).data;
    expect(b.id).toBe(a.id); expect(b.duplicate).toBe(true);
    expect(party().giveaways.length).toBe(1);
    advance(20_000);
    expect((host({ kind: 'makeGiveaway', item: 'hat_viking', qty: 2 }).ack as any).data.id).not.toBe(a.id); // a deliberate second one later is fine
  });
  it('claims hand out the item and the record together; one each; retries change nothing', () => {
    const { ids, party, claim, release } = setup();
    const id = release('hat_viking', { qty: 2 });
    const r = claim(ids[1], id);
    expect(r.ack?.ok).toBe(true); expect((r.ack as any).data.left).toBe(1);
    expect(party().players[ids[1]].unlocked).toContain('hat_viking');
    expect(party().giveaways[0].claims.map((c) => c.playerId)).toEqual([ids[1]]);
    expect(r.direct.some((d) => d.to === ids[1] && (d.msg as any).type === 'reward' && (d.msg as any).unlocked?.includes('hat_viking'))).toBe(true);
    // same lad again: ok, "already", nothing granted twice, nothing deducted
    const again = claim(ids[1], id);
    expect(again.ack?.ok).toBe(true); expect((again.ack as any).data.already).toBe(true); expect(again.changed).toBe(false);
    expect(party().players[ids[1]].unlocked.filter((x) => x === 'hat_viking').length).toBe(1);
    expect(party().giveaways[0].claims.length).toBe(1);
  });
  it('stock cannot be oversubscribed and the last claim closes it', () => {
    const { ids, party, claim, release } = setup();
    const id = release('aura_rainbow', { qty: 2 });
    expect(claim(ids[1], id).ack?.ok).toBe(true);
    expect(claim(ids[2], id).ack?.ok).toBe(true);
    expect(party().giveaways[0].status).toBe('exhausted');
    const late = claim(ids[3], id);
    expect(late.ack?.ok).toBe(false); expect((late.ack as any).error).toMatch(/All gone/);
    expect(party().players[ids[3]].unlocked).not.toContain('aura_rainbow');
    expect(party().giveaways[0].claims.length).toBe(2);
    expect(party().feed.some((f) => /all gone!/.test(f.text))).toBe(true);
  });
  it('someone who already owns the item is told to leave it for a mate', () => {
    const { ids, party, claim, release } = setup();
    party().players[ids[1]].unlocked.push('face_mo');
    const id = release('face_mo', { qty: 1 });
    const r = claim(ids[1], id);
    expect(r.ack?.ok).toBe(false); expect((r.ack as any).error).toMatch(/already have/);
    expect(party().giveaways[0].claims.length).toBe(0); // stock untouched
    expect(claim(ids[2], id).ack?.ok).toBe(true);
  });
  it('the host can close one early: no more claims, but nobody loses what they grabbed', () => {
    const { ids, party, host, claim, release } = setup();
    const id = release('hat_viking', { qty: 5 });
    claim(ids[1], id);
    expect(host({ kind: 'endGiveaway', giveawayId: id }).ack?.ok).toBe(true);
    expect(party().giveaways[0].status).toBe('cancelled');
    expect(claim(ids[2], id).ack?.ok).toBe(false);
    expect(party().players[ids[1]].unlocked).toContain('hat_viking');
    expect(host({ kind: 'endGiveaway', giveawayId: id }).ack?.ok).toBe(false); // already closed
    expect(host({ kind: 'endGiveaway', giveawayId: 'nope' }).ack?.ok).toBe(false);
  });
  it('a claim window closes on its own, on the tick or on the next tap', () => {
    const { eng, ids, party, claim, release, advance } = setup();
    const id = release('hat_viking', { qty: 5, minutes: 10 });
    advance(9 * 60_000);
    expect(claim(ids[1], id).ack?.ok).toBe(true);
    advance(2 * 60_000);
    const late = claim(ids[2], id);
    expect(late.ack?.ok).toBe(false); expect((late.ack as any).error).toMatch(/closed/);
    expect(party().giveaways[0].status).toBe('ended');
    const other = release('face_mo', { qty: 1, minutes: 1 });
    advance(2 * 60_000);
    eng.tick();
    expect(party().giveaways.find((g) => g.id === other)!.status).toBe('ended');
  });
  it('players only see live giveaways and ones that closed recently; the records themselves are kept', () => {
    const { eng, ids, party, host, release, advance, code } = setup();
    const a = release('hat_viking', { qty: 1 });
    host({ kind: 'endGiveaway', giveawayId: a });
    advance(10_000);
    const b = release('face_mo', { qty: 1 });
    let pub = eng.publicView(party());
    expect(pub.giveaways.map((g) => g.id)).toEqual([a, b]);
    advance(3 * 3600_000);
    pub = eng.publicView(party());
    expect(pub.giveaways.map((g) => g.id)).toEqual([b]);
    expect(party().giveaways.length).toBe(2);
    // survives a save and reload
    const again = new Engine({ now: () => 9_000_000, rng: seededRng(1) }, JSON.parse(JSON.stringify(eng.state)));
    expect(again.state.parties[code].giveaways.map((g) => g.id)).toEqual([a, b]);
    expect(again.handle(ids[3], { type: 'claimGiveaway', reqId: 'g', giveawayId: b }).ack?.ok).toBe(true);
  });
  it('lives beside reward codes: both still work, and neither hands out the same item twice', () => {
    const { eng, ids, party, host, claim, release } = setup();
    const code = (host({ kind: 'makeCode', item: 'hat_viking' }).ack as any).data.code as string;
    expect(eng.handle(ids[1], { type: 'redeemCode', reqId: 'c', code }).ack?.ok).toBe(true);
    const id = release('hat_viking', { qty: 3 });
    expect(claim(ids[1], id).ack?.ok).toBe(false); // got it from the code already
    expect(claim(ids[2], id).ack?.ok).toBe(true);
    const code2 = (host({ kind: 'makeCode', item: 'hat_viking' }).ack as any).data.code as string;
    expect(eng.handle(ids[2], { type: 'redeemCode', reqId: 'c', code: code2 }).ack?.ok).toBe(false); // got it from the giveaway already
    expect(party().players[ids[2]].unlocked.filter((x) => x === 'hat_viking').length).toBe(1);
    expect(party().codes.length).toBe(2);
  });
  it('nobody outside the party, removed, or without a creature can claim', () => {
    const { eng, ids, claim, release, host } = setup();
    const id = release('hat_viking', { qty: 5 });
    expect(claim(ids[1], 'nope').ack?.ok).toBe(false);
    eng.auth('stranger_001', 'secret-stranger');
    expect(eng.handle('stranger_001', { type: 'claimGiveaway', reqId: 'g', giveawayId: id }).ack?.ok).toBe(false);
    host({ kind: 'removePlayer', playerId: ids[2] });
    expect(claim(ids[2], id).ack?.ok).toBe(false);
  });
});
