import { useState } from 'react';
import type { Epic } from '@shared/types';
import { EPIC_TIERS } from '@shared/epics';
import { COSMETIC_BY_ID } from '@shared/progression';
import { Button } from './ui';
import { useStore } from '../store';
import { request } from '../net';
import { sfx } from '../audio';

/** Purple EPIC tier job: first in fill the crew, the whole crew gets rewarded when it's done. */
export function EpicCard({ epic, compact }: { epic: Epic; compact?: boolean }) {
  const party = useStore((s) => s.party);
  const meId = useStore((s) => s.identity.playerId);
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const nick = (id: string) => party?.players.find((p) => p.id === id)?.nickname ?? '?';
  const mine = epic.crew.includes(meId);
  const full = epic.crew.length >= epic.max;
  const item = COSMETIC_BY_ID[epic.item];
  const run = async (msg: { type: 'joinEpic' | 'leaveEpic' | 'finishEpic'; epicId: string }, ok?: string) => {
    if (busy) return; setBusy(true);
    try {
      const r = await request<{ crew?: number } | undefined>(msg); sfx.select();
      // filling the last spot gets the server's "crew locked in" message instead
      if (ok && !(msg.type === 'joinEpic' && r?.crew === epic.max)) toast(ok, epic.emoji, 'success');
    } catch (e) { toast((e as Error).message, '⚠️', 'warn'); sfx.error(); } finally { setBusy(false); }
  };
  if (compact) {
    // slim one-line strip for the Lobby
    return (
      <div className="epic-card compact epic-strip">
        <span className="epic-emoji">{epic.emoji}</span>
        <span className="grow" style={{ minWidth: 0 }}>
          <div className="bold ellipsis"><span className="pill pill-xs pill-epic" style={{ marginRight: 6 }}>EPIC</span>{epic.title}</div>
          <div className="tiny ellipsis" style={{ opacity: 0.85 }}>{mine ? `You're on it${epic.crew.length > 1 ? ` with ${epic.crew.filter((x) => x !== meId).map(nick).join(', ')}` : ''}` : `${epic.max - epic.crew.length} spot${epic.max - epic.crew.length === 1 ? '' : 's'} left`} · +{epic.points} pts{item ? ` · 🎁 ${item.name}` : ''}</div>
        </span>
        {mine
          ? <Button size="sm" disabled={busy || epic.crew.length < epic.min} onClick={() => run({ type: 'finishEpic', epicId: epic.id })}>{epic.crew.length < epic.min ? `${epic.crew.length}/${epic.min}` : '✅ Done'}</Button>
          : <Button size="sm" className="btn-epic" disabled={busy || full} onClick={() => run({ type: 'joinEpic', epicId: epic.id }, `You're on ${epic.title}!`)}>🙋 I'm on it</Button>}
      </div>
    );
  }
  const spots = epic.min === epic.max ? `${epic.crew.length}/${epic.max}` : `${epic.crew.length}/${epic.max} (${epic.min}+ needed)`;
  return (
    <div className={`epic-card ${compact ? 'compact' : ''} ${epic.status}`}>
      <div className="row-between" style={{ gap: 6 }}>
        <span className="row" style={{ gap: 6 }}><span className="pill pill-xs pill-epic">🟣 EPIC</span>{!compact && <span className="pill pill-xs">{spots} spots</span>}</span>
        <span className="pill pill-xs pill-epic-soft">{EPIC_TIERS[epic.tier]?.label ?? ''} · +{epic.points} pts · {epic.xp} XP</span>
      </div>
      <div className="epic-title"><span className="epic-emoji">{epic.emoji}</span>{epic.title}</div>
      {!compact && <div className="small" style={{ opacity: 0.9 }}>{epic.instruction}</div>}
      <div className="tiny" style={{ opacity: 0.85 }}>
        {epic.crew.length ? <>Crew: <b>{epic.crew.map(nick).join(', ')}</b>{!full && epic.status === 'open' ? ` · ${epic.max - epic.crew.length} spot${epic.max - epic.crew.length === 1 ? '' : 's'} left` : ''}</> : 'No one yet. First in gets it.'}
        {item && <> · 🎁 {item.name}</>}
      </div>
      {epic.status === 'done' ? (
        <div className="small bold">✅ Sorted. Legends.</div>
      ) : mine ? (
        <div className="btn-row">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ type: 'leaveEpic', epicId: epic.id }, 'You stepped off the crew.')}>Leave</Button>
          <Button size="sm" disabled={busy || epic.crew.length < epic.min} onClick={() => run({ type: 'finishEpic', epicId: epic.id })}>{epic.crew.length < epic.min ? `Needs ${epic.min}` : '✅ Done'}</Button>
        </div>
      ) : full ? (
        <div className="small bold" style={{ opacity: 0.8 }}>Crew's full. Next time, legend.</div>
      ) : (
        <Button size="sm" className="btn-epic" disabled={busy} onClick={() => run({ type: 'joinEpic', epicId: epic.id }, `You're on ${epic.title}!`)}>🙋 I'm on it</Button>
      )}
    </div>
  );
}
