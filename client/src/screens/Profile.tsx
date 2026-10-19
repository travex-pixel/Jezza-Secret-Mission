import { useState } from 'react';
import { CREATURES, FORMS } from '@shared/creatures';
import { ACHIEVEMENTS, COSMETICS, colorwaysUnlocked, LEVEL_UNLOCKS, COSMETIC_BY_ID, LEVEL_XP, nextEvolveLevel, stageForLevel, FRIDAY_MAX_LEVEL, rankFor, rivalries } from '@shared/progression';
import type { CosmeticSlot } from '@shared/types';
import { Creature, type CreatureState } from '../components/Creature';
import { Button, XPBar } from '../components/ui';
import { isMuted, toggleMuted } from '../audio';
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
  const [muted, setMutedState] = useState(isMuted());
  const [code, setCode] = useState('');
  const redeem = async () => {
    try { await request({ type: 'redeemCode', code }); setCode(''); sfx.reward(); }
    catch (e) { toast((e as Error).message, '🔐', 'warn'); sfx.error(); }
  };
  const players = useStore((s) => s.party?.players);
  if (!me?.creature) return null;
  const riv = rivalries(me);
  const nickOf = (id: string) => players?.find((p) => p.id === id)?.nickname ?? '?';
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
  const phase = useStore((s) => s.party?.phase);
  const stage = stageForLevel(me.level);
  const evoAt = nextEvolveLevel(me.level);
  const lockedSat = evoAt === 8 && me.level >= FRIDAY_MAX_LEVEL && (phase === 'friday' || phase === 'lobby');
  const nextUnlockLevel = Object.keys(LEVEL_UNLOCKS).map(Number).find((l) => l > me.level && (LEVEL_UNLOCKS[l].cosmetics.length || LEVEL_UNLOCKS[l].colorways > colorwaysUnlocked(l - 1)));

  return (
    <div className="screen with-nav">
      <div className="topbar"><h2 className="display title-md">Your legend</h2><span className="row" style={{ gap: 8 }}><button className="pill" aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} onClick={() => setMutedState(toggleMuted())}>{muted ? '🔇 Muted' : '🔊 Sound'}</button><span className="pill pill-gold">{me.points} pts</span></span></div>
      <div className="screen-body" style={{ gap: 10, minHeight: 0 }}>
        <div className="row" style={{ gap: 12, alignItems: 'stretch' }}>
          <button className="stage" style={{ width: '42%', flex: '0 0 auto' }} onClick={poke} aria-label="Poke your creature">
            <div className="stage-pool" />
            <Creature creature={me.creature} level={me.level} colorway={me.equipped.colorway} equipped={me.equipped} state={anim.s} animKey={anim.k} style={{ width: '100%', zIndex: 1 }} />
          </button>
          <div className="grow col" style={{ justifyContent: 'center', gap: 6 }}>
            {editing ? (
              <div className="row" style={{ gap: 6 }}><input className="input" style={{ minHeight: 44, fontSize: 16 }} value={name} onChange={(e) => setName(e.target.value)} maxLength={16} autoFocus onKeyDown={(e) => e.key === 'Enter' && rename()} /><Button size="xs" onClick={rename}>Save</Button></div>
            ) : (
              <button className="display title-md" style={{ textAlign: 'left' }} onClick={() => { setName(me.creatureName); setEditing(true); }}>{me.creatureName} <span className="tiny faint">✎</span></button>
            )}
            <div className="tiny dim bold">{FORMS[me.creature][stage - 1]} · {rankFor(me.rating).emoji} {rankFor(me.rating).name}</div>
            <XPBar xp={me.xp} />
            <div className="seg" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              <div className="stat"><b>{me.missionsCompleted}</b><span>done</span></div>
              <div className="stat"><b>{me.wins}–{me.losses}</b><span>W–L</span></div>
              <div className="stat"><b>{me.unlocked.length}</b><span>items</span></div>
            </div>
            {(riv.nemesis || riv.bunny) && <div className="tiny bold ellipsis">{riv.nemesis && <>😈 Nemesis: {nickOf(riv.nemesis.id)} ({riv.nemesis.w}–{riv.nemesis.l}) </>}{riv.bunny && <>🐰 Bunny: {nickOf(riv.bunny.id)} ({riv.bunny.w}–{riv.bunny.l})</>}</div>}
            {nextUnlockLevel && <div className="tiny faint">Next unlock at level {nextUnlockLevel}</div>}
            {evoAt && (
              <div className="row" style={{ gap: 8, padding: '6px 8px', borderRadius: 12, background: 'rgba(0,0,0,.25)', border: '1px solid var(--line)' }}>
                <Creature creature={me.creature} stage={(stage + 1) as 2 | 3} colorway={me.equipped.colorway} silhouette bare style={{ width: 40, flex: '0 0 auto' }} />
                <span className="tiny bold" style={{ lineHeight: 1.25 }}>{lockedSat ? <>🔒 <span className="gold-text">???</span> unlocks Saturday</> : <>Next form: <span className="gold-text">???</span><br /><span className="faint">Lv {evoAt} · {LEVEL_XP[evoAt - 1] - me.xp} XP to go</span></>}</span>
              </div>
            )}
          </div>
        </div>

        <div className="tabs" style={{ overflowX: 'auto' }}>
          {[{ slot: 'colour' as const, label: 'Colour', ico: '🎨' }, ...SLOTS, { slot: 'badges' as const, label: 'Badges', ico: '🏅' }].map((s) => <button key={s.slot} className={`tab tab-ico ${slot === s.slot ? 'on' : ''}`} onClick={() => setSlot(s.slot)} aria-label={s.label}>{s.ico}<small>{s.label}</small></button>)}
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
                <button key={c.id} className={`chip ${me.equipped[slot] === c.id ? 'on' : ''} ${owned ? '' : 'locked'}`} onClick={() => owned ? equip({ [slot]: c.id }) : toast(`${c.name}: ${src ? `reach level ${src}` : ach ? `earn "${ach.name}"` : c.description}`, '🔒')} title={c.description}>
                  <span className="ico">{owned ? SLOTS.find((s) => s.slot === slot)?.ico : '🔒'}</span><span>{c.name}</span>{!owned && <span className="tiny faint">{src ? `Lv ${src}` : ach ? 'Badge' : /^EPIC/.test(c.description) ? 'EPIC' : /Reward code/.test(c.description) ? 'Code' : ''}</span>}
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
          <div className="panel pad stack-6" style={{ marginTop: 10 }}>
            <div className="small bold">🎁 Got a reward code?</div>
            <div className="row" style={{ gap: 6 }}>
              <input className="input" style={{ minHeight: 44, fontSize: 16, textTransform: 'uppercase', letterSpacing: '.06em' }} value={code} onChange={(e) => setCode(e.target.value.slice(0, 16))} placeholder="JEZZA-XXXX" autoCapitalize="characters" autoComplete="off" aria-label="Reward code" onKeyDown={(e) => e.key === 'Enter' && redeem()} />
              <Button size="sm" disabled={code.replace(/[^a-z0-9]/gi, '').length < 4} onClick={redeem}>Unlock</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
