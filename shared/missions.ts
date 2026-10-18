import type { MissionCategory, CompletionMethod, MissionPhase } from './types';

export interface Mission {
  id: string;
  title: string;
  instruction: string;
  category: MissionCategory;
  difficulty: 1 | 2 | 3;
  points: number;
  xp: number;
  method: CompletionMethod;
  scope: 'private' | 'group';
  phase: MissionPhase;
  timeLimitMin?: number;
  secret?: boolean;
  starter?: boolean;
}

export const CATEGORY_META: Record<MissionCategory, { label: string; emoji: string; hue: string }> = {
  social:      { label: 'Social Chaos',  emoji: '🎭', hue: '#F07842' },
  jezza:       { label: 'Jezza',         emoji: '🤴', hue: '#E5AD48' },
  observation: { label: 'Observation',   emoji: '🔭', hue: '#B98286' },
  creative:    { label: 'Creative',      emoji: '🎨', hue: '#D98A96' },
  group:       { label: 'Group',         emoji: '🫂', hue: '#7FB069' },
  secret:      { label: 'Secret',        emoji: '🕵️', hue: '#571827' },
  photo:       { label: 'Photo',         emoji: '📸', hue: '#F6EBDD' },
  vineyard:    { label: 'Vineyard',      emoji: '🍇', hue: '#76243A' },
  creature:    { label: 'Creature',      emoji: '🐲', hue: '#E5AD48' },
  toast:       { label: 'Toast',         emoji: '🥂', hue: '#F07842' },
};

const REWARD: Record<1 | 2 | 3, { points: number; xp: number }> = {
  1: { points: 10, xp: 20 },
  2: { points: 20, xp: 35 },
  3: { points: 35, xp: 60 },
};

type M = Omit<Mission, 'points' | 'xp'> & { points?: number; xp?: number };
const m = (x: M): Mission => ({ ...REWARD[x.difficulty], ...x });

export const MISSIONS: Mission[] = [
  // ---------- STARTER ----------
  m({ id: 'm001', starter: true, title: 'The Legend Begins', instruction: 'Get Jezza to say "absolutely cooked" without directly asking him to say it.', category: 'jezza', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),

  // ---------- SOCIAL CHAOS ----------
  m({ id: 'm010', title: 'The Sommelier Fraud', instruction: 'Describe a completely ordinary object (a thong, a coaster, a sausage) as if it were an outrageously exclusive luxury product. Minimum 20 seconds.', category: 'social', difficulty: 2, method: 'witness', scope: 'private', phase: 'any' }),
  m({ id: 'm011', title: 'The Vineyard Diplomat', instruction: 'Introduce two mates to each other as if they were meeting at a royal summit. Full titles. Firm handshake.', category: 'social', difficulty: 1, method: 'witness', scope: 'private', phase: 'any' }),
  m({ id: 'm012', title: 'The Goblin\'s Gambit', instruction: 'Convince a mate your creature has a tragic secret backstory. They must ask at least one follow-up question.', category: 'social', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm013', title: 'Weather Report', instruction: 'Deliver a dramatic live weather report about the vibe in the room. Use the phrase "a cold front of banter".', category: 'social', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm014', title: 'The Slow Clap', instruction: 'Start a slow clap for something utterly mundane (someone opening a packet of chips) and get at least 3 mates to join in.', category: 'social', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm015', title: 'Accent Hour', instruction: 'Hold a 60 second conversation in an accent you cannot do. Do not break. Do not apologise.', category: 'social', difficulty: 2, method: 'witness', scope: 'private', phase: 'any', timeLimitMin: 15 }),
  m({ id: 'm016', title: 'The Nickname Launch', instruction: 'Give a mate a brand-new nickname and get two other people to use it unprompted within 20 minutes.', category: 'social', difficulty: 3, method: 'self', scope: 'private', phase: 'any', timeLimitMin: 20 }),
  m({ id: 'm017', title: 'Motivational Speaker', instruction: 'Give a mate a deeply sincere, deeply unnecessary pep talk about a trivial task. Hand on shoulder. Eye contact.', category: 'social', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm018', title: 'Quiz Master', instruction: 'Run a 3-question pop quiz about Jezza for the nearest group. Award a made-up prize to the winner.', category: 'social', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm019', title: 'The Compliment Sniper', instruction: 'Deliver five genuine, oddly specific compliments to five different mates within 10 minutes.', category: 'social', difficulty: 2, method: 'self', scope: 'private', phase: 'any', timeLimitMin: 10 }),

  // ---------- JEZZA ----------
  m({ id: 'm020', title: 'The Jezza Tribute', instruction: 'Perform a ridiculous but genuinely affectionate 30 second tribute to the groom. Poem, rap, interpretive dance: your call.', category: 'jezza', difficulty: 2, method: 'witness', scope: 'private', phase: 'any' }),
  m({ id: 'm021', title: 'Origin Story', instruction: 'Get Jezza to tell the story of how he met his partner. Interrupt only to say "no way".', category: 'jezza', difficulty: 1, method: 'self', scope: 'private', phase: 'friday' }),
  m({ id: 'm022', title: 'The Royal Portrait', instruction: 'Take a photo of Jezza posed like a Renaissance king. Props encouraged. Dignity optional.', category: 'jezza', difficulty: 2, method: 'photo', scope: 'private', phase: 'any' }),
  m({ id: 'm023', title: 'Fact Check', instruction: 'Ask Jezza three questions about his own wedding plans. Score him publicly out of 10.', category: 'jezza', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm024', title: 'Groom Whisperer', instruction: 'Get Jezza to agree to a completely made-up wedding tradition. Must include the words "it\'s actually traditional".', category: 'jezza', difficulty: 3, method: 'witness', scope: 'private', phase: 'saturday' }),
  m({ id: 'm025', title: 'Signature Move', instruction: 'Get Jezza to demonstrate his "signature dance move". If he claims not to have one, invent it for him.', category: 'jezza', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm026', title: 'The Advice Column', instruction: 'Ask Jezza for relationship advice about an entirely fictional problem. Keep a straight face.', category: 'jezza', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm027', title: 'Best Mate Audition', instruction: 'Formally audition to be Jezza\'s best man, even if the role is taken. Include one prop.', category: 'jezza', difficulty: 2, method: 'witness', scope: 'private', phase: 'saturday' }),
  m({ id: 'm028', title: 'Jezza Impression', instruction: 'Do your best Jezza impression to Jezza. He must rate it. Any score counts.', category: 'jezza', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),

  // ---------- OBSERVATION ----------
  m({ id: 'm030', title: 'Spot the Sommelier', instruction: 'Catch a mate swirling, sniffing or describing a drink with unearned confidence. Call it out loudly.', category: 'observation', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm031', title: 'The Repeat Offender', instruction: 'Catch someone telling the same story twice this weekend. Announce "SEQUEL" when it happens.', category: 'observation', difficulty: 2, method: 'self', scope: 'private', phase: 'saturday' }),
  m({ id: 'm032', title: 'Phone Zombie', instruction: 'Spot a mate scrolling their phone for over a minute while the group is talking. Gently rescue them.', category: 'observation', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm033', title: 'Count the Cheers', instruction: 'Count every "cheers" you hear in 15 minutes. Report the number to the group with full confidence.', category: 'observation', difficulty: 1, method: 'self', scope: 'private', phase: 'any', timeLimitMin: 15 }),
  m({ id: 'm034', title: 'Who Said That', instruction: 'Note down the funniest quote of the hour. Read it back to the group with a dramatic pause.', category: 'observation', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm035', title: 'The Doppelgänger', instruction: 'Decide which celebrity each of three mates looks like. Present your findings. Accept no appeals.', category: 'observation', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm036', title: 'The Vanishing', instruction: 'Notice when someone leaves the group for more than 10 minutes. Greet them on return like a long-lost hero.', category: 'observation', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),

  // ---------- CREATIVE ----------
  m({ id: 'm040', title: 'The Vineyard Anthem', instruction: 'Write and perform a 4-line anthem for this weekend. It must rhyme something with "Hunter Valley".', category: 'creative', difficulty: 2, method: 'witness', scope: 'private', phase: 'any' }),
  m({ id: 'm041', title: 'Wine Label', instruction: 'Design a wine label for a vintage named after a mate. Describe the tasting notes out loud. Be cruel but fair.', category: 'creative', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm042', title: 'Haiku Hour', instruction: 'Compose a haiku about Jezza and read it aloud. Five, seven, five. No cheating on syllables.', category: 'creative', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm043', title: 'Movie Pitch', instruction: 'Pitch this weekend as a Hollywood movie. Title, tagline, and who plays Jezza. 30 seconds max.', category: 'creative', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm044', title: 'Statue Garden', instruction: 'Arrange three mates into a statue representing "Friendship". Photograph your masterpiece.', category: 'creative', difficulty: 2, method: 'photo', scope: 'private', phase: 'any' }),
  m({ id: 'm045', title: 'The Commercial', instruction: 'Film-free: perform a 20 second TV ad for a product that doesn\'t exist. Must include a jingle.', category: 'creative', difficulty: 2, method: 'witness', scope: 'private', phase: 'saturday' }),
  m({ id: 'm046', title: 'Alphabet Toast', instruction: 'Give a toast where each sentence starts with the next letter of the alphabet. Reach at least G.', category: 'creative', difficulty: 3, method: 'witness', scope: 'private', phase: 'any' }),

  // ---------- GROUP (host-revealed) ----------
  m({ id: 'm050', title: 'The Cellar Ceremony', instruction: 'Everyone gather for one dramatic group photo with your creature on your phone screen held proudly. Host approves the chaos.', category: 'group', difficulty: 2, method: 'photo', scope: 'group', phase: 'any', points: 25, xp: 40 }),
  m({ id: 'm051', title: 'The Great Toast', instruction: 'The whole party toasts Jezza at once. Each person adds one word to a single collective sentence. Chaos guaranteed.', category: 'group', difficulty: 1, method: 'self', scope: 'group', phase: 'any', points: 15, xp: 30 }),
  m({ id: 'm052', title: 'Silent Minute', instruction: 'The entire party stays silent for one full minute. First to break it owes the group a toast. Everyone else claims.', category: 'group', difficulty: 2, method: 'self', scope: 'group', phase: 'any', points: 20, xp: 30 }),
  m({ id: 'm053', title: 'Creature Parade', instruction: 'Line up in creature-level order and do your creature\'s cry one by one. Yes, out loud. Yes, all of you.', category: 'group', difficulty: 2, method: 'self', scope: 'group', phase: 'saturday', points: 20, xp: 35 }),
  m({ id: 'm054', title: 'The Human Pyramid of Lies', instruction: 'Each person tells one lie about Jezza. The group votes on the most believable. Everyone who voted claims.', category: 'group', difficulty: 2, method: 'self', scope: 'group', phase: 'any', points: 20, xp: 30 }),
  m({ id: 'm055', title: 'Sunset Salute', instruction: 'Everyone outside, drinks raised (any drink counts), one synchronised "CHEERS JEZZA" at the sky. Photo for the archives.', category: 'group', difficulty: 1, method: 'photo', scope: 'group', phase: 'saturday', points: 20, xp: 35 }),

  // ---------- SECRET ----------
  m({ id: 'm060', secret: true, title: 'The Mole', instruction: 'Secretly get three different mates to say the word "velvet" in conversation. Nobody can know this is a mission.', category: 'secret', difficulty: 3, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm061', secret: true, title: 'The Plant', instruction: 'Casually place a single grape somewhere it absolutely should not be. If someone finds it and reacts, claim.', category: 'secret', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm062', secret: true, title: 'The Echo', instruction: 'Repeat the last two words of whatever Jezza says, three times in a row, without him noticing.', category: 'secret', difficulty: 3, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm063', secret: true, title: 'The Hat Trick', instruction: 'Get a mate to wear something on their head they weren\'t wearing before. They must not realise it was a mission.', category: 'secret', difficulty: 2, method: 'photo', scope: 'private', phase: 'any' }),
  m({ id: 'm064', secret: true, title: 'The Wingman', instruction: 'Secretly hype up a mate\'s terrible joke until the whole group laughs. Never reveal you were on a mission.', category: 'secret', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm065', secret: true, title: 'The Word Smuggler', instruction: 'Smuggle the phrase "structurally unsound" into three separate conversations tonight.', category: 'secret', difficulty: 3, method: 'self', scope: 'private', phase: 'saturday' }),
  m({ id: 'm066', secret: true, title: 'Barrel 7', instruction: 'Convince one mate there is a haunted barrel somewhere on the property. Bonus if they go looking.', category: 'secret', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),

  // ---------- PHOTO ----------
  m({ id: 'm070', title: 'Creature Cosplay', instruction: 'Pose like your creature. Commit fully. Photo required, dignity not.', category: 'photo', difficulty: 1, method: 'photo', scope: 'private', phase: 'any' }),
  m({ id: 'm071', title: 'The Boardroom', instruction: 'Photograph three mates in a deadly serious "board meeting" pose over snacks.', category: 'photo', difficulty: 2, method: 'photo', scope: 'private', phase: 'any' }),
  m({ id: 'm072', title: 'Golden Hour', instruction: 'Take a genuinely beautiful photo of the vineyard, sky or landscape. The group will judge your artistry.', category: 'photo', difficulty: 1, method: 'photo', scope: 'private', phase: 'any' }),
  m({ id: 'm073', title: 'Album Cover', instruction: 'Shoot a moody album cover for your mates\' imaginary band. Name the band in your claim note.', category: 'photo', difficulty: 2, method: 'photo', scope: 'private', phase: 'any' }),
  m({ id: 'm074', title: 'Jump Shot', instruction: 'Capture at least three mates mid-air. Everyone\'s feet off the ground or it doesn\'t count.', category: 'photo', difficulty: 3, method: 'photo', scope: 'private', phase: 'saturday' }),
  m({ id: 'm075', title: 'Tiny Tour Guide', instruction: 'Photo of a mate pointing at something totally unremarkable with huge enthusiasm.', category: 'photo', difficulty: 1, method: 'photo', scope: 'private', phase: 'any' }),
  m({ id: 'm076', title: 'Shadow Puppets', instruction: 'Make a shadow creature on a wall with your hands. Photo it. Name it in your note.', category: 'photo', difficulty: 1, method: 'photo', scope: 'private', phase: 'any' }),

  // ---------- VINEYARD ATMOSPHERE ----------
  m({ id: 'm080', title: 'Terroir Talk', instruction: 'Explain the word "terroir" to a mate with total confidence. Facts are optional. Conviction is not.', category: 'vineyard', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm081', title: 'The Vintage', instruction: 'Declare the current year "an excellent vintage for mateship" in a toast. Swirl something while you say it.', category: 'vineyard', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm082', title: 'Cellar Door Legend', instruction: 'Invent a legend about the vineyard\'s founder and tell it to two mates as absolute fact.', category: 'vineyard', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm083', title: 'Blind Tasting', instruction: 'Taste-test two drinks (anything, even water vs sparkling) blindfolded and identify them. Be wrong beautifully.', category: 'vineyard', difficulty: 2, method: 'witness', scope: 'private', phase: 'any' }),
  m({ id: 'm084', title: 'The Grape Whisperer', instruction: 'Compliment a plant, vine or tree out loud. Minimum three compliments. Someone must hear you.', category: 'vineyard', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm085', title: 'Tasting Notes', instruction: 'Give tasting notes for a mate\'s personality. "Nose of chaos, long finish of loyalty." Deliver to their face.', category: 'vineyard', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm086', title: 'Moonrise', instruction: 'Spot the moon (or the brightest light outside) and point it out to the group like you discovered it.', category: 'vineyard', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),

  // ---------- CREATURE ----------
  m({ id: 'm090', title: 'The Cry', instruction: 'Do your creature\'s battle cry, out loud, in front of at least three mates. Full commitment.', category: 'creature', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm091', title: 'Adoption Papers', instruction: 'Introduce your creature to a mate by name and explain its personality in detail. They must shake its hand (your phone).', category: 'creature', difficulty: 1, method: 'self', scope: 'private', phase: 'friday' }),
  m({ id: 'm092', title: 'Rivalry', instruction: 'Challenge a mate to a creature battle and complete it. Win or lose, claim this mission.', category: 'creature', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm093', title: 'Trainer Montage', instruction: 'Perform a 15 second training montage with your creature (your phone). Dramatic music optional. Sweatband optional.', category: 'creature', difficulty: 2, method: 'witness', scope: 'private', phase: 'any' }),
  m({ id: 'm094', title: 'Creature Diplomacy', instruction: 'Negotiate a formal alliance between your creature and a mate\'s creature. Shake on it. Announce the alliance name.', category: 'creature', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm095', title: 'Fashion Week', instruction: 'Equip a cosmetic on your creature and show it off to two mates with a runway commentary.', category: 'creature', difficulty: 1, method: 'self', scope: 'private', phase: 'saturday' }),

  // ---------- TOAST ----------
  m({ id: 'm100', title: 'The Royal Toast', instruction: 'Deliver an absurdly grand toast to Jezza. Minimum three titles ("Duke of Dad Jokes") and one dramatic pause.', category: 'toast', difficulty: 2, method: 'witness', scope: 'private', phase: 'any' }),
  m({ id: 'm101', title: 'The Mystery Toast', instruction: 'Invent a toast that makes absolutely no sense but sounds deeply inspirational. "To the horizon within the sandwich."', category: 'toast', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm102', title: 'The Drinking Buddy', instruction: 'Get a mate to join you for a shared toast. Any drink counts: beer, wine, water, a cheeky mocktail.', category: 'toast', difficulty: 1, method: 'witness', scope: 'private', phase: 'any' }),
  m({ id: 'm103', title: 'The Clink Chain', instruction: 'Start a toast where each glass must clink the next one in a chain. Five people minimum. No breaks.', category: 'toast', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm104', title: 'The Absent Friend', instruction: 'Toast to a mate who couldn\'t make it. Make it heartfelt. Make it slightly too long.', category: 'toast', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm105', title: 'The Villain Toast', instruction: 'Toast Jezza as if you are the villain in his life story. Slow clap optional. Monologue mandatory.', category: 'toast', difficulty: 2, method: 'witness', scope: 'private', phase: 'saturday' }),
  m({ id: 'm106', title: 'Toast in Translation', instruction: 'Deliver a toast in a language you don\'t speak, then "translate" it. The translation must be longer than the toast.', category: 'toast', difficulty: 2, method: 'self', scope: 'private', phase: 'any' }),
  m({ id: 'm107', title: 'The Sommelier\'s Toast', instruction: 'Toast whatever you\'re holding with a full tasting note. "Hints of regret, finish of Saturday." Even if it\'s water.', category: 'toast', difficulty: 1, method: 'self', scope: 'private', phase: 'any' }),

  // ---------- HOST-APPROVED SPECIALS ----------
  m({ id: 'm110', title: 'The Grand Performance', instruction: 'Perform a full one-minute set (comedy, song, magic, anything) for the whole party. Host decides if it counted.', category: 'creative', difficulty: 3, method: 'host', scope: 'private', phase: 'saturday', points: 45, xp: 70 }),
  m({ id: 'm111', title: 'Legendary Hospitality', instruction: 'Do something genuinely kind and useful for the group (sort food, fix the music, drive the vibe). Host approves.', category: 'social', difficulty: 2, method: 'host', scope: 'private', phase: 'any', points: 30, xp: 50 }),
  m({ id: 'm112', title: 'The Speech', instruction: 'Give Jezza a proper, sincere speech. Make at least one person go "aww". Host approves.', category: 'jezza', difficulty: 3, method: 'host', scope: 'private', phase: 'saturday', points: 45, xp: 70 }),
];

export const MISSION_BY_ID: Record<string, Mission> = Object.fromEntries(MISSIONS.map((x) => [x.id, x]));
export const STARTER_MISSION = MISSIONS.find((x) => x.starter)!;
export const GROUP_MISSIONS = MISSIONS.filter((x) => x.scope === 'group');

export function missionAvailableInPhase(mission: Mission, phase: 'friday' | 'saturday'): boolean {
  return mission.phase === 'any' || mission.phase === phase;
}

export const METHOD_META: Record<CompletionMethod, { label: string; cta: string; hint: string }> = {
  self:    { label: 'Honour system', cta: 'I DID IT', hint: 'Tap when it\'s done. Your mates will know if you\'re lying.' },
  photo:   { label: 'Photo proof',   cta: 'SNAP PROOF', hint: 'Take a photo. The host approves it and it hits the feed.' },
  witness: { label: 'Needs a witness', cta: 'PICK A WITNESS', hint: 'A mate confirms on their phone that it happened.' },
  host:    { label: 'Host approved', cta: 'SUBMIT TO HOST', hint: 'The host decides. Bribery is not supported in this version.' },
};
