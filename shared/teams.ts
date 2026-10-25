// Teams: the host drafts everyone into even sides (snake draft from the ladder), swaps anyone, and the team score is
// the average points each member has earned since the teams were made, so uneven sizes compete fairly.
import type { PlayerPublic } from './types';
export const TEAM_LOOKS = [
  { name: 'Team Red', emoji: '🔴', color: '#ff5a5a' }, { name: 'Team Blue', emoji: '🔵', color: '#5ea8ff' }, { name: 'Team Green', emoji: '🟢', color: '#6fd36f' },
  { name: 'Team Gold', emoji: '🟡', color: '#E5AD48' }, { name: 'Team Purple', emoji: '🟣', color: '#c38cff' }, { name: 'Team Orange', emoji: '🟠', color: '#F07842' },
];
export interface Team { id: string; name: string; emoji: string; color: string; members: string[] }
export interface TeamsState { createdAt: number; label: string; teams: Team[]; baseline: Record<string, number> }
export interface TeamsPublic { createdAt: number; label: string; teams: (Team & { score: number; total: number })[] }
/** Snake draft: best, 2nd, 3rd go to teams A, B, C, then C, B, A, and so on. Sides come out even in strength and size. */
export function snakeDraft(ids: string[], count: number): string[][] {
  const teams: string[][] = Array.from({ length: count }, () => []);
  ids.forEach((id, i) => { const round = Math.floor(i / count); const slot = i % count; teams[round % 2 === 0 ? slot : count - 1 - slot].push(id); });
  return teams;
}
export function teamScore(t: Team, players: Pick<PlayerPublic, 'id' | 'points'>[], baseline: Record<string, number>) {
  const gained = t.members.map((m) => (players.find((p) => p.id === m)?.points ?? 0) - (baseline[m] ?? 0));
  const total = gained.reduce((a, b) => a + b, 0);
  return { total, score: t.members.length ? Math.round(total / t.members.length) : 0 };
}
