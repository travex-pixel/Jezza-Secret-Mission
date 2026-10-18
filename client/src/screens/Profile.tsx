import { useState } from 'react';
import { CREATURES } from '@shared/creatures';
import { ACHIEVEMENTS, COSMETICS, colorwaysUnlocked, LEVEL_UNLOCKS, COSMETIC_BY_ID } from '@shared/progression';
import type { CosmeticSlot } from '@shared/types';
import { Creature, type CreatureState } from '../components/Creature';
import { Button, XPBar } from '../components/ui';
import { useStore, useMe } from '../store';
import { request } from '../net';
import { sfx } from '../audio';

const SLOTS: { slot: CosmeticSlot; label: string; ico: string }[] = [
  { slot: 'hat', label: 'Hats', ico: '🎩' }, { slot: 'face', label: 'Face', ico: '🕶️' }, { slot: 'cape', label: 'Capes', ico: '🧣' }, { slot: 'aura', label: 'Auras', ico: '✨' }, { slot: 'pose', label: 'Poses', ico: '🦸' },
];

export default function Profile() {
  const me = useMe();
  const toast = useStore((s) => s.toast);
  const [slot, setSlot] = useState<CosmeticSlot | 'colour' | 'badges'>('colour');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [anim, setAnim] = useState<{ s: CreatureState; k: number }>({ s: 'idle', k: 0 });
  if (!me?.creature) return null;
  const def = CREATURES[me.creature];
  const cwMax = colorwaysUnlocked(me.level);

  const equip = async (patch: Record<string, unknown>) => {
    try { await request({ type: 'equip', equipped: patch }); sfx.select(); setAnim((a) => ({ s: 'happy', k: a.k + 1 })); }
    catch (e) { toast((e as Error).message, '🔒', 'warn'); sfx.error(); }
  };
  const rename = async () => {
    try { await request({ type: 'renameCreature', creatureName: name }); setEditing(false); sfx.select(); } catch (e) { toast((e as Error).message, '❌', 'warn'); }
  };
  const poke = () => { const states: CreatureState[] = ['happy', 'victory', 'attack']; setAnim((a) => ({ s: states[a.k % 3], k: a.k + 1 })); sfx.tap(); };
  const nextUnlockLevel = Object.keys(LEVEL_UNLOCKS).map(Number).find((l) => l > me.level && (LEVEL_UNLOCKS[l].cosmetics.length || LEVEL_UNLOCKS[l].colorways > colorwaysUnlocked(l - 1)));

  return (
    <div className="screen with-nav">
      <div className="topbar"><h2 className="display title-md">Your legend</h2><span className="pill pill-gold">{me.points} pts</span></div>
      <div className="screen-body" style={{ gap: 10, minHeight: 0 }}>
        <div className="row" style={{ gap: 12, alignItems: 'stretch' }}>
          <button className="stage" style={{ width: '42%', flex: '0 0 auto' }} onClick={poke} aria-label="Poke your creature">
            <div className="stage-pool" />
            <Creature creature={me.creature} colorway={me.equipped.colorway} equipped={me.equipped} state={anim.s} animKey={anim.k} style={{ width: '100%', zIndex: 1 }} />
          </button>
          <div className="grow col" style={{ justifyContent: 'center', gap: 6 }}>
            {editing ? (
              <div className="row" style={{ gap: 6 }}><input className="input" style={{ minHeight: 44, fontSize: 16 }} value={name} onChange={(e) => setName(e.target.value)} maxLength={16} autoFocus onKeyDown={(e) => e.key === 'Enter' && rename()} /><Button size="xs" onClick={rename}>Save</Button></div>
            ) : (
              <button className="display title-md" style={{ textAlign: 'left' }} onClick={() => { setName(me.creatureName); setEditing(true); }}>{me.creatureName} <span className="tiny faint">✎</span></button>
            )}
            <div className="tiny dim bold">{def.name} · {me.title}</div>
            <XPBar xp={me.xp} />
            <div className="seg" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              <div className="stat"><b>{me.missionsCompleted}</b><span>done</span></div>
              <div className="stat"><b>{me.wins}–{me.losses}</b><span>W–L</span></div>
              <div className="stat"><b>{me.unlocked.length}</b><span>items</span></div>
            </div>
            {nextUnlockLevel && <div className="tiny faint">Next unlock at level {nextUnlockLevel}</div>}
          </div>
        </div>

        <div className="tabs" style={{ overflowX: 'auto' }}>
          <button className={`tab ${slot === 'colour' ? 'on' : ''}`} onClick={() => setSlot('colour')}>🎨</button>
          {SLOTS.map((s) => <button key={s.slot} className={`tab ${slot === s.slot ? 'on' : ''}`} onClick={() => setSlot(s.slot)} aria-label={s.label}>{s.ico}</button>)}
          <button className={`tab ${slot === 'badges' ? 'on' : ''}`} onClick={() => setSlot('badges')}>🏅</button>
        </div>

        <div className="scroll-y grow" style={{ minHeight: 0 }}>
          {slot === 'colour' && (
            <div className="chip-grid">
              {def.colorways.map((cw, i) => { const locked = i >= cwMax; return (
                <button key={cw.id} className={`chip ${me.equipped.colorway === i ? 'on' : ''} ${locked ? 'locked' : ''}`} onClick={() => !locked && equip({ colorway: i })}>
                  <span className="swatch" style={{ background: `linear-gradient(135deg, ${cw.body}, ${cw.accent})` }} /><span>{cw.name}</span>{locked && <span className="tiny faint">Lv {i === 1 ? 2 : 6}</span>}
                </button>); })}
            </div>
          )}
          {slot !== 'colour' && slot !== 'badges' && (
            <div className="chip-grid">
              <button className={`chip ${!me.equipped[slot] ? 'on' : ''}`} onClick={() => equip({ [slot]: '' })}><span className="ico">∅</span><span>None</span></button>
              {COSMETICS.filter((c) => c.slot === slot).map((c) => { const owned = me.unlocked.includes(c.id); const src = Object.entries(LEVEL_UNLOCKS).find(([, u]) => u.cosmetics.includes(c.id))?.[0]; const ach = ACHIEVEMENTS.find((a) => a.cosmetic === c.id); return (
                <button key={c.id} className={`chip ${me.equipped[slot] === c.id ? 'on' : ''} ${owned ? '' : 'locked'}`} onClick={() => owned ? equip({ [slot]: c.id }) : toast(`${c.name}: ${src ? `reach level ${src}` : ach ? `earn "${ach.name}"` : 'locked'}`, '🔒')} title={c.description}>
                  <span className="ico">{owned ? SLOTS.find((s) => s.slot === slot)?.ico : '🔒'}</span><span>{c.name}</span>{!owned && <span className="tiny faint">{src ? `Lv ${src}` : ach ? 'Badge' : ''}</span>}
                </button>); })}
            </div>
          )}
          {slot === 'badges' && (
            <div className="stack-6">
              {ACHIEVEMENTS.map((a) => { const got = me.achievements.includes(a.id); return (
                <div key={a.id} className="list-row" style={{ opacity: got ? 1 : 0.5 }}>
                  <span style={{ fontSize: 22 }}>{got ? '🏅' : '🔒'}</span>
                  <span className="grow"><div className="bold">{a.name}</div><div className="tiny dim">{a.blurb}{a.cosmetic ? ` · unlocks ${COSMETIC_BY_ID[a.cosmetic].name}` : ''}</div></span>
                  <span className="tiny faint nowrap">+{a.xp} XP</span>
                </div>); })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
