import { useRef, useState } from 'react';
import { CREATURES } from '@shared/creatures';
import { Button, Sheet } from '../components/ui';
import { useStore, playerById } from '../store';
import BattleStage from './BattleStage';

/** Full replay of any finished battle (auto or manual), rebuilt from its real round log. */
export default function ReplayOverlay() {
  const battle = useStore((s) => s.replay);
  const party = useStore((s) => s.party);
  const meId = useStore((s) => s.identity.playerId);
  const setReplay = useStore((s) => s.setReplay);
  const [speed, setSpeed] = useState(1);
  const [skip, setSkip] = useState(0);
  const [run, setRun] = useState(0);
  const [done, setDone] = useState(false);
  const started = useRef(0);
  const [took, setTook] = useState(0);
  if (!battle || !party) return null;
  const close = () => { setReplay(null); setDone(false); setSkip(0); setRun(0); started.current = 0; };
  const pa = playerById(party, battle.a.playerId); const pb = playerById(party, battle.b.playerId);
  const info = Object.fromEntries([pa, pb].filter(Boolean).map((p) => [p!.id, { nick: p!.nickname, name: p!.creatureName, level: p!.level, colorway: p!.equipped.colorway, equipped: p!.equipped }]));
  const nearId = battle.b.playerId === meId ? meId : battle.a.playerId;
  const w = playerById(party, battle.winnerId); const l = playerById(party, battle.loserId);
  const how = battle.reason === 'ko' ? 'by KO' : battle.reason === 'rounds' ? 'on remaining health' : battle.reason === 'surrender' ? 'by surrender' : 'on a no-show';
  const mine = battle.rewards?.[meId];
  return (
    <Sheet onClose={close}>
      <div className="replay-sheet" data-testid="replay" data-ms={took || undefined} ref={(el) => { if (el && !started.current) started.current = performance.now(); }}>
        <div className="row-between">
          <span className="eyebrow">{battle.auto ? '🤖 Auto-battle replay' : '⚔️ Battle replay'}</span>
          <span className="tiny faint">{pa?.nickname ?? '?'} vs {pb?.nickname ?? '?'}</span>
        </div>
        <BattleStage key={`${battle.id}-${run}`} battle={battle} info={info} nearId={nearId} mode="replay" speed={speed} skip={skip} onDone={() => { setDone(true); setTook(Math.round(performance.now() - started.current)); }} />
        <div className="center small bold" style={{ minHeight: 40 }}>
          {done ? <>{w?.creatureName ?? CREATURES[battle[battle.winnerId === battle.a.playerId ? 'a' : 'b'].creature].name} ({w?.nickname}) beat {l?.nickname} {how}.{mine ? <span className="pill pill-gold pill-xs" style={{ marginLeft: 6 }}>{mine.points ? `+${mine.points} pts · ` : ''}+{mine.xp} XP</span> : null}</> : <span className="faint">Every hit here is exactly what the game rolled.</span>}
        </div>
        <div className="replay-bar">
          {!done && <Button size="sm" variant="secondary" onClick={() => setSpeed((s) => (s === 1 ? 2 : 1))}>{speed === 1 ? '⏩ Fast' : '▶ Normal'}</Button>}
          {!done && <Button size="sm" variant="secondary" onClick={() => setSkip((x) => x + 1)}>⏭ Skip</Button>}
          {done && <Button size="sm" variant="secondary" onClick={() => { setDone(false); setSkip(0); setRun((r) => r + 1); started.current = performance.now(); }}>↻ Watch again</Button>}
          <Button size="sm" onClick={close}>Done</Button>
        </div>
      </div>
    </Sheet>
  );
}
