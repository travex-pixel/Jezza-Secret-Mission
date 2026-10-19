import { useState } from 'react';
import { sortLeaderboard, rankFor } from '@shared/progression';
import { FORMS } from '@shared/creatures';
import { Creature } from '../components/Creature';
import { useStore, useMe } from '../store';
import Finale from './Finale';
import BattleBoard from './BattleBoard';

export default function Ranks() {
  const party = useStore((s) => s.party);
  const me = useMe();
  const setTab = useStore((s) => s.setTab);
  const [view, setView] = useState<'board' | 'battles' | 'awards'>('board');
  if (!party) return null;
  if (party.phase === 'finale' || party.phase === 'ended') return <Finale />;
  const board = sortLeaderboard(party.players).filter((p) => p.creature);
  const top = board.slice(0, 3);
  const rest = board.slice(3);
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean);
  const leaderId = board[0]?.points ? board[0].id : null;
  const nick = (id: string | null) => party.players.find((p) => p.id === id)?.nickname;
  return (
    <div className="screen with-nav">
      <div className="topbar"><h2 className="display title-md">Leaderboard</h2><span className="pill pill-gold">{party.phase === 'saturday' ? 'Saturday' : 'Friday'}</span></div>
      <div className="tabs" style={{ marginBottom: 8 }}><button className={`tab ${view === 'board' ? 'on' : ''}`} onClick={() => setView('board')}>Points</button><button className={`tab ${view === 'battles' ? 'on' : ''}`} onClick={() => setView('battles')}>Battles</button><button className={`tab ${view === 'awards' ? 'on' : ''}`} onClick={() => setView('awards')}>Award race</button></div>
      {view === 'board' ? (
        <div className="screen-body" style={{ gap: 8 }}>
          {board.length === 0 && <div className="panel pad center dim">Nobody's on the board yet.</div>}
          {top.length > 0 && (
            <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 6 }}>
              {podiumOrder.map((p) => { const r = board.indexOf(p) + 1; const h = r === 1 ? 96 : r === 2 ? 78 : 68; return (
                <button key={p.id} className="col center" style={{ flex: 1, gap: 2, alignItems: 'center', minWidth: 0 }} onClick={() => setTab('party')}>
                  <Creature creature={p.creature!} level={p.level} colorway={p.equipped.colorway} equipped={p.equipped} state={r === 1 ? 'victory' : 'idle'} style={{ width: h }} />
                  <div className={`rank r${r}`} style={{ fontSize: r === 1 ? 18 : 15 }}>{r === 1 ? '👑' : `#${r}`}</div>
                  <div className="bold small ellipsis" style={{ maxWidth: '100%' }}>{p.nickname}</div>
                  <div className="pill pill-gold pill-xs">{p.points} pts</div>
                  <div className="tiny faint ellipsis" style={{ maxWidth: '100%' }}>{rankFor(p.rating).emoji} {p.wins}W {p.losses}L{p.streak >= 2 ? ` 🔥${p.streak}` : ''}</div>
                </button>); })}
            </div>
          )}
          {leaderId && <div className="tiny center faint">👑 Bounty on {nick(leaderId)}: beat them in a battle for double points.</div>}
          <div className="scroll-y stack-6 grow" style={{ minHeight: 0 }}>
            {rest.map((p, i) => (
              <div key={p.id} className={`list-row ${p.id === me?.id ? 'me' : ''}`}>
                <span className="rank">#{i + 4}</span>
                <span className="avatar sm"><Creature creature={p.creature!} level={p.level} colorway={p.equipped.colorway} bare /></span>
                <span className="grow" style={{ minWidth: 0 }}><div className="bold ellipsis">{p.nickname}{p.id === me?.id ? ' (you)' : ''}{p.freshLegs > 0 ? ' 🦵' : ''}</div><div className="tiny faint ellipsis">{FORMS[p.creature!][p.level >= 8 ? 2 : p.level >= 4 ? 1 : 0]} Lv{p.level} · {rankFor(p.rating).emoji} {p.wins}W {p.losses}L{p.streak >= 2 ? ` · 🔥${p.streak}` : ''}</div></span>
                <span className="bold nowrap gold-text">{p.points}</span>
              </div>))}
            {rest.length === 0 && board.length > 0 && <div className="center tiny faint pad">Everyone's on the podium. Suspicious.</div>}
          </div>
        </div>
      ) : view === 'battles' ? <BattleBoard meId={me?.id} /> : (
        <div className="screen-body scroll-y stack-6">
          <div className="tiny faint">Who's leading each award right now. All from real play: reactions, votes, challenges and battles. Final results at the finale.</div>
          {party.awards.filter((a) => a.id !== 'unhinged').map((a) => (
            <div key={a.id} className={`list-row ${a.playerId === me?.id ? 'me' : ''}`}>
              <span className="grow" style={{ minWidth: 0 }}><div className="eyebrow">{a.name}</div><div className="bold ellipsis">{nick(a.playerId) ?? 'Up for grabs'}</div><div className="tiny faint">{a.playerId ? a.reason : a.blurb}</div></span>
              {a.playerId === me?.id && <span className="pill pill-xs pill-gold">you</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
