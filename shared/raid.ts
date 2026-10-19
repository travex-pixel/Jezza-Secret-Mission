import type { BossId } from './types';

export const RAID_DURATION_MS = 15 * 60_000;
export const RAID_HIT_COOLDOWN_MS = 20_000;
export const RAID_HP_PER_PLAYER = 300;
export const RAID_THRESHOLD = { friday: 18, saturday: 25 } as const; // party challenges completed in the phase before the boss turns up
export const RAID_MISSION_DMG_MULT = 4;                              // finishing a challenge mid-raid hits the boss for points × 4
export const RAID_REWARD = { won: { points: 10, xp: 40 }, escaped: { points: 5, xp: 20 } };
export const RAID_MVP_POINTS = [15, 10, 5];

export const BOSSES: Record<BossId, { name: string; taunt: string; phase: 'friday' | 'saturday'; cosmetic: string; defeat: string; escape: string }> = {
  ibis: {
    name: 'The Bin Chicken King', phase: 'friday', cosmetic: 'hat_feathers',
    taunt: 'He\'s stolen everyone\'s chips and he\'s not giving them back. Everyone in.',
    defeat: 'The Bin Chicken King has been sent back to the tip.',
    escape: 'The Bin Chicken King flapped off with a hot chip. Everyone who swung still gets the plume.',
  },
  hydra: {
    name: 'The Hangover Hydra', phase: 'saturday', cosmetic: 'cape_slayer',
    taunt: 'Three heads, zero water, one massive headache. Everyone in.',
    defeat: 'The Hangover Hydra has been rehydrated into oblivion.',
    escape: 'The Hangover Hydra crawled back to bed. Everyone who swung still gets the cape.',
  },
};
