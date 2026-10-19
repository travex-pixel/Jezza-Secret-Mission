import type { Battle, BattleAction, BattleCreatureState, BattleRoundLog, CreatureId, TapQuality } from './types';
import { CREATURES } from './creatures';

export const MAX_ROUNDS = 7;
export const ROUND_SECONDS = 25;
export const CHALLENGE_TTL_MS = 2 * 60 * 1000;
export const SPECIAL_COOLDOWN = 2; // rounds that must pass after a special
export const BATTLE_REWARDS = { win: { points: 15, xp: 30 }, lose: { points: 5, xp: 15 } };
export const MAX_SCORED_VS_SAME_OPPONENT = 3;
export const TAP_BAR_MS = 1100;          // how long the power-tap marker takes to cross the bar
export const TAP_MULT: Record<TapQuality, number> = { perfect: 1.22, good: 1.08, miss: 1 };
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
  return Math.max(1, Math.round(atkOf(c) * 2.25 * roll * mult * TAP_MULT[c.tap ?? 'miss']));
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
  a.hp = Math.max(0, Math.min(a.maxHp, a.hp - rb.dealt - ra.selfDmg - bReflect + ra.heal));
  b.hp = Math.max(0, Math.min(b.maxHp, b.hp - ra.dealt - rb.selfDmg - aReflect + rb.heal));

  a.specialCooldown = aEff === 'special' ? SPECIAL_COOLDOWN : Math.max(0, a.specialCooldown - 1);
  b.specialCooldown = bEff === 'special' ? SPECIAL_COOLDOWN : Math.max(0, b.specialCooldown - 1);
  a.lastAction = aEff; b.lastAction = bEff;
  const aTap = a.tap, bTap = b.tap;
  a.action = undefined; b.action = undefined; a.tap = undefined; b.tap = undefined;

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
      // double KO: higher HP% before KO is impossible; use speed as tiebreak
      const aWins = spdOf(a) >= spdOf(b);
      finish(battle, aWins ? a.playerId : b.playerId, aWins ? b.playerId : a.playerId, 'ko', now);
      log.lines.push('Double knockout! Speed decides it.');
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

export function finish(battle: Battle, winnerId: string, loserId: string, reason: Battle['reason'], now: number) {
  battle.status = 'finished';
  battle.winnerId = winnerId;
  battle.loserId = loserId;
  battle.reason = reason;
  battle.finishedAt = now;
  battle.roundDeadline = undefined;
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
  const hide = (s: BattleCreatureState): BattleCreatureState => s.playerId === viewerId ? { ...s, locked: !!s.action } : { ...s, action: undefined, locked: !!s.action };
  return { ...battle, a: hide(battle.a), b: hide(battle.b), log: [...battle.log] };
}
