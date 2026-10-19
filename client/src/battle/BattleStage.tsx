// The animated arena. It *presents* a battle the engine already resolved: every hit,
// heal, reflect and KO comes from battle.log via buildTimeline(). Skipping or a slow
// phone never changes the result, because the final frame is always the engine's state.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Battle, PlayerPublic } from '@shared/types';
import { CREATURES } from '@shared/creatures';
import { Creature, type CreatureState } from '../components/Creature';
import { HPBar } from '../components/ui';
import { sfx } from '../audio';
import { buzz } from '../haptics';
import { buildTimeline, type Hp, type RoundBeats, type Side, type Step } from './timeline';

export interface FighterInfo { nick: string; name: string; level: number; colorway: number; equipped: PlayerPublic['equipped'] }

interface Props {
  battle: Battle;
  info: Record<string, FighterInfo | undefined>;
  nearId?: string;            // shown bottom-left (normally "you"); defaults to side a
  mode: 'live' | 'replay';
  speed?: number;             // multiplier on top of the auto pace (2 = fast)
  skip?: number;              // bump to jump straight to the result
  onDone?: () => void;        // the result has been shown (or skipped to)
  onBusy?: (busy: boolean) => void;
  onRound?: (shownRounds: number) => void;
  top?: ReactNode;
  overlay?: ReactNode;
  status?: (who: 'near' | 'far') => ReactNode;
  nearLabel?: string;
}

class Cancelled extends Error {}
const other = (s: Side): Side => (s === 'a' ? 'b' : 'a');
const SPECIAL_LABEL: Record<string, string> = {};
for (const [id, c] of Object.entries(CREATURES)) SPECIAL_LABEL[id] = c.special.name.toUpperCase();

function prefersReduced() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// Rough pacing (ms at speed 1) used to fit a replay into ~8 seconds.
function estimate(rounds: RoundBeats[]) {
  let t = 1100 + 1700;
  for (const r of rounds) for (const s of r.steps) t += s.kind === 'strike' ? (s.special ? 1050 : 680) : s.kind === 'reflect' ? 420 : s.kind === 'recoil' ? 320 : s.kind === 'heal' ? 520 : s.kind === 'stance' ? 260 : s.kind === 'settle' ? 160 : 120;
  return t;
}

export default function BattleStage({ battle, info, nearId, mode, speed = 1, skip = 0, onDone, onBusy, onRound, top, overlay, status, nearLabel }: Props) {
  const near: Side = battle.b.playerId === nearId ? 'b' : 'a';
  const far = other(near);
  const startLive = mode === 'live' && battle.log.length > 0; // joined mid-fight: don't re-play old rounds
  const [hp, setHpState] = useState<Hp>(startLive || (mode === 'live' && battle.status === 'finished') ? { a: battle.a.hp, b: battle.b.hp } : { a: battle.a.maxHp, b: battle.b.maxHp });
  const doneAtMount = mode === 'live' && battle.status === 'finished' && !!battle.winnerId;
  const winAtMount: Side = battle.winnerId === battle.b.playerId ? 'b' : 'a';
  const [pose, setPose] = useState<Record<Side, CreatureState>>(doneAtMount ? { [winAtMount]: 'victory', [other(winAtMount)]: 'defeat' } as Record<Side, CreatureState> : { a: 'idle', b: 'idle' });
  const [k, setK] = useState(0);
  const [caption, setCaption] = useState<{ text: string; k: number; small?: boolean } | null>(null);
  const [down, setDown] = useState<{ side: Side; ko: boolean } | null>(doneAtMount ? { side: other(winAtMount), ko: battle.reason === 'ko' } : null);
  const [roundNo, setRoundNo] = useState(mode === 'replay' ? 1 : Math.max(1, Math.min(battle.round, 7)));

  const cam = useRef<HTMLDivElement>(null);
  const fxl = useRef<HTMLDivElement>(null);
  const wrapA = useRef<HTMLDivElement>(null);
  const wrapB = useRef<HTMLDivElement>(null);
  const wrap = (s: Side) => (s === 'a' ? wrapA.current : wrapB.current);
  const hpRef = useRef(hp);
  const battleRef = useRef(battle); battleRef.current = battle;
  const ctl = useRef({ token: 0, speed: 1, reduced: prefersReduced() });
  const played = useRef(startLive || (mode === 'live' && battle.status === 'finished') ? battle.log.length : 0);
  const entered = useRef(startLive || (mode === 'live' && battle.status === 'finished'));
  const ended = useRef<boolean>(mode === 'live' && battle.status === 'finished'); // opened after it ended: just show the result
  const running = useRef(false);
  const alive = useRef(true);
  const cbs = useRef({ onDone, onBusy, onRound }); cbs.current = { onDone, onBusy, onRound };

  const setHp = (v: Hp) => { hpRef.current = v; setHpState(v); };
  const poseSet = (p: Partial<Record<Side, CreatureState>>) => { setPose((cur) => ({ ...cur, ...p })); setK((x) => x + 1); };
  const say = (text: string, small?: boolean) => setCaption({ text, k: Date.now() + Math.random(), small });

  // ----- low-level helpers -----
  const check = (tok: number) => { if (tok !== ctl.current.token) throw new Cancelled(); };
  const wait = async (ms: number, tok: number) => { await new Promise((r) => setTimeout(r, (ctl.current.reduced ? ms * 0.35 : ms) / ctl.current.speed)); check(tok); };
  const anim = (el: Element | null | undefined, kf: Keyframe[], ms: number, opts: KeyframeAnimationOptions = {}) => {
    if (!el || ctl.current.reduced || typeof (el as HTMLElement).animate !== 'function') return Promise.resolve();
    const a = (el as HTMLElement).animate(kf, { duration: Math.max(1, ms / ctl.current.speed), easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards', ...opts });
    return a.finished.then(() => undefined, () => undefined);
  };
  const rest = (el: Element | null | undefined) => { el?.getAnimations?.().forEach((a) => a.cancel()); };
  const center = (s: Side) => {
    const el = wrap(s);
    if (!el) return { x: 0, y: 0, w: 100 };
    return { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight * 0.52, w: el.offsetWidth };
  };
  const vec = (from: Side) => { const a = center(from), b = center(other(from)); return { dx: b.x - a.x, dy: b.y - a.y, len: Math.hypot(b.x - a.x, b.y - a.y) || 1 }; };
  const fx = (cls: string, x: number, y: number, html = '', style: Partial<CSSStyleDeclaration> = {}) => {
    const el = document.createElement('div');
    el.className = `fx ${cls}`;
    el.style.left = `${x}px`; el.style.top = `${y}px`;
    Object.assign(el.style, style);
    if (html) el.textContent = html;
    fxl.current?.appendChild(el);
    return el;
  };
  const fxAnim = async (el: HTMLElement, kf: Keyframe[], ms: number, opts: KeyframeAnimationOptions = {}) => {
    if (ctl.current.reduced) { el.remove(); return; }
    await anim(el, kf, ms, { easing: 'ease-out', ...opts });
    el.remove();
  };
  const pop = (s: Side, text: string, cls = '') => {
    const c = center(s);
    const el = fx(`dmg-pop fx-pop ${cls}`, c.x + (Math.random() * 30 - 15), c.y - c.w * 0.25, text);
    setTimeout(() => el.remove(), 1000);
  };
  const burst = (x: number, y: number, n: number, cls: string, spread: number, ms = 420) => {
    for (let i = 0; i < n; i++) {
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.6;
      const d = spread * (0.6 + Math.random() * 0.6);
      const el = fx(cls, x, y);
      void fxAnim(el, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * d}px, ${Math.sin(ang) * d}px) scale(.3)`, opacity: 0 }], ms);
    }
  };
  const shake = (power: number) => {
    const p = power;
    void anim(cam.current, [
      { transform: 'translate(0,0)' }, { transform: `translate(${-p}px, ${p * 0.6}px)` }, { transform: `translate(${p * 0.8}px, ${-p * 0.5}px)` },
      { transform: `translate(${-p * 0.5}px, ${p * 0.3}px)` }, { transform: 'translate(0,0)' },
    ], 240, { fill: 'none', easing: 'linear' });
  };

  // ----- the beats -----
  async function entrance(tok: number) {
    const a = wrap(near), b = wrap(far);
    poseSet({ a: 'enter', b: 'enter' });
    sfx.challenge();
    await Promise.all([
      anim(a, [{ transform: 'translateX(-130%) scale(.9)', opacity: 0 }, { transform: 'translateX(6%) scale(1.03)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], 820, { fill: 'none' }),
      anim(b, [{ transform: 'translateX(130%) scale(.9)', opacity: 0 }, { transform: 'translateX(-6%) scale(1.03)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], 820, { fill: 'none', delay: 120 / ctl.current.speed }),
    ]);
    check(tok);
    say('FIGHT!');
    shake(5);
    await wait(380, tok);
    poseSet({ a: 'idle', b: 'idle' });
  }

  async function impact(target: Side, dmg: number, opts: { crit?: boolean; guarded?: boolean; pierce?: boolean; heavy?: boolean; dir: { dx: number; dy: number; len: number }; label?: string; hpAfter: Hp }, tok: number) {
    const el = wrap(target);
    const c = center(target);
    const nx = opts.dir.dx / opts.dir.len, ny = opts.dir.dy / opts.dir.len;
    const kb = (opts.guarded && !opts.pierce ? 8 : opts.heavy || opts.crit ? 26 : 16);
    // hit-stop: freeze a beat on contact
    await wait(opts.crit || opts.heavy ? 110 : 70, tok);
    poseSet({ [target]: 'hit' } as Partial<Record<Side, CreatureState>>);
    if (opts.guarded && !opts.pierce) {
      const ring = fx('fx-shield', c.x, c.y, '', { width: `${c.w * 0.8}px`, height: `${c.w * 0.8}px`, marginLeft: `${-c.w * 0.4}px`, marginTop: `${-c.w * 0.4}px` });
      void fxAnim(ring, [{ transform: 'scale(.7)', opacity: 1 }, { transform: 'scale(1.15)', opacity: 0 }], 420);
    }
    if (opts.guarded && opts.pierce) { burst(c.x, c.y, 8, 'fx-shard', c.w * 0.5, 500); say('PIERCED!', true); }
    burst(c.x, c.y, opts.crit ? 12 : 7, 'fx-spark', c.w * (opts.crit ? 0.55 : 0.38));
    void anim(el, [
      { transform: 'translate(0,0) rotate(0)', filter: 'brightness(2.6) saturate(.4)' },
      { transform: `translate(${nx * kb}px, ${ny * kb}px) rotate(${nx > 0 ? 7 : -7}deg)`, filter: 'brightness(1.4)', offset: 0.3 },
      { transform: 'translate(0,0) rotate(0)', filter: 'none' },
    ], 300, { fill: 'none' });
    shake(opts.crit || opts.heavy ? 9 : opts.guarded ? 3 : 5);
    pop(target, `${opts.crit ? 'CRIT ' : ''}${opts.label ?? ''}-${dmg}`, opts.crit ? 'crit' : '');
    if (opts.crit) say('CRIT!', true);
    sfx.hit();
    buzz(opts.crit || opts.heavy ? 45 : 22);
    setHp(opts.hpAfter);
  }

  const partial = (target: Side, dmg: number): Hp => ({ ...hpRef.current, [target]: Math.max(0, hpRef.current[target] - dmg) });

  async function strike(s: Extract<Step, { kind: 'strike' }>, tok: number) {
    const me = wrap(s.side); const t = other(s.side);
    const v = vec(s.side);
    const total = s.hits.reduce((x, y) => x + y, 0);
    if (me) me.style.zIndex = '4';
    try {
      if (s.special) {
        say(SPECIAL_LABEL[s.creature] ?? 'SPECIAL', true);
        sfx.special();
        // charge up + camera push towards the attacker
        const c = center(s.side);
        if (cam.current) cam.current.style.transformOrigin = `${c.x}px ${c.y}px`;
        void anim(cam.current, [{ transform: 'scale(1)' }, { transform: 'scale(1.07)', offset: 0.5 }, { transform: 'scale(1)' }], 900, { fill: 'none' });
        await anim(me, [{ filter: 'none', transform: 'scale(1)' }, { filter: 'brightness(1.6) drop-shadow(0 0 14px rgba(255,214,120,.95))', transform: 'scale(1.08)' }], 260, { fill: 'none' });
        check(tok);
      }
      const opts = { crit: s.crit, guarded: s.guarded, pierce: s.pierce, dir: v };
      const move = s.special ? s.creature : 'melee';
      if (s.whiff) {
        // Mischief backfires: coin flips, lands tails, possum looks sheepish
        const c = center(s.side);
        const coin = fx('fx-coin', c.x, c.y - c.w * 0.45);
        await fxAnim(coin, [{ transform: 'translateY(0) rotateY(0)' }, { transform: 'translateY(-60px) rotateY(900deg)', offset: 0.5 }, { transform: 'translateY(10px) rotateY(1800deg)', opacity: 0.2 }], 640);
        check(tok);
        say('BACKFIRE!', true);
        sfx.defeat();
        poseSet({ [s.side]: 'defeat' } as Partial<Record<Side, CreatureState>>);
        await wait(420, tok);
        poseSet({ [s.side]: 'idle' } as Partial<Record<Side, CreatureState>>);
        return;
      }
      switch (move) {
        case 'dragon': { // Ember Breath: a stream of fire
          const a = center(s.side);
          await anim(me, [{ transform: 'none' }, { transform: `translate(${-v.dx * 0.06}px, ${-v.dy * 0.06}px) scale(.96)` }], 140);
          for (let i = 0; i < 9; i++) {
            const f = fx('fx-flame', a.x + v.dx * 0.15, a.y + v.dy * 0.15);
            void fxAnim(f, [{ transform: 'translate(0,0) scale(.4)', opacity: 0.95 }, { transform: `translate(${v.dx * 0.85 + (Math.random() * 20 - 10)}px, ${v.dy * 0.85 + (Math.random() * 20 - 10)}px) scale(1.5)`, opacity: 0.1 }], 380, { delay: (i * 40) / ctl.current.speed });
          }
          await wait(300, tok);
          await impact(t, total, { ...opts, heavy: true, hpAfter: s.hp }, tok);
          await wait(160, tok);
          await anim(me, [{ transform: `translate(${-v.dx * 0.06}px, ${-v.dy * 0.06}px) scale(.96)` }, { transform: 'none' }], 200);
          break;
        }
        case 'owl': { // Moon Gaze: a beam that goes straight through stances
          const a = center(s.side);
          const beam = fx('fx-beam', a.x, a.y - a.w * 0.12, '', { width: `${v.len}px`, transform: `rotate(${Math.atan2(v.dy + a.w * 0.12, v.dx)}rad) scaleX(0)` });
          const rot = `rotate(${Math.atan2(v.dy + a.w * 0.12, v.dx)}rad)`;
          const beamDone = fxAnim(beam, [{ transform: `${rot} scaleX(0)`, opacity: 1 }, { transform: `${rot} scaleX(1)`, opacity: 1, offset: 0.35 }, { transform: `${rot} scaleX(1)`, opacity: 1, offset: 0.75 }, { transform: `${rot} scaleX(1)`, opacity: 0 }], 620);
          await wait(220, tok);
          await impact(t, total, { ...opts, heavy: true, hpAfter: s.hp }, tok);
          await beamDone; check(tok);
          break;
        }
        case 'goblin': { // Cork Pop: a cork lobbed in an arc (it ricochets off a counter stance)
          const a = center(s.side);
          const cork = fx('fx-cork', a.x, a.y - a.w * 0.1);
          await fxAnim(cork, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${v.dx * 0.5}px, ${v.dy * 0.5 - a.w * 0.45}px) rotate(400deg)`, offset: 0.5 }, { transform: `translate(${v.dx}px, ${v.dy}px) rotate(800deg)` }], 420, { easing: 'linear' });
          check(tok);
          say('POP!', true);
          await impact(t, total, { ...opts, hpAfter: s.hp }, tok);
          if (s.ricochet) {
            const b = center(t);
            const back = fx('fx-cork', b.x, b.y);
            await fxAnim(back, [{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${-v.dx * 0.5}px, ${-v.dy * 0.5 - b.w * 0.3}px) rotate(-300deg)`, offset: 0.5 }, { transform: `translate(${-v.dx}px, ${-v.dy}px) rotate(-600deg)` }], 360, { easing: 'linear' });
            check(tok);
          }
          break;
        }
        case 'sprite': { // Vine Lash: two whip cracks
          await anim(me, [{ transform: 'none' }, { transform: `translate(${v.dx * 0.25}px, ${v.dy * 0.25}px)` }], 160);
          const c = center(t);
          let left = total;
          for (let i = 0; i < s.hits.length; i++) {
            const lash = fx('fx-slash', c.x, c.y, '', { width: `${c.w * 0.9}px`, marginLeft: `${-c.w * 0.45}px` });
            void fxAnim(lash, [{ transform: `rotate(${i ? 28 : -28}deg) scaleX(.1)`, opacity: 1 }, { transform: `rotate(${i ? 28 : -28}deg) scaleX(1.1)`, opacity: 0 }], 260);
            left -= s.hits[i];
            await impact(t, s.hits[i], { ...opts, crit: opts.crit && i === s.hits.length - 1, hpAfter: i === s.hits.length - 1 ? s.hp : partial(t, s.hits[i]) }, tok);
            await wait(120, tok);
          }
          void left;
          await anim(me, [{ transform: `translate(${v.dx * 0.25}px, ${v.dy * 0.25}px)` }, { transform: 'none' }], 220);
          break;
        }
        case 'fox': { // Ambush: vanish, reappear right on top of them
          await anim(me, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.5)' }], 150);
          burst(center(s.side).x, center(s.side).y, 6, 'fx-spark', 40);
          const to = `translate(${v.dx * 0.78}px, ${v.dy * 0.78}px)`;
          await anim(me, [{ opacity: 0, transform: `${to} scale(.5)` }, { opacity: 1, transform: `${to} scale(1.05)` }], 130);
          check(tok);
          await impact(t, total, { ...opts, heavy: !s.weak, hpAfter: s.hp }, tok);
          if (s.weak) say('WRONG READ', true);
          await wait(140, tok);
          await anim(me, [{ opacity: 1, transform: `${to} scale(1.05)` }, { opacity: 0, transform: `${to} scale(.5)` }, { opacity: 0, transform: 'scale(.5)', offset: 0.6 }, { opacity: 1, transform: 'none' }], 300);
          break;
        }
        case 'possum': { // Mischief pays off: coin lands heads, possum goes berserk
          const c = center(s.side);
          const coin = fx('fx-coin', c.x, c.y - c.w * 0.45);
          await fxAnim(coin, [{ transform: 'translateY(0) rotateY(0)' }, { transform: 'translateY(-60px) rotateY(900deg)', offset: 0.6 }, { transform: 'translateY(-40px) rotateY(1080deg) scale(1.4)', opacity: 0 }], 560);
          check(tok);
          say('HEADS!', true);
          await meleeDash(me, v, tok, true);
          await impact(t, total, { ...opts, heavy: true, hpAfter: s.hp }, tok);
          await meleeReturn(me, v);
          break;
        }
        case 'stag': { // Last Hurrah: rears up in a shower of gold, then charges straight through any guard
          const a = center(s.side);
          const reared = `translate(${-v.dx * 0.08}px, ${-v.dy * 0.08 - 16}px) rotate(${v.dx > 0 ? -12 : 12}deg) scale(1.08)`;
          await anim(me, [{ transform: 'none' }, { transform: reared }], 260);
          burst(a.x, a.y, 12, 'fx-flame fx-gold', 80);
          say('LAST HURRAH!', true);
          await wait(160, tok);
          const hit = `translate(${v.dx * 0.7}px, ${v.dy * 0.7}px) scale(1.12)`;
          await anim(me, [{ transform: reared }, { transform: hit }], 220, { easing: 'cubic-bezier(.6,0,.9,.5)' });
          check(tok);
          const c = center(t);
          burst(c.x, c.y, 14, 'fx-flame fx-gold', 70);
          await impact(t, total, { ...opts, heavy: true, hpAfter: s.hp }, tok);
          await anim(me, [{ transform: hit }, { transform: 'none' }], 280);
          break;
        }
        case 'barrel': { // Barrel Roll: a literal rolling charge
          await anim(me, [{ transform: 'none' }, { transform: `translate(${-v.dx * 0.06}px, ${-v.dy * 0.06}px) rotate(${v.dx > 0 ? -20 : 20}deg)` }], 160);
          await anim(me, [{ transform: `translate(${-v.dx * 0.06}px, ${-v.dy * 0.06}px) rotate(${v.dx > 0 ? -20 : 20}deg)` }, { transform: `translate(${v.dx * 0.62}px, ${v.dy * 0.62}px) rotate(${v.dx > 0 ? 360 : -360}deg)` }], 300, { easing: 'cubic-bezier(.5,0,.9,.6)' });
          check(tok);
          await impact(t, total, { ...opts, heavy: true, hpAfter: s.hp }, tok);
          await anim(me, [{ transform: `translate(${v.dx * 0.62}px, ${v.dy * 0.62}px) rotate(0deg)` }, { transform: 'none' }], 260);
          break;
        }
        default: { // plain attack: wind-up, dash in, contact, back
          await meleeDash(me, v, tok, s.special);
          await impact(t, total, { ...opts, hpAfter: s.hp }, tok);
          await meleeReturn(me, v);
        }
      }
      check(tok);
    } finally {
      if (me) me.style.zIndex = '';
      rest(me);
    }
  }

  async function meleeDash(me: HTMLElement | null, v: { dx: number; dy: number }, tok: number, big = false) {
    await anim(me, [{ transform: 'none' }, { transform: `translate(${-v.dx * 0.08}px, ${-v.dy * 0.08}px) scale(.94) rotate(${v.dx > 0 ? -6 : 6}deg)` }], 170);
    check(tok);
    await anim(me, [{ transform: `translate(${-v.dx * 0.08}px, ${-v.dy * 0.08}px) scale(.94)` }, { transform: `translate(${v.dx * 0.6}px, ${v.dy * 0.6}px) scale(${big ? 1.12 : 1.04}) rotate(${v.dx > 0 ? 8 : -8}deg)` }], 150, { easing: 'cubic-bezier(.6,0,1,.6)' });
    check(tok);
  }
  async function meleeReturn(me: HTMLElement | null, v: { dx: number; dy: number }) {
    await anim(me, [{ transform: `translate(${v.dx * 0.6}px, ${v.dy * 0.6}px)` }, { transform: `translate(${v.dx * 0.1}px, ${v.dy * 0.1}px)`, offset: 0.6 }, { transform: 'none' }], 260);
  }

  async function playStep(s: Step, tok: number) {
    switch (s.kind) {
      case 'round': setRoundNo(s.round); if (mode === 'replay') say(`ROUND ${s.round}`, true); await wait(mode === 'replay' ? 260 : 80, tok); break;
      case 'stance': {
        poseSet({ [s.side]: 'guard' } as Partial<Record<Side, CreatureState>>);
        sfx.guard();
        const c = center(s.side);
        const ring = fx('fx-shield', c.x, c.y, '', { width: `${c.w * 0.85}px`, height: `${c.w * 0.85}px`, marginLeft: `${-c.w * 0.425}px`, marginTop: `${-c.w * 0.425}px` });
        void fxAnim(ring, [{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.4 }, { transform: 'scale(1.05)', opacity: 0 }], 520);
        if (s.bunker) say(SPECIAL_LABEL.wombat, true);
        await wait(260, tok);
        break;
      }
      case 'strike': await strike(s, tok); break;
      case 'heal': {
        const c = center(s.side);
        for (let i = 0; i < 7; i++) {
          const p = fx('fx-heal', c.x + (Math.random() * c.w * 0.6 - c.w * 0.3), c.y + c.w * 0.1, '+');
          void fxAnim(p, [{ transform: 'translateY(0) scale(.6)', opacity: 0 }, { transform: `translateY(${-c.w * 0.25}px) scale(1.1)`, opacity: 1, offset: 0.4 }, { transform: `translateY(${-c.w * 0.5}px) scale(.8)`, opacity: 0 }], 700, { delay: (i * 50) / ctl.current.speed });
        }
        await anim(wrap(s.side), [{ filter: 'none' }, { filter: 'brightness(1.3) drop-shadow(0 0 12px rgba(140,230,140,.9))' }, { filter: 'none' }], 520, { fill: 'none' });
        pop(s.side, `+${s.amount}`, 'heal');
        sfx.xp();
        setHp(s.hp);
        await wait(200, tok);
        break;
      }
      case 'reflect': {
        // the stance throws a spark back at whoever swung
        const from = center(s.side); const to = center(other(s.side));
        const spark = fx('fx-flame fx-gold', from.x, from.y);
        await fxAnim(spark, [{ transform: 'translate(0,0) scale(.6)' }, { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(1.2)` }], 260, { easing: 'cubic-bezier(.5,0,1,1)' });
        check(tok);
        await impact(other(s.side), s.dmg, { guarded: false, dir: { dx: to.x - from.x, dy: to.y - from.y, len: Math.hypot(to.x - from.x, to.y - from.y) || 1 }, label: '↩ ', hpAfter: s.hp }, tok);
        await wait(120, tok);
        break;
      }
      case 'recoil': {
        const el = wrap(s.side);
        await anim(el, [{ transform: 'none', filter: 'none' }, { transform: 'translateX(-5px)', filter: 'brightness(1.4) sepia(.6) hue-rotate(-30deg) saturate(3)' }, { transform: 'translateX(5px)' }, { transform: 'none', filter: 'none' }], 260, { fill: 'none' });
        pop(s.side, `-${s.dmg}`, 'self');
        setHp(s.hp);
        await wait(80, tok);
        break;
      }
      case 'settle': {
        setHp(s.hp);
        poseSet({ a: 'idle', b: 'idle' });
        await wait(160, tok);
        break;
      }
    }
  }

  async function ending(b: Battle, tok: number) {
    const tl = buildTimeline(b);
    if (!tl.winner) return;
    const loser = other(tl.winner);
    setHp({ a: b.a.hp, b: b.b.hp });
    const ko = b.reason === 'ko';
    say(ko ? 'K.O.!' : b.reason === 'rounds' ? 'TIME!' : b.reason === 'surrender' ? 'SURRENDER' : 'NO-SHOW');
    shake(ko ? 10 : 4);
    if (ko) buzz([40, 60, 40]);
    poseSet({ [loser]: 'defeat' } as Partial<Record<Side, CreatureState>>);
    setDown({ side: loser, ko });
    await wait(700, tok);
    poseSet({ [tl.winner]: 'victory' } as Partial<Record<Side, CreatureState>>);
    const w = wrap(tl.winner);
    void anim(w, [{ transform: 'none' }, { transform: 'translateY(-18%) scale(1.05)', offset: 0.3 }, { transform: 'none', offset: 0.55 }, { transform: 'translateY(-10%)', offset: 0.75 }, { transform: 'none' }], 900, { fill: 'none' });
    const c = center(tl.winner);
    const colours = ['#E5AD48', '#F6EBDD', '#76243A', '#a8e58f', '#f07842'];
    for (let i = 0; i < 26; i++) {
      const el = fx('fx-confetti', c.x, c.y - c.w * 0.3, '', { background: colours[i % colours.length] });
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4; const d = c.w * (0.5 + Math.random() * 0.8);
      void fxAnim(el, [{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * d}px, ${Math.sin(ang) * d}px) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: 0.5 }, { transform: `translate(${Math.cos(ang) * d * 1.2}px, ${Math.sin(ang) * d * 0.4 + c.w * 0.6}px) rotate(${Math.random() * 900}deg)`, opacity: 0 }], 1400, { easing: 'cubic-bezier(.2,.7,.4,1)' });
    }
    if (tl.winner === near) sfx.victory(); else sfx.defeat();
    await wait(900, tok);
  }

  /** Jump to the engine's final state immediately (skip, reduced attention span, or a slow phone). */
  function snapToEnd() {
    ctl.current.token++;
    const b = battleRef.current;
    [wrapA.current, wrapB.current, cam.current].forEach(rest);
    if (fxl.current) fxl.current.innerHTML = '';
    setHp({ a: b.a.hp, b: b.b.hp });
    played.current = b.log.length; entered.current = true;
    setRoundNo(Math.max(1, Math.min(b.round, 7)));
    cbs.current.onRound?.(b.log.length);
    if (b.status === 'finished' && b.winnerId) {
      ended.current = true;
      const w: Side = b.winnerId === b.a.playerId ? 'a' : 'b';
      setPose({ [w]: 'victory', [other(w)]: 'defeat' } as Record<Side, CreatureState>); setK((x) => x + 1);
      setDown({ side: other(w), ko: b.reason === 'ko' });
      setCaption(null);
      cbs.current.onDone?.();
    } else { setPose({ a: 'idle', b: 'idle' }); setK((x) => x + 1); }
  }

  async function pump() {
    if (running.current) return;
    running.current = true;
    const tok = ctl.current.token;
    cbs.current.onBusy?.(true);
    try {
      if (!entered.current) { await entrance(tok); entered.current = true; }
      for (;;) {
        const b = battleRef.current;
        if (played.current < b.log.length) {
          const tl = buildTimeline(b);
          const r = tl.rounds[played.current];
          const big = mode === 'replay' && r.round === tl.turningRound && tl.rounds.length > 2;
          if (big) say('TURNING POINT', true);
          for (const s of r.steps) await playStep(s, tok);
          played.current += 1;
          cbs.current.onRound?.(played.current);
          continue;
        }
        if (b.status === 'finished' && b.winnerId && !ended.current) { ended.current = true; await ending(b, tok); cbs.current.onDone?.(); continue; }
        break;
      }
    } catch (e) {
      if (!(e instanceof Cancelled)) { console.warn('battle animation stopped', e); snapToEnd(); }
    } finally {
      running.current = false;
      cbs.current.onBusy?.(false);
      const b = battleRef.current;
      if (alive.current && (played.current < b.log.length || (b.status === 'finished' && b.winnerId && !ended.current))) void pump();
    }
  }

  // pace: replays are squeezed into ~8s; "fast" doubles it
  const baseSpeed = useRef(1);
  // (measured: real playback runs ~1.5x the step estimate once hit-stops and effects are included)
  if (mode === 'replay') baseSpeed.current = Math.min(3.2, Math.max(1, (estimate(buildTimeline(battle).rounds) * 1.5) / 7500));
  ctl.current.speed = baseSpeed.current * speed;

  useEffect(() => { void pump(); }, [battle.log.length, battle.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (skip) snapToEnd(); }, [skip]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { alive.current = true; return () => { alive.current = false; ctl.current.token++; }; }, []);
  // Safety net: if anything stalls, the bars still end up on the server's numbers.
  useEffect(() => {
    if (mode !== 'live') return;
    const t = setTimeout(() => { if (!running.current) setHp({ a: battle.a.hp, b: battle.b.hp }); }, 6000);
    return () => clearTimeout(t);
  }, [battle.a.hp, battle.b.hp]); // eslint-disable-line react-hooks/exhaustive-deps

  const sideInfo = (s: Side) => info[battle[s].playerId];
  const nearInfo = sideInfo(near), farInfo = sideInfo(far);
  const downCls = (s: Side) => (down?.side === s ? (down.ko ? ' down-ko' : ' down-slump') : '');

  return (
    <div className="arena">
      <div className="stage-cam" ref={cam}>
        <div className="arena-floor foe-floor" /><div className="arena-floor me-floor" />
        <div className={`fighter foe${downCls(far)}`} ref={far === 'a' ? wrapA : wrapB}>
          <Creature creature={battle[far].creature} level={farInfo?.level} colorway={farInfo?.colorway ?? 0} equipped={farInfo?.equipped} state={pose[far]} animKey={`f${k}`} flip />
          {down?.side === far && down.ko && <Dizzy />}
          {status?.('far')}
        </div>
        <div className={`fighter me${downCls(near)}`} ref={near === 'a' ? wrapA : wrapB}>
          <Creature creature={battle[near].creature} level={nearInfo?.level} colorway={nearInfo?.colorway ?? 0} equipped={nearInfo?.equipped} state={pose[near]} animKey={`m${k}`} />
          {down?.side === near && down.ko && <Dizzy />}
          {status?.('near')}
        </div>
        <div className="fx-layer" ref={fxl} />
      </div>
      <div className="hpcard foe-card"><div className="row-between tiny bold"><span className="ellipsis">{farInfo?.name ?? CREATURES[battle[far].creature].name}</span><span className="faint">Lv{farInfo?.level ?? 1}</span></div><HPBar hp={hp[far]} max={battle[far].maxHp} /><div className="tiny faint ellipsis">{farInfo?.nick} · {hp[far]}/{battle[far].maxHp}</div></div>
      <div className="round-badge"><div className="eyebrow">Round {roundNo}</div>{top}</div>
      {caption && <div key={caption.k} className={`stage-caption ${caption.small ? 'small' : ''}`} onAnimationEnd={() => setCaption(null)}>{caption.text}</div>}
      <div className="hpcard me-card"><div className="row-between tiny bold"><span className="ellipsis">{nearInfo?.name ?? CREATURES[battle[near].creature].name}</span><span className="faint">Lv{nearInfo?.level ?? 1}</span></div><HPBar hp={hp[near]} max={battle[near].maxHp} /><div className="tiny faint ellipsis">{nearLabel ?? nearInfo?.nick} · {hp[near]}/{battle[near].maxHp}</div></div>
      {overlay}
    </div>
  );
}

function Dizzy() {
  return <div className="dizzy" aria-hidden><span>★</span><span>✦</span><span>★</span></div>;
}
