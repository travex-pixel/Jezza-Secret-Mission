import { create } from 'zustand';
import type { Battle, PartyPublic, PlayerPrivate, PlayerPublic, HostView, ServerMessage } from '@shared/types';
import { loadIdentity } from './identity';

export type Tab = 'home' | 'missions' | 'battle' | 'ranks' | 'party' | 'profile' | 'host' | 'raid' | 'wall' | 'cellar' | 'gallery';
export type Flow = 'opening' | 'join' | 'choose' | 'reveal' | 'firstMission' | 'main';
export type ConnStatus = 'connecting' | 'online' | 'offline' | 'demo';

export interface Toast { id: number; text: string; emoji?: string; tone?: 'info' | 'success' | 'warn' }
export interface Reward { points: number; xp: number; levelUp?: number; unlocked?: string[]; achievements?: string[]; title: string; evolved?: { from: number; to: number }; capped?: boolean; bonus?: string; battleId?: string; quiet?: boolean }

interface State {
  identity: { playerId: string; secret: string };
  conn: ConnStatus;
  flow: Flow;
  tab: Tab;
  party: PartyPublic | null;
  priv: PlayerPrivate | null;
  hostView: HostView | null;
  toasts: Toast[];
  reward: Reward | null;
  rewardQueue: Reward[];
  focusBattleId: string | null;
  partyView: 'roster' | 'feed';
  kicked: string | null;
  pendingCode: string | null;
  replay: Battle | null;   // battle being replayed in the overlay
  awayOpen: boolean;       // "while you were away" sheet
  photo: { src: string; caption?: string; sub?: string } | null; // full-screen photo viewer
  watchingBattle: string | null; // battle whose fight is playing on screen: its reward waits for the result
  heldRewards: Reward[];
  heldToasts: Omit<Toast, 'id'>[];
  doneBattles: string[];   // finished battles the player tapped Done on (so the result never pops back up)
  introRewards: Reward[];  // rewards earned during the intro: shown inline on the step, not as a pop-up
  // actions
  setConn: (c: ConnStatus) => void;
  setFlow: (f: Flow) => void;
  setTab: (t: Tab) => void;
  applyServer: (m: ServerMessage) => void;
  toast: (text: string, emoji?: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  nextReward: () => void;
  setFocusBattle: (id: string | null) => void;
  clearKicked: () => void;
  setReplay: (b: Battle | null) => void;
  setAwayOpen: (open: boolean) => void;
  openPhoto: (p: { src: string; caption?: string; sub?: string } | null) => void;
  watchBattle: (id: string | null) => void;
  doneBattle: (id: string) => void;
  endIntro: () => void;
}

let toastSeq = 1;
const DONE_KEY = 'jezza.doneBattles';
function loadDoneBattles(): string[] {
  try { const v = JSON.parse(sessionStorage.getItem(DONE_KEY) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}

export const useStore = create<State>((set, get) => ({
  identity: loadIdentity(),
  conn: 'connecting',
  flow: (() => { const q = new URLSearchParams(location.search); const demo = q.get('demo') === '1' || import.meta.env.VITE_STATIC_DEMO === '1' || /\.github\.io$/i.test(location.hostname); return q.get('p') && !demo ? 'join' : 'opening'; })() as Flow,
  tab: 'home',
  party: null,
  priv: null,
  hostView: null,
  toasts: [],
  reward: null,
  rewardQueue: [],
  focusBattleId: null,
  partyView: 'roster',
  kicked: null,
  replay: null,
  awayOpen: false,
  photo: null,
  watchingBattle: null,
  heldRewards: [],
  heldToasts: [],
  doneBattles: loadDoneBattles(),
  introRewards: [],
  pendingCode: new URLSearchParams(location.search).get('p')?.toUpperCase() ?? null,

  setConn: (conn) => set({ conn }),
  setFlow: (flow) => set({ flow }),
  setTab: (tab) => set({ tab }),
  applyServer: (m) => {
    switch (m.type) {
      case 'party': {
        const prev = get();
        set({ party: m.party });
        // Keep the flow sane after a reconnect / refresh.
        const me = m.party.players.find((p) => p.id === prev.identity.playerId);
        if (prev.flow !== 'opening') {
          if (!me) set({ flow: 'join' });
          else if (!me.creature && prev.flow === 'main') set({ flow: 'choose' });
          // ...unless they opened an invite to a different party: then the invite wins over the party they're still in
          else if (me.creature && prev.flow === 'join' && (!prev.pendingCode || prev.pendingCode === m.party.code)) set({ flow: 'main' });
        }
        break;
      }
      case 'private': set({ priv: m.priv, hostView: m.hostView ?? null }); break;
      case 'reward': {
        const r: Reward = { points: m.points, xp: m.xp, levelUp: m.levelUp, unlocked: m.unlocked, achievements: m.achievements, title: m.title, evolved: m.evolved, capped: m.capped, bonus: m.bonus, battleId: m.battleId, quiet: m.quiet };
        if (r.battleId && r.battleId === get().watchingBattle) { set({ heldRewards: [...get().heldRewards, r] }); break; } // don't spoil the fight
        if (get().flow === 'firstMission' && !r.evolved) { set({ introRewards: [...get().introRewards, r] }); break; } // the intro shows it in place
        if (r.quiet && !r.evolved) { // it landed later (a mate confirmed, a vote passed): a toast, never a pop-up over whatever you're doing
          get().toast(`${r.title}: +${r.points} pts · +${r.xp} XP${r.levelUp ? ` · Level ${r.levelUp}!` : ''}${r.unlocked?.length ? ` · 🎁 ${r.unlocked.length} item${r.unlocked.length === 1 ? '' : 's'}` : ''}`, '✅', 'success');
          break;
        }
        if (get().reward) set({ rewardQueue: [...get().rewardQueue, r] }); else set({ reward: r });
        break;
      }
      case 'toast': get().toast(m.text, m.emoji, m.tone); break;
      case 'kicked': set({ kicked: m.reason, party: null, priv: null, flow: 'join' }); break;
      default: break;
    }
  },
  toast: (text, emoji, tone = 'info') => {
    // "Achievement: Taste of Victory" mid-fight would give the result away; it waits with the reward.
    if ((get().watchingBattle || get().flow === 'firstMission') && text.startsWith('Achievement')) { set({ heldToasts: [...get().heldToasts, { text, emoji, tone }] }); return; }
    const id = toastSeq++;
    set({ toasts: [...get().toasts.slice(-3), { id, text, emoji, tone }] });
    setTimeout(() => get().dismissToast(id), 3800);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  nextReward: () => { const [next, ...rest] = get().rewardQueue; set({ reward: next ?? null, rewardQueue: rest }); },
  setFocusBattle: (focusBattleId) => set({ focusBattleId }),
  clearKicked: () => set({ kicked: null }),
  setReplay: (replay) => set({ replay }),
  setAwayOpen: (awayOpen) => set({ awayOpen }),
  openPhoto: (photo) => set({ photo }),
  endIntro: () => {
    const toasts = get().heldToasts;
    set({ flow: 'main', tab: 'home', introRewards: [], heldToasts: [] });
    for (const t of toasts) get().toast(t.text, t.emoji, t.tone);
  },
  doneBattle: (id) => {
    const doneBattles = [...get().doneBattles.filter((x) => x !== id), id].slice(-30);
    set({ doneBattles });
    try { sessionStorage.setItem(DONE_KEY, JSON.stringify(doneBattles)); } catch { /* private mode: memory is enough */ }
  },
  watchBattle: (id) => {
    // Stop holding: release anything kept back for the battle we were watching.
    const held = get().heldRewards; const toasts = get().heldToasts;
    set({ watchingBattle: id, heldRewards: [], heldToasts: [] });
    for (const r of held) { if (get().reward) set({ rewardQueue: [...get().rewardQueue, r] }); else set({ reward: r }); }
    for (const t of toasts) get().toast(t.text, t.emoji, t.tone);
  },
}));

/** Find a battle for replay: recent public ones first, then the player's own away log. */
export function findBattle(s: Pick<State, 'party' | 'priv'>, id: string | undefined): Battle | undefined {
  if (!id) return undefined;
  return s.party?.battles.find((b) => b.id === id) ?? s.priv?.awayBattles?.find((b) => b.id === id);
}

// ---------- selectors ----------
export const useMe = (): PlayerPublic | undefined => useStore((s) => s.party?.players.find((p) => p.id === s.identity.playerId));
export const useIsGroom = (): boolean => useStore((s) => !!s.party && s.party.groomId === s.identity.playerId);
export const useIsHost = (): boolean => useStore((s) => !!s.party && s.party.hostId === s.identity.playerId);
export const useMyBattle = (): Battle | undefined => useStore((s) => {
  const me = s.identity.playerId;
  return s.party?.battles.find((b) => (b.status === 'active' || b.status === 'challenge') && (b.a.playerId === me || b.b.playerId === me));
});
export function playerById(party: PartyPublic | null, id: string | undefined | null): PlayerPublic | undefined {
  return id ? party?.players.find((p) => p.id === id) : undefined;
}
