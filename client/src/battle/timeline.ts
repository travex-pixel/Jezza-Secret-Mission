// Turns the engine's real round log into a sequence of things to animate.
// Nothing here decides anything: every number comes from battle.log, and the
// HP after each round is recomputed with the engine's own formula
// (clamp(hp - dmgTaken + heal)), so the replay always lands on the real result.
import type { Battle, BattleAction, BattleRoundLog, CreatureId } from '@shared/types';
import { CREATURES } from '@shared/creatures';

export type Side = 'a' | 'b';
export interface Hp { a: number; b: number }

export type Step =
  | { kind: 'round'; round: number }
  | { kind: 'stance'; side: Side; bunker: boolean }
  | { kind: 'strike'; side: Side; creature: CreatureId; special: boolean; hits: number[]; crit: boolean; guarded: boolean; pierce: boolean; whiff: boolean; weak: boolean; ricochet: boolean; hp: Hp }
  | { kind: 'heal'; side: Side; amount: number; hp: Hp }
  | { kind: 'reflect'; side: Side; dmg: number; hp: Hp } // `side` threw it back
  | { kind: 'recoil'; side: Side; dmg: number; hp: Hp }
  | { kind: 'settle'; hp: Hp; lines: string[] };

export interface RoundBeats { round: number; steps: Step[]; lines: string[]; swing: number }
export interface Timeline {
  max: Hp;
  start: Hp;
  rounds: RoundBeats[];
  final: Hp;
  winner?: Side;
  reason?: Battle['reason'];
  turningRound?: number; // the round with the biggest swing: gets the camera treatment
}

const other = (s: Side): Side => (s === 'a' ? 'b' : 'a');
const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

/** Raw damage a side's move did to the target (dmgDealt includes anything it reflected). */
const rawDealt = (l: BattleRoundLog[Side]) => l.dmgDealt - (l.reflected ?? 0);

function hitsFor(creature: CreatureId, action: BattleAction, raw: number, lines: string[]): number[] {
  if (raw <= 0) return [];
  if (action === 'special' && creature === 'sprite') {
    for (const l of lines) { const m = /strikes twice: (\d+) \+ (\d+)/.exec(l); if (m && Number(m[1]) + Number(m[2]) === raw) return [Number(m[1]), Number(m[2])]; }
    return [Math.ceil(raw / 2), Math.floor(raw / 2)];
  }
  return [raw];
}

export function roundSteps(battle: Pick<Battle, 'a' | 'b'>, log: BattleRoundLog, before: Hp): { steps: Step[]; after: Hp; swing: number } {
  const max: Hp = { a: battle.a.maxHp, b: battle.b.maxHp };
  const creature: Record<Side, CreatureId> = { a: battle.a.creature, b: battle.b.creature };
  const spd = (s: Side) => CREATURES[creature[s]].stats.spd;
  const first: Side = spd('a') >= spd('b') ? 'a' : 'b';
  const order: Side[] = [first, other(first)];
  // Authoritative end-of-round HP: exactly what resolveRound applied.
  const after: Hp = { a: clamp(before.a - log.a.dmgTaken + log.a.heal, max.a), b: clamp(before.b - log.b.dmgTaken + log.b.heal, max.b) };
  // Running (unclamped) totals so the bars move hit by hit; displayed values are clamped.
  const run: Hp = { ...before };
  const shown = (): Hp => ({ a: clamp(run.a, max.a), b: clamp(run.b, max.b) });
  const steps: Step[] = [{ kind: 'round', round: log.round }];
  const guarding = (s: Side) => log[s].action === 'counter' || (log[s].action === 'special' && creature[s] === 'wombat');
  for (const s of order) if (guarding(s)) steps.push({ kind: 'stance', side: s, bunker: log[s].action === 'special' });
  for (const s of order) {
    const me = log[s]; const foe = other(s);
    if (me.action === 'counter') continue;
    if (me.action === 'special' && creature[s] === 'wombat') { run[s] += me.heal; steps.push({ kind: 'heal', side: s, amount: me.heal, hp: shown() }); continue; }
    const raw = rawDealt(me);
    const hits = hitsFor(creature[s], me.action, raw, log.lines);
    run[foe] -= raw;
    const special = me.action === 'special';
    const weak = special && creature[s] === 'fox' && log[foe].action !== 'attack';
    steps.push({ kind: 'strike', side: s, creature: creature[s], special, hits, crit: me.tap === 'perfect' && raw > 0, guarded: guarding(foe), pierce: special && (creature[s] === 'owl' || creature[s] === 'stag'), whiff: special && raw === 0, weak, ricochet: special && creature[s] === 'goblin' && log[foe].action === 'counter', hp: shown() });
    // self-inflicted: dmgTaken = foe's raw + my self damage + foe's reflect
    const selfDmg = me.dmgTaken - rawDealt(log[foe]) - (log[foe].reflected ?? 0);
    if (selfDmg > 0) { run[s] -= selfDmg; steps.push({ kind: 'recoil', side: s, dmg: selfDmg, hp: shown() }); }
  }
  for (const s of order) {
    const r = log[s].reflected ?? 0;
    if (r > 0) { run[other(s)] -= r; steps.push({ kind: 'reflect', side: s, dmg: r, hp: shown() }); }
  }
  steps.push({ kind: 'settle', hp: after, lines: log.lines });
  const swing = Math.abs((before.a - after.a) / max.a - (before.b - after.b) / max.b);
  return { steps, after, swing };
}

export function buildTimeline(battle: Battle): Timeline {
  const max: Hp = { a: battle.a.maxHp, b: battle.b.maxHp };
  let hp: Hp = { ...max };
  const rounds: RoundBeats[] = [];
  for (const log of battle.log) {
    const r = roundSteps(battle, log, hp);
    rounds.push({ round: log.round, steps: r.steps, lines: log.lines, swing: r.swing });
    hp = r.after;
  }
  const winner: Side | undefined = battle.winnerId ? (battle.winnerId === battle.a.playerId ? 'a' : 'b') : undefined;
  const turning = rounds.length > 1 ? [...rounds].sort((x, y) => y.swing - x.swing)[0].round : undefined;
  return { max, start: { ...max }, rounds, final: hp, winner, reason: battle.reason, turningRound: turning };
}
