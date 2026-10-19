import { useEffect, useState } from 'react';
import { CREATURES, GROOM_CREATURE, starterTrio } from '@shared/creatures';
import type { CreatureId } from '@shared/types';
import { Creature } from '../components/Creature';
import { Button, Sparkles } from '../components/ui';
import { useStore, useIsGroom } from '../store';
import { request } from '../net';
import { sfx } from '../audio';
import { buzz } from '../haptics';

export default function ChooseCreature() {
  const playerId = useStore((s) => s.identity.playerId);
  const setFlow = useStore((s) => s.setFlow);
  const [offset, setOffset] = useState(0);
  const isGroom = useIsGroom();
  // the groom doesn't choose: the Golden Stag was always his
  const trio = isGroom ? [GROOM_CREATURE] : starterTrio(playerId, offset);
  const [picked, setPicked] = useState<CreatureId>(trio[0]);
  const [animKey, setAnimKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setPicked(trio[0]); setAnimKey((k) => k + 1); }, [offset, isGroom]); // eslint-disable-line react-hooks/exhaustive-deps
  const def = CREATURES[picked];

  const pick = (id: CreatureId) => { if (id === picked) return; setPicked(id); setAnimKey((k) => k + 1); sfx.select(); buzz(10); };
  const adopt = async () => {
    setBusy(true); setErr(null);
    try { await request({ type: 'chooseCreature', creature: picked }); sfx.reveal(); buzz([30, 40, 60]); setFlow('reveal'); }
    catch (e) { setErr((e as Error).message); sfx.error(); setBusy(false); }
  };

  return (
    <div className="screen">
      <div className="center" style={{ marginTop: 2 }}>
        <div className="eyebrow">Step 2 of 3</div>
        <h2 className="display title-lg" style={{ marginTop: 4 }}>{isGroom ? 'Your legend awaits' : 'Choose your legend'}</h2>
      </div>
      <div className="screen-body" style={{ gap: 10 }}>
        <div className="stage grow" style={{ minHeight: 0 }}>
          <div className="stage-rays" /><div className="stage-pool" /><Sparkles n={12} />
          <Creature creature={picked} state="select" animKey={animKey} style={{ height: '100%', maxHeight: 300, width: 'auto', aspectRatio: '1', zIndex: 1 }} />
        </div>
        <div className="center pick-info">
          <div className="display title-md gold-text" key={picked}>{def.name}</div>
          <div className="small bold dim" style={{ marginTop: 2 }}>{def.tagline}</div>
          <div className="small" style={{ marginTop: 4, fontWeight: 700, color: 'var(--text)' }}>{def.personality}</div>
        </div>
        {isGroom ? (
          <div className="panel panel-gold pad center small bold">🤵 Groom only. Nobody else in the party can get this one.</div>
        ) : <div className="pick-grid">
          {trio.map((id) => (
            <button key={id} className={`pick-card ${picked === id ? 'on' : ''}`} onClick={() => pick(id)} aria-pressed={picked === id}>
              <Creature creature={id} bare state={picked === id ? 'happy' : 'idle'} animKey={picked === id ? animKey : 0} />
              <span className="pick-name">{CREATURES[id].name}</span>
            </button>
          ))}
        </div>}
        <div className="seg" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          <div className="stat"><b>{def.stats.hp}</b><span>HP</span></div>
          <div className="stat"><b>{def.stats.atk}</b><span>ATK</span></div>
          <div className="stat"><b>{def.stats.def}</b><span>DEF</span></div>
          <div className="stat"><b>{def.stats.spd}</b><span>SPD</span></div>
        </div>
        {err && <div className="field-error center">{err}</div>}
        <div className="row" style={{ gap: 8 }}>
          {!isGroom && <Button variant="secondary" size="sm" onClick={() => setOffset((o) => (o + 1) % 3)} style={{ minHeight: 56, flex: '0 0 auto' }}>↻ Others</Button>}
          <Button onClick={adopt} disabled={busy}>{busy ? 'Adopting…' : `Adopt ${def.defaultName}`}</Button>
        </div>
      </div>
    </div>
  );
}
