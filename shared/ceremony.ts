// Ceremony order, shared by the phones and the TV so they reveal the same award at the same step:
// the Weekend Menace opens proceedings, the Jezza Legend closes them.
import type { AwardResult, Spotlight } from './types';
export function orderAwards(awards: AwardResult[]): AwardResult[] {
  return [awards.find((a) => a.id === 'menace'), ...awards.filter((a) => a.id !== 'menace' && a.id !== 'legend'), awards.find((a) => a.id === 'legend')].filter((a): a is AwardResult => !!a);
}
/** Where a spotlight is in its life, at server time `now`. */
export function spotlightPhase(s: Spotlight | null | undefined, now: number): 'none' | 'upcoming' | 'running' | 'done' {
  if (!s) return 'none';
  if (!s.startedAt) return 'upcoming';
  const end = s.startedAt + s.seconds * 1000;
  if (now < end) return 'running';
  return now < end + 45_000 ? 'done' : 'none'; // "TIME" stays up for 45 seconds, then it's over
}
export const fmtClock = (secs: number) => `${Math.floor(Math.max(0, secs) / 60)}:${String(Math.max(0, secs) % 60).padStart(2, '0')}`;
/** 10:00 pm today in the phone's own time zone (the host is where the party is). */
export function defaultSpotlightAt(now = Date.now()) { const d = new Date(now); d.setHours(22, 0, 0, 0); if (d.getTime() < now) d.setDate(d.getDate() + 1); return d.getTime(); }
export const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
