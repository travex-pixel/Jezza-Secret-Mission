import { useEffect, useState } from 'react';
import { sortLeaderboard } from '@shared/progression';
import { Creature } from '../components/Creature';
import { Button } from '../components/ui';
import { useStore, useMe } from '../store';
import { sfx } from '../audio';

export default function Finale() {
  const party = useStore((s) => s.party);
  const me = useMe();
  const [revealed, setRevealed] = useState(0);
  const [view, setView] = useState<'awards' | 'board'>('awards');
  const awards = party?.awards ?? [];
  useEffect(() => { if (revealed > 0) sfx.reward(); }, [revealed]);
  if (!party) return null;
  const board = sortLeaderboard(party.players).filter((p) => p.creature);
  const totalMissions = party.players.reduce((a, p) => a + p.missionsCompleted, 0);
  const totalBattles = party.players.reduce((a, p) => a + p.wins, 0);
  const shown = awards.slice(0, revealed);
  const next = awards[revealed];
  const legend = awards.find((a) => a.id === 'legend');
  const legendPlayer = party.players.find((p) => p.id === legend?.playerId);

  return (
    <div className="screen with-nav">
      <div className="topbar"><h2 className="display title-md gold-text">{party.finalized ? 'Final results' : 'The Finale'}</h2><span className="pill pill-gold">{party.finalized ? '👑 FINAL' : 'live'}</span></div>
      <div className="tabs" style={{ marginBottom: 10 }}><button className={`tab ${view === 'awards' ? 'on' : ''}`} onClick={() => setView('awards')}>Awards</button><button className={`tab ${view === 'board' ? 'on' : ''}`} onClick={() => setView('board')}>Final board</button></div>
      <div className="screen-body scroll-y stack-10">
        {view === 'awards' && (
          <>
            {revealed === 0 && legendPlayer?.creature && (
              <div className="panel panel-gold pad-lg center stack-6 fade-up">
                <div className="eyebrow">The weekend in numbers</div>
                <div className="seg" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}><div className="stat"><b>{board.length}</b><span>legends</span></div><div className="stat"><b>{totalMissions}</b><span>missions</span></div><div className="stat"><b>{totalBattles}</b><span>battles</span></div></div>
                <div className="small dim bold">Ten awards. One tap at a time. Make it dramatic.</div>
              </div>
            )}
            {shown.map((a, i) => { const p = party.players.find((x) => x.id === a.playerId); return (
              <div key={a.id} className={`panel pad row ${i === shown.length - 1 ? 'fade-up' : ''} ${a.id === 'legend' ? 'panel-gold' : ''}`} style={{ gap: 12 }}>
                <span className="avatar lg">{p?.creature ? <Creature creature={p.creature} colorway={p.equipped.colorway} equipped={p.equipped} state={i === shown.length - 1 ? 'victory' : 'idle'} /> : <span style={{ fontSize: 22 }}>🫥</span>}</span>
                <span className="grow" style={{ minWidth: 0 }}><div className="eyebrow">{a.name}</div><div className="display title-md ellipsis">{p?.nickname ?? 'Nobody'}</div><div className="tiny dim">{a.reason}</div></span>
              </div>); })}
            {next ? <Button onClick={() => setRevealed((r) => r + 1)}>{revealed === 0 ? 'Reveal the first award' : `Reveal: ${next.name}`}</Button>
              : <div className="center stack-6 fade-up"><div style={{ fontSize: 36 }}>🥂</div><div className="display title-md gold-text">To Jezza. To the legends.</div><div className="small dim bold">Thanks for playing. Drink some water.</div>{me && <div className="pill pill-gold">You finished #{board.findIndex((p) => p.id === me.id) + 1} with {me.points} pts</div>}</div>}
          </>
        )}
        {view === 'board' && board.map((p, i) => (
          <div key={p.id} className={`list-row ${p.id === me?.id ? 'me' : ''}`}>
            <span className={`rank r${i + 1}`}>{i === 0 ? '👑' : `#${i + 1}`}</span>
            <span className="avatar sm"><Creature creature={p.creature!} colorway={p.equipped.colorway} bare /></span>
            <span className="grow" style={{ minWidth: 0 }}><div className="bold ellipsis">{p.nickname}</div><div className="tiny faint">{p.creatureName} Lv{p.level} · {p.missionsCompleted} missions · {p.wins}W {p.losses}L</div></span>
            <span className="bold gold-text">{p.points}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
