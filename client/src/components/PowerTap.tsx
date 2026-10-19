import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TapQuality } from '@shared/types';
import { POWER_BONUS, TAP_SWEEP_MS, powerMult, qualityFor } from '@shared/battle';
import { sfx } from '../audio';
import { buzz } from '../haptics';

const GIVE_UP_MS = 5000; // nobody can stall a fight: no tap in 5s counts as a whiff

/** Marker position 0..1 at time t: back and forth, at a constant speed, until you tap. */
const swing = (t: number) => { const x = (t / TAP_SWEEP_MS) % 2; return x < 1 ? x : 2 - x; };
/** 0 at either end of the bar, 1 dead centre. */
const accuracy = (pos: number) => Math.max(0, 1 - Math.abs(pos - 0.5) / 0.5);
const label = (p: number) => (p >= 0.9 ? 'PERFECT ⚡' : p >= 0.75 ? 'GREAT!' : p >= 0.5 ? 'Good hit' : p >= 0.25 ? 'Meh' : 'Whiff…');

/** Oscillating timing bar: tap anywhere; the closer to the middle, the harder the hit. */
export default function PowerTap({ label: title, onDone }: { label: string; onDone: (power: number, q: TapQuality) => void }) {
  const start = useRef(performance.now());
  const marker = useRef<HTMLElement>(null);
  const done = useRef(false);
  const [result, setResult] = useState<{ power: number; pos: number } | null>(null);
  const finish = (pos: number, power: number) => {
    if (done.current) return; done.current = true;
    setResult({ power, pos });
    const q = qualityFor(power);
    if (q === 'perfect') { sfx.reward(); buzz([20, 20, 40]); } else if (power >= 0.5) { sfx.select(); buzz(15); } else { sfx.tap(); }
    setTimeout(() => onDone(power, q), 560);
  };
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      if (done.current) return;
      const t = performance.now() - start.current;
      if (marker.current) marker.current.style.left = `${swing(t) * 100}%`;
      if (t > GIVE_UP_MS) { finish(swing(t), 0); return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const tap = () => { const pos = swing(performance.now() - start.current); finish(pos, accuracy(pos)); };
  const bonus = result ? Math.round((powerMult(result.power) - 1) * 100) : 0;
  // Portal to <body>: the whole screen, including the action buttons and bottom nav, is the tap target.
  return createPortal(
    <div className="pt-screen" onPointerDown={tap} role="button" aria-label="Tap anywhere to stop the marker">
      <div className="powertap">
        <div className="eyebrow">{title}</div>
        <div className="display title-md">{result ? label(result.power) : 'TAP IN THE MIDDLE'}</div>
        <div className="pt-bar pt-heat">
          <i className="pt-centre" />
          <i ref={marker} className={`pt-marker ${result ? `stopped ${qualityFor(result.power)}` : ''}`} style={result ? { left: `${result.pos * 100}%` } : { left: '0%', animation: 'none' }} />
        </div>
        <div className="tiny faint">{result ? (bonus > 0 ? `+${bonus}% damage` : 'normal damage') : `closer to the middle = harder hit (up to +${Math.round(POWER_BONUS * 100)}%) · tap anywhere`}</div>
      </div>
    </div>,
    document.body,
  );
}
