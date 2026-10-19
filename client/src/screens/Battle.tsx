import { useEffect, useRef, useState } from 'react';
import type { Battle, BattleAction, PlayerPublic, TapQuality } from '@shared/types';
import { CREATURES } from '@shared/creatures';
import { makeCreatureState, resolveRound, ROUND_SECONDS } from '@shared/battle';
import { rankFor, sortLeaderboard } from '@shared/progression';
import { Creature } from '../components/Creature';
import { Button, Sheet, useCountdown } from '../components/ui';
import BattleStage from '../battle/BattleStage';
import PowerTap from '../components/PowerTap';
import { useStore, useMe, useMyBattle, playerById } from '../store';
import { request } from '../net';
import { sfx } from '../audio';

// ---------- Arena (shared by live + practice) ----------
interface ArenaProps {
  battle: Battle;
  meId: string;
  names: Record<string, { nick: string; name: string; level: number; colorway: number; equipped: PlayerPublic['equipped'] }>;
  onAction: (a: BattleAction, tap?: TapQuality) => Promise<void> | void;
  onSurrender?: () => void;
  onRematch?: () => void;
  onExit: () => void;
  practice?: boolean;
}

function Arena({ battle, meId, names, onAction, onSurrender, onRematch, onExit, practice }: ArenaProps) {
  const mine = battle.a.playerId === meId ? battle.a : battle.b;
  const foe = battle.a.playerId === meId ? battle.b : battle.a;
  const [busy, setBusy] = useState(false);
  const [shownRounds, setShownRounds] = useState(battle.log.length);
  const [skip, setSkip] = useState(0);
  const [resultReady, setResultReady] = useState(battle.status === 'finished');
  const left = useCountdown(battle.status === 'active' ? battle.roundDeadline : undefined);
  const [confirmSurrender, setConfirmSurrender] = useState(false);

  const [tapping, setTapping] = useState<BattleAction | null>(null);
  const commit = async (a: BattleAction, tap?: TapQuality) => { setTapping(null); setBusy(true); try { await onAction(a, tap); } finally { setBusy(false); } };
  const act = (a: BattleAction) => { if (busy || tapping || mine.action || mine.locked) return; sfx.tap(); if (a === 'counter') void commit(a); else setTapping(a); };
  const myInfo = names[mine.playerId]; const foeInfo = names[foe.playerId];
  const lastLog = shownRounds > 0 ? battle.log[Math.min(shownRounds, battle.log.length) - 1] : undefined;
  // The result card waits for the animation, so the KO isn't spoiled by text.
  const finished = battle.status === 'finished' && resultReady;
  const won = battle.winnerId === meId;
  const locked = !!mine.action || !!mine.locked;

  return (
    <div className="screen-body" style={{ gap: 8 }}>
      <BattleStage
        battle={battle} info={names} nearId={meId} mode="live" skip={skip} nearLabel="You"
        onRound={setShownRounds} onDone={() => setResultReady(true)}
        top={battle.status === 'active' && <div className={`countdown ${left <= 5 ? 'urgent' : ''}`}>{left || '–'}</div>}
        status={(who) => battle.status !== 'active' ? null : who === 'far'
          ? <span className="pill pill-xs status">{foe.locked || foe.action ? '🔒 ready' : '🤔 choosing'}</span>
          : <span className="pill pill-xs status">{locked ? '🔒 locked in' : 'your move'}</span>}
        overlay={tapping && <PowerTap label={tapping === 'special' ? CREATURES[mine.creature].special.name : 'Attack'} onDone={(q) => commit(tapping, q)} />}
      />
      <div className="arena-log">
        {lastLog ? lastLog.lines.slice(-2).map((l, i) => <div key={`${lastLog.round}-${i}`} className="log-line ellipsis">{l}</div>) : <div className="log-line">{practice ? 'Practice bout. Nothing at stake but pride.' : battle.scored ? 'Winner +15 · loser +5. Tap the gold zone for a crit.' : 'Friendly bout: you two have battled enough for points.'}</div>}
      </div>
      {battle.status === 'finished' && !finished ? (
        <div className="row-between"><span className="tiny faint">Watching the fight play out…</span><button className="tiny bold" style={{ color: 'var(--rose)' }} onClick={() => setSkip((x) => x + 1)}>Skip ⏭</button></div>
      ) : finished ? (
        <div className="panel panel-gold pad center stack-6 fade-up">
          <div className="display title-lg gold-text">{won ? 'VICTORY' : 'DEFEATED'}</div>
          <div className="small bold dim">{won ? `${myInfo?.name} stands tall. ${foeInfo?.nick} will be hearing about this.` : `${foeInfo?.name} got the better of you. Rematch?`}</div>
          {battle.rewards?.[meId] && !practice && <span className="pill pill-gold">+{battle.rewards[meId].points} pts · +{battle.rewards[meId].xp} XP</span>}
          <div className="btn-row">{onRematch && <Button variant="secondary" size="sm" onClick={onRematch}>Rematch</Button>}<Button size="sm" onClick={onExit}>Done</Button></div>
        </div>
      ) : (
        <>
          <div className="actions">
            <button className={`action-btn attack ${mine.action === 'attack' ? 'chosen' : ''}`} disabled={locked || busy} onClick={() => act('attack')}>ATTACK<small>Tap to power up</small></button>
            <button className={`action-btn counter ${mine.action === 'counter' ? 'chosen' : ''}`} disabled={locked || busy} onClick={() => act('counter')}>COUNTER<small>Half damage, hit back</small></button>
            <button className={`action-btn special ${mine.action === 'special' ? 'chosen' : ''}`} disabled={locked || busy || mine.specialCooldown > 0} onClick={() => act('special')}>{CREATURES[mine.creature].special.name.toUpperCase()}<small>{mine.specialCooldown > 0 ? `Recharging (${mine.specialCooldown})` : CREATURES[mine.creature].special.blurb}</small></button>
          </div>
          <div className="row-between"><span className="tiny faint">Counter: take half, throw 45% back. Nothing if they don't hit you.</span>{onSurrender && <button className="tiny bold" style={{ color: 'var(--rose)' }} onClick={() => setConfirmSurrender(true)}>Surrender</button>}</div>
        </>
      )}
      {confirmSurrender && <Sheet center onClose={() => setConfirmSurrender(false)}><div className="center stack-10"><div className="display title-md">Wave the white flag?</div><div className="small dim">Your opponent takes the win. You keep your dignity. Mostly.</div><div className="btn-row"><Button variant="secondary" size="sm" onClick={() => setConfirmSurrender(false)}>Keep fighting</Button><Button variant="danger" size="sm" onClick={() => { setConfirmSurrender(false); onSurrender?.(); }}>Surrender</Button></div></div></Sheet>}
    </div>
  );
}

// ---------- Practice (local, unrewarded) ----------
function usePractice(me: PlayerPublic | undefined) {
  const [battle, setBattle] = useState<Battle | null>(null);
  const [foeCreature, setFoeCreature] = useState<Battle['b']['creature']>('goblin');
  const timer = useRef<number | undefined>(undefined);
  const start = (creature: Battle['b']['creature']) => {
    if (!me?.creature) return;
    setFoeCreature(creature);
    const b: Battle = { id: 'practice', challengerId: me.id, opponentId: 'bot', status: 'active', createdAt: Date.now(), startedAt: Date.now(), round: 1, roundDeadline: Date.now() + ROUND_SECONDS * 1000, a: makeCreatureState(me.id, me.creature, me.level), b: makeCreatureState('bot', creature, Math.max(1, me.level)), log: [], scored: false };
    setBattle(b);
  };
  const act = (a: BattleAction, tap?: TapQuality) => {
    setBattle((cur) => {
      if (!cur || cur.status !== 'active') return cur;
      const b: Battle = JSON.parse(JSON.stringify(cur));
      b.a.action = a; b.a.tap = a === 'counter' ? 'miss' : (tap ?? 'miss');
      b.b.action = b.b.specialCooldown === 0 && Math.random() < 0.4 ? 'special' : Math.random() < 0.7 ? 'attack' : 'counter';
      b.b.tap = b.b.action === 'counter' ? 'miss' : Math.random() < 0.3 ? 'perfect' : Math.random() < 0.5 ? 'good' : 'miss';
      resolveRound(b, Math.random, { [b.a.playerId]: me?.creatureName ?? 'You', bot: `Sparring ${CREATURES[b.b.creature].name}` }, Date.now());
      return b;
    });
  };
  useEffect(() => {
    // auto-defend on timeout
    if (!battle || battle.status !== 'active') return;
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => act('counter'), ROUND_SECONDS * 1000);
    return () => clearTimeout(timer.current);
  }, [battle?.round, battle?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  return { battle, start, act, stop: () => setBattle(null), rematch: () => start(foeCreature) };
}

// ---------- Screen ----------
export default function BattleScreen() {
  const me = useMe();
  const party = useStore((s) => s.party);
  const myBattle = useMyBattle();
  const toast = useStore((s) => s.toast);
  const setReplay = useStore((s) => s.setReplay);
  const [picking, setPicking] = useState(false);
  const [lastOpponent, setLastOpponent] = useState<string | null>(null);
  const [showPractice, setShowPractice] = useState(false);
  const practice = usePractice(me);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const liveEvent = party?.phase === 'friday' || party?.phase === 'saturday';
  if (!me?.creature || !party) return null;

  const names = Object.fromEntries(party.players.map((p) => [p.id, { nick: p.nickname, name: p.creatureName, level: p.level, colorway: p.equipped.colorway, equipped: p.equipped }]));
  const challenge = async (opponentId: string) => { try { setLastOpponent(opponentId); await request({ type: 'challenge', opponentId }); setPicking(false); sfx.challenge(); } catch (e) { toast((e as Error).message, '⚠️', 'warn'); } };
  const respond = async (accept: boolean) => { if (!myBattle) return; try { await request({ type: 'respondChallenge', battleId: myBattle.id, accept }); } catch (e) { toast((e as Error).message, '⚠️', 'warn'); } };

  // finished battle of mine most recent (not yet dismissed) shows the result
  const recentMine = party.battles.find((b) => b.status === 'finished' && !b.auto && (b.a.playerId === me.id || b.b.playerId === me.id) && b.finishedAt && Date.now() - b.finishedAt < 3 * 60_000 && b.id !== dismissed);

  if (practice.battle) {
    const n = { ...names, bot: { nick: 'Sparring bot', name: `Sparring ${CREATURES[practice.battle.b.creature].name}`, level: practice.battle.b.maxHp > 0 ? me.level : 1, colorway: 1, equipped: { colorway: 1 } } };
    return <div className="screen with-nav"><div className="topbar"><h2 className="display title-md">Practice bout</h2><span className="pill">no rewards</span></div><Arena key={practice.battle.id + practice.battle.createdAt} battle={practice.battle} meId={me.id} names={n} onAction={practice.act} onExit={practice.stop} onRematch={practice.rematch} practice /></div>;
  }

  if (myBattle?.status === 'active' || recentMine) {
    const b = (myBattle?.status === 'active' ? myBattle : recentMine)!;
    const foeId = b.a.playerId === me.id ? b.b.playerId : b.a.playerId;
    return (
      <div className="screen with-nav">
        <div className="topbar"><h2 className="display title-md">Battle arena</h2><span className="pill pill-ember">⚔️ vs {names[foeId]?.nick ?? '?'}</span></div>
        <Arena key={b.id} battle={b} meId={me.id} names={names} onAction={(a, tap) => request({ type: 'battleAction', battleId: b.id, round: b.round, action: a, tap }).then(() => undefined).catch((e) => toast((e as Error).message, '⚠️', 'warn'))} onSurrender={() => request({ type: 'surrender', battleId: b.id }).catch(() => undefined)} onExit={() => setDismissed(b.id)} onRematch={() => { setDismissed(b.id); challenge(foeId); }} />
      </div>
    );
  }

  const mates = party.players.filter((p) => p.id !== me.id && p.creature).sort((a, b) => Number(b.online) - Number(a.online) || b.points - a.points);
  const leader = sortLeaderboard(party.players.filter((p) => p.creature))[0];
  const bountyId = leader && leader.points > 0 ? leader.id : null;
  const recent = party.battles.filter((b) => b.status === 'finished').slice(0, 8);
  const outgoing = myBattle?.status === 'challenge' && myBattle.challengerId === me.id ? myBattle : null;

  return (
    <div className="screen with-nav">
      <div className="topbar"><h2 className="display title-md">Creature battles</h2><span className="pill">{rankFor(me.rating).emoji} {me.wins}W · {me.losses}L{me.streak >= 2 ? ` · 🔥${me.streak}` : ''}</span></div>
      <div className="screen-body" style={{ gap: 10 }}>
        <div className="stage" style={{ height: 150, flex: '0 0 auto' }}>
          <div className="stage-pool" />
          <Creature creature={me.creature} level={me.level} colorway={me.equipped.colorway} equipped={me.equipped} state="idle" style={{ height: 150, zIndex: 1 }} />
        </div>
        {outgoing ? (
          <div className="panel panel-gold pad center stack-6"><div className="bold">Waiting for {names[outgoing.opponentId]?.nick} to accept…</div><div className="tiny faint">Challenges expire after 2 minutes.</div><Button variant="ghost" onClick={() => setPicking(true)}>Challenge someone else</Button></div>
        ) : (
          <>
            <Button onClick={() => setPicking(true)} disabled={!liveEvent}>⚔️ Challenge a mate</Button>
            {!liveEvent && <div className="center tiny faint">Battles open when the host starts the event. Practice meanwhile.</div>}
            <Button variant="secondary" onClick={() => setShowPractice(true)}>Practice vs a sparring bot</Button>
          </>
        )}
        <button className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => request({ type: 'setAutoBattles', on: !me.autoBattles }).catch((e) => toast((e as Error).message, '⚠️', 'warn'))}>
          <span style={{ fontSize: 18 }}>🤖</span>
          <span className="grow"><div className="small bold">Auto-battles</div><div className="tiny faint">{me.autoBattles ? `${me.creatureName} fights a mate's avatar about every 45 min, even with your phone away. XP + rating only.` : 'Off: your creature only fights when you do.'}</div></span>
          <span className={`switch ${me.autoBattles ? 'on' : ''}`} role="switch" aria-checked={me.autoBattles} aria-label="Auto-battles" />
        </button>
        <div className="row-between"><span className="eyebrow">Recent bouts</span><span className="tiny faint">tap to replay</span></div>
        <div className="scroll-y stack-6 grow" style={{ minHeight: 0 }}>
          {recent.length === 0 && <div className="feed-item"><span className="emoji">🦗</span><span className="grow dim">No battles yet. Be the first to start something.</span></div>}
          {recent.map((b) => { const w = playerById(party, b.winnerId); const l = playerById(party, b.loserId); return <button key={b.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setReplay(b)} aria-label="Watch replay"><span style={{ fontSize: 18 }}>{b.auto ? '🤖' : '🏆'}</span><span className="grow small"><b>{w?.nickname ?? '?'}</b> beat <b>{l?.nickname ?? '?'}</b> <span className="faint">({b.reason === 'ko' ? 'KO' : b.reason === 'rounds' ? 'on points' : b.reason})</span></span>{b.auto ? <span className="pill pill-xs">auto</span> : !b.scored && <span className="pill pill-xs">friendly</span>}<span className="pill pill-gold pill-xs">▶</span></button>; })}
        </div>
      </div>
      {picking && (
        <Sheet onClose={() => setPicking(false)}>
          <div className="eyebrow center">Pick your victim</div>
          <h3 className="display title-md center" style={{ margin: '6px 0 10px' }}>Who's getting humbled?</h3>
          <div className="scroll-y stack-6" style={{ maxHeight: '50vh' }}>
            {mates.length === 0 && <div className="center dim pad">Nobody else here yet.</div>}
            {mates.map((p) => { const busy = party.battles.some((b) => (b.status === 'active' || b.status === 'challenge') && (b.a.playerId === p.id || b.b.playerId === p.id)); return (
              <button key={p.id} className="list-row" style={{ width: '100%', textAlign: 'left', opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => challenge(p.id)}>
                <span className="avatar sm"><Creature creature={p.creature!} level={p.level} colorway={p.equipped.colorway} bare /></span>
                <span className="grow"><div className="bold">{p.id === bountyId ? '👑 ' : ''}{p.nickname}</div><div className="tiny faint">{p.id === bountyId ? 'BOUNTY: beat them for double points · ' : ''}{rankFor(p.rating).emoji} {rankFor(p.rating).name} · {p.wins}W {p.losses}L{p.streak >= 2 ? ` · 🔥${p.streak}` : ''}</div></span>
                <span className={`pill pill-xs ${busy ? 'pill-ember' : p.online ? 'pill-ok' : ''}`}>{busy ? 'in battle' : p.online ? 'online' : 'away'}</span>
              </button>); })}
          </div>
          {lastOpponent && <div className="tiny faint center" style={{ marginTop: 6 }}>Only 3 scored bouts per opponent per day. Spread the violence.</div>}
        </Sheet>
      )}
      {showPractice && (
        <Sheet onClose={() => setShowPractice(false)}>
          <div className="eyebrow center">Sparring partner</div>
          <h3 className="display title-md center" style={{ margin: '6px 0 10px' }}>Choose an opponent</h3>
          <div className="pick-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {(Object.keys(CREATURES) as (keyof typeof CREATURES)[]).map((c) => <button key={c} className="pick-card" onClick={() => { setShowPractice(false); practice.start(c); }}><Creature creature={c} bare colorway={1} /><span className="pick-name">{CREATURES[c].name.split(' ')[1] ?? CREATURES[c].name}</span></button>)}
          </div>
          <div className="tiny faint center" style={{ marginTop: 8 }}>Practice runs on your phone only. No points, no XP, no witnesses.</div>
        </Sheet>
      )}
    </div>
  );
}
