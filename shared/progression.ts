import type { Cosmetic, PlayerPublic, MissionCategory, Battle, AwardResult } from './types';

// Cumulative XP needed to reach each level (index = level-1). Max level 10.
export const LEVEL_XP = [0, 60, 150, 280, 450, 670, 950, 1300, 1720, 2200];
export const MAX_LEVEL = LEVEL_XP.length;

export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) lvl = i + 1;
  return Math.min(lvl, MAX_LEVEL);
}

export function levelProgress(xp: number): { level: number; into: number; needed: number; pct: number } {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return { level, into: 0, needed: 0, pct: 1 };
  const base = LEVEL_XP[level - 1];
  const next = LEVEL_XP[level];
  const into = xp - base;
  const needed = next - base;
  return { level, into, needed, pct: Math.max(0, Math.min(1, into / needed)) };
}

export const COSMETICS: Cosmetic[] = [
  { id: 'hat_party', slot: 'hat', name: 'Party Cone', description: 'A tiny gold party hat. Immediately improves morale.' },
  { id: 'hat_cork', slot: 'hat', name: 'Cork Crown', description: 'A crown of wine corks. Smells faintly of 2019.' },
  { id: 'hat_crown', slot: 'hat', name: 'Royal Crown', description: 'For creatures of noble bearing and questionable judgement.' },
  { id: 'hat_beret', slot: 'hat', name: 'Sommelier Beret', description: 'Detects notes of oak, cherry and nonsense.' },
  { id: 'face_shades', slot: 'face', name: 'Cellar Shades', description: 'For when the moonlight is simply too much.' },
  { id: 'face_monocle', slot: 'face', name: 'Monocle', description: 'Instantly 40% more sophisticated.' },
  { id: 'cape_velvet', slot: 'cape', name: 'Velvet Cape', description: 'Merlot velvet. Dramatic entrances only.' },
  { id: 'cape_gold', slot: 'cape', name: 'Champagne Cape', description: 'Shimmering gold. Worn by legends and show-offs.' },
  { id: 'aura_ember', slot: 'aura', name: 'Ember Aura', description: 'A warm orange glow. Smells like campfire banter.' },
  { id: 'aura_moon', slot: 'aura', name: 'Moonlit Aura', description: 'Cool silver light. Mysterious. Slightly damp.' },
  { id: 'aura_gold', slot: 'aura', name: 'Legend Aura', description: 'Pure champagne gold. The vineyard knows your name.' },
  { id: 'pose_heroic', slot: 'pose', name: 'Heroic Pose', description: 'Chest out, chin up, wind machine implied.' },
  { id: 'pose_lounge', slot: 'pose', name: 'Lounge Pose', description: 'Reclined. Unbothered. Possibly asleep.' },
];
export const COSMETIC_BY_ID: Record<string, Cosmetic> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

/** Cosmetics unlocked purely by creature level. */
export const LEVEL_UNLOCKS: Record<number, { cosmetics: string[]; colorways: number; title?: string }> = {
  1: { cosmetics: ['hat_party'], colorways: 1 },
  2: { cosmetics: [], colorways: 2 },
  3: { cosmetics: ['hat_cork'], colorways: 2 },
  4: { cosmetics: ['aura_ember'], colorways: 2 },
  5: { cosmetics: ['cape_velvet'], colorways: 2, title: 'Vineyard Regular' },
  6: { cosmetics: [], colorways: 3 },
  7: { cosmetics: ['pose_heroic'], colorways: 3 },
  8: { cosmetics: ['hat_crown', 'aura_moon'], colorways: 3, title: 'Cellar Noble' },
  9: { cosmetics: ['cape_gold'], colorways: 3 },
  10: { cosmetics: ['aura_gold'], colorways: 3, title: 'Hunter Valley Legend' },
};

export function colorwaysUnlocked(level: number): number {
  let n = 1;
  for (let l = 1; l <= level; l++) n = Math.max(n, LEVEL_UNLOCKS[l]?.colorways ?? n);
  return n;
}

export function cosmeticsForLevel(level: number): string[] {
  const out: string[] = [];
  for (let l = 1; l <= level; l++) out.push(...(LEVEL_UNLOCKS[l]?.cosmetics ?? []));
  return out;
}

export function titleForLevel(level: number): string {
  let t = 'Fresh Legend';
  for (let l = 1; l <= level; l++) if (LEVEL_UNLOCKS[l]?.title) t = LEVEL_UNLOCKS[l].title!;
  return t;
}

// ---------- Achievements ----------
export interface AchievementDef {
  id: string;
  name: string;
  blurb: string;
  xp: number;
  points: number;
  cosmetic?: string;
  check: (p: PlayerPublic, ctx: { battles: Battle[] }) => boolean;
}

const cat = (p: PlayerPublic, c: MissionCategory) => p.categoryCounts[c] ?? 0;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_blood', name: 'The Legend Begins', blurb: 'Completed your first mission.', xp: 10, points: 0, check: (p) => p.missionsCompleted >= 1 },
  { id: 'five_missions', name: 'Getting Involved', blurb: 'Five missions down.', xp: 25, points: 10, check: (p) => p.missionsCompleted >= 5 },
  { id: 'ten_missions', name: 'Mission Assassin', blurb: 'Ten missions. Unstoppable.', xp: 50, points: 20, cosmetic: 'face_shades', check: (p) => p.missionsCompleted >= 10 },
  { id: 'twenty_missions', name: 'Absolutely Cooked', blurb: 'Twenty missions. Seek help. Or more missions.', xp: 80, points: 30, check: (p) => p.missionsCompleted >= 20 },
  { id: 'first_battle', name: 'Into the Arena', blurb: 'Fought your first creature battle.', xp: 15, points: 0, check: (p) => p.wins + p.losses >= 1 },
  { id: 'first_win', name: 'Taste of Victory', blurb: 'Won a creature battle.', xp: 25, points: 5, check: (p) => p.wins >= 1 },
  { id: 'three_wins', name: 'Creature Champion', blurb: 'Three battle wins.', xp: 50, points: 15, cosmetic: 'pose_lounge', check: (p) => p.wins >= 3 },
  { id: 'glorious_loser', name: 'Glorious Loser', blurb: 'Lost three battles and kept smiling.', xp: 30, points: 10, check: (p) => p.losses >= 3 },
  { id: 'toastmaster', name: 'Toastmaster General', blurb: 'Three toast missions. Glasses raised.', xp: 40, points: 10, cosmetic: 'face_monocle', check: (p) => cat(p, 'toast') >= 3 },
  { id: 'groom_whisperer', name: 'Groom Whisperer', blurb: 'Three Jezza missions. He trusts you. Fool.', xp: 40, points: 10, check: (p) => cat(p, 'jezza') >= 3 },
  { id: 'agent_of_chaos', name: 'Agent of Chaos', blurb: 'Three social chaos missions.', xp: 40, points: 10, check: (p) => cat(p, 'social') >= 3 },
  { id: 'paparazzi', name: 'Paparazzi', blurb: 'Three photo missions approved.', xp: 40, points: 10, cosmetic: 'hat_beret', check: (p) => cat(p, 'photo') >= 3 },
  { id: 'secret_agent', name: 'Secret Agent', blurb: 'Completed a secret mission. Nobody suspected a thing.', xp: 30, points: 10, check: (p) => cat(p, 'secret') >= 1 },
  { id: 'team_player', name: 'Team Player', blurb: 'Three group missions.', xp: 40, points: 10, check: (p) => cat(p, 'group') >= 3 },
  { id: 'reliable_witness', name: 'Reliable Witness', blurb: 'Confirmed three missions for mates.', xp: 30, points: 5, check: (p) => p.witnessed >= 3 },
  { id: 'fashionista', name: 'Master of Disguise', blurb: 'Equipped a hat, a cape and an aura at once.', xp: 30, points: 5, check: (p) => !!(p.equipped.hat && p.equipped.cape && p.equipped.aura) },
  { id: 'level_five', name: 'Vineyard Regular', blurb: 'Creature reached level 5.', xp: 0, points: 15, check: (p) => p.level >= 5 },
  { id: 'level_ten', name: 'Hunter Valley Legend', blurb: 'Creature reached max level.', xp: 0, points: 40, check: (p) => p.level >= 10 },
];
export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// ---------- Weekend awards ----------
export interface AwardDef { id: string; name: string; blurb: string; hostPick?: boolean }
export const AWARDS: AwardDef[] = [
  { id: 'legend', name: 'Legend of the Bucks', blurb: 'Most weekend points. The undisputed champion.' },
  { id: 'chaos', name: 'Agent of Chaos', blurb: 'Most social chaos missions completed.' },
  { id: 'assassin', name: 'Mission Assassin', blurb: 'Most missions completed overall.' },
  { id: 'champion', name: 'Creature Champion', blurb: 'Best battle record.' },
  { id: 'mvp', name: 'Unexpected MVP', blurb: 'Biggest climb up the leaderboard on Saturday.' },
  { id: 'toastmaster', name: 'Toastmaster General', blurb: 'Most toasts delivered.' },
  { id: 'menace', name: 'Social Menace', blurb: 'Most battles fought, win or lose.' },
  { id: 'whisperer', name: 'Groom Whisperer', blurb: 'Most Jezza missions completed.' },
  { id: 'disguise', name: 'Master of Disguise', blurb: 'Most cosmetics unlocked.' },
  { id: 'unhinged', name: 'Most Unhinged Strategy', blurb: 'Chosen by the host for reasons that defy analysis.', hostPick: true },
];

export function computeAwards(
  players: PlayerPublic[],
  battles: Battle[],
  fridayPoints: Record<string, number>,
  overrides: Record<string, string | null>,
): AwardResult[] {
  const alive = players.filter((p) => !p.removed && p.creature);
  const pick = (score: (p: PlayerPublic) => number, fmt: (p: PlayerPublic, s: number) => string) => {
    let best: PlayerPublic | null = null; let bestS = -Infinity;
    for (const p of alive) { const s = score(p); if (s > bestS && s > 0) { best = p; bestS = s; } }
    return best ? { playerId: best.id, reason: fmt(best, bestS) } : { playerId: null, reason: 'Nobody qualified. Shameful.' };
  };
  const results: AwardResult[] = AWARDS.map((a) => {
    let r: { playerId: string | null; reason: string };
    switch (a.id) {
      case 'legend': r = pick((p) => p.points, (p, s) => `${s} weekend points`); break;
      case 'chaos': r = pick((p) => cat(p, 'social'), (p, s) => `${s} chaos missions`); break;
      case 'assassin': r = pick((p) => p.missionsCompleted, (p, s) => `${s} missions completed`); break;
      case 'champion': r = pick((p) => p.wins * 3 - p.losses + (p.wins + p.losses > 0 ? 1 : 0), (p) => `${p.wins}W ${p.losses}L`); break;
      case 'mvp': {
        const friRank = rankMap(alive.map((p) => ({ id: p.id, v: fridayPoints[p.id] ?? 0 })));
        const satRank = rankMap(alive.map((p) => ({ id: p.id, v: p.points })));
        r = pick((p) => (friRank[p.id] ?? alive.length) - (satRank[p.id] ?? alive.length), (p, s) => `Climbed ${s} place${s === 1 ? '' : 's'} on Saturday`);
        break;
      }
      case 'toastmaster': r = pick((p) => cat(p, 'toast'), (p, s) => `${s} toasts delivered`); break;
      case 'menace': r = pick((p) => p.wins + p.losses, (p, s) => `${s} battles fought`); break;
      case 'whisperer': r = pick((p) => cat(p, 'jezza'), (p, s) => `${s} Jezza missions`); break;
      case 'disguise': r = pick((p) => p.unlocked.length, (p, s) => `${s} cosmetics unlocked`); break;
      default: r = { playerId: null, reason: 'Awaiting the host\'s judgement.' };
    }
    if (a.id in overrides) {
      const pid = overrides[a.id];
      r = { playerId: pid, reason: pid ? 'Decreed by the host.' : 'Withheld by the host.' };
    }
    return { id: a.id, name: a.name, blurb: a.blurb, playerId: r.playerId, reason: r.reason, hostPick: a.hostPick || a.id in overrides };
  });
  return results;
}

function rankMap(items: { id: string; v: number }[]): Record<string, number> {
  const sorted = [...items].sort((a, b) => b.v - a.v);
  const out: Record<string, number> = {};
  sorted.forEach((x, i) => { out[x.id] = i + 1; });
  return out;
}

export function sortLeaderboard(players: PlayerPublic[]): PlayerPublic[] {
  return [...players]
    .filter((p) => !p.removed)
    .sort((a, b) => b.points - a.points || b.xp - a.xp || b.wins - a.wins || a.joinedAt - b.joinedAt);
}
