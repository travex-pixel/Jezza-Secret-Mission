// The Saturday morning briefing: one sheet, once per party, the first time a lad opens the game after the switch.
// Five lines on what's new today, then out of the way. Remembered on this phone only (it's a courtesy, not state).
import { useState } from 'react';
import { Button, Sheet } from './ui';
import { sfx } from '../audio';
import { QUESTS_PER_DAY } from '@shared/saturday';

const key = (code: string) => `hvl-sat-brief-${code}`;
const seen = (code: string) => { try { return localStorage.getItem(key(code)) === '1'; } catch { return false; } };

export default function SaturdayBriefing({ code, moles, isMole }: { code: string; moles: number; isMole: boolean }) {
  const [open, setOpen] = useState(() => !seen(code));
  if (!open) return null;
  const close = () => { try { localStorage.setItem(key(code), '1'); } catch { /* private mode: it just shows again */ } sfx.tap(); setOpen(false); };
  const lines: [string, string, string][] = [
    ['☀️', 'Morning Drop', 'A wake-up drop is waiting on your Lobby. There\'s always something in it.'],
    ['📜', `${QUESTS_PER_DAY} Quests`, 'Your own goals for today, on the Challenges tab. Each one pays points and a Lucky Drop.'],
    ['🎁', 'Lucky Drops', 'Every third challenge earns a drop. Epics and legendaries are real, not a rumour.'],
    ...(isMole || moles > 0 ? [[isMole ? '🤫' : '🕵️', isMole ? 'You are a Mole' : moles > 1 ? `${moles} Moles are among you` : 'There is a Mole', isMole ? 'Your secret missions are on the Challenges tab. Don\'t get caught.' : 'Someone has secret sabotage missions. Vote from the Lobby before the finale. Right names score.'] as [string, string, string]] : []),
    ['⚔️', 'Fights & raids', 'Taunt mid-fight. When a boss hits half health, a 25-second weak spot opens: double damage.'],
  ];
  return (
    <Sheet center onClose={close}>
      <div className="stack-10" data-testid="sat-briefing">
        <div className="eyebrow center">Saturday briefing</div>
        <div className="display title-lg center">Morning, legend.</div>
        <div className="stack-6">
          {lines.map(([e, t, b]) => <div key={t} className="row" style={{ gap: 10, alignItems: 'flex-start' }}><span style={{ fontSize: 22, lineHeight: 1.1 }}>{e}</span><span className="grow" style={{ textAlign: 'left' }}><div className="bold small">{t}</div><div className="tiny dim">{b}</div></span></div>)}
        </div>
        <Button onClick={close} data-testid="sat-briefing-go">Let&apos;s go</Button>
      </div>
    </Sheet>
  );
}
