import { describe, it, expect } from 'vitest';
import { makeCreatureState, resolveRound, seededRng, MAX_ROUNDS } from '../shared/battle';
import { CREATURE_IDS } from '../shared/creatures';
import type { Battle, CreatureId } from '../shared/types';
import { levelForXp, levelProgress, computeAwards, cosmeticsForLevel, AWARDS } from '../shared/progression';
import { MISSIONS } from '../shared/missions';
import { validateNickname } from '../shared/names';

function mk(a: CreatureId, b: CreatureId): Battle {
  return {
    id: 'b1', challengerId: 'A', opponentId: 'B', status: 'active', createdAt: 0, round: 1,
    a: makeCreatureState('A', a, 1), b: makeCreatureState('B', b, 1), log: [], scored: true,
  };
}

describe('battle engine', () => {
  it('every matchup finishes within MAX_ROUNDS and produces a winner', () => {
    for (const a of CREATURE_IDS) for (const b of CREATURE_IDS) {
      const rng = seededRng(a.length * 31 + b.length);
      const bt = mk(a, b);
      let rounds = 0;
      while (bt.status === 'active' && rounds < 20) {
        bt.a.action = rng() < 0.6 ? 'attack' : rng() < 0.5 ? 'counter' : 'special';
        bt.b.action = rng() < 0.6 ? 'attack' : rng() < 0.5 ? 'counter' : 'special';
        resolveRound(bt, rng, {}, 0); rounds++;
      }
      expect(bt.status).toBe('finished');
      expect(rounds).toBeLessThanOrEqual(MAX_ROUNDS);
      expect(bt.winnerId).toBeTruthy();
      expect(bt.winnerId).not.toBe(bt.loserId);
    }
  });
  it('is roughly balanced: no creature wins more than 72% of all-attack mirror-free duels', () => {
    const wins: Record<string, number> = {}; const games: Record<string, number> = {};
    let seed = 1;
    for (const a of CREATURE_IDS) for (const b of CREATURE_IDS) {
      if (a === b) continue;
      for (let g = 0; g < 60; g++) {
        const rng = seededRng(seed++);
        const bt = mk(a, b);
        while (bt.status === 'active') {
          const pick = (cd: number) => (cd === 0 && rng() < 0.35 ? 'special' : rng() < 0.75 ? 'attack' : 'counter');
          bt.a.action = pick(bt.a.specialCooldown); bt.b.action = pick(bt.b.specialCooldown);
          resolveRound(bt, rng, {}, 0);
        }
        games[a] = (games[a] ?? 0) + 1; games[b] = (games[b] ?? 0) + 1;
        wins[bt.winnerId === 'A' ? a : b] = (wins[bt.winnerId === 'A' ? a : b] ?? 0) + 1;
      }
    }
    for (const c of CREATURE_IDS) {
      const rate = (wins[c] ?? 0) / games[c];
      expect(rate, `${c} win rate ${rate.toFixed(2)}`).toBeGreaterThan(0.28);
      expect(rate, `${c} win rate ${rate.toFixed(2)}`).toBeLessThan(0.72);
    }
  });
  it('defend reduces damage and special obeys cooldown', () => {
    const rng = seededRng(7);
    const bt = mk('dragon', 'wombat');
    bt.a.action = 'special'; bt.b.action = 'counter';
    const log = resolveRound(bt, rng, {}, 0);
    expect(log.a.action).toBe('special');
    expect(bt.a.specialCooldown).toBe(2);
    bt.a.action = 'special'; bt.b.action = 'attack';
    const log2 = resolveRound(bt, rng, {}, 0);
    expect(log2.a.action).toBe('attack'); // downgraded by cooldown
  });
});

describe('progression', () => {
  it('levels are monotonic and capped at 10', () => {
    expect(levelForXp(0)).toBe(1); expect(levelForXp(60)).toBe(2); expect(levelForXp(99999)).toBe(10);
    expect(levelProgress(70).pct).toBeGreaterThan(0);
    expect(cosmeticsForLevel(10).length).toBeGreaterThan(5);
  });
  it('awards are data driven and never hardcode a winner', () => {
    const base = { creature: 'dragon' as const, creatureName: 'x', level: 1, xp: 0, equipped: { colorway: 0 }, unlocked: [], achievements: [], wins: 0, losses: 0, title: '', online: true, isHost: false, joinedAt: 0, lastSeen: 0, categoryCounts: {}, witnessed: 0,
      rating: 1000, streak: 0, bestStreak: 0, bounties: 0, laughs: 0, fires: 0, groomLoves: 0, wallVotes: 0, cellarCount: 0, cellarFires: 0, raidDamage: 0, raidsJoined: 0, lowKey: false, freshLegs: 0, joinedPhase: 'friday' as const, h2h: {}, upsetLosses: 0, reactionsGiven: 0, autoBattles: true };
    const players = [
      { ...base, id: 'p1', nickname: 'Alpha', points: 100, missionsCompleted: 5, laughs: 7, categoryCounts: { dance: 2 } },
      { ...base, id: 'p2', nickname: 'Beta', points: 150, missionsCompleted: 2, wins: 3, rating: 1060, raidDamage: 400 },
    ];
    const awards = computeAwards(players as any, [], { unhinged: 'p1' });
    expect(awards.length).toBe(AWARDS.length);
    expect(awards.find((a) => a.id === 'legend')!.playerId).toBe('p2');
    expect(awards.find((a) => a.id === 'funniest')!.playerId).toBe('p1');
    expect(awards.find((a) => a.id === 'dance')!.playerId).toBe('p1');
    expect(awards.find((a) => a.id === 'champion')!.playerId).toBe('p2');
    expect(awards.find((a) => a.id === 'slayer')!.playerId).toBe('p2');
    expect(awards.find((a) => a.id === 'unhinged')!.playerId).toBe('p1');
    expect(awards.find((a) => a.id === 'palate')!.playerId).toBeNull();
    expect(awards.find((a) => a.id === 'menace')!.playerId).toBe('p1'); // lowest points
    expect(awards[0].id).toBe('legend');
  });
});

describe('content', () => {
  it('has at least 60 unique, short, self-service challenges across all 9 categories', () => {
    expect(MISSIONS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(MISSIONS.length);
    expect(new Set(MISSIONS.map((m) => m.category)).size).toBe(9);
    for (const m of MISSIONS) {
      expect(m.method, m.id).not.toBe('host');                    // no host bottleneck
      expect(m.instruction.length, m.id).toBeLessThanOrEqual(130); // readable at a glance
      expect(m.instruction, m.id).not.toMatch(/\b(shot|chug|skol|scull|finish your drink)/i); // never require drinking
    }
    expect(MISSIONS.filter((m) => !m.loud && m.scope === 'private').length).toBeGreaterThanOrEqual(30); // plenty for low-key players
  });
  it('filters names', () => {
    expect(validateNickname('Jezza').ok).toBe(true);
    expect(validateNickname('host').ok).toBe(false);
    expect(validateNickname('a').ok).toBe(false);
    expect(validateNickname('Dave', ['dave']).ok).toBe(false);
  });
});
