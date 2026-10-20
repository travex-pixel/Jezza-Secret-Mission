import { useEffect, useState } from 'react';
import { CREATURES } from '@shared/creatures';
import { MISSION_BY_ID } from '@shared/missions';
import { Creature } from '../components/Creature';
import { Button, Sparkles } from '../components/ui';
import { useStore, useMe } from '../store';
import { request } from '../net';
import { sfx } from '../audio';

export default function Reveal() {
  const me = useMe();
  const setFlow = useStore((s) => s.setFlow);
  const priv = useStore((s) => s.priv);
  const [name, setName] = useState('');
  const [stage, setStage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (me?.creatureName && !name) setName(me.creatureName); }, [me?.creatureName]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t1 = setTimeout(() => setStage(1), 900); const t2 = setTimeout(() => setStage(2), 1700); return () => { clearTimeout(t1); clearTimeout(t2); }; }, []);
  if (!me?.creature) return null;
  const def = CREATURES[me.creature];

  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const trimmed = name.trim();
      if (trimmed && trimmed !== me.creatureName) await request({ type: 'renameCreature', creatureName: trimmed });
      sfx.mission();
      const intro = priv?.hand.some((h) => h.status === 'active' && MISSION_BY_ID[h.missionId]?.tutorial);
      setFlow(intro ? 'firstMission' : 'main');
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="screen">
      <div className="center" style={{ marginTop: 2 }}>
        <div className="eyebrow">Step 3 of 3</div>
        <h2 className="display title-lg gold-text" style={{ marginTop: 4 }}>A legend is born</h2>
      </div>
      <div className="screen-body" style={{ gap: 10 }}>
        <div className="stage grow" style={{ minHeight: 0 }}>
          <div className="stage-rays" /><div className="stage-pool" /><Sparkles n={18} />
          <Creature creature={me.creature} level={me.level} colorway={me.equipped.colorway} equipped={me.equipped} state={stage >= 1 ? 'victory' : 'enter'} animKey={stage >= 1 ? 'v' : 'e'} style={{ height: '100%', maxHeight: 300, width: 'auto', aspectRatio: '1', zIndex: 1 }} />
        </div>
        <div className={`center ${stage >= 1 ? 'fade-up' : ''}`} style={{ opacity: stage >= 1 ? 1 : 0 }}>
          <p className="bold" style={{ fontSize: 15 }}>Your legend begins. <span className="dim">Your judgement may not survive the weekend.</span></p>
        </div>
        <div className={`row ${stage >= 2 ? 'fade-up' : ''}`} style={{ justifyContent: 'center', gap: 8, opacity: stage >= 2 ? 1 : 0, flexWrap: 'wrap' }}>
          <span className="pill pill-gold">🏅 Badge: First Steps</span>
          <span className="pill pill-ember">🎁 Unlocked: Party Cone</span>
        </div>
        <div className={`panel pad stack-10 ${stage >= 2 ? 'fade-up' : ''}`} style={{ opacity: stage >= 2 ? 1 : 0 }}>
          <label>
            <span className="label">Name your {def.name}</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder={def.defaultName} enterKeyHint="done" onKeyDown={(e) => e.key === 'Enter' && go()} />
          </label>
          {err && <div className="field-error">{err}</div>}
          <Button onClick={go} disabled={busy || stage < 2}>{busy ? '…' : 'Take your first challenge'}</Button>
        </div>
      </div>
    </div>
  );
}
