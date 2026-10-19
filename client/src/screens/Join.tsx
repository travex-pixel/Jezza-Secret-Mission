import { useState } from 'react';
import { Button, ConnectionPill } from '../components/ui';
import { useStore } from '../store';
import { request, isDemo } from '../net';
import { loadPref, savePref } from '../identity';
import { sfx } from '../audio';

export default function Join() {
  const setFlow = useStore((s) => s.setFlow);
  const pendingCode = useStore((s) => s.pendingCode);
  const kicked = useStore((s) => s.kicked);
  const clearKicked = useStore((s) => s.clearKicked);
  const [nick, setNick] = useState(() => loadPref('nick', ''));
  const [code, setCode] = useState(pendingCode ?? '');
  const [mode, setMode] = useState<'join' | 'host'>(pendingCode || isDemo() ? 'join' : 'join');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const afterJoin = () => {
    savePref('nick', nick.trim());
    const s = useStore.getState();
    const me = s.party?.players.find((p) => p.id === s.identity.playerId);
    setFlow(me?.creature ? 'main' : 'choose');
  };

  const submit = async () => {
    setErr(null); setBusy(true); clearKicked();
    try {
      if (mode === 'host') {
        await request<{ code: string }>({ type: 'createParty', nickname: nick, partyName: "Jezza's Bucks Weekend" });
      } else {
        if (!code.trim() && !isDemo()) throw new Error('Enter the party code from your host.');
        await request<{ code: string }>({ type: 'joinParty', code: code.trim().toUpperCase(), nickname: nick });
      }
      sfx.select();
      afterJoin();
    } catch (e) { setErr((e as Error).message); sfx.error(); }
    finally { setBusy(false); }
  };

  return (
    <div className="screen">
      <div className="topbar"><span className="brand">PROJECT JEZZA</span><ConnectionPill /></div>
      <div className="screen-body" style={{ justifyContent: 'center', gap: 16 }}>
        <div className="center fade-up">
          <div className="eyebrow">{mode === 'host' ? 'Open the cellar' : 'Join the party'}</div>
          <h2 className="display title-lg" style={{ marginTop: 6 }}>{mode === 'host' ? 'Host the weekend' : 'Who are you, legend?'}</h2>
        </div>
        {kicked && <div className="panel pad small bold" style={{ borderColor: 'rgba(240,120,66,.6)' }}>🚪 {kicked}</div>}
        <div className="panel pad-lg stack-14 fade-up delay-1">
          <label>
            <span className="label">Your nickname</span>
            <input className="input" value={nick} onChange={(e) => setNick(e.target.value)} placeholder="e.g. Big Dave" maxLength={16} autoComplete="off" autoCapitalize="words" enterKeyHint="next" />
          </label>
          {mode === 'join' && (
            <label>
              <span className="label">Party code</span>
              <input className="input input-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder={isDemo() ? 'DEMO' : 'ABCD'} autoComplete="off" autoCapitalize="characters" enterKeyHint="go" onKeyDown={(e) => e.key === 'Enter' && submit()} />
            </label>
          )}
          {err && <div className="field-error">{err}</div>}
          <Button onClick={submit} disabled={busy || nick.trim().length < 2}>{busy ? 'Entering…' : mode === 'host' ? 'Create the party' : 'Join the legends'}</Button>
        </div>
        <div className="center fade-up delay-2">
          {mode === 'join'
            ? <Button variant="ghost" onClick={() => { setMode('host'); setErr(null); }}>I'm the host, create a party</Button>
            : <Button variant="ghost" onClick={() => { setMode('join'); setErr(null); }}>I have a code instead</Button>}
        </div>
        {isDemo() && <div className="center faint tiny" style={{ maxWidth: '34ch', margin: '0 auto' }}>Demo mode: your mates are bots. Any code joins Jezza's room; "I'm the host" gives you the host controls.</div>}
      </div>
    </div>
  );
}
