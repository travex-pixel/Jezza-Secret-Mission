// Simulates quick battles: every game plan vs every other, across all creature pairings.
import { makeCreatureState, resolveRound, seededRng, autoPick, PLANS, POWER_FOR, type GamePlan } from '../shared/battle';
import { CREATURE_IDS } from '../shared/creatures';
import type { Battle, TapQuality } from '../shared/types';
const rng = seededRng(5);
const taps: TapQuality[] = ['miss', 'good', 'perfect'];
const ids = Object.keys(PLANS) as GamePlan[];
const wins: Record<string, [number, number]> = {};
for (const pa of ids) for (const pb of ids) {
  let w = 0, n = 0;
  for (const ca of CREATURE_IDS) for (const cb of CREATURE_IDS) for (let k = 0; k < 40; k++) {
    const b = { status: 'active', round: 1, a: makeCreatureState('a', ca, 5), b: makeCreatureState('b', cb, 5), log: [] } as unknown as Battle;
    const ta = taps[k % 3], tb = taps[(k + 1) % 3];
    while (b.status === 'active') {
      for (const [s, plan, tap] of [[b.a, pa, ta], [b.b, pb, tb]] as const) { const p = autoPick(s, rng, plan, POWER_FOR[tap]); s.action = p.action; s.tap = p.tap; }
      resolveRound(b, rng, {}, 0);
    }
    n++; if (b.winnerId === 'a') w++;
  }
  wins[`${pa} vs ${pb}`] = [w, n];
}
for (const pa of ids) console.log(pa.padEnd(9), ids.map((pb) => `${pb}:${Math.round((wins[`${pa} vs ${pb}`][0] / wins[`${pa} vs ${pb}`][1]) * 100)}%`).join('  '));
