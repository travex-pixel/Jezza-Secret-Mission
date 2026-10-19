// Shared domain + protocol types used by client and server.

export type CreatureId = 'dragon' | 'wombat' | 'possum' | 'owl' | 'goblin' | 'sprite' | 'barrel' | 'fox';
export type Phase = 'lobby' | 'friday' | 'saturday' | 'finale' | 'ended';
export type MissionCategory =
  | 'social' | 'jezza' | 'observation' | 'creative' | 'group'
  | 'secret' | 'photo' | 'vineyard' | 'creature' | 'toast';
export type CompletionMethod = 'self' | 'photo' | 'witness' | 'host';
export type MissionPhase = 'friday' | 'saturday' | 'any';
export type CosmeticSlot = 'hat' | 'cape' | 'aura' | 'face' | 'pose';
export type BattleAction = 'attack' | 'counter' | 'special';
export type TapQuality = 'perfect' | 'good' | 'miss';

export interface Cosmetic {
  id: string;
  slot: CosmeticSlot;
  name: string;
  description: string;
}

export interface Equipped {
  colorway: number; // index into creature colorways
  hat?: string;
  cape?: string;
  aura?: string;
  face?: string;
  pose?: string;
}

export interface PlayerPublic {
  id: string;
  nickname: string;
  creature: CreatureId | null;
  creatureName: string;
  level: number;
  xp: number;
  points: number;
  equipped: Equipped;
  unlocked: string[]; // cosmetic ids
  achievements: string[];
  missionsCompleted: number;
  wins: number;
  losses: number;
  title: string;
  online: boolean;
  isHost: boolean;
  joinedAt: number;
  lastSeen: number;
  removed?: boolean;
  categoryCounts: Partial<Record<MissionCategory, number>>;
  witnessed: number;
}

export interface MissionAssignment {
  missionId: string;
  assignedAt: number;
  status: 'active' | 'pending' | 'done' | 'rejected';
  claimId?: string;
}

export interface PlayerPrivate {
  hand: MissionAssignment[];
  completedMissionIds: string[];
  rerollsLeft: number;
  pendingWitness: WitnessRequest[]; // requests where this player is the witness
  honourCooldownUntil: number;      // server time after which the next honour-system claim is allowed
  flagged: string[];                // claim ids this player has already called BS on
  secret: string;
}

export interface WitnessRequest {
  claimId: string;
  fromPlayerId: string;
  fromNickname: string;
  missionId: string;
  createdAt: number;
}

export interface Claim {
  id: string;
  playerId: string;
  missionId: string;
  method: CompletionMethod;
  status: 'pending' | 'approved' | 'rejected' | 'disputed';
  createdAt: number;
  resolvedAt?: number;
  flags?: string[]; // player ids who called BS
  photoUrl?: string;
  witnessId?: string;
  note?: string;
  group?: boolean;
}

export interface FeedEvent {
  id: string;
  at: number;
  kind: 'join' | 'mission' | 'battle' | 'phase' | 'achievement' | 'unlock' | 'host' | 'group' | 'levelup';
  text: string;
  playerId?: string;
  photoUrl?: string;
  emoji?: string;
  claimId?: string;   // set on mission completions so mates can call BS
  flags?: number;
  disputed?: boolean;
}

export interface BattleCreatureState {
  playerId: string;
  creature: CreatureId;
  hp: number;
  maxHp: number;
  specialCooldown: number;
  action?: BattleAction; // chosen this round (hidden from opponent until resolved)
  tap?: TapQuality;      // power-tap result submitted with the action
  lastAction?: BattleAction;
  locked?: boolean; // redacted view: has this side chosen this round?
}

export interface BattleRoundLog {
  round: number;
  lines: string[];
  a: { action: BattleAction; dmgDealt: number; dmgTaken: number; heal: number; tap?: TapQuality; reflected?: number };
  b: { action: BattleAction; dmgDealt: number; dmgTaken: number; heal: number; tap?: TapQuality; reflected?: number };
}

export interface Battle {
  id: string;
  challengerId: string;
  opponentId: string;
  status: 'challenge' | 'active' | 'finished' | 'declined' | 'expired';
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  round: number;
  roundDeadline?: number;
  a: BattleCreatureState;
  b: BattleCreatureState;
  log: BattleRoundLog[];
  winnerId?: string;
  loserId?: string;
  reason?: 'ko' | 'rounds' | 'timeout' | 'surrender' | 'disconnect';
  scored: boolean;
  rewards?: Record<string, { points: number; xp: number }>;
}

export interface AwardResult {
  id: string;
  name: string;
  blurb: string;
  playerId: string | null;
  reason: string;
  hostPick?: boolean;
}

export interface PartyPublic {
  code: string;
  name: string;
  hostId: string;
  phase: Phase;
  missionsOpen: boolean;
  createdAt: number;
  players: PlayerPublic[];
  feed: FeedEvent[];
  revealedGroupMissions: string[];
  battles: Battle[]; // active + recent
  pendingApprovals: number;
  awards: AwardResult[] | null;
  finalized: boolean;
  serverTime: number;
}

export interface HostView {
  approvals: Claim[]; // pending photo/host claims and disputed (BS-called) claims
}

// ---------- Protocol ----------

export interface ClientHello {
  type: 'hello';
  playerId: string;
  secret: string;
  code?: string; // party code if known
}

export type ClientMessage =
  | ClientHello
  | { type: 'createParty'; reqId: string; nickname: string; partyName?: string }
  | { type: 'joinParty'; reqId: string; code: string; nickname: string }
  | { type: 'leaveParty'; reqId: string }
  | { type: 'chooseCreature'; reqId: string; creature: CreatureId; creatureName?: string }
  | { type: 'renameCreature'; reqId: string; creatureName: string }
  | { type: 'equip'; reqId: string; equipped: Partial<Equipped> }
  | { type: 'claimMission'; reqId: string; missionId: string; claimId: string; photo?: string; witnessId?: string; note?: string }
  | { type: 'rerollMission'; reqId: string; missionId: string }
  | { type: 'confirmWitness'; reqId: string; claimId: string; approve: boolean }
  | { type: 'challenge'; reqId: string; opponentId: string }
  | { type: 'respondChallenge'; reqId: string; battleId: string; accept: boolean }
  | { type: 'battleAction'; reqId: string; battleId: string; round: number; action: BattleAction; tap?: TapQuality }
  | { type: 'flagClaim'; reqId: string; claimId: string }
  | { type: 'surrender'; reqId: string; battleId: string }
  | { type: 'host'; reqId: string; action: HostAction }
  | { type: 'ping'; t: number };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ClientRequest = DistributiveOmit<Extract<ClientMessage, { reqId: string }>, 'reqId'>;

export type HostAction =
  | { kind: 'setPhase'; phase: Phase }
  | { kind: 'setMissionsOpen'; open: boolean }
  | { kind: 'revealGroupMission'; missionId: string }
  | { kind: 'resolveClaim'; claimId: string; approve: boolean }
  | { kind: 'removePlayer'; playerId: string }
  | { kind: 'renamePlayer'; playerId: string; nickname: string }
  | { kind: 'resetClaim'; playerId: string; missionId: string }
  | { kind: 'grantPoints'; playerId: string; points: number; reason: string }
  | { kind: 'setAward'; awardId: string; playerId: string | null }
  | { kind: 'finalize'; finalized: boolean }
  | { kind: 'transferHost'; playerId: string }
  | { kind: 'purgePhotos' };

export type ServerMessage =
  | { type: 'welcome'; playerId: string; serverTime: number; inParty: boolean }
  | { type: 'party'; party: PartyPublic }
  | { type: 'private'; priv: PlayerPrivate | null; hostView?: HostView }
  | { type: 'ack'; reqId: string; ok: true; data?: unknown }
  | { type: 'ack'; reqId: string; ok: false; error: string }
  | { type: 'reward'; points: number; xp: number; levelUp?: number; unlocked?: string[]; achievements?: string[]; title: string }
  | { type: 'toast'; text: string; emoji?: string; tone?: 'info' | 'success' | 'warn' }
  | { type: 'kicked'; reason: string }
  | { type: 'pong'; t: number; serverTime: number };
