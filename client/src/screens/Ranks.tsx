import { sortLeaderboard, ACHIEVEMENT_BY_ID } from '@shared/progression';
import { CREATURES } from '@shared/creatures';
import { Creature } from '../components/Creature';
import { useStore, useMe } from '../store';
import Finale from './Finale';

export default function Ranks() {
  const party = useStore((s) => s.party);
  const me = useMe();
  const setTab = useStore((s) => s.setTab);
  if (!party) return null;
  if (party.phase === 'finale' || party.phase === 'ended') return <Finale />;
  const board = sortLeaderboard(party.players).filter((p) => p.creature);
  const top = board.slice(0, 3);
  const rest = board.slice(3);
  const podiumOrder = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className="screen with-nav">
      <div className="topbar"><h2 className="display title-md">Weekend leaderboard</h2><span className="pill pill-gold">{party.phase === 'friday' ? 'Friday' : party.phase === 'saturday' ? 'Saturday' : 'Pre-game'}</span></div>
      <div className="screen-body" style={{ gap: 10 }}>
        {board.length === 0 && <div className="panel pad center dim">No legends ranked yet.</div>}
        {top.length > 0 && (
          <div className="row" style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 6 }}>
            {podiumOrder.map((p) => { const r = board.indexOf(p) + 1; const h = r === 1 ? 104 : r === 2 ? 84 : 72; return (
              <button key={p.id} className="col center" style={{ flex: 1, gap: 4, alignItems: 'center' }} onClick={() => setTab('party')}>
                <Creature creature={p.creature!} colorway={p.equipped.colorway} equipped={p.equipped} state={r === 1 ? 'victory' : 'idle'} style={{ width: h, filter: r === 1 ? 'drop-shadow(0 0 16px rgba(229,173,72,.6))' : undefined }} />
                <div className={`rank r${r}`} style={{ fontSize: r === 1 ? 20 : 16 }}>{r === 1 ? '👑' : `#${r}`}</div>
                <div className="bold small ellipsis" style={{ maxWidth: '100%' }}>{p.nickname}</div>
                <div className="pill pill-gold pill-xs">{p.points} pts</div>
                <div className="tiny faint">{p.creatureName} Lv{p.level} · {p.wins}W {p.losses}L</div>
              </button>); })}
          </div>
        )}
        <div className="scroll-y stack-6 grow" style={{ minHeight: 0 }}>
          {rest.map((p, i) => { const last = p.achievements[p.achievements.length - 1]; return (
            <div key={p.id} className={`list-row ${p.id === me?.id ? 'me' : ''}`}>
              <span className="rank">#{i + 4}</span>
              <span className="avatar sm"><Creature creature={p.creature!} colorway={p.equipped.colorway} bare /></span>
              <span className="grow" style={{ minWidth: 0 }}><div className="bold ellipsis">{p.nickname}{p.id === me?.id ? ' (you)' : ''}</div><div className="tiny faint ellipsis">{CREATURES[p.creature!].name} Lv{p.level} · {p.wins}W {p.losses}L{last ? ` · 🏅 ${ACHIEVEMENT_BY_ID[last]?.name}` : ''}</div></span>
              <span className="bold nowrap gold-text">{p.points}</span>
            </div>); })}
          {rest.length === 0 && board.length > 0 && <div className="center tiny faint pad">Everyone's on the podium. Suspicious.</div>}
        </div>
      </div>
    </div>
  );
}
