import { useEffect, useState } from 'react';
import { VineyardFallback } from '../components/VineyardScene';
import { Button, ConnectionPill } from '../components/ui';
import { useStore } from '../store';
import { request, isDemo } from '../net';
import { loadPref, savePref } from '../identity';
import { sfx, unlockAudio } from '../audio';

export default function Join() {
  const setFlow = useStore((s) => s.setFlow);
  const pendingCode = useStore((s) => s.pendingCode);
  const kicked = useStore((s) => s.kicked);
  const clearKicked = useStore((s) => s.clearKicked);
  const [nick, setNick] = useState(() => loadPref('nick', ''));
  const [code, setCode] = useState(pendingCode ?? '');
  const [mode, setMode] = useState<'join' | 'host' | 'reclaim'>('join');
  const [pin, setPin] = useState('');
  // Opened from a host's share link (…?p=CODE): no code box, just "you're joining X".
  const [viaLink, setViaLink] = useState(() => !isDemo() && !!new URLSearchParams(location.search).get('p'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The invite screen shows whose party it is and how many lads are already in (and catches a dead link early)
  const [invite, setInvite] = useState<{ name: string; lads: number } | null>(null);
  useEffect(() => {
    if (!viaLink || !code) return;
    fetch(`/api/party/${encodeURIComponent(code)}/exists`).then((r) => r.json()).then((j) => {
      if (j?.exists) setInvite({ name: String(j.name ?? ''), lads: Number(j.lads ?? 0) });
      else { setViaLink(false); setErr('That invite link isn\'t live any more. Ask the host for the party code.'); }
    }).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const afterJoin = () => {
    savePref('nick', nick.trim());
    const s = useStore.getState();
    const me = s.party?.players.find((p) => p.id === s.identity.playerId);
    setFlow(me?.creature ? 'main' : 'choose');
  };

  const submit = async () => {
    unlockAudio(); setErr(null); setBusy(true); clearKicked();
    try {
      if (mode === 'host') {
        if (pin && !/^\d{4,6}$/.test(pin)) throw new Error('Host PIN must be 4 to 6 digits.');
        await request<{ code: string }>({ type: 'createParty', nickname: nick, partyName: "Jezza's Bucks Weekend", hostPin: pin || undefined });
      } else {
        if (!code.trim() && !isDemo()) throw new Error('Enter the party code from your host.');
        if (mode === 'reclaim' && !/^\d{4,6}$/.test(pin)) throw new Error('Enter your 4 to 6 digit host PIN.');
        await request<{ code: string }>({ type: 'joinParty', code: code.trim().toUpperCase(), nickname: nick });
        if (mode === 'reclaim') await request({ type: 'claimHost', pin });
      }
      sfx.select();
      afterJoin();
    } catch (e) { setErr((e as Error).message); sfx.error(); }
    finally { setBusy(false); }
  };

  const title = mode === 'host' ? 'Host the weekend' : mode === 'reclaim' ? 'Take back host' : viaLink ? "You're invited" : 'Who are you, legend?';
  const eyebrow = mode === 'host' ? 'Open the cellar' : mode === 'reclaim' ? 'Lost your phone?' : 'Join the party';

  if (mode === 'join' && viaLink) {
    const nameLine = invite?.name || "Jezza's bucks weekend";
    return (
      <div className="screen invite">
        <VineyardFallback /><div className="hero-vignette" />
        <div className="invite-body">
          <div className="hero-tag fade-up">YOU'RE INVITED</div>
          <h1 className="hero-title gold-text fade-up delay-1">PROJECT<br />JEZZA</h1>
          <p className="hero-sub fade-up delay-2" data-testid="invite-line">{nameLine}{invite && invite.lads > 0 ? <> · <b>{invite.lads} lad{invite.lads === 1 ? '' : 's'} already in</b></> : null}</p>
          {kicked && <div className="panel pad small bold" style={{ borderColor: 'rgba(240,120,66,.6)' }}>🚪 {kicked}</div>}
          <div className="panel pad stack-10 fade-up delay-3" style={{ width: '100%', maxWidth: 380 }}>
            <input className="input" value={nick} onChange={(e) => setNick(e.target.value)} placeholder="Your name, e.g. Big Dave" maxLength={16} autoComplete="off" autoCapitalize="words" enterKeyHint="go" aria-label="Your nickname" onKeyDown={(e) => e.key === 'Enter' && nick.trim().length >= 2 && submit()} />
            {err && <div className="field-error">{err}</div>}
            <Button onClick={submit} disabled={busy || nick.trim().length < 2}>{busy ? 'Entering…' : "I'm in →"}</Button>
          </div>
          <div className="faint tiny fade-up delay-4">No sign-up. No app. About 30 seconds.</div>
          <button className="tiny bold dim" onClick={() => setViaLink(false)}>Got a different code?</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="topbar"><span className="brand">PROJECT JEZZA</span><ConnectionPill /></div>
      <div className="screen-body" style={{ justifyContent: 'center', gap: 16 }}>
        <div className="center fade-up">
          <div className="eyebrow">{eyebrow}</div>
          <h2 className="display title-lg" style={{ marginTop: 6 }}>{title}</h2>
          {mode === 'join' && viaLink && <div className="pill pill-gold" style={{ marginTop: 10 }}>🍇 Joining party {code}</div>}
        </div>
        {kicked && <div className="panel pad small bold" style={{ borderColor: 'rgba(240,120,66,.6)' }}>🚪 {kicked}</div>}
        <div className="panel pad-lg stack-14 fade-up delay-1">
          <label>
            <span className="label">Your nickname</span>
            <input className="input" value={nick} onChange={(e) => setNick(e.target.value)} placeholder="e.g. Big Dave" maxLength={16} autoComplete="off" autoCapitalize="words" enterKeyHint="next" />
          </label>
          {(mode === 'reclaim' || (mode === 'join' && !viaLink)) && (
            <label>
              <span className="label">Party code</span>
              <input className="input input-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder={isDemo() ? 'DEMO' : 'ABCD'} autoComplete="off" autoCapitalize="characters" enterKeyHint="go" onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </label>
          )}
          {(mode === 'host' || mode === 'reclaim') && (
            <label>
              <span className="label">{mode === 'host' ? 'Host PIN (recommended)' : 'Host PIN'}</span>
              <input className="input input-code" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••" inputMode="numeric" autoComplete="off" type="password" enterKeyHint="go" onKeyDown={(e) => e.key === 'Enter' && submit()} />
              {mode === 'host' && <span className="tiny faint" style={{ display: 'block', marginTop: 6 }}>4 to 6 digits only you know. If your phone dies, use it on any phone to take back host.</span>}
            </label>
          )}
          {err && <div className="field-error">{err}</div>}
          <Button onClick={submit} disabled={busy || nick.trim().length < 2}>{busy ? 'Entering…' : mode === 'host' ? 'Create the party' : mode === 'reclaim' ? 'Take back host' : 'Join the legends'}</Button>
        </div>
        <div className="center fade-up delay-2 col" style={{ gap: 0 }}>
          {mode === 'join' && viaLink && <Button variant="ghost" onClick={() => setViaLink(false)}>Use a different code</Button>}
          {mode === 'join' && !viaLink && <Button variant="ghost" onClick={() => { setMode('host'); setErr(null); }}>I'm the host, create a party</Button>}
          {mode === 'host' && <Button variant="ghost" onClick={() => { setMode('reclaim'); setErr(null); }}>Already hosting? Take back host with your PIN</Button>}
          {mode !== 'join' && <Button variant="ghost" onClick={() => { setMode('join'); setErr(null); }}>I have a code, just join</Button>}
        </div>
        {isDemo() && <div className="center faint tiny" style={{ maxWidth: '34ch', margin: '0 auto' }}>Demo mode: your mates are bots. Any code joins Jezza's room; "I'm the host" gives you the host controls.</div>}
      </div>
    </div>
  );
}
