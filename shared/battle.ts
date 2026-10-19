import type { Battle, BattleAction, BattleCreatureState, BattleRoundLog, CreatureId, TapQuality } from './types';
import { CREATURES } from './creatures';

export const MAX_ROUNDS = 7;
export const ROUND_SECONDS = 25;
export const CHALLENGE_TTL_MS = 2 * 60 * 1000;
export const SPECIAL_COOLDOWN = 2; // rounds that must pass after a special
export const BATTLE_REWARDS = { win: { points: 15, xp: 30 }, lose: { points: 5, xp: 15 } };
export const MAX_SCORED_VS_SAME_OPPONENT = 3;
export const TAP_BAR_MS = 1100;          // legacy: how long the old one-pass marker took to cross the bar
export const TAP_SWEEP_MS = 800;         // power tap: one sweep of the oscillating marker (it keeps going until you tap)
export const TAP_MIN_MS = 300;           // a tap can't plausibly land before the marker first reaches the middle
// Power tap accuracy: 0 = tapped at the very edge, 1 = dead centre. The bonus grows with the square of it,
// so the last few pixels near the middle are worth the most. Max stays +22%, same as the old gold zone.
export const POWER_BONUS = 0.22;
const clamp01 = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
export const powerMult = (p: number) => 1 + POWER_BONUS * clamp01(p) ** 2;
export const qualityFor = (p: number): TapQuality => (clamp01(p) >= 0.9 ? 'perfect' : clamp01(p) >= 0.6 ? 'good' : 'miss');
export const POWER_FOR: Record<TapQuality, number> = { perfect: 1, good: 0.6, miss: 0 }; // older clients send a tier
export const TAP_MULT: Record<TapQuality, number> = { perfect: powerMult(1), good: powerMult(0.6), miss: 1 };
export const cleanPower = (power: unknown, tap?: TapQuality): number => (typeof power === 'number' ? clamp01(power) : POWER_FOR[tap === 'perfect' || tap === 'good' ? tap : 'miss']);
export const COUNTER_TAKE = 0.5;         // damage multiplier while countering
export const COUNTER_REFLECT = 0.45;     // share of the (reduced) damage thrown back

export type Rng = () => number; // [0,1)

export function makeCreatureState(playerId: string, creature: CreatureId, level: number): BattleCreatureState {
  const base = CREATURES[creature].stats;
  // Gentle level scaling so a level 10 creature is ~+18% HP; keeps battles fair at a party.
  const maxHp = Math.round(base.hp * (1 + (level - 1) * 0.02));
  return { playerId, creature, hp: maxHp, maxHp, specialCooldown: 0 };
}

function atkOf(c: BattleCreatureState) { return CREATURES[c.creature].stats.atk; }
function defOf(c: BattleCreatureState) { return CREATURES[c.creature].stats.def; }
function spdOf(c: BattleCreatureState) { return CREATURES[c.creature].stats.spd; }
function name(c: BattleCreatureState, names: Record<string, string>) { return names[c.playerId] ?? CREATURES[c.creature].name; }

/** Raw attack damage before the target's mitigation. */
function baseDamage(c: BattleCreatureState, rng: Rng, mult = 1): number {
  const roll = 0.9 + rng() * 0.3;
  return Math.max(1, Math.round(atkOf(c) * 2.25 * roll * mult * powerMult(c.power ?? POWER_FOR[c.tap ?? 'miss'])));
}

/** Apply target's defence stat and counter stance. */
function mitigate(raw: number, target: BattleCreatureState, targetAction: BattleAction, pierce = false): number {
  let d = Math.round(raw * (1 - defOf(target) * 0.028));
  const guarding = targetAction === 'counter' || (targetAction === 'special' && target.creature === 'wombat'); // Bunker Down also halves damage
  if (guarding && !pierce) d = Math.round(d * COUNTER_TAKE);
  return Math.max(1, d);
}

interface Side { dealt: number; selfDmg: number; heal: number; lines: string[] }

function resolveSide(me: BattleCreatureState, foe: BattleCreatureState, myAct: BattleAction, foeAct: BattleAction, rng: Rng, names: Record<string, string>): Side {
  const out: Side = { dealt: 0, selfDmg: 0, heal: 0, lines: [] };
  const my = name(me, names);
  const their = name(foe, names);
  if (myAct === 'attack') {
    out.dealt = mitigate(baseDamage(me, rng), foe, foeAct);
    out.lines.push(foeAct === 'counter' ? `${my} attacks into the stance: ${out.dealt} damage.` : `${my} attacks for ${out.dealt}!`);
    return out;
  }
  if (myAct === 'counter') {
    out.lines.push(`${my} drops into a counter stance.`);
    return out;
  }
  // special
  const sp = CREATURES[me.creature].special.name;
  switch (me.creature) {
    case 'dragon': {
      out.dealt = mitigate(baseDamage(me, rng, 1.6), foe, foeAct);
      out.selfDmg = 8;
      out.lines.push(`${my} unleashes ${sp}! ${out.dealt} damage, singes itself for ${out.selfDmg}.`);
      break;
    }
    case 'wombat': {
      out.heal = 22;
      out.lines.push(`${my} uses ${sp}: heals ${out.heal} and digs in.`);
      break;
    }
    case 'possum': {
      if (rng() < 0.5) { out.dealt = mitigate(baseDamage(me, rng, 2.4), foe, foeAct); out.lines.push(`${my}'s ${sp} pays off! ${out.dealt} damage!`); }
      else { out.lines.push(`${my}'s ${sp} backfires. Total whiff.`); }
      break;
    }
    case 'owl': {
      out.dealt = mitigate(baseDamage(me, rng, 1.25), foe, foeAct, true);
      out.lines.push(`${my}'s ${sp} pierces straight through for ${out.dealt}.`);
      break;
    }
    case 'goblin': {
      if (foeAct === 'counter') { out.dealt = mitigate(baseDamage(me, rng, 1.4), foe, foeAct); out.selfDmg = 6; out.lines.push(`${my}'s ${sp} ricochets off the stance! ${out.dealt} dealt, ${out.selfDmg} bounced back.`); }
      else { out.dealt = mitigate(baseDamage(me, rng, 1.4), foe, foeAct); out.lines.push(`${my} fires a ${sp} for ${out.dealt}!`); }
      break;
    }
    case 'sprite': {
      const h1 = mitigate(baseDamage(me, rng, 0.8), foe, foeAct);
      const h2 = mitigate(baseDamage(me, rng, 0.8), foe, foeAct);
      out.dealt = h1 + h2;
      out.lines.push(`${my}'s ${sp} strikes twice: ${h1} + ${h2}.`);
      break;
    }
    case 'barrel': {
      out.dealt = mitigate(baseDamage(me, rng, 1.5), foe, foeAct);
      out.selfDmg = 5;
      out.lines.push(`${my} does a ${sp}! ${out.dealt} damage. Bumps its head for ${out.selfDmg}.`);
      break;
    }
    case 'fox': {
      if (foeAct === 'attack') { out.dealt = mitigate(baseDamage(me, rng, 1.6), foe, foeAct); out.lines.push(`${my} reads the attack and counters with ${sp}! ${out.dealt} damage.`); }
      else { out.dealt = mitigate(baseDamage(me, rng, 0.6), foe, foeAct); out.lines.push(`${my} springs the ${sp} but ${their} wasn't attacking. Only ${out.dealt}.`); }
      break;
    }
  }
  return out;
}

/** Resolve one round. Mutates the battle (hp, cooldowns, log, round, winner). */
export function resolveRound(battle: Battle, rng: Rng, names: Record<string, string>, now: number): BattleRoundLog {
  const { a, b } = battle;
  const aAct: BattleAction = a.action ?? 'counter';
  const bAct: BattleAction = b.action ?? 'counter';
  // enforce cooldown: an illegal special becomes a plain attack
  const aEff: BattleAction = aAct === 'special' && a.specialCooldown > 0 ? 'attack' : aAct;
  const bEff: BattleAction = bAct === 'special' && b.specialCooldown > 0 ? 'attack' : bAct;

  const ra = resolveSide(a, b, aEff, bEff, rng, names);
  const rb = resolveSide(b, a, bEff, aEff, rng, names);

  // Counter: whoever is in the stance throws part of the damage they took straight back.
  let aReflect = 0, bReflect = 0;
  if (aEff === 'counter' && rb.dealt > 0) { aReflect = Math.max(1, Math.round(rb.dealt * COUNTER_REFLECT)); ra.lines.push(`${name(a, names)} turns it around: ${aReflect} reflected!`); }
  else if (aEff === 'counter') ra.lines.push(`${name(a, names)}'s stance meets thin air.`);
  if (bEff === 'counter' && ra.dealt > 0) { bReflect = Math.max(1, Math.round(ra.dealt * COUNTER_REFLECT)); rb.lines.push(`${name(b, names)} turns it around: ${bReflect} reflected!`); }
  else if (bEff === 'counter') rb.lines.push(`${name(b, names)}'s stance meets thin air.`);
  if (a.tap === 'perfect' && ra.dealt > 0) ra.lines[0] = `CRIT! ${ra.lines[0]}`;
  if (b.tap === 'perfect' && rb.dealt > 0) rb.lines[0] = `CRIT! ${rb.lines[0]}`;

  // Apply simultaneously
  const aBefore = a.hp, bBefore = b.hp;
  a.hp = Math.max(0, Math.min(a.maxHp, a.hp - rb.dealt - ra.selfDmg - bReflect + ra.heal));
  b.hp = Math.max(0, Math.min(b.maxHp, b.hp - ra.dealt - rb.selfDmg - aReflect + rb.heal));

  a.specialCooldown = aEff === 'special' ? SPECIAL_COOLDOWN : Math.max(0, a.specialCooldown - 1);
  b.specialCooldown = bEff === 'special' ? SPECIAL_COOLDOWN : Math.max(0, b.specialCooldown - 1);
  a.lastAction = aEff; b.lastAction = bEff;
  const aTap = a.tap, bTap = b.tap;
  a.action = undefined; b.action = undefined; a.tap = undefined; b.tap = undefined; a.power = undefined; b.power = undefined;

  // Faster creature's line first for drama
  const lines = spdOf(a) >= spdOf(b) ? [...ra.lines, ...rb.lines] : [...rb.lines, ...ra.lines];
  const log: BattleRoundLog = {
    round: battle.round,
    lines,
    a: { action: aEff, dmgDealt: ra.dealt + aReflect, dmgTaken: rb.dealt + ra.selfDmg + bReflect, heal: ra.heal, tap: aTap, reflected: aReflect || undefined },
    b: { action: bEff, dmgDealt: rb.dealt + bReflect, dmgTaken: ra.dealt + rb.selfDmg + aReflect, heal: rb.heal, tap: bTap, reflected: bReflect || undefined },
  };
  battle.log.push(log);

  if (a.hp <= 0 || b.hp <= 0) {
    if (a.hp <= 0 && b.hp <= 0) {
      // Both would drop in the same round: whoever was ahead going into it hangs on with 1 HP (speed breaks a tie).
      const aPct = aBefore / a.maxHp, bPct = bBefore / b.maxHp;
      const aWins = aPct > bPct || (aPct === bPct && spdOf(a) >= spdOf(b));
      const [w, l, wl, ll, wBefore] = aWins ? [a, b, log.a, log.b, aBefore] : [b, a, log.b, log.a, bBefore];
      hangOn(w, wl, ll, wBefore);
      finish(battle, w.playerId, l.playerId, 'ko', now);
      log.lines.push(`${name(w, names)} hangs on with 1 HP! ${name(l, names)} is down!`);
    } else {
      const winner = a.hp > 0 ? a : b;
      const loser = a.hp > 0 ? b : a;
      finish(battle, winner.playerId, loser.playerId, 'ko', now);
      log.lines.push(`${name(loser, names)} is down! ${name(winner, names)} wins!`);
    }
  } else if (battle.round >= MAX_ROUNDS) {
    const aPct = a.hp / a.maxHp; const bPct = b.hp / b.maxHp;
    const aWins = aPct > bPct || (aPct === bPct && spdOf(a) >= spdOf(b));
    finish(battle, aWins ? a.playerId : b.playerId, aWins ? b.playerId : a.playerId, 'rounds', now);
    log.lines.push(`Time! ${name(aWins ? a : b, names)} wins on remaining health.`);
  } else {
    battle.round += 1;
    battle.roundDeadline = now + ROUND_SECONDS * 1000;
  }
  return log;
}

/** Winner of a would-be double KO survives on 1 HP; the round log is trimmed to match so replays agree. */
function hangOn(w: BattleCreatureState, wl: BattleRoundLog[Side_], ll: BattleRoundLog[Side_], before: number) {
  const taken = Math.max(0, before + wl.heal - 1);
  let excess = wl.dmgTaken - taken;
  wl.dmgTaken = taken;
  const raw = ll.dmgDealt - (ll.reflected ?? 0);
  const cut = Math.min(excess, raw); ll.dmgDealt -= cut; excess -= cut;
  if (excess > 0 && ll.reflected) { const c2 = Math.min(excess, ll.reflected); ll.reflected -= c2; ll.dmgDealt -= c2; if (!ll.reflected) ll.reflected = undefined; }
  w.hp = 1;
}
type Side_ = 'a' | 'b';

export function finish(battle: Battle, winnerId: string, loserId: string, reason: Battle['reason'], now: number) {
  battle.status = 'finished';
  battle.winnerId = winnerId;
  battle.loserId = loserId;
  battle.reason = reason;
  battle.finishedAt = now;
  battle.roundDeadline = undefined;
}

// ---------- Quick battles: pick a game plan, the fight plays itself ----------
export type GamePlan = 'balanced' | 'aggro' | 'sneaky';
export const PLAN_SECONDS = 20; // time to pick a plan before Balanced is picked for you
// Plans change HOW a creature fights, not how likely it is to win: they're tuned to within a few % of each
// other (scripts/plans-balance.ts), so the creature, the charge-up tap and luck still decide it.
export const PLANS: Record<GamePlan, { name: string; emoji: string; blurb: string; special: number; attack: number }> = {
  balanced: { name: 'Balanced', emoji: '⚖️', blurb: 'A bit of everything, the odd counter.', special: 0.35, attack: 0.8 },
  aggro:    { name: 'All-out', emoji: '🔥', blurb: 'Never blocks. Just keeps swinging.', special: 0.25, attack: 1 },
  sneaky:   { name: 'Sneaky', emoji: '🦊', blurb: 'Saves nothing: specials whenever it can.', special: 0.55, attack: 0.7 },
};
export const isPlan = (p: unknown): p is GamePlan => typeof p === 'string' && p in PLANS;

/**
 * How a creature fights on its own: same three moves a person has, weighted by its game plan.
 * `charge` is the power-tap accuracy (0-1) locked in before a quick battle, used on every damaging move;
 * without one (auto-battles) each swing gets a random tap.
 */
export function autoPick(side: BattleCreatureState, rng: Rng, plan: GamePlan = 'balanced', charge?: number): { action: BattleAction; tap: TapQuality; power: number } {
  const w = PLANS[plan];
  const action: BattleAction = side.specialCooldown === 0 && rng() < w.special ? 'special' : rng() < w.attack ? 'attack' : 'counter';
  const r = rng();
  const power = charge ?? (r < 0.15 ? 0.9 + rng() * 0.1 : r < 0.5 ? 0.6 + rng() * 0.3 : rng() * 0.6);
  if (action === 'counter') return { action, tap: 'miss', power: 0 };
  return { action, tap: qualityFor(power), power };
}

/** Simple seeded RNG (mulberry32) for tests and replays. */
export function seededRng(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hide the opponent's pending action from a viewer. */
export function redactBattle(battle: Battle, viewerId: string): Battle {
  const live = battle.status === 'active';
  const hide = (s: BattleCreatureState): BattleCreatureState => s.playerId === viewerId
    ? { ...s, locked: !!s.action || !!s.plan }
    : { ...s, action: undefined, plan: live ? undefined : s.plan, charge: live ? undefined : s.charge, chargePower: live ? undefined : s.chargePower, locked: !!s.action || !!s.plan };
  return { ...battle, a: hide(battle.a), b: hide(battle.b), log: [...battle.log] };
}
