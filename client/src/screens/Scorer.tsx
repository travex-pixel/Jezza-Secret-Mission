// The scorer's pad. Two ways in: run an EVENT (start it, enter each lad's result, lock it, points go out by placing)
// or give QUICK POINTS by hand. Everything here is mirrored on the TV as it happens. Scorers and the host only.
import { useEffect, useState } from 'react';
import { sortLeaderboard } from '@shared/progression';
import { OLY_PLACE_POINTS, OLY_PART_POINTS, OLY_SUGGESTED, OLY_UNITS, ordinal, placeAwards, type OlyUnit } from '@shared/olympics';
import { Button } from '../components/ui';
import { LadPic } from '../components/Creature';
import { useStore, useMe } from '../store';
import { request } from '../net';
import { sfx } from '../audio';
import { buzz } from '../haptics';

const PRESETS = [60, 40, 25, 15, 10];
const fmtSw = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`; };

export default function Scorer() {
  const party = useStore((s) => s.party);
  const me = useMe();
  const setTab = useStore((s) => s.setTab);
  const toast = useStore((s) => s.toast);
  const [mode, setMode] = useState<'event' | 'quick'>('event');
  // event setup
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<OlyUnit>('seconds');
  // result entry
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [, tick] = useState(0);
  const [confirm, setConfirm] = useState(false);
  // quick points
  const [event, setEvent] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [pts, setPts] = useState<number>(60);
  const [custom, setCustom] = useState('');
  const [minus, setMinus] = useState(false); // phones have no − key: a toggle flips the amount to a take-back
  const [busy, setBusy] = useState(false);
  const ev = party?.olympics?.current ?? null;
  useEffect(() => { if (!ev?.timer) return; const t = setInterval(() => tick((n) => n + 1), 100); return () => clearInterval(t); }, [ev?.timer?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!party || !me) return null;
  const allowed = me.isScorer || me.isHost;
  const lads = sortLeaderboard(party.players.filter((p) => p.creature));
  const nick = (id: string) => party.players.find((p) => p.id === id)?.nickname ?? '?';
  const send = async (msg: Parameters<typeof request>[0], ok?: () => void) => {
    if (busy) return; setBusy(true);
    try { await request(msg); ok?.(); } catch (e) { toast((e as Error).message, '⚠️', 'warn'); sfx.error(); } finally { setBusy(false); }
  };
  const u = ev ? OLY_UNITS[ev.unit] : null;
  const resultOf = (id: string) => ev?.results.find((r) => r.playerId === id);
  // the server stamps the start; the phone clock runs from there (any offset is the same on every phone and the TV)
  const timerMs = ev?.timer ? Math.max(0, Date.now() - ev.timer.startedAt) : 0;
  const preview = ev ? placeAwards(ev.unit, ev.results) : [];
  const table = [...lads].filter((p) => p.olympics !== 0).sort((a, b) => b.olympics - a.olympics);
  const amount = (minus ? -1 : 1) * Math.abs(custom.trim() ? Math.round(Number(custom)) : pts);

  return (
    <div className="screen with-nav">
      <div className="topbar"><button className="display title-md" onClick={() => setTab('home')}>‹ Scorer's pad</button><span className="pill pill-gold">🏅 on the TV</span></div>
      {!allowed ? <div className="panel pad center dim">Scorers only. Ask the host.</div> : (
        <>
          <div className="tabs" style={{ marginBottom: 10 }}>
            <button className={`tab ${mode === 'event' ? 'on' : ''}`} onClick={() => setMode('event')}>🏁 Run an event</button>
            <button className={`tab ${mode === 'quick' ? 'on' : ''}`} onClick={() => setMode('quick')}>⚡ Quick points</button>
          </div>
          <div className="screen-body scroll-y stack-10">
            {mode === 'event' && !ev && (
              <div className="panel pad stack-6" data-testid="oly-setup">
                <div className="eyebrow">New event</div>
                <div className="tiny faint">Pick one or type your own. The TV shows the event the moment you start it.</div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{OLY_SUGGESTED.map((s) => <button key={s.name} className={`pill pill-tap ${name === s.name ? 'pill-gold' : ''}`} onClick={() => { setName(s.name); setUnit(s.unit); }}>{OLY_UNITS[s.unit].emoji} {s.name}</button>)}</div>
                <input className="input" style={{ minHeight: 44, fontSize: 16 }} value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="Event name" data-testid="oly-name" />
                <span className="label">Measured by</span>
                <div className="stack-6">{(Object.keys(OLY_UNITS) as OlyUnit[]).map((k) => <button key={k} className={`list-row ${unit === k ? 'me' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => setUnit(k)} data-testid={`oly-unit-${k}`}><span style={{ fontSize: 20 }}>{OLY_UNITS[k].emoji}</span><span className="grow"><div className="bold small">{OLY_UNITS[k].label}</div><div className="tiny faint">{OLY_UNITS[k].blurb}</div></span></button>)}</div>
                <div className="tiny faint">Points by placing: 1st {OLY_PLACE_POINTS[0]}, 2nd {OLY_PLACE_POINTS[1]}, 3rd {OLY_PLACE_POINTS[2]}, 4th–5th {OLY_PLACE_POINTS[3]}, everyone else who has a result {OLY_PART_POINTS}. Ties share.</div>
                <Button disabled={busy || name.trim().length < 2} onClick={() => void send({ type: 'olyStart', name, unit }, () => { sfx.sting(); setDraft({}); })} data-testid="oly-start">▶ Start {name.trim() || 'the event'} on the TV</Button>
              </div>
            )}
            {mode === 'event' && ev && ev.status === 'open' && u && (
              <div className="panel pad stack-6" data-testid="oly-entry">
                <div className="row-between"><span className="eyebrow">{u.emoji} {ev.name} · live on the TV</span><span className="tiny faint">{ev.results.length}/{lads.length} in</span></div>
                <div className="tiny faint">{ev.unit === 'seconds' ? 'Tap ▶ when a lad starts, ■ when he drops: the time fills in. Or type the seconds.' : u.blurb} Every entry shows on the TV straight away.</div>
                {ev.timer && <div className="oly-sw" data-testid="oly-stopwatch"><span className="grow bold ellipsis">⏱ {nick(ev.timer.playerId)}</span><span className="spot-clock">{fmtSw(timerMs)}</span><Button size="sm" variant="danger" disabled={busy} onClick={() => { const secs = Math.round(timerMs / 100) / 10; void send({ type: 'olyResult', playerId: ev.timer!.playerId, value: secs }, () => { sfx.reward(); buzz([40]); }); }}>■ Stop</Button></div>}
                <div className="stack-6">
                  {lads.map((p) => { const r = resultOf(p.id); const d = draft[p.id] ?? ''; return (
                    <div key={p.id} className={`oly-row ${r ? 'has' : ''}`} data-testid="oly-row">
                      <span className="avatar sm"><LadPic p={p} /></span>
                      <span className="grow" style={{ minWidth: 0 }}><div className="bold ellipsis">{p.nickname}</div>{r && <div className="tiny" style={{ color: 'var(--gold)' }}>{u.fmt(r.value)} ✓</div>}</span>
                      {ev.unit === 'seconds' && !r && (!ev.timer || ev.timer.playerId !== p.id) && <Button size="sm" variant="secondary" disabled={busy || !!ev.timer} onClick={() => void send({ type: 'olyTimer', playerId: p.id }, () => sfx.tap())} aria-label={`Start timer for ${p.nickname}`}>▶</Button>}
                      <input className="input oly-in" type="number" inputMode="decimal" placeholder={ev.unit === 'seconds' ? 'sec' : ev.unit === 'place' ? '1st=1' : ev.unit === 'metres' ? 'm' : '#'} value={d} onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value })} aria-label={`${p.nickname} result`} />
                      <Button size="sm" disabled={busy || d.trim() === ''} onClick={() => void send({ type: 'olyResult', playerId: p.id, value: Number(d) }, () => { sfx.select(); setDraft({ ...draft, [p.id]: '' }); })}>{r ? 'Fix' : 'Set'}</Button>
                      {r && <button className="react-btn" disabled={busy} onClick={() => void send({ type: 'olyResult', playerId: p.id, value: null })} aria-label={`Clear ${p.nickname}`}>✕</button>}
                    </div>); })}
                </div>
                {!confirm ? (
                  <div className="stack-6">
                    <Button disabled={busy || !ev.results.length} onClick={() => setConfirm(true)} data-testid="oly-lock">🔒 Lock & award points</Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void send({ type: 'olyScrap' }, () => toast('Scrapped. No points given.', '🗑️', 'info'))}>Scrap this event</Button>
                  </div>
                ) : (
                  <div className="panel pad stack-6" style={{ borderColor: 'var(--gold)' }} data-testid="oly-confirm">
                    <div className="eyebrow">This is what goes out</div>
                    {preview.map((a) => <div key={a.playerId} className="row small" style={{ gap: 8 }}><span style={{ width: 36 }} className="bold">{a.place ? ordinal(a.place) : ''}</span><span className="grow ellipsis">{nick(a.playerId)} · {u.fmt(a.value)}</span><span className="bold gold-text">+{a.points}</span></div>)}
                    {lads.length > preview.length && <div className="tiny faint">{lads.length - preview.length} lad{lads.length - preview.length === 1 ? '' : 's'} with no result get nothing.</div>}
                    <div className="btn-row"><Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>Back</Button><Button size="sm" disabled={busy} onClick={() => void send({ type: 'olyLock' }, () => { sfx.reveal(); buzz([60, 40, 120]); setConfirm(false); })} data-testid="oly-lock-go">Lock it. Points out.</Button></div>
                  </div>
                )}
              </div>
            )}
            {mode === 'event' && ev && ev.status === 'locked' && u && (
              <div className="panel panel-gold pad stack-6" data-testid="oly-done">
                <div className="eyebrow">🏅 {ev.name} · locked</div>
                {(ev.awards ?? []).map((a) => <div key={a.playerId} className="row small" style={{ gap: 8 }}><span style={{ width: 36 }} className="bold">{a.place === 1 ? '🥇' : a.place === 2 ? '🥈' : a.place === 3 ? '🥉' : a.place ? ordinal(a.place) : ''}</span><span className="grow ellipsis">{nick(a.playerId)} · {u.fmt(a.value)}</span><span className="bold gold-text">+{a.points}</span></div>)}
                <div className="tiny faint">Showing on the TV for 40 seconds. Fix a mistake with Quick points.</div>
                <Button onClick={() => void send({ type: 'olyScrap' }, () => setName(''))} data-testid="oly-next">Next event →</Button>
              </div>
            )}
            {mode === 'quick' && (
              <div className="panel pad stack-6" data-testid="scorer-pad">
                <label><span className="label">Event</span><input className="input" style={{ minHeight: 44, fontSize: 16 }} value={event} maxLength={40} onChange={(e) => setEvent(e.target.value)} placeholder="Plank, Beer pong, Bonus…" data-testid="scorer-event" /></label>
                <div className="row-between"><span className="label" style={{ margin: 0 }}>Points</span><span className="toggle2" style={{ width: 170 }}><button className={!minus ? 'on' : ''} onClick={() => setMinus(false)} data-testid="sign-plus">+ Give</button><button className={minus ? 'on' : ''} onClick={() => setMinus(true)} data-testid="sign-minus">− Take back</button></span></div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {(minus ? [100, 60, 40, 25, 10] : PRESETS).map((n) => <button key={n} className={`pill pill-tap ${!custom && pts === n ? 'pill-gold' : ''}`} onClick={() => { setPts(n); setCustom(''); }}>{minus ? '−' : ''}{n}</button>)}
                  <input className="input" style={{ minHeight: 40, fontSize: 15, width: 88, flex: '0 0 88px' }} type="number" inputMode="numeric" placeholder="other" value={custom} onChange={(e) => setCustom(e.target.value.replace('-', ''))} aria-label="Custom points" data-testid="scorer-custom" />
                </div>
                {minus && <div className="tiny" style={{ color: '#ff8a8a' }}>Taking points back. Up to 100 per tap; tap again for more.</div>}
                <span className="label">Who</span>
                <div className="scroll-y stack-6" style={{ maxHeight: '34vh' }}>
                  {lads.map((p) => <button key={p.id} className={`list-row ${pick === p.id ? 'me' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => setPick(p.id)} data-testid="scorer-lad"><span className="avatar sm"><LadPic p={p} /></span><span className="grow bold ellipsis">{p.nickname}</span><span className="tiny faint">🏅 {p.olympics}</span></button>)}
                </div>
                <Button disabled={!pick || busy || event.trim().length < 2 || !amount} onClick={() => void send({ type: 'scorerGrant', playerId: pick!, points: amount, reason: event }, () => { sfx.reward(); toast(`${nick(pick!)} ${amount > 0 ? '+' : ''}${amount} · ${event}`, '🏅', 'success'); setPick(null); setCustom(''); })} data-testid="scorer-give">
                  {pick ? `Give ${nick(pick)} ${amount > 0 ? '+' : ''}${amount || 0}${event.trim() ? ` · ${event.trim()}` : ''}` : 'Pick a lad'}
                </Button>
                <div className="tiny faint">Straight to the ladder, the feed and the TV. Minus numbers take points away.</div>
              </div>
            )}
            <div className="panel pad stack-6" data-testid="olympics-table">
              <div className="eyebrow">Olympics table{party.olympics.done.length ? ` · ${party.olympics.done.length} event${party.olympics.done.length === 1 ? '' : 's'} done` : ''}</div>
              {!table.length && <div className="tiny faint">Nothing scored yet.</div>}
              {table.map((p, i) => <div key={p.id} className="row" style={{ gap: 8 }}><span className="bold" style={{ width: 22 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span><span className="avatar sm"><LadPic p={p} /></span><span className="grow bold ellipsis">{p.nickname}</span><span className="bold gold-text">{p.olympics}</span></div>)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
