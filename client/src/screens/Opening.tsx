import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { VineyardFallback } from '../components/VineyardScene';
import { Creature } from '../components/Creature';
import { Button, ConnectionPill, MuteButton } from '../components/ui';
import { useStore, useMe } from '../store';
import { sfx, unlockAudio } from '../audio';
import { CREATURE_IDS } from '@shared/creatures';

const VineyardScene = lazy(() => import('../components/VineyardScene'));

function webglOk(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export default function Opening() {
  const setFlow = useStore((s) => s.setFlow);
  const party = useStore((s) => s.party);
  const me = useMe();
  const [use3d, setUse3d] = useState(() => webglOk() && new URLSearchParams(location.search).get('no3d') !== '1');
  const onFail = useCallback(() => setUse3d(false), []);
  const [hero] = useState(() => CREATURE_IDS[Math.floor(Math.random() * CREATURE_IDS.length)]);
  const conn = useStore((s) => s.conn);
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 150); return () => clearTimeout(t); }, []);

  const enter = () => {
    unlockAudio(); sfx.sting();
    if (party && me?.creature) setFlow('main');
    else if (party && me) setFlow('choose');
    else setFlow('join');
  };

  return (
    <div className="screen" style={{ padding: 0 }}>
      {use3d ? <Suspense fallback={<VineyardFallback />}><VineyardScene onFail={onFail} /></Suspense> : <VineyardFallback />}
      <div className="hero-vignette" />
      <MuteButton />
      {conn !== 'online' && <div style={{ position: 'absolute', top: 'calc(var(--sat) + 18px)', left: 16 }}><ConnectionPill /></div>}
      <div className="hero-creature" style={{ filter: 'brightness(0.22) contrast(1.3) drop-shadow(0 0 28px rgba(229,173,72,.45))', opacity: ready ? 1 : 0, transition: 'opacity 900ms ease' }}>
        <Creature creature={hero} bare />
      </div>
      <div className="hero-content">
        <div className="hero-tag fade-up">THE PARTY GAME</div>
        <h1 className="hero-title gold-text fade-up delay-1">ALL-<br />STARS</h1>
        <p className="hero-sub fade-up delay-2">Your people. One party. A game to tie it together.</p>
        <div style={{ width: '100%', maxWidth: 380, marginTop: 8 }} className="fade-up delay-3">
          <Button onClick={enter} sound={false}>Enter the Vineyard</Button>
        </div>
        <div className="faint tiny fade-up delay-4">No sign-up. No app. Just legends. <a href="/privacy.html" style={{ color: 'inherit', textDecoration: 'underline' }}>Privacy</a></div>
      </div>
    </div>
  );
}
