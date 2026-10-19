// EPIC tier: real jobs that help the weekend run (cooking, food runs, clean-up). The host posts one, the first
// lads to tap "I'm on it" fill the crew, and everyone on the crew gets points, XP and a themed item when it's done.
export type EpicTier = 'small' | 'medium' | 'big' | 'legend';
// Bigger jobs pay more. Everyone on the crew gets the full amount.
export const EPIC_TIERS: Record<EpicTier, { label: string; points: number; xp: number }> = {
  small:  { label: 'Small', points: 15, xp: 35 },
  medium: { label: 'Medium', points: 25, xp: 60 },
  big:    { label: 'Big', points: 40, xp: 90 },
  legend: { label: 'Legend', points: 60, xp: 120 },
};
export const isEpicTier = (t: unknown): t is EpicTier => typeof t === 'string' && t in EPIC_TIERS;

export interface EpicPreset {
  id: string;
  title: string;
  instruction: string;
  emoji: string;
  min: number;   // crew needed before it can be marked done
  max: number;   // spots available
  item: string;  // cosmetic every crew member gets
  tier: EpicTier;
  group: 'Dinner' | 'Brekkie' | 'Runs' | 'Crew';
}

export const EPIC_MAX_CREW = 6;

export const EPIC_PRESETS: EpicPreset[] = [
  // Dinner
  { id: 'mac', group: 'Dinner', title: 'Mac and Cheese Crew', instruction: 'Make the mac and cheese for the lads. Extra cheese is not optional.', emoji: '🧀', min: 2, max: 2, item: 'hat_chef', tier: 'medium' },
  { id: 'potatoes', group: 'Dinner', title: 'Potato Crew', instruction: 'Make the potatoes. Roast, mash or chips: your call.', emoji: '🥔', min: 1, max: 2, item: 'hat_chef', tier: 'medium' },
  { id: 'chimichurri', group: 'Dinner', title: 'Chimichurri Chef', instruction: 'Chop, mix, season. Green sauce for the steak.', emoji: '🌿', min: 1, max: 1, item: 'hat_chef', tier: 'small' },
  { id: 'salad', group: 'Dinner', title: 'Salad Squad', instruction: 'Salad kits into bowls, dressing on, done.', emoji: '🥗', min: 1, max: 2, item: 'hat_chef', tier: 'small' },
  { id: 'garlic_bread', group: 'Dinner', title: 'Garlic Bread Guy', instruction: 'Garlic bread in the oven. Do not burn it.', emoji: '🥖', min: 1, max: 1, item: 'hat_chef', tier: 'small' },
  { id: 'bbq', group: 'Dinner', title: 'BBQ Masters', instruction: 'Run the barbie: snags, onions, bread, sauce. Nobody leaves hungry.', emoji: '🔥', min: 2, max: 3, item: 'cape_apron', tier: 'big' },
  // Brekkie
  { id: 'bacon', group: 'Brekkie', title: 'Bacon Boss', instruction: 'Cook the bacon for brekkie. Crispy, not cremated.', emoji: '🥓', min: 1, max: 1, item: 'cape_apron', tier: 'small' },
  { id: 'sausages', group: 'Brekkie', title: 'Sausage Sergeant', instruction: 'Cook the brekkie sausages. Turn them more than once.', emoji: '🌭', min: 1, max: 1, item: 'cape_apron', tier: 'small' },
  { id: 'eggs', group: 'Brekkie', title: 'Egg Man', instruction: 'Eggs for everyone. Take orders like a pro.', emoji: '🍳', min: 1, max: 1, item: 'hat_chef', tier: 'small' },
  { id: 'toast', group: 'Brekkie', title: 'Toast Master', instruction: 'Keep the toast coming. Butter included.', emoji: '🍞', min: 1, max: 1, item: 'hat_chef', tier: 'small' },
  // Runs
  { id: 'dd_sat', group: 'Runs', title: 'Designated Driver (Saturday)', instruction: 'Off the grog all day, drives the car and gets the lads home safe. Absolute legend.', emoji: '🚗', min: 1, max: 1, item: 'cape_hivis', tier: 'legend' },
  { id: 'food_run', group: 'Runs', title: 'KFC and Pizza Run', instruction: 'Pick up the KFC and pizza. Whoever drives stays on water.', emoji: '🍕', min: 2, max: 3, item: 'hat_cap', tier: 'medium' },
  { id: 'ice', group: 'Runs', title: 'Ice and Snacks Run', instruction: 'Grab ice, water and snacks from the shops.', emoji: '🧊', min: 1, max: 2, item: 'hat_cap', tier: 'medium' },
  // Crew
  { id: 'cho_drinks', group: 'Crew', title: 'Chief Hydration Officer (Drinks)', instruction: 'Keep the esky stocked and cold: beers, bevvies and soft drinks. Nobody gets pushed.', emoji: '🍻', min: 1, max: 1, item: 'hat_esky', tier: 'medium' },
  { id: 'cho_water', group: 'Crew', title: 'Chief Hydration Officer (Water)', instruction: 'Get a glass of water into every lad\'s hand, every so often. Legends look after legends.', emoji: '💧', min: 1, max: 1, item: 'aura_epic', tier: 'medium' },
  { id: 'setup', group: 'Crew', title: 'Party Setup', instruction: 'Speakers, lights, chairs and games set up and ready to go.', emoji: '🔊', min: 2, max: 3, item: 'face_headphones', tier: 'medium' },
  { id: 'cleanup', group: 'Crew', title: 'Clean-Up Crew', instruction: 'Thirty-minute tidy: bottles, cans, rubbish and bins out.', emoji: '🧹', min: 2, max: 4, item: 'aura_clean', tier: 'big' },
  { id: 'dishes', group: 'Crew', title: 'Dish Pigs', instruction: 'Wash, dry and put away everything in the sink.', emoji: '🍽️', min: 2, max: 2, item: 'aura_clean', tier: 'medium' },
];
export const EPIC_PRESET_BY_ID: Record<string, EpicPreset> = Object.fromEntries(EPIC_PRESETS.map((p) => [p.id, p]));
export const EPIC_CUSTOM_ITEM = 'aura_epic';
