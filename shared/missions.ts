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
  wall?: 'roast' | 'toast'; // done by posting to the Jezza Wall
  retired?: boolean; // no longer dealt; kept so old completions, claims and feed posts still resolve
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
  lore:   { label: 'Jezza Lore',       emoji: '📜', hue: '#9AD0EC' },
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
  m({ id: 'm002', tutorial: true, wall: 'roast', title: 'Roast Jezza', instruction: 'One line. Bring receipts: an old haircut, a school fail, a UNSW moment. Jezza can bin anything.', category: 'laugh', difficulty: 1, method: 'self', points: 15, xp: 20 }),
  m({ id: 'm003', tutorial: true, wall: 'toast', title: 'Toast Jezza', instruction: 'A funny memory, or one thing that makes him a top mate. Funny, heartfelt or both. No speeches.', category: 'cheers', difficulty: 1, method: 'self', points: 15, xp: 20 }),

  // ---------- EASY ONES: quick photos and small wins, doable solo or with one mate ----------
  m({ id: 'e01', title: 'Best View', instruction: 'Snap the best view you can find this weekend. No thumbs in the photo.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e02', retired: true, title: 'Better Face', instruction: 'Selfie with a mate. They have to pull a worse face than you.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e03', retired: true, title: 'Snack Report', instruction: 'Photo of the most questionable snack in the house.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e04', title: 'Candid Jezza', instruction: 'Catch Jezza mid-laugh. No posing allowed.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'e05', retired: true, title: 'Clink', instruction: 'Close-up of at least three glasses clinking.', category: 'cheers', difficulty: 1, method: 'photo' }),
  m({ id: 'e06', retired: true, title: 'Chef\'s Kiss', instruction: 'Photo of the best-looking plate of food this weekend.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e07', title: 'Mirror Mirror', instruction: 'Mirror selfie with as many lads in it as you can fit.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e08', title: 'Photobomb', instruction: 'Sneak into the background of someone else\'s photo. Get a pic of the result.', category: 'sneaky', difficulty: 1, method: 'photo' }),
  m({ id: 'e09', retired: true, title: 'Shoe Pile', instruction: 'Photo of the pile of shoes at the door. Bonus if one is a thong.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e10', title: 'Creature Cosplay', instruction: 'Recreate your creature\'s pose. Get a mate to snap it.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'e11', title: 'Model Material', instruction: 'Snap Jezza looking like a model in good light. Make him look unreal.', category: 'chill', difficulty: 1, method: 'photo' }),
  m({ id: 'e12', title: 'Big Rap', instruction: 'Give a mate a proper compliment out loud. Mean it.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'e13', title: 'High Five Streak', instruction: 'High five five different lads in a row.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'e14', retired: true, title: 'Water Break', instruction: 'Smash a full glass of water. Legends hydrate.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'e15', title: 'Absolutely Cooked', instruction: 'Get Jezza to say "absolutely cooked" without asking him to say it.', category: 'jezza', difficulty: 1, method: 'self' }),
  m({ id: 'e16', title: 'New Nickname', instruction: 'Give Jezza a new nickname and get another lad to use it.', category: 'jezza', difficulty: 1, method: 'witness' }),

  // ---------- JEZZA LORE: childhood mates, UNSW mates and newer mates comparing notes ----------
  m({ id: 'r01', title: 'Old Nickname', instruction: 'Childhood mates: reveal one of Jezza\'s old nicknames and the story behind it. Jezza can veto.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r02', title: 'Then and Now', instruction: 'Recreate an old photo of Jezza (or of you with him) as close as you can. Snap the remake.', category: 'lore', difficulty: 2, method: 'photo' }),
  m({ id: 'r03', title: 'The Era', instruction: 'Name Jezza\'s most questionable haircut or fashion era in three words. A mate who was there backs you up.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r04', title: 'Hidden Lore', instruction: 'Tell a funny Jezza story at least two lads have never heard. School, UNSW, work, anything. Jezza can veto.', category: 'lore', difficulty: 2, method: 'witness' }),
  m({ id: 'r05', title: 'Campus Files', instruction: 'Uni mates: tell the lads Jezza\'s finest or worst UNSW moment. Group project, exam week, campus legend.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r06', title: 'Group Assignment', instruction: 'Recreate the classic uni group project: one bloke doing all the work, everyone else "supervising". Photo.', category: 'lore', difficulty: 2, method: 'photo' }),
  m({ id: 'r07', title: 'First Impressions', instruction: 'Get three lads to say their first impression of Jezza, then what they reckon now. Old mates vs new.', category: 'lore', difficulty: 2, method: 'witness' }),
  m({ id: 'r08', title: 'Two Worlds', instruction: 'Photo of Jezza with a childhood mate on one side and a uni or work mate on the other.', category: 'lore', difficulty: 1, method: 'photo' }),
  m({ id: 'r09', title: 'The Biggest L', instruction: 'Get Jezza to tell the lads his biggest harmless fail. He picks the story. React like it\'s breaking news.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r10', title: 'Seemed Smart at the Time', instruction: 'Get Jezza to share a decision that seemed brilliant at the time. The group rates it out of ten.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r11', title: 'The Old Photo', instruction: 'Jezza picks an old photo of himself he\'s happy to show. Snap the lads\' faces while he tells the backstory.', category: 'lore', difficulty: 1, method: 'photo' }),
  m({ id: 'r12', title: 'Most Jezza Thing Ever', instruction: 'Get three lads to each name the most Jezza thing he\'s ever done. Jezza picks the winner.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r13', title: 'Two Truths and a Lie', instruction: 'Get Jezza to tell two truths and a lie about himself. Pick the lie and you claim it.', category: 'lore', difficulty: 2, method: 'witness' }),
  m({ id: 'r14', title: 'Worst Excuse', instruction: 'Get Jezza to reveal the worst excuse he\'s ever used to get out of something. The lads rate it.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),
  m({ id: 'r15', title: 'Greatest Fail', instruction: 'A childhood mate and a uni mate each pitch Jezza\'s greatest harmless fail. Jezza picks the winner.', category: 'lore', difficulty: 2, method: 'witness' }),
  m({ id: 'r16', title: 'Jezza Quiz', instruction: 'Quiz three lads on Jezza: middle name, first car, usual order. Read out the scores. Jezza settles disputes.', category: 'lore', difficulty: 1, method: 'witness', points: 15, xp: 30 }),

  // ---------- THE LADS' LIST: get Jezza (or a mate) to do something ----------
  m({ id: 'n01', title: 'Jezza Vision', instruction: 'Get Jezza to let you wear his glasses for two minutes. Photo of you looking smarter than ever.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'n02', title: 'Bartender', instruction: 'Convince someone to make you a drink. Any drink counts.', category: 'chill', difficulty: 1, method: 'witness' }),
  m({ id: 'n03', title: 'Jezza Sings', instruction: 'Get Jezza to sing a song. A full chorus counts.', category: 'jezza', difficulty: 2, method: 'witness' }),
  m({ id: 'n04', title: 'Speech!', instruction: 'Convince Jezza to give an impromptu speech. No notice, no notes.', category: 'jezza', difficulty: 2, method: 'witness' }),
  m({ id: 'n05', title: 'Animal Instinct', instruction: 'Get Jezza to make an animal sound. Your choice of animal.', category: 'jezza', difficulty: 1, method: 'witness' }),
  m({ id: 'n06', title: 'Drop and Give Me Ten', instruction: 'Get someone to do ten push-ups. Proper ones.', category: 'chill', difficulty: 1, method: 'witness' }),
  m({ id: 'n07', title: 'Fit Check', instruction: 'Get someone to compliment your outfit without you asking for it.', category: 'chill', difficulty: 1, method: 'witness' }),
  m({ id: 'n08', title: 'Spill It', instruction: 'Get a mate to reveal an embarrassing story. Their call what they share.', category: 'chill', difficulty: 2, method: 'witness' }),
  m({ id: 'n09', title: 'Peg Him', instruction: 'Clip as many clothes pegs on Jezza as you can before he notices. Photo, and put the count in the caption.', category: 'jezza', difficulty: 2, method: 'photo' }),
  m({ id: 'n10', title: 'Arm Wrestle', instruction: 'Get someone to challenge you to an arm wrestle. They have to ask, not you.', category: 'chill', difficulty: 1, method: 'witness' }),
  m({ id: 'n11', title: 'Google That', instruction: 'Get someone to Google something ridiculous. The more ridiculous, the better.', category: 'sneaky', difficulty: 1, method: 'witness' }),
  m({ id: 'n12', title: 'Love You, Mate', instruction: 'Get Jezza to say "I love you" to another lad.', category: 'jezza', difficulty: 2, method: 'witness' }),
  m({ id: 'n13', title: 'No Questions Asked', instruction: 'Get five people into a group photo without telling them why.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'n14', title: 'Get the Boys Online', instruction: 'Selfie with at least three lads in it, everyone looking fired up for the weekend.', category: 'photo', difficulty: 1, method: 'photo' }),

  // ---------- MAKE JEZZA LAUGH ----------
  m({ id: 'l01', title: 'Crack Him Up', instruction: 'Make Jezza genuinely crack up. A joke, a face, a story: whatever works, one on one.', category: 'laugh', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'l02', title: 'Worst Joke of the Weekend', instruction: 'Tell Jezza the worst dad joke you know. Bonus respect if it\'s so bad he laughs anyway.', category: 'laugh', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'l03', title: 'Doing a Jezza', instruction: 'Get someone to do their best Jezza impression. Jezza scores it out of ten.', category: 'laugh', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'l04', title: 'Hype Man', instruction: 'Next time Jezza tells a story, react like it\'s the best yarn you\'ve ever heard. He has to notice.', category: 'laugh', difficulty: 1, method: 'witness' }),
  m({ id: 'l05', title: 'Laugh-Off', instruction: 'You and a mate each get one go at making Jezza laugh. He picks the winner, the winner claims it.', category: 'laugh', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'l06', retired: true, title: 'Useless Magic Trick', instruction: 'Show Jezza the most useless magic trick you\'ve got, then act like you\'ve just changed his life.', category: 'laugh', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'l07', title: 'The Callback', instruction: 'Bring back something dumb that actually happened earlier this weekend and make Jezza laugh about it again.', category: 'laugh', difficulty: 2, method: 'witness' }),
  m({ id: 'l08', title: 'Weirdly Specific Compliment', instruction: 'Give Jezza a weirdly specific compliment. "Your elbows have great energy" sort of thing.', category: 'laugh', difficulty: 1, method: 'witness' }),
  m({ id: 'l09', title: 'One-Line Roast', instruction: 'One line, to Jezza\'s face. If he laughs, it counts.', category: 'laugh', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'l10', title: 'Staring Contest', instruction: 'Ten-second staring contest with Jezza. Get a mate to snap the exact moment someone cracks.', category: 'laugh', difficulty: 1, method: 'photo' }),
  m({ id: 'l11', title: 'Slow Clap', instruction: 'Start a slow clap for something dead boring. Get three lads to join in.', category: 'laugh', difficulty: 2, method: 'self', loud: true }),
  m({ id: 'l12', title: 'Copy His Face', instruction: 'Copy Jezza\'s exact expression, deadpan, until he cracks. Side-by-side photo of the two faces.', category: 'laugh', difficulty: 1, method: 'photo' }),

  // ---------- DANCE ----------
  m({ id: 'd01', retired: true, title: 'Ripper Dance', instruction: 'Give Jezza your most cooked 15-second dance. No warm-up. Full commitment.', category: 'dance', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'd02', retired: true, title: 'Worst Dancer Alive', instruction: 'Show Jezza your worst moves. Anything you\'re actually good at is banned.', category: 'dance', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'd03', retired: true, title: 'Dance-Off', instruction: 'Call out a mate for a 15-second dance-off. Jezza picks the winner. Winner claims, loser gets respect.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd04', retired: true, title: 'Dad at a Wedding', instruction: 'Ten seconds of your best dad-at-a-wedding dance. Finger guns optional but encouraged.', category: 'dance', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'd05', retired: true, title: 'Backup Dancer', instruction: 'Be Jezza\'s way-too-keen backup dancer for ten seconds. He doesn\'t even have to be dancing.', category: 'dance', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'd06', retired: true, title: 'In Sync', instruction: 'Get two mates to pull the exact same dance move at the exact same time.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd07', retired: true, title: 'Victory Dance', instruction: 'Massive victory dance for something completely boring, like finding your phone. Snap the peak of it.', category: 'dance', difficulty: 1, method: 'photo', loud: true }),
  m({ id: 'd08', retired: true, title: 'Sorry, Through Dance', instruction: 'Dance an apology to Jezza for something tiny. No words allowed.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd09', retired: true, title: 'Jezza Picks the Song', instruction: 'Jezza picks any song. You\'ve got 15 seconds to dance to it like your life depends on it.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd10', retired: true, title: 'Dance Judge', instruction: 'Get two mates to dance for Jezza, then score them out of ten like a brutal reality TV judge.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'd11', retired: true, title: 'Backup Crew', instruction: 'Get two mates to be Jezza\'s backup dancers for a full chorus. Total commitment, zero rehearsal.', category: 'dance', difficulty: 2, method: 'witness', loud: true }),

  // ---------- SING ----------
  m({ id: 's01', retired: true, title: 'Song Dedication', instruction: 'Sing a chorus straight to Jezza like you wrote it for him. Eye contact the whole time.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 's02', retired: true, title: 'Terrible Karaoke', instruction: 'Sing ten seconds of any song as badly as humanly possible.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 's03', retired: true, title: 'Backup Vocals', instruction: 'Sing to Jezza while a mate does the most over-the-top backup vocals they can.', category: 'sing', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 's04', retired: true, title: 'Boy Band', instruction: 'Get two mates to sing the same chorus with you. Harmonies optional. Confidence mandatory.', category: 'sing', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 's05', retired: true, title: 'Jezza Chant', instruction: 'Make up a chant about Jezza and get at least one mate to join in.', category: 'sing', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 's06', retired: true, title: 'Grand Final Anthem', instruction: 'Sing one line of any song like it\'s the anthem before the grand final. Hand on heart.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 's07', retired: true, title: 'Duet', instruction: 'Sing a chorus with a mate. The worse the harmonies, the better.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 's08', retired: true, title: 'Power Ballad', instruction: 'Sing Jezza one chorus with way too much emotion. Eyes shut, fist clenched, one tear optional.', category: 'sing', difficulty: 1, method: 'witness', loud: true }),

  // ---------- COOKED PHOTOS ----------
  m({ id: 'p01', title: 'Most Cooked Selfie', instruction: 'Convince Jezza to take a selfie with you. The more cooked, the better.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p02', title: 'Identical Idiots', instruction: 'Get three mates to pull the exact same face in one photo.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p03', title: 'Pyramid of Lads', instruction: 'Pyramid-shaped group photo: back row standing, middle row squatting, front row sitting. Nobody climbs on anyone.', category: 'photo', difficulty: 3, method: 'photo' }),
  m({ id: 'p04', title: 'Jezza Is King', instruction: 'Everyone poses around Jezza like he\'s royalty. The more over the top, the better.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p05', title: 'Human Arrow', instruction: 'Line the lads up into an arrow pointing straight at Jezza.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p06', retired: true, title: 'Everyone Different', instruction: 'Group photo where every single person pulls a different stupid pose.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p07', retired: true, title: 'The Lean', instruction: 'Everyone leans the same way like gravity\'s given up. Feet stay on the ground.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p08', title: 'Worst Album Cover', instruction: 'Three or more lads pose for the world\'s worst album cover. Put the band name in the note.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p09', title: 'Olympic Gold', instruction: 'Photo of Jezza celebrating something completely ordinary like he\'s just won gold.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p10', title: 'Copycat Chain', instruction: 'Copy Jezza\'s pose exactly, then get two mates to copy you both. Photo of the lot.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p11', title: 'Statues', instruction: 'Everyone freezes in a different ridiculous pose. One photo.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p12', retired: true, title: 'Fitness Influencers', instruction: 'Fake gym photo with the lads. Flex, point, pretend. Nobody actually works out.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p13', retired: true, title: 'The Point', instruction: 'Get four or more mates pointing dramatically at something completely boring.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p14', title: 'Lads Calendar', instruction: 'Group photo where everyone pulls their most overconfident calendar pose.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p15', title: 'Bodyguards', instruction: 'Two mates pose as dead-serious bodyguards either side of Jezza.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p16', title: 'Cursed Family Portrait', instruction: 'Fake family portrait. Everyone pulls a different cursed expression.', category: 'photo', difficulty: 2, method: 'photo' }),
  m({ id: 'p17', retired: true, title: 'Wombat Squad', instruction: 'Everyone gets low in a comfy squat for a group photo. Lower is better, as long as nobody\'s knees complain.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p19', title: 'Reaction Shot', instruction: 'Snap the lads\' faces the exact second a roast lands or a story drops.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p20', title: 'Caption This', instruction: 'Snap something this weekend that needs no explanation. Best caption goes in the note.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p21', title: 'Twinning', instruction: 'Spot two lads accidentally dressed the same. Photo of them posing like it was planned.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p22', title: 'Formal Photo', instruction: 'Recreate an awkward school formal photo with a mate. Stiff arms, forced smiles, the lot.', category: 'photo', difficulty: 1, method: 'photo' }),
  m({ id: 'p18', title: 'Grand Final Winners', instruction: 'Group photo of everyone celebrating like you just won the grand final. Jezza holds the imaginary cup.', category: 'photo', difficulty: 2, method: 'photo' }),

  // ---------- GET JEZZA IN ----------
  m({ id: 'j01', retired: true, title: 'Jezza Joins In', instruction: 'Get Jezza into your most ridiculous group pose.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'j02', title: 'Jezza Picks', instruction: 'Give Jezza two stupid (harmless) options for what you do next. Do whichever he picks.', category: 'jezza', difficulty: 1, method: 'witness' }),
  m({ id: 'j03', title: 'Groom\'s Award', instruction: 'Present Jezza a made-up award for something he actually did this weekend. Ten-second speech. Photo of the handover.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'j04', retired: true, title: 'Team Celebration', instruction: 'Get Jezza and two mates into a full team celebration pose.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'j05', retired: true, title: 'Chant Leader', instruction: 'Get three mates chanting something about the weekend with Jezza. Five seconds is plenty.', category: 'jezza', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'j06', title: 'Jezza\'s Best Side', instruction: 'Ask Jezza for his best pose, then get the lads to copy it. Photo.', category: 'jezza', difficulty: 2, method: 'photo' }),
  m({ id: 'j07', title: 'Secret Handshake', instruction: 'Invent a ridiculously complicated handshake with Jezza and nail it twice. Photo mid-handshake.', category: 'jezza', difficulty: 2, method: 'photo' }),
  m({ id: 'j08', retired: true, title: 'Odd One Out', instruction: 'Find two mates wearing similar colours and take a photo with Jezza as the odd one out.', category: 'jezza', difficulty: 1, method: 'photo' }),
  m({ id: 'j09', title: 'Fan Club', instruction: 'Get three mates to pose as Jezza\'s way-too-keen fan club.', category: 'jezza', difficulty: 2, method: 'photo' }),
  m({ id: 'j10', retired: true, title: 'Groom\'s Choice', instruction: 'Offer Jezza three options: joke, song or dance. Do whichever one he picks.', category: 'jezza', difficulty: 2, method: 'witness', loud: true }),
  m({ id: 'j11', title: 'Marriage Advice', instruction: 'Ask Jezza for his best marriage advice so far. Nod like it\'s the wisest thing you\'ve ever heard.', category: 'jezza', difficulty: 1, method: 'self' }),

  // ---------- CHEERS (any drink counts, nobody has to drink) ----------
  m({ id: 'c01', title: 'Cheers with Jezza', instruction: 'Clink glasses with Jezza and get a funny photo of it. Any drink counts.', category: 'cheers', difficulty: 1, method: 'photo' }),
  m({ id: 'c02', retired: true, title: 'Ten-Second Toast', instruction: 'Give Jezza a ten-second toast. Heartfelt, ridiculous, or both.', category: 'cheers', difficulty: 1, method: 'witness', loud: true }),
  m({ id: 'c03', title: 'Cheers Crew', instruction: 'Get three mates and Jezza into a group cheers photo.', category: 'cheers', difficulty: 2, method: 'photo' }),
  m({ id: 'c04', title: 'Drink Review', instruction: 'Review whatever you\'re drinking like an overconfident food critic. No need to finish it.', category: 'cheers', difficulty: 1, method: 'witness' }),
  m({ id: 'c05', title: 'Mocktail Champion', instruction: 'Toast with a non-alcoholic drink like you\'re accepting a world title. Snap the acceptance.', category: 'cheers', difficulty: 1, method: 'photo' }),
  m({ id: 'c06', title: 'Signature Cheers', instruction: 'Invent your own cheers move and get a mate to do it with you. Photo of the move.', category: 'cheers', difficulty: 1, method: 'photo' }),
  m({ id: 'c07', title: 'Cheers Round', instruction: 'Clink with five different lads in the next ten minutes. Clink, nod, move on.', category: 'cheers', difficulty: 1, method: 'self' }),
  m({ id: 'c08', title: 'Absent Mates', instruction: 'Raise a glass to a mate who couldn\'t make it and send them the photo.', category: 'cheers', difficulty: 1, method: 'photo' }),
  m({ id: 'c09', retired: true, title: 'Synchronised Cheers', instruction: 'Get four lads to pull the exact same cheers pose in one photo. Any drink counts.', category: 'cheers', difficulty: 2, method: 'photo' }),
  m({ id: 'c10', title: 'Historic Toast', instruction: 'Glass up, one line: "On this day, a legend..." Finish it about Jezza. No speech needed.', category: 'cheers', difficulty: 2, method: 'witness', loud: true }),

  // ---------- SNEAKY (only you can see these) ----------
  m({ id: 'x01', secret: true, title: 'Plant a Word', instruction: 'Get Jezza to say "wedding" without him knowing it\'s a mission.', category: 'sneaky', difficulty: 2, method: 'self' }),
  m({ id: 'x02', secret: true, title: 'Copycat', instruction: 'Copy everything a mate does for a minute until they notice. Then act innocent.', category: 'sneaky', difficulty: 1, method: 'self' }),
  m({ id: 'x03', secret: true, title: 'The Echo', instruction: 'Repeat the last two words Jezza says, three times in a row, without him clocking it.', category: 'sneaky', difficulty: 2, method: 'self' }),
  m({ id: 'x04', retired: true, secret: true, title: 'Nickname Launch', instruction: 'Give a mate a new nickname and get two other lads using it within 20 minutes.', category: 'sneaky', difficulty: 3, method: 'self' }),
  m({ id: 'x05', retired: true, secret: true, title: 'Photobomb', instruction: 'Sneak into the background of three different photos tonight. Nobody can notice until later.', category: 'sneaky', difficulty: 2, method: 'self' }),

  // ---------- LOW-KEY (no performing, no camera) ----------
  m({ id: 'q01', title: 'Handshake Ratings', instruction: 'Rate three mates\' handshakes out of ten and tell them their score. Feedback encouraged.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q02', title: 'Quote of the Night', instruction: 'Grab the funniest thing someone\'s said tonight and read it back to the group.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q03', title: 'Sequel', instruction: 'Get someone to tell you the same story twice. Yell "SEQUEL" when they do.', category: 'chill', difficulty: 2, method: 'self' }),
  m({ id: 'q04', title: 'Phone Rescue', instruction: 'Catch a mate doom-scrolling while the boys are talking and drag them back into the yarn.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q05', title: 'How\'d You Meet?', instruction: 'Ask Jezza how he met his partner. Only interrupt to say "no way".', category: 'chill', difficulty: 1, method: 'self', phase: 'friday' }),
  m({ id: 'q06', retired: true, title: 'Snack Delivery', instruction: 'Bring a mate a snack they didn\'t ask for. Hand it over like it\'s a trophy.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q07', title: 'Cooked Counter', instruction: 'Count how many times someone says "cooked" in 15 minutes. Announce the total.', category: 'chill', difficulty: 1, method: 'self' }),
  m({ id: 'q08', retired: true, title: 'Group Chat Banger', instruction: 'Take one genuinely good photo of the view or the venue for the group chat.', category: 'chill', difficulty: 1, method: 'photo' }),
  m({ id: 'q09', title: 'Wingman', instruction: 'Hype up a mate\'s average joke until the whole group laughs.', category: 'chill', difficulty: 2, method: 'self' }),
  m({ id: 'q10', title: 'Lookalikes', instruction: 'Tell three mates which celebrity they look like. Photo of the best one doing the celebrity\'s pose.', category: 'chill', difficulty: 1, method: 'photo' }),

  // ---------- GROUP (go live on their own every so often; optional) ----------
  m({ id: 'g01', title: 'The Big Cheers', instruction: 'Everyone raises a drink at once and yells "CHEERS JEZZA". Any drink counts. One photo.', category: 'group', difficulty: 1, method: 'photo', scope: 'group', points: 15, xp: 30 }),
  m({ id: 'g02', title: 'Creature Parade', instruction: 'Everyone holds up their phone showing their creature for one massive group photo.', category: 'group', difficulty: 2, method: 'photo', scope: 'group', points: 25, xp: 40 }),
  m({ id: 'g03', title: 'Silent Minute', instruction: 'The whole group stays dead silent for one minute. First to crack does their best Jezza impression. Everyone else claims.', category: 'group', difficulty: 2, method: 'self', scope: 'group', points: 20, xp: 30 }),
  m({ id: 'g04', title: 'The Wave', instruction: 'Do a Mexican wave with the whole group for Jezza. Snap the best moment.', category: 'group', difficulty: 1, method: 'photo', scope: 'group', points: 15, xp: 30 }),
  m({ id: 'g05', title: 'Sunset Salute', instruction: 'Everyone outside, drinks up, one massive "CHEERS JEZZA" at the sky. Photo.', category: 'group', difficulty: 1, method: 'photo', scope: 'group', phase: 'saturday', points: 20, xp: 35 }),
  m({ id: 'g06', title: 'Squad Goals', instruction: 'Pull the most dramatic group pose you can think of. Everyone in, Jezza in the middle.', category: 'group', difficulty: 2, method: 'photo', scope: 'group', points: 25, xp: 40 }),
];

export const MISSION_BY_ID: Record<string, Mission> = Object.fromEntries(MISSIONS.map((x) => [x.id, x]));
export const STARTER_MISSION = MISSIONS.find((x) => x.starter)!;
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
  'Absolute scenes.', 'Jezza will remember that. Unfortunately.', 'Cooked. Beautifully cooked.', 'The lads are proud. Probably.',
  'That\'s going in the speech.', 'Ripper effort.', 'Unreal. Do it again.', 'Certified legend behaviour.', 'No notes.',
  'Questionable. Points anyway.', 'Main character energy.', 'Mum would be proud. Don\'t tell her.',
];
