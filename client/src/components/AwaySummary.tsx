import { useEffect, useRef } from 'react';
import { FORMS } from '@shared/creatures';
import { rankFor, sortLeaderboard } from '@shared/progression';
import { Creature, LadPic } from './Creature';
import { Button, Sheet } from './ui';
import { useStore, useMe, playerById, findBattle } from '../store';
import { request } from '../net';

const AWAY_GAP_MS = 2 * 60_000;

/** Pops up "while you were away" once when you open the app (or come back to it) and your avatar has fought. */
export function useAwayAutoOpen() {
  const flow = useStore((s) => s.flow);
  const loaded = useStore((s) => !!s.priv);
  const setAwayOpen = useStore((s) => s.setAwayOpen);
  const checked = useRef(false);
  const hiddenAt = useRef<number | null>(null);
  // Only on opening the app: battles that happen while you're looking get a toast and a Home banner instead.
  useEffect(() => {
    if (flow !== 'main' || !loaded || checked.current) return;
    checked.current = true;
    if ((useStore.getState().priv?.away?.length ?? 0) > 0) setAwayOpen(true);
  }, [flow, loaded, setAwayOpen]);
  useEffect(() => {
    const vis = () => {
      if (document.hidden) { hiddenAt.current = Date.now(); return; }
      const st = useStore.getState();
      if (hiddenAt.current && Date.now() - hiddenAt.current > AWAY_GAP_MS && (st.priv?.away?.length ?? 0) > 0 && st.flow === 'main') st.setAwayOpen(true);
      hiddenAt.current = null;
    };
    document.addEventListener('visibilitychange', vis);
    return () => document.removeEventListener('visibilitychange', vis);
  }, []);
}

export default function AwaySummary() {
  const open = useStore((s) => s.awayOpen);
  const party = useStore((s) => s.party);
  const priv = useStore((s) => s.priv);
  const setAwayOpen = useStore((s) => s.setAwayOpen);
  const setReplay = useStore((s) => s.setReplay);
  const me = useMe();
  if (!open || !party || !me?.creature) return null;
  const away = [...(priv?.away ?? [])].sort((a, b) => b.at - a.at);
  const close = () => { setAwayOpen(false); if (away.length) void request({ type: 'ackAway' }).catch(() => undefined); };
  const board = sortLeaderboard(party.players);
  const rank = board.findIndex((p) => p.id === me.id) + 1;
  const wins = away.filter((e) => e.won).length;
  const xp = away.reduce((s, e) => s + e.xp, 0);
  const evo = away.find((e) => e.evolved);
  const lvl = away.reduce((m, e) => Math.max(m, e.levelUp ?? 0), 0);
  return (
    <Sheet onClose={close}>
      <div className="stack-10" data-testid="away">
        <div className="center">
          <div className="eyebrow">While you were away</div>
          <h3 className="display title-md" style={{ margin: '4px 0 2px' }}>{me.creatureName} {away.length ? `fought ${away.length} time${away.length === 1 ? '' : 's'}` : 'kept the peace'}</h3>
          <div className="small dim bold">{away.length ? `${wins}W ${away.length - wins}L · +${xp} XP${lvl ? ` · hit Lv${lvl}` : ''}${evo && me.creature ? ` · evolved into a ${FORMS[me.creature][evo.evolved!.to - 1]}` : ''}` : 'No auto-battles since you last looked.'}</div>
        </div>
        <div className="scroll-y stack-6" style={{ maxHeight: '44vh' }}>
          {away.map((e) => {
            const o = playerById(party, e.opponentId);
            const can = !!findBattle({ party, priv }, e.battleId);
            return (
              <div key={e.id} className="list-row" style={{ alignItems: 'center' }}>
                <span className="avatar sm">{o && <LadPic p={o} />}</span>
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="bold ellipsis">{e.won ? '🏆 Beat' : '🩹 Lost to'} {o?.nickname ?? 'a mate'}'s {o?.creatureName}{e.close ? ' (close one)' : ''}</div>
                  <div className="tiny faint ellipsis">+{e.xp} XP{e.levelUp ? ` · ⬆️ Lv${e.levelUp}` : ''}{e.evolved ? ' · 🧬 evolved' : ''}{e.rivalry ? ` · ${e.rivalry.replace(/^RIVALRY: /, '⚔️ ')}` : ''}</div>
                </span>
                {can && <button className="pill pill-gold pill-xs" onClick={() => setReplay(findBattle({ party, priv }, e.battleId)!)}>▶ Replay</button>}
              </div>
            );
          })}
        </div>
        <div className="panel pad row-between small bold">
          <span>Now #{rank} on points · {me.points} pts</span>
          <span>{rankFor(me.rating).emoji} {rankFor(me.rating).name} ({me.rating})</span>
        </div>
        <div className="tiny faint center">Auto-battles give XP and battle rating only. Weekend points still come from challenges and the battles you fight yourself.</div>
        <Button onClick={close}>Back into it</Button>
      </div>
    </Sheet>
  );
}
