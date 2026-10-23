// The Saturday systems: Lucky Drops (loot), Quests (daily goals) and The Mole (a secret role).
// All three are generic game systems: nothing in here knows whose party it is.
import type { PlayerPublic } from './types';

// ---------- Lucky Drops ----------
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITY: Record<Rarity, { label: string; color: string; weight: number; dupPoints: number; points: [number, number]; xp: number }> = {
  common:    { label: 'Common',    color: '#cfc6c9', weight: 50, dupPoints: 15,  points: [10, 20],  xp: 15 },
  rare:      { label: 'Rare',      color: '#5ee0ff', weight: 30, dupPoints: 30,  points: [20, 35],  xp: 30 },
  epic:      { label: 'Epic',      color: '#c38cff', weight: 15, dupPoints: 60,  points: [40, 60],  xp: 50 },
  legendary: { label: 'Legendary', color: '#FFD86B', weight: 5,  dupPoints: 120, points: [80, 120], xp: 80 },
};
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
export const DROP_EVERY = 3; // a drop every third challenge

/** What can fall out of a drop, by rarity. Items only ever come from here, giveaways or codes. */
export const DROP_ITEMS: Record<Rarity, string[]> = {
  common: ['face_zinc', 'hat_bucket', 'hat_koala'],
  rare: ['cape_singlet', 'hat_emu', 'face_aviators', 'cape_sarong', 'hat_viking', 'face_mo'],
  epic: ['hat_mullet', 'hat_cockatoo', 'cape_chain', 'aura_volcano', 'face_barong', 'aura_rainbow'],
  legendary: ['hat_croc', 'cape_wings_garuda', 'aura_southern_cross'],
};
export const rarityOf = (item: string): Rarity | undefined => RARITIES.find((r) => DROP_ITEMS[r].includes(item));

export interface Drop {
  id: string;
  rarity: Rarity;
  at: number;
  source: 'challenge' | 'quest' | 'gift' | 'host';
  item?: string;     // the cosmetic inside, if any
  points: number;
  xp: number;
  opened: boolean;
}

export function rollRarity(rng: () => number): Rarity {
  let t = rng() * RARITIES.reduce((n, r) => n + RARITY[r].weight, 0);
  for (const r of RARITIES) { t -= RARITY[r].weight; if (t < 0) return r; }
  return 'common';
}

/** Decide the contents at drop time (so opening is just a reveal). Items the lad already owns turn into points. */
export function rollDrop(rng: () => number, owned: string[], source: Drop['source'], now: number, forced?: Rarity): Drop {
  const rarity = forced ?? rollRarity(rng);
  const meta = RARITY[rarity];
  const pool = DROP_ITEMS[rarity].filter((i) => !owned.includes(i));
  // epics and legendaries always carry an item while there's one left to give; commons mostly points
  const wantItem = rarity === 'legendary' || rarity === 'epic' ? true : rarity === 'rare' ? rng() < 0.65 : rng() < 0.3;
  const item = wantItem && pool.length ? pool[Math.floor(rng() * pool.length)] : undefined;
  const base = Math.round(meta.points[0] + rng() * (meta.points[1] - meta.points[0]));
  const points = item ? Math.round(base / 2) : wantItem && !pool.length ? base + meta.dupPoints : base;
  return { id: `dr_${now.toString(36)}_${Math.floor(rng() * 1e6).toString(36)}`, rarity, at: now, source, item, points, xp: meta.xp, opened: false };
}

// ---------- Saturday Quests ----------
export interface QuestDef { id: string; title: string; blurb: string; emoji: string; target: number; points: number; drop: Rarity; stat: (p: PlayerPublic) => number }
export const QUEST_DEFS: QuestDef[] = [
  { id: 'wins3', title: 'Three Wins', blurb: 'Win 3 fights today.', emoji: '⚔️', target: 3, points: 60, drop: 'rare', stat: (p) => p.wins },
  { id: 'fights5', title: 'Brawler', blurb: 'Fight 5 times, win or lose.', emoji: '🥊', target: 5, points: 40, drop: 'rare', stat: (p) => p.wins + p.losses },
  { id: 'missions5', title: 'Grinder', blurb: 'Finish 5 challenges.', emoji: '🎯', target: 5, points: 60, drop: 'rare', stat: (p) => p.missionsCompleted },
  { id: 'photos3', title: 'Paparazzi', blurb: 'Do 3 photo challenges.', emoji: '📸', target: 3, points: 50, drop: 'rare', stat: (p) => p.categoryCounts.photo ?? 0 },
  { id: 'jezza3', title: 'Groom Service', blurb: 'Do 3 Get-the-groom-in challenges.', emoji: '🤵', target: 3, points: 60, drop: 'epic', stat: (p) => p.categoryCounts.jezza ?? 0 },
  { id: 'laughs5', title: 'Comedian', blurb: 'Get 5 😂 on your stuff.', emoji: '😂', target: 5, points: 50, drop: 'epic', stat: (p) => p.laughs },
  { id: 'react10', title: 'Hype Man', blurb: 'React to 10 posts in the feed.', emoji: '🔥', target: 10, points: 30, drop: 'common', stat: (p) => p.reactionsGiven },
  { id: 'raid300', title: 'Boss Hunter', blurb: 'Deal 300 damage in raids.', emoji: '👹', target: 300, points: 50, drop: 'rare', stat: (p) => p.raidDamage },
  { id: 'witness2', title: 'Good Mate', blurb: 'Confirm 2 mates\' challenges.', emoji: '👀', target: 2, points: 30, drop: 'common', stat: (p) => p.witnessed },
  { id: 'cellar2', title: 'Sommelier', blurb: 'Review 2 drinks in the Cellar.', emoji: '🍷', target: 2, points: 30, drop: 'common', stat: (p) => p.cellarCount },
];
export const QUEST_BY_ID: Record<string, QuestDef> = Object.fromEntries(QUEST_DEFS.map((q) => [q.id, q]));
export const QUESTS_PER_DAY = 3;
export interface Quest { defId: string; baseline: number; done: boolean; doneAt?: number }
export const questProgress = (q: Quest, p: PlayerPublic) => Math.max(0, Math.min(QUEST_BY_ID[q.defId].target, QUEST_BY_ID[q.defId].stat(p) - q.baseline));

// ---------- The Mole ----------
export const MOLE_MISSIONS: string[] = [
  'Convince a lad a challenge exists that doesn\'t, and watch them try it.',
  'Get three lads to raise a toast to YOU instead of the groom.',
  'Get someone to call BS on a challenge that was completely legit.',
  'Swap two lads\' drinks without either noticing.',
  'Get a lad to say "I\'m the Mole" out loud. Any way you like.',
  'Start a rumour about who the Mole is. It has to reach the groom.',
  'Get into the background of three other lads\' photos.',
  'Convince a lad the final form unlocks at level 9.',
];
export const MOLE_POINTS = { mission: 40, caught: 30, escaped: 100, correctGuess: 30 };
export interface MoleState { playerId: string; assignedAt: number; missions: { text: string; done: boolean }[]; votes: Record<string, string>; revealed: boolean; caught?: boolean; revealedAt?: number }
