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
  selfie?: boolean;  // opens the front camera
  tutorial?: boolean; // one of the three intro steps (selfie, roast, toast)
  wall?: 'roast' | 'toast'; // done by posting to the {name} Wall
  retired?: boolean; // no longer dealt; kept so old completions, claims and feed posts still resolve
  free?: boolean;    // never dealt: anyone can do it any time, as often as they like (the photo drop)
  theme?: 'bucks' | 'birthday' | 'any'; // which deck this belongs to (default bucks)
}

export const CATEGORY_META: Record<MissionCategory, { label: string; emoji: string; hue: string }> = {
  laugh:  { label: 'Make {name} Laugh', emoji: '😂', hue: '#F07842' },
  dance:  { label: 'Dance',            emoji: '🕺', hue: '#B98286' },
  sing:   { label: 'Sing',             emoji: '🎤', hue: '#E5AD48' },
  photo:  { label: 'Cooked Photos',    emoji: '📸', hue: '#F6EBDD' },
  jezza:  { label: 'Get {name} In',     emoji: '🤵', hue: '#E5AD48' },
  cheers: { label: 'Cheers',           emoji: '🍻', hue: '#F07842' },
  sneaky: { label: 'Sneaky',           emoji: '🕵️', hue: '#571827' },
  chill:  { label: 'Low-Key',          emoji: '😎', hue: '#7FB069' },
  group:  { label: 'Group',            emoji: '🫂', hue: '#7FB069' },
  lore:   { label: '{name} Lore',       emoji: '📜', hue: '#9AD0EC' },
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
  // A selfie: doable anywhere, right now, and it counts straight away. Its XP is exactly Level 2.
  m({ id: 'm001', starter: true, tutorial: true, selfie: true, title: 'Show Your Face', instruction: 'Selfie, right now, wherever you are: couch, car, servo, vineyard. Show the lads your pre-bucks face.', category: 'photo', difficulty: 1, method: 'photo', points: 20, xp: 50 }),
  m({ id: 'm002', tutorial: true, wall: 'roast', title: 'Roast {name}', instruction: 'One line. Bring receipts: an old haircut, a school fail, a UNSW moment. {name} can bin anything.', category: 'laugh', difficulty: 1, method: 'self', points: 15, xp: 20 }),
  m({ id: 'm003', tutorial: true, wall: 'toast', title: 'Toast {name}', instruction: 'A funny memory, or one thing that makes him a top mate. Funny, heartfelt or both. No speeches.', category: 'cheers', difficulty: 1, method: 'self', points: 15, xp: 20 }),

  // ---------- EASY ONES: quick photos and small wins, doable solo or with one mate ----------
  m({ id: 'e01', title: 'Best View', instruction: 'Snap the best view you can find this weekend. No thumbs in the photo.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e02', retired: true, title: 'Better Face', instruction: 'Selfie with a mate. They have to pull a worse face than you.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e03', retired: true, title: 'Snack Report', instruction: 'Photo of the most questionable snack in the house.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e04', title: 'Candid {name}', instruction: 'Catch {name} mid-laugh. No posing allowed.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'e05', retired: true, title: 'Clink', instruction: 'Close-up of at least three glasses clinking.', category: 'cheers', difficulty: 1, method: 'photo' }),
  m({ id: 'e06', retired: true, title: 'Chef\'s Kiss', instruction: 'Photo of the best-looking plate of food this weekend.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e07', title: 'Mirror Mirror', instruction: 'Mirror selfie with as many lads in it as you can fit.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e08', title: 'Photobomb', instruction: 'Sneak into the background of someone else\'s photo. Get a pic of the result.', category: 'sneaky', difficulty: 1, method: 'photo' }),
  m({ id: 'e09', retired: true, title: 'Shoe Pile', instruction: 'Photo of the pile of shoes at the door. Bonus if one is a thong.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e10', title: 'Creature Cosplay', instruction: 'Recreate your creature\'s pose. Get a mate to snap it.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e11', title: 'Model Material', instruction: 'Snap {name} looking like a model in good light. Make him look unreal.', category: 'chill', difficulty: 1, method: 'photo' }),
  m({ id: 'e12', title: 'Big Rap', instruction: 'Give a mate a proper compliment out loud. Mean it.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'e13', title: 'High Five Streak', instruction: 'High five five different lads in a row.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'e14', retired: true, title: 'Water Break', instruction: 'Smash a full glass of water. Legends hydrate.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'e15', title: 'Absolutely Cooked', instruction: 'Get {name} to say "absolutely cooked" without asking him to say it.', category: 'jezza', difficulty: 1, method: 'self' }),
  m({ id: 'e16', title: 'New Nickname', instruction: 'Give {name} a new nickname and get another lad to use it.', category: 'jezza', difficulty: 1, method: 'witness' }),

  // ---------- JEZZA LORE: childhood mates, UNSW mates and newer mates comparing notes ----------
  m({ id: 'r01', title: 'Old Nickname', instruction: 'Childhood mates: reveal one of {name}\'s old nicknames and the story behind it. {name} can veto.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r02', title: 'Then and Now', instruction: 'Recreate an old photo of {name} (or of you with him) as close as you can. Snap the remake.', category: 'lore', difficulty: 2, method: 'photo' }),
  m({ id: 'r03', title: 'The Era', instruction: 'Name {name}\'s most questionable haircut or fashion era in three words. A mate who was there backs you up.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r04', title: 'Hidden Lore', instruction: 'Tell a funny {name} story at least two lads have never heard. School, UNSW, work, anything. {name} can veto.', category: 'lore', difficulty: 2, method: 'witness' }),
  m({ id: 'r05', title: 'Campus Files', instruction: 'Uni mates: tell the lads {name}\'s finest or worst UNSW moment. Group project, exam week, campus legend.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r06', title: 'Group Assignment', instruction: 'Recreate the classic uni group project: one bloke doing all the work, everyone else "supervising". Photo.', category: 'lore', difficulty: 2, method: 'photo' }),
  m({ id: 'r07', title: 'First Impressions', instruction: 'Get three lads to say their first impression of {name}, then what they reckon now. Old mates vs new.', category: 'lore', difficulty: 2, method: 'witness' }),
  m({ id: 'r08', title: 'Two Worlds', instruction: 'Photo of {name} with a childhood mate on one side and a uni or work mate on the other.', category: 'lore', difficulty: 1, method: 'photo' }),
  m({ id: 'r09', title: 'The Biggest L', instruction: 'Get {name} to tell the lads his biggest harmless fail. He picks the story. React like it\'s breaking news.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r10', title: 'Seemed Smart at the Time', instruction: 'Get {name} to share a decision that seemed brilliant at the time. The group rates it out of ten.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r11', title: 'The Old Photo', instruction: '{name} picks an old photo of himself he\'s happy to show. Snap the lads\' faces while he tells the backstory.', category: 'lore', difficulty: 1, method: 'photo' }),
  m({ id: 'r12', title: 'Most {name} Thing Ever', instruction: 'Get three lads to each name the most {name} thing he\'s ever done. {name} picks the winner.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r13', title: 'Two Truths and a Lie', instruction: 'Get {name} to tell two truths and a lie about himself. Pick the lie and you claim it.', category: 'lore', difficulty: 2, method: 'witness' }),
  m({ id: 'r14', title: 'Worst Excuse', instruction: 'Get {name} to reveal the worst excuse he\'s ever used to get out of something. The lads rate it.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r15', title: 'Greatest Fail', instruction: 'A childhood mate and a uni mate each pitch {name}\'s greatest harmless fail. {name} picks the winner.', category: 'lore', difficulty: 2, method: 'witness' }),
  m({ id: 'r16', title: '{name} Quiz', instruction: 'Quiz three lads on {name}: middle name, first car, usual order. Read out the scores. {name} settles disputes.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),

  // ---------- THE LADS' LIST: get {name} (or a mate) to do something ----------
  m({ id: 'n01', title: '{name} Vision', instruction: 'Get {name} to let you wear his glasses for two minutes. Photo of you looking smarter than ever.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'n02', title: 'Bartender', instruction: 'Convince someone to make you a drink. Any drink counts.', category: 'chill', difficulty: 1, method: 'witness' }),
  m({ id: 'n03', title: '{name} Sings', instruction: 'Get {name} to sing a song. A full chorus counts.', category: 'jezza', difficulty: 2, method: 'witness' }),
  m({ id: 'n04', title: 'Speech!', instruction: 'Convince {name} to give an impromptu speech. No notice, no notes.', category: 'jezza', difficulty: 2, method: 'witness' }),
  m({ id: 'n05', title: 'Animal Instinct', instruction: 'Get {name} to make an animal sound. Your choice of animal.', category: 'jezza', difficulty: 1, method: 'witness' }),
  m({ id: 'n06', title: 'Drop and Give Me Ten', instruction: 'Get someone to do ten push-ups. Proper ones.', category: 'chill', difficulty: 1, method: 'witness' }),
  m({ id: 'n07', title: 'Fit Check', instruction: 'Get someone to compliment your outfit without you asking for it.', category: 'chill', difficulty: 1, method: 'witness' }),
  m({ id: 'n08', title: 'Spill It', instruction: 'Get a mate to reveal an embarrassing story. Their call what they share.', category: 'chill', difficulty: 2, method: 'witness' }),
  m({ id: 'n09', title: 'Peg Him', instruction: 'Clip as many clothes pegs on {name} as you can before he notices. Photo, and put the count in the caption.', category: 'jezza', difficulty: 2, method: 'photo' }),
  m({ id: 'n10', title: 'Arm Wrestle', instruction: 'Get someone to challenge you to an arm wrestle. They have to ask, not you.', category: 'chill', difficulty: 1, method: 'witness' }),
  m({ id: 'n11', title: 'Google That', instruction: 'Get someone to Google something ridiculous. The more ridiculous, the better.', category: 'sneaky', difficulty: 1, method: 'witness' }),
  m({ id: 'n12', title: 'Love You, Mate', instruction: 'Get {name} to say "I love you" to another lad.', category: 'jezza', difficulty: 2, method: 'witness' }),
  m({ id: 'n13', title: 'No Questions Asked', instruction: 'Get five people into a group photo without telling them why.', category: 'photo', difficulty: 2, method: 'photo' }),
  // ---------- Not a challenge: just post a photo ----------
  m({ id: 'f01', theme: 'any', free: true, title: 'Photo Drop', instruction: 'Anything funny or cool. No challenge needed, no vote, straight to the camera roll.', category: 'photo', difficulty: 1, method: 'photo', points: 5, xp: 10 }),
  m({ id: 'n14', title: 'Get the Boys Online', instruction: 'Selfie with at least three lads in it, everyone looking fired up for the weekend.', category: 'photo', difficulty: 1, method: 'photo' }),

  // ---------- MAKE JEZZA LAUGH ----------
  m({ id: 'l01', title: 'Crack Him Up', instruction: 'Make {name} genuinely crack up. A joke, a face, a story: whatever works, one on one.', category: 'laugh', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'l02', title: 'Worst Joke of the Weekend', instruction: 'Tell {name} the worst dad joke you know. Bonus respect if it\'s so bad he laughs anyway.', category: 'laugh', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'l03', title: 'Doing a {name}', instruction: 'Get someone to do their best {name} impression. {name} scores it out of ten.', category: 'laugh', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'l04', title: 'Hype Man', instruction: 'Next time {name} tells a story, react like it\'s the best yarn you\'ve ever heard. He has to notice.', category: 'laugh', difficulty: 1, method: 'witness' }),
  m({ id: 'l05', title: 'Laugh-Off', instruction: 'You and a mate each get one go at making {name} laugh. He picks the winner, the winner claims it.', category: 'laugh', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'l06', retired: true, title: 'Useless Magic Trick', instruction: 'Show {name} the most useless magic trick you\'ve got, then act like you\'ve just changed his life.', category: 'laugh', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'l07', title: 'The Callback', instruction: 'Bring back something dumb that actually happened earlier this weekend and make {name} laugh about it again.', category: 'laugh', difficulty: 2, method: 'witness' }),
  m({ id: 'l08', title: 'Weirdly Specific Compliment', instruction: 'Give {name} a weirdly specific compliment. "Your elbows have great energy" sort of thing.', category: 'laugh', difficulty: 1, method: 'witness' }),
  m({ id: 'l09', title: 'One-Line Roast', instruction: 'One line, to {name}\'s face. If he laughs, it counts.', category: 'laugh', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'l10', title: 'Staring Contest', instruction: 'Ten-second staring contest with {name}. Get a mate to snap the exact moment someone cracks.', category: 'laugh', difficulty: 1, method: 'photo' }),
  m({ id: 'l11', title: 'Slow Clap', instruction: 'Start a slow clap for something dead boring. Get three lads to join in.', category: 'laugh', difficulty: 2, method: 'self', loud: true }),
  m({ id: 'l12', title: 'Copy His Face', instruction: 'Copy {name}\'s exact expression, deadpan, until he cracks. Side-by-side photo of the two faces.', category: 'laugh', difficulty: 1, method: 'photo' }),

  // ---------- DANCE ----------
  m({ id: 'd01', retired: true, title: 'Ripper Dance', instruction: 'Give {name} your most cooked 15-second dance. No warm-up. Full commitment.', category: 'dance', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'd02', retired: true, title: 'Worst Dancer Alive', instruction: 'Show {name} your worst moves. Anything you\'re actually good at is banned.', category: 'dance', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'd03', retired: true, title: 'Dance-Off', instruction: 'Call out a mate for a 15-second dance-off. {name} picks the winner. Winner claims, loser gets respect.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd04', retired: true, title: 'Dad at a Wedding', instruction: 'Ten seconds of your best dad-at-a-wedding dance. Finger guns optional but encouraged.', category: 'dance', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'd05', retired: true, title: 'Backup Dancer', instruction: 'Be {name}\'s way-too-keen backup dancer for ten seconds. He doesn\'t even have to be dancing.', category: 'dance', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'd06', retired: true, title: 'In Sync', instruction: 'Get two mates to pull the exact same dance move at the exact same time.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd07', retired: true, title: 'Victory Dance', instruction: 'Massive victory dance for something completely boring, like finding your phone. Snap the peak of it.', category: 'dance', difficulty: 1, method: 'photo', loud: true }),
  m({ id: 'd08', retired: true, title: 'Sorry, Through Dance', instruction: 'Dance an apology to {name} for something tiny. No words allowed.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd09', retired: true, title: '{name} Picks the Song', instruction: '{name} picks any song. You\'ve got 15 seconds to dance to it like your life depends on it.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd10', retired: true, title: 'Dance Judge', instruction: 'Get two mates to dance for {name}, then score them out of ten like a brutal reality TV judge.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd11', retired: true, title: 'Backup Crew', instruction: 'Get two mates to be {name}\'s backup dancers for a full chorus. Total commitment, zero rehearsal.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),

  // ---------- SING ----------
  m({ id: 's01', retired: true, title: 'Song Dedication', instruction: 'Sing a chorus straight to {name} like you wrote it for him. Eye contact the whole time.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 's02', retired: true, title: 'Terrible Karaoke', instruction: 'Sing ten seconds of any song as badly as humanly possible.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 's03', retired: true, title: 'Backup Vocals', instruction: 'Sing to {name} while a mate does the most over-the-top backup vocals they can.', category: 'sing', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 's04', retired: true, title: 'Boy Band', instruction: 'Get two mates to sing the same chorus with you. Harmonies optional. Confidence mandatory.', category: 'sing', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 's05', retired: true, title: '{name} Chant', instruction: 'Make up a chant about {name} and get at least one mate to join in.', category: 'sing', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 's06', retired: true, title: 'Grand Final Anthem', instruction: 'Sing one line of any song like it\'s the anthem before the grand final. Hand on heart.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 's07', retired: true, title: 'Duet', instruction: 'Sing a chorus with a mate. The worse the harmonies, the better.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 's08', retired: true, title: 'Power Ballad', instruction: 'Sing {name} one chorus with way too much emotion. Eyes shut, fist clenched, one tear optional.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),

  // ---------- COOKED PHOTOS ----------
  m({ id: 'p01', title: 'Most Cooked Selfie', instruction: 'Convince {name} to take a selfie with you. The more cooked, the better.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p02', title: 'Identical Idiots', instruction: 'Get three mates to pull the exact same face in one photo.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p03', title: 'Pyramid of Lads', instruction: 'Pyramid-shaped group photo: back row standing, middle row squatting, front row sitting. Nobody climbs on anyone.', category: 'photo', difficulty: 3, method: 'photo' }),
  m({ id: 'p04', title: '{name} Is King', instruction: 'Everyone poses around {name} like he\'s royalty. The more over the top, the better.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p05', title: 'Human Arrow', instruction: 'Line the lads up into an arrow pointing straight at {name}.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p06', retired: true, title: 'Everyone Different', instruction: 'Group photo where every single person pulls a different stupid pose.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p07', retired: true, title: 'The Lean', instruction: 'Everyone leans the same way like gravity\'s given up. Feet stay on the ground.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p08', title: 'Worst Album Cover', instruction: 'Three or more lads pose for the world\'s worst album cover. Put the band name in the note.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p09', title: 'Olympic Gold', instruction: 'Photo of {name} celebrating something completely ordinary like he\'s just won gold.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p10', title: 'Copycat Chain', instruction: 'Copy {name}\'s pose exactly, then get two mates to copy you both. Photo of the lot.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p11', title: 'Statues', instruction: 'Everyone freezes in a different ridiculous pose. One photo.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p12', retired: true, title: 'Fitness Influencers', instruction: 'Fake gym photo with the lads. Flex, point, pretend. Nobody actually works out.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p13', retired: true, title: 'The Point', instruction: 'Get four or more mates pointing dramatically at something completely boring.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p14', title: 'Lads Calendar', instruction: 'Group photo where everyone pulls their most overconfident calendar pose.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p15', title: 'Bodyguards', instruction: 'Two mates pose as dead-serious bodyguards either side of {name}.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p16', title: 'Cursed Family Portrait', instruction: 'Fake family portrait. Everyone pulls a different cursed expression.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p17', retired: true, title: 'Wombat Squad', instruction: 'Everyone gets low in a comfy squat for a group photo. Lower is better, as long as nobody\'s knees complain.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p19', title: 'Reaction Shot', instruction: 'Snap the lads\' faces the exact second a roast lands or a story drops.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p20', title: 'Caption This', instruction: 'Snap something this weekend that needs no explanation. Best caption goes in the note.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p21', title: 'Twinning', instruction: 'Spot two lads accidentally dressed the same. Photo of them posing like it was planned.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p22', title: 'Formal Photo', instruction: 'Recreate an awkward school formal photo with a mate. Stiff arms, forced smiles, the lot.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p18', title: 'Grand Final Winners', instruction: 'Group photo of everyone celebrating like you just won the grand final. {name} holds the imaginary cup.', category: 'photo', difficulty: 2, method: 'photo' }),

  // ---------- GET JEZZA IN ----------
  m({ id: 'j01', retired: true, title: '{name} Joins In', instruction: 'Get {name} into your most ridiculous group pose.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'j02', title: '{name} Picks', instruction: 'Give {name} two stupid (harmless) options for what you do next. Do whichever he picks.', category: 'jezza', difficulty: 1, method: 'witness' }),
  m({ id: 'j03', title: 'Groom\'s Award', instruction: 'Present {name} a made-up award for something he actually did this weekend. Ten-second speech. Photo of the handover.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'j04', retired: true, title: 'Team Celebration', instruction: 'Get {name} and two mates into a full team celebration pose.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'j05', retired: true, title: 'Chant Leader', instruction: 'Get three mates chanting something about the weekend with {name}. Five seconds is plenty.', category: 'jezza', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'j06', title: '{name}\'s Best Side', instruction: 'Ask {name} for his best pose, then get the lads to copy it. Photo.', category: 'jezza', difficulty: 2, method: 'photo' }),
  m({ id: 'j07', title: 'Secret Handshake', instruction: 'Invent a ridiculously complicated handshake with {name} and nail it twice. Photo mid-handshake.', category: 'jezza', difficulty: 2, method: 'photo' }),
  m({ id: 'j08', retired: true, title: 'Odd One Out', instruction: 'Find two mates wearing similar colours and take a photo with {name} as the odd one out.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'j09', title: 'Fan Club', instruction: 'Get three mates to pose as {name}\'s way-too-keen fan club.', category: 'jezza', difficulty: 2, method: 'photo' }),
  m({ id: 'j10', retired: true, title: 'Groom\'s Choice', instruction: 'Offer {name} three options: joke, song or dance. Do whichever one he picks.', category: 'jezza', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'j11', title: 'Marriage Advice', instruction: 'Ask {name} for his best marriage advice so far. Nod like it\'s the wisest thing you\'ve ever heard.', category: 'jezza', difficulty: 1, method: 'self' }),

  // ---------- CHEERS (any drink counts, nobody has to drink) ----------
  m({ id: 'c01', title: 'Cheers with {name}', instruction: 'Clink glasses with {name} and get a funny photo of it. Any drink counts.', category: 'cheers', difficulty: 1, method: 'photo' }),
  m({ id: 'c02', retired: true, title: 'Ten-Second Toast', instruction: 'Give {name} a ten-second toast. Heartfelt, ridiculous, or both.', category: 'cheers', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'c03', title: 'Cheers Crew', instruction: 'Get three mates and {name} into a group cheers photo.', category: 'cheers', difficulty: 2, method: 'photo' }),
  m({ id: 'c04', title: 'Drink Review', instruction: 'Review whatever you\'re drinking like an overconfident food critic. No need to finish it.', category: 'cheers', difficulty: 1, method: 'witness' }),
  m({ id: 'c05', title: 'Mocktail Champion', instruction: 'Toast with a non-alcoholic drink like you\'re accepting a world title. Snap the acceptance.', category: 'cheers', difficulty: 1, method: 'photo' }),
  m({ id: 'c06', title: 'Signature Cheers', instruction: 'Invent your own cheers move and get a mate to do it with you. Photo of the move.', category: 'cheers', difficulty: 1, method: 'photo' }),
  m({ id: 'c07', title: 'Cheers Round', instruction: 'Clink with five different lads in the next ten minutes. Clink, nod, move on.', category: 'cheers', difficulty: 1, method: 'self' }),
  m({ id: 'c08', title: 'Absent Mates', instruction: 'Raise a glass to a mate who couldn\'t make it and send them the photo.', category: 'cheers', difficulty: 1, method: 'photo' }),
  m({ id: 'c09', retired: true, title: 'Synchronised Cheers', instruction: 'Get four lads to pull the exact same cheers pose in one photo. Any drink counts.', category: 'cheers', difficulty: 2, method: 'photo' }),
  m({ id: 'c10', title: 'Historic Toast', instruction: 'Glass up, one line: "On this day, a legend..." Finish it about {name}. No speech needed.', category: 'cheers', difficulty: 2, method: 'witness', loud: true }),

  // ---------- SNEAKY (only you can see these) ----------
  m({ id: 'x01', secret: true, title: 'Plant a Word', instruction: 'Get {name} to say "wedding" without him knowing it\'s a mission.', category: 'sneaky', difficulty: 2, method: 'self' }),
  m({ id: 'x02', secret: true, title: 'Copycat', instruction: 'Copy everything a mate does for a minute until they notice. Then act innocent.', category: 'sneaky', difficulty: 1, method: 'self' }),
  m({ id: 'x03', secret: true, title: 'The Echo', instruction: 'Repeat the last two words {name} says, three times in a row, without him clocking it.', category: 'sneaky', difficulty: 2, method: 'self' }),
  m({ id: 'x04', retired: true, secret: true, title: 'Nickname Launch', instruction: 'Give a mate a new nickname and get two other lads using it within 20 minutes.', category: 'sneaky', difficulty: 3, method: 'self' }),
  m({ id: 'x05', retired: true, secret: true, title: 'Photobomb', instruction: 'Sneak into the background of three different photos tonight. Nobody can notice until later.', category: 'sneaky', difficulty: 2, method: 'self' }),

  // ---------- LOW-KEY (no performing, no camera) ----------
  m({ id: 'q01', title: 'Handshake Ratings', instruction: 'Rate three mates\' handshakes out of ten and tell them their score. Feedback encouraged.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q02', title: 'Quote of the Night', instruction: 'Grab the funniest thing someone\'s said tonight and read it back to the group.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q03', title: 'Sequel', instruction: 'Get someone to tell you the same story twice. Yell "SEQUEL" when they do.', category: 'chill', difficulty: 2, method: 'self' }),
  m({ id: 'q04', title: 'Phone Rescue', instruction: 'Catch a mate doom-scrolling while the boys are talking and drag them back into the yarn.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q05', title: 'How\'d You Meet?', instruction: 'Ask {name} how he met his partner. Only interrupt to say "no way".', category: 'chill', difficulty: 1, method: 'self', phase: 'friday' }),
  m({ id: 'q06', retired: true, title: 'Snack Delivery', instruction: 'Bring a mate a snack they didn\'t ask for. Hand it over like it\'s a trophy.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q07', title: 'Cooked Counter', instruction: 'Count how many times someone says "cooked" in 15 minutes. Announce the total.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q08', retired: true, title: 'Group Chat Banger', instruction: 'Take one genuinely good photo of the view or the venue for the group chat.', category: 'chill', difficulty: 1, method: 'photo' }),
  m({ id: 'q09', title: 'Wingman', instruction: 'Hype up a mate\'s average joke until the whole group laughs.', category: 'chill', difficulty: 2, method: 'self' }),
  m({ id: 'q10', title: 'Lookalikes', instruction: 'Tell three mates which celebrity they look like. Photo of the best one doing the celebrity\'s pose.', category: 'chill', difficulty: 1, method: 'photo' }),

  // ---------- GROUP (go live on their own every so often; optional) ----------
  m({ id: 'g01', title: 'The Big Cheers', instruction: 'Everyone raises a drink at once and yells "CHEERS {name}". Any drink counts. One photo.', category: 'group', difficulty: 1, method: 'photo', scope: 'group', points: 15, xp: 30 }),
  m({ id: 'g02', title: 'Creature Parade', instruction: 'Everyone holds up their phone showing their creature for one massive group photo.', category: 'group', difficulty: 2, method: 'photo', scope: 'group', points: 25, xp: 40 }),
  m({ id: 'g03', title: 'Silent Minute', instruction: 'The whole group stays dead silent for one minute. First to crack does their best {name} impression. Everyone else claims.', category: 'group', difficulty: 2, method: 'self', scope: 'group', points: 20, xp: 30 }),
  m({ id: 'g04', title: 'The Wave', instruction: 'Do a Mexican wave with the whole group for {name}. Snap the best moment.', category: 'group', difficulty: 1, method: 'photo', scope: 'group', points: 15, xp: 30 }),
  m({ id: 'g05', title: 'Sunset Salute', instruction: 'Everyone outside, drinks up, one massive "CHEERS {name}" at the sky. Photo.', category: 'group', difficulty: 1, method: 'photo', scope: 'group', phase: 'saturday', points: 20, xp: 35 }),
  m({ id: 'g06', title: 'Squad Goals', instruction: 'Pull the most dramatic group pose you can think of. Everyone in, {name} in the middle.', category: 'group', difficulty: 2, method: 'photo', scope: 'group', points: 25, xp: 40 }),

  // ---------- BIRTHDAY DECK (wholesome, mixed crowd, four hours) ----------
  m({ id: 'b001', theme: 'birthday', starter: true, tutorial: true, selfie: true, title: 'Show Your Face', instruction: 'Selfie, right now: show everyone your party face.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'b002', theme: 'birthday', tutorial: true, wall: 'toast', title: 'Write in the Birthday Book', instruction: 'Something genuine for {name}: a memory, a thank-you, what {he} means to you. {name} reads the book at the end.', category: 'cheers', difficulty: 1, method: 'self' }),
  m({ id: 'b010', theme: 'birthday', title: 'New Face', instruction: 'Selfie with someone you met for the first time today. Caption it with their name.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'b011', theme: 'birthday', title: 'Table Hop', instruction: 'Sit with a different group for five minutes. Photo as proof.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'b012', theme: 'birthday', title: 'Three Strangers', instruction: 'A photo of three people who had never met before today.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'b013', theme: 'birthday', title: 'The Origin Story', instruction: 'Find out how someone here first met {name}. Post the story in one line.', category: 'lore', difficulty: 1, method: 'self' }),
  m({ id: 'b014', theme: 'birthday', title: 'Family First', instruction: 'A photo with a member of {name}\'s family. Introduce yourself properly first.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'b015', theme: 'birthday', title: 'Say It Out Loud', instruction: 'Tell {name} one thing you genuinely admire about {him}. To {his} face.', category: 'jezza', difficulty: 1, method: 'self' }),
  m({ id: 'b016', theme: 'birthday', title: 'Watermelon Moment', instruction: 'Photo of {name} with watermelon. Any watermelon. A drawing counts.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'b017', theme: 'birthday', title: 'Teacher\'s Pet', instruction: 'Get {name} to give you a gold star. Photo of the star.', category: 'jezza', difficulty: 2, method: 'photo' }),
  m({ id: 'b018', theme: 'birthday', title: 'Make {name} Laugh', instruction: 'A proper laugh, not a polite one. Someone else confirms it happened.', category: 'laugh', difficulty: 2, method: 'witness' }),
  m({ id: 'b019', theme: 'birthday', title: 'Jump Shot', instruction: 'A photo of someone mid-jump. The higher the better.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'b020', theme: 'birthday', title: 'Rally', instruction: 'Ten hits of anything back and forth with someone from another group: badminton, a balloon, a scrunched napkin.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'b021', theme: 'birthday', title: 'Free Throw', instruction: 'Land anything in anything from two metres: a grape in a cup, a cap in a bin. Photo of the setup.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'b022', theme: 'birthday', title: 'Then and Now', instruction: 'Recreate an old photo of {name} with whoever is in it. Post the new one.', category: 'lore', difficulty: 2, method: 'photo' }),
  m({ id: 'b023', theme: 'birthday', title: 'Thirty Facts', instruction: 'Learn one thing about {name} you didn\'t know, from someone who has known {him} longest. Post it.', category: 'lore', difficulty: 1, method: 'self' }),
  m({ id: 'b024', theme: 'birthday', title: 'The Toast', instruction: 'Raise a glass of anything to {name} with at least four people and say why. Photo.', category: 'cheers', difficulty: 1, method: 'photo' }),
  m({ id: 'b025', theme: 'birthday', title: 'Group Photo Captain', instruction: 'Organise a photo of every single person here. Yes, everyone.', category: 'photo', difficulty: 3, method: 'photo' }),
  m({ id: 'b026', theme: 'birthday', title: 'Learn a Word', instruction: 'Learn one word or phrase in a language someone here speaks at home. Say it to {name}.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'b027', theme: 'birthday', title: 'Dessert Critic', instruction: 'Photo of the cake or dessert with a one-line review. Be generous.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'b028', theme: 'birthday', title: 'Birthday Card Face', instruction: 'A photo of you doing your best impression of {name}. {name} rates it.', category: 'laugh', difficulty: 2, method: 'photo' }),
  m({ id: 'b029', theme: 'birthday', title: 'Compliment Chain', instruction: 'Give a genuine compliment to someone you don\'t know. They have to pass one on. Report back.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'b030', theme: 'birthday', title: 'Secret Admirer', instruction: 'Get into the background of two other people\'s photos without them noticing.', category: 'sneaky', difficulty: 2, method: 'self', secret: true }),
  m({ id: 'b031', theme: 'birthday', title: 'Team Colours', instruction: 'Find something {name}\'s favourite colour and wear it for the rest of the party. Photo.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'b032', theme: 'birthday', title: 'The Handshake', instruction: 'Invent a secret handshake with someone from another friend group. Demonstrate it to {name}.', category: 'laugh', difficulty: 2, method: 'witness' }),
  m({ id: 'b033', theme: 'birthday', title: 'Number Thirty', instruction: 'A photo with the number 30 made out of anything: people, cutlery, grapes.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'b034', theme: 'birthday', title: 'Playlist Pick', instruction: 'Get a song {name} loves playing in the room. Confirm it with someone who heard it.', category: 'chill', difficulty: 1, method: 'witness' }),
  m({ id: 'b035', theme: 'birthday', title: 'Kids\' Table', instruction: 'If there are kids here, get one to draw {name}. Photo of the masterpiece.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'b036', theme: 'birthday', title: 'Coach\'s Call', instruction: 'Ask {name} for {his} best sporting advice and act it out. Someone confirms.', category: 'jezza', difficulty: 2, method: 'witness' }),
  m({ id: 'b037', theme: 'birthday', title: 'Dressed as {name}', instruction: 'Full-length photo of your {name} costume next to the real {name}. Same pose.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'b038', theme: 'birthday', title: 'Spot the Difference', instruction: 'Photo of two {name}s who went for completely different eras of {name}.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'b039', theme: 'birthday', title: 'Signature Move', instruction: 'Do {name}\'s signature move or saying in costume. {name} has to agree it was accurate.', category: 'laugh', difficulty: 2, method: 'witness' }),
  m({ id: 'b040', theme: 'birthday', scope: 'group', title: 'The Big Cheer', instruction: 'Everyone in the room cheers {name}\'s name together, loud enough for next door.', category: 'group', difficulty: 2, method: 'photo' }),
  m({ id: 'b042', theme: 'birthday', scope: 'group', title: 'Thirty {name}s', instruction: 'Every {name} in the room in one photo, real one in the middle. Caption it with the count.', category: 'group', difficulty: 2, method: 'photo' }),
  m({ id: 'b041', theme: 'birthday', scope: 'group', title: 'Human Watermelon', instruction: 'As many people as possible in green and pink, arranged as a slice. Photo from above if you can.', category: 'group', difficulty: 3, method: 'photo' }),
];

export const MISSION_BY_ID: Record<string, Mission> = Object.fromEntries(MISSIONS.map((x) => [x.id, x]));
export const STARTER_MISSION = MISSIONS.find((x) => x.starter)!;
/** The intro for a deck: the selfie first, then the wall post(s). */
export const tutorialFor = (deck: 'bucks' | 'birthday') => MISSIONS.filter((x) => x.tutorial && (x.theme ?? 'bucks') === deck);
export const starterFor = (deck: 'bucks' | 'birthday') => MISSIONS.find((x) => x.starter && (x.theme ?? 'bucks') === deck)!;
export const inDeck = (m: Mission, deck: 'bucks' | 'birthday') => m.theme === 'any' || (m.theme ?? 'bucks') === deck;
/** The intro: your selfie, roast, toast. New players are dealt all three (the groom just the selfie). */
export const TUTORIAL_MISSIONS = MISSIONS.filter((x) => x.tutorial);
export const TUTORIAL_IDS = new Set(TUTORIAL_MISSIONS.map((x) => x.id));
/** Everything that can still be dealt. */
export const ACTIVE_MISSIONS = MISSIONS.filter((x) => !x.retired);
export const GROUP_MISSIONS = MISSIONS.filter((x) => x.scope === 'group' && !x.retired);

/** Rookie boost: your first 3 challenges after the intro are easy, give double XP, count straight away and skip the honour cooldown. */
export const ROOKIE_BOOST = 3;
export const rookieLeft = (completedIds: readonly string[]) => Math.max(0, ROOKIE_BOOST - completedIds.filter((id) => !TUTORIAL_IDS.has(id)).length);

export function missionAvailableInPhase(mission: Mission, phase: 'friday' | 'saturday'): boolean {
  return mission.phase === 'any' || mission.phase === phase;
}

export const METHOD_META: Record<CompletionMethod, { label: string; cta: string; hint: string }> = {
  self:    { label: 'Just tap it', cta: 'I DID IT', hint: 'Tap when it\'s done. The lads will know if you\'re lying.' },
  photo:   { label: 'Needs a photo', cta: 'SNAP IT', hint: 'Take a photo or pick one from your library. The lads vote it in (or the host checks it, if they\'ve set that).' },
  witness: { label: 'A mate confirms', cta: 'I DID IT', hint: 'Pick a mate who was there. They tap yes on their phone.' },
  host:    { label: 'Host checks it', cta: 'I DID IT', hint: 'The host decides.' },
};

export const REWARD_QUIPS = [
  'Absolute scenes.', '{name} will remember that. Unfortunately.', 'Cooked. Beautifully cooked.', 'The lads are proud. Probably.',
  'That\'s going in the speech.', 'Ripper effort.', 'Unreal. Do it again.', 'Certified legend behaviour.', 'No notes.',
  'Questionable. Points anyway.', 'Main character energy.', 'Mum would be proud. Don\'t tell her.',
];
