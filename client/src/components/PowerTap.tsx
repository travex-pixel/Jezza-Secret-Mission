import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TapQuality } from '@shared/types';
import { TAP_BAR_MS } from '@shared/battle';
import { sfx } from '../audio';
import { buzz } from '../haptics';

const PERFECT = 0.17; // half-width of the gold zone (fraction of the bar)
const GOOD = 0.30;    // half-width of the "good" zone

/** One-tap timing bar: a marker slides across; tap to stop it. Resolves perfect / good / miss. */
export default function PowerTap({ label, onDone }: { label: string; onDone: (q: TapQuality, pos: number) => void }) {
  const start = useRef(performance.now());
  const done = useRef(false);
  const [result, setResult] = useState<{ q: TapQuality; pos: number } | null>(null);
  const finish = (pos: number) => {
    if (done.current) return; done.current = true;
    const d = Math.abs(pos - 0.5);
    const q: TapQuality = d <= PERFECT ? 'perfect' : d <= GOOD ? 'good' : 'miss';
    setResult({ q, pos });
    if (q === 'perfect') { sfx.reward(); buzz([20, 20, 40]); } else if (q === 'good') { sfx.select(); buzz(15); } else { sfx.tap(); }
    setTimeout(() => onDone(q, pos), 520);
  };
  useEffect(() => {
    const t = setTimeout(() => finish(1), TAP_BAR_MS + 150); // no tap: marker runs off the end
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const tap = () => finish(Math.min(1, (performance.now() - start.current) / TAP_BAR_MS));
  // Portal to <body>: the whole screen, including the action buttons and bottom nav, is the tap target.
  return createPortal(
    <div className="pt-screen" onPointerDown={tap} role="button" aria-label="Tap anywhere to stop the marker">
    <div className="powertap">
      <div className="eyebrow">{label}</div>
      <div className="display title-md">{result ? (result.q === 'perfect' ? 'CRIT!' : result.q === 'good' ? 'Solid hit' : 'Whiff…') : 'TAP IN THE GOLD'}</div>
      <div className="pt-bar">
        <i className="pt-zone good" style={{ left: `${(0.5 - GOOD) * 100}%`, width: `${GOOD * 200}%` }} />
        <i className="pt-zone perfect" style={{ left: `${(0.5 - PERFECT) * 100}%`, width: `${PERFECT * 200}%` }} />
        <i className={`pt-marker ${result ? 'stopped' : ''} ${result?.q ?? ''}`} style={result ? { left: `${result.pos * 100}%`, animation: 'none' } : { animationDuration: `${TAP_BAR_MS}ms` }} />
      </div>
      <div className="tiny faint">{result ? (result.q === 'perfect' ? '+22% damage' : result.q === 'good' ? '+8% damage' : 'normal damage') : 'tap anywhere on the screen'}</div>
    </div>
    </div>,
    document.body,
  );
}
