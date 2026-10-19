import { useEffect, useState } from 'react';
import { MISSION_BY_ID } from '@shared/missions';
import { FORMS } from '@shared/creatures';
import { LEVEL_XP, sortLeaderboard, nextEvolveLevel, FRIDAY_MAX_LEVEL, rankFor } from '@shared/progression';
import { BOSSES } from '@shared/raid';
import { Creature } from '../components/Creature';
import { MissionCard } from '../components/MissionCard';
import { Button, ConnectionPill, FeedItem, XPBar, useCountdown } from '../components/ui';
import { useStore, useMe, useIsHost } from '../store';
import { request } from '../net';

const PHASE_LABEL: Record<string, string> = { lobby: 'Paused', friday: 'Friday night', saturday: 'Saturday', finale: 'The Finale', ended: 'Wrapped' };

function useFeedCount(busy: boolean) {
  const calc = () => Math.max(0, (window.innerHeight < 600 ? 1 : window.innerHeight < 760 ? 2 : 3) - (busy ? 1 : 0));
  const [n, setN] = useState(calc);
  useEffect(() => { const f = () => setN(calc()); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps
  return n;
}

export default function Home() {
  const me = useMe();
  const party = useStore((s) => s.party);
  const priv = useStore((s) => s.priv);
  const setTab = useStore((s) => s.setTab);
  const isHost = useIsHost();
  const raid = party?.raid?.status === 'active' && party.raid.endsAt > Date.now() ? party.raid : null;
  const raidLeft = useCountdown(raid?.endsAt);
  const incoming = party?.battles.find((b) => b.status === 'challenge' && b.opponentId === me?.id);
  const feedCount = useFeedCount(!!raid || !!incoming);
  if (!party || !me?.creature) return null;
  const board = sortLeaderboard(party.players);
  const rank = board.findIndex((p) => p.id === me.id) + 1;
  const next = priv?.hand.find((h) => h.status === 'active') ?? priv?.hand.find((h) => h.status === 'pending');
  const nextMission = next ? MISSION_BY_ID[next.missionId] : undefined;
  const feed = [...party.feed].reverse().filter((f) => f.kind !== 'achievement' && f.kind !== 'levelup').slice(0, feedCount);
  // Evolution tease
  const evoAt = nextEvolveLevel(me.level);
  const lockedTilSaturday = evoAt === 8 && me.level >= FRIDAY_MAX_LEVEL && (party.phase === 'friday' || party.phase === 'lobby');
  const xpToEvo = evoAt ? LEVEL_XP[evoAt - 1] - me.xp : 0;
  const twitching = !!evoAt && !lockedTilSaturday && xpToEvo <= 80;
  const tease = !evoAt ? `${FORMS[me.creature][2]}: final form` : lockedTilSaturday ? '🔒 Final form unlocks Saturday' : twitching ? `🧬 ${me.creatureName} is twitching… ${xpToEvo} XP to evolve` : `Evolves at Lv ${evoAt}`;

  return (
    <div className="screen with-nav">
      <div className="topbar">
        <span className="row" style={{ gap: 8 }}>
          <span className="brand">PROJECT JEZZA</span>
          <span className={`pill pill-xs ${party.phase === 'lobby' ? '' : 'pill-gold'}`}>{PHASE_LABEL[party.phase]}</span>
        </span>
        <span className="row" style={{ gap: 8 }}>
          <ConnectionPill />
          {isHost && <button className="pill pill-gold" onClick={() => setTab('host')} aria-label="Host controls">👑{party.pendingApprovals ? ` ${party.pendingApprovals}` : ''}</button>}
        </span>
      </div>
      <div className="screen-body" style={{ gap: 8 }}>
        <button className="panel pad row" style={{ gap: 12, textAlign: 'left', width: '100%', padding: '10px 12px' }} onClick={() => setTab('profile')}>
          <span className="avatar lg" style={{ background: 'radial-gradient(circle at 50% 35%, rgba(229,173,72,.25), rgba(0,0,0,.4))' }}><Creature creature={me.creature} level={me.level} colorway={me.equipped.colorway} equipped={me.equipped} className={twitching ? 'twitch' : ''} /></span>
          <span className="grow" style={{ minWidth: 0 }}>
            <div className="row-between"><span className="display title-md ellipsis">{me.creatureName}</span><span className="pill pill-gold pill-xs">{me.points} pts · #{rank}</span></div>
            <div className={twitching ? 'twitch-note ellipsis' : 'tiny dim bold ellipsis'}>{me.freshLegs > 0 ? `🦵 Fresh Legs: 2× points (${me.freshLegs} left) · ` : ''}{tease}</div>
            <XPBar xp={me.xp} />
          </span>
        </button>

        {raid && (
          <button className="raid-banner" onClick={() => setTab('raid')}>
            <span style={{ fontSize: 26 }}>👹</span>
            <span className="grow" style={{ minWidth: 0 }}><div className="bold ellipsis">{BOSSES[raid.boss].name} is here!</div><div className="tiny" style={{ opacity: .85 }}>{Math.round((raid.hp / raid.maxHp) * 100)}% HP · {Math.floor(raidLeft / 60)}:{String(raidLeft % 60).padStart(2, '0')} left · everyone who hits gets loot</div></span>
            <span className="pill pill-ember">FIGHT</span>
          </button>
        )}
        {!raid && incoming && <button className="panel panel-gold pad row" style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }} onClick={() => setTab('battle')}><span style={{ fontSize: 22 }}>⚔️</span><span className="grow bold">{party.players.find((p) => p.id === incoming.challengerId)?.nickname} wants a piece of you</span><span className="pill pill-ember">Answer</span></button>}

        {party.phase === 'lobby' ? (
          <div className="panel pad-lg center stack-10 grow" style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 34 }}>⏸️</div>
            <div className="display title-md">Game's paused</div>
            <div className="small dim bold">{isHost ? 'You paused it. Kick it back off when the lads are ready.' : 'The host has paused things. Back shortly.'}</div>
            {isHost && <Button onClick={() => request({ type: 'host', action: { kind: 'setPhase', phase: 'friday' } })}>Back on</Button>}
          </div>
        ) : nextMission ? (
          <div className="grow" style={{ minHeight: 0 }}>
            <div className="row-between" style={{ marginBottom: 6 }}><span className="eyebrow">Your next challenge</span><button className="tiny bold" style={{ color: 'var(--rose)' }} onClick={() => setTab('missions')}>All {priv?.hand.length ?? 0} →</button></div>
            <MissionCard mission={nextMission} assignment={next} compact />
          </div>
        ) : (
          <div className="panel pad center stack-6 grow"><div style={{ fontSize: 30 }}>🏁</div><div className="bold">No challenges in hand right now.</div><div className="small dim">{party.phase === 'finale' || party.phase === 'ended' ? 'The weekend is wrapping up. Check the awards.' : 'Fresh ones land shortly.'}</div>{(party.phase === 'finale' || party.phase === 'ended') && <Button size="sm" onClick={() => setTab('ranks')}>See the awards</Button>}</div>
        )}

        <div className="quick-row">
          <button className="quick-btn" onClick={() => setTab('wall')}><span className="ico">🎤</span>Jezza Wall</button>
          <button className="quick-btn" onClick={() => setTab('cellar')}><span className="ico">🍷</span>Cellar</button>
          <button className="quick-btn" onClick={() => setTab('gallery')}><span className="ico">📸</span>Photos</button>
          <button className="quick-btn" onClick={() => setTab(raid ? 'raid' : 'party')}><span className="ico">{raid ? '👹' : '👥'}</span>{raid ? 'Raid' : 'Party'}</button>
        </div>

        {feedCount > 0 && (
          <div className="stack-6" style={{ minHeight: 0 }}>
            <div className="row-between"><span className="eyebrow">What the lads are up to</span><span className="tiny faint">{rankFor(me.rating).emoji} {rankFor(me.rating).name}</span></div>
            {feed.length === 0 && <div className="feed-item"><span className="emoji">🌙</span><span className="grow dim">Quiet so far. Suspiciously quiet.</span></div>}
            {feed.map((f) => <FeedItem key={f.id} f={f} compact />)}
          </div>
        )}
      </div>
    </div>
  );
}
