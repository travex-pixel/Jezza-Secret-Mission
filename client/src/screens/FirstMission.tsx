// The 30-second tutorial: snap a selfie (instant points, straight to Level 2), then the whole game in three lines.
import { useEffect, useRef, useState } from 'react';
import { STARTER_MISSION, rookieLeft } from '@shared/missions';
import { Button, Sparkles } from '../components/ui';
import { useStore, useMe } from '../store';
import { Creature } from '../components/Creature';
import { HowItWorksBasics } from '../components/HowItWorks';
import { compressImage } from '../components/MissionCard';
import { newClaimId, request } from '../net';
import { sfx } from '../audio';

export default function FirstMission() {
  const setFlow = useStore((s) => s.setFlow);
  const setTab = useStore((s) => s.setTab);
  const priv = useStore((s) => s.priv);
  const reward = useStore((s) => s.reward);
  const me = useMe();
  const assignment = priv?.hand.find((h) => h.missionId === STARTER_MISSION.id);
  const [step, setStep] = useState<'snap' | 'done'>('snap');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const claimId = useRef(newClaimId());
  // Selfie counted and the reward pop-up closed: on to the last step.
  useEffect(() => { if (assignment?.status === 'done' && !reward) setStep('done'); }, [assignment?.status, reward]);
  useEffect(() => { if (priv && !assignment && step === 'snap') setStep('done'); }, [priv, assignment, step]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try {
      const photo = await compressImage(f);
      await request({ type: 'claimMission', missionId: STARTER_MISSION.id, claimId: claimId.current, photo });
      sfx.mission();
    } catch (e) { setErr((e as Error).message || 'Could not read that photo. Try another.'); sfx.error(); claimId.current = newClaimId(); }
    finally { setBusy(false); }
  };
  const finish = () => { setTab('home'); setFlow('main'); };
  const dots = <div className="tut-dots" aria-hidden><span className={step === 'snap' ? 'on' : ''} /><span className={step === 'done' ? 'on' : ''} /></div>;

  if (step === 'done') {
    const left = rookieLeft(me?.missionsCompleted ?? 0);
    return (
      <div className="screen">
        <div className="center" style={{ marginTop: 2 }}>
          {dots}
          <div className="eyebrow">You're in</div>
          <h2 className="display title-lg gold-text" style={{ marginTop: 4 }}>{me && me.level >= 2 ? `Level ${me.level} already` : 'That\'s the game'}</h2>
        </div>
        <div className="screen-body" style={{ gap: 12, justifyContent: 'center' }}>
          {me?.creature && <div className="center fm-creature" style={{ position: 'relative' }}><Sparkles n={10} /><Creature creature={me.creature} level={me.level} colorway={me.equipped.colorway} equipped={me.equipped} state="victory" style={{ width: 'min(34vw, 130px)', margin: '0 auto' }} /></div>}
          <div className="fade-up"><HowItWorksBasics /></div>
          {left > 0 && <div className="panel panel-gold pad center small fade-up delay-1"><b>🚀 Rookie boost:</b> your next {left} challenges are easy, give double XP and count straight away.</div>}
          <Button onClick={finish}>Let's go</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="center" style={{ marginTop: 2 }}>
        {dots}
        <div className="eyebrow">Your first challenge</div>
        <h2 className="display title-lg" style={{ marginTop: 4 }}>Say cheese</h2>
      </div>
      <div className="screen-body" style={{ gap: 14, justifyContent: 'center' }}>
        {me?.creature && <div className="center"><Creature creature={me.creature} level={me.level} colorway={me.equipped.colorway} equipped={me.equipped} state="happy" style={{ width: 'min(40vw, 160px)', margin: '0 auto' }} /></div>}
        <div className="panel pad center stack-6 fade-up">
          <div className="bold" style={{ fontSize: 17 }}>Snap a selfie so the lads know you're in.</div>
          <div className="small dim">Takes 5 seconds. Counts straight away: <b className="gold-text" style={{ whiteSpace: 'nowrap' }}>+{STARTER_MISSION.points} pts · +{STARTER_MISSION.xp} XP</b></div>
        </div>
        <input ref={cam} type="file" accept="image/*" capture="user" data-selfie hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={lib} type="file" accept="image/*" data-selfie-library hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {err && <div className="field-error center">{err}</div>}
        <Button onClick={() => cam.current?.click()} disabled={busy}>{busy ? 'Sending…' : '📸 Take a selfie'}</Button>
        <div className="row" style={{ justifyContent: 'center', gap: 18 }}>
          <button className="small bold dim" disabled={busy} onClick={() => lib.current?.click()}>🖼️ Pick a photo instead</button>
          <button className="small bold dim" disabled={busy} onClick={() => setStep('done')}>Do it later</button>
        </div>
      </div>
    </div>
  );
}
