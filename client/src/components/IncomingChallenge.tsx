import { useEffect, useRef } from 'react';
import { Creature } from './Creature';
import { Button, Sheet } from './ui';
import { useStore, useMe, useMyBattle } from '../store';
import { request } from '../net';
import { sfx } from '../audio';
import { buzz } from '../haptics';

/** Shown on every screen while a challenge is waiting for this player's answer. */
export default function IncomingChallenge() {
  const me = useMe();
  const party = useStore((s) => s.party);
  const setTab = useStore((s) => s.setTab);
  const toast = useStore((s) => s.toast);
  const battle = useMyBattle();
  const seen = useRef<string | null>(null);
  const incoming = battle?.status === 'challenge' && battle.opponentId === me?.id ? battle : null;
  useEffect(() => { if (incoming && seen.current !== incoming.id) { seen.current = incoming.id; sfx.challenge(); buzz([40, 40, 40]); } }, [incoming]);
  // Jump into the arena as soon as any battle of mine goes live.
  useEffect(() => { if (battle?.status === 'active' && useStore.getState().tab !== 'battle') setTab('battle'); }, [battle?.status, setTab]);
  if (!incoming || !me?.creature || !party) return null;
  const challenger = party.players.find((p) => p.id === incoming.challengerId);
  const respond = async (accept: boolean) => {
    try { await request({ type: 'respondChallenge', battleId: incoming.id, accept }); if (accept) setTab('battle'); }
    catch (e) { toast((e as Error).message, '⚠️', 'warn'); }
  };
  return (
    <Sheet center onClose={() => undefined}>
      <div className="center stack-10">
        <div className="eyebrow">Wants to fight you</div>
        <div className="display title-lg gold-text">{challenger?.nickname ?? 'A mate'}</div>
        <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
          <Creature creature={incoming.a.creature} level={challenger?.level} colorway={challenger?.equipped.colorway} equipped={challenger?.equipped} state="attack" style={{ width: 110 }} />
          <span className="display title-lg">VS</span>
          <Creature creature={me.creature} level={me.level} colorway={me.equipped.colorway} equipped={me.equipped} state="happy" style={{ width: 110 }} flip />
        </div>
        <div className="small dim bold">{challenger?.creatureName} (Lv {challenger?.level}) wants a piece of {me.creatureName}.</div>
        <div className="btn-row"><Button variant="secondary" onClick={() => respond(false)}>Decline</Button><Button onClick={() => respond(true)}>Accept!</Button></div>
      </div>
    </Sheet>
  );
}
