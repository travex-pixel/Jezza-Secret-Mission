// The scorer's pad: Bucks Olympics points by hand. Name the event once, then tap a lad, pick a number, Give. Every
// entry goes straight to the ladder, the feed and the TV. Scorers (host-appointed) and the host only; the server checks.
import { useState } from 'react';
import { sortLeaderboard } from '@shared/progression';
import { Button } from '../components/ui';
import { LadPic } from '../components/Creature';
import { useStore, useMe } from '../store';
import { request } from '../net';
import { sfx } from '../audio';

const PRESETS = [60, 40, 25, 15, 10];
const storeKey = (code: string) => `hvl-scorer-event-${code}`;

export default function Scorer() {
  const party = useStore((s) => s.party);
  const me = useMe();
  const setTab = useStore((s) => s.setTab);
  const toast = useStore((s) => s.toast);
  const [event, setEvent] = useState(() => { try { return localStorage.getItem(storeKey(party?.code ?? '')) ?? ''; } catch { return ''; } });
  const [pick, setPick] = useState<string | null>(null);
  const [pts, setPts] = useState<number>(60);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ who: string; pts: number; reason: string }[]>([]);
  if (!party || !me) return null;
  const allowed = me.isScorer || me.isHost;
  const lads = sortLeaderboard(party.players.filter((p) => p.creature));
  const table = [...lads].filter((p) => p.olympics !== 0).sort((a, b) => b.olympics - a.olympics);
  const amount = custom.trim() ? Math.round(Number(custom)) : pts;
  const give = async () => {
    if (!pick || busy) return; setBusy(true);
    try {
      try { localStorage.setItem(storeKey(party.code), event); } catch { /* fine */ }
      await request({ type: 'scorerGrant', playerId: pick, points: amount, reason: event });
      sfx.reward(); const who = party.players.find((p) => p.id === pick)?.nickname ?? '?';
      setLog((l) => [{ who, pts: amount, reason: event }, ...l].slice(0, 8)); toast(`${who} ${amount > 0 ? '+' : ''}${amount} · ${event}`, '🏅', 'success'); setPick(null); setCustom('');
    } catch (e) { toast((e as Error).message, '⚠️', 'warn'); }
    finally { setBusy(false); }
  };
  return (
    <div className="screen with-nav">
      <div className="topbar"><button className="display title-md" onClick={() => setTab('home')}>‹ Scorer's pad</button><span className="pill pill-gold">🏅 Olympics</span></div>
      {!allowed ? <div className="panel pad center dim">Scorers only. Ask the host.</div> : (
        <div className="screen-body scroll-y stack-10">
          <div className="panel pad stack-6" data-testid="scorer-pad">
            <label><span className="label">Event</span><input className="input" style={{ minHeight: 44, fontSize: 16 }} value={event} maxLength={40} onChange={(e) => setEvent(e.target.value)} placeholder="Plank, Wall sit, Beer pong…" data-testid="scorer-event" /></label>
            <span className="label">Points</span>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {PRESETS.map((n) => <button key={n} className={`pill pill-tap ${!custom && pts === n ? 'pill-gold' : ''}`} onClick={() => { setPts(n); setCustom(''); }}>{n}</button>)}
              <input className="input" style={{ minHeight: 40, fontSize: 15, width: 88, flex: '0 0 88px' }} type="number" inputMode="numeric" placeholder="other" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom points" data-testid="scorer-custom" />
            </div>
            <span className="label">Who</span>
            <div className="scroll-y stack-6" style={{ maxHeight: '34vh' }}>
              {lads.map((p) => (
                <button key={p.id} className={`list-row ${pick === p.id ? 'me' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => setPick(p.id)} data-testid="scorer-lad">
                  <span className="avatar sm"><LadPic p={p} /></span>
                  <span className="grow bold ellipsis">{p.nickname}</span>
                  <span className="tiny faint">🏅 {p.olympics}</span>
                </button>
              ))}
            </div>
            <Button disabled={!pick || busy || event.trim().length < 2 || !amount} onClick={() => void give()} data-testid="scorer-give">
              {pick ? `Give ${party.players.find((p) => p.id === pick)?.nickname} ${amount > 0 ? '+' : ''}${amount || 0}${event.trim() ? ` · ${event.trim()}` : ''}` : 'Pick a lad'}
            </Button>
            <div className="tiny faint">Goes straight to the ladder, the feed and the TV. Minus numbers take points away. Only scorers and the host can do this.</div>
          </div>
          {log.length > 0 && <div className="panel pad stack-6"><div className="eyebrow">Just entered</div>{log.map((l, i) => <div key={i} className="small">🏅 {l.who} {l.pts > 0 ? '+' : ''}{l.pts} · {l.reason}</div>)}</div>}
          <div className="panel pad stack-6" data-testid="olympics-table">
            <div className="eyebrow">Olympics table</div>
            {!table.length && <div className="tiny faint">Nothing entered yet.</div>}
            {table.map((p, i) => <div key={p.id} className="row" style={{ gap: 8 }}><span className="bold" style={{ width: 22 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span><span className="avatar sm"><LadPic p={p} /></span><span className="grow bold ellipsis">{p.nickname}</span><span className="bold gold-text">{p.olympics}</span></div>)}
          </div>
        </div>
      )}
    </div>
  );
}
