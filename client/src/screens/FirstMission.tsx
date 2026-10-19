import { useEffect } from 'react';
import { STARTER_MISSION } from '@shared/missions';
import { MissionCard } from '../components/MissionCard';
import { Button } from '../components/ui';
import { useStore, useMe } from '../store';
import { Creature } from '../components/Creature';

export default function FirstMission() {
  const setFlow = useStore((s) => s.setFlow);
  const priv = useStore((s) => s.priv);
  const reward = useStore((s) => s.reward);
  const me = useMe();
  const assignment = priv?.hand.find((h) => h.missionId === STARTER_MISSION.id);
  // Once the reward overlay has been dismissed after completion, move on.
  useEffect(() => { if (assignment?.status === 'done' && !reward) setFlow('main'); }, [assignment?.status, reward, setFlow]);
  useEffect(() => { if (priv && !assignment) setFlow('main'); }, [priv, assignment, setFlow]);
  return (
    <div className="screen">
      <div className="center" style={{ marginTop: 2 }}>
        <div className="eyebrow">Your first mission</div>
        <h2 className="display title-lg" style={{ marginTop: 4 }}>The legend begins</h2>
      </div>
      <div className="screen-body" style={{ gap: 12, justifyContent: 'center' }}>
        {me?.creature && <div className="center"><Creature creature={me.creature} level={me.level} colorway={me.equipped.colorway} equipped={me.equipped} state="happy" style={{ width: 'min(44vw, 170px)', margin: '0 auto' }} /></div>}
        <div className="fade-up"><MissionCard mission={STARTER_MISSION} assignment={assignment} /></div>
        <p className="center dim small bold fade-up delay-1">Complete missions for weekend points and creature XP. Your mates are watching. Probably.</p>
        <div className="center"><Button variant="ghost" onClick={() => setFlow('main')}>Skip for now, show me the lobby</Button></div>
      </div>
    </div>
  );
}
