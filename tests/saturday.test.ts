// Saturday systems: Lucky Drops, Quests, The Mole, battle taunts, the raid weak spot and the comeback boost.
import { describe, it, expect } from 'vitest';
import { Engine } from '../shared/engine';
import { seededRng } from '../shared/battle';
import { COSMETIC_BY_ID } from '../shared/progression';
import { DROP_EVERY, DROP_ITEMS, QUEST_BY_ID, RARITIES, RARITY, rollRarity, rollDrop, MOLE_POINTS } from '../shared/saturday';
import { MISSIONS } from '../shared/missions';
import { ROWDY_PROMPTS } from '../shared/rowdy';

const PHOTO = 'data:image/jpeg;base64,AAAA';
const PHOTO_M = MISSIONS.filter((m) => m.method === 'photo' && m.scope === 'private' && !m.tutorial && !m.retired && !m.free);
function setup(n = 6, seed = 3) {
  let t = 7_000_000;
  const eng = new Engine({ now: () => t, rng: seededRng(seed) });
  const ids = Array.from({ length: n }, (_, i) => `player_sat_${String(i).padStart(3, '0')}`);
  ids.forEach((id) => eng.auth(id, 'secret-' + id));
  const names = ['Travis', 'Jezza', 'Tommo', 'Big Dave', 'Nath', 'Shorty', 'Robbo', 'Lachy'];
  const code = (eng.handle(ids[0], { type: 'createParty', reqId: '1', nickname: names[0] }).ack as any).data.code as string;
  ids.slice(1).forEach((id, i) => eng.handle(id, { type: 'joinParty', reqId: 'j', code, nickname: names[i + 1] ?? `Lad ${i + 1}` }));
  ids.forEach((id, i) => eng.handle(id, { type: 'chooseCreature', reqId: 'c', creature: (['dragon', 'wombat', 'possum', 'owl', 'goblin', 'fox', 'sprite', 'barrel'] as const)[i % 8] }));
  const party = () => eng.state.parties[code];
  party().photoMode = 'instant';
  const host = (action: any) => eng.handle(ids[0], { type: 'host', reqId: 'h', action });
  const priv = (id: string) => eng.privateView(party(), id)!;
  let claimN = 0;
  const doPhoto = (id: string) => { const m = PHOTO_M.find((x) => !party().players[id].completedMissionIds.includes(x.id))!; party().players[id].hand = [{ missionId: m.id, assignedAt: t, status: 'active' }]; return eng.handle(id, { type: 'claimMission', reqId: 'x', missionId: m.id, claimId: `sat_claim_${claimN++}`, photo: PHOTO }); };
  return { eng, ids, code, party, host, priv, doPhoto, advance: (ms: number) => { t += ms; } };
}

describe('Lucky Drops', () => {
  it('every item in the drop tables exists and carries its rarity; the odds add up', () => {
    for (const r of RARITIES) for (const id of DROP_ITEMS[r]) { expect(COSMETIC_BY_ID[id], id).toBeDefined(); }
    expect(RARITIES.reduce((n, r) => n + RARITY[r].weight, 0)).toBe(100);
    const rng = seededRng(1); const counts: Record<string, number> = {};
    for (let i = 0; i < 20000; i++) { const r = rollRarity(rng); counts[r] = (counts[r] ?? 0) + 1; }
    expect(counts.legendary / 20000).toBeGreaterThan(0.035); expect(counts.legendary / 20000).toBeLessThan(0.07); // "not impossible"
    expect(counts.epic / 20000).toBeGreaterThan(0.12);
    const d = rollDrop(seededRng(2), [], 'challenge', 1, 'legendary');
    expect(d.item && DROP_ITEMS.legendary.includes(d.item)).toBe(true);
    const owned = rollDrop(seededRng(2), DROP_ITEMS.legendary, 'challenge', 1, 'legendary');
    expect(owned.item).toBeUndefined(); expect(owned.points).toBeGreaterThan(RARITY.legendary.dupPoints); // all owned: points instead
  });
  it(`a drop lands every ${DROP_EVERY}rd challenge; opening grants the contents once; the server never trusts the phone`, () => {
    const { eng, ids, party, priv, doPhoto } = setup();
    const id = ids[2];
    for (let i = 0; i < DROP_EVERY - 1; i++) doPhoto(id);
    expect(priv(id).drops.length).toBe(0);
    const r = doPhoto(id);
    expect(priv(id).drops.length).toBe(1);
    expect(r.direct.some((d) => d.to === id && /Lucky Drop landed/.test((d.msg as any).text ?? ''))).toBe(true);
    const drop = priv(id).drops[0];
    const p = party().players[id]; const pts = p.points; const xp = p.xp; const items = p.unlocked.length;
    const open = eng.handle(id, { type: 'openDrop', reqId: 'o', dropId: drop.id });
    expect(open.ack?.ok).toBe(true);
    const got = (open.ack as any).data.drop;
    expect(p.points - pts).toBe(got.points); expect(p.xp - xp).toBeGreaterThanOrEqual(got.xp);
    if (got.item) { expect(p.unlocked).toContain(got.item); expect(p.unlocked.length).toBe(items + 1); }
    expect(priv(id).drops.length).toBe(0); // opened ones leave the list
    const again = eng.handle(id, { type: 'openDrop', reqId: 'o', dropId: drop.id });
    expect(again.ack?.ok).toBe(true); expect((again.ack as any).data.already).toBe(true); expect(p.points - pts).toBe(got.points); // no double dip
    expect(eng.handle(ids[3], { type: 'openDrop', reqId: 'o', dropId: drop.id }).ack?.ok).toBe(false); // not yours
    expect(eng.handle(id, { type: 'openDrop', reqId: 'o', dropId: 'nope' }).ack?.ok).toBe(false);
  });
  it('the host can drop one on everyone, of a chosen rarity; only the host', () => {
    const { eng, ids, host, priv } = setup();
    expect(eng.handle(ids[1], { type: 'host', reqId: 'h', action: { kind: 'giveDrops', rarity: 'legendary' } }).ack?.ok).toBe(false);
    expect(host({ kind: 'giveDrops', rarity: 'legendary' }).ack?.ok).toBe(true);
    for (const id of ids) { expect(priv(id).drops.length).toBe(1); expect(priv(id).drops[0].rarity).toBe('legendary'); expect(priv(id).drops[0].source).toBe('host'); }
    expect(host({ kind: 'giveDrops', playerId: ids[2] }).ack?.ok).toBe(true);
    expect(priv(ids[2]).drops.length).toBe(2); expect(priv(ids[3]).drops.length).toBe(1);
  });
  it('a late arrival gets a welcome drop with Fresh Legs', () => {
    const { host, priv, ids } = setup();
    host({ kind: 'setCatchUp', playerId: ids[4], on: true });
    expect(priv(ids[4]).drops.some((d) => d.source === 'gift' && d.rarity === 'rare')).toBe(true);
  });
});

describe('Saturday Quests', () => {
  it('everyone gets three at the Saturday switch; progress counts from then; finishing pays points and a drop', () => {
    const { eng, ids, party, host, priv, doPhoto } = setup();
    doPhoto(ids[2]); // Friday work doesn't count
    expect(priv(ids[2]).quests.length).toBe(0);
    host({ kind: 'setPhase', phase: 'saturday' });
    for (const id of ids) expect(priv(id).quests.length).toBe(3);
    expect(new Set(priv(ids[2]).quests.map((q) => q.defId)).size).toBe(3);
    expect(priv(ids[2]).quests.every((q) => q.progress === 0)).toBe(true);
    expect(priv(ids[1]).quests.some((q) => q.defId === 'jezza3')).toBe(false); // the groom can't get the groom in
    // give Tommo the Grinder quest and do it
    const p = party().players[ids[2]];
    p.quests = [{ defId: 'missions5', baseline: p.missionsCompleted, done: false }];
    const before = p.points; const drops = priv(ids[2]).drops.length;
    for (let i = 0; i < 5; i++) doPhoto(ids[2]);
    const q = priv(ids[2]).quests[0];
    expect(q.done).toBe(true); expect(q.progress).toBe(5);
    expect(p.points - before).toBeGreaterThanOrEqual(QUEST_BY_ID.missions5.points);
    expect(priv(ids[2]).drops.length).toBeGreaterThan(drops);
    expect(priv(ids[2]).drops.some((d) => d.source === 'quest' && d.rarity === QUEST_BY_ID.missions5.drop)).toBe(true);
    expect(party().feed.some((f) => /finished the quest "Grinder"/.test(f.text))).toBe(true);
    doPhoto(ids[2]);
    expect(p.quests[0].done).toBe(true); expect(party().feed.filter((f) => /finished the quest "Grinder"/.test(f.text)).length).toBe(1); // once
  });
  it("a fight quest ticks over when a fight is actually fought, for both sides' quests", () => {
    const { eng, ids, party, host, priv, advance } = setup();
    host({ kind: 'setPhase', phase: 'saturday' });
    const a = party().players[ids[2]], b = party().players[ids[3]];
    const base = a.fairFights;
    a.quests = [{ defId: 'fights5', baseline: a.fairFights, done: false }]; b.quests = [{ defId: 'fights5', baseline: b.fairFights, done: false }];
    for (let i = 0; i < 5; i++) {
      const bid = (eng.handle(ids[2], { type: 'challenge', reqId: 'c', opponentId: ids[3] }).ack as any).data.battleId as string;
      eng.handle(ids[3], { type: 'respondChallenge', reqId: 'r', battleId: bid, accept: true });
      // a plays every round, b's phone is face down: the fight times out in a's favour (a real finish, unlike a surrender)
      for (let r = 0; r < 12 && party().battles[bid].status === 'active'; r++) { eng.handle(ids[2], { type: 'battleAction', reqId: 'x', battleId: bid, round: party().battles[bid].round, action: 'attack' } as any); advance(60_000); eng.tick(); }
      expect(party().battles[bid].status).toBe('finished');
    }
    expect(party().players[ids[2]].fairFights - base).toBe(5);
    expect(priv(ids[2]).quests[0].done).toBe(true); expect(priv(ids[3]).quests[0].done).toBe(true);
  });
  it('a lad who adopts on Saturday gets quests straight away; a saved Saturday party gets them on load', () => {
    const { eng, ids, code, party, host, priv } = setup();
    host({ kind: 'setPhase', phase: 'saturday' });
    eng.auth('player_sat_late1', 'secret-late1');
    eng.handle('player_sat_late1', { type: 'joinParty', reqId: 'j', code, nickname: 'Latecomer' });
    eng.handle('player_sat_late1', { type: 'chooseCreature', reqId: 'c', creature: 'owl' });
    expect(priv('player_sat_late1').quests.length).toBe(3);
    for (const p of Object.values(party().players)) p.quests = [];
    party().mole = null;
    const again = new Engine({ now: () => 8_000_000, rng: seededRng(4) }, JSON.parse(JSON.stringify(eng.state)));
    const sp = again.state.parties[code];
    expect(Object.values(sp.players).every((p) => p.quests.length === 3)).toBe(true);
    expect(sp.mole).not.toBeNull();
  });
});

describe('The Mole', () => {
  it('is picked at the Saturday switch (not the host, not the groom), gets secret missions, and only they can tick them', () => {
    const { eng, ids, party, host, priv } = setup();
    host({ kind: 'setPhase', phase: 'saturday' });
    const m = party().mole!;
    expect(m).toBeTruthy(); expect(m.moles.length).toBe(1); // 5 eligible lads: one Mole
    const moleId = m.moles[0].playerId;
    expect(moleId).not.toBe(ids[0]); expect(moleId).not.toBe(party().groomId);
    expect(m.moles[0].missions.length).toBe(3);
    expect(priv(moleId).mole?.missions.length).toBe(3);
    const other = ids.find((id) => id !== moleId && id !== ids[0])!;
    expect(priv(other).mole).toBeUndefined();
    expect(priv(other).moleHost).toBeUndefined();
    expect(priv(ids[0]).moleHost).toEqual([{ playerId: moleId, done: 0, total: 3 }]); // the host alone sees who it is
    expect(eng.publicView(party()).mole).toEqual({ active: true, voting: true, votes: 0, count: 1, revealed: undefined });
    expect(eng.handle(other, { type: 'moleDone', reqId: 'm', index: 0 }).ack?.ok).toBe(false);
    const pts = party().players[moleId].points;
    expect(eng.handle(moleId, { type: 'moleDone', reqId: 'm', index: 0 }).ack?.ok).toBe(true);
    expect(party().players[moleId].points - pts).toBe(MOLE_POINTS.mission);
    expect(priv(ids[0]).moleHost![0].done).toBe(1);
    expect(party().feed.some((f) => f.playerId === moleId && /mission/i.test(f.text))).toBe(false); // nothing in the feed
    expect((eng.handle(moleId, { type: 'moleDone', reqId: 'm', index: 0 }).ack as any).data.already).toBe(true);
  });
  it('votes are secret, changeable, scored at the reveal; caught vs got away', () => {
    const { eng, ids, party, host, priv } = setup(9);
    host({ kind: 'setPhase', phase: 'saturday' });
    expect(party().mole!.moles.length).toBe(1); // 7 eligible: still one by default
    const mole = party().mole!.moles[0].playerId;
    const others = ids.filter((id) => id !== mole && id !== ids[0]); // the host can see the answer, so the host doesn't vote
    expect(eng.handle(ids[0], { type: 'moleVote', reqId: 'v', suspectId: mole }).ack?.ok).toBe(false);
    expect(eng.handle(others[0], { type: 'moleVote', reqId: 'v', suspectId: others[0] }).ack?.ok).toBe(false); // not yourself
    for (const id of others.slice(0, 5)) eng.handle(id, { type: 'moleVote', reqId: 'v', suspectId: mole }); // 5 right
    eng.handle(others[5], { type: 'moleVote', reqId: 'v', suspectId: others[0] }); // 1 wrong
    eng.handle(others[5], { type: 'moleVote', reqId: 'v', suspectId: others[1] }); // changed mind: one Mole, so the new name replaces the old
    expect(priv(others[5]).moleVotes).toEqual([others[1]]);
    eng.handle(others[6], { type: 'moleVote', reqId: 'v', suspectId: others[0] });
    eng.handle(others[6], { type: 'moleVote', reqId: 'v', suspectId: others[0] }); // tapped again: taken back
    expect(priv(others[6]).moleVotes).toEqual([]);
    expect(eng.publicView(party()).mole!.votes).toBe(6);
    const before = Object.fromEntries(ids.map((id) => [id, party().players[id].points]));
    const notHost = others.find((id) => id !== ids[0])!;
    expect(eng.handle(notHost, { type: 'host', reqId: 'h', action: { kind: 'revealMole' } }).ack?.ok).toBe(false); // host only
    const r = host({ kind: 'revealMole' });
    expect(r.ack?.ok).toBe(true); expect((r.ack as any).data.moles).toEqual([{ playerId: mole, caught: true }]);
    for (const id of others.slice(0, 5)) expect(party().players[id].points - before[id]).toBe(MOLE_POINTS.correctGuess);
    expect(party().players[others[5]].points - before[others[5]]).toBe(0);
    expect(party().players[mole].points - before[mole]).toBe(MOLE_POINTS.caught);
    expect(eng.publicView(party()).mole!.revealed!.moles[0].caught).toBe(true);
    expect(priv(ids[0]).moleHost).toBeUndefined(); // nothing left to hide
    expect(eng.handle(others[0], { type: 'moleVote', reqId: 'v', suspectId: mole }).ack?.ok).toBe(false); // closed
    expect(host({ kind: 'revealMole' }).ack?.ok).toBe(false);
    // a new Mole can be picked after a reveal; this one gets away
    expect(host({ kind: 'assignMole', playerId: others[2] }).ack?.ok).toBe(true);
    expect(party().mole!.moles[0].playerId).toBe(others[2]);
    eng.handle(others[0], { type: 'moleVote', reqId: 'v', suspectId: others[3] });
    const b2 = party().players[others[2]].points;
    expect((host({ kind: 'revealMole' }).ack as any).data.moles[0].caught).toBe(false);
    expect(party().players[others[2]].points - b2).toBe(MOLE_POINTS.escaped);
  });
  it('two Moles: picked by default in a big room, two names each, scored per name, host can add a third', () => {
    const { eng, ids, party, host, priv } = setup(12, 5);
    host({ kind: 'setPhase', phase: 'saturday' });
    const m = party().mole!;
    expect(m.moles.length).toBe(2); // 10 eligible → two Moles
    const [a, b] = m.moles.map((x) => x.playerId);
    expect(new Set(m.moles.flatMap((x) => x.missions.map((y) => y.text))).size).toBe(6); // no shared gags
    expect(priv(ids[0]).moleHost!.map((x) => x.playerId).sort()).toEqual([a, b].sort());
    expect(priv(a).mole?.missions.length).toBe(3); expect(priv(b).mole?.missions.length).toBe(3);
    expect(eng.publicView(party()).mole!.count).toBe(2);
    const voters = ids.filter((id) => id !== a && id !== b && id !== ids[0]);
    const [v1, v2, v3] = voters;
    eng.handle(v1, { type: 'moleVote', reqId: 'v', suspectId: a }); eng.handle(v1, { type: 'moleVote', reqId: 'v', suspectId: b }); // both right
    expect(priv(v1).moleVotes).toEqual([a, b]);
    eng.handle(v1, { type: 'moleVote', reqId: 'v', suspectId: v2 }); // a third name bumps the oldest
    expect(priv(v1).moleVotes).toEqual([b, v2]);
    eng.handle(v1, { type: 'moleVote', reqId: 'v', suspectId: v2 }); eng.handle(v1, { type: 'moleVote', reqId: 'v', suspectId: a }); // back to both right
    eng.handle(v2, { type: 'moleVote', reqId: 'v', suspectId: a }); // one right
    eng.handle(v3, { type: 'moleVote', reqId: 'v', suspectId: v1 }); eng.handle(v3, { type: 'moleVote', reqId: 'v', suspectId: v2 }); // none
    // the host makes a third lad a Mole mid-game
    expect(host({ kind: 'assignMole' }).ack?.ok).toBe(false); // no blind re-pick while they're in play
    expect(host({ kind: 'assignMole', playerId: a }).ack?.ok).toBe(false); // already one
    expect(host({ kind: 'assignMole', playerId: v3 }).ack?.ok).toBe(true);
    expect(party().mole!.moles.length).toBe(3); expect(priv(v3).mole?.missions.length).toBe(3);
    expect(host({ kind: 'assignMole', playerId: v2 }).ack?.ok).toBe(false); // three is the cap
    const before = Object.fromEntries(ids.map((id) => [id, party().players[id].points]));
    const r = host({ kind: 'revealMole' });
    expect(r.ack?.ok).toBe(true);
    // 3 voters: a named by 2 (caught), b by 1 (got away), v3 by nobody (got away)
    const caught = Object.fromEntries((r.ack as any).data.moles.map((x: any) => [x.playerId, x.caught]));
    expect(caught).toEqual({ [a]: true, [b]: false, [v3]: false });
    expect(party().players[v1].points - before[v1]).toBe(MOLE_POINTS.correctGuess * 2);
    expect(party().players[v2].points - before[v2]).toBe(MOLE_POINTS.correctGuess);
    expect(party().players[a].points - before[a]).toBe(MOLE_POINTS.caught);
    expect(party().players[b].points - before[b]).toBe(MOLE_POINTS.escaped);
    expect(party().players[v3].points - before[v3]).toBe(MOLE_POINTS.escaped);
    expect(party().feed.at(-1)!.text).toMatch(/THE MOLES WERE/);
    expect(eng.publicView(party()).mole!.revealed!.correct.sort()).toEqual([v1, v2].sort());
  });
  it('a save from the single-Mole version migrates', () => {
    const { eng, ids, party, host } = setup();
    host({ kind: 'setPhase', phase: 'saturday' });
    const moleId = party().mole!.moles[0].playerId;
    const voter = ids.find((id) => id !== moleId)!;
    (party() as any).mole = { playerId: moleId, assignedAt: 1, missions: [{ text: 'x', done: true }], votes: { [voter]: moleId }, revealed: false };
    const eng2 = new Engine({ now: () => 7_000_000, rng: seededRng(1) }, JSON.parse(JSON.stringify(eng.state)));
    const m = eng2.state.parties[party().code].mole!;
    expect(m.moles).toEqual([{ playerId: moleId, missions: [{ text: 'x', done: true }] }]);
    expect(m.votes).toEqual({ [voter]: [moleId] });
    expect((m as any).playerId).toBeUndefined();
    expect(eng2.privateView(eng2.state.parties[party().code], ids[0])!.moleHost).toEqual([{ playerId: moleId, done: 1, total: 1 }]);
  });
});

describe('the wake-up drop', () => {
  it('lands once, the first time a lad opens the game on Saturday, and always holds an item', () => {
    const { eng, ids, party, host, priv } = setup();
    ids.forEach((id) => eng.setOnline(id, false)); // everyone asleep
    eng.setOnline(ids[1], true);
    expect(priv(ids[1]).drops.some((d) => d.source === 'morning')).toBe(false); // not on Friday
    host({ kind: 'setPhase', phase: 'saturday' });
    expect(priv(ids[1]).drops.filter((d) => d.source === 'morning').length).toBe(1); // online at the switch: it lands then
    eng.setOnline(ids[2], true);
    const d = priv(ids[2]).drops.find((x) => x.source === 'morning')!;
    expect(d).toBeTruthy(); expect(d.rarity).toBe('rare'); expect(d.item && DROP_ITEMS.rare.includes(d.item)).toBe(true);
    eng.setOnline(ids[2], false); eng.setOnline(ids[2], true); eng.setOnline(ids[1], true);
    expect(priv(ids[2]).drops.filter((x) => x.source === 'morning').length).toBe(1);
    expect(priv(ids[1]).drops.filter((x) => x.source === 'morning').length).toBe(1);
    // a lad who owns every rare already gets bumped up a tier rather than fobbed off with points
    party().players[ids[3]].unlocked.push(...DROP_ITEMS.rare);
    eng.setOnline(ids[3], true);
    const up = priv(ids[3]).drops.find((x) => x.source === 'morning')!;
    expect(up.rarity).toBe('epic'); expect(up.item && DROP_ITEMS.epic.includes(up.item)).toBe(true);
  });
  it('a lad who joins on Saturday has the Morning Drop and the welcome drop waiting the moment they adopt', () => {
    const { eng, code, party, host, priv } = setup();
    host({ kind: 'setPhase', phase: 'saturday' });
    const late = 'player_sat_late'; eng.auth(late, 'secret-late');
    eng.setOnline(late, true); // hello comes before joinParty: nothing to give yet
    eng.handle(late, { type: 'joinParty', reqId: 'j', code, nickname: 'Wazza' });
    expect(party().players[late].drops.length).toBe(0);
    eng.handle(late, { type: 'chooseCreature', reqId: 'c', creature: 'fox' });
    const drops = priv(late).drops;
    expect(drops.filter((d) => d.source === 'morning').length).toBe(1);
    expect(drops.filter((d) => d.source === 'gift').length).toBe(1);
    eng.setOnline(late, false); eng.setOnline(late, true);
    expect(priv(late).drops.length).toBe(2); // and nothing doubles up on reconnect
  });
  it('the host can gift a drop to one lad', () => {
    const { ids, host, priv } = setup();
    const r = host({ kind: 'giveDrops', rarity: 'legendary', playerId: ids[2] });
    expect(r.ack?.ok).toBe(true); expect((r.ack as any).data.given).toBe(1);
    expect(priv(ids[2]).drops.filter((d) => d.source === 'host' && d.rarity === 'legendary').length).toBe(1);
    expect(priv(ids[1]).drops.filter((d) => d.source === 'host').length).toBe(0);
    expect(r.direct.some((d) => d.to === ids[2] && d.msg.type === 'toast')).toBe(true);
  });
});

describe('fights and raids, more fun', () => {
  it('taunts go to both phones during a live fight, rate limited, only from the fighters', () => {
    const { eng, ids, advance } = setup();
    const bid = (eng.handle(ids[2], { type: 'challenge', reqId: 'c', opponentId: ids[3] }).ack as any).data.battleId as string;
    expect(eng.handle(ids[2], { type: 'taunt', reqId: 't', battleId: bid, emoji: '😂' }).ack?.ok).toBe(false); // not accepted yet
    eng.handle(ids[3], { type: 'respondChallenge', reqId: 'r', battleId: bid, accept: true });
    const r = eng.handle(ids[2], { type: 'taunt', reqId: 't', battleId: bid, emoji: '😂' });
    expect(r.ack?.ok).toBe(true);
    expect(r.direct.map((d) => d.to).sort()).toEqual([ids[2], ids[3]].sort());
    expect(r.direct.every((d) => (d.msg as any).type === 'taunt' && (d.msg as any).emoji === '😂' && (d.msg as any).from === ids[2])).toBe(true);
    expect(eng.handle(ids[2], { type: 'taunt', reqId: 't', battleId: bid, emoji: '🔥' }).ack?.ok).toBe(false); // too soon
    advance(3000);
    expect(eng.handle(ids[2], { type: 'taunt', reqId: 't', battleId: bid, emoji: '🔥' }).ack?.ok).toBe(true);
    expect(eng.handle(ids[2], { type: 'taunt', reqId: 't', battleId: bid, emoji: '💩' }).ack?.ok).toBe(false); // not in the set
    expect(eng.handle(ids[4], { type: 'taunt', reqId: 't', battleId: bid, emoji: '😂' }).ack?.ok).toBe(false); // spectator
  });
  it('the boss staggers at half health: 25 seconds of double damage, once', () => {
    const { eng, ids, party, host, advance } = setup();
    host({ kind: 'summonRaid' });
    const raid = party().raids[0];
    raid.hp = Math.floor(raid.maxHp / 2) + 5;
    const r1 = eng.handle(ids[2], { type: 'raidHit', reqId: 'r', raidId: raid.id, tap: 'good' });
    expect(r1.ack?.ok).toBe(true);
    expect(raid.weakDone).toBe(true); expect(raid.weakUntil).toBe(7_000_000 + 25_000);
    expect(party().feed.some((f) => /WEAK SPOT/.test(f.text))).toBe(true);
    const normal = (r1.ack as any).data.dmg as number;
    advance(1000);
    const r2 = eng.handle(ids[3], { type: 'raidHit', reqId: 'r', raidId: raid.id, tap: 'good' });
    expect((r2.ack as any).data.dmg).toBeGreaterThan(normal * 1.5); // doubled
    advance(30_000);
    const r3 = eng.handle(ids[4], { type: 'raidHit', reqId: 'r', raidId: raid.id, tap: 'good' });
    expect((r3.ack as any).data.dmg).toBeLessThan((r2.ack as any).data.dmg); // window over
    expect(party().feed.filter((f) => /WEAK SPOT/.test(f.text)).length).toBe(1);
  });
  it('comeback: well behind the leader scores 1.5× until back in touch; the leader never does', () => {
    const { ids, party, doPhoto } = setup();
    party().players[ids[2]].points = 400; // the leader
    party().players[ids[3]].points = 100; // 25%: comeback
    party().players[ids[4]].points = 300; // 75%: fine
    const m = PHOTO_M[0]; const base = m.points;
    const r = doPhoto(ids[3]);
    expect(party().players[ids[3]].comeback).toBe(true);
    expect(r.direct.some((d) => d.to === ids[3] && /Comeback/.test((d.msg as any).bonus ?? ''))).toBe(true);
    expect(party().players[ids[3]].points).toBeGreaterThanOrEqual(100 + Math.round(base * 1.5));
    const before = party().players[ids[4]].points;
    doPhoto(ids[4]);
    expect(party().players[ids[4]].comeback).toBe(false);
    expect(party().players[ids[4]].points - before).toBeLessThan(base * 1.5 + 11); // normal (variety bonus aside)
    party().players[ids[3]].points = 330; doPhoto(ids[3]); // past 80%: boost switches off
    expect(party().players[ids[3]].comeback).toBe(false);
  });
});

describe('review fixes: things a cheeky lad or a fat-thumbed host could do', () => {
  it('moleDone rejects anything but a real mission index', () => {
    const { eng, party, host } = setup();
    host({ kind: 'setPhase', phase: 'saturday' });
    const mole = party().mole!.moles[0].playerId;
    const before = party().players[mole].points;
    for (const index of ['map', 'constructor', '__proto__', '0', 1.5, -1, 3, 99, null, undefined]) expect(eng.handle(mole, { type: 'moleDone', reqId: 'm', index: index as any }).ack?.ok, String(index)).toBe(false);
    expect(party().players[mole].points).toBe(before);
    expect((Array.prototype as any).done).toBeUndefined();
  });
  it('a quest lands the moment someone else approves your photo, with no tap from you', () => {
    const { eng, ids, party, host, priv, doPhoto } = setup();
    host({ kind: 'setPhase', phase: 'saturday' });
    const lad = ids[2];
    for (let i = 0; i < 3; i++) doPhoto(lad); // rookie snaps count straight away; after that photos go to review
    party().photoMode = 'host';
    party().players[lad].quests = [{ defId: 'missions5', baseline: party().players[lad].missionsCompleted, done: false }];
    for (let i = 0; i < 5; i++) {
      const r = doPhoto(lad); expect(r.ack?.ok).toBe(true);
      const claim = Object.values(party().claims).find((c) => c.status === 'pending' && c.playerId === lad)!;
      expect(claim, 'photo waits for the host').toBeTruthy();
      expect(host({ kind: 'resolveClaim', claimId: claim.id, approve: true }).ack?.ok).toBe(true);
    }
    expect(priv(lad).quests[0].done).toBe(true); // the host's approval was the last action, and the lad still got it
    expect(priv(lad).drops.some((d) => d.source === 'quest')).toBe(true);
  });
  it('the tick sweep catches a quest moved by a reaction', () => {
    const { eng, ids, party, host, priv } = setup();
    host({ kind: 'setPhase', phase: 'saturday' });
    const lad = ids[2];
    party().players[lad].quests = [{ defId: 'laughs5', baseline: party().players[lad].laughs, done: false }];
    party().players[lad].laughs += 5; // moved by other lads' reactions, nobody acting as the owner
    expect(priv(lad).quests[0].done).toBe(false);
    eng.tick();
    expect(priv(lad).quests[0].done).toBe(true);
  });
  it('surrender-farming does not count towards fight quests', () => {
    const { eng, ids, party, host, priv } = setup();
    host({ kind: 'setPhase', phase: 'saturday' });
    const [a, b] = [ids[2], ids[3]];
    party().players[a].quests = [{ defId: 'wins3', baseline: 0, done: false }, { defId: 'fights5', baseline: 0, done: false }];
    for (let i = 0; i < 5; i++) {
      const r = eng.handle(a, { type: 'challenge', reqId: 'c', opponentId: b } as any);
      const bid = (r.ack as any).data?.battleId ?? Object.values(party().battles).find((x) => x.status === 'challenge')?.id;
      eng.handle(b, { type: 'respondChallenge', reqId: 'r', battleId: bid, accept: true });
      eng.handle(b, { type: 'surrender', reqId: 's', battleId: bid } as any);
    }
    expect(party().players[a].wins).toBe(5);
    expect(party().players[a].fairWins).toBe(0);
    expect(priv(a).quests.every((q) => !q.done)).toBe(true);
  });
  it('a BS dispute cannot re-cross the third-challenge line for a second drop', () => {
    const { ids, party, doPhoto, priv } = setup();
    const lad = ids[2];
    for (let i = 0; i < 3; i++) doPhoto(lad);
    expect(priv(lad).drops.filter((d) => d.source === 'challenge').length).toBe(1);
    party().players[lad].missionsCompleted -= 1; // what a dispute does
    doPhoto(lad);
    expect(priv(lad).drops.filter((d) => d.source === 'challenge').length).toBe(1);
    doPhoto(lad); doPhoto(lad);
    expect(priv(lad).drops.filter((d) => d.source === 'challenge').length).toBe(2);
  });
  it('flipping Fresh Legs on and off hands out one welcome drop, not one per flip; bouncing the phase keeps quests', () => {
    const { ids, party, host, priv } = setup();
    for (let i = 0; i < 3; i++) host({ kind: 'setCatchUp', playerId: ids[2], on: i % 2 === 0 });
    expect(priv(ids[2]).drops.filter((d) => d.source === 'gift').length).toBe(1);
    host({ kind: 'setPhase', phase: 'saturday' });
    const q = priv(ids[3]).quests.map((x) => x.defId);
    party().players[ids[3]].quests[0].done = true;
    host({ kind: 'setPhase', phase: 'lobby' }); host({ kind: 'setPhase', phase: 'saturday' });
    expect(priv(ids[3]).quests.map((x) => x.defId)).toEqual(q);
    expect(priv(ids[3]).quests[0].done).toBe(true);
  });
  it('a junk Mole count falls back to the default instead of a round with no Mole', () => {
    const { party, host } = setup();
    expect(host({ kind: 'assignMole', count: 'abc' }).ack?.ok).toBe(true);
    expect(party().mole!.moles.length).toBe(1);
  });
});

describe('the Cellar menu', () => {
  it('every quick-pick drink maps to its own group, and free text gets a sensible emoji', async () => {
    const { DRINK_GROUPS, drinkGroup, drinkEmoji } = await import('../shared/drinks');
    for (const g of DRINK_GROUPS) for (const d of g.items) expect(drinkGroup(d), d).toBe(g.id);
    expect(drinkEmoji('schooner of Tooheys')).toBe('🍺'); expect(drinkEmoji('pepsi max')).toBe('🥤'); expect(drinkEmoji('2019 Hunter Semillon')).toBe('🍷');
    expect(drinkEmoji('bourbon and coke')).toBe('🥃'); expect(drinkEmoji('tap water')).toBe('🥤'); expect(drinkEmoji('mystery juice')).toBe('🥤'); expect(drinkEmoji('something odd')).toBe('🍷');
  });
  it('the feed line for a review carries the drink emoji', () => {
    const { eng, ids, party } = setup();
    eng.handle(ids[1], { type: 'cellarAdd', reqId: 'c', drink: 'Great Northern', stars: 4 });
    expect(party().feed.at(-1)!.emoji).toBe('🍺');
    eng.handle(ids[1], { type: 'cellarAdd', reqId: 'c', drink: 'Solo', stars: 5 });
    expect(party().feed.at(-1)!.emoji).toBe('🥤');
  });
});

describe('the Spotlight and the ceremony on the TV', () => {
  it('the host schedules a moment, adjusts it, starts and stops the clock; lads cannot', () => {
    const { eng, ids, party, host } = setup();
    expect(eng.handle(ids[1], { type: 'host', reqId: 'h', action: { kind: 'setSpotlight', label: 'x' } }).ack?.ok).toBe(false);
    const at = 7_000_000 + 8 * 3600_000;
    expect(host({ kind: 'setSpotlight', label: "The Loser's Speech", at, seconds: 120, playerId: ids[2] }).ack?.ok).toBe(true);
    let pub = eng.publicView(party());
    expect(pub.spotlight).toEqual({ label: "The Loser's Speech", at, seconds: 120, playerId: ids[2], startedAt: undefined });
    expect(host({ kind: 'setSpotlight', seconds: 180 }).ack?.ok).toBe(true); // adjust one thing, the rest stays
    pub = eng.publicView(party()); expect(pub.spotlight!.seconds).toBe(180); expect(pub.spotlight!.label).toBe("The Loser's Speech"); expect(pub.spotlight!.playerId).toBe(ids[2]);
    expect(host({ kind: 'setSpotlight', playerId: 'nobody_here' }).ack?.ok).toBe(false);
    expect(host({ kind: 'setSpotlight', playerId: null }).ack?.ok).toBe(true); expect(eng.publicView(party()).spotlight!.playerId).toBeUndefined();
    const r = host({ kind: 'setSpotlight', start: true, playerId: ids[2] });
    expect(r.ack?.ok).toBe(true); expect(eng.publicView(party()).spotlight!.startedAt).toBe(7_000_000);
    expect(party().feed.at(-1)!.text).toMatch(/LOSER'S SPEECH/); expect(r.direct.some((d) => d.to === 'party')).toBe(true);
    expect(host({ kind: 'setSpotlight', stop: true }).ack?.ok).toBe(true); expect(eng.publicView(party()).spotlight!.startedAt).toBeUndefined();
    expect(host({ kind: 'setSpotlight', seconds: 2 }).ack?.ok).toBe(true); expect(eng.publicView(party()).spotlight!.seconds).toBe(10); // floor
    expect(host({ kind: 'setSpotlight', clear: true }).ack?.ok).toBe(true); expect(eng.publicView(party()).spotlight).toBeNull();
  });
  it('the ceremony count follows the host only and clamps', () => {
    const { eng, ids, party, host } = setup();
    expect(eng.publicView(party()).ceremony).toBe(0);
    expect(eng.handle(ids[1], { type: 'host', reqId: 'h', action: { kind: 'setCeremony', revealed: 3 } }).ack?.ok).toBe(false);
    expect(host({ kind: 'setCeremony', revealed: 3 }).ack?.ok).toBe(true); expect(eng.publicView(party()).ceremony).toBe(3);
    expect(host({ kind: 'setCeremony', revealed: 3 }).changed).toBe(false);
    host({ kind: 'setCeremony', revealed: 999 }); expect(eng.publicView(party()).ceremony).toBe(40);
    host({ kind: 'setCeremony', revealed: -2 }); expect(eng.publicView(party()).ceremony).toBe(0);
  });
  it('the host flips the TV to the photo reel and back', () => {
    const { eng, ids, party, host } = setup();
    expect(eng.publicView(party()).tvMode).toBe('auto');
    expect(eng.handle(ids[1], { type: 'host', reqId: 'h', action: { kind: 'setTvMode', mode: 'reel' } }).ack?.ok).toBe(false);
    expect(host({ kind: 'setTvMode', mode: 'reel' }).ack?.ok).toBe(true); expect(eng.publicView(party()).tvMode).toBe('reel');
    expect(party().feed.at(-1)!.text).toMatch(/PHOTO REEL/);
    expect(host({ kind: 'setTvMode', mode: 'reel' }).changed).toBe(false);
    expect(host({ kind: 'setTvMode', mode: 'nonsense' as any }).ack?.ok).toBe(true); expect(eng.publicView(party()).tvMode).toBe('auto');
  });
  it('ceremony helpers: order and spotlight phases', async () => {
    const { orderAwards, spotlightPhase, fmtClock } = await import('../shared/ceremony');
    const o = orderAwards([{ id: 'a', name: 'A', blurb: '', playerId: null, reason: '' }, { id: 'legend', name: 'L', blurb: '', playerId: null, reason: '' }, { id: 'menace', name: 'M', blurb: '', playerId: null, reason: '' }]);
    expect(o.map((x) => x.id)).toEqual(['menace', 'a', 'legend']);
    const s = { label: 'x', at: 100, seconds: 120 };
    expect(spotlightPhase(null, 0)).toBe('none'); expect(spotlightPhase(s, 0)).toBe('upcoming');
    expect(spotlightPhase({ ...s, startedAt: 1000 }, 1000 + 119_000)).toBe('running'); expect(spotlightPhase({ ...s, startedAt: 1000 }, 1000 + 121_000)).toBe('done'); expect(spotlightPhase({ ...s, startedAt: 1000 }, 1000 + 170_000)).toBe('none');
    expect(fmtClock(125)).toBe('2:05'); expect(fmtClock(0)).toBe('0:00');
  });
});

describe('Rowdy Rounds', () => {
  it('host starts one, lads name a lad, the clock reveals a tally, prompts never repeat until the hat is empty', () => {
    const { eng, ids, party, host, priv, advance } = setup(8);
    expect(eng.handle(ids[1], { type: 'host', reqId: 'h', action: { kind: 'startRowdy', rowdy: 'mostLikely' } }).ack?.ok).toBe(false);
    const r = host({ kind: 'startRowdy', rowdy: 'mostLikely' });
    expect(r.ack?.ok).toBe(true); expect(r.direct.some((d) => d.to === 'party')).toBe(true);
    let pub = eng.publicView(party()).rowdy!;
    expect(pub.kind).toBe('mostLikely'); expect(pub.revealed).toBe(false); expect(pub.endsAt - pub.startedAt).toBe(45_000);
    expect(host({ kind: 'startRowdy' }).ack?.ok).toBe(false); // one at a time
    const before = party().players[ids[2]].points;
    expect(eng.handle(ids[2], { type: 'rowdyVote', reqId: 'v', targetId: ids[3] }).ack?.ok).toBe(true);
    expect(party().players[ids[2]].points - before).toBe(5);
    eng.handle(ids[2], { type: 'rowdyVote', reqId: 'v', targetId: ids[4] }); // changed mind, no second payout
    expect(party().players[ids[2]].points - before).toBe(5); expect(priv(ids[2]).rowdyVote).toBe(ids[4]);
    for (const id of ids.slice(3, 7)) eng.handle(id, { type: 'rowdyVote', reqId: 'v', targetId: ids[4] });
    expect(eng.publicView(party()).rowdy!.votes).toBe(5); expect(eng.publicView(party()).rowdy!.tally).toBeUndefined(); // secret till the end
    advance(46_000); eng.tick();
    pub = eng.publicView(party()).rowdy!;
    expect(pub.revealed).toBe(true); expect(pub.tally![0]).toEqual({ playerId: ids[4], n: 5 });
    expect(party().feed.at(-1)!.text).toMatch(/Most likely to .*: LAD 4|Most likely to .*: [A-Z]/);
    expect(eng.handle(ids[2], { type: 'rowdyVote', reqId: 'v', targetId: ids[3] }).ack?.ok).toBe(false); // over
    advance(91_000); eng.tick(); expect(eng.publicView(party()).rowdy).toBeNull(); // cleared on its own
    // no repeats until every prompt of that kind has been used
    const seen = new Set<string>();
    for (let i = 0; i < ROWDY_PROMPTS.neverHaveIEver.length; i++) { host({ kind: 'startRowdy', rowdy: 'neverHaveIEver' }); seen.add(party().rowdy!.prompt); host({ kind: 'endRowdy' }); host({ kind: 'endRowdy' }); }
    expect(seen.size).toBe(ROWDY_PROMPTS.neverHaveIEver.length);
    expect(host({ kind: 'startRowdy', rowdy: 'neverHaveIEver' }).ack?.ok).toBe(true); // the hat refills
  });
  it('no voting in a timer game; end now reveals, end again clears', () => {
    const { eng, ids, party, host } = setup();
    host({ kind: 'startRowdy', rowdy: 'categories' });
    expect(eng.handle(ids[1], { type: 'rowdyVote', reqId: 'v', targetId: ids[2] }).ack?.ok).toBe(false);
    expect(host({ kind: 'endRowdy' }).ack?.ok).toBe(true); expect(eng.publicView(party()).rowdy!.revealed).toBe(true);
    expect(host({ kind: 'endRowdy' }).ack?.ok).toBe(true); expect(eng.publicView(party()).rowdy).toBeNull();
    expect(host({ kind: 'endRowdy' }).ack?.ok).toBe(false);
  });
});

describe("the scorer's pad", () => {
  it('host appoints a scorer; scorer and host can enter points for anyone, with limits; lads cannot', () => {
    const { eng, ids, party, host } = setup();
    expect(eng.handle(ids[1], { type: 'scorerGrant', reqId: 's', playerId: ids[2], points: 60, reason: 'Plank' }).ack?.ok).toBe(false);
    expect(eng.handle(ids[1], { type: 'host', reqId: 'h', action: { kind: 'setScorer', playerId: ids[1], on: true } }).ack?.ok).toBe(false); // not self-appointed
    const r = host({ kind: 'setScorer', playerId: ids[1], on: true });
    expect(r.ack?.ok).toBe(true); expect(eng.publicView(party()).players.find((p) => p.id === ids[1])!.isScorer).toBe(true);
    const before = party().players[ids[2]].points;
    const g = eng.handle(ids[1], { type: 'scorerGrant', reqId: 's', playerId: ids[2], points: 60, reason: 'Plank' });
    expect(g.ack?.ok).toBe(true); expect(party().players[ids[2]].points - before).toBe(60);
    expect(eng.publicView(party()).players.find((p) => p.id === ids[2])!.olympics).toBe(60);
    expect(eng.publicView(party()).lastScore).toMatchObject({ playerId: ids[2], points: 60, reason: 'Plank' });
    expect(party().feed.at(-1)!.text).toMatch(/🏅 Plank: .* \+60 \(scored by/);
    expect(eng.handle(ids[1], { type: 'scorerGrant', reqId: 's', playerId: ids[2], points: 999, reason: 'Plank' }).ack?.ok).toBe(true);
    expect(party().players[ids[2]].points - before).toBe(260); // capped at +200
    expect(eng.handle(ids[1], { type: 'scorerGrant', reqId: 's', playerId: ids[2], points: -40, reason: 'Cheating' }).ack?.ok).toBe(true);
    expect(eng.publicView(party()).players.find((p) => p.id === ids[2])!.olympics).toBe(220);
    expect(eng.handle(ids[1], { type: 'scorerGrant', reqId: 's', playerId: ids[2], points: 10, reason: 'x' }).ack?.ok).toBe(false); // name the event
    expect(eng.handle(ids[1], { type: 'scorerGrant', reqId: 's', playerId: ids[2], points: 0, reason: 'Plank' }).ack?.ok).toBe(false);
    expect(eng.handle(ids[0], { type: 'scorerGrant', reqId: 's', playerId: ids[3], points: 25, reason: 'Wall sit' }).ack?.ok).toBe(true); // the host always can
    host({ kind: 'setScorer', playerId: ids[1], on: false });
    expect(eng.handle(ids[1], { type: 'scorerGrant', reqId: 's', playerId: ids[2], points: 10, reason: 'Plank' }).ack?.ok).toBe(false);
  });
});

describe('Bucks Olympics events', () => {
  it('a scorer runs an event: start, results, stopwatch, lock with placing points and ties; lads cannot', async () => {
    const { placeAwards } = await import('../shared/olympics');
    const { eng, ids, party, host, advance } = setup(8);
    host({ kind: 'setScorer', playerId: ids[1], on: true });
    const sc = (msg: any) => eng.handle(ids[1], { reqId: 'o', ...msg });
    expect(eng.handle(ids[2], { type: 'olyStart', reqId: 'o', name: 'Plank', unit: 'seconds' }).ack?.ok).toBe(false);
    expect(sc({ type: 'olyStart', name: 'P', unit: 'seconds' }).ack?.ok).toBe(false);
    expect(sc({ type: 'olyStart', name: 'Plank', unit: 'seconds' }).ack?.ok).toBe(true);
    let ev = eng.publicView(party()).olympics.current!;
    expect(ev.name).toBe('Plank'); expect(ev.status).toBe('open'); expect(party().feed.at(-1)!.text).toMatch(/PLANK is on/);
    expect(sc({ type: 'olyStart', name: 'Wall sit', unit: 'seconds' }).ack?.ok).toBe(false); // one at a time
    // stopwatch mirrored to the TV, then the result
    expect(sc({ type: 'olyTimer', playerId: ids[2] }).ack?.ok).toBe(true); expect(eng.publicView(party()).olympics.current!.timer!.playerId).toBe(ids[2]);
    expect(sc({ type: 'olyResult', playerId: ids[2], value: 95.26 }).ack?.ok).toBe(true);
    ev = eng.publicView(party()).olympics.current!; expect(ev.timer).toBeNull(); expect(ev.results[0]).toMatchObject({ playerId: ids[2], value: 95.3 });
    sc({ type: 'olyResult', playerId: ids[3], value: 120 }); sc({ type: 'olyResult', playerId: ids[4], value: 120 }); sc({ type: 'olyResult', playerId: ids[5], value: 40 });
    sc({ type: 'olyResult', playerId: ids[6], value: 10 }); sc({ type: 'olyResult', playerId: ids[6], value: null }); // cleared
    expect(sc({ type: 'olyResult', playerId: ids[6], value: -3 }).ack?.ok).toBe(false);
    expect(sc({ type: 'olyResult', playerId: ids[3], value: 125 }).ack?.ok).toBe(true); // a fix replaces, no duplicate rows
    ev = eng.publicView(party()).olympics.current!; expect(ev.results.length).toBe(4);
    const before = Object.fromEntries(ids.map((id) => [id, party().players[id].points]));
    expect(eng.handle(ids[2], { type: 'olyLock', reqId: 'o' }).ack?.ok).toBe(false);
    const r = sc({ type: 'olyLock' }); expect(r.ack?.ok).toBe(true);
    ev = eng.publicView(party()).olympics.current!; expect(ev.status).toBe('locked');
    const by = Object.fromEntries(ev.awards!.map((a) => [a.playerId, a]));
    expect(by[ids[3]]).toMatchObject({ place: 1, points: 60 }); expect(by[ids[4]]).toMatchObject({ place: 2, points: 40 }); expect(by[ids[2]]).toMatchObject({ place: 3, points: 25 }); expect(by[ids[5]]).toMatchObject({ place: 4, points: 15 });
    for (const id of [ids[3], ids[4], ids[2], ids[5]]) expect(party().players[id].points - before[id]).toBe(by[id].points);
    expect(party().players[ids[6]].points - before[ids[6]]).toBe(0);
    expect(party().players[ids[3]].olympics).toBe(60);
    expect(party().feed.at(-1)!.text).toMatch(/PLANK: .* takes it \(2:05\)/);
    expect(eng.publicView(party()).olympics.done).toHaveLength(1);
    expect(sc({ type: 'olyLock' }).ack?.ok).toBe(false); // not twice
    advance(41_000); eng.tick(); expect(eng.publicView(party()).olympics.current).toBeNull(); // leaves the TV on its own
    // ties share, placing counts low-is-good, points unit is direct, scrap gives nothing
    expect(placeAwards('reps', [{ playerId: 'a', value: 30, at: 0 }, { playerId: 'b', value: 30, at: 0 }, { playerId: 'c', value: 12, at: 0 }]).map((a) => [a.playerId, a.place, a.points])).toEqual([['a', 1, 60], ['b', 1, 60], ['c', 3, 25]]);
    expect(placeAwards('place', [{ playerId: 'a', value: 2, at: 0 }, { playerId: 'b', value: 1, at: 0 }]).map((a) => [a.playerId, a.place])).toEqual([['b', 1], ['a', 2]]);
    expect(placeAwards('points', [{ playerId: 'a', value: 33, at: 0 }])[0].points).toBe(33);
    sc({ type: 'olyStart', name: 'Flip cup', unit: 'place' }); sc({ type: 'olyResult', playerId: ids[2], value: 1 });
    expect(sc({ type: 'olyResult', playerId: ids[3], value: 1.5 }).ack?.ok).toBe(false);
    const b2 = party().players[ids[2]].points; expect(sc({ type: 'olyScrap' }).ack?.ok).toBe(true);
    expect(party().players[ids[2]].points).toBe(b2); expect(eng.publicView(party()).olympics.current).toBeNull();
  });
});

describe('the run sheet', () => {
  it('host sets items, the next one is nudged at its time, Start fires the wired action, lads cannot', async () => {
    const { typicalNight, nextItem } = await import('../shared/runsheet');
    const { eng, ids, party, host, advance } = setup(8);
    const t0 = 7_000_000;
    expect(eng.handle(ids[1], { type: 'host', reqId: 'h', action: { kind: 'runSheetSet', items: [] } }).ack?.ok).toBe(false);
    const items = [{ at: t0 + 3600_000, label: 'Photo reel', action: 'reel' as const }, { at: t0 + 600_000, label: 'Rowdy', action: 'rowdy' as const }, { at: t0 + 7200_000, label: 'Speech', action: 'spotlight' as const }];
    expect(host({ kind: 'runSheetSet', items }).ack?.ok).toBe(true);
    let rs = eng.publicView(party()).runSheet;
    expect(rs.map((i) => i.label)).toEqual(['Rowdy', 'Photo reel', 'Speech']); // sorted by time
    expect(nextItem(rs, t0)!.label).toBe('Rowdy');
    // nudge at the time, once, to the host only
    advance(599_000); let tk = eng.tick(); expect(tk.direct.some((d) => d.to === ids[0] && /Run sheet/.test((d.msg as any).text))).toBe(false);
    advance(2_000); tk = eng.tick(); expect(tk.direct.filter((d) => d.to === ids[0] && /Run sheet: Rowdy/.test((d.msg as any).text)).length).toBe(1);
    tk = eng.tick(); expect(tk.direct.some((d) => /Run sheet/.test((d.msg as any).text))).toBe(false);
    // start fires the action and marks it done
    rs = eng.publicView(party()).runSheet;
    const r = host({ kind: 'runSheetFire', id: rs[0].id });
    expect(r.ack?.ok).toBe(true); expect(eng.publicView(party()).rowdy).not.toBeNull(); expect(eng.publicView(party()).runSheet[0].done).toBe(true);
    expect(host({ kind: 'runSheetFire', id: rs[0].id }).ack?.ok).toBe(false); // not twice
    expect(nextItem(eng.publicView(party()).runSheet, t0 + 601_000)!.label).toBe('Photo reel');
    // the reel item flips the TV; the speech item refuses politely if there is no spotlight set... no: it starts one with the item's label
    host({ kind: 'runSheetFire', id: rs[1].id }); expect(eng.publicView(party()).tvMode).toBe('reel');
    host({ kind: 'runSheetFire', id: rs[2].id }); expect(eng.publicView(party()).spotlight?.startedAt).toBeTruthy(); expect(eng.publicView(party()).spotlight?.label).toBe('Speech');
    // editing keeps ids and done flags; removing works
    const kept = eng.publicView(party()).runSheet;
    host({ kind: 'runSheetSet', items: [{ id: kept[0].id, at: kept[0].at, label: 'Rowdy renamed', action: 'rowdy' }] });
    const after = eng.publicView(party()).runSheet; expect(after.length).toBe(1); expect(after[0].id).toBe(kept[0].id); expect(after[0].done).toBe(true);
    expect(typicalNight(t0).length).toBe(7);
  });
});

describe('teams', () => {
  it('snake draft makes even sides, scores average points since creation, swap and dissolve work', async () => {
    const { snakeDraft } = await import('../shared/teams');
    expect(snakeDraft(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 3)).toEqual([['a', 'f', 'g'], ['b', 'e'], ['c', 'd']]);
    const { eng, ids, party, host } = setup(8);
    ids.forEach((id, i) => { party().players[id].points = (8 - i) * 100; });
    expect(host({ kind: 'teamsMake', count: 5 }).ack?.ok).toBe(false); // needs 10 lads
    const r = host({ kind: 'teamsMake', count: 2 }); expect(r.ack?.ok).toBe(true);
    let pub = eng.publicView(party()).teams!;
    expect(pub.teams.length).toBe(2); expect(pub.teams[0].members).toEqual([ids[0], ids[3], ids[4], ids[7]]); expect(pub.teams[1].members).toEqual([ids[1], ids[2], ids[5], ids[6]]);
    expect(pub.teams.every((t) => t.score === 0)).toBe(true); // nothing earned yet since creation
    expect(r.direct.filter((d) => d.to !== 'party').length).toBe(8); // every lad told his team
    host({ kind: 'grantPoints', playerId: ids[3], points: 100, reason: 't' }); host({ kind: 'grantPoints', playerId: ids[1], points: 40, reason: 't' });
    pub = eng.publicView(party()).teams!;
    expect(pub.teams[0].total).toBe(100); expect(pub.teams[0].score).toBe(25); expect(pub.teams[1].score).toBe(10);
    expect(host({ kind: 'teamsSwap', a: ids[3], b: ids[4] }).ack?.ok).toBe(false); // same team
    expect(host({ kind: 'teamsSwap', a: ids[3], b: ids[1] }).ack?.ok).toBe(true);
    pub = eng.publicView(party()).teams!;
    expect(pub.teams[0].members).toContain(ids[1]); expect(pub.teams[1].members).toContain(ids[3]);
    expect(pub.teams[1].total).toBe(100); // the 100 went with the lad
    expect(eng.handle(ids[1], { type: 'host', reqId: 'h', action: { kind: 'teamsClear' } }).ack?.ok).toBe(false);
    expect(host({ kind: 'teamsClear' }).ack?.ok).toBe(true); expect(eng.publicView(party()).teams).toBeNull();
    // the run sheet can make teams too
    host({ kind: 'runSheetSet', items: [{ at: 1, label: 'Teams', action: 'teams' }] });
    host({ kind: 'runSheetFire', id: eng.publicView(party()).runSheet[0].id });
    expect(eng.publicView(party()).teams?.teams.length).toBe(2);
  });
});
