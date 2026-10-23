import type { Cosmetic, PlayerPublic, MissionCategory, Battle, AwardResult, Phase } from './types';

// Cumulative XP needed to reach each level (index = level-1). Quick at the start (the selfie alone is Level 2,
// first evolution after about five challenges), slower later; 10 is the fully evolved creature. 11–15 are the long
// grind for the lads who won't stop: titles only, no extra muscle in battle.
export const LEVEL_XP = [0, 50, 110, 190, 320, 520, 800, 1150, 1600, 2200, 3100, 4200, 5600, 7400, 9600];
export const MAX_LEVEL = LEVEL_XP.length;

// ---------- Evolutions ----------
export const EVOLVE_LEVELS = [4, 8] as const;       // stage 2 at Lv4, stage 3 at Lv8
export const FRIDAY_MAX_LEVEL = 7;                   // one evolution max on Friday
export function stageForLevel(level: number): 1 | 2 | 3 { return level >= EVOLVE_LEVELS[1] ? 3 : level >= EVOLVE_LEVELS[0] ? 2 : 1; }
export function nextEvolveLevel(level: number): number | null { return EVOLVE_LEVELS.find((l) => l > level) ?? null; }
/** XP ceiling for the current phase. Friday (and the lobby) stops just short of the final evolution. */
export function xpCapFor(phase: Phase): number { return phase === 'lobby' || phase === 'friday' ? LEVEL_XP[FRIDAY_MAX_LEVEL] - 1 : Infinity; }

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

// ---------- Battle ladder ----------
export const START_RATING = 1000;
export const RANKS = [
  { min: -Infinity, name: 'Rookie', emoji: '🥚' },
  { min: 985, name: 'Bronze', emoji: '🥉' },
  { min: 1025, name: 'Silver', emoji: '🥈' },
  { min: 1065, name: 'Gold', emoji: '🥇' },
  { min: 1110, name: 'Absolutely Cooked', emoji: '🔥' },
];
export function rankFor(rating: number) { let r = RANKS[0]; for (const x of RANKS) if (rating >= x.min) r = x; return r; }
export function eloUpdate(winner: number, loser: number, k = 32): [number, number] {
  const exp = 1 / (1 + 10 ** ((loser - winner) / 400));
  const d = Math.round(k * (1 - exp));
  return [winner + d, loser - d];
}

// ---------- Cosmetics ----------
export const COSMETICS: Cosmetic[] = [
  { id: 'hat_party', slot: 'hat', name: 'Party Cone', description: 'A tiny gold party hat. Immediately improves morale.' },
  // Starter kit: every creature gets these the moment it's adopted
  { id: 'hat_party_blue', slot: 'hat', name: 'Blue Party Hat', description: 'Starter kit. A blue cracker crown. Goes on at dinner, stays on all night.' },
  { id: 'hat_party_purple', slot: 'hat', name: 'Purple Party Hat', description: 'Starter kit. A purple cracker crown. For creatures with opinions.' },
  { id: 'hat_party_white', slot: 'hat', name: 'White Party Hat', description: 'Starter kit. A white cracker crown. Will not stay white.' },
  { id: 'hat_party_yellow', slot: 'hat', name: 'Yellow Party Hat', description: 'Starter kit. A yellow cracker crown. Visible from the carpark.' },
  { id: 'hat_party_green', slot: 'hat', name: 'Green Party Hat', description: 'Starter kit. A green cracker crown. Blends in with the vines.' },
  { id: 'hat_santa', slot: 'hat', name: 'Santa Hat', description: 'Starter kit. Ho ho ho. In October. Why not.' },
  { id: 'hat_bunny', slot: 'hat', name: 'Bunny Ears', description: 'Starter kit. Hop to it.' },
  { id: 'hat_cork', slot: 'hat', name: 'Cork Crown', description: 'A crown of wine corks. Smells faintly of 2019.' },
  { id: 'hat_crown', slot: 'hat', name: 'Royal Crown', description: 'For creatures of noble bearing and questionable judgement.' },
  { id: 'hat_beret', slot: 'hat', name: 'Paparazzi Beret', description: 'Earned by snapping three cooked photos.' },
  { id: 'hat_jester', slot: 'hat', name: 'Jester Hat', description: 'Earned by making Jezza laugh three times.' },
  { id: 'hat_feathers', slot: 'hat', name: 'Bin Chicken Plume', description: 'Proof you helped take down the Bin Chicken King.' },
  { id: 'face_shades', slot: 'face', name: 'Cooked Shades', description: 'For when the sun, or the night, is too much.' },
  { id: 'face_monocle', slot: 'face', name: 'Monocle', description: 'Earned by raising three toasts. Instantly classier.' },
  { id: 'face_mic', slot: 'face', name: 'Karaoke Mic', description: 'Earned by getting Jezza to sing.' },
  { id: 'cape_velvet', slot: 'cape', name: 'Velvet Cape', description: 'Merlot velvet. Dramatic entrances only.' },
  { id: 'cape_gold', slot: 'cape', name: 'Champagne Cape', description: 'Shimmering gold. Worn by legends and show-offs.' },
  { id: 'cape_groomsman', slot: 'cape', name: 'Groomsman Sash', description: 'Earned by getting Jezza involved three times.' },
  { id: 'cape_slayer', slot: 'cape', name: 'Hydra Slayer Cape', description: 'Proof you helped take down the Hangover Hydra.' },
  { id: 'aura_ember', slot: 'aura', name: 'Ember Aura', description: 'A warm orange glow. Smells like campfire banter.' },
  { id: 'aura_moon', slot: 'aura', name: 'Moonlit Aura', description: 'Cool silver light. Mysterious. Slightly damp.' },
  { id: 'aura_gold', slot: 'aura', name: 'Legend Aura', description: 'Pure champagne gold. The vineyard knows your name.' },
  { id: 'aura_disco', slot: 'aura', name: 'Disco Aura', description: 'Earned by digging up three bits of Jezza lore.' },
  { id: 'hat_chef', slot: 'hat', name: 'Chef\'s Toque', description: 'EPIC: cooked for the lads. The kitchen salutes you.' },
  { id: 'hat_cap', slot: 'hat', name: 'Delivery Cap', description: 'EPIC: did a food or supplies run. Hero of the hungry.' },
  { id: 'cape_apron', slot: 'cape', name: 'BBQ Apron', description: 'EPIC: ran the barbie. Tongs-certified.' },
  { id: 'face_headphones', slot: 'face', name: 'DJ Headphones', description: 'EPIC: set the party up. The vibe owes you one.' },
  { id: 'aura_clean', slot: 'aura', name: 'Squeaky Clean Aura', description: 'EPIC: cleaned up after the lads. Sparkling.' },
  { id: 'aura_epic', slot: 'aura', name: 'Epic Helper Aura', description: 'EPIC: put your hand up when it counted.' },
  { id: 'cape_hivis', slot: 'cape', name: 'Hi-Vis Vest', description: 'EPIC LEGEND: designated driver. Got everyone home safe.' },
  { id: 'hat_esky', slot: 'hat', name: 'Esky Hat', description: 'EPIC: Chief Hydration Officer. Kept the esky cold.' },
  { id: 'face_mo', slot: 'face', name: 'The Mo', description: 'Reward code only. Distinguished. Possibly a disguise.' },
  { id: 'hat_viking', slot: 'hat', name: 'Viking Helmet', description: 'Reward code only. For raiding the snack table.' },
  { id: 'aura_rainbow', slot: 'aura', name: 'Rainbow Aura', description: 'Reward code only. Fabulous, frankly.' },
  // Host drops: halos, wings and more auras, released through giveaways and reward codes
  { id: 'hat_halo_gold', slot: 'hat', name: 'Golden Halo', description: 'Reward code or giveaway only. Behaved all weekend. Allegedly.' },
  { id: 'hat_halo_ice', slot: 'hat', name: 'Ice Halo', description: 'Reward code or giveaway only. Cool under pressure. Cold in the esky.' },
  { id: 'hat_halo_devil', slot: 'hat', name: 'Devil Horns', description: 'Reward code or giveaway only. For the instigator.' },
  { id: 'hat_halo_toxic', slot: 'hat', name: 'Toxic Halo', description: 'Reward code or giveaway only. Something glows. Nobody asks what.' },
  { id: 'cape_wings_angel', slot: 'cape', name: 'Angel Wings', description: 'Reward code or giveaway only. Big white feathers. Zero innocence.' },
  { id: 'cape_wings_bat', slot: 'cape', name: 'Bat Wings', description: 'Reward code or giveaway only. Creature of the night. Mostly the cellar.' },
  { id: 'cape_wings_phoenix', slot: 'cape', name: 'Phoenix Wings', description: 'Reward code or giveaway only. Rose from the ashes of Friday night.' },
  { id: 'cape_wings_fairy', slot: 'cape', name: 'Fairy Wings', description: 'Reward code or giveaway only. Delicate. Unlike the owner.' },
  { id: 'aura_ice', slot: 'aura', name: 'Frost Aura', description: 'Reward code or giveaway only. Snowflakes in the Hunter. Climate is cooked.' },
  { id: 'aura_toxic', slot: 'aura', name: 'Toxic Aura', description: 'Reward code or giveaway only. Green fumes. Probably the kebab.' },
  { id: 'aura_love', slot: 'aura', name: 'Lovestruck Aura', description: 'Reward code or giveaway only. Hearts everywhere. Jezza energy.' },
  { id: 'aura_shadow', slot: 'aura', name: 'Shadow Aura', description: 'Reward code or giveaway only. Dark smoke. Mysterious. Smells of Shiraz.' },
  // Lucky Drop loot: Indo, animal and lad vibes. Rarity decides how often it falls out of a drop.
  { id: 'face_zinc', slot: 'face', name: 'Zinc Stripes', description: 'Lucky Drop. Two stripes of zinc. Sun-safe, slightly feral.', rarity: 'common' },
  { id: 'hat_bucket', slot: 'hat', name: 'Bali Bucket Hat', description: 'Lucky Drop. Bought for 50k rupiah. Priceless.', rarity: 'common' },
  { id: 'hat_koala', slot: 'hat', name: 'Koala Ears', description: 'Lucky Drop. Sleeps 20 hours a day. Relatable.', rarity: 'common' },
  { id: 'cape_singlet', slot: 'cape', name: 'Bintang Singlet', description: 'Lucky Drop. The uniform. Mandatory in Kuta, optional here.', rarity: 'rare' },
  { id: 'hat_emu', slot: 'hat', name: 'Emu Plume', description: 'Lucky Drop. Won a war against the army. Lost to a fence.', rarity: 'rare' },
  { id: 'face_aviators', slot: 'face', name: 'Aviators', description: 'Lucky Drop. Gold rims. Full send.', rarity: 'rare' },
  { id: 'cape_sarong', slot: 'cape', name: 'Batik Sarong', description: 'Lucky Drop. Hand-dyed in Ubud. Worn in the Hunter.', rarity: 'rare' },
  { id: 'hat_mullet', slot: 'hat', name: 'The Mullet', description: 'Lucky Drop. Business up front. Bucks out back.', rarity: 'epic' },
  { id: 'hat_cockatoo', slot: 'hat', name: 'Cockatoo Crest', description: 'Lucky Drop. Loud, yellow, screams at 5am. Like the lads.', rarity: 'epic' },
  { id: 'cape_chain', slot: 'cape', name: 'Gold Chain', description: 'Lucky Drop. Thick. Heavy. Definitely real.', rarity: 'epic' },
  { id: 'aura_volcano', slot: 'aura', name: 'Volcano Aura', description: 'Lucky Drop. Mount Agung energy. Lava and ash.', rarity: 'epic' },
  { id: 'face_barong', slot: 'face', name: 'Barong Mask', description: 'Lucky Drop. The Balinese lion king. Protects against evil and hangovers.', rarity: 'epic' },
  { id: 'hat_croc', slot: 'hat', name: 'Croc Jaws', description: 'Lucky Drop. Saltwater. Apex. Does not care about your weekend.', rarity: 'legendary' },
  { id: 'cape_wings_garuda', slot: 'cape', name: 'Garuda Wings', description: 'Lucky Drop. Gold and crimson, straight off the Indonesian crest.', rarity: 'legendary' },
  { id: 'aura_southern_cross', slot: 'aura', name: 'Southern Cross Aura', description: 'Lucky Drop. Five stars overhead, wherever you are.', rarity: 'legendary' },
  { id: 'pose_heroic', slot: 'pose', name: 'Heroic Pose', description: 'Chest out, chin up, wind machine implied.' },
  { id: 'pose_lounge', slot: 'pose', name: 'Lounge Pose', description: 'Reclined. Unbothered. Possibly asleep.' },
];
export const COSMETIC_BY_ID: Record<string, Cosmetic> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

/** Everyone's from the start: the gold cone plus the starter kit. Granted on adoption and back-filled for saved players. */
export const STARTER_COSMETICS = ['hat_party', 'hat_party_blue', 'hat_party_purple', 'hat_party_white', 'hat_party_yellow', 'hat_party_green', 'hat_santa', 'hat_bunny'];

/** Cosmetics unlocked purely by creature level. */
export const LEVEL_UNLOCKS: Record<number, { cosmetics: string[]; colorways: number; title?: string }> = {
  1: { cosmetics: STARTER_COSMETICS, colorways: 1 },
  2: { cosmetics: [], colorways: 2 },
  3: { cosmetics: ['hat_cork'], colorways: 2 },
  4: { cosmetics: ['aura_ember'], colorways: 2, title: 'Evolved' },
  5: { cosmetics: ['cape_velvet'], colorways: 2, title: 'Regular' },
  6: { cosmetics: [], colorways: 3 },
  7: { cosmetics: ['pose_heroic'], colorways: 3 },
  8: { cosmetics: ['hat_crown', 'aura_moon'], colorways: 3, title: 'Final Form' },
  9: { cosmetics: ['cape_gold'], colorways: 3 },
  10: { cosmetics: ['aura_gold'], colorways: 3, title: 'Hunter Valley Legend' },
  11: { cosmetics: [], colorways: 3, title: 'Vineyard Myth' },
  12: { cosmetics: [], colorways: 3, title: 'Hall of Famer' },
  13: { cosmetics: [], colorways: 3, title: 'Absolute Unit' },
  14: { cosmetics: [], colorways: 3, title: 'Hunter Valley Deity' },
  15: { cosmetics: [], colorways: 3, title: 'JEZZA TIER' },
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
  id: string; name: string; blurb: string; xp: number; points: number; cosmetic?: string;
  /** no longer earnable (its challenges were retired); still shown to anyone who has it */
  retired?: boolean;
  /** the engine passes the full player, so completedMissionIds is there server-side */
  check: (p: PlayerPublic & { completedMissionIds?: string[] }, ctx: { battles: Battle[] }) => boolean;
}
const cat = (p: PlayerPublic, c: MissionCategory) => p.categoryCounts[c] ?? 0;
const catsDone = (p: PlayerPublic) => Object.values(p.categoryCounts).filter((n) => (n ?? 0) > 0).length;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_steps', name: 'First Steps', blurb: 'Adopted a creature. The vineyard has noticed you.', xp: 10, points: 0, check: (p) => !!p.creature },
  { id: 'first_blood', name: 'The Legend Begins', blurb: 'First challenge done.', xp: 10, points: 0, check: (p) => p.missionsCompleted >= 1 },
  { id: 'five_missions', name: 'Warming Up', blurb: 'Five challenges down.', xp: 25, points: 10, check: (p) => p.missionsCompleted >= 5 },
  { id: 'ten_missions', name: 'Mission Assassin', blurb: 'Ten challenges. Unstoppable.', xp: 50, points: 20, cosmetic: 'face_shades', check: (p) => p.missionsCompleted >= 10 },
  { id: 'twenty_missions', name: 'Absolutely Cooked', blurb: 'Twenty challenges. Seek help. Or more challenges.', xp: 80, points: 30, check: (p) => p.missionsCompleted >= 20 },
  { id: 'all_rounder', name: 'All-Rounder', blurb: 'Done challenges in five different categories.', xp: 40, points: 15, cosmetic: 'pose_lounge', check: (p) => catsDone(p) >= 5 },
  { id: 'comedian', name: 'Comedian', blurb: 'Made Jezza laugh three times.', xp: 40, points: 10, cosmetic: 'hat_jester', check: (p) => cat(p, 'laugh') >= 3 },
  // singing and dancing were cut: anyone who earned these keeps them, nobody new can
  { id: 'dancer', name: 'Dance Machine', blurb: 'Danced three times. Shameless.', xp: 40, points: 10, retired: true, check: () => false },
  { id: 'crooner', name: 'Crooner', blurb: 'Sang three times. Nobody asked.', xp: 40, points: 10, retired: true, check: () => false },
  { id: 'karaoke', name: 'Karaoke Night', blurb: 'Got Jezza to sing.', xp: 40, points: 10, cosmetic: 'face_mic', check: (p) => !!p.completedMissionIds?.includes('n03') },
  { id: 'paparazzi', name: 'Paparazzi', blurb: 'Three cooked photos.', xp: 40, points: 10, cosmetic: 'hat_beret', check: (p) => cat(p, 'photo') >= 3 },
  { id: 'groom_whisperer', name: 'Groom Whisperer', blurb: 'Got Jezza involved three times.', xp: 40, points: 10, cosmetic: 'cape_groomsman', check: (p) => cat(p, 'jezza') >= 3 },
  { id: 'toastmaster', name: 'Toastmaster', blurb: 'Three cheers challenges.', xp: 40, points: 10, cosmetic: 'face_monocle', check: (p) => cat(p, 'cheers') >= 3 },
  { id: 'secret_agent', name: 'Secret Agent', blurb: 'Pulled off a sneaky one. Nobody suspected a thing.', xp: 30, points: 10, check: (p) => cat(p, 'sneaky') >= 1 },
  { id: 'lore_keeper', name: 'Lore Keeper', blurb: 'Dug up three bits of Jezza lore.', xp: 40, points: 10, cosmetic: 'aura_disco', check: (p) => cat(p, 'lore') >= 3 },
  { id: 'team_player', name: 'Team Player', blurb: 'Three group challenges.', xp: 40, points: 10, check: (p) => cat(p, 'group') >= 3 },
  { id: 'reliable_witness', name: 'Reliable Witness', blurb: 'Confirmed three challenges for mates.', xp: 30, points: 5, check: (p) => p.witnessed >= 3 },
  { id: 'first_battle', name: 'Into the Arena', blurb: 'First creature battle.', xp: 15, points: 0, check: (p) => p.wins + p.losses >= 1 },
  { id: 'first_win', name: 'Taste of Victory', blurb: 'Won a battle.', xp: 25, points: 5, check: (p) => p.wins >= 1 },
  { id: 'on_fire', name: 'On Fire', blurb: 'Three battle wins in a row.', xp: 50, points: 15, check: (p) => p.bestStreak >= 3 },
  { id: 'bounty_hunter', name: 'Bounty Hunter', blurb: 'Took down the leader in battle.', xp: 40, points: 0, check: (p) => p.bounties >= 1 },
  { id: 'glorious_loser', name: 'Glorious Loser', blurb: 'Lost three battles and kept smiling.', xp: 30, points: 10, check: (p) => p.losses >= 3 },
  { id: 'roaster', name: 'Roast Chef', blurb: 'Your Jezza Wall posts got five laughs.', xp: 30, points: 0, check: (p) => p.wallVotes >= 5 },
  { id: 'sommelier', name: 'Sommelier Fraud', blurb: 'Logged a drink in the Cellar.', xp: 15, points: 0, check: (p) => p.cellarCount >= 1 },
  { id: 'raider', name: 'Raider', blurb: 'Hit a boss in a raid.', xp: 20, points: 0, check: (p) => p.raidsJoined >= 1 },
  { id: 'evolved', name: 'It\'s Evolving!', blurb: 'Your creature evolved.', xp: 0, points: 10, check: (p) => p.level >= EVOLVE_LEVELS[0] },
  { id: 'fashionista', name: 'Dressed to Kill', blurb: 'Hat, cape and aura on at once.', xp: 30, points: 5, check: (p) => !!(p.equipped.hat && p.equipped.cape && p.equipped.aura) },
  { id: 'final_form', name: 'Final Form', blurb: 'Your creature hit its final evolution.', xp: 0, points: 25, check: (p) => p.level >= EVOLVE_LEVELS[1] },
];
export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// ---------- Weekend awards (all from real play data, plus one host pick) ----------
export interface AwardDef { id: string; name: string; blurb: string; hostPick?: boolean }
export const AWARDS: AwardDef[] = [
  { id: 'legend', name: 'The Jezza Legend', blurb: 'Most weekend points. The undisputed champion.' },
  { id: 'menace', name: 'The Weekend Menace', blurb: 'Fewest points. Somebody had to be.' },
  { id: 'funniest', name: 'Funniest Bloke', blurb: 'Most 😂 from the lads.' },
  { id: 'lore', name: 'Lore Master', blurb: 'Dug up the most Jezza lore.' },
  { id: 'photo', name: 'Most Cooked Photo', blurb: 'Most 🔥 from the lads.' },
  { id: 'jezzafav', name: 'Jezza\'s Favourite', blurb: 'Most ❤️ from the groom himself.' },
  { id: 'hypeman', name: 'Best Hype Man', blurb: 'Backed the boys the most: confirmations and reactions.' },
  { id: 'roast', name: 'Roast Master', blurb: 'Most laughs on the Jezza Wall.' },
  { id: 'choke', name: 'Biggest Choke', blurb: 'Most battles lost to someone he should\'ve beaten.' },
  { id: 'champion', name: 'Creature of the Weekend', blurb: 'Best battle rating.' },
  { id: 'slayer', name: 'Boss Slayer', blurb: 'Most raid damage.' },
  { id: 'palate', name: 'Best Palate', blurb: 'Most 🔥 on Cellar reviews.' },
  { id: 'group', name: 'Best Group Effort', blurb: 'Most group challenges.' },
  { id: 'helpful', name: 'Captain Helpful', blurb: 'Put their hand up for the most EPIC jobs.' },
  { id: 'unhinged', name: 'Most Unhinged', blurb: 'The host\'s call. No appeals.', hostPick: true },
];

export function computeAwards(players: PlayerPublic[], _battles: Battle[], overrides: Record<string, string | null>): AwardResult[] {
  const alive = players.filter((p) => !p.removed && p.creature);
  const pick = (score: (p: PlayerPublic) => number, fmt: (p: PlayerPublic, s: number) => string) => {
    let best: PlayerPublic | null = null; let bestS = -Infinity;
    for (const p of alive) { const s = score(p); if (s > bestS && s > 0) { best = p; bestS = s; } }
    return best ? { playerId: best.id, reason: fmt(best, bestS) } : { playerId: null, reason: 'Nobody yet. Get amongst it.' };
  };
  const ranked = sortLeaderboard(alive);
  return AWARDS.map((a) => {
    let r: { playerId: string | null; reason: string };
    switch (a.id) {
      case 'legend': r = pick((p) => p.points, (_p, s) => `${s} point${s === 1 ? '' : 's'}`); break;
      case 'menace': { const last = ranked.length > 1 ? ranked[ranked.length - 1] : null; r = last ? { playerId: last.id, reason: `${last.points} points. Legendary effort. Somewhere.` } : { playerId: null, reason: 'Needs at least two legends.' }; break; }
      case 'funniest': r = pick((p) => p.laughs, (_p, s) => `${s} 😂`); break;
      case 'lore': r = pick((p) => cat(p, 'lore'), (_p, s) => `${s} bit${s === 1 ? '' : 's'} of Jezza lore`); break;
      case 'photo': r = pick((p) => p.fires, (_p, s) => `${s} 🔥`); break;
      case 'jezzafav': r = pick((p) => p.groomLoves, (_p, s) => `${s} ❤️ from Jezza`); break;
      case 'hypeman': r = pick((p) => p.witnessed * 2 + (p.reactionsGiven ?? 0), (p) => `${p.witnessed} confirmation${p.witnessed === 1 ? '' : 's'}, ${p.reactionsGiven ?? 0} reaction${(p.reactionsGiven ?? 0) === 1 ? '' : 's'}`); break;
      case 'roast': r = pick((p) => p.wallVotes, (_p, s) => `${s} laugh${s === 1 ? '' : 's'} on the Wall`); break;
      case 'choke': r = pick((p) => p.upsetLosses ?? 0, (_p, s) => `${s} upset loss${s === 1 ? '' : 'es'}`); break;
      case 'champion': r = pick((p) => (p.wins + p.losses ? p.rating : 0), (p) => `${p.wins}W ${p.losses}L · ${rankFor(p.rating).name}`); break;
      case 'slayer': r = pick((p) => p.raidDamage, (_p, s) => `${s} raid damage`); break;
      case 'palate': r = pick((p) => p.cellarFires, (_p, s) => `${s} 🔥 on drink reviews`); break;
      case 'group': r = pick((p) => cat(p, 'group'), (_p, s) => `${s} group challenge${s === 1 ? '' : 's'}`); break;
      case 'helpful': r = pick((p) => p.epicsDone ?? 0, (_p, s) => `${s} EPIC job${s === 1 ? '' : 's'}`); break;
      default: r = { playerId: null, reason: 'Waiting on the host.' };
    }
    if (a.id in overrides) { const pid = overrides[a.id]; r = { playerId: pid, reason: pid ? 'The host has spoken.' : 'Withheld by the host.' }; }
    return { id: a.id, name: a.name, blurb: a.blurb, playerId: r.playerId, reason: r.reason, hostPick: a.hostPick || a.id in overrides };
  });
}

/** Funny titles from head-to-head records. */
export function rivalries(p: PlayerPublic): { nemesis?: { id: string; w: number; l: number }; bunny?: { id: string; w: number; l: number } } {
  let nemesis: { id: string; w: number; l: number } | undefined; let bunny: typeof nemesis;
  for (const [id, r] of Object.entries(p.h2h ?? {})) {
    if (r.w + r.l < 2) continue;
    if (r.l > r.w && (!nemesis || r.l - r.w > nemesis.l - nemesis.w)) nemesis = { id, ...r };
    if (r.w > r.l && (!bunny || r.w - r.l > bunny.w - bunny.l)) bunny = { id, ...r };
  }
  return { nemesis, bunny };
}

export function sortLeaderboard(players: PlayerPublic[]): PlayerPublic[] {
  return [...players].filter((p) => !p.removed).sort((a, b) => b.points - a.points || b.xp - a.xp || b.wins - a.wins || a.joinedAt - b.joinedAt);
}
