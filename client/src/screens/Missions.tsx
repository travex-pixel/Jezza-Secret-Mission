import { useState } from 'react';
import { GROUP_MISSIONS, MISSION_BY_ID, rookieLeft } from '@shared/missions';
import { MissionCard } from '../components/MissionCard';
import { EpicCard } from '../components/EpicCard';
import { Button, useCountdown } from '../components/ui';
import { useMe } from '../store';
import { useStore } from '../store';
import { request } from '../net';
import { sfx } from '../audio';
import { QUEST_BY_ID, RARITY } from '@shared/saturday';

export default function Missions() {
  const priv = useStore((s) => s.priv);
  const party = useStore((s) => s.party);
  const [tab, setTab] = useState<'mine' | 'group' | 'done' | 'quests'>(() => { const t = useStore.getState().missionsTab; useStore.setState({ missionsTab: null }); return t ?? 'mine'; });
  const quests = priv?.quests ?? [];
  const mole = priv?.mole;
  const [moleBusy, setMoleBusy] = useState(false);
  const moleDone = async (index: number) => { if (moleBusy) return; setMoleBusy(true); try { await request({ type: 'moleDone', index }); sfx.mission(); } catch (e) { toast((e as Error).message, '⚠️', 'warn'); } finally { setMoleBusy(false); } };
  const me = useMe();
  const hand = (priv?.hand ?? []).filter((h) => h.status !== 'done');
  const done = priv?.completedMissionIds ?? [];
  const epics = party?.epics ?? [];
  const openEpics = epics.filter((e) => e.status === 'open');
  const myDoneEpics = epics.filter((e) => e.status === 'done' && e.crew.includes(me?.id ?? ''));
  const revealed = GROUP_MISSIONS.filter((m) => party?.revealedGroupMissions.includes(m.id));
  const eventLive = party?.phase === 'friday' || party?.phase === 'saturday';
  const toast = useStore((s) => s.toast);
  const refill = useCountdown(priv?.rerollRefillAt || undefined);
  const nextGroup = useCountdown(party?.nextGroupAt ?? undefined);
  const toggleLowKey = async () => { try { await request({ type: 'setPrefs', lowKey: !me?.lowKey }); toast(!me?.lowKey ? 'Low-key on: no jokes or impressions on the spot.' : 'Low-key off: all challenges back in.', '😎'); } catch (e) { toast((e as Error).message, '⚠️', 'warn'); } };

  const witness = async (claimId: string, approve: boolean) => {
    try { await request({ type: 'confirmWitness', claimId, approve }); sfx.select(); } catch { sfx.error(); }
  };

  const rookie = rookieLeft(priv?.completedMissionIds ?? Array(9).fill('x'));
  const isGroom = party?.groomId === me?.id;
  return (
    <div className="screen with-nav">
      <div className="topbar">
        <h2 className="display title-md">Challenges</h2>
        <span className="pill">{isGroom ? '🤵 Unlimited vetoes' : `${priv?.rerollsLeft ?? 0}/3 skips${refill > 0 ? ` · +1 in ${Math.ceil(refill / 60)}m` : ''}`}</span>
      </div>
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button className={`tab ${tab === 'mine' ? 'on' : ''}`} onClick={() => setTab('mine')}>Mine ({hand.length})</button>
        <button className={`tab ${tab === 'group' ? 'on' : ''}`} onClick={() => setTab('group')}>Group ({revealed.length})</button>
        {quests.length > 0 && <button className={`tab ${tab === 'quests' ? 'on' : ''}`} onClick={() => setTab('quests')} data-testid="quests-tab">📜 Quests ({quests.filter((q) => q.done).length}/{quests.length})</button>}
        <button className={`tab ${tab === 'done' ? 'on' : ''}`} onClick={() => setTab('done')}>Done ({done.length})</button>
      </div>
      <div className="screen-body scroll-y stack-10">
        {!!priv?.pendingWitness.length && tab === 'mine' && priv.pendingWitness.map((w) => (
          <div key={w.claimId} className="panel panel-gold pad stack-6">
            <div className="eyebrow">Did you see it?</div>
            <div className="bold"><span className="gold-text">{w.fromNickname}</span> reckons you saw them do “{MISSION_BY_ID[w.missionId]?.title}”.</div>
            <div className="small dim">{MISSION_BY_ID[w.missionId]?.instruction}</div>
            <div className="btn-row"><Button size="sm" variant="secondary" onClick={() => witness(w.claimId, false)}>Nope</Button><Button size="sm" onClick={() => witness(w.claimId, true)}>I saw it ✓</Button></div>
          </div>
        ))}
        {tab === 'mine' && (
          <>
            {rookie > 0 && !!hand.length && <div className="panel panel-gold pad small center"><b>🚀 Rookie boost:</b> next {rookie} {rookie === 1 ? 'challenge gives' : 'challenges give'} double XP and count{rookie === 1 ? 's' : ''} straight away.</div>}
            {!eventLive && !hand.length && <div className="panel pad center dim bold">The game's paused. Stretch. Hydrate. Judge your mates.</div>}
            {!party?.missionsOpen && eventLive && <div className="panel pad center small bold" style={{ borderColor: 'rgba(240,120,66,.5)' }}>⏸️ Challenges are paused for a bit.</div>}
            {hand.map((h) => { const m = MISSION_BY_ID[h.missionId]; return m ? <MissionCard key={h.missionId} mission={m} assignment={h} showReroll /> : null; })}
            {!!openEpics.length && <div className="eyebrow" style={{ marginTop: 4 }}>🟣 EPIC jobs: real chores, big points</div>}
            {openEpics.map((e) => <EpicCard key={e.id} epic={e} />)}
            <button className="row-between panel pad" style={{ width: '100%', textAlign: 'left', padding: '8px 12px' }} onClick={toggleLowKey}>
              <span><div className="bold small">😎 Low-key mode</div><div className="tiny faint">No jokes or impressions on the spot. Still plenty to do.</div></span>
              <span className={`switch ${me?.lowKey ? 'on' : ''}`} aria-label="Low-key mode" />
            </button>
          </>
        )}
        {tab === 'quests' && (
          <>
            <div className="tiny faint center">Fresh for Saturday. Each one pays points and a Lucky Drop. They tick over on their own as you play.</div>
            {quests.map((q) => { const d = QUEST_BY_ID[q.defId]; if (!d) return null; const pct = Math.min(100, Math.round((q.progress / d.target) * 100)); return (
              <div key={q.defId} className={`quest-card ${q.done ? 'done' : ''}`} data-testid="quest">
                <span className="quest-emoji">{q.done ? '✅' : d.emoji}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="row-between"><span className="bold">{d.title}</span><span className="tiny bold" style={{ color: RARITY[d.drop].color }}>+{d.points} · {RARITY[d.drop].label} drop</span></div>
                  <div className="tiny dim">{d.blurb}</div>
                  <div className="quest-bar"><i style={{ width: `${pct}%` }} /></div>
                  <div className="tiny faint">{q.done ? 'Done. Drop\'s on your Lobby.' : `${q.progress} / ${d.target}`}</div>
                </span>
              </div>); })}
          </>
        )}
        {tab === 'mine' && mole && (
          <div className="panel mole-panel pad stack-6" data-testid="mole-panel">
            <div className="row-between"><span className="eyebrow" style={{ color: '#ffb48f' }}>🕵️ You are the Mole</span><span className="tiny faint">shh</span></div>
            <div className="tiny dim">Secret missions. Tick them off yourself (+40 each, no feed line). The lads vote on who you are; get to the reveal uncaught for +100.</div>
            {mole.missions.map((m, i) => (
              <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <span className="small grow" style={{ textDecoration: m.done ? 'line-through' : 'none', opacity: m.done ? .6 : 1 }}>{m.text}</span>
                {m.done ? <span className="pill pill-xs pill-ok">done</span> : <Button size="xs" variant="secondary" disabled={moleBusy} onClick={() => void moleDone(i)}>Did it</Button>}
              </div>
            ))}
          </div>
        )}
        {tab === 'group' && (
          <>
            {!revealed.length && <div className="panel pad center dim bold">No group challenges live yet.{nextGroup > 0 ? ` Next one in ${Math.ceil(nextGroup / 60)} min.` : ''}</div>}
            {!!revealed.length && <div className="tiny faint center">Optional. Everyone who's in on it claims their own.{nextGroup > 0 ? ` Another drops in ${Math.ceil(nextGroup / 60)} min.` : ''}</div>}
            {revealed.map((m) => <MissionCard key={m.id} mission={m} group />)}
          </>
        )}
        {tab === 'done' && (
          <>
            {!done.length && !myDoneEpics.length && <div className="panel pad center dim bold">Nothing yet. Get amongst it.</div>}
            {myDoneEpics.map((e) => <div key={e.id} className="list-row epic-row"><span style={{ fontSize: 20 }}>🟣</span><span className="grow"><div className="bold">EPIC: {e.title}</div><div className="tiny faint">with {e.crew.filter((id) => id !== me?.id).map((id) => party?.players.find((p) => p.id === id)?.nickname).join(', ') || 'just you'}</div></span></div>)}
            {done.map((id) => { const m = MISSION_BY_ID[id]; return m ? <div key={id} className="list-row"><span style={{ fontSize: 20 }}>✅</span><span className="grow"><div className="bold">{m.title}</div><div className="tiny faint">+{m.points} pts · {m.xp} XP</div></span></div> : null; })}
          </>
        )}
      </div>
    </div>
  );
}
