// Rowdy Rounds: quick party games the host fires at every phone and the TV. The forfeit is traditionally a sip,
// but the game never counts drinks and never gives points for drinking; voting pays a few points for joining in.
export type RowdyKind = 'mostLikely' | 'neverHaveIEver' | 'categories' | 'newRule';
export interface RowdyDef { kind: RowdyKind; label: string; emoji: string; seconds: number; blurb: string; vote: boolean }
export const ROWDY_KINDS: Record<RowdyKind, RowdyDef> = {
  mostLikely:     { kind: 'mostLikely', label: 'Most Likely To', emoji: '👉', seconds: 45, blurb: 'Everyone names a lad. The most-named lad takes the forfeit.', vote: true },
  neverHaveIEver: { kind: 'neverHaveIEver', label: 'Never Have I Ever', emoji: '🙈', seconds: 30, blurb: 'If you have, you know what to do.', vote: false },
  categories:     { kind: 'categories', label: 'Categories', emoji: '🔁', seconds: 60, blurb: 'Round the circle, one each, no repeats. First to stall or repeat takes the forfeit.', vote: false },
  newRule:        { kind: 'newRule', label: 'New Rule', emoji: '📜', seconds: 600, blurb: 'Lasts ten minutes. Break it, take the forfeit.', vote: false },
};
export const ROWDY_PROMPTS: Record<RowdyKind, string[]> = {
  mostLikely: [
    'cry at the wedding', 'lose his phone tonight', 'be asleep by 10', 'start a conga line', 'text an ex before midnight',
    'get kicked out first', 'give the best speech', 'give the worst speech', 'order a round and vanish', 'know every word to a Nickelback song',
    'end up in the pool', 'become a dad accidentally', 'get a tattoo tonight', 'book Bali on a whim', 'still be talking at 3am',
    'fall asleep at the table', 'have a secret second phone', 'hug a stranger', 'swear at a GPS', 'be the Mole',
    'eat something off the floor', 'get a nickname from a bouncer', 'lose a fight to a bin chicken', 'cry during a Disney film', 'forget the groom\'s name',
    'sell everything and buy a boat', 'end up on the news', 'marry next', 'be late to the wedding', 'have practised his speech in the mirror',
  ],
  neverHaveIEver: [
    'been kicked out of a venue', 'cried at a wedding', 'lied about my age', 'slept through a flight', 'fallen asleep in a pub toilet',
    'sent a message to the wrong group chat', 'pretended to know a wine', 'been on TV', 'worn the same undies two days running', 'lost a bet to Jezza',
    'walked out of a restaurant without paying', 'been in a limo', 'got a tattoo I regret', 'sung karaoke sober', 'faked a sickie for a bucks',
    'been stuck in a lift', 'punched a wall', 'got lost in my own suburb', 'googled myself tonight', 'kissed someone in this room',
    'broken a bone doing something dumb', 'forgotten where I parked for over an hour', 'been bitten by a wild animal', 'rung a radio station', 'lied to a doctor',
  ],
  categories: [
    'Aussie beers', 'things in a toolbox', 'wedding songs', 'Hunter Valley wineries', 'NRL clubs', 'things Jezza would say', 'servo snacks', 'car brands',
    'animals you could fight and win', 'Bunnings aisles', 'excuses for being late', 'types of pasta', 'cricket fielding positions', 'breakfast cereals',
    'things you yell at the TV', 'words for drunk', 'Australian prime ministers', 'things in the groom\'s wallet', 'cocktail names', 'countries ending in -stan',
  ],
  newRule: [
    'No first names. Nicknames only.', 'Drink with your left hand only.', 'No pointing. Elbows only.', 'Everything Jezza says gets a cheer.',
    'No phones face up on the table.', 'Every sentence must end with "mate".', 'Nobody says "drink". Say "hydrate".', 'Stand up to speak.',
    'No saying "no". Say "absolutely not, legend".', 'Thumb on the table when Jezza puts his down. Last one loses.', 'Silent cheers only.', 'Call the groom "Your Honour".',
    'Before every sip, a compliment for the lad on your left.', 'No swearing. Replace with "goodness".', 'Every toast needs a rhyme.',
  ],
};
export const ROWDY_VOTE_POINTS = 5;
export interface RowdyState {
  id: string; kind: RowdyKind; prompt: string; startedAt: number; endsAt: number;
  votes: Record<string, string>;   // voter → the lad they named (Most Likely To only)
  revealed: boolean; used: string[]; // used prompts of this kind stay out of the hat
}
export interface RowdyPublic {
  id: string; kind: RowdyKind; prompt: string; startedAt: number; endsAt: number; votes: number; revealed: boolean;
  tally?: { playerId: string; n: number }[]; // once revealed, most-named first
}
