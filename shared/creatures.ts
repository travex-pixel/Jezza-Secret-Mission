import type { CreatureId, BattleAction } from './types';

export interface Colorway {
  id: string;
  name: string;
  body: string;     // main body colour
  belly: string;    // secondary / belly
  accent: string;   // horns, wings, markings
  eye: string;
  glow: string;     // aura / rim light
}

export interface CreatureSpecial {
  name: string;
  blurb: string;      // one line for the battle button
  tradeoff: string;   // the catch
}

export interface CreatureDef {
  id: CreatureId;
  name: string;
  species: string;       // e.g. "Vineyard Dragon"
  tagline: string;       // 3-6 word hook
  personality: string;   // one funny sentence
  stats: { hp: number; atk: number; def: number; spd: number };
  special: CreatureSpecial;
  colorways: Colorway[];
  defaultName: string;
  cry: string;           // text sound effect, used in copy
}

export const CREATURES: Record<CreatureId, CreatureDef> = {
  dragon: {
    id: 'dragon',
    name: 'Vineyard Dragon',
    species: 'Vineyard Dragon',
    tagline: 'Tiny. Proud. Flammable.',
    personality: 'Hoards corks, breathes fire at tapas, and thinks it is enormous.',
    stats: { hp: 94, atk: 14, def: 6, spd: 9 },
    special: { name: 'Ember Breath', blurb: 'Huge fire damage', tradeoff: 'Singes you a little too' },
    colorways: [
      { id: 'merlot', name: 'Merlot Ember', body: '#8E2B45', belly: '#E5AD48', accent: '#F07842', eye: '#F6EBDD', glow: '#F07842' },
      { id: 'champagne', name: 'Champagne Flame', body: '#D9A64A', belly: '#F6EBDD', accent: '#F07842', eye: '#571827', glow: '#E5AD48' },
      { id: 'midnight', name: 'Midnight Smoke', body: '#3A3340', belly: '#B98286', accent: '#E5AD48', eye: '#F07842', glow: '#B98286' },
    ],
    defaultName: 'Smoulder',
    cry: 'FWOOSH',
  },
  wombat: {
    id: 'wombat',
    name: 'Wombat Warrior',
    species: 'Wombat Warrior',
    tagline: 'Stocky. Fearless. Tactical.',
    personality: 'Built like a brick, plans like a general, naps like a legend.',
    stats: { hp: 110, atk: 11, def: 10, spd: 5 },
    special: { name: 'Bunker Down', blurb: 'Heal + full guard', tradeoff: 'Deals no damage this round' },
    colorways: [
      { id: 'bark', name: 'Barrel Bark', body: '#7A5A44', belly: '#D8B992', accent: '#E5AD48', eye: '#242127', glow: '#E5AD48' },
      { id: 'ash', name: 'Cellar Ash', body: '#5A5660', belly: '#B9B2B8', accent: '#B98286', eye: '#242127', glow: '#B98286' },
      { id: 'rose', name: 'Rosé Dawn', body: '#B98286', belly: '#F6EBDD', accent: '#76243A', eye: '#242127', glow: '#F6EBDD' },
    ],
    defaultName: 'Bruce',
    cry: 'HRMPH',
  },
  possum: {
    id: 'possum',
    name: 'Possum Trickster',
    species: 'Possum Trickster',
    tagline: 'Sneaky. Chaotic. Unrepentant.',
    personality: 'Has stolen at least one of your chips already. Will deny everything.',
    stats: { hp: 95, atk: 13, def: 6, spd: 12 },
    special: { name: 'Mischief', blurb: 'Coin flip: double or nothing', tradeoff: 'Either 2.2x damage or a whiff' },
    colorways: [
      { id: 'dusk', name: 'Dusk Grey', body: '#6E6670', belly: '#F6EBDD', accent: '#F07842', eye: '#242127', glow: '#E5AD48' },
      { id: 'brushtail', name: 'Brushtail Bronze', body: '#8A6240', belly: '#E8D4B8', accent: '#E5AD48', eye: '#242127', glow: '#F07842' },
      { id: 'ghost', name: 'Ghost Vine', body: '#C8BFCF', belly: '#FFFFFF', accent: '#76243A', eye: '#571827', glow: '#F6EBDD' },
    ],
    defaultName: 'Nugget',
    cry: 'HISSSS',
  },
  owl: {
    id: 'owl',
    name: 'Moonlit Owl',
    species: 'Moonlit Owl',
    tagline: 'Mysterious. Observant. Smug.',
    personality: 'Knows what you did. Has not decided whether to tell anyone.',
    stats: { hp: 95, atk: 12, def: 8, spd: 11 },
    special: { name: 'Moon Gaze', blurb: 'Pierces any guard', tradeoff: 'Needs 2 rounds to recharge' },
    colorways: [
      { id: 'moon', name: 'Moon Silver', body: '#5B5566', belly: '#F6EBDD', accent: '#E5AD48', eye: '#E5AD48', glow: '#F6EBDD' },
      { id: 'plum', name: 'Plum Night', body: '#571827', belly: '#B98286', accent: '#E5AD48', eye: '#F6EBDD', glow: '#B98286' },
      { id: 'barn', name: 'Barn Gold', body: '#C98A3E', belly: '#F6EBDD', accent: '#76243A', eye: '#242127', glow: '#E5AD48' },
    ],
    defaultName: 'Professor',
    cry: 'HOOT',
  },
  goblin: {
    id: 'goblin',
    name: 'Cellar Goblin',
    species: 'Cellar Goblin',
    tagline: 'Gremlin. Barrel-born. Suspicious.',
    personality: 'Lives in barrel 7. Charges rent. Motives unclear, cork collection enormous.',
    stats: { hp: 100, atk: 13, def: 7, spd: 8 },
    special: { name: 'Cork Pop', blurb: 'Big ricochet shot', tradeoff: 'Bounces back if they guard' },
    colorways: [
      { id: 'moss', name: 'Cellar Moss', body: '#5E7A4A', belly: '#D8C49A', accent: '#76243A', eye: '#E5AD48', glow: '#E5AD48' },
      { id: 'cork', name: 'Cork Brown', body: '#9A6B3C', belly: '#E8D4B8', accent: '#571827', eye: '#F6EBDD', glow: '#F07842' },
      { id: 'merlot', name: 'Merlot Stain', body: '#76243A', belly: '#B98286', accent: '#E5AD48', eye: '#F6EBDD', glow: '#B98286' },
    ],
    defaultName: 'Grimble',
    cry: 'HEHEHE',
  },
  sprite: {
    id: 'sprite',
    name: 'Grapevine Sprite',
    species: 'Grapevine Sprite',
    tagline: 'Magical. Elegant. Menace.',
    personality: 'Glows softly, speaks in riddles, absolutely started that argument.',
    stats: { hp: 92, atk: 12, def: 5, spd: 13 },
    special: { name: 'Vine Lash', blurb: 'Two quick strikes', tradeoff: 'Each hit is weaker' },
    colorways: [
      { id: 'shiraz', name: 'Shiraz Bloom', body: '#76243A', belly: '#F6EBDD', accent: '#7FB069', eye: '#E5AD48', glow: '#E5AD48' },
      { id: 'verdelho', name: 'Verdelho Glow', body: '#6FA86A', belly: '#F6EBDD', accent: '#E5AD48', eye: '#571827', glow: '#D6F2A8' },
      { id: 'blush', name: 'Blush Petal', body: '#D98A96', belly: '#FFF3F0', accent: '#76243A', eye: '#571827', glow: '#F6EBDD' },
    ],
    defaultName: 'Pinot',
    cry: 'TWINKLE',
  },
  barrel: {
    id: 'barrel',
    name: 'Barrel Beast',
    species: 'Barrel Beast',
    tagline: 'Chunky. Durable. Ridiculous.',
    personality: 'Is a barrel. Has legs. Nobody has explained this and nobody will.',
    stats: { hp: 114, atk: 10, def: 11, spd: 3 },
    special: { name: 'Barrel Roll', blurb: 'Crushing roll attack', tradeoff: 'You bump your head' },
    colorways: [
      { id: 'oak', name: 'French Oak', body: '#9C6B3F', belly: '#C99A62', accent: '#57514F', eye: '#E5AD48', glow: '#E5AD48' },
      { id: 'charred', name: 'Charred Oak', body: '#4A3A33', belly: '#7A5A44', accent: '#E5AD48', eye: '#F07842', glow: '#F07842' },
      { id: 'rose', name: 'Rosé Cask', body: '#B98286', belly: '#D8A8AA', accent: '#571827', eye: '#F6EBDD', glow: '#F6EBDD' },
    ],
    defaultName: 'Keg',
    cry: 'THUNK',
  },
  fox: {
    id: 'fox',
    name: 'Hunter Fox',
    species: 'Hunter Fox',
    tagline: 'Quick. Stylish. Cunning.',
    personality: 'Dressed better than you, drinks faster than you, somehow never pays.',
    stats: { hp: 92, atk: 13, def: 6, spd: 12 },
    special: { name: 'Outfox', blurb: 'Counter their attack', tradeoff: 'Weak if they guard' },
    colorways: [
      { id: 'ember', name: 'Ember Fur', body: '#D9622E', belly: '#F6EBDD', accent: '#242127', eye: '#E5AD48', glow: '#F07842' },
      { id: 'silver', name: 'Silver Fox', body: '#8A8590', belly: '#F6EBDD', accent: '#242127', eye: '#E5AD48', glow: '#F6EBDD' },
      { id: 'merlot', name: 'Merlot Fur', body: '#76243A', belly: '#E5AD48', accent: '#242127', eye: '#F6EBDD', glow: '#E5AD48' },
    ],
    defaultName: 'Dapper',
    cry: 'YIP',
  },
};

export const CREATURE_IDS: CreatureId[] = ['dragon', 'wombat', 'possum', 'owl', 'goblin', 'sprite', 'barrel', 'fox'];

export const ACTION_LABELS: Record<BattleAction, string> = { attack: 'ATTACK', defend: 'DEFEND', special: 'SPECIAL' };

/** Deterministic trio of starters for a given seed string; `offset` cycles to show the rest of the roster. */
export function starterTrio(seed: string, offset = 0): CreatureId[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const order = [...CREATURE_IDS];
  // Fisher-Yates with the hash as RNG
  for (let i = order.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const start = (offset * 3) % order.length;
  const out: CreatureId[] = [];
  for (let i = 0; i < 3; i++) out.push(order[(start + i) % order.length]);
  return out;
}
