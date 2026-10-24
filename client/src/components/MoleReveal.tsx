// The moment a lad learns they are the Mole: a full-screen briefing that explains the whole job in plain words,
// shows their three secret missions and how the points work. Shows itself once per set of missions on this phone
// (so a Mole picked while nobody was connected still gets it), and the Mole can reopen it any time from the
// Challenges tab. Only the Mole ever receives the data this reads.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MOLE_POINTS } from '@shared/saturday';
import { Button } from './ui';
import { useStore } from '../store';
import { sfx } from '../audio';
import { buzz } from '../haptics';

const key = (code: string, missions: { text: string }[]) => `hvl-mole-${code}-${missions.map((m) => m.text.length).join('.')}`;
const seen = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };

export function useMoleReveal(code: string | undefined, missions: { text: string; done: boolean }[] | undefined) {
  const [open, setOpen] = useState(false);
  const k = code && missions ? key(code, missions) : null;
  useEffect(() => { if (k && !seen(k)) { setOpen(true); sfx.sting(); buzz([30, 40, 30, 40, 80]); } }, [k]);
  const close = () => { if (k) { try { localStorage.setItem(k, '1'); } catch { /* fine */ } } setOpen(false); };
  return { open, show: () => setOpen(true), close };
}

export default function MoleReveal({ missions, onClose }: { missions: { text: string; done: boolean }[]; onClose: () => void }) {
  const setTab = useStore((s) => s.setTab);
  const go = () => { onClose(); useStore.setState({ missionsTab: 'mine' }); setTab('missions'); sfx.tap(); };
  return createPortal(
    <div className="mole-reveal" data-testid="mole-reveal">
      <div className="mole-reveal-inner stack-10">
        <div className="mole-reveal-badge">🤫</div>
        <div className="eyebrow center" style={{ color: '#ffb48f' }}>Top secret · only you can see this</div>
        <div className="display title-xl center">YOU ARE<br />THE MOLE</div>
        <div className="small center" style={{ opacity: .9 }}>The lads have been told a Mole is loose. They don't know it's you. Keep it that way.</div>
        <div className="panel pad stack-6 mole-reveal-card">
          <div className="bold small">Your job, in three lines</div>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}><span>1️⃣</span><span className="small">Pull off the <b>secret missions</b> below in real life. Nobody confirms them. When one's done, tap <b>Did it</b> on the Challenges tab. <b>+{MOLE_POINTS.mission} each</b>, and it never shows in the feed.</span></div>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}><span>2️⃣</span><span className="small"><b>Don't get caught.</b> Everyone is voting on who the Mole is from their Lobby. When the host does the reveal, if more than half of them named you, you're caught.</span></div>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}><span>3️⃣</span><span className="small"><b>Payout at the reveal:</b> got away with it <b>+{MOLE_POINTS.escaped}</b>, caught <b>+{MOLE_POINTS.caught}</b>. Play normal challenges as usual. Accuse someone else loudly. Enjoy yourself.</span></div>
        </div>
        <div className="panel pad stack-6 mole-reveal-card">
          <div className="bold small">Your secret missions</div>
          {missions.map((m, i) => <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start' }}><span className="bold" style={{ color: '#ffb48f' }}>{m.done ? '✅' : `${i + 1}.`}</span><span className="small" style={{ textDecoration: m.done ? 'line-through' : 'none', opacity: m.done ? .6 : 1 }}>{m.text}</span></div>)}
        </div>
        <div className="tiny center dim">Find all this again any time: Lobby → the orange "You are the Mole" strip, or Challenges → Mine → top.</div>
        <Button onClick={go} data-testid="mole-reveal-go">Got it. Shh. Show me the missions</Button>
        <button className="tiny bold center" style={{ color: 'var(--text-dim)', background: 'none', border: 0, padding: 8 }} onClick={onClose}>Close</button>
      </div>
    </div>,
    document.body,
  );
}
