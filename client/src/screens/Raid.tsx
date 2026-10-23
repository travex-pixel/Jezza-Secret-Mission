import { useEffect, useRef, useState } from 'react';
import type { TapQuality } from '@shared/types';
import { BOSSES, RAID_HIT_COOLDOWN_MS } from '@shared/raid';
import { COSMETIC_BY_ID } from '@shared/progression';
import { Boss } from '../components/Boss';
import { Creature } from '../components/Creature';
import PowerTap from '../components/PowerTap';
import { Button, useCountdown } from '../components/ui';
import { useStore, useMe } from '../store';
import { request } from '../net';
import { sfx } from '../audio';
import { buzz } from '../haptics';

export default function Raid() {
  const party = useStore((s) => s.party);
  const me = useMe();
  const setTab = useStore((s) => s.setTab);
  const toast = useStore((s) => s.toast);
  const raid = party?.raid ?? null;
  const [tapping, setTapping] = useState(false);
  const [nextAt, setNextAt] = useState(0);
  const [hitKey, setHitKey] = useState(0);
  const [pop, setPop] = useState<{ k: number; text: string; crit: boolean } | null>(null);
  const timeLeft = useCountdown(raid?.status === 'active' ? raid.endsAt : undefined);
  const weakLeft = useCountdown(raid?.status === 'active' ? raid.weakUntil : undefined);
  const cool = useCountdown(nextAt > Date.now() ? nextAt : undefined);
  const lastLogLen = useRef(raid?.log.length ?? 0);
  // shake the boss whenever anyone lands a hit
  useEffect(() => { if (!raid) return; if (raid.log.length !== lastLogLen.current) { lastLogLen.current = raid.log.length; setHitKey((k) => k + 1); } }, [raid?.log.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (raid && me && raid.lastHitAt[me.id]) setNextAt(raid.lastHitAt[me.id] + RAID_HIT_COOLDOWN_MS); }, [raid?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!party || !me?.creature) return null;
  if (!raid) return (
    <div className="screen with-nav"><div className="topbar"><button className="display title-md" onClick={() => setTab('home')}>‹ Boss raid</button></div>
      <div className="panel pad-lg center stack-10"><div style={{ fontSize: 36 }}>🥚</div><div className="bold">No boss yet.</div><div className="small dim">A boss turns up once the lads have knocked over enough challenges. Friday: {party.phaseMissions.friday}/18 · Saturday: {party.phaseMissions.saturday}/25</div></div>
    </div>
  );
  const boss = BOSSES[raid.boss];
  const active = raid.status === 'active' && timeLeft > 0;
  const myDmg = raid.damage[me.id] ?? 0;
  const ranking = Object.entries(raid.damage).sort((a, b) => b[1] - a[1]);
  const nick = (id: string) => party.players.find((p) => p.id === id)?.nickname ?? '?';
  const hit = async (power: number, tap: TapQuality) => {
    setTapping(false);
    try {
      const r = await request<{ dmg: number; crit: boolean; nextAt: number }>({ type: 'raidHit', raidId: raid.id, tap, power });
      setNextAt(r.nextAt); setPop({ k: Date.now(), text: `${r.crit ? 'CRIT ' : ''}-${r.dmg}`, crit: r.crit });
      sfx.hit(); buzz(r.crit ? [30, 30, 60] : 25);
    } catch (e) { toast((e as Error).message, '⏳', 'warn'); }
  };
  const pct = Math.max(0, raid.hp / raid.maxHp);
  return (
    <div className="screen with-nav">
      <div className="topbar"><button className="display title-md" onClick={() => setTab('home')}>‹ Boss raid</button><span className={`pill ${active ? 'pill-ember' : raid.status === 'won' ? 'pill-ok' : ''}`}>{active ? `⏱ ${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}` : raid.status === 'won' ? 'Defeated' : 'Got away'}</span></div>
      <div className="screen-body" style={{ gap: 8 }}>
        <div className="center"><div className="display title-md gold-text">{boss.name}</div><div className="tiny dim bold">{active ? boss.taunt : raid.status === 'won' ? boss.defeat : boss.escape}</div></div>
        <div className="raid-bar"><i style={{ width: `${pct * 100}%` }} /><span>{raid.hp} / {raid.maxHp}</span></div>
        {active && weakLeft > 0 && <div className="weak-banner" data-testid="weak-banner">🎯 WEAK SPOT · double damage · {weakLeft}s</div>}
        <div className="stage grow" style={{ minHeight: 0, alignItems: 'center' }}>
          <div className="stage-pool" />
          <Boss boss={raid.boss} hitKey={hitKey} dead={raid.status === 'won'} style={{ height: '100%', maxHeight: 260, aspectRatio: '1', zIndex: 1 }} />
          {pop && <span key={pop.k} className="dmg-pop" style={{ top: '30%', left: '45%', fontSize: pop.crit ? 34 : 26 }}>{pop.text}</span>}
          <div style={{ position: 'absolute', left: 6, bottom: 0, width: '26%', zIndex: 2 }}><Creature creature={me.creature} level={me.level} colorway={me.equipped.colorway} equipped={me.equipped} state={pop ? 'attack' : 'idle'} animKey={pop?.k} /></div>
        </div>
        <div className="panel pad" style={{ padding: '8px 12px' }}>
          <div className="row-between tiny bold"><span className="eyebrow">Top damage</span><span className="faint">You: {myDmg}</span></div>
          {ranking.slice(0, 3).map(([id, d], i) => <div key={id} className="row-between small"><span className="ellipsis">{['🥇', '🥈', '🥉'][i]} {nick(id)}{id === me.id ? ' (you)' : ''}</span><b className="gold-text">{d}</b></div>)}
          {!ranking.length && <div className="tiny faint">Nobody's swung yet. Be first.</div>}
          <div className="tiny faint" style={{ marginTop: 4 }}>Loot: {COSMETIC_BY_ID[raid.cosmetic]?.name} for everyone who lands a hit. Finishing challenges mid-raid hits it too.</div>
        </div>
        {active ? (
          <Button onClick={() => { sfx.tap(); setTapping(true); }} disabled={tapping || cool > 0}>{cool > 0 ? `Catch your breath… ${cool}s` : '⚔️ Hit it'}</Button>
        ) : (
          <Button variant="secondary" onClick={() => setTab('home')}>{myDmg ? 'Loot collected. Back to it' : 'Back to the lobby'}</Button>
        )}
      </div>
      {tapping && <PowerTap label={`Hit ${boss.name}`} onDone={(power, q) => hit(power, q)} />}
    </div>
  );
}
