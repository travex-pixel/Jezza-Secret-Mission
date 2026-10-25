import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { findBattle, useStore, type Tab } from '../store';
import { Creature, LadPic } from './Creature';
import { FORMS } from '@shared/creatures';
import { REWARD_QUIPS } from '@shared/missions';
import type { FeedEvent, Reaction } from '@shared/types';
import { request } from '../net';
import { levelProgress, COSMETIC_BY_ID, ACHIEVEMENT_BY_ID } from '@shared/progression';
import { sfx, isMuted, toggleMuted, unlockAudio } from '../audio';
import { buzz } from '../haptics';
import { useTheme } from '../theme';

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
      {toasts.slice(-2).map((t) => <div key={t.id} className={`toast ${t.tone ?? ''}`} onClick={() => dismiss(t.id)}>{t.emoji && <span className="emoji">{t.emoji}</span>}<span className="grow">{t.text}</span></div>)}
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
  const th = useTheme();
  const me = useStore((s) => s.party?.players.find((p) => p.id === s.identity.playerId));
  const [evoStep, setEvoStep] = useState(0);
  useEffect(() => {
    if (!reward) return;
    if (reward.evolved) { setEvoStep(0); sfx.sting(); buzz([60, 40, 60, 40, 160]); const a = setTimeout(() => setEvoStep(1), 1300); const b = setTimeout(() => { setEvoStep(2); sfx.reveal(); }, 2300); return () => { clearTimeout(a); clearTimeout(b); }; }
    sfx.reward(); buzz([20, 30, 40]);
  }, [reward]);
  const quip = useMemo(() => REWARD_QUIPS[Math.floor(Math.random() * REWARD_QUIPS.length)], [reward]);
  const bursts = useMemo(() => Array.from({ length: 16 }, (_, i) => ({ dx: `${Math.cos((i / 16) * Math.PI * 2) * (120 + (i % 3) * 40)}px`, dy: `${Math.sin((i / 16) * Math.PI * 2) * (120 + (i % 3) * 40)}px` })), [reward]);
  if (!reward) return null;
  const itemOnly = !reward.points && !reward.xp && !reward.levelUp && !!reward.unlocked?.length;
  if (reward.evolved && me?.creature) {
    const to = reward.evolved.to as 1 | 2 | 3;
    return createPortal(
      <div className="reward" onClick={() => evoStep >= 2 && next()}>
        <div className="eyebrow">{evoStep < 2 ? 'Wait… something\'s happening' : 'EVOLUTION'}</div>
        <div style={{ position: 'relative', width: 'min(64vw, 260px)' }}>
          <Creature creature={me.creature} colorway={me.equipped.colorway} equipped={me.equipped} stage={evoStep < 2 ? (reward.evolved.from as 1 | 2 | 3) : to} silhouette={evoStep === 1} state={evoStep === 0 ? 'happy' : evoStep === 2 ? 'evolve' : 'idle'} animKey={evoStep} className={evoStep === 0 ? 'twitch' : ''} />
          {evoStep === 2 && <div className="evo-flash" />}
        </div>
        {evoStep >= 2 && <>
          <div className="display title-lg gold-text fade-up">{me.creatureName} evolved!</div>
          <div className="pill pill-gold fade-up delay-1">{FORMS[me.creature][reward.evolved.from - 1]} → {FORMS[me.creature][to - 1]}</div>
          <div className="dim bold fade-up delay-2">+{reward.points} points · +{reward.xp} XP · {reward.title}</div>
          {to === 2 && <div className="tiny faint fade-up delay-3" style={{ maxWidth: '30ch' }}>One more form to go. It unlocks at level 8{me.joinedPhase === 'friday' ? ', from Saturday' : ''}.</div>}
          <div className="faint tiny fade-up delay-4" style={{ marginTop: 10 }}>tap to continue</div>
        </>}
      </div>,
      document.body,
    );
  }
  return createPortal(
    <div className="reward" onClick={next}>
      {bursts.map((b, i) => <i key={i} className="burst" style={{ ['--dx' as any]: b.dx, ['--dy' as any]: b.dy, background: i % 2 ? 'var(--ember)' : 'var(--gold)' }} />)}
      <div className="eyebrow fade-up">{reward.levelUp ? 'LEVEL UP!' : quip}</div>
      {itemOnly ? (
        <>{/* a code or a giveaway: the item is the prize, not "+0 points" */}
          <div className="big">🎁</div>
          <div className="display title-md fade-up delay-1 gold-text">{reward.unlocked!.map((u) => COSMETIC_BY_ID[u]?.name ?? u).join(' · ')}</div>
        </>
      ) : (
        <>
          <div className="big gold-text">+{reward.points}</div>
          <div className="display title-md fade-up delay-1">points</div>
          <div className="pill pill-gold fade-up delay-2">+{reward.xp} XP {reward.levelUp ? `· now level ${reward.levelUp}` : ''}</div>
        </>
      )}
      {reward.bonus && <div className="pill pill-ember fade-up delay-2">{reward.bonus}</div>}
      <div className="dim bold fade-up delay-2" style={{ maxWidth: '30ch' }}>{reward.title}</div>
      {reward.capped && <div className="tiny faint fade-up delay-3" style={{ maxWidth: '30ch' }}>Friday XP cap reached: your creature's final form unlocks Saturday. Points still count.</div>}
      {!!reward.unlocked?.length && !itemOnly && <div className="row fade-up delay-3" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>{reward.unlocked.map((u) => <span key={u} className="pill pill-ember">🎁 {COSMETIC_BY_ID[u]?.name ?? u}</span>)}</div>}
      {itemOnly && <div className="tiny faint fade-up delay-3">Wear it on the Me screen → Hats and friends</div>}
      {!!reward.achievements?.length && <div className="row fade-up delay-3" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>{reward.achievements.map((a) => <span key={a} className="pill pill-ok">🏅 {th.t(ACHIEVEMENT_BY_ID[a]?.name ?? a)}</span>)}</div>}
      <div className="faint tiny fade-up delay-4" style={{ marginTop: 10 }}>tap to continue</div>
    </div>,
    document.body,
  );
}

const NAV: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Lobby', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg> },
  { id: 'missions', label: 'Challenges', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg> },
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

/** Which colour edge a feed line gets, and which ones are big moments worth a glow. */
const FEED_TONE: Record<FeedEvent['kind'], string> = {
  mission: 'ember', wall: 'ember', battle: 'rose', raid: 'rose', levelup: 'gold', evolve: 'gold', achievement: 'gold', unlock: 'gold',
  vote: 'gold', cellar: 'wine', epic: 'epic', join: 'ok', phase: 'cream', host: 'cream', group: 'cream',
};
const BIG_MOMENT = new Set<FeedEvent['kind']>(['evolve', 'raid', 'phase', 'epic']);
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A feed row: who (their creature), what happened (names in bold), when, and the photo if there is one.
 *  Challenge completions by other players get reactions and a "Call BS" button. */
export function FeedItem({ f, compact }: { f: FeedEvent; compact?: boolean }) {
  const me = useStore((s) => s.identity.playerId);
  const priv = useStore((s) => s.priv);
  const groomId = useStore((s) => s.party?.groomId);
  const players = useStore((s) => s.party?.players);
  const toast = useStore((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const isMission = f.kind === 'mission' && !!f.claimId && !!f.playerId;
  const mine = f.playerId === me;
  const canFlag = isMission && !mine && !f.disputed && Date.now() - f.at < 45 * 60_000;
  const flagged = !!f.claimId && (priv?.flagged ?? []).includes(f.claimId);
  const who = f.playerId ? players?.find((p) => p.id === f.playerId) : undefined;
  // The emoji goes on the avatar badge, so drop it from the start of the line; then bold every lad's name
  const body = useMemo(() => {
    let text = f.text;
    if (f.emoji && text.startsWith(f.emoji)) text = text.slice(f.emoji.length).trimStart();
    const names = (players ?? []).map((p) => p.nickname).filter((n) => n.length >= 2).sort((a, b) => b.length - a.length);
    if (!names.length) return text;
    const re = new RegExp(`(${names.map(escRe).join('|')})`, 'g');
    return text.split(re).map((part, i) => (i % 2 ? <b key={i} className="feed-name">{part}</b> : part));
  }, [f.text, f.emoji, players]);
  const run = async (fn: () => Promise<unknown>, okText?: string, emoji = '✅') => {
    if (busy) return; setBusy(true);
    try { await fn(); sfx.select(); if (okText) toast(okText, emoji, 'success'); }
    catch (e) { toast((e as Error).message, '⚠️', 'warn'); }
    finally { setBusy(false); }
  };
  const flag = () => run(async () => { const r = await request<{ flags: number; disputed: boolean }>({ type: 'flagClaim', claimId: f.claimId! }); toast(r.disputed ? 'BS called. Points frozen.' : `Flagged. ${2 - r.flags} more and it's frozen.`, '🚩', 'warn'); });
  const back = () => run(() => request({ type: 'backClaim', claimId: f.claimId! }), 'You backed it.', '🤝');
  const react = (emoji: Reaction) => run(() => request({ type: 'react', eventId: f.id, emoji }));
  const reactions: Reaction[] = groomId === me ? ['😂', '🔥', '❤️'] : ['😂', '🔥'];
  const pendingVote = useStore((s) => (f.kind === 'vote' ? s.party?.pendingPhotos?.find((x) => x.claimId === f.claimId) : undefined));
  const replayable = useStore((s) => (f.battleId ? findBattle(s, f.battleId) : undefined));
  const setReplay = useStore((s) => s.setReplay);
  const openPhoto = useStore((s) => s.openPhoto);
  const vote = (up: boolean) => run(() => request({ type: 'votePhoto', claimId: f.claimId!, up }), up ? 'Voted it in 👍' : 'Voted it down 👎', up ? '👍' : '👎');
  const thumb = compact && !pendingVote && f.photoUrl;
  const fresh = Date.now() - f.at < 10_000;
  return (
    <div className={`feed-item tone-${FEED_TONE[f.kind] ?? 'cream'} ${BIG_MOMENT.has(f.kind) ? 'big' : ''} ${fresh ? 'fresh' : ''} ${pendingVote ? 'vote-item' : ''}`}>
      <span className="feed-ava">
        {who?.creature ? <LadPic p={who} /> : <span className="feed-ava-emoji">{f.emoji ?? '•'}</span>}
        {who?.creature && f.emoji && <span className="feed-badge">{f.emoji}</span>}
      </span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className={compact ? 'feed-text clamp-2' : 'feed-text'} style={{ display: 'block' }}>{body}</span>
        {(!compact || pendingVote) && f.photoUrl && <img src={f.photoUrl} alt="Challenge photo" loading="lazy" className={`tap-photo ${compact ? 'vote-thumb' : ''}`} onClick={() => openPhoto({ src: f.photoUrl!, caption: f.text })} />}
        <span className="row" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <time style={{ display: 'inline' }}>{timeAgo(f.at)}</time>
          {isMission && !compact && reactions.map((r) => { const n = f.reactions?.[r]?.length ?? 0; const on = !!f.reactions?.[r]?.includes(me); return (
            <button key={r} className={`react-btn ${on ? 'on' : ''}`} disabled={busy || mine || on} onClick={() => react(r)} aria-label={`React ${r}`}>{r}{n ? ` ${n}` : ''}</button>); })}
          {isMission && compact && !!(f.reactions?.['😂']?.length || f.reactions?.['🔥']?.length || f.reactions?.['❤️']?.length) && <span className="tiny faint">{(['😂', '🔥', '❤️'] as Reaction[]).map((r) => f.reactions?.[r]?.length ? `${r}${f.reactions[r]!.length}` : '').join(' ')}</span>}
          {pendingVote && (mine
            ? <span className="tiny faint">🗳️ Votes are in progress · 👍 {pendingVote.up.length} 👎 {pendingVote.down.length}</span>
            : <>
              <button className={`react-btn ${pendingVote.up.includes(me) ? 'on' : ''}`} disabled={busy} onClick={() => vote(true)} aria-label="Vote it in">👍 {pendingVote.up.length || ''}</button>
              <button className={`react-btn ${pendingVote.down.includes(me) ? 'on' : ''}`} disabled={busy} onClick={() => vote(false)} aria-label="Vote it down">👎 {pendingVote.down.length || ''}</button>
            </>)}
          {replayable && <button className="react-btn" onClick={() => setReplay(replayable)} aria-label="Watch replay">▶ Replay</button>}
          {f.disputed && <span className="pill pill-xs pill-ember">⚖️ disputed</span>}
          {f.disputed && !mine && !flagged && !compact && <button className="react-btn" disabled={busy} onClick={back}>🤝 Legit</button>}
          {!f.disputed && !!f.flags && <span className="tiny faint">🚩 {f.flags}</span>}
        </span>
      </span>
      {thumb && <button className="feed-thumb" onClick={() => openPhoto({ src: f.photoUrl!, caption: f.text })} aria-label="Open photo"><img src={f.photoUrl} alt="" loading="lazy" /></button>}
      {canFlag && !compact && <button className="bs-btn" disabled={busy || flagged} onClick={flag} aria-label="Call BS on this">🚩 {flagged ? 'Called' : 'BS'}</button>}
    </div>
  );
}
