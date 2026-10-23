// Opening a Lucky Drop: the crate shakes, cracks, bursts in its rarity colour and the prize floats up. The whole
// screen goes dark for it so it lands like a moment, not a notification. Epic and Legendary get the full
// fireworks; Common is quick so it never gets old.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { COSMETIC_BY_ID } from '@shared/progression';
import { RARITY, type Drop } from '@shared/saturday';
import { ItemIcon } from './Creature';
import { request } from '../net';
import { useStore } from '../store';
import { sfx } from '../audio';
import { buzz } from '../haptics';

type Stage = 'closed' | 'shaking' | 'cracking' | 'open';

export default function DropOverlay({ drop, onClose }: { drop: Drop; onClose: () => void }) {
  const toast = useStore((s) => s.toast);
  const [stage, setStage] = useState<Stage>('closed');
  const [result, setResult] = useState<Drop | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const meta = RARITY[drop.rarity];
  const big = drop.rarity === 'epic' || drop.rarity === 'legendary';
  const open = async () => {
    if (stage !== 'closed') return;
    setStage('shaking'); sfx.tap(); buzz([20, 30, 20, 30, 40]);
    try {
      const r = await request<{ drop: Drop }>({ type: 'openDrop', dropId: drop.id });
      setResult(r.drop);
      // let the shake run, then crack, then reveal; longer for the big ones
      setTimeout(() => { setStage('cracking'); sfx.sting(); buzz(big ? [60, 40, 120] : [40]); }, big ? 1400 : 800);
      setTimeout(() => { setStage('open'); (big ? sfx.reveal : sfx.reward)(); }, big ? 2300 : 1400);
    } catch (e) { setErr((e as Error).message); setStage('closed'); toast((e as Error).message, '⚠️', 'warn'); }
  };
  useEffect(() => { const t = setTimeout(open, 350); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const item = result?.item ? COSMETIC_BY_ID[result.item] : undefined;
  const bursts = Array.from({ length: big ? 28 : 14 }, (_, i) => ({ dx: `${Math.cos((i / (big ? 28 : 14)) * Math.PI * 2) * (110 + (i % 3) * 50)}px`, dy: `${Math.sin((i / (big ? 28 : 14)) * Math.PI * 2) * (110 + (i % 3) * 50)}px`, d: `${(i % 5) * 40}ms` }));
  return createPortal(
    <div className={`drop-overlay r-${drop.rarity} s-${stage}`} style={{ ['--rc' as string]: meta.color }} onClick={() => stage === 'open' && onClose()} data-testid="drop-overlay">
      <div className="drop-glow" />
      {stage === 'open' && bursts.map((b, i) => <i key={i} className="drop-burst" style={{ ['--dx' as string]: b.dx, ['--dy' as string]: b.dy, animationDelay: b.d }} />)}
      {stage === 'open' && big && Array.from({ length: 10 }, (_, i) => <i key={`r${i}`} className="drop-ray" style={{ transform: `rotate(${i * 36}deg)` }} />)}
      <div className="drop-rarity">{stage === 'open' ? meta.label.toUpperCase() : drop.source === 'morning' ? 'MORNING DROP' : 'LUCKY DROP'}</div>
      <div className="drop-crate" onClick={(e) => { if (stage === 'open') return; e.stopPropagation(); void open(); }} role="button" aria-label="Open the drop">
        {stage !== 'open' ? (
          <div className="crate">
            <div className="crate-lid" /><div className="crate-box" /><div className="crate-lock">★</div>
            {stage === 'cracking' && <div className="crate-crack" />}
          </div>
        ) : (
          <div className="drop-prize fade-up">
            {item ? <div className="drop-item"><ItemIcon id={item.id} size={96} /></div> : <div className="drop-points-big">+{result?.points}</div>}
            <div className="display title-lg drop-name">{item ? item.name : 'POINTS'}</div>
            {item && <div className="small dim" style={{ maxWidth: '28ch' }}>{item.description.replace(/^Lucky Drop\. /, '')}</div>}
            <div className="row" style={{ gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              {!!result?.points && item && <span className="pill pill-gold">+{result.points} pts</span>}
              {!!result?.xp && <span className="pill pill-gold">+{result.xp} XP</span>}
              {item && <span className="pill" style={{ borderColor: meta.color, color: meta.color }}>{item.slot === 'hat' ? '🎩 Hat' : item.slot === 'face' ? '🕶️ Face' : item.slot === 'cape' ? '🧣 Cape' : '✨ Aura'} · wear it on Me</span>}
            </div>
          </div>
        )}
      </div>
      <div className="drop-foot">{stage === 'closed' ? (err ?? 'Tap the crate') : stage === 'open' ? 'tap to continue' : big ? 'Oh. Oh this is a good one.' : '…'}</div>
    </div>,
    document.body,
  );
}
