// A Rowdy Round on a phone: the prompt, the clock, and for Most Likely To a tap-a-lad list. The forfeit is the
// room's business; the app only counts votes.
import { useState } from 'react';
import { ROWDY_KINDS } from '@shared/rowdy';
import { fmtClock } from '@shared/ceremony';
import { Button, Sheet, useCountdown } from './ui';
import { LadPic } from './Creature';
import { useStore, useMe } from '../store';
import { request } from '../net';
import { sfx } from '../audio';
import { useTheme } from '../theme';

export default function RowdyCard() {
  const party = useStore((s) => s.party);
  const priv = useStore((s) => s.priv);
  const toast = useStore((s) => s.toast);
  const me = useMe();
  const th = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const r = party?.rowdy;
  const left = useCountdown(r && !r.revealed ? r.endsAt : undefined);
  if (!party || !me || !r) return null;
  const def = ROWDY_KINDS[r.kind];
  const line = r.kind === 'mostLikely' ? `Most likely to ${r.prompt}` : r.kind === 'neverHaveIEver' ? `Never have I ever ${r.prompt}` : r.kind === 'categories' ? `Categories: ${r.prompt}` : `New rule: ${r.prompt}`;
  const nick = (id: string) => party.players.find((p) => p.id === id)?.nickname ?? '?';
  const top = r.tally?.[0];
  const vote = async (id: string) => {
    if (busy) return; setBusy(true);
    try { await request({ type: 'rowdyVote', targetId: id }); sfx.select(); toast(`Named ${nick(id)}. Change it any time before the clock runs out.`, '👉', 'success'); setOpen(false); }
    catch (e) { toast((e as Error).message, '⚠️', 'warn'); }
    finally { setBusy(false); }
  };
  return (
    <>
      <button className={`panel rowdy-card ${r.revealed ? 'done' : ''}`} onClick={() => def.vote && !r.revealed && setOpen(true)} data-testid="rowdy-card">
        <span style={{ fontSize: 26 }}>{def.emoji}</span>
        <span className="grow" style={{ minWidth: 0, textAlign: 'left' }}>
          <div className="tiny bold" style={{ color: 'var(--gold)', letterSpacing: '.08em' }}>🍻 ROWDY ROUND · {def.label.toUpperCase()}</div>
          <div className="bold">{line}</div>
          <div className="tiny" style={{ opacity: .85 }}>{r.revealed ? (def.vote ? (top ? `${nick(top.playerId)} with ${top.n} vote${top.n === 1 ? '' : 's'}. ${th.theme.features.drinks ? 'You know what to do.' : 'Dare time.'}` : 'Nobody voted. Soft.') : 'Round over.') : def.vote ? (priv?.rowdyVote ? `You named ${nick(priv.rowdyVote)} · tap to change` : 'Tap to name a lad') : def.blurb}</div>
        </span>
        {!r.revealed && <span className="spot-clock" style={{ fontSize: 22 }}>{fmtClock(left)}</span>}
      </button>
      {open && (
        <Sheet onClose={() => setOpen(false)}>
          <div className="stack-10">
            <div className="eyebrow center">👉 Most likely to {r.prompt}</div>
            <div className="small center dim">Name someone. The most-named person {th.theme.copy.forfeit}. {left}s left.</div>
            <div className="scroll-y stack-6" style={{ maxHeight: '48vh' }}>
              {party.players.filter((p) => p.creature).sort((a, b) => a.nickname.localeCompare(b.nickname)).map((p) => (
                <button key={p.id} className={`list-row ${priv?.rowdyVote === p.id ? 'me' : ''}`} style={{ width: '100%', textAlign: 'left' }} disabled={busy} onClick={() => void vote(p.id)} data-testid="rowdy-pick">
                  <span className="avatar sm"><LadPic p={p} /></span><span className="grow bold">{p.nickname}{p.id === me.id ? ' (you)' : ''}</span>
                  {priv?.rowdyVote === p.id && <span className="pill pill-xs pill-gold">named</span>}
                </button>
              ))}
            </div>
            <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
