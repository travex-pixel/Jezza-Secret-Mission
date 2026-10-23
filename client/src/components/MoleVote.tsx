// Who's the Mole? One vote each, changeable until the host reveals. Nobody sees who you picked.
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
  const lads = party.players.filter((p) => p.creature && p.id !== me.id).sort((a, b) => a.nickname.localeCompare(b.nickname));
  const vote = async (id: string) => {
    if (busy) return; setBusy(true);
    try { await request({ type: 'moleVote', suspectId: id }); sfx.select(); toast('Vote in. You can change it any time before the reveal.', '🕵️', 'success'); onClose(); }
    catch (e) { toast((e as Error).message, '⚠️', 'warn'); }
    finally { setBusy(false); }
  };
  return (
    <Sheet onClose={onClose}>
      <div className="stack-10">
        <div className="eyebrow center">🕵️ Who's the Mole?</div>
        <div className="small center dim">One of the lads has secret missions to mess with the weekend. Pick who. Right guesses score at the reveal.</div>
        <div className="scroll-y stack-6" style={{ maxHeight: '48vh' }}>
          {lads.map((p) => (
            <button key={p.id} className={`list-row ${priv?.moleVote === p.id ? 'me' : ''}`} style={{ width: '100%', textAlign: 'left' }} disabled={busy} onClick={() => void vote(p.id)} data-testid="mole-suspect">
              <span className="avatar sm"><LadPic p={p} /></span>
              <span className="grow bold">{p.nickname}</span>
              {priv?.moleVote === p.id && <span className="pill pill-xs pill-gold">your pick</span>}
            </button>
          ))}
        </div>
        <Button variant="ghost" onClick={onClose}>Not yet</Button>
      </div>
    </Sheet>
  );
}
