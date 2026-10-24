import { useEffect, useRef, useState } from 'react';
import { sortLeaderboard } from '@shared/progression';
import { orderAwards } from '@shared/ceremony';
import { request } from '../net';
import { Creature, LadPic } from '../components/Creature';
import { Button } from '../components/ui';
import { useStore, useMe } from '../store';
import { sfx } from '../audio';

export default function Finale() {
  const party = useStore((s) => s.party);
  const me = useMe();
  const [local, setLocal] = useState(0);
  // the host's reveals drive everyone's phones and the TV; a lad can still tap ahead on his own screen
  const revealed = Math.max(local, party?.ceremony ?? 0);
  const isHost = !!me?.isHost;
  const setRevealed = (f: (r: number) => number) => { const n = f(revealed); setLocal(n); if (isHost) request({ type: 'host', action: { kind: 'setCeremony', revealed: n } }).catch(() => undefined); };
  const [view, setView] = useState<'awards' | 'board' | 'roasts'>('awards');
  const awards = party?.awards ?? [];
  const heroRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (revealed === 0) return; const t = setTimeout(() => sfx.reward(), 700); return () => clearTimeout(t); }, [revealed]);
  if (!party) return null;
  const board = sortLeaderboard(party.players).filter((p) => p.creature);
  const totalMissions = party.players.reduce((a, p) => a + p.missionsCompleted, 0);
  const totalBattles = party.players.reduce((a, p) => a + p.wins, 0);
  // Ceremony order: the Menace opens proceedings, the Legend closes them.
  const ordered = orderAwards(awards);
  const shown = ordered.slice(0, revealed);
  const next = ordered[revealed];
  const legend = awards.find((a) => a.id === 'legend');
  const legendPlayer = party.players.find((p) => p.id === legend?.playerId);
  const allDone = !next && revealed > 0;
  const nick = (id?: string | null) => party.players.find((p) => p.id === id)?.nickname ?? 'Nobody';
  const topRival = (() => { let best: { a: string; b: string; n: number; w: number; l: number } | null = null; for (const p of party.players) for (const [id, r] of Object.entries(p.h2h ?? {})) if (r.w >= r.l && (!best || r.w + r.l > best.n)) best = { a: p.id, b: id, n: r.w + r.l, w: r.w, l: r.l }; return best; })();
  const recap = [
    { n: board.length, label: 'legends' }, { n: totalMissions, label: 'challenges' }, { n: totalBattles, label: 'battles' },
    { n: party.gallery.length, label: 'photos' }, { n: party.wall.length, label: 'roasts & toasts' }, { n: party.raidsDone.length, label: 'boss raids' },
  ];

  return (
    <div className="screen with-nav">
      <div className="topbar"><h2 className="display title-md gold-text">{party.finalized ? 'Final results' : 'The Finale'}</h2><span className="pill pill-gold">{party.finalized ? '👑 FINAL' : 'live'}</span></div>
      <div className="tabs" style={{ marginBottom: 10 }}><button className={`tab ${view === 'awards' ? 'on' : ''}`} onClick={() => setView('awards')}>Awards</button><button className={`tab ${view === 'roasts' ? 'on' : ''}`} onClick={() => setView('roasts')}>Roast Reel</button><button className={`tab ${view === 'board' ? 'on' : ''}`} onClick={() => setView('board')}>Final board</button></div>
      <div className="screen-body scroll-y stack-10">
        {view === 'awards' && (
          <>
            {revealed === 0 && (
              <div className="panel panel-gold pad-lg center stack-6 fade-up">
                <div className="eyebrow">The ceremony</div>
                <div className="display title-md">{ordered.length} awards. One tap at a time.</div>
                <div className="small dim bold">The Weekend Menace goes first. The Jezza Legend goes last. Read them out loud. Make it dramatic.{isHost ? ' Your taps drive every phone and the TV.' : ' The host runs it on the TV; tap ahead if you can\'t wait.'}</div>
              </div>
            )}
            {allDone && legendPlayer?.creature && (
              <div className="panel panel-gold pad-lg center stack-6 legend-hero" ref={(el) => { if (el && heroRef.current !== el) { heroRef.current = el; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }}>
                <Confetti />
                <div className="eyebrow">The Jezza Legend</div>
                <div className="podium">
                  {[board[1], board[0], board[2]].map((p, i) => p?.creature ? (
                    <div key={p.id} className={`podium-step step-${i === 1 ? 1 : i === 0 ? 2 : 3}`}>
                      {i === 1 && <div className="crown">👑</div>}
                      <Creature creature={p.creature} level={p.level} colorway={p.equipped.colorway} equipped={p.equipped} state={i === 1 ? 'victory' : 'happy'} />
                      <div className="podium-block"><b>{i === 1 ? 1 : i === 0 ? 2 : 3}</b><span className="ellipsis">{p.nickname}</span></div>
                    </div>) : <div key={i} className="podium-step" />)}
                </div>
                <div className="display title-lg gold-text">{legendPlayer.nickname}</div>
                <div className="small dim bold">{legend?.reason}</div>
                <div className="tiny faint">Suggested prize: a cheap trophy or a sash to wear for the rest of the night. If the lads chipped into a pool ($50–$100), it&apos;s theirs.</div>
              </div>
            )}
            {[...shown].reverse().map((a, ri) => { const i = shown.length - 1 - ri; const p = party.players.find((x) => x.id === a.playerId); const menace = a.id === 'menace'; const isLegend = a.id === 'legend'; if (isLegend && allDone && legendPlayer?.creature) return null; return (
              <div key={a.id} className={`panel pad row award-card ${i === shown.length - 1 ? 'award-reveal' : ''} ${isLegend ? 'panel-gold' : ''} ${menace ? 'menace-card' : ''}`} style={{ gap: 12 }}>
                <span className="avatar lg">{p?.creature ? <Creature creature={p.creature} level={p.level} colorway={p.equipped.colorway} equipped={p.equipped} state={menace ? 'defeat' : i === shown.length - 1 ? 'victory' : 'idle'} /> : <span style={{ fontSize: 22 }}>🫥</span>}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="eyebrow">{a.name}</div>
                  <div className="display title-md ellipsis">{p?.nickname ?? 'Nobody'}</div>
                  <div className="tiny dim">{a.reason}</div>
                  {menace && p && <div className="tiny faint" style={{ marginTop: 4 }}>Optional forfeit: a 20-second speech for Jezza. Saying &quot;nah&quot; is completely fine.</div>}
                </span>
              </div>); })}
            {next ? <Button onClick={() => { sfx.sting(); setRevealed((r) => r + 1); }}>{revealed === 0 ? `Open with: ${next.name}` : next.id === 'legend' ? '👑 Crown THE JEZZA LEGEND' : `Reveal: ${next.name}`}</Button>
              : (
                <div className="center stack-6 fade-up">
                  <div className="panel pad stack-6">
                    <div className="eyebrow">The weekend in numbers</div>
                    <div className="seg" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>{recap.map((r) => <div key={r.label} className="stat"><b>{r.n}</b><span>{r.label}</span></div>)}</div>
                    {topRival && <div className="tiny bold">⚔️ Rivalry of the weekend: {nick(topRival.a)} vs {nick(topRival.b)} ({topRival.w}–{topRival.l})</div>}
                  </div>
                  <div style={{ fontSize: 36 }}>🥂</div><div className="display title-md gold-text">To Jezza. To the legends.</div><div className="small dim bold">Thanks for playing. Drink some water.</div>{me && <div className="pill pill-gold">You finished #{board.findIndex((p) => p.id === me.id) + 1} with {me.points} pts</div>}
                </div>)}
          </>
        )}
        {view === 'roasts' && (() => {
          const top = [...party.wall].sort((a, b) => (b.votes.length + (b.groomLove ? 3 : 0)) - (a.votes.length + (a.groomLove ? 3 : 0))).slice(0, 8);
          return top.length ? top.map((w, i) => (
            <div key={w.id} className={`wall-post wall-${w.kind} fade-up`} style={{ animationDelay: `${i * 120}ms` }}>
              <div className="eyebrow">#{i + 1} · {w.kind === 'roast' ? 'Roast' : 'Toast'}{w.groomLove ? ' · ❤️ Jezza\'s pick' : ''}</div>
              <div className="bold" style={{ fontSize: 16 }}>"{w.text}"</div>
              <div className="tiny faint">{party.players.find((p) => p.id === w.playerId)?.nickname} · 😂 {w.votes.length}</div>
            </div>)) : <div className="panel pad center dim">Nobody roasted Jezza. Weak effort, lads.</div>;
        })()}
        {view === 'board' && board.map((p, i) => (
          <div key={p.id} className={`list-row ${p.id === me?.id ? 'me' : ''}`}>
            <span className={`rank r${i + 1}`}>{i === 0 ? '👑' : `#${i + 1}`}</span>
            <span className="avatar sm"><LadPic p={p} /></span>
            <span className="grow" style={{ minWidth: 0 }}><div className="bold ellipsis">{p.nickname}</div><div className="tiny faint">{p.creatureName} Lv{p.level} · {p.missionsCompleted} missions · {p.wins}W {p.losses}L</div></span>
            <span className="bold gold-text">{p.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Confetti() {
  const colours = ['#E5AD48', '#F6EBDD', '#76243A', '#a8e58f', '#f07842'];
  return <div className="confetti" aria-hidden>{Array.from({ length: 28 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colours[i % 5], animationDelay: `${(i % 7) * 0.18}s`, animationDuration: `${2.4 + (i % 5) * 0.35}s` }} />)}</div>;
}
