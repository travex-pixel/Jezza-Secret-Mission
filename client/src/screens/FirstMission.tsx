// The first 30 seconds: group selfie, roast Jezza, toast Jezza, then into the game. Each step is a real mission
// (scored once, passable without penalty). Every screen has one job and one big button; after each step you see
// what you earned and a button that names the next step, so nobody has to guess the order. Steps already done
// are skipped, so replaying the intro from ❓ never double-dips. The groom just gets the selfie.
import { useRef, useState } from 'react';
import { ACHIEVEMENT_BY_ID } from '@shared/progression';
import { MISSION_BY_ID, STARTER_MISSION, rookieLeft } from '@shared/missions';
import { Button } from '../components/ui';
import { useStore, useIsGroom } from '../store';
import { MissionCard, compressImage } from '../components/MissionCard';
import { newClaimId, request } from '../net';
import { sfx } from '../audio';
import CameraSheet, { canUseLiveCamera } from '../components/CameraSheet';

type Step = 'selfie' | 'roast' | 'toast';
const STEP_MISSION: Record<Step, string> = { selfie: 'm001', roast: 'm002', toast: 'm003' };
const STEP_LABEL: Record<Step, string> = { selfie: 'Selfie', roast: 'Roast', toast: 'Toast' };
const STEP_ICON: Record<Step, string> = { selfie: '📸', roast: '🔥', toast: '🥂' };
const NEXT_LABEL: Record<Step, string> = { selfie: 'Next: roast Jezza →', roast: 'Next: toast Jezza →', toast: 'Next: start playing →' };
const ROAST_IDEAS = ['Jezza\'s Year 9 haircut had its own postcode.', 'Jezza once did a whole UNSW group project. Allegedly.', 'Jezza says "five minutes away" from his couch.'];
const TOAST_IDEAS = ['Jezza is the bloke who turns up when it counts.', 'Best mate you could ask for. Worst at parallel parking.', 'Never once let a mate walk home alone.'];

export default function FirstMission() {
  const endIntro = useStore((s) => s.endIntro);
  const priv = useStore((s) => s.priv);
  const introRewards = useStore((s) => s.introRewards);
  const isGroom = useIsGroom();
  const active = (id: string) => !!priv?.hand.some((h) => h.missionId === id && h.status === 'active');
  // Only the steps still to do (fixed when the intro opens, so finishing one doesn't reshuffle the strip)
  const [steps] = useState<Step[]>(() => (isGroom ? ['selfie'] as Step[] : ['selfie', 'roast', 'toast'] as Step[]).filter((s) => active(STEP_MISSION[s])));
  const [i, setI] = useState(0);
  const [done, setDone] = useState<Partial<Record<Step, 'done' | 'passed'>>>({});
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState('');
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const claimId = useRef(newClaimId());
  const [idea] = useState(() => Math.floor(Math.random() * 3));
  const step: Step | undefined = steps[i];
  const mission = step ? MISSION_BY_ID[STEP_MISSION[step]] : undefined;
  const reward = step && introRewards.find((r) => r.title === mission?.title);

  const next = () => { setErr(null); setText(''); setI((n) => n + 1); };
  const pass = () => { if (step) setDone((d) => ({ ...d, [step]: 'passed' })); next(); };
  const back = () => { setErr(null); setText(''); setI((n) => Math.max(0, n - 1)); };
  const finish = () => endIntro();

  const sendSelfie = async (photo: string) => {
    await request({ type: 'claimMission', missionId: STARTER_MISSION.id, claimId: claimId.current, photo });
    sfx.mission(); setDone((d) => ({ ...d, selfie: 'done' }));
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try { await sendSelfie(await compressImage(f)); }
    catch (e) { setErr((e as Error).message || 'Could not read that photo. Try another.'); sfx.error(); claimId.current = newClaimId(); }
    finally { setBusy(false); }
  };
  const postWall = async (kind: 'roast' | 'toast') => {
    setBusy(true); setErr(null);
    try { await request({ type: 'wallPost', kind, text }); sfx.mission(); setDone((d) => ({ ...d, [kind]: 'done' })); }
    catch (e) { setErr((e as Error).message); sfx.error(); }
    finally { setBusy(false); }
  };

  const strip = steps.length > 1 && (
    <div className="intro-strip" aria-label={`Intro step ${i + 1} of ${steps.length}`}>
      {steps.map((s, k) => <span key={s} className={k === i ? 'on' : done[s] === 'done' ? 'done' : ''}>{done[s] === 'done' ? '✓' : STEP_ICON[s]} {STEP_LABEL[s]}</span>)}
    </div>
  );
  const earned = reward && (
    <div className="row" style={{ justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className="pill pill-gold">+{reward.points} pts · +{reward.xp} XP{reward.levelUp ? ` · Level ${reward.levelUp}!` : ''}</span>
      {reward.achievements?.map((a) => <span key={a} className="pill pill-ok">🏅 {ACHIEVEMENT_BY_ID[a]?.name ?? a}</span>)}
    </div>
  );
  // A finished step: what you got, and one button that says where you're going
  const doneCard = (title: string, sub: string) => (
    <div className="screen-body tut-body">
      <div className="panel panel-gold pad center stack-10 fade-up">
        <div style={{ fontSize: 40, lineHeight: 1 }}>✅</div>
        <div className="display title-md">{title}</div>
        <div className="small dim">{sub}</div>
        {earned}
      </div>
      <Button onClick={next} data-testid="intro-next">{NEXT_LABEL[step!]}</Button>
    </div>
  );

  // ---- all done: straight into a real challenge ----
  if (!step) {
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
          {nextM && <><div className="eyebrow">Up next</div><MissionCard mission={nextM} assignment={nextUp} preview /></>}
          {left > 0 && <div className="tiny center dim"><b>🚀 Rookie boost:</b> your next {left} challenges are easy, double XP and count straight away.</div>}
          <Button onClick={finish}>Start playing</Button>
        </div>
      </div>
    );
  }

  const head = (title: string) => (
    <div className="center" style={{ marginTop: 2 }}>
      {strip}
      <h2 className="display title-lg" style={{ marginTop: 6 }}>{title}</h2>
    </div>
  );
  const backLink = i > 0 && done[steps[i - 1]] === 'passed' && <button className="tiny bold dim" onClick={back}>‹ Back to {STEP_LABEL[steps[i - 1]].toLowerCase()}</button>;

  // ---- 1. the group selfie ----
  if (step === 'selfie') return (
    <div className="screen tut">
      {head('Get the boys online')}
      {done.selfie === 'done' ? doneCard('Photo\'s in!', 'The lads can see it in Photos.') : (
        <div className="screen-body tut-body">
          <div className="panel pad center stack-6">
            <div className="bold" style={{ fontSize: 17 }}>Selfie with Jezza and at least two other lads.</div>
            <div className="small dim">Everyone looking fired up. Counts straight away: <b className="gold-text" style={{ whiteSpace: 'nowrap' }}>+{STARTER_MISSION.points} pts · +{STARTER_MISSION.xp} XP</b></div>
          </div>
          <input ref={cam} type="file" accept="image/*" capture="user" data-selfie hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={lib} type="file" accept="image/*" data-selfie-library hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          {camera && <CameraSheet facing="user" hint="Get Jezza and the boys in the shot" onClose={() => setCamera(false)} onFallback={() => cam.current?.click()} onPhoto={async (photo) => { await sendSelfie(photo); setCamera(false); }} />}
          {err && <div className="field-error center">{err}</div>}
          <Button onClick={() => (canUseLiveCamera() ? setCamera(true) : cam.current?.click())} disabled={busy}>{busy ? 'Sending…' : '📸 Take the group selfie'}</Button>
          <div className="row" style={{ justifyContent: 'center', gap: 18, flexWrap: 'wrap' }}>
            <button className="small bold dim" disabled={busy} onClick={() => lib.current?.click()}>🖼️ Pick from photos</button>
            <button className="small bold dim" disabled={busy} onClick={pass}>Not with the boys yet? Skip</button>
          </div>
          <div className="tiny faint center">Skipping is free. It stays in your challenges until you get it.</div>
        </div>
      )}
    </div>
  );

  // ---- 2 & 3. roast / toast: one line on the Jezza Wall ----
  const roast = step === 'roast';
  return (
    <div className="screen tut">
      {head(roast ? 'Roast Jezza' : 'Toast Jezza')}
      {done[step] === 'done' ? doneCard(roast ? 'Roast posted 🔥' : 'Toast posted 🥂', 'It\'s on the Jezza Wall for the lads to vote on.') : (
        <div className="screen-body tut-body">
          <div className="small center" style={{ fontWeight: 700 }}>{mission?.instruction}</div>
          <textarea className="input" data-intro={step} style={{ minHeight: 84, padding: 12, fontSize: 16, resize: 'none' }} maxLength={140} value={text} onChange={(e) => setText(e.target.value)} placeholder={(roast ? ROAST_IDEAS : TOAST_IDEAS)[idea]} />
          <div className="row-between tiny faint" style={{ gap: 8 }}><span>{roast ? 'Jezza can bin any roast, no questions asked.' : 'The best toasts get read out at the finale.'}</span><span>{text.length}/140</span></div>
          {err && <div className="field-error center">{err}</div>}
          <Button onClick={() => void postWall(step)} disabled={busy || text.trim().length < 6}>{busy ? '…' : roast ? `🔥 Post the roast · +${mission?.points ?? 15}` : `🥂 Post the toast · +${mission?.points ?? 15}`}</Button>
          <div className="row" style={{ justifyContent: 'center', gap: 18 }}>
            {backLink}
            <button className="small bold dim" disabled={busy} onClick={pass}>Skip for now</button>
          </div>
        </div>
      )}
    </div>
  );
}
