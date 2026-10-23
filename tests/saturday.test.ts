// Saturday systems: Lucky Drops, Quests, The Mole, battle taunts, the raid weak spot and the comeback boost.
import { describe, it, expect } from 'vitest';
import { Engine } from '../shared/engine';
import { seededRng } from '../shared/battle';
import { COSMETIC_BY_ID } from '../shared/progression';
import { DROP_EVERY, DROP_ITEMS, QUEST_BY_ID, RARITIES, RARITY, rollRarity, rollDrop, MOLE_POINTS } from '../shared/saturday';
import { MISSIONS } from '../shared/missions';

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
  it("a win quest ticks over when a fight settles, for both sides' quests", () => {
    const { eng, ids, party, host, priv } = setup();
    host({ kind: 'setPhase', phase: 'saturday' });
    const a = party().players[ids[2]], b = party().players[ids[3]];
    a.quests = [{ defId: 'fights5', baseline: a.wins + a.losses, done: false }]; b.quests = [{ defId: 'fights5', baseline: b.wins + b.losses, done: false }];
    for (let i = 0; i < 5; i++) {
      const bid = (eng.handle(ids[2], { type: 'challenge', reqId: 'c', opponentId: ids[3] }).ack as any).data.battleId as string;
      eng.handle(ids[3], { type: 'respondChallenge', reqId: 'r', battleId: bid, accept: true });
      eng.handle(ids[2], { type: 'surrender', reqId: 's', battleId: bid });
    }
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
    const { eng, ids, party, host, priv } = setup(8);
    host({ kind: 'setPhase', phase: 'saturday' });
    expect(party().mole!.moles.length).toBe(1); // 6 eligible: still one by default
    const mole = party().mole!.moles[0].playerId;
    const others = ids.filter((id) => id !== mole);
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
    const voters = ids.filter((id) => id !== a && id !== b);
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
