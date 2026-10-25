// Themes: what kind of party this is. A theme decides who the guest of honour is called, which mascot is reserved
// for them, which challenge deck is dealt, which features are on, and the words the app uses. The engine and the
// screens read everything from here; nothing else knows whose party it is. "bucks" is the original (Jezza's).
import type { CreatureId, Phase } from './types';

export type ThemeId = 'bucks' | 'birthday';
export const PRODUCT_NAME = 'All-Stars';

export interface ThemeDef {
  id: ThemeId;
  label: string;                 // "Bucks weekend", "Birthday"
  defaultHonour: string;         // name used when none is given
  defaultTitle: (name: string) => string;
  role: { label: string; short: string; emoji: string; he: string; him: string; his: string; cap: string }; // "the groom" / "the birthday girl"
  mascot: CreatureId;            // reserved for the honouree
  deck: ThemeId;                 // which mission set is dealt
  features: { cellar: boolean; raids: boolean; mole: boolean; battles: boolean; drinks: boolean; autoSaturday: boolean; wall: 'roastToast' | 'book'; quests: boolean };
  copy: {
    tagline: string; enter: string; partyWord: string; crowd: string;      // "lads" / "everyone"
    wallTitle: string; wallPrompt: string; wallPost: string; wallFeed: (who: string) => string;
    phases: Record<Phase, string>; phaseBlurbs: Record<Phase, string>;
    honourCategory: string; laughCategory: string; loreCategory: string;
    forfeit: string;             // what the loser of a Rowdy Round does
    selfieBlurb: string;
    olympics: string;            // "Bucks Olympics" / "Athletics Carnival"
    olySuggested: { name: string; unit: 'seconds' | 'reps' | 'metres' | 'place' }[]; // the scorer's quick picks
  };
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  bucks: {
    id: 'bucks', label: 'Bucks weekend', defaultHonour: 'Jezza', defaultTitle: (n) => `${n}'s Bucks Weekend`,
    role: { label: 'the groom', short: 'groom', emoji: '🤵', he: 'he', him: 'him', his: 'his', cap: 'The groom' },
    mascot: 'stag', deck: 'bucks',
    features: { cellar: true, raids: true, mole: true, battles: true, drinks: true, autoSaturday: true, wall: 'roastToast', quests: true },
    copy: {
      tagline: 'One weekend. Fifteen legends. Questionable decisions.', enter: 'Enter the Vineyard', partyWord: 'weekend', crowd: 'the lads',
      wallTitle: '{name} Wall', wallPrompt: 'Roast or toast {name}. One line, bring receipts.', wallPost: 'Post it', wallFeed: (who) => `${who} on the Wall`,
      phases: { lobby: 'Lobby', friday: 'Friday night', saturday: 'Saturday', finale: 'Finale', ended: 'Ended' },
      phaseBlurbs: { lobby: 'Paused. Nobody can do challenges.', friday: 'Challenges are on. Starts on its own when the party is made.', saturday: 'The championship: final forms, quests, the Mole. Starts on its own at 5am.', finale: 'Awards. Lock the scores and run the ceremony.', ended: 'All over. Keepsake time.' },
      honourCategory: 'Get {name} In', laughCategory: 'Make {name} Laugh', loreCategory: '{name} Lore',
      forfeit: 'takes the forfeit', selfieBlurb: 'Selfie, right now, wherever you are: couch, car, servo, vineyard. Show the lads your pre-bucks face.',
      olympics: 'Bucks Olympics', olySuggested: [{ name: 'Plank', unit: 'seconds' }, { name: 'Wall sit', unit: 'seconds' }, { name: 'Push-ups', unit: 'reps' }, { name: 'Paper plane', unit: 'metres' }, { name: 'Beer pong', unit: 'place' }, { name: 'Flip cup', unit: 'place' }, { name: 'Thong throw', unit: 'metres' }, { name: 'Arm wrestle', unit: 'place' }],
    },
  },
  birthday: {
    id: 'birthday', label: 'Birthday', defaultHonour: 'The birthday girl', defaultTitle: (n) => `${n}'s Birthday`,
    role: { label: 'the birthday girl', short: 'birthday girl', emoji: '🎂', he: 'she', him: 'her', his: 'her', cap: 'The birthday girl' },
    mascot: 'melon', deck: 'birthday',
    features: { cellar: false, raids: false, mole: false, battles: true, drinks: false, autoSaturday: false, wall: 'book', quests: true },
    copy: {
      tagline: 'One afternoon. Everyone she loves. A game to bring them together.', enter: 'Join the party', partyWord: 'party', crowd: 'everyone',
      wallTitle: 'The Birthday Book', wallPrompt: 'Something genuine for {name}: a memory, a thank-you, what {he} means to you. {name} sees the book at the end.', wallPost: 'Add to the book', wallFeed: (who) => `${who} wrote in the Birthday Book`,
      phases: { lobby: 'Lobby', friday: 'Party time', saturday: 'Second half', finale: 'The Birthday Book', ended: 'Ended' },
      phaseBlurbs: { lobby: 'Paused. Nobody can do challenges.', friday: 'Challenges are on. The afternoon runs here.', saturday: 'Optional: a fresh set of quests and final forms. Use it for a long party.', finale: 'The TV plays the photo reel and then the Birthday Book. Lock the scores and run the awards.', ended: 'All over. Keepsake time.' },
      honourCategory: 'Get {name} In', laughCategory: 'Make {name} Laugh', loreCategory: '{name} Lore',
      forfeit: 'does a dare', selfieBlurb: 'Selfie, right now: show everyone your party face.',
      olympics: 'Athletics Carnival', olySuggested: [{ name: 'Sprint', unit: 'place' }, { name: 'Long jump', unit: 'metres' }, { name: 'Egg and spoon', unit: 'place' }, { name: 'Sack race', unit: 'place' }, { name: 'Free throws', unit: 'reps' }, { name: 'Badminton rally', unit: 'reps' }, { name: 'Tug of war', unit: 'place' }, { name: 'Seed spit', unit: 'metres' }, { name: 'Plank', unit: 'seconds' }, { name: 'Three-legged race', unit: 'place' }],
    },
  },
};

/** Fill {name}, {he}, {him}, {his}, {role}, {crowd}, {party} in any text for this party. */
export function fill(text: string, theme: ThemeId, name: string): string {
  const t = THEMES[theme] ?? THEMES.bucks;
  return text.replace(/\{name\}/g, name).replace(/\{he\}/g, t.role.he).replace(/\{him\}/g, t.role.him).replace(/\{his\}/g, t.role.his).replace(/\{role\}/g, t.role.label).replace(/\{Role\}/g, t.role.cap).replace(/\{crowd\}/g, t.copy.crowd).replace(/\{party\}/g, t.copy.partyWord);
}
export const isTheme = (x: unknown): x is ThemeId => x === 'bucks' || x === 'birthday';
