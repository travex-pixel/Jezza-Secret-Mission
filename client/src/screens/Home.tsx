import { useEffect, useState } from 'react';
import { MISSION_BY_ID } from '@shared/missions';
import { LEVEL_XP, sortLeaderboard, nextEvolveLevel, FRIDAY_MAX_LEVEL } from '@shared/progression';
import { BOSSES } from '@shared/raid';
import { Creature } from '../components/Creature';
import { MissionCard } from '../components/MissionCard';
import { EpicCard } from '../components/EpicCard';
import HowItWorksSheet from '../components/HowItWorks';
import { Button, ConnectionPill, FeedItem, XPBar, useCountdown } from '../components/ui';
import { useStore, useMe, useIsHost } from '../store';
import { request } from '../net';

const PHASE_LABEL: Record<string, string> = { lobby: 'Paused', friday: 'Friday night', saturday: 'Saturday', finale: 'The Finale', ended: 'Wrapped' };

/** Room on the Lobby for banners + feed items: 1 on short phones, 2 on most, 3 on tall ones. */
function useSlots() {
  const calc = () => (window.innerHeight < 600 ? 1 : window.innerHeight < 760 ? 2 : 3);
  const [n, setN] = useState(calc);
  useEffect(() => { const f = () => setN(calc()); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return n;
}

export default function Home() {
  const me = useMe();
  const party = useStore((s) => s.party);
  const priv = useStore((s) => s.priv);
  const setTab = useStore((s) => s.setTab);
  const conn = useStore((s) => s.conn);
  const [help, setHelp] = useState(false);
  const isHost = useIsHost();
  const raid = party?.raid?.status === 'active' && party.raid.endsAt > Date.now() ? party.raid : null;
  const raidLeft = useCountdown(raid?.endsAt);
  const incoming = party?.battles.find((b) => b.status === 'challenge' && b.opponentId === me?.id);
  const fighting = party?.battles.find((b) => b.status === 'active' && !b.auto && (b.a.playerId === me?.id || b.b.playerId === me?.id));
  const awayN = priv?.away?.length ?? 0;
  const setAwayOpen = useStore((s) => s.setAwayOpen);
  const voteEv = party?.feed.slice().reverse().find((f) => f.kind === 'vote' && f.playerId !== me?.id && party.pendingPhotos?.some((x) => x.claimId === f.claimId && !x.up.includes(me?.id ?? '') && !x.down.includes(me?.id ?? '')));
  const witnessReq = priv?.pendingWitness?.[0];
  // An EPIC job you're on (to tick off), else one with spots still open
  const epic = party?.epics?.find((e) => e.status === 'open' && e.crew.includes(me?.id ?? '')) ?? party?.epics?.find((e) => e.status === 'open' && e.crew.length < e.max);
  const slots = useSlots();
  if (!party || !me?.creature) return null;
  const board = sortLeaderboard(party.players);
  const rank = board.findIndex((p) => p.id === me.id) + 1;
  // The one thing to do now: a real challenge first; the pinned group selfie only if that's all there is
  const activeHand = priv?.hand.filter((h) => h.status === 'active') ?? [];
  const next = activeHand.find((h) => !MISSION_BY_ID[h.missionId]?.tutorial) ?? activeHand[0] ?? priv?.hand.find((h) => h.status === 'pending');
  const nextMission = next ? MISSION_BY_ID[next.missionId] : undefined;
  const pinnedSelfie = next?.missionId !== 'm001' && activeHand.some((h) => h.missionId === 'm001');
  // One alert at a time, most urgent first. Everything else is a tab away.
  const alert = fighting ? 'fight' : incoming ? 'incoming' : raid ? 'raid' : witnessReq ? 'witness' : voteEv ? 'vote' : epic?.crew.includes(me.id) ? 'epic' : awayN > 0 ? 'away' : epic ? 'epic' : null;
  const feed = [...party.feed].reverse().filter((f) => f.kind !== 'achievement' && f.kind !== 'levelup' && f.id !== voteEv?.id).slice(0, Math.max(0, slots - (alert ? 1 : 0)));
  // Evolution nudge, only when it's close
  const evoAt = nextEvolveLevel(me.level);
  const lockedTilSaturday = evoAt === 8 && me.level >= FRIDAY_MAX_LEVEL && (party.phase === 'friday' || party.phase === 'lobby');
  const xpToEvo = evoAt ? LEVEL_XP[evoAt - 1] - me.xp : 0;
  const twitching = !!evoAt && !lockedTilSaturday && xpToEvo <= 80;
  const challenger = incoming && party.players.find((p) => p.id === incoming.challengerId)?.nickname;

  return (
    <div className="screen with-nav">
      {help && <HowItWorksSheet onClose={() => setHelp(false)} />}
      <div className="topbar">
        <span className="row" style={{ gap: 8 }}>
          <span className="brand">PROJECT JEZZA</span>
          <span className={`pill pill-xs ${party.phase === 'lobby' ? '' : 'pill-gold'}`}>{PHASE_LABEL[party.phase]}</span>
        </span>
        <span className="row" style={{ gap: 8 }}>
          {conn !== 'online' && <ConnectionPill />}
          <button className="pill" onClick={() => setHelp(true)} aria-label="How it works">❓</button>
          {isHost && <button className="pill pill-gold" onClick={() => setTab('host')} aria-label="Host controls">👑{party.pendingApprovals ? ` ${party.pendingApprovals}` : ''}</button>}
        </span>
      </div>
      <div className="screen-body" style={{ gap: 10 }}>
        {/* status: one slim line, tap for the full profile */}
        <button className="status-strip" onClick={() => setTab('profile')} aria-label="Your creature and progress">
          <span className="avatar"><Creature creature={me.creature} level={me.level} colorway={me.equipped.colorway} equipped={me.equipped} className={twitching ? 'twitch' : ''} bare /></span>
          <span className="grow" style={{ minWidth: 0 }}>
            <span className="row-between"><span className="bold ellipsis">{me.creatureName}</span><span className="pill pill-gold pill-xs">{me.points} pts · #{rank}</span></span>
            <XPBar xp={me.xp} />
            {(twitching || me.freshLegs > 0) && <span className={twitching ? 'twitch-note ellipsis' : 'tiny dim bold ellipsis'} style={{ display: 'block' }}>{me.freshLegs > 0 ? `🦵 Fresh Legs: 2× points (${me.freshLegs} left)` : `🧬 ${xpToEvo} XP to evolve`}</span>}
          </span>
        </button>

        {alert === 'fight' && <button className="panel panel-gold pad row alert" onClick={() => setTab('battle')}><span style={{ fontSize: 22 }}>⚔️</span><span className="grow bold">Your fight is on. Pick your game plan.</span><span className="pill pill-ember pill-xs">GO</span></button>}
        {alert === 'incoming' && <button className="panel panel-gold pad row alert" onClick={() => setTab('battle')}><span style={{ fontSize: 22 }}>⚔️</span><span className="grow bold">{challenger ?? 'A mate'} wants to fight you</span><span className="pill pill-ember pill-xs">ANSWER</span></button>}
        {alert === 'raid' && raid && (
          <button className="raid-banner" onClick={() => setTab('raid')}>
            <span style={{ fontSize: 26 }}>👹</span>
            <span className="grow" style={{ minWidth: 0 }}><div className="bold ellipsis">{BOSSES[raid.boss].name} is here!</div><div className="tiny" style={{ opacity: .85 }}>{Math.round((raid.hp / raid.maxHp) * 100)}% HP · {Math.floor(raidLeft / 60)}:{String(raidLeft % 60).padStart(2, '0')} left · everyone who hits gets loot</div></span>
            <span className="pill pill-ember">FIGHT</span>
          </button>
        )}
        {alert === 'witness' && witnessReq && <button className="panel panel-gold pad row alert" onClick={() => setTab('missions')}><span style={{ fontSize: 22 }}>👀</span><span className="grow bold ellipsis">{witnessReq.fromNickname} reckons you saw “{MISSION_BY_ID[witnessReq.missionId]?.title}”</span><span className="pill pill-ember pill-xs">DID YOU?</span></button>}
        {alert === 'vote' && voteEv && <FeedItem f={voteEv} compact />}
        {alert === 'epic' && epic && <EpicCard epic={epic} compact />}
        {alert === 'away' && <button className="panel pad row alert" onClick={() => setAwayOpen(true)}><span style={{ fontSize: 22 }}>🤖</span><span className="grow bold">{me.creatureName} auto-battled {awayN} time{awayN === 1 ? '' : 's'} while you were away</span><span className="pill pill-xs">SEE</span></button>}

        {party.phase === 'lobby' ? (
          <div className="panel pad-lg center stack-10 grow" style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 34 }}>⏸️</div>
            <div className="display title-md">Game's paused</div>
            <div className="small dim bold">{isHost ? 'You paused it. Kick it back off when the lads are ready.' : 'The host has paused things. Back shortly.'}</div>
            {isHost && <Button onClick={() => request({ type: 'host', action: { kind: 'setPhase', phase: 'friday' } })}>Back on</Button>}
          </div>
        ) : nextMission ? (
          <div className="grow" style={{ minHeight: 0 }}>
            <div className="row-between" style={{ marginBottom: 6 }}><span className="eyebrow">Do this next</span><button className="tiny bold" style={{ color: 'var(--rose)' }} onClick={() => setTab('missions')}>All {activeHand.length} →</button></div>
            <MissionCard mission={nextMission} assignment={next} compact />
            {pinnedSelfie && <button className="tiny dim bold" style={{ marginTop: 6 }} onClick={() => setTab('missions')}>📸 Group selfie with Jezza still to grab →</button>}
          </div>
        ) : (
          <div className="panel pad center stack-6 grow"><div style={{ fontSize: 30 }}>🏁</div><div className="bold">No challenges in hand right now.</div><div className="small dim">{party.phase === 'finale' || party.phase === 'ended' ? 'The weekend is wrapping up. Check the awards.' : 'Fresh ones land shortly.'}</div></div>
        )}

        <div className="quick-row">
          <button className="quick-btn" onClick={() => setTab('wall')}><span className="ico">🎤</span>Wall</button>
          <button className="quick-btn" onClick={() => setTab('gallery')}><span className="ico">📸</span>Photos</button>
          <button className="quick-btn" onClick={() => setTab('cellar')}><span className="ico">🍷</span>Cellar</button>
          <button className="quick-btn" onClick={() => setTab(raid ? 'raid' : 'party')}><span className="ico">{raid ? '👹' : '👥'}</span>{raid ? 'Raid' : 'Party'}</button>
        </div>

        {feed.length > 0 && (
          <div className="stack-6" style={{ minHeight: 0, flex: '0 1 auto', overflow: 'hidden' }}>{/* gives way on short phones instead of pushing the page */}
            <div className="eyebrow">The lads</div>
            {feed.map((f) => <FeedItem key={f.id} f={f} compact />)}
          </div>
        )}
      </div>
    </div>
  );
}
