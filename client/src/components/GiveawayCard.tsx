import { useState } from 'react';
import type { Giveaway } from '@shared/types';
import { COSMETIC_BY_ID } from '@shared/progression';
import { Button } from './ui';
import { ItemIcon } from './Creature';
import { useStore, useMe } from '../store';
import { request } from '../net';
import { sfx } from '../audio';

/** One host-released accessory up for grabs. One button, one job: Claim. The engine decides who actually gets it. */
export function GiveawayCard({ g }: { g: Giveaway }) {
  const me = useMe();
  const toast = useStore((s) => s.toast);
  const serverTime = useStore((s) => s.party?.serverTime ?? Date.now());
  const [busy, setBusy] = useState(false);
  const item = COSMETIC_BY_ID[g.item];
  const mine = g.claims.some((c) => c.playerId === me?.id);
  const owned = !!me?.unlocked.includes(g.item);
  const left = g.qty - g.claims.length;
  const live = g.status === 'active' && (!g.endsAt || serverTime < g.endsAt);
  const mins = live && g.endsAt ? Math.max(1, Math.ceil((g.endsAt - serverTime) / 60_000)) : null;
  const claim = async () => {
    if (busy) return; setBusy(true);
    try { await request({ type: 'claimGiveaway', giveawayId: g.id }); sfx.reward(); } // the reward card says "Got it!"
    catch (e) { toast((e as Error).message, '🎁', 'warn'); sfx.error(); }
    finally { setBusy(false); }
  };
  const line = mine ? 'Yours. Wear it on the Me screen.'
    : owned ? 'You already have this one.'
    : g.status === 'exhausted' || (g.status === 'active' && left <= 0) ? 'All gone.'
    : !live ? 'Closed.'
    : `${left} of ${g.qty} left${mins ? ` · ${mins} min to go` : ''} · one each`;
  return (
    <div className={`grab-card ${live && !mine ? '' : 'closed'}`} data-testid="giveaway">
      <ItemIcon id={g.item} size={40} />
      <span className="grow" style={{ minWidth: 0 }}>
        <div className="bold ellipsis">🎁 {g.title}</div>
        <div className="tiny ellipsis" style={{ opacity: 0.9 }}>{item?.name ?? g.item} · {line}</div>
      </span>
      {mine ? <span className="pill pill-xs pill-ok">✅ Yours</span>
        : owned || !live || left <= 0 ? null
        : <Button size="sm" disabled={busy} onClick={() => void claim()} data-testid="claim-giveaway">{busy ? '…' : 'Claim'}</Button>}
    </div>
  );
}
