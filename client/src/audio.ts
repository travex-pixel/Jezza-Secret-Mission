// Tiny synthesised sound kit (no assets, no autoplay). All sounds are original WebAudio sketches.
import { loadPref, savePref } from './identity';

let ctx: AudioContext | null = null;
let muted = loadPref<boolean>('muted', false);
let unlocked = false;

export function isMuted() { return muted; }
export function setMuted(m: boolean) { muted = m; savePref('muted', m); }
export function toggleMuted() { setMuted(!muted); return muted; }

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

/** Call from the first user gesture so iOS lets us play later. */
export function unlockAudio() { if (unlocked) return; unlocked = true; const c = ac(); if (c) { const o = c.createOscillator(); const g = c.createGain(); g.gain.value = 0; o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.01); } }

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, slideTo?: number) {
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + start);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + start + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05);
}

export const sfx = {
  tap() { const c = ac(); if (!c) return; tone(c, 660, 0, 0.06, 'triangle', 0.06); },
  select() { const c = ac(); if (!c) return; tone(c, 523, 0, 0.09, 'triangle', 0.1); tone(c, 784, 0.07, 0.14, 'triangle', 0.1); },
  reveal() { const c = ac(); if (!c) return; [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.09, 0.35, 'triangle', 0.1)); tone(c, 1568, 0.4, 0.6, 'sine', 0.06); },
  reward() { const c = ac(); if (!c) return; [660, 880, 1100, 1320].forEach((f, i) => tone(c, f, i * 0.07, 0.25, 'square', 0.05)); tone(c, 1760, 0.3, 0.5, 'sine', 0.07); },
  xp() { const c = ac(); if (!c) return; for (let i = 0; i < 6; i++) tone(c, 900 + i * 90, i * 0.04, 0.08, 'triangle', 0.05); },
  victory() { const c = ac(); if (!c) return; [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.11, 0.3, 'triangle', 0.1)); },
  defeat() { const c = ac(); if (!c) return; tone(c, 330, 0, 0.5, 'sawtooth', 0.05, 180); tone(c, 220, 0.25, 0.7, 'sawtooth', 0.05, 110); },
  hit() { const c = ac(); if (!c) return; tone(c, 180, 0, 0.12, 'sawtooth', 0.12, 60); tone(c, 90, 0, 0.18, 'square', 0.08, 40); },
  guard() { const c = ac(); if (!c) return; tone(c, 440, 0, 0.12, 'sine', 0.08, 330); },
  special() { const c = ac(); if (!c) return; tone(c, 200, 0, 0.3, 'sawtooth', 0.08, 1200); tone(c, 1200, 0.25, 0.3, 'triangle', 0.08, 300); },
  mission() { const c = ac(); if (!c) return; tone(c, 440, 0, 0.1, 'square', 0.05); tone(c, 554, 0.1, 0.1, 'square', 0.05); tone(c, 659, 0.2, 0.3, 'square', 0.06); tone(c, 880, 0.32, 0.35, 'triangle', 0.08); },
  error() { const c = ac(); if (!c) return; tone(c, 220, 0, 0.15, 'square', 0.05); tone(c, 196, 0.12, 0.2, 'square', 0.05); },
  sting() { const c = ac(); if (!c) return; tone(c, 110, 0, 1.4, 'sawtooth', 0.04); tone(c, 220, 0, 1.4, 'sine', 0.05); [440, 554, 659].forEach((f, i) => tone(c, f, 0.2 + i * 0.18, 1.0, 'triangle', 0.05)); tone(c, 1318, 0.75, 1.2, 'sine', 0.04); },
  challenge() { const c = ac(); if (!c) return; tone(c, 523, 0, 0.1, 'square', 0.06); tone(c, 523, 0.14, 0.1, 'square', 0.06); tone(c, 784, 0.28, 0.3, 'square', 0.07); },
};
