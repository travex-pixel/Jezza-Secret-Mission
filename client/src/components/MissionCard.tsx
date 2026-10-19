import { useEffect, useRef, useState } from 'react';
import { CATEGORY_META, METHOD_META, MISSION_BY_ID, type Mission } from '@shared/missions';
import type { MissionAssignment, PlayerPublic } from '@shared/types';
import { Button, Sheet, useCountdown } from './ui';
import { Creature } from './Creature';
import { newClaimId, request } from '../net';
import { useStore } from '../store';
import { sfx } from '../audio';

const DIFF = ['', 'Easy', 'Spicy', 'Big one'];

export async function compressImage(file: File, maxSide = 1600, quality = 0.82): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    let q = quality; let out = c.toDataURL('image/jpeg', q);
    while (out.length > 1_300_000 && q > 0.4) { q -= 0.08; out = c.toDataURL('image/jpeg', q); }
    return out;
  } finally { URL.revokeObjectURL(url); }
}

export function MissionCard({ mission, assignment, compact, onDone, showReroll, group }: { mission: Mission; assignment?: MissionAssignment; compact?: boolean; onDone?: () => void; showReroll?: boolean; group?: boolean }) {
  const meta = CATEGORY_META[mission.category];
  const method = METHOD_META[mission.method];
  const status = assignment?.status ?? 'active';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pickWitness, setPickWitness] = useState(false);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);  // camera
  const libRef = useRef<HTMLInputElement>(null);   // photo library
  const party = useStore((s) => s.party);
  const myId = useStore((s) => s.identity.playerId);
  const priv = useStore((s) => s.priv);
  const toast = useStore((s) => s.toast);
  const completed = group ? !!priv?.completedMissionIds.includes(mission.id) : status === 'done';
  const claimIdRef = useRef<string>(newClaimId());
  const pendingSince = useRef<number | null>(null);
  if (status === 'pending' && pendingSince.current === null) pendingSince.current = Date.now();
  if (status !== 'pending') pendingSince.current = null;
  const [, force] = useState(0);
  useEffect(() => { if (status !== 'pending') return; const t = setInterval(() => force((n) => n + 1), 5000); return () => clearInterval(t); }, [status]);
  const witnessStale = mission.method === 'witness' && status === 'pending' && pendingSince.current !== null && Date.now() - pendingSince.current > 2 * 60_000;
  const coolingDown = mission.method === 'self' && !mission.starter && !group && (priv?.honourCooldownUntil ?? 0) > Date.now();
  const coolLeft = useCountdown(coolingDown ? priv?.honourCooldownUntil : undefined);

  const submit = async (extra: { photo?: string; witnessId?: string } = {}) => {
    setBusy(true); setErr(null);
    try {
      const res = await request<{ status: string; duplicate?: boolean }>({ type: 'claimMission', missionId: mission.id, claimId: claimIdRef.current, note: note || undefined, ...extra });
      claimIdRef.current = newClaimId();
      if (res.status === 'pending') { sfx.select(); toast(mission.method === 'witness' ? 'Sent. Go hassle them to tap yes.' : 'Sent to the host.', '📨', 'success'); }
      else sfx.mission();
      onDone?.();
    } catch (e) { setErr((e as Error).message); sfx.error(); }
    finally { setBusy(false); }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try { const photo = await compressImage(f); await submit({ photo }); }
    catch (e) { setErr((e as Error).message || 'Could not read that photo.'); setBusy(false); }
  };

  const reroll = async () => {
    setBusy(true); setErr(null);
    try { await request({ type: 'rerollMission', missionId: mission.id }); sfx.tap(); }
    catch (e) { setErr((e as Error).message); sfx.error(); }
    finally { setBusy(false); }
  };

  const cta = () => {
    if (completed) return <span className="pill pill-ok">✓ Done</span>;
    if (status === 'pending') {
      return witnessStale
        ? <Button size="sm" variant="secondary" onClick={() => setPickWitness(true)} disabled={busy}>👀 Ask someone else</Button>
        : <span className="pill pill-gold">⏳ Waiting on your mate</span>;
    }
    switch (mission.method) {
      case 'self': return coolingDown && coolLeft > 0 ? <Button size="sm" variant="secondary" disabled title="One honour-system claim every 8 minutes">⏳ {Math.floor(coolLeft / 60)}:{String(coolLeft % 60).padStart(2, '0')}</Button> : <Button size="sm" onClick={() => submit()} disabled={busy}>{busy ? '…' : `✅ ${method.cta}`}</Button>;
      case 'photo': return (<>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={libRef} type="file" accept="image/*" className="hidden" data-library onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {!busy && <Button size="sm" variant="secondary" onClick={() => libRef.current?.click()} aria-label="Pick from your photos">🖼️</Button>}
        <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'Uploading…' : `📸 ${method.cta}`}</Button>
      </>);
      case 'witness': return <Button size="sm" onClick={() => setPickWitness(true)} disabled={busy}>{busy ? '…' : `✅ ${method.cta}`}</Button>;
      default: return <Button size="sm" onClick={() => submit()} disabled={busy}>{busy ? '…' : `✅ ${method.cta}`}</Button>;
    }
  };

  const groomId = party?.groomId;
  const witnesses = (party?.players ?? []).filter((p) => p.id !== myId && p.creature).sort((a, b) => Number(b.id === groomId) - Number(a.id === groomId) || Number(b.online) - Number(a.online) || a.nickname.localeCompare(b.nickname));

  return (
    <div className={`mission-card ${mission.secret ? 'secret' : ''} ${completed ? 'done' : ''} ${status === 'pending' ? 'pending' : ''}`} style={{ ['--hue' as any]: meta.hue }}>
      <div className="mc-head">
        <span className="row" style={{ gap: 6 }}>
          <span className="pill pill-xs" style={{ borderColor: meta.hue, color: 'var(--cream)' }}>{meta.emoji} {mission.secret ? 'SECRET' : meta.label}</span>
          {group && <span className="pill pill-xs pill-ok">GROUP</span>}
        </span>
        <span className="row" style={{ gap: 6 }}>
          <span className="pill pill-xs">{DIFF[mission.difficulty]}</span>
          <span className="pill pill-xs pill-gold">+{mission.points} pts · {mission.xp} XP</span>
        </span>
      </div>
      <div className="mc-title">{mission.title}</div>
      <div className={`mc-body ${compact ? 'clamp' : ''}`}>{mission.instruction}</div>
      {mission.method === 'photo' && !compact && status === 'active' && <div className="tiny faint" style={{ padding: '0 14px' }}>📸 opens the camera · 🖼️ picks from your photos. Want the full-quality original? Take it in your normal camera app, then tap 🖼️.</div>}
      {err && <div className="field-error" style={{ padding: '0 14px' }}>{err}</div>}
      <div className="mc-foot">
        <span className="tiny faint" style={{ maxWidth: '45%', lineHeight: 1.2 }}>{method.label}{showReroll && status === 'active' && !mission.starter ? <><br /><button className="bold" style={{ color: 'var(--rose)', textDecoration: 'underline' }} onClick={reroll} disabled={busy || (priv?.rerollsLeft ?? 0) <= 0}>Swap ({priv?.rerollsLeft ?? 0} left)</button></> : null}</span>
        <span className="row" style={{ gap: 6 }}>{cta()}</span>
      </div>
      {pickWitness && (
        <Sheet onClose={() => setPickWitness(false)}>
          <div className="eyebrow center">Who saw it?</div>
          <h3 className="display title-md center" style={{ margin: '6px 0 10px' }}>Pick a mate to confirm</h3>
          <div className="scroll-y stack-6" style={{ maxHeight: '45vh' }}>
            {witnesses.length === 0 && <div className="center dim small pad">No mates have joined yet. Lonely.</div>}
            {witnesses.map((w: PlayerPublic) => (
              <button key={w.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { setPickWitness(false); submit({ witnessId: w.id }); }}>
                <span className="avatar sm"><Creature creature={w.creature!} level={w.level} colorway={w.equipped.colorway} bare /></span>
                <span className="grow"><div className="bold">{w.id === groomId ? '🤵 ' : ''}{w.nickname}</div><div className="tiny faint">{w.id === groomId ? 'The groom himself' : `${w.creatureName} · Lv ${w.level}`}</div></span>
                <span className={`pill pill-xs ${w.online ? 'pill-ok' : ''}`}>{w.online ? 'online' : 'away'}</span>
              </button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => setPickWitness(false)}>Cancel</Button>
        </Sheet>
      )}
    </div>
  );
}

export function missionOf(id: string): Mission | undefined { return MISSION_BY_ID[id]; }
