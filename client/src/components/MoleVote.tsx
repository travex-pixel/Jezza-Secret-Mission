// Who's the Mole? One name per Mole in play (tap to name, tap again to take it back), changeable until the host
// reveals. Nobody sees who you picked.
import { useState } from 'react';
import { Button, Sheet } from './ui';
import { LadPic } from './Creature';
import { useStore, useMe } from '../store';
import { request } from '../net';
import { sfx } from '../audio';

export default function MoleVote({ onClose }: { onClose: () => void }) {
  const party = useStore((s) => s.party);
  const priv = useStore((s) => s.priv);
  const toast = useStore((s) => s.toast);
  const me = useMe();
  const [busy, setBusy] = useState(false);
  if (!party || !me) return null;
  const lads = party.players.filter((p) => p.creature && p.id !== me.id && !p.isHost).sort((a, b) => a.nickname.localeCompare(b.nickname));
  const count = party.mole?.count ?? 1;
  const picks = priv?.moleVotes ?? [];
  const vote = async (id: string) => {
    if (busy) return; setBusy(true);
    try {
      const r = await request<{ suspectIds: string[] }>({ type: 'moleVote', suspectId: id }); sfx.select();
      if (r.suspectIds.length >= count) { toast(count > 1 ? 'Names in. Change them any time before the reveal.' : 'Vote in. You can change it any time before the reveal.', '🕵️', 'success'); onClose(); }
    }
    catch (e) { toast((e as Error).message, '⚠️', 'warn'); }
    finally { setBusy(false); }
  };
  return (
    <Sheet onClose={onClose}>
      <div className="stack-10">
        <div className="eyebrow center">🕵️ Who{count > 1 ? ' are the Moles' : '\'s the Mole'}?</div>
        <div className="small center dim">{count > 1 ? `${count} of the lads have` : 'One of the lads has'} secret missions to mess with the weekend. Name {count > 1 ? `up to ${count}` : 'who'}. Every right name scores at the reveal.</div>
        {count > 1 && <div className="tiny center bold" data-testid="mole-picks">{picks.length}/{count} named</div>}
        <div className="scroll-y stack-6" style={{ maxHeight: '48vh' }}>
          {lads.map((p) => (
            <button key={p.id} className={`list-row ${picks.includes(p.id) ? 'me' : ''}`} style={{ width: '100%', textAlign: 'left' }} disabled={busy} onClick={() => void vote(p.id)} data-testid="mole-suspect">
              <span className="avatar sm"><LadPic p={p} /></span>
              <span className="grow bold">{p.nickname}</span>
              {picks.includes(p.id) && <span className="pill pill-xs pill-gold">your pick</span>}
            </button>
          ))}
        </div>
        <Button variant="ghost" onClick={onClose}>{picks.length ? 'Done' : 'Not yet'}</Button>
      </div>
    </Sheet>
  );
}
