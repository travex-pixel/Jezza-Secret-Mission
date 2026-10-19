// Hill-climb creature HP so simulated win rates land in a fair band. Prints final stats.
import { makeCreatureState, resolveRound, seededRng } from '../shared/battle';
import { CREATURES, CREATURE_IDS } from '../shared/creatures';
import type { Battle, CreatureId } from '../shared/types';
const mk = (a: CreatureId, b: CreatureId): Battle => ({ id: 'b', challengerId: 'A', opponentId: 'B', status: 'active', createdAt: 0, round: 1, a: makeCreatureState('A', a, 1), b: makeCreatureState('B', b, 1), log: [], scored: true });
function sim(games = 120) {
  const wins: Record<string, number> = {}; const n: Record<string, number> = {}; let seed = 1; let rounds = 0, cnt = 0;
  for (const a of CREATURE_IDS) for (const b of CREATURE_IDS) { if (a === b) continue; for (let g = 0; g < games; g++) { const rng = seededRng(seed++); const bt = mk(a, b);
    while (bt.status === 'active') { const pick = (cd: number) => (cd === 0 && rng() < 0.35 ? 'special' : rng() < 0.75 ? 'attack' : 'counter'); bt.a.action = pick(bt.a.specialCooldown); bt.b.action = pick(bt.b.specialCooldown); resolveRound(bt, rng, {}, 0); }
    rounds += bt.log.length; cnt++; n[a] = (n[a] ?? 0) + 1; n[b] = (n[b] ?? 0) + 1; const w = bt.winnerId === 'A' ? a : b; wins[w] = (wins[w] ?? 0) + 1; } }
  const rates: Record<string, number> = {}; for (const c of CREATURE_IDS) rates[c] = (wins[c] ?? 0) / n[c];
  return { rates, avgRounds: rounds / cnt };
}
for (let it = 0; it < 25; it++) {
  const { rates, avgRounds } = sim();
  let worst = 0;
  for (const c of CREATURE_IDS) { const d = rates[c] - 0.5; worst = Math.max(worst, Math.abs(d)); if (Math.abs(d) > 0.04) CREATURES[c].stats.hp = Math.max(70, Math.min(140, CREATURES[c].stats.hp - Math.round(d * 40))); }
  console.log(`iter ${it} worst=${worst.toFixed(3)} rounds=${avgRounds.toFixed(2)}`, CREATURE_IDS.map((c) => `${c}:${rates[c].toFixed(2)}/${CREATURES[c].stats.hp}`).join(' '));
  if (worst <= 0.06) break;
}
console.log(JSON.stringify(Object.fromEntries(CREATURE_IDS.map((c) => [c, CREATURES[c].stats]))));
