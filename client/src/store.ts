import { create } from 'zustand';
import type { Battle, PartyPublic, PlayerPrivate, PlayerPublic, HostView, ServerMessage } from '@shared/types';
import { loadIdentity } from './identity';

export type Tab = 'home' | 'missions' | 'battle' | 'ranks' | 'party' | 'profile' | 'host' | 'raid' | 'wall' | 'cellar' | 'gallery';
export type Flow = 'opening' | 'join' | 'choose' | 'reveal' | 'firstMission' | 'main';
export type ConnStatus = 'connecting' | 'online' | 'offline' | 'demo';

export interface Toast { id: number; text: string; emoji?: string; tone?: 'info' | 'success' | 'warn' }
export interface Reward { points: number; xp: number; levelUp?: number; unlocked?: string[]; achievements?: string[]; title: string; evolved?: { from: number; to: number }; capped?: boolean; bonus?: string }

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
  kicked: string | null;
  pendingCode: string | null;
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
}

let toastSeq = 1;

export const useStore = create<State>((set, get) => ({
  identity: loadIdentity(),
  conn: 'connecting',
  flow: 'opening',
  tab: 'home',
  party: null,
  priv: null,
  hostView: null,
  toasts: [],
  reward: null,
  rewardQueue: [],
  focusBattleId: null,
  kicked: null,
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
          else if (me.creature && prev.flow === 'join') set({ flow: 'main' });
        }
        break;
      }
      case 'private': set({ priv: m.priv, hostView: m.hostView ?? null }); break;
      case 'reward': {
        const r: Reward = { points: m.points, xp: m.xp, levelUp: m.levelUp, unlocked: m.unlocked, achievements: m.achievements, title: m.title, evolved: m.evolved, capped: m.capped, bonus: m.bonus };
        if (get().reward) set({ rewardQueue: [...get().rewardQueue, r] }); else set({ reward: r });
        break;
      }
      case 'toast': get().toast(m.text, m.emoji, m.tone); break;
      case 'kicked': set({ kicked: m.reason, party: null, priv: null, flow: 'join' }); break;
      default: break;
    }
  },
  toast: (text, emoji, tone = 'info') => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts.slice(-3), { id, text, emoji, tone }] });
    setTimeout(() => get().dismissToast(id), 3800);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  nextReward: () => { const [next, ...rest] = get().rewardQueue; set({ reward: next ?? null, rewardQueue: rest }); },
  setFocusBattle: (focusBattleId) => set({ focusBattleId }),
  clearKicked: () => set({ kicked: null }),
}));

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
