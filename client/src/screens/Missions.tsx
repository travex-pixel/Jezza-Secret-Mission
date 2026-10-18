import { useState } from 'react';
import { GROUP_MISSIONS, MISSION_BY_ID } from '@shared/missions';
import { MissionCard } from '../components/MissionCard';
import { Button } from '../components/ui';
import { useStore } from '../store';
import { request } from '../net';
import { sfx } from '../audio';

export default function Missions() {
  const priv = useStore((s) => s.priv);
  const party = useStore((s) => s.party);
  const [tab, setTab] = useState<'mine' | 'group' | 'done'>('mine');
  const hand = (priv?.hand ?? []).filter((h) => h.status !== 'done');
  const done = priv?.completedMissionIds ?? [];
  const revealed = GROUP_MISSIONS.filter((m) => party?.revealedGroupMissions.includes(m.id));
  const eventLive = party?.phase === 'friday' || party?.phase === 'saturday';

  const witness = async (claimId: string, approve: boolean) => {
    try { await request({ type: 'confirmWitness', claimId, approve }); sfx.select(); } catch { sfx.error(); }
  };

  return (
    <div className="screen with-nav">
      <div className="topbar">
        <h2 className="display title-md">Missions</h2>
        <span className="pill">{priv?.rerollsLeft ?? 0} swaps left</span>
      </div>
      <div className="tabs" style={{ marginBottom: 10 }}>
        <button className={`tab ${tab === 'mine' ? 'on' : ''}`} onClick={() => setTab('mine')}>Mine ({hand.length})</button>
        <button className={`tab ${tab === 'group' ? 'on' : ''}`} onClick={() => setTab('group')}>Group ({revealed.length})</button>
        <button className={`tab ${tab === 'done' ? 'on' : ''}`} onClick={() => setTab('done')}>Done ({done.length})</button>
      </div>
      <div className="screen-body scroll-y stack-10">
        {!!priv?.pendingWitness.length && tab === 'mine' && priv.pendingWitness.map((w) => (
          <div key={w.claimId} className="panel panel-gold pad stack-6">
            <div className="eyebrow">Witness request</div>
            <div className="bold"><span className="gold-text">{w.fromNickname}</span> says they did “{MISSION_BY_ID[w.missionId]?.title}”.</div>
            <div className="small dim">{MISSION_BY_ID[w.missionId]?.instruction}</div>
            <div className="btn-row"><Button size="sm" variant="secondary" onClick={() => witness(w.claimId, false)}>Nope</Button><Button size="sm" onClick={() => witness(w.claimId, true)}>I saw it ✓</Button></div>
          </div>
        ))}
        {tab === 'mine' && (
          <>
            {!eventLive && !hand.length && <div className="panel pad center dim bold">The host hasn't started the event yet. Stretch. Hydrate. Judge your mates.</div>}
            {!party?.missionsOpen && eventLive && <div className="panel pad center small bold" style={{ borderColor: 'rgba(240,120,66,.5)' }}>⏸️ Missions are paused by the host right now.</div>}
            {hand.map((h) => { const m = MISSION_BY_ID[h.missionId]; return m ? <MissionCard key={h.missionId} mission={m} assignment={h} showReroll /> : null; })}
          </>
        )}
        {tab === 'group' && (
          <>
            {!revealed.length && <div className="panel pad center dim bold">No group missions revealed yet. The host is plotting.</div>}
            {revealed.map((m) => <MissionCard key={m.id} mission={m} group />)}
          </>
        )}
        {tab === 'done' && (
          <>
            {!done.length && <div className="panel pad center dim bold">Nothing yet. The leaderboard is waiting.</div>}
            {done.map((id) => { const m = MISSION_BY_ID[id]; return m ? <div key={id} className="list-row"><span style={{ fontSize: 20 }}>✅</span><span className="grow"><div className="bold">{m.title}</div><div className="tiny faint">+{m.points} pts · {m.xp} XP</div></span></div> : null; })}
          </>
        )}
      </div>
    </div>
  );
}
