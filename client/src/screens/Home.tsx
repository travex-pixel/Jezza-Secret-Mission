import { MISSION_BY_ID } from '@shared/missions';
import { CREATURES } from '@shared/creatures';
import { sortLeaderboard } from '@shared/progression';
import { Creature } from '../components/Creature';
import { MissionCard } from '../components/MissionCard';
import { Button, ConnectionPill, XPBar, timeAgo } from '../components/ui';
import { useEffect, useState } from 'react';
import { useStore, useMe, useIsHost } from '../store';
import { request } from '../net';

const PHASE_LABEL: Record<string, string> = { lobby: 'Pre-game', friday: 'Friday · Awakening', saturday: 'Saturday · Championship', finale: 'The Finale', ended: 'Weekend complete' };

function useFeedCount() {
  const calc = () => (window.innerHeight < 600 ? 1 : window.innerHeight < 760 ? 2 : 3);
  const [n, setN] = useState(calc);
  useEffect(() => { const f = () => setN(calc()); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return n;
}

export default function Home() {
  const me = useMe();
  const feedCount = useFeedCount();
  const party = useStore((s) => s.party);
  const priv = useStore((s) => s.priv);
  const setTab = useStore((s) => s.setTab);
  const isHost = useIsHost();
  if (!party || !me?.creature) return null;
  const def = CREATURES[me.creature];
  const board = sortLeaderboard(party.players);
  const rank = board.findIndex((p) => p.id === me.id) + 1;
  const next = priv?.hand.find((h) => h.status === 'active') ?? priv?.hand.find((h) => h.status === 'pending');
  const nextMission = next ? MISSION_BY_ID[next.missionId] : undefined;
  const feed = [...party.feed].reverse().slice(0, feedCount);
  const incoming = party.battles.find((b) => b.status === 'challenge' && b.opponentId === me.id);

  return (
    <div className="screen with-nav">
      <div className="topbar">
        <span className="row" style={{ gap: 8 }}>
          <span className="brand">PROJECT JEZZA</span>
          <span className={`pill pill-xs ${party.phase === 'lobby' ? '' : 'pill-gold'}`}>{PHASE_LABEL[party.phase]}</span>
        </span>
        <span className="row" style={{ gap: 8 }}>
          <ConnectionPill />
          {isHost && <button className="pill pill-gold" onClick={() => setTab('host')} aria-label="Host controls">👑 Host{party.pendingApprovals ? ` · ${party.pendingApprovals}` : ''}</button>}
        </span>
      </div>
      <div className="screen-body" style={{ gap: 10 }}>
        <button className="panel pad row" style={{ gap: 12, textAlign: 'left', width: '100%', padding: '10px 12px' }} onClick={() => setTab('profile')}>
          <span className="avatar lg" style={{ background: 'radial-gradient(circle at 50% 35%, rgba(229,173,72,.25), rgba(0,0,0,.4))' }}><Creature creature={me.creature} colorway={me.equipped.colorway} equipped={me.equipped} /></span>
          <span className="grow" style={{ minWidth: 0 }}>
            <div className="row-between"><span className="display title-md ellipsis">{me.creatureName}</span><span className="pill pill-gold pill-xs">{me.points} pts</span></div>
            <div className="tiny dim bold ellipsis">{me.nickname} · {def.name} · #{rank} of {board.length} · {me.missionsCompleted} missions · {me.wins}–{me.losses}</div>
            <XPBar xp={me.xp} />
          </span>
        </button>

        {incoming && <button className="panel panel-gold pad row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setTab('battle')}><span style={{ fontSize: 24 }}>⚔️</span><span className="grow bold">{party.players.find((p) => p.id === incoming.challengerId)?.nickname} challenged you!</span><span className="pill pill-ember">Answer</span></button>}

        {party.phase === 'lobby' ? (
          <div className="panel pad-lg center stack-10 grow" style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 34 }}>🍇</div>
            <div className="display title-md">Waiting in the cellar</div>
            <div className="small dim bold">{party.players.length} legend{party.players.length === 1 ? '' : 's'} have arrived. Friday begins when the host says so.</div>
            {isHost
              ? <Button onClick={() => request({ type: 'host', action: { kind: 'setPhase', phase: 'friday' } })}>Start Friday: The Awakening</Button>
              : <Button variant="secondary" onClick={() => setTab('party')}>See who's here · code {party.code}</Button>}
          </div>
        ) : nextMission ? (
          <div className="grow" style={{ minHeight: 0 }}>
            <div className="row-between" style={{ marginBottom: 6 }}><span className="eyebrow">Your next mission</span><button className="tiny bold" style={{ color: 'var(--rose)' }} onClick={() => setTab('missions')}>All missions →</button></div>
            <MissionCard mission={nextMission} assignment={next} compact />
          </div>
        ) : (
          <div className="panel pad center stack-6 grow"><div style={{ fontSize: 30 }}>🏁</div><div className="bold">No missions in hand right now.</div><div className="small dim">{party.phase === 'finale' || party.phase === 'ended' ? 'The weekend is wrapping up. Check the awards!' : 'The host will reveal more shortly.'}</div>{(party.phase === 'finale' || party.phase === 'ended') && <Button size="sm" onClick={() => setTab('ranks')}>See the awards</Button>}</div>
        )}

        <div className="stack-6 home-feed" style={{ minHeight: 0 }}>
          <div className="row-between"><span className="eyebrow">Live from the vineyard</span><button className="tiny bold" style={{ color: 'var(--rose)' }} onClick={() => setTab('party')}>Party →</button></div>
          {feed.length === 0 && <div className="feed-item"><span className="emoji">🌙</span><span className="grow dim">Quiet so far. Suspiciously quiet.</span></div>}
          {feed.map((f) => <div key={f.id} className="feed-item"><span className="emoji">{f.emoji ?? '•'}</span><span className="grow"><span className="ellipsis" style={{ display: 'block' }}>{f.text}</span><time>{timeAgo(f.at)}</time></span></div>)}
        </div>
      </div>
    </div>
  );
}
