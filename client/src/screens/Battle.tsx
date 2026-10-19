import { useEffect, useRef, useState } from 'react';
import type { Battle, BattleAction, BattleRoundLog, PlayerPublic, TapQuality } from '@shared/types';
import { CREATURES } from '@shared/creatures';
import { makeCreatureState, resolveRound, ROUND_SECONDS } from '@shared/battle';
import { rankFor, sortLeaderboard } from '@shared/progression';
import { Creature, type CreatureState } from '../components/Creature';
import { Button, HPBar, Sheet, useCountdown } from '../components/ui';
import PowerTap from '../components/PowerTap';
import { useStore, useMe, useMyBattle, playerById } from '../store';
import { request } from '../net';
import { sfx } from '../audio';
import { buzz } from '../haptics';

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
  const myLog = (l: BattleRoundLog) => (battle.a.playerId === meId ? l.a : l.b);
  const foeLog = (l: BattleRoundLog) => (battle.a.playerId === meId ? l.b : l.a);
  const [anim, setAnim] = useState<{ me: CreatureState; foe: CreatureState; k: number; pops: { id: number; side: 'me' | 'foe'; text: string; heal?: boolean }[] }>({ me: 'idle', foe: 'idle', k: 0, pops: [] });
  const [shownHp, setShownHp] = useState({ me: mine.hp, foe: foe.hp });
  const seen = useRef(battle.log.length);
  const [busy, setBusy] = useState(false);
  const left = useCountdown(battle.status === 'active' ? battle.roundDeadline : undefined);
  const [confirmSurrender, setConfirmSurrender] = useState(false);

  // Animate newly resolved rounds
  useEffect(() => {
    if (battle.log.length <= seen.current) { if (battle.log.length < seen.current) seen.current = battle.log.length; return; }
    const log = battle.log[battle.log.length - 1]; seen.current = battle.log.length;
    const m = myLog(log), f = foeLog(log);
    const pops: typeof anim.pops = [];
    let id = Date.now();
    const seq: (() => void)[] = [];
    const myState = (act: BattleAction): CreatureState => act === 'counter' ? 'guard' : 'attack';
    seq.push(() => { setAnim((a) => ({ ...a, me: myState(m.action), k: a.k + 1 })); if (m.action === 'special') sfx.special(); else if (m.action === 'attack') sfx.hit(); else sfx.guard(); });
    seq.push(() => { if (m.dmgDealt - (m.reflected ?? 0) > 0) { pops.push({ id: id++, side: 'foe', text: `${m.tap === 'perfect' ? 'CRIT ' : ''}-${m.dmgDealt - (m.reflected ?? 0)}` }); setAnim((a) => ({ ...a, foe: 'hit', pops: [...pops], k: a.k + 1 })); } if (m.heal) { pops.push({ id: id++, side: 'me', text: `+${m.heal}`, heal: true }); setAnim((a) => ({ ...a, pops: [...pops] })); } });
    seq.push(() => { setAnim((a) => ({ ...a, foe: myState(f.action), me: m.action === 'counter' ? 'guard' : 'idle', k: a.k + 1 })); if (f.action === 'special') sfx.special(); else if (f.action === 'attack') sfx.hit(); else sfx.guard(); });
    seq.push(() => { if (f.dmgDealt - (f.reflected ?? 0) > 0) { pops.push({ id: id++, side: 'me', text: `${f.tap === 'perfect' ? 'CRIT ' : ''}-${f.dmgDealt - (f.reflected ?? 0)}` }); buzz(30); setAnim((a) => ({ ...a, me: 'hit', pops: [...pops], k: a.k + 1 })); } if (f.heal) { pops.push({ id: id++, side: 'foe', text: `+${f.heal}`, heal: true }); setAnim((a) => ({ ...a, pops: [...pops] })); } });
    // reflections land last, with their own flash
    seq.push(() => { let any = false; if (m.reflected) { pops.push({ id: id++, side: 'foe', text: `↩ -${m.reflected}` }); any = true; setAnim((a) => ({ ...a, foe: 'hit', me: 'guard', pops: [...pops], k: a.k + 1 })); } if (f.reflected) { pops.push({ id: id++, side: 'me', text: `↩ -${f.reflected}` }); any = true; setAnim((a) => ({ ...a, me: 'hit', foe: 'guard', pops: [...pops], k: a.k + 1 })); } if (any) sfx.hit(); setShownHp({ me: mine.hp, foe: foe.hp }); });
    seq.push(() => { setAnim((a) => ({ ...a, me: battle.status === 'finished' ? (battle.winnerId === meId ? 'victory' : 'defeat') : 'idle', foe: battle.status === 'finished' ? (battle.winnerId === meId ? 'defeat' : 'victory') : 'idle', pops: [], k: a.k + 1 })); if (battle.status === 'finished') { if (battle.winnerId === meId) { sfx.victory(); buzz([40, 60, 120]); } else sfx.defeat(); } });
    const timers = seq.map((fn, i) => setTimeout(fn, i * 420));
    return () => timers.forEach(clearTimeout);
  }, [battle.log.length, battle.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (battle.log.length === 0) setShownHp({ me: mine.hp, foe: foe.hp }); }, [battle.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Safety net: whatever happens to the animation, the bars always settle on the server's numbers.
  useEffect(() => { const t = setTimeout(() => setShownHp({ me: mine.hp, foe: foe.hp }), 3000); return () => clearTimeout(t); }, [mine.hp, foe.hp]);

  const [tapping, setTapping] = useState<BattleAction | null>(null);
  const commit = async (a: BattleAction, tap?: TapQuality) => { setTapping(null); setBusy(true); try { await onAction(a, tap); } finally { setBusy(false); } };
  const act = (a: BattleAction) => { if (busy || tapping || mine.action || mine.locked) return; sfx.tap(); if (a === 'counter') void commit(a); else setTapping(a); };
  const myInfo = names[mine.playerId]; const foeInfo = names[foe.playerId];
  const lastLog = battle.log[battle.log.length - 1];
  const finished = battle.status === 'finished';
  const won = finished && battle.winnerId === meId;
  const locked = !!mine.action || !!mine.locked;

  return (
    <div className="screen-body" style={{ gap: 8 }}>
      <div className="arena">
        <div className="hpcard foe-card"><div className="row-between tiny bold"><span className="ellipsis">{foeInfo?.name}</span><span className="faint">Lv{foeInfo?.level}</span></div><HPBar hp={shownHp.foe} max={foe.maxHp} /><div className="tiny faint">{foeInfo?.nick} · {shownHp.foe}/{foe.maxHp}</div></div>
        <div className="round-badge"><div className="eyebrow">Round {Math.min(battle.round, 7)}</div>{!finished && <div className={`countdown ${left <= 5 ? 'urgent' : ''}`}>{left || '–'}</div>}</div>
        <div className="arena-floor foe-floor" /><div className="arena-floor me-floor" />
        <div className="fighter foe">
          <Creature creature={foe.creature} level={foeInfo?.level} colorway={foeInfo?.colorway ?? 0} equipped={foeInfo?.equipped} state={anim.foe} animKey={`f${anim.k}`} flip />
          {anim.pops.filter((p) => p.side === 'foe').map((p) => <span key={p.id} className={`dmg-pop ${p.heal ? 'heal' : ''}`} style={{ top: '30%', left: '40%' }}>{p.text}</span>)}
          <span className="pill pill-xs status">{foe.locked || foe.action ? '🔒 ready' : finished ? '' : '🤔 choosing'}</span>
        </div>
        <div className="fighter me">
          <Creature creature={mine.creature} level={myInfo?.level} colorway={myInfo?.colorway ?? 0} equipped={myInfo?.equipped} state={anim.me} animKey={`m${anim.k}`} />
          {anim.pops.filter((p) => p.side === 'me').map((p) => <span key={p.id} className={`dmg-pop ${p.heal ? 'heal' : ''}`} style={{ top: '30%', left: '40%' }}>{p.text}</span>)}
          <span className="pill pill-xs status">{locked ? '🔒 locked in' : finished ? '' : 'your move'}</span>
        </div>
        {tapping && <PowerTap label={tapping === 'special' ? CREATURES[mine.creature].special.name : 'Attack'} onDone={(q) => commit(tapping, q)} />}
        <div className="hpcard me-card"><div className="row-between tiny bold"><span className="ellipsis">{myInfo?.name}</span><span className="faint">Lv{myInfo?.level}</span></div><HPBar hp={shownHp.me} max={mine.maxHp} /><div className="tiny faint">You · {shownHp.me}/{mine.maxHp}</div></div>
      </div>
      <div className="arena-log">
        {lastLog ? lastLog.lines.slice(-2).map((l, i) => <div key={`${lastLog.round}-${i}`} className="log-line ellipsis">{l}</div>) : <div className="log-line">{practice ? 'Practice bout. Nothing at stake but pride.' : battle.scored ? 'Winner +15 · loser +5. Tap the gold zone for a crit.' : 'Friendly bout: you two have battled enough for points.'}</div>}
      </div>
      {finished ? (
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
  const recentMine = party.battles.find((b) => b.status === 'finished' && (b.a.playerId === me.id || b.b.playerId === me.id) && b.finishedAt && Date.now() - b.finishedAt < 3 * 60_000 && b.id !== dismissed);

  if (practice.battle) {
    const n = { ...names, bot: { nick: 'Sparring bot', name: `Sparring ${CREATURES[practice.battle.b.creature].name}`, level: practice.battle.b.maxHp > 0 ? me.level : 1, colorway: 1, equipped: { colorway: 1 } } };
    return <div className="screen with-nav"><div className="topbar"><h2 className="display title-md">Practice bout</h2><span className="pill">no rewards</span></div><Arena battle={practice.battle} meId={me.id} names={n} onAction={practice.act} onExit={practice.stop} onRematch={practice.rematch} practice /></div>;
  }

  if (myBattle?.status === 'active' || recentMine) {
    const b = (myBattle?.status === 'active' ? myBattle : recentMine)!;
    const foeId = b.a.playerId === me.id ? b.b.playerId : b.a.playerId;
    return (
      <div className="screen with-nav">
        <div className="topbar"><h2 className="display title-md">Battle arena</h2><span className="pill pill-ember">⚔️ vs {names[foeId]?.nick ?? '?'}</span></div>
        <Arena battle={b} meId={me.id} names={names} onAction={(a, tap) => request({ type: 'battleAction', battleId: b.id, round: b.round, action: a, tap }).then(() => undefined).catch((e) => toast((e as Error).message, '⚠️', 'warn'))} onSurrender={() => request({ type: 'surrender', battleId: b.id }).catch(() => undefined)} onExit={() => setDismissed(b.id)} onRematch={() => { setDismissed(b.id); challenge(foeId); }} />
      </div>
    );
  }

  const mates = party.players.filter((p) => p.id !== me.id && p.creature).sort((a, b) => Number(b.online) - Number(a.online) || b.points - a.points);
  const leader = sortLeaderboard(party.players.filter((p) => p.creature))[0];
  const bountyId = leader && leader.points > 0 ? leader.id : null;
  const recent = party.battles.filter((b) => b.status === 'finished').slice(0, 6);
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
        <div className="eyebrow">Recent bouts</div>
        <div className="scroll-y stack-6 grow" style={{ minHeight: 0 }}>
          {recent.length === 0 && <div className="feed-item"><span className="emoji">🦗</span><span className="grow dim">No battles yet. Be the first to start something.</span></div>}
          {recent.map((b) => { const w = playerById(party, b.winnerId); const l = playerById(party, b.loserId); return <div key={b.id} className="list-row"><span style={{ fontSize: 18 }}>🏆</span><span className="grow small"><b>{w?.nickname ?? '?'}</b> beat <b>{l?.nickname ?? '?'}</b> <span className="faint">({b.reason === 'ko' ? 'KO' : b.reason === 'rounds' ? 'on points' : b.reason})</span></span>{!b.scored && <span className="pill pill-xs">friendly</span>}</div>; })}
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
