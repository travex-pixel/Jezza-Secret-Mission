import type { MissionCategory, CompletionMethod, MissionPhase } from './types';

export interface Mission {
  id: string;
  title: string;
  instruction: string;
  category: MissionCategory;
  difficulty: 1 | 2 | 3;
  points: number;
  xp: number;
  method: CompletionMethod; // 'self' honour system · 'photo' snap it · 'witness' a mate confirms
  scope: 'private' | 'group';
  phase: MissionPhase;
  loud?: boolean;   // performing (dance / sing / jokes). Low-key players never get these.
  secret?: boolean; // only the holder sees the title; the feed says "a sneaky one"
  starter?: boolean;
}

export const CATEGORY_META: Record<MissionCategory, { label: string; emoji: string; hue: string }> = {
  laugh:  { label: 'Make Jezza Laugh', emoji: '😂', hue: '#F07842' },
  dance:  { label: 'Dance',            emoji: '🕺', hue: '#B98286' },
  sing:   { label: 'Sing',             emoji: '🎤', hue: '#E5AD48' },
  photo:  { label: 'Cooked Photos',    emoji: '📸', hue: '#F6EBDD' },
  jezza:  { label: 'Get Jezza In',     emoji: '🤵', hue: '#E5AD48' },
  cheers: { label: 'Cheers',           emoji: '🍻', hue: '#F07842' },
  sneaky: { label: 'Sneaky',           emoji: '🕵️', hue: '#571827' },
  chill:  { label: 'Low-Key',          emoji: '😎', hue: '#7FB069' },
  group:  { label: 'Group',            emoji: '🫂', hue: '#7FB069' },
};

const REWARD: Record<1 | 2 | 3, { points: number; xp: number }> = {
  1: { points: 10, xp: 20 },
  2: { points: 20, xp: 35 },
  3: { points: 35, xp: 60 },
};

type M = Omit<Mission, 'points' | 'xp' | 'scope' | 'phase'> & Partial<Pick<Mission, 'points' | 'xp' | 'scope' | 'phase'>>;
const m = (x: M): Mission => ({ ...REWARD[x.difficulty], scope: 'private', phase: 'any', ...x });

export const MISSIONS: Mission[] = [
  // ---------- FIRST ONE ----------
  m({ id: 'm001', starter: true, title: 'The Legend Begins', instruction: 'Get Jezza to say "absolutely cooked" without asking him to say it.', category: 'jezza', difficulty: 1, method: 'self' }),

  // ---------- MAKE JEZZA LAUGH ----------
  m({ id: 'l01', title: 'Crack Him Up', instruction: 'You\'ve got 30 seconds to make Jezza laugh. Joke, face, impression, whatever. Go.', category: 'laugh', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'l02', title: 'Worst Joke of the Weekend', instruction: 'Tell Jezza your worst dad joke. Bonus respect if it\'s so bad he laughs anyway.', category: 'laugh', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'l03', title: 'Cooked Impression', instruction: 'Do a 15-second impression of someone Jezza knows. Keep it affectionate, not savage.', category: 'laugh', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'l04', title: 'Hype Man', instruction: 'Introduce Jezza like he\'s walking out for a title fight. Ten seconds. Full volume.', category: 'laugh', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'l05', title: 'Laugh-Off', instruction: 'You and a mate get one go each at making Jezza laugh. Jezza picks the winner. Winner claims it.', category: 'laugh', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'l06', title: 'Useless Magic Trick', instruction: 'Show Jezza the most useless magic trick you\'ve got, then act like you\'ve just changed his life.', category: 'laugh', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'l07', title: 'The Callback', instruction: 'Make Jezza laugh by bringing up something stupid that already happened this weekend.', category: 'laugh', difficulty: 2, method: 'witness' }),
  m({ id: 'l08', title: 'Weirdly Specific Compliment', instruction: 'Give Jezza a weirdly specific compliment. "Your elbows have great energy" sort of thing.', category: 'laugh', difficulty: 1, method: 'witness' }),
  m({ id: 'l09', title: 'One-Line Roast', instruction: 'Roast Jezza in one sentence. Funny, not brutal. If he doesn\'t laugh, it doesn\'t count.', category: 'laugh', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'l10', title: 'Staring Contest', instruction: 'Twenty-second staring contest with Jezza. First to crack loses. Claim it either way.', category: 'laugh', difficulty: 1, method: 'witness' }),
  m({ id: 'l11', title: 'Slow Clap', instruction: 'Start a slow clap for something dead boring and get three lads to join in.', category: 'laugh', difficulty: 2, method: 'self', loud: true }),
  m({ id: 'l12', title: 'Copy His Face', instruction: 'Copy Jezza\'s exact expression, deadpan, for as long as it takes him to crack.', category: 'laugh', difficulty: 1, method: 'witness' }),

  // ---------- DANCE ----------
  m({ id: 'd01', title: 'Ripper Dance', instruction: 'Give Jezza your most cooked 15-second dance. No warm-up. Full commitment.', category: 'dance', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'd02', title: 'Worst Dancer Alive', instruction: 'Show Jezza your worst moves. Anything you\'re actually good at is banned.', category: 'dance', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'd03', title: 'Dance-Off', instruction: 'Call out a mate for a 15-second dance-off. Jezza picks the winner. Winner claims, loser gets respect.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd04', title: 'Dad at a Wedding', instruction: 'Ten seconds of your best dad-at-a-wedding dance. Finger guns optional but encouraged.', category: 'dance', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'd05', title: 'Backup Dancer', instruction: 'Be Jezza\'s way-too-keen backup dancer for ten seconds. He doesn\'t even have to be dancing.', category: 'dance', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'd06', title: 'In Sync', instruction: 'Get two mates to pull the exact same dance move at the exact same time.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd07', title: 'Victory Dance', instruction: 'Do a massive victory dance for something completely boring, like finding your phone.', category: 'dance', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'd08', title: 'Sorry, Through Dance', instruction: 'Dance an apology to Jezza for something tiny. No words allowed.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd09', title: 'Jezza Picks the Song', instruction: 'Jezza picks any song. You\'ve got 15 seconds to dance to it like your life depends on it.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd10', title: 'Dance Judge', instruction: 'Get two mates to dance for Jezza, then score them out of ten like a brutal reality TV judge.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd11', title: 'Backup Crew', instruction: 'Get two mates to be Jezza\'s backup dancers for a full chorus. Total commitment, zero rehearsal.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),

  // ---------- SING ----------
  m({ id: 's01', title: 'Song Dedication', instruction: 'Sing a chorus straight to Jezza like you wrote it for him. Eye contact the whole time.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 's02', title: 'Terrible Karaoke', instruction: 'Sing ten seconds of any song as badly as humanly possible.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 's03', title: 'Backup Vocals', instruction: 'Sing to Jezza while a mate does the most over-the-top backup vocals they can.', category: 'sing', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 's04', title: 'Boy Band', instruction: 'Get two mates to sing the same chorus with you. Harmonies optional. Confidence mandatory.', category: 'sing', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 's05', title: 'Jezza Chant', instruction: 'Make up a chant about Jezza and get at least one mate to join in.', category: 'sing', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 's06', title: 'Grand Final Anthem', instruction: 'Sing one line of any song like it\'s the anthem before the grand final. Hand on heart.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 's07', title: 'Duet', instruction: 'Sing a chorus with a mate. The worse the harmonies, the better.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 's08', title: 'Power Ballad', instruction: 'Sing Jezza one chorus with way too much emotion. Eyes shut, fist clenched, one tear optional.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),

  // ---------- COOKED PHOTOS ----------
  m({ id: 'p01', title: 'Most Cooked Selfie', instruction: 'Take the most ridiculous selfie you can with Jezza. You both have to be happy with it.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p02', title: 'Identical Idiots', instruction: 'Get three mates to pull the exact same face in one photo.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p03', title: 'Pyramid of Lads', instruction: 'Pyramid-shaped group photo: back row standing, middle row squatting, front row sitting. Nobody climbs on anyone.', category: 'photo', difficulty: 3, method: 'photo' }),
  m({ id: 'p04', title: 'Jezza Is King', instruction: 'Everyone poses around Jezza like he\'s royalty. The more over the top, the better.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p05', title: 'Human Arrow', instruction: 'Line the lads up into an arrow pointing straight at Jezza.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p06', title: 'Everyone Different', instruction: 'Group photo where every single person pulls a different stupid pose.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p07', title: 'The Lean', instruction: 'Everyone leans the same way like gravity\'s given up. Feet stay on the ground.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p08', title: 'Worst Album Cover', instruction: 'Three or more lads pose for the world\'s worst album cover. Put the band name in the note.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p09', title: 'Olympic Gold', instruction: 'Photo of Jezza celebrating something completely ordinary like he\'s just won gold.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p10', title: 'Copycat Chain', instruction: 'Copy Jezza\'s pose exactly, then get two mates to copy you both. Photo of the lot.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p11', title: 'Statues', instruction: 'Everyone freezes in a different ridiculous pose. One photo.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p12', title: 'Fitness Influencers', instruction: 'Fake gym photo with the lads. Flex, point, pretend. Nobody actually works out.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p13', title: 'The Point', instruction: 'Get four or more mates pointing dramatically at something completely boring.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p14', title: 'Lads Calendar', instruction: 'Group photo where everyone pulls their most overconfident calendar pose.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p15', title: 'Bodyguards', instruction: 'Two mates pose as dead-serious bodyguards either side of Jezza.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p16', title: 'Cursed Family Portrait', instruction: 'Fake family portrait. Everyone pulls a different cursed expression.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p17', title: 'Wombat Squad', instruction: 'Everyone gets low in a comfy squat for a group photo. Lower is better, as long as nobody\'s knees complain.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p18', title: 'Grand Final Winners', instruction: 'Group photo of everyone celebrating like you just won the grand final. Jezza holds the imaginary cup.', category: 'photo', difficulty: 2, method: 'photo' }),

  // ---------- GET JEZZA IN ----------
  m({ id: 'j01', title: 'Jezza Joins In', instruction: 'Get Jezza into your most ridiculous group pose.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'j02', title: 'Jezza Picks', instruction: 'Give Jezza two stupid (harmless) options for what you do next. Do whichever he picks.', category: 'jezza', difficulty: 1, method: 'witness' }),
  m({ id: 'j03', title: 'Groom\'s Award', instruction: 'Give Jezza a made-up award for something he did this weekend. Photo of the presentation.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'j04', title: 'Team Celebration', instruction: 'Get Jezza and two mates into a full team celebration pose.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'j05', title: 'Chant Leader', instruction: 'Get three mates chanting something about the weekend with Jezza. Five seconds is plenty.', category: 'jezza', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'j06', title: 'Jezza\'s Best Side', instruction: 'Ask Jezza for his best pose, then get the lads to copy it. Photo.', category: 'jezza', difficulty: 2, method: 'photo' }),
  m({ id: 'j07', title: 'Secret Handshake', instruction: 'Invent a ridiculously complicated handshake with Jezza and nail it twice in a row.', category: 'jezza', difficulty: 2, method: 'witness' }),
  m({ id: 'j08', title: 'Odd One Out', instruction: 'Find two mates wearing similar colours and take a photo with Jezza as the odd one out.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'j09', title: 'Fan Club', instruction: 'Get three mates to pose as Jezza\'s way-too-keen fan club.', category: 'jezza', difficulty: 2, method: 'photo' }),
  m({ id: 'j10', title: 'Groom\'s Choice', instruction: 'Offer Jezza three options: joke, song or dance. Do whichever one he picks.', category: 'jezza', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'j11', title: 'Marriage Advice', instruction: 'Ask Jezza for his best marriage advice so far. Nod like it\'s the wisest thing you\'ve ever heard.', category: 'jezza', difficulty: 1, method: 'self' }),

  // ---------- CHEERS (any drink counts, nobody has to drink) ----------
  m({ id: 'c01', title: 'Cheers with Jezza', instruction: 'Clink glasses with Jezza and get a funny photo of it. Any drink counts.', category: 'cheers', difficulty: 1, method: 'photo' }),
  m({ id: 'c02', title: 'Ten-Second Toast', instruction: 'Give Jezza a ten-second toast. Heartfelt, ridiculous, or both.', category: 'cheers', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'c03', title: 'Cheers Crew', instruction: 'Get three mates and Jezza into a group cheers photo.', category: 'cheers', difficulty: 2, method: 'photo' }),
  m({ id: 'c04', title: 'Drink Review', instruction: 'Review whatever you\'re drinking like an overconfident food critic. No need to finish it.', category: 'cheers', difficulty: 1, method: 'witness' }),
  m({ id: 'c05', title: 'Mocktail Champion', instruction: 'Make a toast with a non-alcoholic drink like you\'re accepting a world title.', category: 'cheers', difficulty: 1, method: 'witness' }),
  m({ id: 'c06', title: 'Signature Cheers', instruction: 'Invent your own cheers move and get a mate to do it with you.', category: 'cheers', difficulty: 1, method: 'witness' }),
  m({ id: 'c07', title: 'Cheers Round', instruction: 'Clink with five different lads in the next ten minutes. Clink, nod, move on.', category: 'cheers', difficulty: 1, method: 'self' }),
  m({ id: 'c08', title: 'Absent Mates', instruction: 'Raise a glass to a mate who couldn\'t make it and send them the photo.', category: 'cheers', difficulty: 1, method: 'photo' }),
  m({ id: 'c09', title: 'Synchronised Cheers', instruction: 'Get four lads to pull the exact same cheers pose in one photo. Any drink counts.', category: 'cheers', difficulty: 2, method: 'photo' }),
  m({ id: 'c10', title: 'Historic Toast', instruction: 'Toast Jezza like it\'s a moment in history: "On this day, a legend..." Under 20 seconds.', category: 'cheers', difficulty: 2, method: 'witness', loud: true }),

  // ---------- SNEAKY (only you can see these) ----------
  m({ id: 'x01', secret: true, title: 'Plant a Word', instruction: 'Get Jezza to say "ripper" without him knowing it\'s a mission.', category: 'sneaky', difficulty: 2, method: 'self' }),
  m({ id: 'x02', secret: true, title: 'Copycat', instruction: 'Copy everything a mate does for a minute until they notice. Then act innocent.', category: 'sneaky', difficulty: 1, method: 'self' }),
  m({ id: 'x03', secret: true, title: 'The Echo', instruction: 'Repeat the last two words Jezza says, three times in a row, without him clocking it.', category: 'sneaky', difficulty: 2, method: 'self' }),
  m({ id: 'x04', secret: true, title: 'Nickname Launch', instruction: 'Give a mate a new nickname and get two other lads using it within 20 minutes.', category: 'sneaky', difficulty: 3, method: 'self' }),
  m({ id: 'x05', secret: true, title: 'Photobomb', instruction: 'Sneak into the background of three different photos tonight. Nobody can notice until later.', category: 'sneaky', difficulty: 2, method: 'self' }),

  // ---------- LOW-KEY (no performing, no camera) ----------
  m({ id: 'q01', title: 'Handshake Ratings', instruction: 'Rate three mates\' handshakes out of ten and tell them their score. Feedback encouraged.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q02', title: 'Quote of the Night', instruction: 'Grab the funniest thing someone\'s said tonight and read it back to the group.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q03', title: 'Sequel', instruction: 'Catch someone telling the same story twice this weekend and yell "SEQUEL".', category: 'chill', difficulty: 2, method: 'self', phase: 'saturday' }),
  m({ id: 'q04', title: 'Phone Rescue', instruction: 'Catch a mate doom-scrolling while the boys are talking and drag them back into the yarn.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q05', title: 'How\'d You Meet?', instruction: 'Ask Jezza how he met his partner. Only interrupt to say "no way".', category: 'chill', difficulty: 1, method: 'self', phase: 'friday' }),
  m({ id: 'q06', title: 'Snack Delivery', instruction: 'Bring a mate a snack they didn\'t ask for. Hand it over like it\'s a trophy.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q07', title: 'Cooked Counter', instruction: 'Count how many times someone says "cooked" in 15 minutes. Announce the total.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q08', title: 'Group Chat Banger', instruction: 'Take one genuinely good photo of the view or the venue for the group chat.', category: 'chill', difficulty: 1, method: 'photo' }),
  m({ id: 'q09', title: 'Wingman', instruction: 'Hype up a mate\'s average joke until the whole group laughs.', category: 'chill', difficulty: 2, method: 'self' }),
  m({ id: 'q10', title: 'Lookalikes', instruction: 'Tell three mates which celebrity they look like. No appeals.', category: 'chill', difficulty: 1, method: 'self' }),

  // ---------- GROUP (go live on their own every so often; optional) ----------
  m({ id: 'g01', title: 'The Big Cheers', instruction: 'Everyone raises a drink at once and yells "CHEERS JEZZA". Any drink counts. One photo.', category: 'group', difficulty: 1, method: 'photo', scope: 'group', points: 15, xp: 30 }),
  m({ id: 'g02', title: 'Creature Parade', instruction: 'Everyone holds up their phone showing their creature for one massive group photo.', category: 'group', difficulty: 2, method: 'photo', scope: 'group', points: 25, xp: 40 }),
  m({ id: 'g03', title: 'Silent Minute', instruction: 'The whole group stays dead silent for one minute. First to crack grabs the next round of snacks. Everyone else claims.', category: 'group', difficulty: 2, method: 'self', scope: 'group', points: 20, xp: 30 }),
  m({ id: 'g04', title: 'The Wave', instruction: 'Do a Mexican wave with the whole group for Jezza. Snap the best moment.', category: 'group', difficulty: 1, method: 'photo', scope: 'group', points: 15, xp: 30 }),
  m({ id: 'g05', title: 'Sunset Salute', instruction: 'Everyone outside, drinks up, one massive "CHEERS JEZZA" at the sky. Photo.', category: 'group', difficulty: 1, method: 'photo', scope: 'group', phase: 'saturday', points: 20, xp: 35 }),
  m({ id: 'g06', title: 'Squad Goals', instruction: 'Pull the most dramatic group pose you can think of. Everyone in, Jezza in the middle.', category: 'group', difficulty: 2, method: 'photo', scope: 'group', points: 25, xp: 40 }),
];

export const MISSION_BY_ID: Record<string, Mission> = Object.fromEntries(MISSIONS.map((x) => [x.id, x]));
export const STARTER_MISSION = MISSIONS.find((x) => x.starter)!;
export const GROUP_MISSIONS = MISSIONS.filter((x) => x.scope === 'group');

export function missionAvailableInPhase(mission: Mission, phase: 'friday' | 'saturday'): boolean {
  return mission.phase === 'any' || mission.phase === phase;
}

export const METHOD_META: Record<CompletionMethod, { label: string; cta: string; hint: string }> = {
  self:    { label: 'Honour system', cta: 'I DID IT', hint: 'Tap when it\'s done. The lads will know if you\'re lying.' },
  photo:   { label: 'Snap it', cta: 'SNAP IT', hint: 'Take a photo or pick one from your library. The lads vote it in (or the host checks it, if they\'ve set that).' },
  witness: { label: 'A mate confirms', cta: 'WHO SAW IT?', hint: 'Pick a mate who was there. They tap yes on their phone.' },
  host:    { label: 'Host decides', cta: 'SUBMIT', hint: 'The host decides.' },
};

export const REWARD_QUIPS = [
  'Absolute scenes.', 'Jezza will remember that. Unfortunately.', 'Cooked. Beautifully cooked.', 'The lads are proud. Probably.',
  'That\'s going in the speech.', 'Ripper effort.', 'Unreal. Do it again.', 'Certified legend behaviour.', 'No notes.',
  'Questionable. Points anyway.', 'Main character energy.', 'Mum would be proud. Don\'t tell her.',
];
