// Bucks Olympics: a scorer runs an event from their phone, the TV mirrors it. Results are entered by hand
// (a stopwatch helps for timed events), then the event is locked and placing points go out.
export type OlyUnit = 'seconds' | 'reps' | 'metres' | 'place' | 'points';
export const OLY_UNITS: Record<OlyUnit, { label: string; emoji: string; blurb: string; higherWins: boolean; fmt: (v: number) => string }> = {
  seconds: { label: 'Time', emoji: '⏱', blurb: 'Longest time wins (plank, wall sit). Use the stopwatch or type seconds.', higherWins: true, fmt: (v) => v >= 60 ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}` : `${Math.round(v * 10) / 10}s` },
  reps:    { label: 'Count', emoji: '🔢', blurb: 'Most wins (push-ups, cups sunk).', higherWins: true, fmt: (v) => `${Math.round(v)}` },
  metres:  { label: 'Distance', emoji: '📏', blurb: 'Furthest wins (paper plane).', higherWins: true, fmt: (v) => `${Math.round(v * 10) / 10} m` },
  place:   { label: 'Placing', emoji: '🏁', blurb: 'Type 1 for first, 2 for second… Team games: give every lad on a team the same place.', higherWins: false, fmt: (v) => `${Math.round(v)}${['th', 'st', 'nd', 'rd'][Math.round(v) % 10 > 3 || Math.floor(Math.round(v) % 100 / 10) === 1 ? 0 : Math.round(v) % 10]}` },
  points:  { label: 'Points', emoji: '🏅', blurb: 'Skip the placings: the number you type is the points they get.', higherWins: true, fmt: (v) => `${Math.round(v)} pts` },
};
/** Bucks quick picks; each theme carries its own list in shared/themes.ts (copy.olySuggested). */
export const OLY_SUGGESTED: { name: string; unit: OlyUnit }[] = [
  { name: 'Plank', unit: 'seconds' }, { name: 'Wall sit', unit: 'seconds' }, { name: 'Push-ups', unit: 'reps' }, { name: 'Paper plane', unit: 'metres' },
  { name: 'Beer pong', unit: 'place' }, { name: 'Flip cup', unit: 'place' }, { name: 'Thong throw', unit: 'metres' }, { name: 'Arm wrestle', unit: 'place' },
];
/** Points by place: 1st 60, 2nd 40, 3rd 25, 4th and 5th 15, everyone else who took part 10. Ties share the place. */
export const OLY_PLACE_POINTS = [60, 40, 25, 15, 15];
export const OLY_PART_POINTS = 10;
export interface OlyResult { playerId: string; value: number; at: number }
export interface OlyAward { playerId: string; place: number; points: number; value: number }
export interface OlyEvent {
  id: string; name: string; unit: OlyUnit; scorerId: string; startedAt: number;
  results: OlyResult[];
  timer: { playerId: string; startedAt: number } | null; // a stopwatch running on the scorer's phone, mirrored on the TV
  status: 'open' | 'locked';
  lockedAt?: number;
  awards?: OlyAward[];
}
/** Placings and points from the results. Ties share a place and its points; the next place is skipped. */
export function placeAwards(unit: OlyUnit, results: OlyResult[]): OlyAward[] {
  const u = OLY_UNITS[unit];
  if (unit === 'points') return results.map((r) => ({ playerId: r.playerId, place: 0, points: Math.round(r.value), value: r.value }));
  const sorted = [...results].sort((a, b) => u.higherWins ? b.value - a.value : a.value - b.value);
  const out: OlyAward[] = []; let place = 0;
  sorted.forEach((r, i) => {
    if (i === 0 || r.value !== sorted[i - 1].value) place = i + 1;
    out.push({ playerId: r.playerId, place, points: OLY_PLACE_POINTS[place - 1] ?? OLY_PART_POINTS, value: r.value });
  });
  return out;
}
export const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n % 100 / 10) === 1 ? 0 : n % 10]}`;
