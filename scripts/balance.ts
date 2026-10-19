import { makeCreatureState, resolveRound, seededRng } from '../shared/battle';
import { CREATURE_IDS } from '../shared/creatures';
import type { Battle, CreatureId } from '../shared/types';
const mk = (a: CreatureId, b: CreatureId): Battle => ({ id: 'b', challengerId: 'A', opponentId: 'B', status: 'active', createdAt: 0, round: 1, a: makeCreatureState('A', a, 1), b: makeCreatureState('B', b, 1), log: [], scored: true });
const wins: Record<string, number> = {}; const games: Record<string, number> = {}; let seed = 1; let totalRounds = 0, n = 0;
for (const a of CREATURE_IDS) for (const b of CREATURE_IDS) { if (a === b) continue; for (let g = 0; g < 200; g++) { const rng = seededRng(seed++); const bt = mk(a, b);
  while (bt.status === 'active') { const pick = (cd: number) => (cd === 0 && rng() < 0.35 ? 'special' : rng() < 0.75 ? 'attack' : 'counter'); bt.a.action = pick(bt.a.specialCooldown); bt.b.action = pick(bt.b.specialCooldown); resolveRound(bt, rng, {}, 0); }
  totalRounds += bt.log.length; n++; games[a] = (games[a] ?? 0) + 1; games[b] = (games[b] ?? 0) + 1; const w = bt.winnerId === 'A' ? a : b; wins[w] = (wins[w] ?? 0) + 1; } }
for (const c of CREATURE_IDS) console.log(c.padEnd(8), ((wins[c] ?? 0) / games[c]).toFixed(2));
console.log('avg rounds', (totalRounds / n).toFixed(2));
