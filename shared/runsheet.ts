// The host's run sheet: the plan for the day, wired to buttons. Each item is a time, a label and (optionally) the
// thing it starts. Phones and the TV show what's next; the host gets a nudge when it's time and taps once.
export type RunAction = 'none' | 'reel' | 'book' | 'olympics' | 'awards' | 'spotlight' | 'rowdy' | 'raid' | 'drops' | 'xpBoost' | 'mole' | 'teams';
export const RUN_ACTIONS: Record<RunAction, { label: string; emoji: string; blurb: string }> = {
  none:      { label: 'Just a reminder', emoji: '📌', blurb: 'Shows on every phone and the TV, nothing else happens.' },
  reel:      { label: 'Photo reel', emoji: '📽️', blurb: 'The TV plays every photo of the party.' },
  book:      { label: 'The Birthday Book', emoji: '📖', blurb: 'Opens the book: the TV plays every message, one page at a time.' },
  olympics:  { label: 'Olympics', emoji: '🏅', blurb: 'Tells the scorers to open the pad; the TV announces it.' },
  awards:    { label: 'Awards ceremony', emoji: '🏆', blurb: 'Moves to the Finale; you reveal awards from your phone, the TV follows.' },
  spotlight: { label: 'Speech clock', emoji: '🎤', blurb: 'Starts the Spotlight countdown you set up.' },
  rowdy:     { label: 'Rowdy Round', emoji: '🍻', blurb: 'Fires a random Rowdy Round.' },
  raid:      { label: 'Boss raid', emoji: '👹', blurb: 'Summons a boss.' },
  drops:     { label: 'Drop for everyone', emoji: '🎁', blurb: 'A rare Lucky Drop on every lad.' },
  xpBoost:   { label: 'Double XP (30 min)', emoji: '⚡', blurb: 'Half an hour of double XP.' },
  mole:      { label: 'Reveal the Mole', emoji: '🕵️', blurb: 'Reveals the Mole(s) and pays out.' },
  teams:     { label: 'Make teams', emoji: '👥', blurb: 'Drafts everyone into even teams.' },
};
export interface RunItem { id: string; at: number; label: string; action: RunAction; done?: boolean; doneAt?: number; nudgedAt?: number }
/** A typical night, relative to a given day: used by "Load a typical night" so the host edits instead of typing. */
export function typicalNight(dayStart: number): Omit<RunItem, 'id'>[] {
  const at = (h: number, m = 0) => { const d = new Date(dayStart); d.setHours(h, m, 0, 0); return d.getTime(); };
  return [
    { at: at(14), label: 'Bucks Olympics', action: 'olympics' },
    { at: at(17, 30), label: 'Boss raid before dinner', action: 'raid' },
    { at: at(20), label: 'Photo reel', action: 'reel' },
    { at: at(20, 30), label: 'Rowdy Round', action: 'rowdy' },
    { at: at(21), label: 'Legendary drop for everyone', action: 'drops' },
    { at: at(21, 15), label: 'Awards ceremony', action: 'awards' },
    { at: at(22), label: "The Loser's Speech", action: 'spotlight' },
  ];
}
/** A four-hour afternoon party, relative to a given day. */
export function typicalAfternoon(dayStart: number): Omit<RunItem, 'id'>[] {
  const at = (h: number, m = 0) => { const d = new Date(dayStart); d.setHours(h, m, 0, 0); return d.getTime(); };
  return [
    { at: at(12, 15), label: 'Mingle challenges open', action: 'none' },
    { at: at(13, 30), label: 'Mini Olympics', action: 'olympics' },
    { at: at(14, 30), label: 'Rowdy Round', action: 'rowdy' },
    { at: at(15, 0), label: 'Last photos in', action: 'none' },
    { at: at(15, 30), label: 'Photo reel', action: 'reel' },
    { at: at(15, 45), label: 'The Birthday Book', action: 'book' },
    { at: at(15, 55), label: 'Awards', action: 'awards' },
  ];
}
export const nextItem = (items: RunItem[], now: number) => [...items].filter((i) => !i.done).sort((a, b) => a.at - b.at).find((i) => i.at >= now - 3 * 3600_000) ?? null;
