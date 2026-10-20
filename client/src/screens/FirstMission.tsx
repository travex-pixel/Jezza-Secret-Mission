// The first 30 seconds: get the boys online (group selfie), roast Jezza, toast Jezza, then straight into a real
// challenge. Each step is a real mission (scored once, skippable without penalty). Steps already done are skipped,
// so replaying the intro from the ❓ sheet never double-dips. The groom just gets the selfie.
import { useMemo, useRef, useState } from 'react';
import { MISSION_BY_ID, STARTER_MISSION, rookieLeft } from '@shared/missions';
import { Button } from '../components/ui';
import { useStore, useIsGroom } from '../store';
import { MissionCard, compressImage } from '../components/MissionCard';
import { newClaimId, request } from '../net';
import { sfx } from '../audio';
import CameraSheet, { canUseLiveCamera } from '../components/CameraSheet';

type Step = 'selfie' | 'roast' | 'toast' | 'go';
const STEP_MISSION: Partial<Record<Step, string>> = { selfie: 'm001', roast: 'm002', toast: 'm003' };
const ROAST_IDEAS = ['Jezza\'s Year 9 haircut had its own postcode.', 'Jezza once did a whole UNSW group project. Allegedly.', 'Jezza says "five minutes away" from his couch.'];
const TOAST_IDEAS = ['Jezza is the bloke who turns up when it counts.', 'Best mate you could ask for. Worst at parallel parking.', 'Never once let a mate walk home alone.'];

export default function FirstMission() {
  const setFlow = useStore((s) => s.setFlow);
  const setTab = useStore((s) => s.setTab);
  const priv = useStore((s) => s.priv);
  const isGroom = useIsGroom();
  const active = (id: string | undefined) => !!id && !!priv?.hand.some((h) => h.missionId === id && h.status === 'active');
  // Only the steps still to do (fixed when the intro opens, so finishing one doesn't reshuffle the dots)
  const [steps] = useState<Step[]>(() => [...(isGroom ? ['selfie'] as Step[] : ['selfie', 'roast', 'toast'] as Step[]).filter((s) => active(STEP_MISSION[s])), 'go']);
  const [i, setI] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];
  const next = () => setI((n) => n + 1);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const claimId = useRef(newClaimId());
  const idea = useMemo(() => Math.floor(Math.random() * 3), []);

  const sendSelfie = async (getPhoto: () => Promise<string>) => {
    setBusy(true); setErr(null);
    try {
      const photo = await getPhoto();
      await request({ type: 'claimMission', missionId: STARTER_MISSION.id, claimId: claimId.current, photo });
      sfx.mission(); next();
    } catch (e) { setErr((e as Error).message || 'Could not read that photo. Try another.'); sfx.error(); claimId.current = newClaimId(); }
    finally { setBusy(false); }
  };
  const onFile = (f: File | undefined) => { if (f) void sendSelfie(() => compressImage(f)); };
  const postWall = async (kind: 'roast' | 'toast') => {
    setBusy(true); setErr(null);
    try { await request({ type: 'wallPost', kind, text }); sfx.mission(); setText(''); next(); }
    catch (e) { setErr((e as Error).message); sfx.error(); }
    finally { setBusy(false); }
  };
  const pass = () => { setErr(null); setText(''); next(); };
  const finish = () => { setTab('home'); setFlow('main'); };
  const n = steps.length - 1;
  const head = (eyebrow: string, title: string) => (
    <div className="center" style={{ marginTop: 2 }}>
      {n > 0 && <div className="tut-dots" aria-hidden>{steps.map((s, k) => <span key={s} className={k === i ? 'on' : k < i ? 'done' : ''} />)}</div>}
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="display title-lg" style={{ marginTop: 2 }}>{title}</h2>
    </div>
  );
  const stepNo = (s: Step) => `${steps.indexOf(s) + 1} of ${n}`;

  if (step === 'selfie') return (
    <div className="screen tut">
      {head(`Intro ${stepNo('selfie')}`, 'Get the boys online')}
      <div className="screen-body tut-body">
        <div className="panel pad center stack-6">
          <div className="bold" style={{ fontSize: 17 }}>Selfie with Jezza and at least two other lads.</div>
          <div className="small dim">Everyone has to look genuinely fired up. Counts straight away: <b className="gold-text" style={{ whiteSpace: 'nowrap' }}>+{STARTER_MISSION.points} pts · +{STARTER_MISSION.xp} XP</b></div>
        </div>
        <input ref={cam} type="file" accept="image/*" capture="user" data-selfie hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={lib} type="file" accept="image/*" data-selfie-library hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {camera && <CameraSheet facing="user" onClose={() => setCamera(false)} onFallback={() => cam.current?.click()} onPhoto={(photo) => { setCamera(false); void sendSelfie(async () => photo); }} />}
        {err && <div className="field-error center">{err}</div>}
        <Button onClick={() => (canUseLiveCamera() ? setCamera(true) : cam.current?.click())} disabled={busy}>{busy ? 'Sending…' : '📸 Take the selfie'}</Button>
        <div className="row" style={{ justifyContent: 'center', gap: 18, flexWrap: 'wrap' }}>
          <button className="small bold dim" disabled={busy} onClick={() => lib.current?.click()}>🖼️ Pick a photo</button>
          <button className="small bold dim" disabled={busy} onClick={pass}>Not with the boys yet? Do it later</button>
        </div>
        <div className="tiny faint center">It stays pinned to your challenges until you get it.</div>
      </div>
    </div>
  );

  if (step === 'roast' || step === 'toast') {
    const m = MISSION_BY_ID[STEP_MISSION[step]!];
    const roast = step === 'roast';
    return (
      <div className="screen tut">
        {head(`Intro ${stepNo(step)}`, roast ? 'Roast Jezza' : 'Toast Jezza')}
        <div className="screen-body tut-body">
          <div className="small center" style={{ fontWeight: 700 }}>{m?.instruction}</div>
          <textarea className="input" data-intro={step} style={{ minHeight: 84, padding: 12, fontSize: 16, resize: 'none' }} maxLength={140} value={text} onChange={(e) => setText(e.target.value)} placeholder={(roast ? ROAST_IDEAS : TOAST_IDEAS)[idea]} />
          <div className="row-between tiny faint" style={{ gap: 8 }}><span>{roast ? 'Goes on the Jezza Wall. Jezza can bin any roast, no questions asked.' : 'Goes on the Jezza Wall. The best get read out at the finale.'}</span><span>{text.length}/140</span></div>
          {err && <div className="field-error center">{err}</div>}
          <Button onClick={() => void postWall(step)} disabled={busy || text.trim().length < 6}>{busy ? '…' : roast ? `🔥 Post the roast · +${m?.points ?? 15}` : `🥂 Post the toast · +${m?.points ?? 15}`}</Button>
          <button className="small bold dim center" disabled={busy} onClick={pass}>Pass for now</button>
        </div>
      </div>
    );
  }

  // Done: straight into a real challenge
  const hand = priv?.hand.filter((h) => h.status === 'active') ?? [];
  const nextUp = hand.find((h) => !MISSION_BY_ID[h.missionId]?.tutorial) ?? hand[0];
  const nextM = nextUp && MISSION_BY_ID[nextUp.missionId];
  const left = rookieLeft(priv?.completedMissionIds ?? []);
  return (
    <div className="screen tut">
      <div className="center tut-done fade-up">
        <div className="display title-lg gold-text">The roast is open.</div>
        <div className="display title-md">The toast is locked in.</div>
        <div className="small bold dim" style={{ marginTop: 4 }}>Let's see what the boys really know.</div>
      </div>
      <div className="screen-body tut-body">
        {nextM && <><div className="eyebrow">Your next challenge</div><MissionCard mission={nextM} assignment={nextUp} /></>}
        {left > 0 && <div className="tiny center dim"><b>🚀 Rookie boost:</b> your next {left} challenges are easy, double XP and count straight away.</div>}
        <Button onClick={finish}>Let's go</Button>
      </div>
    </div>
  );
}
