import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore, type Tab } from '../store';
import { levelProgress, COSMETIC_BY_ID, ACHIEVEMENT_BY_ID } from '@shared/progression';
import { sfx, isMuted, toggleMuted, unlockAudio } from '../audio';
import { buzz } from '../haptics';

export function Button({ children, variant = 'primary', size, className = '', onClick, sound = true, ...rest }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'xs'; className?: string; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; sound?: boolean } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button className={`btn btn-${variant} ${size ? `btn-${size}` : ''} ${className}`} onClick={(e) => { unlockAudio(); if (sound) sfx.tap(); buzz(8); onClick?.(e); }} {...rest}>{children}</button>
  );
}

export function XPBar({ xp, className = '' }: { xp: number; className?: string }) {
  const lp = levelProgress(xp);
  return (
    <div className={className}>
      <div className="row-between tiny bold" style={{ marginBottom: 4 }}>
        <span className="gold-text">LEVEL {lp.level}</span>
        <span className="faint">{lp.needed ? `${lp.into} / ${lp.needed} XP` : 'MAX LEVEL'}</span>
      </div>
      <div className="xpbar"><i style={{ width: `${Math.max(3, lp.pct * 100)}%` }} /></div>
    </div>
  );
}

export function HPBar({ hp, max, thick }: { hp: number; max: number; thick?: boolean }) {
  const pct = Math.max(0, hp / max);
  return <div className={`xpbar hp ${pct < 0.3 ? 'low' : ''} ${thick ? 'thick' : ''}`}><i style={{ width: `${pct * 100}%` }} /></div>;
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  if (!toasts.length) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.tone ?? ''}`} onClick={() => dismiss(t.id)}>{t.emoji && <span className="emoji">{t.emoji}</span>}<span className="grow">{t.text}</span></div>)}
    </div>
  );
}

export function ConnectionPill() {
  const conn = useStore((s) => s.conn);
  const label = conn === 'online' ? 'Live' : conn === 'demo' ? 'Demo' : conn === 'connecting' ? 'Connecting' : 'Reconnecting';
  return <span className={`conn ${conn === 'offline' || conn === 'connecting' ? 'off' : ''} ${conn === 'demo' ? 'demo' : ''}`}><i />{label}</span>;
}

export function MuteButton() {
  const [m, setM] = useState(isMuted());
  return <button className="mute-btn" aria-label={m ? 'Unmute' : 'Mute'} onClick={() => { unlockAudio(); setM(toggleMuted()); }}>{m ? '🔇' : '🔊'}</button>;
}

export function Sheet({ onClose, children, center }: { onClose: () => void; children: ReactNode; center?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return createPortal(
    <div className={`overlay ${center ? 'center' : ''}`} onClick={onClose}>
      <div className={center ? 'modal' : 'sheet'} onClick={(e) => e.stopPropagation()}>
        {!center && <div className="grab" />}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function RewardOverlay() {
  const reward = useStore((s) => s.reward);
  const next = useStore((s) => s.nextReward);
  useEffect(() => { if (reward) { sfx.reward(); buzz([20, 30, 40]); } }, [reward]);
  const bursts = useMemo(() => Array.from({ length: 16 }, (_, i) => ({ dx: `${Math.cos((i / 16) * Math.PI * 2) * (120 + (i % 3) * 40)}px`, dy: `${Math.sin((i / 16) * Math.PI * 2) * (120 + (i % 3) * 40)}px` })), [reward]);
  if (!reward) return null;
  return createPortal(
    <div className="reward" onClick={next}>
      {bursts.map((b, i) => <i key={i} className="burst" style={{ ['--dx' as any]: b.dx, ['--dy' as any]: b.dy, background: i % 2 ? 'var(--ember)' : 'var(--gold)' }} />)}
      <div className="eyebrow fade-up">{reward.levelUp ? 'LEVEL UP!' : 'MISSION COMPLETE'}</div>
      <div className="big gold-text">+{reward.points}</div>
      <div className="display title-md fade-up delay-1">weekend points</div>
      <div className="pill pill-gold fade-up delay-2">+{reward.xp} XP {reward.levelUp ? `· now level ${reward.levelUp}` : ''}</div>
      <div className="dim bold fade-up delay-2" style={{ maxWidth: '30ch' }}>{reward.title}</div>
      {!!reward.unlocked?.length && <div className="row fade-up delay-3" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>{reward.unlocked.map((u) => <span key={u} className="pill pill-ember">🎁 {COSMETIC_BY_ID[u]?.name ?? u}</span>)}</div>}
      {!!reward.achievements?.length && <div className="row fade-up delay-3" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>{reward.achievements.map((a) => <span key={a} className="pill pill-ok">🏅 {ACHIEVEMENT_BY_ID[a]?.name ?? a}</span>)}</div>}
      <div className="faint tiny fade-up delay-4" style={{ marginTop: 10 }}>tap to continue</div>
    </div>,
    document.body,
  );
}

const NAV: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Lobby', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg> },
  { id: 'missions', label: 'Missions', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg> },
  { id: 'battle', label: 'Battle', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 17.5L3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 13l2 2" /><path d="M9.5 17.5L21 6V3h-3L6.5 14.5" /></svg> },
  { id: 'ranks', label: 'Ranks', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0zM6 6H3a3 3 0 0 0 3 3M18 6h3a3 3 0 0 1-3 3" /></svg> },
  { id: 'profile', label: 'Me', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg> },
];

export function BottomNav() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const priv = useStore((s) => s.priv);
  const party = useStore((s) => s.party);
  const me = useStore((s) => s.identity.playerId);
  const missionBadge = (priv?.pendingWitness.length ?? 0);
  const battleBadge = party?.battles.filter((b) => b.status === 'challenge' && b.opponentId === me).length ?? 0;
  return (
    <nav className="bottom-nav">
      {NAV.map((n) => {
        const badge = n.id === 'missions' ? missionBadge : n.id === 'battle' ? battleBadge : 0;
        return (
          <button key={n.id} className={`nav-btn ${tab === n.id ? 'active' : ''}`} onClick={() => { sfx.tap(); setTab(n.id); }} aria-label={n.label}>
            {n.icon}<span>{n.label}</span>{badge > 0 && <span className="badge">{badge}</span>}
          </button>
        );
      })}
    </nav>
  );
}

export function Sparkles({ n = 14 }: { n?: number }) {
  const items = useMemo(() => Array.from({ length: n }, (_, i) => ({ x: (i * 37 + 11) % 100, d: 3 + ((i * 13) % 4), delay: (i * 0.53) % 4, b: 10 + ((i * 17) % 30) })), [n]);
  return <div className="sparkles">{items.map((s, i) => <i key={i} style={{ left: `${s.x}%`, bottom: `${s.b}%`, ['--d' as any]: `${s.d}s`, ['--delay' as any]: `${s.delay}s` }} />)}</div>;
}

export function useCountdown(deadline?: number) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!deadline) { setLeft(0); return; }
    const t = setInterval(() => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250);
    setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    return () => clearInterval(t);
  }, [deadline]);
  return left;
}

export function timeAgo(t: number) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
