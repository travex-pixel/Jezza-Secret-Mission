// The authoritative game engine. Pure logic, no I/O: the Node server wraps it
// with WebSockets + persistence; the browser demo mode runs it locally for
// offline previews and practice battles (which never award real points).
import type { Spotlight,
  Battle, BattleAction, Claim, TapQuality, ClientMessage, CreatureId, Equipped, FeedEvent, HostAction, HostView,
  MissionAssignment, PartyPublic, Phase, PlayerPrivate, PlayerPublic, ServerMessage, WitnessRequest,
  Raid, Reaction, WallPost, CellarEntry, GalleryPhoto, PhotoMode, AwayEvent, Keepsake, Epic, RewardCode, Giveaway,
} from './types';
import { EPIC_CUSTOM_ITEM, EPIC_MAX_CREW, EPIC_PRESET_BY_ID, EPIC_TIERS, isEpicTier } from './epics';
import { drinkEmoji } from './drinks';
import { OLY_UNITS, placeAwards, type OlyEvent, type OlyUnit } from './olympics';
import { RUN_ACTIONS, nextItem, type RunItem } from './runsheet';
import { TEAM_LOOKS, snakeDraft, teamScore, type TeamsState } from './teams';
import { ROWDY_KINDS, ROWDY_PROMPTS, ROWDY_VOTE_POINTS, type RowdyKind, type RowdyPublic, type RowdyState } from './rowdy';
import { DROP_EVERY, MOLE_MAX, MOLE_MISSIONS, MOLE_POINTS, molesFor, QUESTS_PER_DAY, QUEST_BY_ID, QUEST_DEFS, RARITIES, RARITY, questProgress, rollDrop, type Drop, type MoleState, type Quest, type Rarity } from './saturday';
import { CREATURES, CREATURE_IDS, FORMS, GROOM_CREATURE, starterTrio } from './creatures';
import { MISSIONS, MISSION_BY_ID, STARTER_MISSION, TUTORIAL_MISSIONS, TUTORIAL_IDS, GROUP_MISSIONS, missionAvailableInPhase, rookieLeft, type Mission } from './missions';
import {
  ACHIEVEMENTS, COSMETIC_BY_ID, STARTER_COSMETICS, colorwaysUnlocked, computeAwards, cosmeticsForLevel, levelForXp, titleForLevel,
  xpCapFor, stageForLevel, eloUpdate, START_RATING, sortLeaderboard,
} from './progression';
import { isClean, validateCreatureName, validateNickname } from './names';
import {
  BATTLE_REWARDS, CHALLENGE_TTL_MS, MAX_SCORED_VS_SAME_OPPONENT, PLAN_SECONDS, ROUND_SECONDS, TAP_BAR_MS, TAP_MIN_MS, autoPick, cleanPower, powerMult, qualityFor, finish, isPlan, makeCreatureState, redactBattle, resolveRound, type GamePlan,
} from './battle';
import {
  BOSSES, RAID_DURATION_MS, RAID_HIT_COOLDOWN_MS, RAID_HP_PER_PLAYER, RAID_MISSION_DMG_MULT, RAID_MVP_POINTS, RAID_REWARD, RAID_THRESHOLD,
} from './raid';

export interface PlayerState extends PlayerPublic {
  hand: MissionAssignment[];
  completedMissionIds: string[];
  rerollsLeft: number;
  scoredBattlesVs: Record<string, number>;
  missedRounds: number;
  lastHonourClaimAt: number;
  flagged: string[];
  rerollRefillAt: number;
  away: AwayEvent[];       // auto-battle results waiting for the player to look
  lastAutoAt: number;      // when this avatar last auto-battled
  recentAuto: string[];    // last few auto-battle opponents (avoid repeats)
  codeTries: number[];     // recent wrong reward-code guesses (rate limit)
  drops: Drop[];           // Lucky Drops (unopened first, opened ones kept a while for the keepsake)
  quests: Quest[];         // today's quests
  lastTauntAt: number;
  morningDrop: Phase | null; // which day's wake-up drop this lad has had
  welcomeDrop: boolean;      // had the Fresh Legs welcome drop
  realMissions: number;      // non-tutorial challenges approved, never lowered (drives Lucky Drops)
  creatureBefore?: CreatureId; // the groom's creature before it became the Golden Stag (given back if the host moves the title)
}

export interface PartyState {
  code: string;
  name: string;
  hostId: string;
  phase: Phase;
  missionsOpen: boolean;
  createdAt: number;
  players: Record<string, PlayerState>;
  feed: FeedEvent[];
  claims: Record<string, Claim>;
  revealedGroupMissions: string[];
  battles: Record<string, Battle>;
  awardOverrides: Record<string, string | null>;
  finalized: boolean;
  fridayPoints: Record<string, number> | null;
  seq: number;
  hostPinHash?: string;
  pinAttempts?: { playerId: string; at: number }[];
  groomId: string | null;
  autoSaturdayAt: number | null;
  nextGroupAt: number | null;
  raids: Raid[];
  wall: WallPost[];
  cellar: CellarEntry[];
  phaseMissions: { friday: number; saturday: number };
  photoMode: PhotoMode;
  nextAutoAt: number | null;
  epics: Epic[];
  codes: RewardCode[];
  giveaways: Giveaway[];
  log: FeedEvent[];      // every feed line of the weekend (the feed itself keeps only the latest few)
  xpBoostUntil: number | null;
  capLifted: boolean;
  mole: MoleState | null;
  spotlight: Spotlight | null;
  ceremony: number;
  tvMode: 'auto' | 'reel';
  rowdy: RowdyState | null;
  lastScore: { playerId: string; points: number; reason: string; by: string; at: number } | null;
  olympics: { current: OlyEvent | null; done: { id: string; name: string; unit: OlyUnit; winnerId?: string; lockedAt: number }[] };
  runSheet: RunItem[];
  teams: TeamsState | null;
  rowdyUsed: Partial<Record<RowdyKind, string[]>>;
}

export interface EngineState {
  parties: Record<string, PartyState>;
  playerParty: Record<string, string>;
  identities: Record<string, { secret: string; createdAt: number }>;
}

export interface Outbound { to: string | 'party'; msg: ServerMessage }
export interface HandleResult {
  ack?: { ok: true; data?: unknown } | { ok: false; error: string };
  changed: boolean;       // party state changed → rebroadcast views
  direct: Outbound[];     // targeted messages (rewards, toasts, kicks)
  partyCode?: string;
}

export interface EngineOptions {
  now?: () => number;
  rng?: () => number;
  storePhoto?: (dataUrl: string, partyCode: string) => string | null; // returns URL
  deletePhotos?: (urls: string[]) => void;
  codeLength?: number;
  build?: string; // shown to the host so they can tell which version is live
}

const HAND_SIZE = 3;
const PIN_RE = /^\d{4,6}$/;
const PIN_WINDOW_MS = 10 * 60_000;
const PIN_MAX_PER_PLAYER = 5;   // wrong guesses per player per 10 min
const PIN_MAX_PER_PARTY = 15;   // wrong guesses across the whole party per 10 min

/** Salted, iterated FNV-1a. A 4-6 digit PIN can't be made truly secret; this just avoids storing it in plain text. */
export function hashPin(code: string, pin: string): string {
  let h = 2166136261 >>> 0;
  const input = `jezza:${code}:${pin}`;
  for (let r = 0; r < 2000; r++) {
    for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= r; h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}
export const HONOUR_COOLDOWN_MS = 8 * 60_000;   // one "I did it" per player per 8 minutes
export const FLAGS_TO_DISPUTE = 2;              // distinct mates calling BS before points freeze
const FLAG_WINDOW_MS = 45 * 60_000;             // BS can be called within 45 min of a completion
const REROLLS_PER_PHASE = 3;                    // swap tokens held at most
const REROLL_REFILL_MS = 20 * 60_000;           // one swap token back every 20 minutes
const WITNESS_RENUDGE_MS = 2 * 60_000;          // ask someone else if your witness hasn't answered in 2 min
const DISPUTE_TIMEOUT_MS = 30 * 60_000;         // a BS call nobody backs is struck out after 30 min
const HAND_EXPIRE_MS = 2 * 3600_000;            // untouched challenges rotate out after 2 hours
const GROUP_EVERY_MS = 40 * 60_000;             // a new group challenge goes live every 40 minutes
const FIRST_GROUP_DELAY_MS = 20 * 60_000;
export const FRESH_LEGS = 6;                    // Saturday arrivals: double points on their first 6 challenges
export const LATE_ARRIVAL_BELOW = 3;            // when Saturday starts, anyone with fewer real challenges done than this gets the catch-up too
const VARIETY_BONUS = 5;                        // first challenge in a new category
export const WALL_PER_PHASE = 5;
const PHOTO_VOTES_NEEDED = 2;                   // 👍 or 👎 from two mates settles a photo
const PHOTO_VOTE_TIMEOUT_MS = 20 * 60_000;      // unsettled votes resolve after 20 min (ties go to the snapper)
const PHOTO_HOST_TIMEOUT_MS = 45 * 60_000;      // a photo the host never looks at is approved after 45 min
// Auto-battles: every avatar fights roughly once per AUTO_TARGET_MS, whether its owner is online or not.
const AUTO_TARGET_MS = 45 * 60_000;
const FIRST_AUTO_DELAY_MS = 10 * 60_000;
const AUTO_MAX_CATCHUP = 8;                     // most auto-battles resolved in one go after the server was asleep
const AUTO_AVOID_RECENT = 3;                    // don't rematch any of your last 3 auto opponents if there's anyone else
const AUTO_NEAR_RATING = 60;
export const AUTO_REWARDS = { win: { points: 0, xp: 15 }, lose: { points: 0, xp: 8 } }; // XP + rating only, never weekend points
const UPSET_GAP = 40;                           // losing to someone rated this much lower counts as a choke
const AWAY_LIMIT = 20;
const CODE_WINDOW_MS = 10 * 60_000;            // wrong reward-code guesses: 6 per 10 minutes
const CODE_MAX_TRIES = 6;
export const GIVEAWAY_MAX_QTY = 30;
export const EXPORT_TOKEN_MS = 15 * 60_000;
export const MAX_AVATAR_CHARS = 80_000; // a 160px face is ~10 KB; anything near this is not a thumbnail
const CELLAR_REWARDED_PER_PHASE = 3;

/** Next Saturday 5:00am in Sydney after `from` (the party goes to Saturday on its own then). */
export function nextSaturdayMorning(from: number): number {
  const fmt = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
  let t = from - (from % 3600_000) + 3600_000;
  for (let i = 0; i < 24 * 9; i++, t += 3600_000) {
    const parts = fmt.formatToParts(new Date(t));
    const wd = parts.find((x) => x.type === 'weekday')?.value; const hr = Number(parts.find((x) => x.type === 'hour')?.value);
    if (wd === 'Sat' && hr === 5) return t;
  }
  return from + 7 * 86400_000;
}
const isJezza = (nick: string) => nick.toLowerCase().replace(/[^a-z]/g, '').includes('jezza');
const FEED_LIMIT = 60;
const RAID_WEAK_MS = 25_000;
const TAUNT_GAP_MS = 2500;
const COMEBACK_BELOW = 0.6, COMEBACK_UNTIL = 0.8, COMEBACK_MIN_LEAD = 200;
const TAUNTS = ['😂', '🔥', '😴', '💪', '👀', '🫡', '🤡', '🍻'];
const FREE_PHOTO_GAP_MS = 3 * 60_000;   // photo drops per lad
const LOG_LIMIT = 5000;   // the keepsake's full weekend record
const MAX_PHOTO_CHARS = 1_400_000; // ~1MB jpeg as base64 (phones send ~1600px, usually 250-500KB)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class Engine {
  state: EngineState;
  private now: () => number;
  private rng: () => number;
  private storePhoto: (dataUrl: string, partyCode: string) => string | null;
  private deletePhotos: (urls: string[]) => void;
  private codeLength: number;
  private build: string;
  private exportTokens = new Map<string, { code: string; exp: number }>();

  constructor(opts: EngineOptions = {}, state?: EngineState) {
    this.now = opts.now ?? (() => Date.now());
    this.rng = opts.rng ?? Math.random;
    this.storePhoto = opts.storePhoto ?? ((d) => d);
    this.deletePhotos = opts.deletePhotos ?? (() => undefined);
    this.codeLength = opts.codeLength ?? 4;
    this.build = opts.build ?? 'dev';
    this.state = state ?? { parties: {}, playerParty: {}, identities: {} };
    this.migrate();
  }

  /** Fill in fields added after a party was saved, so an older state.json keeps working. */
  private migrate() {
    for (const party of Object.values(this.state.parties)) {
      party.groomId ??= Object.values(party.players).find((p) => isJezza(p.nickname))?.id ?? null;
      this.crownGroom(party); // a groom who adopted before the Golden Stag existed gets it now
      party.autoSaturdayAt ??= party.phase === 'friday' || party.phase === 'lobby' ? nextSaturdayMorning(party.createdAt) : null;
      party.nextGroupAt ??= null;
      party.raids ??= []; party.wall ??= []; party.cellar ??= [];
      party.phaseMissions ??= { friday: 0, saturday: 0 };
      party.photoMode ??= 'vote';
      party.epics ??= []; party.codes ??= []; party.giveaways ??= []; party.log ??= [...party.feed]; party.xpBoostUntil ??= null; party.capLifted ??= false; party.mole ??= null; party.spotlight ??= null; party.ceremony ??= 0; party.tvMode ??= 'auto'; party.rowdy ??= null; party.rowdyUsed ??= {}; party.lastScore ??= null; party.olympics ??= { current: null, done: [] }; party.runSheet ??= []; party.teams ??= null;
      for (const e of party.epics) { e.tier ??= 'medium'; e.points ??= EPIC_TIERS[e.tier].points; e.xp ??= EPIC_TIERS[e.tier].xp; }
      for (const b of Object.values(party.battles)) if (b.status === 'active' && !b.quick && !b.auto) { b.quick = true; b.roundDeadline = Math.min(b.roundDeadline ?? Infinity, this.now() + PLAN_SECONDS * 1000); }
      party.nextAutoAt ??= this.now() + FIRST_AUTO_DELAY_MS;
      for (const p of Object.values(party.players)) {
        p.rating ??= START_RATING; p.streak ??= 0; p.bestStreak ??= 0; p.bounties ??= 0;
        p.laughs ??= 0; p.fires ??= 0; p.groomLoves ??= 0; p.wallVotes ??= 0; p.cellarCount ??= 0; p.cellarFires ??= 0;
        p.raidDamage ??= 0; p.raidsJoined ??= 0; p.lowKey ??= false; p.freshLegs ??= 0; p.joinedPhase ??= 'friday'; p.catchUp ??= p.joinedPhase === 'saturday';
        p.rerollRefillAt ??= 0;
        p.h2h ??= {}; p.upsetLosses ??= 0; p.reactionsGiven ??= 0; p.autoBattles ??= true;
        p.away ??= []; p.lastAutoAt ??= 0; p.recentAuto ??= []; p.epicsDone ??= 0; p.codeTries ??= [];
        p.drops ??= []; p.quests ??= []; p.lastTauntAt ??= 0; p.comeback ??= false; p.morningDrop ??= null; p.isScorer ??= false; p.olympics ??= 0;
        p.welcomeDrop ??= p.drops.some((d) => d.source === 'gift');
        p.realMissions ??= (p.completedMissionIds ?? []).filter((id) => !MISSION_BY_ID[id]?.tutorial).length;
        p.fairWins ??= p.wins; p.fairFights ??= p.wins + p.losses;
        // Starter kit added after the save: back-fill it (a set, so running this again changes nothing)
        if (p.creature) p.unlocked = unique([...p.unlocked, ...cosmeticsForLevel(1)]);
        // Challenges retired (or missing) since the save leave the hand; anything already sent for checking finishes as normal.
        const keep = (p.hand ?? []).filter((h) => h.status !== 'active' || (MISSION_BY_ID[h.missionId] && !MISSION_BY_ID[h.missionId].retired));
        if (keep.length !== (p.hand ?? []).length) { p.hand = keep; if (p.creature) this.refillHand(party, p); }
      }
      const legacy = party.mole as unknown as { playerId?: string; missions?: { text: string; done: boolean }[]; votes?: Record<string, string | string[]>; caught?: boolean } | null;
      if (legacy?.playerId) { // saves from the single-Mole version
        party.mole = { ...party.mole!, moles: [{ playerId: legacy.playerId, missions: legacy.missions ?? [] }], votes: Object.fromEntries(Object.entries(legacy.votes ?? {}).map(([v, x]) => [v, Array.isArray(x) ? x : [x]])), caught: party.mole!.revealed ? { [legacy.playerId]: !!legacy.caught } : undefined };
        delete (party.mole as unknown as Record<string, unknown>).playerId; delete (party.mole as unknown as Record<string, unknown>).missions;
      }
      if (party.phase === 'saturday') { for (const p of Object.values(party.players)) if (p.creature && !p.removed && !p.quests.length) this.assignQuests(party, p); if (!party.mole) this.assignMole(party, undefined, []); }
    }
  }

  // ---------- identity ----------
  /** Returns true if this playerId/secret pair is valid (registers new ids). */
  auth(playerId: string, secret: string): boolean {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(playerId) || typeof secret !== 'string' || secret.length < 8) return false;
    const id = this.state.identities[playerId];
    if (!id) { this.state.identities[playerId] = { secret, createdAt: this.now() }; return true; }
    return id.secret === secret;
  }

  partyOf(playerId: string): PartyState | undefined {
    const code = this.state.playerParty[playerId];
    return code ? this.state.parties[code] : undefined;
  }

  setOnline(playerId: string, online: boolean): string | undefined {
    const party = this.partyOf(playerId);
    const p = party?.players[playerId];
    if (!party || !p) return undefined;
    p.online = online;
    p.lastSeen = this.now();
    if (online) this.morningDrop(party, p);
    return party.code;
  }

  /** The wake-up chest: the first time a lad opens the game on Saturday there's a rare drop waiting, and it always holds an item. */
  private morningDrop(party: PartyState, p: PlayerState): boolean {
    if (party.phase !== 'saturday' || !p.creature || p.removed || p.morningDrop === party.phase) return false;
    p.morningDrop = party.phase;
    this.addDrop(party, p, 'morning', 'rare', [], { item: true });
    return true;
  }

  // ---------- views ----------
  publicView(party: PartyState, viewerId?: string): PartyPublic {
    const now = this.now();
    const players = Object.values(party.players).filter((p) => !p.removed).map(toPublic);
    const battles = Object.values(party.battles)
      .filter((b) => b.status === 'challenge' || b.status === 'active' || (b.finishedAt && now - b.finishedAt < 30 * 60_000))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((b) => (viewerId ? redactBattle(b, viewerId) : redactBattle(b, '')));
    const eventByClaim = new Map(party.feed.filter((f) => f.claimId).map((f) => [f.claimId!, f.id]));
    const gallery: GalleryPhoto[] = [
      ...Object.values(party.claims).filter((c) => c.photoUrl && (c.status === 'approved' || c.status === 'disputed'))
        .map((c) => ({ id: c.id, url: c.photoUrl!, at: c.resolvedAt ?? c.createdAt, playerId: c.playerId, caption: MISSION_BY_ID[c.missionId]?.secret ? 'A sneaky one' : MISSION_BY_ID[c.missionId]?.title ?? 'Challenge', note: MISSION_BY_ID[c.missionId]?.secret ? undefined : c.note, source: 'mission' as const, eventId: eventByClaim.get(c.id) })),
      ...party.cellar.filter((e) => e.photoUrl).map((e) => ({ id: e.id, url: e.photoUrl!, at: e.at, playerId: e.playerId, caption: e.drink, source: 'cellar' as const })),
    ].sort((a, b) => b.at - a.at).slice(0, 400); // the whole weekend, not just the latest few
    return {
      code: party.code,
      name: party.name,
      hostId: party.hostId,
      phase: party.phase,
      missionsOpen: party.missionsOpen,
      createdAt: party.createdAt,
      players,
      feed: party.feed.slice(-40),
      revealedGroupMissions: party.revealedGroupMissions,
      battles,
      pendingApprovals: Object.values(party.claims).filter(needsHost).length + this.takedowns(party).length,
      awards: computeAwards(players, Object.values(party.battles), party.awardOverrides),
      finalized: party.finalized,
      spotlight: party.spotlight,
      ceremony: party.ceremony,
      tvMode: party.tvMode,
      rowdy: this.rowdyPublic(party),
      lastScore: party.lastScore,
      olympics: party.olympics,
      runSheet: party.runSheet,
      teams: party.teams ? { createdAt: party.teams.createdAt, label: party.teams.label, teams: party.teams.teams.map((t) => ({ ...t, ...teamScore(t, players, party.teams!.baseline) })) } : null,
      build: this.build,
      hasHostPin: !!party.hostPinHash,
      groomId: party.groomId,
      raid: party.raids[party.raids.length - 1] ?? null,
      raidsDone: party.raids.map((r) => r.phase),
      wall: party.wall.filter((w) => !w.hidden).slice(-40),
      cellar: party.cellar.slice(-30),
      gallery,
      photoMode: party.photoMode,
      epics: party.epics.filter((e) => e.status === 'open' || (e.status === 'done' && now - (e.doneAt ?? 0) < 3 * 3600_000)).slice(-20),
      pendingPhotos: Object.values(party.claims).filter((c) => c.status === 'pending' && c.review === 'vote' && c.photoUrl)
        .map((c) => ({ claimId: c.id, playerId: c.playerId, missionId: c.missionId, url: c.photoUrl!, at: c.createdAt, up: c.votesUp ?? [], down: c.votesDown ?? [] })),
      xpBoostUntil: party.xpBoostUntil && party.xpBoostUntil > now ? party.xpBoostUntil : null,
      capLifted: party.capLifted,
      mole: party.mole ? { active: true, voting: !party.mole.revealed, votes: Object.keys(party.mole.votes).length, count: party.mole.moles.length, revealed: party.mole.revealed ? { moles: party.mole.moles.map((m) => ({ playerId: m.playerId, caught: !!party.mole!.caught?.[m.playerId] })), correct: Object.entries(party.mole.votes).filter(([, s]) => s.some((x) => party.mole!.moles.some((m) => m.playerId === x))).map(([v]) => v) } : undefined } : null,
      giveaways: party.giveaways.filter((g) => g.status === 'active' || now - (g.closedAt ?? 0) < 2 * 3600_000).slice(-10),
      autoSaturdayAt: party.autoSaturdayAt,
      nextGroupAt: party.nextGroupAt,
      phaseMissions: party.phaseMissions,
      serverTime: now,
    };
  }

  privateView(party: PartyState, playerId: string): PlayerPrivate | null {
    const p = party.players[playerId];
    if (!p || p.removed) return null;
    const pendingWitness: WitnessRequest[] = Object.values(party.claims)
      .filter((c) => c.status === 'pending' && c.method === 'witness' && c.witnessId === playerId)
      .map((c) => ({ claimId: c.id, fromPlayerId: c.playerId, fromNickname: party.players[c.playerId]?.nickname ?? '?', missionId: c.missionId, createdAt: c.createdAt }));
    return {
      hand: p.hand,
      completedMissionIds: p.completedMissionIds,
      rerollsLeft: p.rerollsLeft,
      rerollRefillAt: p.rerollsLeft >= REROLLS_PER_PHASE ? 0 : p.rerollRefillAt,
      pendingWitness,
      honourCooldownUntil: (p.lastHonourClaimAt ?? 0) + HONOUR_COOLDOWN_MS,
      scoredVs: p.scoredBattlesVs,
      drops: p.drops.filter((d) => !d.opened),
      quests: p.quests.map((q) => ({ ...q, progress: questProgress(q, p) })),
      mole: party.mole && !party.mole.revealed ? (() => { const m = party.mole!.moles.find((x) => x.playerId === playerId); return m ? { missions: m.missions } : undefined; })() : undefined,
      moleVotes: party.mole?.votes[playerId] ?? [],
      rowdyVote: party.rowdy?.votes[playerId],
      moleHost: party.mole && !party.mole.revealed && party.hostId === playerId ? party.mole.moles.map((m) => ({ playerId: m.playerId, done: m.missions.filter((x) => x.done).length, total: m.missions.length })) : undefined,
      flagged: p.flagged ?? [],
      away: p.away,
      awayBattles: unique(p.away.map((e) => e.battleId)).map((id) => party.battles[id]).filter(Boolean).map((b) => redactBattle(b, playerId)),
      secret: '',
    };
  }

  hostView(party: PartyState): HostView {
    return { approvals: Object.values(party.claims).filter((c) => needsHost(c) || (c.status === 'pending' && c.review === 'vote')).sort((a, b) => a.createdAt - b.createdAt), takedowns: this.takedowns(party), codes: party.codes };
  }

  private takedowns(party: PartyState): HostView['takedowns'] {
    return [
      ...Object.values(party.claims).filter((c) => c.photoUrl && c.takedown?.by.length).map((c) => ({ photoId: c.id, url: c.photoUrl!, ownerId: c.playerId, caption: MISSION_BY_ID[c.missionId]?.title ?? 'Challenge', by: c.takedown!.by, at: c.takedown!.at })),
      ...party.cellar.filter((e) => e.photoUrl && e.takedown?.by.length).map((e) => ({ photoId: e.id, url: e.photoUrl!, ownerId: e.playerId, caption: e.drink, by: e.takedown!.by, at: e.takedown!.at })),
    ].sort((a, b) => a.at - b.at);
  }

  // ---------- main dispatcher ----------
  handle(playerId: string, msg: ClientMessage): HandleResult {
    const res = this.handleInner(playerId, msg);
    // Quests count whatever just happened (a win, a photo, a reaction) the moment it lands
    const party = res.ack?.ok ? this.partyOf(playerId) : undefined;
    const p = party?.players[playerId];
    if (party && p && p.quests.length && msg.type !== 'openDrop') { try { const n = res.direct.length; this.checkQuests(party, p, res.direct); if (res.direct.length !== n) res.changed = true; } catch (e) { console.error('[engine] quest check failed', e); } }
    return res;
  }

  private handleInner(playerId: string, msg: ClientMessage): HandleResult {
    const res: HandleResult = { changed: false, direct: [] };
    try {
      switch (msg.type) {
        case 'createParty': return this.createParty(playerId, msg.nickname, msg.partyName, msg.hostPin);
        case 'claimHost': return this.claimHost(playerId, msg.pin);
        case 'joinParty': return this.joinParty(playerId, msg.code, msg.nickname);
        case 'leaveParty': return this.leaveParty(playerId);
        case 'chooseCreature': return this.chooseCreature(playerId, msg.creature, msg.creatureName);
        case 'renameCreature': return this.renameCreature(playerId, msg.creatureName);
        case 'equip': return this.equip(playerId, msg.equipped);
        case 'claimMission': return this.claimMission(playerId, msg.missionId, msg.claimId, msg.photo, msg.witnessId, msg.note, msg.avatar);
        case 'rerollMission': return this.rerollMission(playerId, msg.missionId);
        case 'confirmWitness': return this.confirmWitness(playerId, msg.claimId, msg.approve);
        case 'challenge': return this.challenge(playerId, msg.opponentId);
        case 'respondChallenge': return this.respondChallenge(playerId, msg.battleId, msg.accept);
        case 'battleAction': return this.battleAction(playerId, msg.battleId, msg.round, msg.action, msg.tap);
        case 'battlePlan': return this.battlePlan(playerId, msg.battleId, msg.plan, msg.tap, msg.power);
        case 'flagClaim': return this.flagClaim(playerId, msg.claimId);
        case 'backClaim': return this.backClaim(playerId, msg.claimId);
        case 'react': return this.react(playerId, msg.eventId, msg.emoji);
        case 'wallPost': return this.wallPost(playerId, msg.kind, msg.text);
        case 'wallVote': return this.wallVote(playerId, msg.postId);
        case 'wallHide': return this.wallHide(playerId, msg.postId);
        case 'cellarAdd': return this.cellarAdd(playerId, msg.drink, msg.stars, msg.note, msg.photo);
        case 'cellarFire': return this.cellarFire(playerId, msg.entryId);
        case 'raidHit': return this.raidHit(playerId, msg.raidId, msg.tap, msg.power);
        case 'setPrefs': return this.setPrefs(playerId, !!msg.lowKey);
        case 'deletePhoto': return this.deletePhoto(playerId, msg.photoId);
        case 'votePhoto': return this.votePhoto(playerId, msg.claimId, !!msg.up);
        case 'ackAway': return this.ackAway(playerId);
        case 'setAutoBattles': return this.setAutoBattles(playerId, !!msg.on);
        case 'joinEpic': return this.joinEpic(playerId, msg.epicId);
        case 'redeemCode': return this.redeemCode(playerId, msg.code);
        case 'claimGiveaway': return this.claimGiveaway(playerId, msg.giveawayId);
        case 'openDrop': return this.openDrop(playerId, msg.dropId);
        case 'moleDone': return this.moleDone(playerId, msg.index);
        case 'moleVote': return this.moleVote(playerId, msg.suspectId);
        case 'rowdyVote': return this.rowdyVote(playerId, msg.targetId);
        case 'scorerGrant': return this.scorerGrant(playerId, msg.playerId, msg.points, msg.reason);
        case 'olyStart': return this.olyStart(playerId, msg.name, msg.unit);
        case 'olyResult': return this.olyResult(playerId, msg.playerId, msg.value);
        case 'olyTimer': return this.olyTimer(playerId, msg.playerId);
        case 'olyLock': return this.olyLock(playerId);
        case 'olyScrap': return this.olyScrap(playerId);
        case 'taunt': return this.taunt(playerId, msg.battleId, msg.emoji);
        case 'leaveEpic': return this.leaveEpic(playerId, msg.epicId);
        case 'finishEpic': return this.finishEpic(playerId, msg.epicId);
        case 'surrender': return this.surrender(playerId, msg.battleId);
        case 'host': return this.hostAction(playerId, msg.action);
        default: res.ack = { ok: false, error: 'Unknown message.' }; return res;
      }
    } catch (e) {
      res.ack = { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' };
      return res;
    }
  }

  // ---------- party lifecycle ----------
  private fail(error: string): HandleResult { return { ack: { ok: false, error }, changed: false, direct: [] }; }
  private ok(party: PartyState | undefined, data?: unknown, direct: Outbound[] = []): HandleResult {
    if (party) party.seq++;
    return { ack: { ok: true, data }, changed: true, direct, partyCode: party?.code };
  }

  private newCode(): string {
    for (let i = 0; i < 50; i++) {
      let c = '';
      for (let j = 0; j < this.codeLength; j++) c += CODE_ALPHABET[Math.floor(this.rng() * CODE_ALPHABET.length)];
      if (!this.state.parties[c]) return c;
    }
    return 'P' + Math.floor(this.rng() * 1e6).toString(36).toUpperCase();
  }

  private createParty(playerId: string, nickname: string, partyName?: string, hostPin?: string): HandleResult {
    const v = validateNickname(nickname ?? '');
    if (!v.ok) return this.fail(v.error);
    const pin = (hostPin ?? '').trim();
    if (pin && !PIN_RE.test(pin)) return this.fail('Host PIN must be 4 to 6 digits.');
    if (this.partyOf(playerId)) this.leaveParty(playerId);
    const now = this.now();
    const code = this.newCode();
    const party: PartyState = {
      code, name: (partyName ?? '').trim().slice(0, 40) || "Jezza's Bucks Weekend", hostId: playerId, phase: 'friday', missionsOpen: true,
      createdAt: now, players: {}, feed: [], claims: {}, revealedGroupMissions: [], battles: {}, awardOverrides: {}, finalized: false, fridayPoints: null, seq: 0,
      groomId: isJezza(v.name) ? playerId : null, autoSaturdayAt: nextSaturdayMorning(now), nextGroupAt: now + FIRST_GROUP_DELAY_MS,
      raids: [], wall: [], cellar: [], phaseMissions: { friday: 0, saturday: 0 }, photoMode: 'vote', nextAutoAt: now + FIRST_AUTO_DELAY_MS, epics: [], codes: [], giveaways: [], log: [], xpBoostUntil: null, capLifted: false, mole: null, spotlight: null, ceremony: 0, tvMode: 'auto', rowdy: null, rowdyUsed: {}, lastScore: null, olympics: { current: null, done: [] }, runSheet: [], teams: null,
    };
    party.players[playerId] = newPlayer(playerId, v.name, now, true, 'friday');
    if (pin) party.hostPinHash = hashPin(code, pin);
    this.state.parties[code] = party;
    this.state.playerParty[playerId] = code;
    this.feed(party, { kind: 'join', text: `${v.name} opened the cellar door. The party begins.`, playerId, emoji: '🍷' });
    return this.ok(party, { code });
  }

  private claimHost(playerId: string, pinRaw: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join the party first, then claim host.');
    if (party.hostId === playerId) return this.fail('You are already the host.');
    if (!party.hostPinHash) return this.fail('This party has no host PIN. The current host can set one in Host → Event.');
    const now = this.now();
    party.pinAttempts = (party.pinAttempts ?? []).filter((a) => now - a.at < PIN_WINDOW_MS);
    const mine = party.pinAttempts.filter((a) => a.playerId === playerId);
    if (mine.length >= PIN_MAX_PER_PLAYER || party.pinAttempts.length >= PIN_MAX_PER_PARTY) {
      const oldest = (mine.length >= PIN_MAX_PER_PLAYER ? mine : party.pinAttempts)[0].at;
      return this.fail(`Too many wrong PINs. Try again in ${Math.max(1, Math.ceil((oldest + PIN_WINDOW_MS - now) / 60000))} min.`);
    }
    const pin = String(pinRaw ?? '').trim();
    if (!PIN_RE.test(pin) || hashPin(party.code, pin) !== party.hostPinHash) {
      party.pinAttempts.push({ playerId, at: now });
      party.seq++;
      return { ack: { ok: false, error: 'Wrong PIN.' }, changed: true, partyCode: party.code, direct: [{ to: party.hostId, msg: { type: 'toast', text: `${p.nickname} just tried the host PIN and got it wrong. 👀`, emoji: '🔐', tone: 'warn' } }] };
    }
    const old = party.players[party.hostId];
    if (old) old.isHost = false;
    p.isHost = true; party.hostId = playerId;
    party.pinAttempts = party.pinAttempts.filter((a) => a.playerId !== playerId);
    this.feed(party, { kind: 'host', text: `Host powers moved to ${p.nickname}'s phone (PIN verified).`, emoji: '🔑' });
    const direct: Outbound[] = [{ to: playerId, msg: { type: 'toast', text: 'You are now the host.', emoji: '🔑', tone: 'success' } }];
    if (old) direct.push({ to: old.id, msg: { type: 'toast', text: `${p.nickname} took over as host with the PIN.`, emoji: '🔑', tone: 'warn' } });
    return this.ok(party, undefined, direct);
  }

  private joinParty(playerId: string, codeRaw: string, nickname: string): HandleResult {
    const code = (codeRaw ?? '').trim().toUpperCase();
    const party = this.state.parties[code];
    if (!party) return this.fail('No party with that code. Check it with the host.');
    const existing = party.players[playerId];
    if (existing?.removed) return this.fail('The host removed you from this party.');
    const others = Object.values(party.players).filter((p) => p.id !== playerId && !p.removed).map((p) => p.nickname);
    const v = validateNickname(nickname ?? '', others);
    if (!v.ok) return this.fail(v.error);
    const current = this.partyOf(playerId);
    if (current && current.code !== code) this.leaveParty(playerId);
    const now = this.now();
    if (existing) {
      existing.nickname = v.name; existing.online = true; existing.lastSeen = now;
    } else {
      const active = Object.values(party.players).filter((p) => !p.removed).length;
      if (active >= 40) return this.fail('This party is full (40 legends max).');
      const np = newPlayer(playerId, v.name, now, false, party.phase);
      if (party.phase === 'saturday') { np.freshLegs = FRESH_LEGS; np.catchUp = true; }
      party.players[playerId] = np;
      if (!party.groomId && isJezza(v.name)) party.groomId = playerId;
      this.feed(party, { kind: 'join', text: party.phase === 'saturday' ? `${v.name} rocked up for Saturday. Fresh legs: double points on their first ${FRESH_LEGS} challenges.` : `${v.name} wandered into the vineyard.`, playerId, emoji: '🍇' });
    }
    this.state.playerParty[playerId] = code;
    return this.ok(party, { code });
  }

  private leaveParty(playerId: string): HandleResult {
    const party = this.partyOf(playerId);
    if (!party) return this.fail('You are not in a party.');
    const p = party.players[playerId];
    if (p) { p.online = false; }
    // Forfeit any live battle
    for (const b of Object.values(party.battles)) {
      if (b.status === 'active' && (b.a.playerId === playerId || b.b.playerId === playerId)) this.endBattle(party, b, b.a.playerId === playerId ? b.b.playerId : b.a.playerId, playerId, 'disconnect');
      if (b.status === 'challenge' && (b.challengerId === playerId || b.opponentId === playerId)) b.status = 'expired';
    }
    delete this.state.playerParty[playerId];
    return this.ok(party);
  }

  // ---------- creatures ----------
  /** The groom (and only the groom) has the Golden Stag. Moving the title hands the old groom his creature back. */
  crownGroom(party: PartyState) {
    for (const p of Object.values(party.players)) {
      if (p.id === party.groomId || p.creature !== GROOM_CREATURE) continue;
      p.creature = p.creatureBefore ?? starterTrio(p.id)[0];
      p.creatureBefore = undefined;
    }
    const g = party.groomId ? party.players[party.groomId] : undefined;
    if (!g || g.removed || !g.creature || g.creature === GROOM_CREATURE) return;
    const was = g.creature;
    g.creatureBefore = was;
    if (g.creatureName === CREATURES[was].defaultName) g.creatureName = CREATURES[GROOM_CREATURE].defaultName;
    g.creature = GROOM_CREATURE;
    this.feed(party, { kind: 'host', text: `✨ ${g.nickname}'s ${CREATURES[was].name} has transformed into the GOLDEN STAG. The groom's own creature. Bow, lads.`, playerId: g.id, emoji: '🦌' });
  }

  private chooseCreature(playerId: string, creature: CreatureId, creatureName?: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    const isGroom = party.groomId === playerId;
    if (creature === GROOM_CREATURE && !isGroom) return this.fail('The Golden Stag is reserved for the groom.');
    if (!CREATURE_IDS.includes(creature) && creature !== GROOM_CREATURE) return this.fail('Unknown creature.');
    if (p.creature) return this.fail('You already adopted a creature. Loyalty matters.');
    if (isGroom) creature = GROOM_CREATURE; // the groom always gets his own
    const nm = validateCreatureName(creatureName || CREATURES[creature].defaultName);
    if (!nm.ok) return this.fail(nm.error);
    p.creature = creature; p.creatureName = nm.name;
    p.unlocked = unique([...p.unlocked, ...cosmeticsForLevel(1)]);
    p.equipped = { colorway: 0, hat: 'hat_party' };
    if (party.phase === 'saturday' && !p.quests.length) this.assignQuests(party, p);
    // A Saturday joiner is online already (hello came before joinParty), so the wake-up drop and the Fresh Legs welcome
    // drop land here rather than waiting for their next reconnect
    if (party.phase === 'saturday') { this.morningDrop(party, p); if (p.catchUp && !p.welcomeDrop) { p.welcomeDrop = true; this.addDrop(party, p, 'gift', 'rare', []); } }
    p.title = titleForLevel(1);
    // The intro straight away, regardless of phase: your selfie, roast Jezza, toast Jezza. The groom just gets the selfie.
    p.hand = (isGroom ? [STARTER_MISSION] : TUTORIAL_MISSIONS).map((m) => ({ missionId: m.id, assignedAt: this.now(), status: 'active' as const }));
    this.refillHand(party, p);
    this.feed(party, { kind: 'join', text: `${p.nickname} adopted ${nm.name} the ${CREATURES[creature].name}. ${CREATURES[creature].cry}!`, playerId, emoji: '✨' });
    const direct: Outbound[] = [];
    const ach = this.checkAchievements(party, p, direct.filter(() => false)); // award silently: the reveal screen shows the badge
    return this.ok(party, { starterBadge: ach.ids[0] ?? 'first_steps', cosmetic: 'hat_party' });
  }

  private renameCreature(playerId: string, creatureName: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || !p.creature) return this.fail('No creature to rename.');
    const nm = validateCreatureName(creatureName);
    if (!nm.ok) return this.fail(nm.error);
    p.creatureName = nm.name;
    return this.ok(party);
  }

  private equip(playerId: string, eq: Partial<Equipped>): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || !p.creature) return this.fail('No creature to dress.');
    const next: Equipped = { ...p.equipped };
    if (typeof eq.colorway === 'number') {
      const max = colorwaysUnlocked(p.level);
      if (eq.colorway < 0 || eq.colorway >= Math.min(max, CREATURES[p.creature].colorways.length)) return this.fail('That colourway is still locked.');
      next.colorway = eq.colorway;
    }
    for (const slot of ['hat', 'cape', 'aura', 'face', 'pose'] as const) {
      if (!(slot in eq)) continue;
      const id = eq[slot];
      if (id === undefined || id === null || id === '') { delete next[slot]; continue; }
      const c = COSMETIC_BY_ID[id];
      if (!c || c.slot !== slot) return this.fail('Unknown cosmetic.');
      if (!p.unlocked.includes(id)) return this.fail(`${c.name} is still locked.`);
      next[slot] = id;
    }
    p.equipped = next;
    const direct: Outbound[] = [];
    this.checkAchievements(party, p, direct);
    return this.ok(party, undefined, direct);
  }

  // ---------- missions ----------
  private activePhase(party: PartyState): 'friday' | 'saturday' | null {
    return party.phase === 'friday' || party.phase === 'saturday' ? party.phase : null;
  }

  private drawPool(party: PartyState, p: PlayerState): Mission[] {
    const phase = this.activePhase(party) ?? 'friday';
    const inHand = new Set(p.hand.map((h) => h.missionId));
    const secretInHand = p.hand.some((h) => MISSION_BY_ID[h.missionId]?.secret && h.status !== 'done');
    return MISSIONS.filter((m) =>
      m.scope === 'private' && !m.tutorial && !m.retired && m.method !== 'host' && missionAvailableInPhase(m, phase)
      && !inHand.has(m.id) && !p.completedMissionIds.includes(m.id) && !m.free
      && !(m.secret && secretInHand) && !(p.lowKey && m.loud),
    );
  }

  private refillHand(party: PartyState, p: PlayerState, sameDifficultyAs?: number) {
    p.hand = p.hand.filter((h) => h.status !== 'done');
    if (!this.activePhase(party)) return; // only the starter before the event is running
    while (p.hand.length < HAND_SIZE) {
      const pool = this.drawPool(party, p);
      if (!pool.length) break;
      // Prefer categories not already in hand. A swap returns the same difficulty, so swapping never farms easy ones.
      const inHandCats = new Set(p.hand.map((h) => MISSION_BY_ID[h.missionId]?.category));
      const varied = pool.filter((m) => !inHandCats.has(m.category));
      // ...and not the category you've just done, so it never feels like the same challenge twice in a row
      const lastCat = MISSION_BY_ID[p.completedMissionIds[p.completedMissionIds.length - 1]]?.category;
      const fresh = varied.filter((m) => m.category !== lastCat);
      let src = fresh.length ? fresh : varied.length ? varied : pool;
      if (rookieLeft(p.completedMissionIds) > 0) { const easy = src.filter((m) => m.difficulty === 1); if (easy.length) src = easy; }
      // keep a photo one in every hand (the pinned selfie doesn't count): they're quick and they fill the gallery
      if (!p.hand.some((h) => MISSION_BY_ID[h.missionId]?.method === 'photo' && !MISSION_BY_ID[h.missionId]?.tutorial)) { const snaps = src.filter((m) => m.method === 'photo'); if (snaps.length) src = snaps; }
      if (sameDifficultyAs) { const same = src.filter((m) => m.difficulty === sameDifficultyAs); if (same.length) src = same; sameDifficultyAs = undefined; }
      const m = src[Math.floor(this.rng() * src.length)];
      p.hand.push({ missionId: m.id, assignedAt: this.now(), status: 'active' });
    }
  }

  private claimMission(playerId: string, missionId: string, claimId: string, photo?: string, witnessId?: string, note?: string, avatar?: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    if (!p.creature) return this.fail('Adopt a creature before taking challenges.');
    if (!claimId || !/^[A-Za-z0-9_-]{6,64}$/.test(claimId)) return this.fail('Bad claim id.');
    const existing = party.claims[claimId];
    if (existing) {
      if (existing.playerId !== playerId) return this.fail('Bad claim id.');
      return { ack: { ok: true, data: { duplicate: true, status: existing.status } }, changed: false, direct: [] };
    }
    const mission = MISSION_BY_ID[missionId];
    if (!mission) return this.fail('Unknown challenge.');
    if (mission.wall) return this.fail(`Write your ${mission.wall} and it posts to the Jezza Wall.`);
    if (p.completedMissionIds.includes(missionId) && !mission.free) return this.fail('Already done that one. No double dipping.');
    const now = this.now();
    const isGroup = mission.scope === 'group';
    if (mission.free) {
      // the photo drop: not in anyone's hand, as often as you like, with a breather between so the roll isn't one lad's
      const last = Object.values(party.claims).filter((c) => c.playerId === playerId && MISSION_BY_ID[c.missionId]?.free).map((c) => c.createdAt).sort((x, y) => y - x)[0] ?? 0;
      if (now - last < FREE_PHOTO_GAP_MS) return this.fail(`One drop every ${FREE_PHOTO_GAP_MS / 60_000} minutes. Next in ${Math.ceil((last + FREE_PHOTO_GAP_MS - now) / 1000)}s.`);
    } else if (isGroup) {
      if (!party.revealedGroupMissions.includes(missionId)) return this.fail('That group challenge isn\'t live yet.');
    } else {
      const h = p.hand.find((x) => x.missionId === missionId);
      if (!h) return this.fail('That challenge isn\'t in your hand.');
      if (h.status === 'done') return this.fail('Already done.');
      if (h.status === 'pending') {
        const prev = h.claimId ? party.claims[h.claimId] : undefined;
        if (prev && prev.status === 'pending' && prev.method === 'witness' && now - prev.createdAt >= WITNESS_RENUDGE_MS) {
          prev.status = 'rejected'; prev.resolvedAt = now; prev.note = 'Expired: witness never answered';
          h.status = 'active'; h.claimId = undefined;
        } else return this.fail('Already sent. Give them a sec. After two minutes you can ask someone else.');
      }
    }
    if (!mission.starter) {
      if (!this.activePhase(party)) return this.fail('The game is paused in the lobby right now.');
      if (!party.missionsOpen) return this.fail('Challenges are paused for a bit. The host will turn them back on.');
    }
    if (Object.values(party.claims).some((c) => c.playerId === playerId && c.missionId === missionId && c.status === 'pending')) return this.fail('Already sent.');

    const rookie = !isGroup && !mission.tutorial && rookieLeft(p.completedMissionIds) > 0;
    if (mission.method === 'self' && !mission.starter && !isGroup && !rookie) {
      const wait = (p.lastHonourClaimAt ?? 0) + HONOUR_COOLDOWN_MS - now;
      if (wait > 0) return this.fail(`Easy, legend. Next honour-system claim in ${Math.floor(wait / 60000)}:${String(Math.ceil((wait % 60000) / 1000)).padStart(2, '0')}. Photo and mate-confirm ones are still open.`);
    }
    const claim: Claim = { id: claimId, playerId, missionId, method: mission.method, status: 'pending', createdAt: now, group: isGroup, note: (note ?? '').slice(0, 120) || undefined };
    if (claim.note && !isClean(claim.note)) return this.fail('Keep the note clean, legend.');
    if (mission.method === 'photo') {
      if (!photo || typeof photo !== 'string' || !photo.startsWith('data:image/')) return this.fail('This one needs a photo.');
      if (photo.length > MAX_PHOTO_CHARS) return this.fail('Photo too big. Try again, it gets shrunk automatically.');
      const url = this.storePhoto(photo, party.code);
      if (!url) return this.fail('Couldn\'t save the photo. Try again.');
      claim.photoUrl = url;
      // The first selfie doubles as your face in the feed and the lists: a small square the phone cut from it
      if (mission.starter && mission.selfie && typeof avatar === 'string' && avatar.startsWith('data:image/') && avatar.length <= MAX_AVATAR_CHARS) {
        const face = this.storePhoto(avatar, party.code);
        if (face) { if (p.avatarUrl) this.deletePhotos([p.avatarUrl]); p.avatarUrl = face; }
      }
    }
    if (mission.method === 'witness') {
      const w = witnessId ? party.players[witnessId] : undefined;
      if (!w || w.removed || w.id === playerId || !w.creature) return this.fail('Pick a mate who was there.');
      claim.witnessId = witnessId;
    }
    if (mission.method === 'self' && !mission.starter && !isGroup && !rookie) p.lastHonourClaimAt = now;
    party.claims[claimId] = claim;
    const direct: Outbound[] = [];
    const others = Object.values(party.players).filter((x) => !x.removed && x.creature && x.id !== playerId).length;
    if (mission.method === 'photo' && party.photoMode !== 'instant' && others > 0 && !mission.starter && !rookie && !mission.free) { // the selfie and rookie snaps count straight away
      // Photo check: the lads vote it in (or the host approves it). Nobody is ever stuck: it times out in the snapper's favour.
      claim.review = party.photoMode; claim.votesUp = []; claim.votesDown = [];
      if (!isGroup) { const h = p.hand.find((x) => x.missionId === missionId)!; h.status = 'pending'; h.claimId = claimId; }
      if (claim.review === 'vote') {
        this.feed(party, { kind: 'vote', text: `${p.nickname} reckons they nailed "${mission.title}". Legit?`, playerId: p.id, photoUrl: claim.photoUrl, emoji: '🗳️', claimId: claim.id });
        direct.push({ to: 'party', msg: { type: 'toast', text: `${p.nickname} posted a photo. Vote it in 👍 or bin it 👎`, emoji: '🗳️', tone: 'info' } });
      } else direct.push({ to: party.hostId, msg: { type: 'toast', text: `${p.nickname} sent a photo for "${mission.title}". Check your queue.`, emoji: '📥', tone: 'info' } });
    } else if (mission.method === 'self' || mission.method === 'photo') {
      this.approveClaim(party, claim, direct, true); // self-service: points land straight away, mates can call BS
    } else {
      if (!isGroup) { const h = p.hand.find((x) => x.missionId === missionId)!; h.status = 'pending'; h.claimId = claimId; }
      if (mission.method === 'witness') direct.push({ to: witnessId!, msg: { type: 'toast', text: `${p.nickname} reckons you saw "${mission.title}". Check your Missions tab.`, emoji: '👀', tone: 'info' } });
      else direct.push({ to: party.hostId, msg: { type: 'toast', text: `${p.nickname} sent "${mission.title}" to you.`, emoji: '📥', tone: 'info' } });
    }
    return this.ok(party, { status: claim.status }, direct);
  }

  /** `immediate`: the player just did this themselves (tapped I did it, snapped it), so the reward can take over the screen.
   *  Anything that lands later (a mate confirmed, the lads voted, the host upheld) is `quiet`: a toast, never a pop-up mid-task. */
  private approveClaim(party: PartyState, claim: Claim, direct: Outbound[], immediate = false) {
    const p = party.players[claim.playerId];
    const mission = MISSION_BY_ID[claim.missionId];
    if (!p || !mission) return;
    claim.status = 'approved'; claim.resolvedAt = this.now();
    if (mission.free) {
      // a photo drop: a few points and XP, straight into the roll and the feed; not a challenge, so no challenge stats
      const reward = this.grant(party, p, mission.points, mission.xp, direct);
      this.feed(party, { kind: 'mission', text: `${p.nickname} dropped a photo${claim.note ? `: “${claim.note}”` : ''} (+${mission.points})`, playerId: p.id, photoUrl: claim.photoUrl, emoji: '📸', claimId: claim.id, flags: 0 });
      direct.push({ to: p.id, msg: { type: 'reward', points: mission.points, xp: mission.xp, ...reward, title: 'Photo dropped', quiet: !immediate || undefined } });
      return;
    }
    const rookie = !mission.tutorial && mission.scope === 'private' && rookieLeft(p.completedMissionIds) > 0 && !p.catchUp; // Saturday arrivals have Fresh Legs instead
    if (!p.completedMissionIds.includes(mission.id)) p.completedMissionIds.push(mission.id);
    const h = p.hand.find((x) => x.missionId === mission.id);
    if (h) { h.status = 'done'; h.claimId = claim.id; }
    const newCategory = (p.categoryCounts[mission.category] ?? 0) === 0;
    p.missionsCompleted += 1;
    p.categoryCounts[mission.category] = (p.categoryCounts[mission.category] ?? 0) + 1;
    const fresh = p.freshLegs > 0;
    if (fresh) p.freshLegs -= 1;
    this.updateComeback(party); // decided before the points land, so the first boosted challenge counts
    const comeback = p.comeback && !fresh;
    const points = Math.round(mission.points * (fresh ? 2 : comeback ? 1.5 : 1)) + (newCategory ? VARIETY_BONUS : 0);
    const xp = mission.xp * (rookie ? 2 : 1);
    const bonus = [rookie ? '🚀 Rookie boost: double XP' : '', fresh ? '🦵 Fresh Legs: double points' : '', comeback ? '🔥 Comeback: 1.5× points' : '', newCategory ? `+${VARIETY_BONUS} new category` : ''].filter(Boolean).join(' · ') || undefined;
    const reward = this.grant(party, p, points, xp, direct);
    // 5. drops ride a counter that disputes and resets never lower, so the third-challenge line can't be re-crossed
    if (!mission.tutorial) { p.realMissions += 1; if (p.realMissions % DROP_EVERY === 0) this.addDrop(party, p, 'challenge', undefined, direct); }
    this.checkQuests(party, p, direct); // the approver is often someone else; the owner's quest still lands now
    const label = mission.secret ? 'a sneaky one' : `"${mission.title}"`;
    this.feed(party, { kind: 'mission', text: `${p.nickname} did ${label} (+${points})`, playerId: p.id, photoUrl: claim.photoUrl, emoji: mission.secret ? '🕵️' : CATEGORY_EMOJI[mission.category], claimId: claim.id, flags: 0 });
    direct.push({ to: p.id, msg: { type: 'reward', points, xp, ...reward, title: mission.title, bonus, quiet: !immediate || undefined } });
    // Raid + phase progress
    const phase = this.activePhase(party);
    if (phase && !mission.tutorial) party.phaseMissions[phase] += 1;
    const raid = this.liveRaid(party);
    if (raid) this.damageRaid(party, raid, p, mission.points * RAID_MISSION_DMG_MULT, false, 'mission', direct);
    else this.maybeSpawnRaid(party, direct);
    this.refillHand(party, p);
  }

  /** Add XP respecting the phase cap (one evolution max on Friday). Handles levels, unlocks and titles. */
  private applyXp(party: PartyState, p: PlayerState, xp: number): { unlocked: string[]; capped: boolean } {
    const cap = party.capLifted ? Infinity : xpCapFor(party.phase);
    const before = p.level;
    if (xp > 0 && party.xpBoostUntil && this.now() < party.xpBoostUntil) xp *= 2; // host-called double XP
    const target = p.xp + xp;
    const capped = xp > 0 && target > cap;
    p.xp = Math.max(0, xp > 0 ? Math.min(target, Math.max(p.xp, cap)) : target);
    p.level = levelForXp(p.xp);
    const unlocked: string[] = [];
    if (p.level > before) {
      for (const c of cosmeticsForLevel(p.level)) if (!p.unlocked.includes(c)) { p.unlocked.push(c); unlocked.push(c); }
      p.title = titleForLevel(p.level);
    }
    return { unlocked, capped };
  }

  private medianLevel(party: PartyState, exceptId: string): number {
    const lv = Object.values(party.players).filter((x) => !x.removed && x.creature && x.id !== exceptId).map((x) => x.level).sort((a, b) => a - b);
    return lv.length ? lv[Math.floor(lv.length / 2)] : 1;
  }

  /** Award points + XP. Handles the Friday cap, Saturday catch-up, level ups, evolutions, unlocks, achievements. */
  private grant(party: PartyState, p: PlayerState, points: number, xp: number, direct: Outbound[]) {
    const before = p.level; const stageBefore = stageForLevel(before);
    p.points = Math.max(0, p.points + points);
    this.updateComeback(party);
    // Saturday arrivals earn double XP until they've caught up to the group.
    const boosted = xp > 0 && p.catchUp && p.level < this.medianLevel(party, p.id) ? xp * 2 : xp;
    const { unlocked, capped } = this.applyXp(party, p, boosted);
    if (p.level > before) this.feed(party, { kind: 'levelup', text: `${p.creatureName} (${p.nickname}) hit level ${p.level}`, playerId: p.id, emoji: '⬆️' });
    const ach = this.checkAchievements(party, p, direct);
    const stageAfter = stageForLevel(p.level);
    let evolved: { from: number; to: number } | undefined;
    if (p.creature && stageAfter > stageBefore) {
      evolved = { from: stageBefore, to: stageAfter };
      this.feed(party, { kind: 'evolve', text: `🧬 ${p.nickname}'s ${p.creatureName} EVOLVED into a ${FORMS[p.creature][stageAfter - 1]}!`, playerId: p.id, emoji: '🧬' });
    }
    return { levelUp: p.level > before ? p.level : undefined, unlocked: [...unlocked, ...ach.cosmetics], achievements: ach.ids, evolved, capped: capped || undefined };
  }

  private checkAchievements(party: PartyState, p: PlayerState, direct: Outbound[]): { ids: string[]; cosmetics: string[] } {
    const ids: string[] = []; const cosmetics: string[] = [];
    const ctx = { battles: Object.values(party.battles) };
    for (let pass = 0; pass < 3; pass++) {
      let any = false;
      for (const a of ACHIEVEMENTS) {
        if (p.achievements.includes(a.id)) continue;
        if (!a.check(p, ctx)) continue;
        any = true;
        p.achievements.push(a.id); ids.push(a.id);
        p.points += a.points;
        cosmetics.push(...this.applyXp(party, p, a.xp).unlocked);
        if (a.cosmetic && !p.unlocked.includes(a.cosmetic)) { p.unlocked.push(a.cosmetic); cosmetics.push(a.cosmetic); }
        this.feed(party, { kind: 'achievement', text: `${p.nickname} unlocked "${a.name}"`, playerId: p.id, emoji: '🏅' });
        direct.push({ to: p.id, msg: { type: 'toast', text: `Achievement: ${a.name}`, emoji: '🏅', tone: 'success' } });
      }
      if (!any) break;
    }
    return { ids, cosmetics };
  }

  private rerollMission(playerId: string, missionId: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    const h = p.hand.find((x) => x.missionId === missionId);
    if (!h || h.status !== 'active') return this.fail('That one can\'t be swapped.');
    const m = MISSION_BY_ID[missionId];
    if (m?.starter) return this.fail('Your selfie stays pinned. It takes ten seconds, wherever you are.');
    if (m?.tutorial || playerId === party.groomId) { // skipping the intro is free; Jezza can veto anything, any time
      p.hand = p.hand.filter((x) => x !== h);
      this.refillHand(party, p, m?.tutorial ? undefined : m?.difficulty);
      return this.ok(party, { rerollsLeft: p.rerollsLeft, free: true });
    }
    this.refillRerolls(p);
    if (p.rerollsLeft <= 0) return this.fail(`No swaps left. Next one in ${Math.max(1, Math.ceil((p.rerollRefillAt - this.now()) / 60000))} min.`);
    if (p.rerollsLeft >= REROLLS_PER_PHASE) p.rerollRefillAt = this.now() + REROLL_REFILL_MS;
    p.rerollsLeft -= 1;
    p.hand = p.hand.filter((x) => x !== h);
    this.refillHand(party, p, m?.difficulty);
    return this.ok(party, { rerollsLeft: p.rerollsLeft });
  }

  /** Swap tokens trickle back: one every 20 minutes, up to the max. */
  private refillRerolls(p: PlayerState): boolean {
    if (p.rerollsLeft >= REROLLS_PER_PHASE || !p.rerollRefillAt) return false;
    const now = this.now();
    if (now < p.rerollRefillAt) return false;
    const n = 1 + Math.floor((now - p.rerollRefillAt) / REROLL_REFILL_MS);
    p.rerollsLeft = Math.min(REROLLS_PER_PHASE, p.rerollsLeft + n);
    p.rerollRefillAt = p.rerollsLeft >= REROLLS_PER_PHASE ? 0 : p.rerollRefillAt + n * REROLL_REFILL_MS;
    return true;
  }

  private setPrefs(playerId: string, lowKey: boolean): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    p.lowKey = lowKey;
    if (lowKey) { // swap out performing challenges for free
      p.hand = p.hand.filter((h) => !(h.status === 'active' && MISSION_BY_ID[h.missionId]?.loud && !MISSION_BY_ID[h.missionId]?.starter));
      this.refillHand(party, p);
    }
    return this.ok(party);
  }

  private confirmWitness(playerId: string, claimId: string, approve: boolean): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p) return this.fail('Join a party first.');
    const claim = party.claims[claimId];
    if (!claim || claim.status !== 'pending' || claim.method !== 'witness' || claim.witnessId !== playerId) return this.fail('Nothing to confirm.');
    const direct: Outbound[] = [];
    this.resolve(party, claim, approve, direct, p);
    return this.ok(party, undefined, direct);
  }

  private resolve(party: PartyState, claim: Claim, approve: boolean, direct: Outbound[], resolver?: PlayerState, by: 'host' | 'mates' | 'timeout' = 'host') {
    const owner = party.players[claim.playerId];
    const mission = MISSION_BY_ID[claim.missionId];
    if (claim.status === 'disputed') {
      // Points were frozen when BS was called. Approve = give them back; reject = they stay gone.
      claim.status = approve ? 'approved' : 'rejected'; claim.resolvedAt = this.now();
      const ev = party.feed.find((f) => f.claimId === claim.id); if (ev) { ev.disputed = false; }
      if (owner && mission) {
        if (approve) {
          const r = this.grant(party, owner, mission.points, mission.xp, direct);
          owner.missionsCompleted += 1; owner.categoryCounts[mission.category] = (owner.categoryCounts[mission.category] ?? 0) + 1;
          if (!owner.completedMissionIds.includes(mission.id)) owner.completedMissionIds.push(mission.id);
          this.feed(party, { kind: 'host', text: by === 'mates' ? `The lads backed ${owner.nickname}'s "${mission.title}". Points restored. Apologies owed.` : `The host upheld ${owner.nickname}'s "${mission.title}". Points restored. Apologies owed.`, emoji: '⚖️' });
          direct.push({ to: owner.id, msg: { type: 'reward', points: mission.points, xp: mission.xp, ...r, title: `${mission.title} (upheld by the host)`, quiet: true } });
        } else {
          owner.hand = owner.hand.filter((h) => h.missionId !== mission.id);
          this.refillHand(party, owner);
          this.feed(party, { kind: 'host', text: by === 'timeout' ? `Nobody backed ${owner.nickname}'s "${mission.title}". BS confirmed.` : `The host struck out ${owner.nickname}'s "${mission.title}". BS confirmed.`, emoji: '🚩' });
          direct.push({ to: owner.id, msg: { type: 'toast', text: `"${mission.title}" got struck out. The people have spoken.`, emoji: '🚩', tone: 'warn' } });
        }
      }
      return;
    }
    const wasReview = !!claim.review;
    if (wasReview) party.feed = party.feed.filter((f) => !(f.kind === 'vote' && f.claimId === claim.id));
    if (approve) {
      this.approveClaim(party, claim, direct);
      if (resolver && claim.method === 'witness') { resolver.witnessed += 1; this.checkAchievements(party, resolver, direct); }
      if (wasReview && by === 'mates') this.feed(party, { kind: 'host', text: `The lads voted ${owner?.nickname}'s photo in 👍`, emoji: '🗳️' });
    } else {
      claim.status = 'rejected'; claim.resolvedAt = this.now();
      if (wasReview && claim.photoUrl) { this.deletePhotos([claim.photoUrl]); claim.photoUrl = undefined; }
      if (wasReview) this.feed(party, { kind: 'host', text: by === 'mates' ? `The lads binned ${owner?.nickname}'s photo for "${mission?.title}" 👎. Have another crack.` : `The host sent back ${owner?.nickname}'s photo for "${mission?.title}". Have another crack.`, emoji: '🗳️' });
      if (owner) {
        const h = owner.hand.find((x) => x.missionId === claim.missionId);
        if (h) { h.status = 'active'; h.claimId = undefined; }
        direct.push({ to: owner.id, msg: { type: 'toast', text: `"${mission?.title}" was not approved. Try again.`, emoji: '❌', tone: 'warn' } });
      }
    }
  }

  private flagClaim(playerId: string, claimId: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    const claim = party.claims[claimId];
    const mission = claim ? MISSION_BY_ID[claim.missionId] : undefined;
    if (!claim || !mission) return this.fail('That claim is gone.');
    if (claim.playerId === playerId) return this.fail('You cannot call BS on yourself. Though we admire the honesty.');
    if (claim.status !== 'approved') return this.fail(claim.status === 'disputed' ? 'Already with the host.' : 'Only completed missions can be called out.');
    if (this.now() - (claim.resolvedAt ?? claim.createdAt) > FLAG_WINDOW_MS) return this.fail('Too late to call BS on that one. Let it go.');
    claim.flags = claim.flags ?? [];
    if (claim.flags.includes(playerId)) return this.fail('You already called it.');
    claim.flags.push(playerId);
    p.flagged = [...(p.flagged ?? []), claimId];
    const ev = party.feed.find((f) => f.claimId === claimId); if (ev) ev.flags = claim.flags.length;
    const owner = party.players[claim.playerId];
    const direct: Outbound[] = [];
    if (claim.flags.length >= FLAGS_TO_DISPUTE) {
      claim.status = 'disputed'; claim.disputedAt = this.now(); claim.backers = [];
      if (ev) ev.disputed = true;
      if (owner) {
        // Freeze: take the reward back until the host rules.
        owner.points = Math.max(0, owner.points - mission.points); owner.xp = Math.max(0, owner.xp - mission.xp); owner.level = levelForXp(owner.xp);
        owner.missionsCompleted = Math.max(0, owner.missionsCompleted - 1);
        owner.categoryCounts[mission.category] = Math.max(0, (owner.categoryCounts[mission.category] ?? 1) - 1);
        owner.completedMissionIds = owner.completedMissionIds.filter((x) => x !== mission.id);
        this.feed(party, { kind: 'host', text: `BS CALLED on ${owner.nickname}'s "${mission.title}". Points frozen. Two lads can back it, or it's gone in 30 min.`, emoji: '🚩' });
        direct.push({ to: owner.id, msg: { type: 'toast', text: `The lads called BS on "${mission.title}". Get two mates to back you or it's gone.`, emoji: '🚩', tone: 'warn' } });
      }
    } else if (owner) {
      direct.push({ to: owner.id, msg: { type: 'toast', text: `Someone side-eyed your "${mission.title}". One more and the host gets involved.`, emoji: '👀', tone: 'warn' } });
    }
    return this.ok(party, { flags: claim.flags.length, disputed: claim.status === 'disputed' }, direct);
  }

  private backClaim(playerId: string, claimId: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    const claim = party.claims[claimId];
    if (!claim || claim.status !== 'disputed') return this.fail('Nothing to back.');
    if (claim.playerId === playerId) return this.fail('You can\'t back yourself. Nice try.');
    if ((claim.flags ?? []).includes(playerId)) return this.fail('You called BS on it. Pick a side.');
    claim.backers = claim.backers ?? [];
    if (claim.backers.includes(playerId)) return this.fail('Already backed it.');
    claim.backers.push(playerId);
    const direct: Outbound[] = [];
    if (claim.backers.length >= (claim.flags?.length ?? FLAGS_TO_DISPUTE)) this.resolve(party, claim, true, direct, p, 'mates');
    return this.ok(party, { backers: claim.backers.length }, direct);
  }

  // ---------- reactions ----------
  private react(playerId: string, eventId: string, emoji: Reaction): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    if (!['😂', '🔥', '❤️'].includes(emoji)) return this.fail('Unknown reaction.');
    const ev = party.feed.find((f) => f.id === eventId);
    if (!ev) return this.fail('That one has scrolled off the feed. React to something newer.');
    if (ev.kind !== 'mission' || !ev.playerId) return this.fail('Can\'t react to that.');
    if (ev.playerId === playerId) return this.fail('Reacting to your own? Bold.');
    if (emoji === '❤️' && playerId !== party.groomId) return this.fail('Only Jezza gives out hearts.');
    ev.reactions = ev.reactions ?? {};
    const list = (ev.reactions[emoji] = ev.reactions[emoji] ?? []);
    if (list.includes(playerId)) return { ack: { ok: true, data: { already: true } }, changed: false, direct: [] };
    list.push(playerId);
    p.reactionsGiven += 1;
    const owner = party.players[ev.playerId];
    const direct: Outbound[] = [];
    if (owner) {
      if (emoji === '😂') owner.laughs += 1;
      if (emoji === '🔥') owner.fires += 1;
      if (emoji === '❤️') {
        owner.groomLoves += 1;
        this.grant(party, owner, 5, 0, direct);
        direct.push({ to: owner.id, msg: { type: 'toast', text: 'Jezza gave your challenge a ❤️ (+5)', emoji: '❤️', tone: 'success' } });
      }
      this.checkAchievements(party, owner, direct);
      this.checkQuests(party, owner, direct);
    }
    return this.ok(party, undefined, direct);
  }

  // ---------- Jezza Wall ----------
  private wallPost(playerId: string, kind: 'roast' | 'toast', textRaw: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed || !p.creature) return this.fail('Adopt a creature first.');
    if (kind !== 'roast' && kind !== 'toast') return this.fail('Roast or toast?');
    const text = String(textRaw ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < 6) return this.fail('Give it a bit more than that.');
    if (text.length > 140) return this.fail('Keep it under 140 characters. Punchlines are short.');
    if (!isClean(text)) return this.fail('Too far, mate. Keep it to stuff Jezza would laugh at in front of his mum.');
    const mine = party.wall.filter((w) => w.playerId === playerId && w.phase === party.phase && !w.hidden).length;
    if (mine >= WALL_PER_PHASE) return this.fail(`You've had your ${WALL_PER_PHASE} for today. Save some material for the speech.`);
    const now = this.now();
    const post: WallPost = { id: `w_${now.toString(36)}_${Math.floor(this.rng() * 1e6).toString(36)}`, at: now, playerId, kind, text, phase: party.phase, votes: [], groomLove: false };
    party.wall.push(post);
    if (party.wall.length > 200) party.wall = party.wall.slice(-200);
    const direct: Outbound[] = [];
    const r = this.grant(party, p, 5, 10, direct);
    // The intro "Roast Jezza" / "Toast Jezza" is done by posting one (its reward pop-up says it all, so no extra toast)
    const intro = p.hand.find((h) => h.status === 'active' && MISSION_BY_ID[h.missionId]?.wall === kind);
    if (!intro) direct.push({ to: playerId, msg: { type: 'toast', text: `Posted (+5). ${r.achievements.length ? '' : 'Now get the lads to vote it up.'}`, emoji: kind === 'roast' ? '🔥' : '🥂', tone: 'success' } });
    if (intro) {
      const claim: Claim = { id: `wall_${post.id}`, playerId, missionId: intro.missionId, method: 'self', status: 'pending', createdAt: now, group: false, note: text };
      party.claims[claim.id] = claim;
      this.approveClaim(party, claim, direct, true);
    } else this.feed(party, { kind: 'wall', text: `${p.nickname} ${kind === 'roast' ? 'roasted' : 'toasted'} Jezza on the Wall`, playerId: p.id, emoji: kind === 'roast' ? '🎤' : '🥂' });
    if (party.groomId && party.groomId !== playerId) direct.push({ to: party.groomId, msg: { type: 'toast', text: kind === 'roast' ? 'Someone just roasted you on the Jezza Wall 👀' : 'Someone just toasted you on the Jezza Wall 🥂', emoji: '🎤', tone: 'info' } });
    return this.ok(party, { id: post.id }, direct);
  }

  private wallVote(playerId: string, postId: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    const post = party.wall.find((w) => w.id === postId && !w.hidden);
    if (!post) return this.fail('That post is gone.');
    if (post.playerId === playerId) return this.fail('Voting for yourself? Classic.');
    const author = party.players[post.playerId];
    const direct: Outbound[] = [];
    if (playerId === party.groomId) {
      if (post.groomLove) return { ack: { ok: true, data: { already: true } }, changed: false, direct: [] };
      post.groomLove = true;
      if (author) { author.groomLoves += 1; this.grant(party, author, 10, 0, direct); direct.push({ to: author.id, msg: { type: 'toast', text: 'Jezza ❤️ your Wall post (+10)', emoji: '❤️', tone: 'success' } }); }
      return this.ok(party, undefined, direct);
    }
    if (post.votes.includes(playerId)) return { ack: { ok: true, data: { already: true } }, changed: false, direct: [] };
    post.votes.push(playerId);
    p.reactionsGiven += 1;
    if (author) {
      author.wallVotes += 1;
      if (post.votes.length <= 10) this.grant(party, author, 2, 0, direct);
      else this.checkAchievements(party, author, direct);
    }
    return this.ok(party, undefined, direct);
  }

  private wallHide(playerId: string, postId: string): HandleResult {
    const party = this.partyOf(playerId);
    const post = party?.wall.find((w) => w.id === postId);
    if (!party || !post) return this.fail('That post is gone.');
    if (post.playerId !== playerId && party.groomId !== playerId && party.hostId !== playerId) return this.fail('Only the author, Jezza or the host can take a post down.');
    post.hidden = true;
    return this.ok(party);
  }

  // ---------- Cellar ----------
  private cellarAdd(playerId: string, drinkRaw: string, starsRaw: number, noteRaw?: string, photo?: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed || !p.creature) return this.fail('Adopt a creature first.');
    const drink = String(drinkRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const note = String(noteRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 90) || undefined;
    const stars = Math.round(Number(starsRaw));
    if (drink.length < 2) return this.fail('What are you drinking?');
    if (!(stars >= 1 && stars <= 5)) return this.fail('Give it 1 to 5 stars.');
    if (!isClean(drink) || (note && !isClean(note))) return this.fail('Keep it clean, sommelier.');
    const now = this.now();
    const entry: CellarEntry = { id: `ce_${now.toString(36)}_${Math.floor(this.rng() * 1e6).toString(36)}`, at: now, playerId, drink, stars, note, phase: party.phase, fires: [] };
    if (photo) {
      if (typeof photo !== 'string' || !photo.startsWith('data:image/') || photo.length > MAX_PHOTO_CHARS) return this.fail('That photo didn\'t work. Try again.');
      const url = this.storePhoto(photo, party.code);
      if (!url) return this.fail('Couldn\'t save the photo. Try again.');
      entry.photoUrl = url;
    }
    party.cellar.push(entry);
    if (party.cellar.length > 200) party.cellar = party.cellar.slice(-200);
    const rewarded = party.cellar.filter((e) => e.playerId === playerId && e.phase === party.phase).length <= CELLAR_REWARDED_PER_PHASE;
    p.cellarCount += 1;
    const direct: Outbound[] = [];
    if (rewarded) { this.grant(party, p, 5, 10, direct); direct.push({ to: playerId, msg: { type: 'toast', text: 'Reviewed (+5). Very sophisticated.', emoji: drinkEmoji(drink), tone: 'success' } }); }
    else { this.checkAchievements(party, p, direct); direct.push({ to: playerId, msg: { type: 'toast', text: 'Logged. (Only your first 3 reviews a day score: the game never rewards drinking more.)', emoji: '🍷', tone: 'info' } }); }
    this.feed(party, { kind: 'cellar', text: `${p.nickname} reviewed ${drink} ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`, playerId: p.id, emoji: drinkEmoji(drink) });
    return this.ok(party, { id: entry.id }, direct);
  }

  private cellarFire(playerId: string, entryId: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    const e = party.cellar.find((x) => x.id === entryId);
    if (!e) return this.fail('That review is gone.');
    if (e.playerId === playerId) return this.fail('Can\'t 🔥 your own review.');
    if (e.fires.includes(playerId)) return { ack: { ok: true, data: { already: true } }, changed: false, direct: [] };
    e.fires.push(playerId);
    p.reactionsGiven += 1;
    const author = party.players[e.playerId];
    if (author) author.cellarFires += 1;
    return this.ok(party);
  }

  /**
   * Your own photo (or any photo, if you're the host) comes down straight away.
   * Anyone else's request goes to the host to decide, so one person can't wipe the camera roll.
   */
  private deletePhoto(playerId: string, photoId: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    const claim = party.claims[photoId];
    const entry = party.cellar.find((e) => e.id === photoId);
    const url = claim?.photoUrl ?? entry?.photoUrl;
    if (!url) return this.fail('That photo is already gone.');
    const ownerId = claim?.playerId ?? entry?.playerId;
    if (ownerId !== playerId && party.hostId !== playerId) {
      const target = (claim ?? entry)!;
      target.takedown ??= { by: [], at: this.now() };
      if (target.takedown.by.includes(playerId)) return { ack: { ok: true, data: { requested: true, already: true } }, changed: false, direct: [] };
      target.takedown.by.push(playerId);
      return this.ok(party, { requested: true }, [{ to: party.hostId, msg: { type: 'toast', text: 'Someone asked for a photo to come down. It\'s in your Queue.', emoji: '🗑️', tone: 'info' } }]);
    }
    return this.removePhoto(party, p, photoId);
  }

  private removePhoto(party: PartyState, p: PlayerState, photoId: string): HandleResult {
    const claim = party.claims[photoId];
    const entry = party.cellar.find((e) => e.id === photoId);
    const url = claim?.photoUrl ?? entry?.photoUrl;
    if (!url) return this.fail('That photo is already gone.');
    if (claim) claim.takedown = undefined;
    if (entry) entry.takedown = undefined;
    if (claim?.status === 'pending' && claim.review) this.withdrawPending(party, claim);
    if (claim) claim.photoUrl = undefined;
    if (entry) entry.photoUrl = undefined;
    for (const f of party.feed) if (f.photoUrl === url) f.photoUrl = undefined;
    this.deletePhotos([url]);
    // the face picture is cut from the first selfie, so it goes when that does
    const owner = claim && MISSION_BY_ID[claim.missionId]?.starter ? party.players[claim.playerId] : undefined;
    if (owner?.avatarUrl) { this.deletePhotos([owner.avatarUrl]); owner.avatarUrl = undefined; }
    const ownerName = party.players[claim?.playerId ?? entry?.playerId ?? '']?.nickname;
    this.feed(party, { kind: 'host', text: ownerName && ownerName !== p.nickname ? `The host took down a photo of ${ownerName}'s. Points stay.` : `${p.nickname} took down one of their photos.`, emoji: '🗑️' });
    return this.ok(party);
  }

  // ---------- Photo checks ----------
  private votePhoto(playerId: string, claimId: string, up: boolean): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    const claim = party.claims[claimId];
    if (!claim || claim.status !== 'pending' || claim.review !== 'vote') return this.fail('That vote is already settled.');
    if (claim.playerId === playerId) return this.fail('Voting on your own photo? Classic.');
    claim.votesUp = (claim.votesUp ?? []).filter((x) => x !== playerId);
    claim.votesDown = (claim.votesDown ?? []).filter((x) => x !== playerId);
    (up ? claim.votesUp : claim.votesDown).push(playerId);
    const voters = Object.values(party.players).filter((x) => !x.removed && x.creature && x.id !== claim.playerId).length;
    const need = Math.max(1, Math.min(PHOTO_VOTES_NEEDED, voters));
    const direct: Outbound[] = [];
    if (claim.votesUp.length >= need) this.resolve(party, claim, true, direct, undefined, 'mates');
    else if (claim.votesDown.length >= need) this.resolve(party, claim, false, direct, undefined, 'mates');
    return this.ok(party, { status: claim.status }, direct);
  }

  /** A pending photo that gets deleted or purged: hand the challenge back, no points either way. */
  private withdrawPending(party: PartyState, claim: Claim) {
    claim.status = 'rejected'; claim.resolvedAt = this.now(); claim.note = 'Photo withdrawn';
    party.feed = party.feed.filter((f) => !(f.kind === 'vote' && f.claimId === claim.id));
    const h = party.players[claim.playerId]?.hand.find((x) => x.claimId === claim.id);
    if (h) { h.status = 'active'; h.claimId = undefined; }
  }

  // ---------- EPIC tier ----------
  private openEpic(playerId: string, epicId: string) {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    const e = party?.epics.find((x) => x.id === epicId);
    return { party, p, e };
  }

  private joinEpic(playerId: string, epicId: string): HandleResult {
    const { party, p, e } = this.openEpic(playerId, epicId);
    if (!party || !p || p.removed || !p.creature) return this.fail('Adopt a creature first.');
    if (!e || e.status !== 'open') return this.fail('That job is already sorted.');
    if (e.crew.includes(playerId)) return { ack: { ok: true, data: { already: true } }, changed: false, direct: [] };
    if (e.crew.length >= e.max) return this.fail('Crew\'s full. Legends beat you to it.');
    e.crew.push(playerId);
    const direct: Outbound[] = [];
    if (e.crew.length === e.max) {
      const names = e.crew.map((id) => party.players[id]?.nickname ?? '?').join(' & ');
      this.feed(party, { kind: 'epic', text: `🟣 ${e.title}: crew locked in (${names})`, emoji: e.emoji });
      for (const id of e.crew) direct.push({ to: id, msg: { type: 'toast', text: `You're on ${e.title} with ${e.crew.filter((x) => x !== id).map((x) => party.players[x]?.nickname).join(' & ') || 'yourself'}. Tap Done when it's done.`, emoji: e.emoji, tone: 'success' } });
    }
    return this.ok(party, { crew: e.crew.length }, direct);
  }

  private leaveEpic(playerId: string, epicId: string): HandleResult {
    const { party, e } = this.openEpic(playerId, epicId);
    if (!party || !e || e.status !== 'open' || !e.crew.includes(playerId)) return this.fail('You\'re not on that crew.');
    e.crew = e.crew.filter((x) => x !== playerId);
    return this.ok(party);
  }

  private finishEpic(playerId: string, epicId: string): HandleResult {
    const { party, e } = this.openEpic(playerId, epicId);
    if (!party || !e) return this.fail('That job is gone.');
    if (e.status !== 'open') return { ack: { ok: true, data: { already: true } }, changed: false, direct: [] };
    if (!e.crew.includes(playerId) && party.hostId !== playerId) return this.fail('Only the crew (or the host) can mark it done.');
    if (e.crew.length < e.min) return this.fail(`Needs ${e.min} on the crew first.`);
    e.status = 'done'; e.doneAt = this.now(); e.doneBy = playerId;
    const direct: Outbound[] = [];
    for (const id of e.crew) {
      const p = party.players[id];
      if (!p || p.removed) continue;
      p.epicsDone += 1;
      const fresh = !p.unlocked.includes(e.item);
      if (fresh) p.unlocked.push(e.item);
      const r = this.grant(party, p, e.points, e.xp, direct);
      direct.push({ to: id, msg: { type: 'reward', points: e.points, xp: e.xp, ...r, unlocked: [...(fresh ? [e.item] : []), ...r.unlocked], title: `EPIC: ${e.title}`, bonus: '🟣 Epic job done. Legend behaviour.' } });
    }
    const names = e.crew.map((id) => party.players[id]?.nickname ?? '?').join(' & ');
    this.feed(party, { kind: 'epic', text: `🟣 EPIC DONE: ${names} sorted "${e.title}" (+${e.points} each)`, emoji: e.emoji });
    return this.ok(party, undefined, direct);
  }

  // ---------- reward codes ----------
  private redeemCode(playerId: string, raw: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed || !p.creature) return this.fail('Adopt a creature first.');
    const now = this.now();
    p.codeTries = p.codeTries.filter((t) => now - t < CODE_WINDOW_MS);
    if (p.codeTries.length >= CODE_MAX_TRIES) return this.fail('Too many wrong codes. Have a breather and try again in a few minutes.');
    const code = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const c = party.codes.find((x) => x.code.replace(/[^A-Z0-9]/g, '') === code);
    if (!c) { p.codeTries.push(now); return this.fail('Nope, that code isn\'t a thing. Ask the host nicely.'); }
    if (c.redeemedBy.includes(playerId)) return this.fail('You\'ve already used that one.');
    if (c.redeemedBy.length >= c.uses) return this.fail('Someone beat you to it. That code is used up.');
    const cos = COSMETIC_BY_ID[c.item];
    if (p.unlocked.includes(c.item)) return this.fail(`You already have ${theItem(cos)}. Save it for a mate.`);
    c.redeemedBy.push(playerId);
    p.unlocked.push(c.item);
    this.feed(party, { kind: 'unlock', text: `🎁 ${p.nickname} redeemed a reward code and unlocked ${theItem(cos)}`, playerId: p.id, emoji: '🎁' });
    return this.ok(party, { item: c.item }, [{ to: playerId, msg: { type: 'reward', points: 0, xp: 0, unlocked: [c.item], title: 'Reward code unlocked!', bonus: '🎁 Straight from the host' } }]);
  }

  // ---------- giveaways (items up for grabs) ----------
  /** A giveaway whose window has passed closes the moment anyone looks at it, so a late tap can't sneak through. */
  private settleGiveaway(party: PartyState, g: Giveaway, now: number) {
    if (g.status === 'active' && g.endsAt && now >= g.endsAt) {
      g.status = 'ended'; g.closedAt = now;
      this.feed(party, { kind: 'unlock', text: `🎁 Time's up on "${g.title}": ${g.claims.length} of ${g.qty} claimed`, emoji: '🎁' });
    }
  }

  private claimGiveaway(playerId: string, giveawayId: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed || !p.creature) return this.fail('Adopt a creature first.');
    const g = party.giveaways.find((x) => x.id === giveawayId);
    if (!g) return this.fail('That giveaway isn\'t a thing any more.');
    const now = this.now();
    this.settleGiveaway(party, g, now);
    // Same tap twice (slow network, retry): you already have it, nothing more happens
    if (g.claims.some((c) => c.playerId === playerId)) return { ack: { ok: true, data: { item: g.item, already: true } }, changed: false, direct: [] };
    const cos = COSMETIC_BY_ID[g.item];
    if (g.status === 'exhausted') return this.fail('All gone. The lads were quick.');
    if (g.status === 'ended') return this.fail('That one has closed. Keep an eye out for the next.');
    if (g.status === 'cancelled') return this.fail('The host pulled that one.');
    if (p.unlocked.includes(g.item)) return this.fail(`You already have ${theItem(cos)}. Leave it for a mate.`);
    if (g.claims.length >= g.qty) { g.status = 'exhausted'; g.closedAt = now; return this.fail('All gone. The lads were quick.'); }
    // Stock and item move together: the engine runs one message at a time, so two lads can't both get the last one
    g.claims.push({ playerId, at: now });
    p.unlocked.push(g.item);
    const left = g.qty - g.claims.length;
    if (left <= 0) { g.status = 'exhausted'; g.closedAt = now; }
    this.feed(party, { kind: 'unlock', text: `🎁 ${p.nickname} grabbed ${theItem(cos)}${left > 0 ? ` (${left} left)` : ' — all gone!'}`, playerId: p.id, emoji: '🎁' });
    return this.ok(party, { item: g.item, left }, [{ to: playerId, msg: { type: 'reward', points: 0, xp: 0, unlocked: [g.item], title: 'Got it!', bonus: '🎁 Up for grabs, and you were quick' } }]);
  }

  // ---------- auto-battles ----------
  private ackAway(playerId: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p) return this.fail('Join a party first.');
    if (!p.away.length) return { ack: { ok: true }, changed: false, direct: [] };
    p.away = [];
    return this.ok(party);
  }

  private setAutoBattles(playerId: string, on: boolean): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    p.autoBattles = on;
    return this.ok(party);
  }

  private autoEligible(party: PartyState): PlayerState[] {
    return Object.values(party.players).filter((p) => !p.removed && p.creature && p.autoBattles && !this.liveBattleFor(party, p.id));
  }

  private autoInterval(eligible: number): number {
    return (AUTO_TARGET_MS / Math.max(1, Math.floor(eligible / 2))) * (0.7 + this.rng() * 0.6);
  }

  /**
   * The matchmaker. Runs from tick(); if the server was asleep it catches up on the battles it missed
   * (capped), resolving them now with the same engine, the same moves and the same reward function.
   */
  private runAutoBattles(party: PartyState, now: number, direct: Outbound[]): boolean {
    if (party.nextAutoAt == null) { party.nextAutoAt = now + FIRST_AUTO_DELAY_MS; return true; }
    if (now < party.nextAutoAt) return false;
    const pool = this.autoEligible(party);
    if (!this.activePhase(party) || !party.missionsOpen || pool.length < 2) { party.nextAutoAt = now + this.autoInterval(Math.max(2, pool.length)); return true; }
    const step = AUTO_TARGET_MS / Math.max(1, Math.floor(pool.length / 2));
    const due = 1 + Math.floor((now - party.nextAutoAt) / step);
    const count = Math.min(due, Math.max(3, Math.floor(pool.length / 2)), AUTO_MAX_CATCHUP);
    const busy = new Set<string>();
    for (let i = 0; i < count; i++) {
      const pair = this.pickAutoPair(party, busy);
      if (!pair) break;
      busy.add(pair[0].id); busy.add(pair[1].id);
      this.autoBattle(party, pair[0], pair[1], now, i, direct);
    }
    party.nextAutoAt = now + this.autoInterval(pool.length);
    return true;
  }

  /** Longest-waiting avatar first; avoid recent rematches; usually (not always) someone of similar rating so upsets stay possible. */
  private pickAutoPair(party: PartyState, busy: Set<string>): [PlayerState, PlayerState] | null {
    const pool = this.autoEligible(party).filter((p) => !busy.has(p.id));
    if (pool.length < 2) return null;
    const jitter = new Map(pool.map((p) => [p.id, this.rng()]));
    pool.sort((x, y) => x.lastAutoAt - y.lastAutoAt || jitter.get(x.id)! - jitter.get(y.id)!);
    const a = pool[0];
    const rest = pool.slice(1);
    const fresh = rest.filter((p) => !a.recentAuto.includes(p.id) && !p.recentAuto.slice(-1).includes(a.id));
    const cands = fresh.length ? fresh : rest;
    const near = cands.filter((p) => Math.abs(p.rating - a.rating) <= AUTO_NEAR_RATING);
    const from = near.length && this.rng() < 0.65 ? near : cands;
    // among the chosen group, lean towards whoever has waited longest
    const sorted = [...from].sort((x, y) => x.lastAutoAt - y.lastAutoAt);
    const b = sorted[Math.floor(this.rng() * Math.min(3, sorted.length))];
    return [a, b];
  }

  private autoBattle(party: PartyState, pa: PlayerState, pb: PlayerState, now: number, i: number, direct: Outbound[]) {
    const id = `ab_${now.toString(36)}_${i}_${Math.floor(this.rng() * 1e6).toString(36)}`;
    const b: Battle = {
      id, challengerId: pa.id, opponentId: pb.id, status: 'active', createdAt: now, startedAt: now, round: 1,
      a: makeCreatureState(pa.id, pa.creature!, pa.level), b: makeCreatureState(pb.id, pb.creature!, pb.level), log: [], scored: true, auto: true,
    };
    const plans: GamePlan[] = ['balanced', 'aggro', 'sneaky'];
    b.a.plan = plans[Math.floor(this.rng() * plans.length)]; b.b.plan = plans[Math.floor(this.rng() * plans.length)];
    const names = { [pa.id]: pa.creatureName || CREATURES[pa.creature!].name, [pb.id]: pb.creatureName || CREATURES[pb.creature!].name };
    for (let guard = 0; b.status === 'active' && guard < 20; guard++) {
      for (const side of [b.a, b.b]) { const pick = autoPick(side, this.rng, side.plan); side.action = pick.action; side.tap = pick.tap; side.power = pick.power; }
      resolveRound(b, this.rng, names, now);
    }
    party.battles[id] = b;
    for (const p of [pa, pb]) {
      p.lastAutoAt = now;
      const other = p === pa ? pb.id : pa.id;
      p.recentAuto = [...p.recentAuto.filter((x) => x !== other), other].slice(-AUTO_AVOID_RECENT);
    }
    this.settleBattle(party, b, direct);
  }

  // ---------- Boss raids ----------
  private liveRaid(party: PartyState): Raid | undefined {
    const r = party.raids[party.raids.length - 1];
    return r && r.status === 'active' && this.now() < r.endsAt ? r : undefined;
  }

  private maybeSpawnRaid(party: PartyState, direct: Outbound[]) {
    const phase = this.activePhase(party);
    if (!phase || this.liveRaid(party) || party.raids.some((r) => r.phase === phase)) return;
    if (party.phaseMissions[phase] >= RAID_THRESHOLD[phase]) this.spawnRaid(party, phase, direct);
  }

  private spawnRaid(party: PartyState, phase: 'friday' | 'saturday', direct: Outbound[]): Raid {
    const now = this.now();
    const boss = phase === 'friday' ? 'ibis' : 'hydra';
    const online = Object.values(party.players).filter((x) => !x.removed && x.creature && x.online).length;
    const maxHp = RAID_HP_PER_PLAYER * Math.max(4, online);
    const raid: Raid = { id: `rd_${now.toString(36)}`, phase, boss, maxHp, hp: maxHp, startedAt: now, endsAt: now + RAID_DURATION_MS, status: 'active', damage: {}, lastHitAt: {}, log: [], cosmetic: BOSSES[boss].cosmetic };
    party.raids.push(raid);
    this.feed(party, { kind: 'raid', text: `👹 BOSS RAID: ${BOSSES[boss].name} has appeared! 15 minutes. Everyone who swings gets the loot.`, emoji: '👹' });
    direct.push({ to: 'party', msg: { type: 'toast', text: `BOSS RAID: ${BOSSES[boss].name} is here! Tap the banner. Everyone who hits gets loot.`, emoji: '👹', tone: 'info' } });
    return raid;
  }

  private damageRaid(party: PartyState, raid: Raid, p: PlayerState, dmg: number, crit: boolean, source: 'hit' | 'mission', direct: Outbound[]) {
    const now = this.now();
    if (raid.weakUntil && now < raid.weakUntil) dmg *= 2; // the weak spot: everything lands double
    const dealt = Math.min(raid.hp, Math.max(1, Math.round(dmg)));
    raid.hp -= dealt;
    raid.damage[p.id] = (raid.damage[p.id] ?? 0) + dealt;
    p.raidDamage += dealt;
    raid.log.push({ at: this.now(), playerId: p.id, dmg: dealt, crit, source });
    if (raid.log.length > 14) raid.log = raid.log.slice(-14);
    if (raid.hp <= 0) { this.endRaid(party, raid, 'won', direct); return; }
    // Half health, once: the boss staggers and every hit for the next 25 seconds does double
    if (!raid.weakDone && raid.hp <= raid.maxHp / 2) {
      raid.weakDone = true; raid.weakUntil = now + RAID_WEAK_MS;
      this.feed(party, { kind: 'raid', text: `🎯 WEAK SPOT! ${BOSSES[raid.boss].name} is staggered: double damage for ${RAID_WEAK_MS / 1000} seconds. EVERYONE HIT IT.`, emoji: '🎯' });
      direct.push({ to: 'party', msg: { type: 'toast', text: `🎯 WEAK SPOT: double damage for ${RAID_WEAK_MS / 1000}s. Hit it now!`, emoji: '🎯', tone: 'warn' } });
    }
  }

  private raidHit(playerId: string, raidId: string, tap?: TapQuality, power?: number): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed || !p.creature) return this.fail('Adopt a creature first.');
    const raid = this.liveRaid(party);
    if (!raid || raid.id !== raidId) return this.fail('That raid is over.');
    const now = this.now();
    const wait = (raid.lastHitAt[playerId] ?? 0) + RAID_HIT_COOLDOWN_MS - now;
    if (wait > 0) return this.fail(`Catch your breath. Next hit in ${Math.ceil(wait / 1000)}s.`);
    raid.lastHitAt[playerId] = now;
    const pw = cleanPower(power, tap);
    const atk = CREATURES[p.creature].stats.atk;
    const dmg = atk * 2.25 * (0.9 + this.rng() * 0.3) * powerMult(pw) * (1 + 0.03 * (p.level - 1));
    const direct: Outbound[] = [];
    const before = raid.hp;
    const crit = qualityFor(pw) === 'perfect';
    this.damageRaid(party, raid, p, dmg, crit, 'hit', direct);
    return this.ok(party, { dmg: before - Math.max(0, raid.hp), crit, nextAt: now + RAID_HIT_COOLDOWN_MS }, direct);
  }

  private endRaid(party: PartyState, raid: Raid, outcome: 'won' | 'escaped', direct: Outbound[]) {
    if (raid.status !== 'active') return;
    raid.status = outcome; raid.finishedAt = this.now(); raid.hp = Math.max(0, raid.hp);
    const boss = BOSSES[raid.boss];
    const ranking = Object.entries(raid.damage).filter(([, d]) => d > 0).sort((a, b) => b[1] - a[1]);
    const base = RAID_REWARD[outcome];
    ranking.forEach(([pid], i) => {
      const p = party.players[pid];
      if (!p || p.removed) return;
      p.raidsJoined += 1;
      const mvp = RAID_MVP_POINTS[i] ?? 0;
      const fresh = !p.unlocked.includes(raid.cosmetic);
      if (fresh) p.unlocked.push(raid.cosmetic);
      const r = this.grant(party, p, base.points + mvp, base.xp, direct);
      direct.push({ to: pid, msg: { type: 'reward', points: base.points + mvp, xp: base.xp, ...r, unlocked: [...(fresh ? [raid.cosmetic] : []), ...r.unlocked], title: outcome === 'won' ? `${boss.name} defeated!` : `${boss.name} got away`, quiet: true, bonus: mvp ? `#${i + 1} damage: +${mvp} MVP bonus` : undefined } });
    });
    const top = ranking[0] ? party.players[ranking[0][0]]?.nickname : null;
    this.feed(party, { kind: 'raid', text: `${outcome === 'won' ? boss.defeat : boss.escape}${top ? ` Top damage: ${top}.` : ''} ${ranking.length} legend${ranking.length === 1 ? '' : 's'} get loot.`, emoji: outcome === 'won' ? '🏆' : '💨' });
  }

  // ---------- battles ----------
  private liveBattleFor(party: PartyState, playerId: string): Battle | undefined {
    return Object.values(party.battles).find((b) => (b.status === 'active' || b.status === 'challenge') && (b.a.playerId === playerId || b.b.playerId === playerId));
  }

  private challenge(playerId: string, opponentId: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId]; const o = party?.players[opponentId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    if (!this.activePhase(party)) return this.fail('Battles open once the host starts the event.');
    if (!o || o.removed || o.id === p.id) return this.fail('Pick a mate to fight.');
    if (!p.creature || !o.creature) return this.fail('Both legends need a creature first.');
    if (this.liveBattleFor(party, p.id)) return this.fail('You are already in a battle.');
    if (this.liveBattleFor(party, o.id)) return this.fail(`${o.nickname} is already battling.`);
    const now = this.now();
    const id = `bt_${now.toString(36)}_${Math.floor(this.rng() * 1e6).toString(36)}`;
    const battle: Battle = {
      id, challengerId: p.id, opponentId: o.id, status: 'challenge', createdAt: now, round: 0,
      a: makeCreatureState(p.id, p.creature, p.level), b: makeCreatureState(o.id, o.creature, o.level), log: [],
      scored: (p.scoredBattlesVs[o.id] ?? 0) < MAX_SCORED_VS_SAME_OPPONENT && (o.scoredBattlesVs[p.id] ?? 0) < MAX_SCORED_VS_SAME_OPPONENT,
    };
    const leader = sortLeaderboard(Object.values(party.players).filter((x) => x.creature))[0];
    if (leader && leader.points > 0 && (leader.id === p.id || leader.id === o.id) && battle.scored) battle.bountyOn = leader.id;
    party.battles[id] = battle;
    return this.ok(party, { battleId: id }, [{ to: o.id, msg: { type: 'toast', text: battle.bountyOn === o.id ? `${p.nickname} is coming for your bounty! ⚔️` : `${p.nickname} challenges you to a battle!`, emoji: '⚔️', tone: 'info' } }]);
  }

  private respondChallenge(playerId: string, battleId: string, accept: boolean): HandleResult {
    const party = this.partyOf(playerId);
    const b = party?.battles[battleId];
    if (!party || !b || b.status !== 'challenge' || b.opponentId !== playerId) return this.fail('No fight request to answer.');
    const now = this.now();
    if (!accept) { b.status = 'declined'; b.finishedAt = now; return this.ok(party, undefined, [{ to: b.challengerId, msg: { type: 'toast', text: `${party.players[playerId]?.nickname} declined. Cowardice noted.`, emoji: '🐔', tone: 'warn' } }]); }
    if (this.liveBattleFor(party, playerId)?.id !== b.id && this.liveBattleFor(party, playerId)) return this.fail('You are already in a battle.');
    // Quick battle: both pick a game plan (and one charge-up tap), then the whole fight plays itself.
    b.status = 'active'; b.quick = true; b.startedAt = now; b.round = 1; b.roundDeadline = now + PLAN_SECONDS * 1000;
    const pa = party.players[b.a.playerId]; const pb = party.players[b.b.playerId];
    if (pa) pa.missedRounds = 0; if (pb) pb.missedRounds = 0;
    const nudge = (to: string) => ({ to, msg: { type: 'toast' as const, text: `Fight on! Pick your game plan (${PLAN_SECONDS}s)`, emoji: '⚔️', tone: 'info' as const } });
    return this.ok(party, undefined, [nudge(b.challengerId)]);
  }

  private battlePlan(playerId: string, battleId: string, plan: GamePlan, tap?: TapQuality, power?: number): HandleResult {
    const party = this.partyOf(playerId);
    const b = party?.battles[battleId];
    if (!party || !b || b.status !== 'active' || !b.quick) return this.fail('That battle is not waiting on a plan.');
    const side = b.a.playerId === playerId ? b.a : b.b.playerId === playerId ? b.b : null;
    if (!side) return this.fail('Not your battle.');
    if (!isPlan(plan)) return this.fail('Pick a game plan.');
    if (side.plan) return { ack: { ok: true, data: { locked: true } }, changed: false, direct: [] };
    // The charge-up tap can't arrive before the marker could first reach the middle.
    const sinceStart = this.now() - (b.startedAt ?? this.now());
    side.plan = plan;
    side.chargePower = sinceStart >= TAP_MIN_MS ? cleanPower(power, tap) : 0;
    side.charge = qualityFor(side.chargePower);
    const direct: Outbound[] = [];
    if (b.a.plan && b.b.plan) this.resolveQuick(party, b, direct);
    return this.ok(party, undefined, direct);
  }

  /** Play out a quick battle with the same round resolver a hand-played fight uses. */
  private resolveQuick(party: PartyState, b: Battle, direct: Outbound[]) {
    if (b.status !== 'active') return;
    for (const s of [b.a, b.b]) { s.plan ??= 'balanced'; s.chargePower ??= cleanPower(undefined, s.charge); s.charge = qualityFor(s.chargePower); s.action = undefined; s.tap = undefined; }
    const names: Record<string, string> = {};
    for (const s of [b.a, b.b]) names[s.playerId] = party.players[s.playerId]?.creatureName ?? CREATURES[s.creature].name;
    for (let guard = 0; b.status === 'active' && guard < 20; guard++) {
      for (const s of [b.a, b.b]) { const p = autoPick(s, this.rng, s.plan, s.chargePower); s.action = p.action; s.tap = p.tap; s.power = p.power; }
      resolveRound(b, this.rng, names, this.now());
    }
    if (b.winnerId && b.loserId) this.settleBattle(party, b, direct);
  }

  private battleAction(playerId: string, battleId: string, round: number, action: BattleAction, tap?: TapQuality): HandleResult {
    const party = this.partyOf(playerId);
    const b = party?.battles[battleId];
    if (!party || !b || b.status !== 'active') return this.fail('That battle is not live.');
    if (b.quick) return this.fail('Quick battle: pick a game plan instead.');
    const side = b.a.playerId === playerId ? b.a : b.b.playerId === playerId ? b.b : null;
    if (!side) return this.fail('Not your battle.');
    if (round !== b.round) return this.fail('That round already resolved.');
    if (!['attack', 'counter', 'special'].includes(action)) return this.fail('Unknown action.');
    if (action === 'special' && side.specialCooldown > 0) return this.fail('Special is recharging.');
    if (side.action) return { ack: { ok: true, data: { locked: true } }, changed: false, direct: [] };
    side.action = action;
    // Power tap: only for damaging actions, and a hit can't arrive faster than the bar can physically slide.
    let quality: TapQuality = 'miss';
    if (action !== 'counter' && (tap === 'perfect' || tap === 'good')) {
      const roundStart = (b.roundDeadline ?? this.now()) - ROUND_SECONDS * 1000;
      quality = this.now() - roundStart >= TAP_BAR_MS * 0.6 ? tap : 'miss';
    }
    side.tap = quality;
    const direct: Outbound[] = [];
    if (b.a.action && b.b.action) this.resolveBattleRound(party, b, direct);
    return this.ok(party, undefined, direct);
  }

  private resolveBattleRound(party: PartyState, b: Battle, direct: Outbound[]) {
    const names: Record<string, string> = {};
    for (const s of [b.a, b.b]) names[s.playerId] = party.players[s.playerId]?.creatureName ?? CREATURES[s.creature].name;
    resolveRound(b, this.rng, names, this.now());
    if (b.status === 'finished' && b.winnerId && b.loserId) this.settleBattle(party, b, direct);
  }

  private endBattle(party: PartyState, b: Battle, winnerId: string, loserId: string, reason: Battle['reason']) {
    finish(b, winnerId, loserId, reason, this.now());
    this.settleBattle(party, b, []);
  }

  private settleBattle(party: PartyState, b: Battle, direct: Outbound[]) {
    const w = party.players[b.winnerId!]; const l = party.players[b.loserId!];
    if (!w || !l || b.rewards) return; // settled exactly once
    w.wins += 1; l.losses += 1;
    if (b.reason !== 'surrender' && b.reason !== 'disconnect') { w.fairWins += 1; w.fairFights += 1; l.fairFights += 1; } // quests count fights that were actually fought
    b.rewards = {};
    this.checkQuests(party, w, direct); this.checkQuests(party, l, direct);
    const rivalry = b.reason === 'disconnect' ? undefined : this.recordH2H(w, l);
    if (b.auto) { this.settleAuto(party, b, w, l, rivalry, direct); return; }
    const scored = b.scored && b.reason !== 'disconnect';
    let bountyText = '';
    if (scored) {
      w.scoredBattlesVs[l.id] = (w.scoredBattlesVs[l.id] ?? 0) + 1;
      l.scoredBattlesVs[w.id] = (l.scoredBattlesVs[w.id] ?? 0) + 1;
      if (l.rating - w.rating >= UPSET_GAP) l.upsetLosses += 1;
      [w.rating, l.rating] = eloUpdate(w.rating, l.rating);
      w.streak += 1; w.bestStreak = Math.max(w.bestStreak, w.streak); l.streak = 0;
      const bounty = b.bountyOn === l.id;
      if (bounty) { w.bounties += 1; bountyText = ' and claimed the BOUNTY 👑'; }
      const streakBonus = Math.min(6, 2 * (w.streak - 1));
      const winPts = BATTLE_REWARDS.win.points * (bounty ? 2 : 1) + streakBonus;
      const lossy = b.reason === 'surrender' || b.reason === 'timeout';
      const rw = this.grant(party, w, winPts, BATTLE_REWARDS.win.xp, direct);
      const rl = lossy ? { levelUp: undefined, unlocked: [], achievements: [] } : this.grant(party, l, BATTLE_REWARDS.lose.points, BATTLE_REWARDS.lose.xp, direct);
      b.rewards[w.id] = { points: winPts, xp: BATTLE_REWARDS.win.xp };
      b.rewards[l.id] = lossy ? { points: 0, xp: 0 } : { ...BATTLE_REWARDS.lose };
      const bonus = [bounty ? '👑 Bounty: double points' : '', streakBonus ? `🔥 ${w.streak}-win streak +${streakBonus}` : ''].filter(Boolean).join(' · ') || undefined;
      direct.push({ to: w.id, msg: { type: 'reward', points: winPts, xp: BATTLE_REWARDS.win.xp, ...rw, title: `Victory over ${l.nickname}`, bonus, battleId: b.id } });
      if (b.rewards[l.id].xp > 0) direct.push({ to: l.id, msg: { type: 'reward', points: BATTLE_REWARDS.lose.points, xp: BATTLE_REWARDS.lose.xp, ...rl, title: `Honourable defeat to ${w.nickname}`, battleId: b.id } });
    } else {
      b.rewards[w.id] = { points: 0, xp: 0 }; b.rewards[l.id] = { points: 0, xp: 0 };
      this.checkAchievements(party, w, direct); this.checkAchievements(party, l, direct);
    }
    const how = b.reason === 'ko' ? 'knocked out' : b.reason === 'rounds' ? 'outlasted' : b.reason === 'surrender' ? 'accepted the surrender of' : 'outstayed';
    this.feed(party, { kind: 'battle', text: `${w.creatureName} (${w.nickname}) ${how} ${l.creatureName} (${l.nickname})${bountyText}${scored ? (w.streak >= 3 ? ` · 🔥${w.streak} streak` : '') : ' (friendly)'}`, playerId: w.id, emoji: bountyText ? '👑' : '🏆', battleId: b.id });
    if (rivalry) this.feed(party, { kind: 'battle', text: rivalry, emoji: '⚔️' });
  }

  /** Head-to-head record. Returns a rivalry line every third meeting. */
  private recordH2H(w: PlayerState, l: PlayerState): string | undefined {
    const wr = (w.h2h[l.id] ??= { w: 0, l: 0 }); const lr = (l.h2h[w.id] ??= { w: 0, l: 0 });
    wr.w += 1; lr.l += 1;
    const met = wr.w + wr.l;
    if (met < 3 || met % 3 !== 0) return undefined;
    if (wr.w === wr.l) return `RIVALRY: ${w.nickname} and ${l.nickname} have met ${met} times. Dead level at ${wr.w} apiece.`;
    const [lead, trail, x, y] = wr.w > wr.l ? [w, l, wr.w, wr.l] : [l, w, wr.l, wr.w];
    return `RIVALRY: ${lead.nickname} leads ${trail.nickname} ${x}–${y} after ${met} meetings.`;
  }

  /** Auto-battle payout: XP (through the normal grant), rating, streaks and records. Never weekend points or bounties. */
  private settleAuto(party: PartyState, b: Battle, w: PlayerState, l: PlayerState, rivalry: string | undefined, direct: Outbound[]) {
    if (l.rating - w.rating >= UPSET_GAP) l.upsetLosses += 1;
    [w.rating, l.rating] = eloUpdate(w.rating, l.rating);
    w.streak += 1; w.bestStreak = Math.max(w.bestStreak, w.streak); l.streak = 0;
    const rw = this.grant(party, w, AUTO_REWARDS.win.points, AUTO_REWARDS.win.xp, direct);
    const rl = this.grant(party, l, AUTO_REWARDS.lose.points, AUTO_REWARDS.lose.xp, direct);
    b.rewards = { [w.id]: { ...AUTO_REWARDS.win }, [l.id]: { ...AUTO_REWARDS.lose } };
    const ws = b.a.playerId === w.id ? b.a : b.b;
    const close = ws.hp / ws.maxHp < 0.25;
    const at = this.now();
    for (const [p, o, won, r] of [[w, l, true, rw], [l, w, false, rl]] as const) {
      const ev: AwayEvent = { id: `aw_${b.id}_${p.id}`, at, kind: 'auto', battleId: b.id, opponentId: o.id, won, close, xp: won ? AUTO_REWARDS.win.xp : AUTO_REWARDS.lose.xp, levelUp: r.levelUp, evolved: r.evolved, rivalry };
      p.away = [...p.away.filter((e) => e.id !== ev.id), ev].slice(-AWAY_LIMIT);
      if (p.online) direct.push({ to: p.id, msg: { type: 'toast', text: won ? `Your ${p.creatureName} auto-battled ${o.nickname}'s ${o.creatureName} and WON (+${ev.xp} XP)` : `Your ${p.creatureName} auto-battled ${o.nickname}'s ${o.creatureName} and lost${close ? ' (close one)' : ''} (+${ev.xp} XP)`, emoji: won ? '🤖' : '🩹', tone: won ? 'success' : 'info' } });
    }
    const how = b.reason === 'ko' ? (close ? 'just edged out' : 'flattened') : 'outlasted';
    this.feed(party, { kind: 'battle', text: `🤖 AUTO-BATTLE: ${w.creatureName} (${w.nickname}) ${how} ${l.creatureName} (${l.nickname})${w.streak >= 3 ? ` · 🔥${w.streak} streak` : ''}`, playerId: w.id, emoji: '🤖', battleId: b.id });
    if (rivalry) this.feed(party, { kind: 'battle', text: rivalry, emoji: '⚔️' });
  }

  private surrender(playerId: string, battleId: string): HandleResult {
    const party = this.partyOf(playerId);
    const b = party?.battles[battleId];
    if (!party || !b || b.status !== 'active') return this.fail('That battle is not live.');
    if (b.a.playerId !== playerId && b.b.playerId !== playerId) return this.fail('Not your battle.');
    const other = b.a.playerId === playerId ? b.b.playerId : b.a.playerId;
    const direct: Outbound[] = [];
    finish(b, other, playerId, 'surrender', this.now());
    this.settleBattle(party, b, direct);
    return this.ok(party, undefined, direct);
  }

  /** Periodic housekeeping: battles, raids, auto-Saturday, group challenges, disputes, swaps. Keeps the game running with no host. */
  tick(): { changed: string[]; direct: Outbound[] } {
    const now = this.now();
    const changed: string[] = []; const direct: Outbound[] = [];
    for (const party of Object.values(this.state.parties)) {
      let dirty = false;
      for (const b of Object.values(party.battles)) {
        if (b.status === 'challenge' && now - b.createdAt > CHALLENGE_TTL_MS) { b.status = 'expired'; b.finishedAt = now; dirty = true; }
        if (b.status === 'active' && b.quick && b.roundDeadline && now >= b.roundDeadline) { this.resolveQuick(party, b, direct); dirty = true; continue; }
        if (b.status === 'active' && b.roundDeadline && now >= b.roundDeadline) {
          const pa = party.players[b.a.playerId]; const pb = party.players[b.b.playerId];
          if (!b.a.action && pa) pa.missedRounds += 1; else if (pa) pa.missedRounds = 0;
          if (!b.b.action && pb) pb.missedRounds += 1; else if (pb) pb.missedRounds = 0;
          if (pa && pa.missedRounds >= 3) { finish(b, b.b.playerId, b.a.playerId, 'timeout', now); this.settleBattle(party, b, direct); }
          else if (pb && pb.missedRounds >= 3) { finish(b, b.a.playerId, b.b.playerId, 'timeout', now); this.settleBattle(party, b, direct); }
          else this.resolveBattleRound(party, b, direct);
          dirty = true;
        }
      }
      for (const [id, b] of Object.entries(party.battles)) if (b.finishedAt && now - b.finishedAt > 6 * 3600_000 && Object.keys(party.battles).length > 60) delete party.battles[id];
      // Giveaway windows
      for (const g of party.giveaways) if (g.status === 'active' && g.endsAt && now >= g.endsAt) { this.settleGiveaway(party, g, now); dirty = true; }
      // Raid timer
      const raid = party.raids[party.raids.length - 1];
      if (raid && raid.status === 'active' && now >= raid.endsAt) { this.endRaid(party, raid, 'escaped', direct); dirty = true; }
      if (party.rowdy && !party.rowdy.revealed && now >= party.rowdy.endsAt) { this.revealRowdy(party, direct); dirty = true; }
      if (party.rowdy?.revealed && now - party.rowdy.endsAt > 90_000) { party.rowdy = null; dirty = true; }
      if (party.olympics.current?.status === 'locked' && now - (party.olympics.current.lockedAt ?? now) > 40_000) { party.olympics.current = null; dirty = true; }
      // run sheet: nudge the host once when an item's time arrives (they still press the button)
      const due = nextItem(party.runSheet, now);
      if (due && now >= due.at && !due.nudgedAt) { due.nudgedAt = now; direct.push({ to: party.hostId, msg: { type: 'toast', text: `⏰ Run sheet: ${due.label}. Tap it on your Lobby when ready.`, emoji: RUN_ACTIONS[due.action].emoji, tone: 'warn' } }); dirty = true; }
      // Saturday turns up on its own at 5am Sydney time
      if (party.autoSaturdayAt && now >= party.autoSaturdayAt) {
        if (party.phase === 'friday' || party.phase === 'lobby') { this.applyPhase(party, 'saturday', direct, true); }
        party.autoSaturdayAt = null; dirty = true;
      }
      // A new group challenge every so often
      if (party.nextGroupAt && now >= party.nextGroupAt && this.activePhase(party)) {
        const phase = this.activePhase(party)!;
        const next = GROUP_MISSIONS.find((m) => !party.revealedGroupMissions.includes(m.id) && missionAvailableInPhase(m, phase));
        if (next) { this.revealGroup(party, next.id, direct); party.nextGroupAt = now + GROUP_EVERY_MS; }
        else party.nextGroupAt = null;
        dirty = true;
      }
      // BS calls nobody backed get struck out; photo checks nobody settled resolve in the snapper's favour
      for (const c of Object.values(party.claims)) {
        if (c.status === 'disputed' && c.disputedAt && now - c.disputedAt >= DISPUTE_TIMEOUT_MS) { this.resolve(party, c, false, direct, undefined, 'timeout'); dirty = true; }
        if (c.status === 'pending' && c.review === 'vote' && now - c.createdAt >= PHOTO_VOTE_TIMEOUT_MS) { this.resolve(party, c, (c.votesUp?.length ?? 0) >= (c.votesDown?.length ?? 0), direct, undefined, 'timeout'); dirty = true; }
        if (c.status === 'pending' && c.review === 'host' && now - c.createdAt >= PHOTO_HOST_TIMEOUT_MS) { this.resolve(party, c, true, direct, undefined, 'timeout'); dirty = true; }
      }
      if (this.runAutoBattles(party, now, direct)) dirty = true;
      // Swap tokens refill; stale challenges rotate out
      for (const p of Object.values(party.players)) {
        if (p.removed) continue;
        if (this.refillRerolls(p)) dirty = true;
        if (p.quests.some((q) => !q.done)) { const n = direct.length; this.checkQuests(party, p, direct); if (direct.length !== n) dirty = true; } // witness confirms, vote timeouts: whoever moved the stat, the quest lands
        if (p.creature && this.activePhase(party)) {
          const stale = p.hand.filter((h) => h.status === 'active' && !MISSION_BY_ID[h.missionId]?.starter && now - h.assignedAt > HAND_EXPIRE_MS);
          if (stale.length) { p.hand = p.hand.filter((h) => !stale.includes(h)); this.refillHand(party, p); dirty = true; }
        }
      }
      if (dirty) { party.seq++; changed.push(party.code); }
    }
    return { changed, direct };
  }

  private revealGroup(party: PartyState, missionId: string, direct: Outbound[]) {
    const m = MISSION_BY_ID[missionId];
    if (!m || party.revealedGroupMissions.includes(m.id)) return;
    party.revealedGroupMissions.push(m.id);
    this.feed(party, { kind: 'group', text: `GROUP CHALLENGE LIVE: ${m.title}. Optional, everyone who's in claims it.`, emoji: '🫂' });
    direct.push({ to: 'party', msg: { type: 'toast', text: `Group challenge live: ${m.title}`, emoji: '🫂', tone: 'info' } });
  }

  /** The lads who joined the app early but haven't really played yet (they're arriving Saturday) get the same catch-up as a
   *  Saturday joiner: Fresh Legs plus double XP until they reach the group's middle level. The intro doesn't count. */
  private lateArrivalsCatchUp(party: PartyState, direct: Outbound[]) {
    const names: string[] = [];
    for (const p of Object.values(party.players)) {
      if (p.removed || !p.creature || p.catchUp) continue;
      if (p.completedMissionIds.filter((id) => !TUTORIAL_IDS.has(id)).length >= LATE_ARRIVAL_BELOW) continue;
      this.giveCatchUp(p, party, direct);
      names.push(p.nickname);
      direct.push({ to: p.id, msg: { type: 'toast', text: `🦵 Fresh Legs: double points on your next ${FRESH_LEGS} challenges, double XP till you catch the lads.`, emoji: '🦵', tone: 'success' } });
    }
    if (names.length) this.feed(party, { kind: 'host', text: `🦵 Fresh Legs for ${names.join(', ')}: double points on their first ${FRESH_LEGS} challenges.`, emoji: '🦵' });
  }

  private giveCatchUp(p: PlayerState, party?: PartyState, direct?: Outbound[]) {
    const first = !p.welcomeDrop;
    p.catchUp = true;
    p.freshLegs = Math.max(p.freshLegs, FRESH_LEGS);
    if (party && direct && first) { p.welcomeDrop = true; this.addDrop(party, p, 'gift', 'rare', direct); } // one welcome drop for the late lads, however often the switch is flipped
  }

  private applyPhase(party: PartyState, phase: Phase, direct: Outbound[], auto = false) {
    const prev = party.phase;
    party.phase = phase;
    if (phase === 'friday' || phase === 'saturday') {
      party.missionsOpen = true;
      if (phase === 'saturday' && prev === 'friday') party.fridayPoints = Object.fromEntries(Object.values(party.players).map((p) => [p.id, p.points]));
      if (!party.nextGroupAt) party.nextGroupAt = this.now() + FIRST_GROUP_DELAY_MS;
      for (const p of Object.values(party.players)) { if (p.removed) continue; p.rerollsLeft = REROLLS_PER_PHASE; p.rerollRefillAt = 0; if (p.creature) this.refillHand(party, p); }
    }
    if (phase === 'finale' || phase === 'ended' || phase === 'lobby') party.missionsOpen = false;
    if (phase === 'saturday') party.autoSaturdayAt = null;
    if (phase === 'saturday' && prev !== 'saturday') {
      this.lateArrivalsCatchUp(party, direct);
      for (const p of Object.values(party.players)) if (p.creature && !p.removed && !p.quests.length) this.assignQuests(party, p);
      this.feed(party, { kind: 'phase', text: '📜 SATURDAY QUESTS are out: three each, big points and a Lucky Drop for every one you finish.', emoji: '📜' });
      if (!party.mole) this.assignMole(party, undefined, direct);
      for (const p of Object.values(party.players)) if (p.online) this.morningDrop(party, p);
    }
    const labels: Record<Phase, string> = {
      lobby: 'The game is paused in the lobby.',
      friday: 'FRIDAY is live. Challenges are on.',
      saturday: `${auto ? 'Morning, legends. ' : ''}SATURDAY: THE CHAMPIONSHIP. Final evolutions unlocked.`,
      finale: 'THE FINALE. Awards incoming.',
      ended: 'That\'s a wrap. Legends, every one of you.',
    };
    this.feed(party, { kind: 'phase', text: labels[phase], emoji: phase === 'saturday' ? '☀️' : '📣' });
    direct.push({ to: 'party', msg: { type: 'toast', text: labels[phase], emoji: phase === 'saturday' ? '☀️' : '📣', tone: 'info' } });
  }

  // ---------- host ----------
  /** Everything worth keeping from the weekend. Photos are every one still on the server that wasn't voted out. */
  keepsake(party: PartyState): Keepsake {
    const nick = (id: string) => party.players[id]?.nickname ?? 'Someone';
    const players = Object.values(party.players).filter((x) => !x.removed && x.creature);
    return {
      name: party.name, code: party.code,
      board: sortLeaderboard(players).map((x) => ({ nickname: x.nickname, creatureName: x.creatureName, level: x.level, points: x.points, missions: x.missionsCompleted, wins: x.wins, losses: x.losses })),
      awards: computeAwards(players.map(toPublic), Object.values(party.battles), party.awardOverrides).map((a) => ({ name: a.name, winner: a.playerId ? nick(a.playerId) : 'Nobody', reason: a.reason })),
      wall: party.wall.filter((w) => !w.hidden).map((w) => ({ author: nick(w.playerId), kind: w.kind, text: w.text, votes: w.votes.length, groomLove: w.groomLove, at: w.at })).sort((a, b) => b.votes + (b.groomLove ? 3 : 0) - (a.votes + (a.groomLove ? 3 : 0))),
      cellar: party.cellar.map((e) => ({ author: nick(e.playerId), drink: e.drink, stars: e.stars, note: e.note, fires: e.fires.length, at: e.at })),
      photos: [
        ...Object.values(party.claims).filter((c) => c.photoUrl && c.status !== 'rejected').map((c) => ({ url: c.photoUrl!, caption: MISSION_BY_ID[c.missionId]?.title ?? 'Challenge', author: nick(c.playerId), at: c.createdAt })),
        ...party.cellar.filter((e) => e.photoUrl).map((e) => ({ url: e.photoUrl!, caption: `Cellar - ${e.drink}`, author: nick(e.playerId), at: e.at })),
      ].sort((a, b) => a.at - b.at),
      stats: sortLeaderboard(players).map((x) => ({
        nickname: x.nickname, creature: x.creature ? CREATURES[x.creature].name : '', creatureName: x.creatureName, level: x.level, points: x.points, missions: x.missionsCompleted,
        photos: Object.values(party.claims).filter((c) => c.playerId === x.id && c.photoUrl && c.status !== 'rejected').length,
        wins: x.wins, losses: x.losses, bestStreak: x.bestStreak, bounties: x.bounties, upsets: x.upsetLosses, laughs: x.laughs, fires: x.fires, groomLoves: x.groomLoves,
        reactionsGiven: x.reactionsGiven, wallPosts: party.wall.filter((w) => w.playerId === x.id && !w.hidden).length, wallVotes: x.wallVotes, cellarReviews: x.cellarCount, cellarFires: x.cellarFires,
        raidDamage: x.raidDamage, raidsJoined: x.raidsJoined, epicsDone: x.epicsDone, witnessed: x.witnessed, badges: x.achievements.length, items: x.unlocked.length,
        joined: x.joinedPhase, categories: Object.entries(x.categoryCounts).filter(([, n]) => n).map(([c, n]) => `${c} ${n}`).join(' · '),
        h2h: Object.entries(x.h2h).map(([id, r]) => `${nick(id)} ${r.w}-${r.l}`).join(' · '),
      })),
      feed: (party.log ?? party.feed).map((f) => ({ at: f.at, kind: f.kind, text: f.text, who: f.playerId ? nick(f.playerId) : undefined })),
    };
  }

  /** The party a download link was made for, while it's still fresh. */
  exportCodeFor(token: string): string | null {
    const v = this.exportTokens.get(String(token ?? ''));
    if (!v || v.exp < this.now() || !this.state.parties[v.code]) return null;
    return v.code;
  }

  private hostAction(playerId: string, action: HostAction): HandleResult {
    const party = this.partyOf(playerId);
    if (!party) return this.fail('Join a party first.');
    if (party.hostId !== playerId) return this.fail('Host only. Nice try.');
    const direct: Outbound[] = [];
    switch (action.kind) {
      case 'setPhase': {
        const order: Phase[] = ['lobby', 'friday', 'saturday', 'finale', 'ended'];
        if (!order.includes(action.phase)) return this.fail('Unknown phase.');
        this.applyPhase(party, action.phase, direct);
        return this.ok(party, undefined, direct);
      }
      case 'setMissionsOpen': {
        party.missionsOpen = !!action.open;
        this.feed(party, { kind: 'host', text: action.open ? 'Missions are OPEN.' : 'Missions are paused by the host.', emoji: action.open ? '🟢' : '⏸️' });
        return this.ok(party);
      }
      case 'revealGroupMission': {
        const m = MISSION_BY_ID[action.missionId];
        if (!m || m.scope !== 'group') return this.fail('Not a group challenge.');
        this.revealGroup(party, m.id, direct);
        return this.ok(party, undefined, direct);
      }
      case 'resolveClaim': {
        const claim = party.claims[action.claimId];
        if (!claim || (claim.status !== 'pending' && claim.status !== 'disputed')) return this.fail('That claim is not waiting on you.');
        this.resolve(party, claim, !!action.approve, direct);
        return this.ok(party, undefined, direct);
      }
      case 'removePlayer': {
        const p = party.players[action.playerId];
        if (!p || p.id === playerId) return this.fail('Cannot remove that player.');
        p.removed = true; p.online = false;
        for (const b of Object.values(party.battles)) {
          if (b.status === 'active' && (b.a.playerId === p.id || b.b.playerId === p.id)) this.endBattle(party, b, b.a.playerId === p.id ? b.b.playerId : b.a.playerId, p.id, 'disconnect');
          if (b.status === 'challenge' && (b.challengerId === p.id || b.opponentId === p.id)) b.status = 'expired';
        }
        delete this.state.playerParty[p.id];
        this.feed(party, { kind: 'host', text: `${p.nickname} was escorted out of the vineyard.`, emoji: '🚪' });
        direct.push({ to: p.id, msg: { type: 'kicked', reason: 'The host removed you from the party.' } });
        return this.ok(party, undefined, direct);
      }
      case 'renamePlayer': {
        const p = party.players[action.playerId];
        if (!p) return this.fail('No such player.');
        const others = Object.values(party.players).filter((x) => x.id !== p.id && !x.removed).map((x) => x.nickname);
        const v = validateNickname(action.nickname, others, { allowReserved: true });
        if (!v.ok) return this.fail(v.error);
        const old = p.nickname; p.nickname = v.name;
        this.feed(party, { kind: 'host', text: `${old} is now known as ${v.name}.`, emoji: '✏️' });
        direct.push({ to: p.id, msg: { type: 'toast', text: `The host renamed you to ${v.name}.`, emoji: '✏️', tone: 'warn' } });
        return this.ok(party, undefined, direct);
      }
      case 'resetClaim': {
        const p = party.players[action.playerId];
        const m = MISSION_BY_ID[action.missionId];
        if (!p || !m) return this.fail('No such player or mission.');
        const claim = Object.values(party.claims).find((c) => c.playerId === p.id && c.missionId === m.id && c.status === 'approved');
        if (!claim) return this.fail('No approved claim to reset.');
        claim.status = 'rejected'; claim.resolvedAt = this.now();
        p.completedMissionIds = p.completedMissionIds.filter((x) => x !== m.id);
        p.missionsCompleted = Math.max(0, p.missionsCompleted - 1);
        p.categoryCounts[m.category] = Math.max(0, (p.categoryCounts[m.category] ?? 1) - 1);
        p.points = Math.max(0, p.points - m.points); p.xp = Math.max(0, p.xp - m.xp); p.level = levelForXp(p.xp);
        p.hand = p.hand.filter((h) => h.missionId !== m.id);
        if (m.scope === 'private') { p.hand.push({ missionId: m.id, assignedAt: this.now(), status: 'active' }); p.hand = p.hand.slice(-HAND_SIZE); }
        this.feed(party, { kind: 'host', text: `The host reset "${m.title}" for ${p.nickname}.`, emoji: '↩️' });
        direct.push({ to: p.id, msg: { type: 'toast', text: `The host reset "${m.title}". It's back in your hand.`, emoji: '↩️', tone: 'warn' } });
        return this.ok(party, undefined, direct);
      }
      case 'grantPoints': {
        const p = party.players[action.playerId];
        const pts = Math.max(-100, Math.min(100, Math.round(Number(action.points) || 0)));
        if (!p || !pts) return this.fail('Pick a player and a non-zero amount (±100).');
        this.grant(party, p, pts, 0, direct);
        const reason = (action.reason ?? '').trim().slice(0, 60) || 'host decree';
        this.feed(party, { kind: 'host', text: `${p.nickname} ${pts > 0 ? 'gains' : 'loses'} ${Math.abs(pts)} pts: ${reason}.`, emoji: pts > 0 ? '🎁' : '⚖️' });
        direct.push({ to: p.id, msg: { type: 'toast', text: `${pts > 0 ? '+' : ''}${pts} points from the host: ${reason}`, emoji: pts > 0 ? '🎁' : '⚖️', tone: pts > 0 ? 'success' : 'warn' } });
        return this.ok(party, undefined, direct);
      }
      case 'setAward': {
        if (action.playerId && !party.players[action.playerId]) return this.fail('No such player.');
        party.awardOverrides[action.awardId] = action.playerId;
        return this.ok(party);
      }
      case 'finalize': {
        party.finalized = !!action.finalized;
        if (party.finalized) { party.phase = 'ended'; party.missionsOpen = false; this.feed(party, { kind: 'phase', text: 'Results are FINAL. Legends have been crowned.', emoji: '👑' }); }
        return this.ok(party);
      }
      case 'setHostPin': {
        const pin = String(action.pin ?? '').trim();
        if (!PIN_RE.test(pin)) return this.fail('Host PIN must be 4 to 6 digits.');
        party.hostPinHash = hashPin(party.code, pin);
        return this.ok(party);
      }
      case 'setCatchUp': {
        const t = party.players[action.playerId];
        if (!t || t.removed) return this.fail('No such player.');
        if (action.on) {
          this.giveCatchUp(t, party, direct);
          this.feed(party, { kind: 'host', text: `🦵 The host gave ${t.nickname} Fresh Legs: double points on their next ${FRESH_LEGS} challenges.`, emoji: '🦵' });
          direct.push({ to: t.id, msg: { type: 'toast', text: `🦵 Fresh Legs from the host: double points on your next ${FRESH_LEGS} challenges, double XP till you catch the lads.`, emoji: '🦵', tone: 'success' } });
        } else { t.catchUp = false; t.freshLegs = 0; }
        return this.ok(party, undefined, direct);
      }
      case 'setGroom': {
        const g = party.players[action.playerId];
        if (!g || g.removed) return this.fail('No such player.');
        party.groomId = g.id;
        this.feed(party, { kind: 'host', text: `🤵 ${g.nickname} is officially the groom. Hearts unlocked.`, emoji: '🤵' });
        this.crownGroom(party);
        return this.ok(party);
      }
      case 'summonRaid': {
        const phase = this.activePhase(party);
        if (!phase) return this.fail('Raids only run on Friday or Saturday.');
        if (this.liveRaid(party)) return this.fail('A raid is already on.');
        this.spawnRaid(party, phase, direct);
        return this.ok(party, undefined, direct);
      }
      case 'purgePhotos': {
        const urls: string[] = [];
        for (const e of party.cellar) if (e.photoUrl) { urls.push(e.photoUrl); e.photoUrl = undefined; }
        for (const c of Object.values(party.claims)) if (c.photoUrl) { if (c.status === 'pending' && c.review) this.withdrawPending(party, c); urls.push(c.photoUrl); c.photoUrl = undefined; }
        for (const f of party.feed) if (f.photoUrl) { if (!urls.includes(f.photoUrl)) urls.push(f.photoUrl); f.photoUrl = undefined; }
        for (const pl of Object.values(party.players)) if (pl.avatarUrl) { urls.push(pl.avatarUrl); pl.avatarUrl = undefined; }
        this.deletePhotos(urls);
        this.feed(party, { kind: 'host', text: `The host deleted ${urls.length} photo${urls.length === 1 ? '' : 's'} from the server. What happens in the vineyard…`, emoji: '🗑️' });
        return this.ok(party, { deleted: urls.length });
      }
      case 'setPhotoMode': {
        if (!['vote', 'host', 'instant'].includes(action.mode)) return this.fail('Unknown photo mode.');
        party.photoMode = action.mode;
        const label = { vote: 'Photos now go to a vote: two 👍 and they count.', host: 'Photos now go to the host for a tick.', instant: 'Photos now count straight away.' }[action.mode];
        this.feed(party, { kind: 'host', text: label, emoji: '📸' });
        return this.ok(party);
      }
      case 'postEpic': {
        const preset = action.presetId ? EPIC_PRESET_BY_ID[action.presetId] : undefined;
        if (action.presetId && !preset) return this.fail('Unknown job.');
        const title = (preset?.title ?? String(action.title ?? '')).replace(/\s+/g, ' ').trim().slice(0, 40);
        const instruction = (preset?.instruction ?? String(action.instruction ?? '')).replace(/\s+/g, ' ').trim().slice(0, 130);
        if (title.length < 3) return this.fail('Give the job a name.');
        if (!isClean(title) || !isClean(instruction)) return this.fail('Keep it clean, boss.');
        const max = Math.max(1, Math.min(EPIC_MAX_CREW, Math.round(Number(preset?.max ?? action.max ?? 2))));
        const min = Math.max(1, Math.min(max, Math.round(Number(preset?.min ?? action.min ?? max))));
        if (party.epics.some((x) => x.status === 'open' && x.title.toLowerCase() === title.toLowerCase())) return this.fail('That one is already up.');
        const now = this.now();
        const tier = preset?.tier ?? (isEpicTier(action.tier) ? action.tier : 'medium');
        const e: Epic = { id: `ep_${now.toString(36)}_${Math.floor(this.rng() * 1e6).toString(36)}`, presetId: preset?.id, title, instruction: instruction || 'Help the lads out.', emoji: preset?.emoji ?? '🟣', min, max, item: preset?.item ?? EPIC_CUSTOM_ITEM, tier, points: EPIC_TIERS[tier].points, xp: EPIC_TIERS[tier].xp, crew: [], status: 'open', createdAt: now };
        party.epics.push(e);
        if (party.epics.length > 60) party.epics = party.epics.slice(-60);
        const spots = min === max ? `${max} spot${max === 1 ? '' : 's'}` : `${min}–${max} spots`;
        this.feed(party, { kind: 'epic', text: `🟣 EPIC TASK: ${e.title} (${spots}). First in!`, emoji: e.emoji });
        direct.push({ to: 'party', msg: { type: 'toast', text: `🟣 EPIC TASK: ${e.title}. ${spots}, first in gets it.`, emoji: e.emoji, tone: 'info' } });
        return this.ok(party, { id: e.id }, direct);
      }
      case 'makeCode': {
        if (!COSMETIC_BY_ID[action.item]) return this.fail('Pick an accessory.');
        if (STARTER_COSMETICS.includes(action.item)) return this.fail(`Everyone already has ${theItem(COSMETIC_BY_ID[action.item])}. Pick something they have to earn.`);
        const uses = Math.max(1, Math.min(20, Math.round(Number(action.uses ?? 1)) || 1));
        let code = '';
        for (let i = 0; i < 20; i++) {
          code = 'JEZZA-' + Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(this.rng() * CODE_ALPHABET.length)]).join('');
          if (!party.codes.some((x) => x.code === code)) break;
        }
        party.codes.push({ code, item: action.item, uses, redeemedBy: [], createdAt: this.now() });
        if (party.codes.length > 100) party.codes = party.codes.slice(-100);
        return this.ok(party, { code });
      }
      case 'deleteCode': {
        const before = party.codes.length;
        party.codes = party.codes.filter((x) => x.code !== action.code);
        if (party.codes.length === before) return this.fail('No such code.');
        return this.ok(party);
      }
      case 'makeGiveaway': {
        const cos = COSMETIC_BY_ID[action.item];
        if (!cos) return this.fail('Pick an accessory.');
        if (STARTER_COSMETICS.includes(action.item)) return this.fail(`Everyone already has ${theItem(cos)}. Pick something they have to earn.`);
        const qty = Math.max(1, Math.min(GIVEAWAY_MAX_QTY, Math.round(Number(action.qty ?? 1)) || 1));
        const title = String(action.title ?? '').trim().slice(0, 60) || `${cos.name} up for grabs`;
        const minutes = Math.round(Number(action.minutes ?? 0)) || 0;
        const now = this.now();
        // A double tap (or a retry after a slow ack) must not release the same thing twice
        const dup = party.giveaways.find((g) => g.status === 'active' && g.item === action.item && now - g.createdAt < 15_000);
        if (dup) return this.ok(party, { id: dup.id, duplicate: true });
        const g: Giveaway = { id: `ga_${now.toString(36)}_${Math.floor(this.rng() * 1e6).toString(36)}`, item: action.item, title, qty, claims: [], status: 'active', createdAt: now, endsAt: minutes > 0 ? now + Math.min(minutes, 24 * 60) * 60_000 : null };
        party.giveaways.push(g);
        if (party.giveaways.length > 50) party.giveaways = party.giveaways.slice(-50);
        this.feed(party, { kind: 'unlock', text: `🎁 UP FOR GRABS: ${qty}× ${cos.name}. First in, first served.`, emoji: '🎁' });
        direct.push({ to: 'party', msg: { type: 'toast', text: action.title?.trim() ? `🎁 ${title}: ${qty}× ${cos.name} up for grabs. Quick!` : `🎁 ${qty}× ${cos.name} up for grabs. Quick!`, emoji: '🎁', tone: 'info' } });
        return this.ok(party, { id: g.id }, direct);
      }
      case 'xpBoost': {
        const minutes = Math.max(5, Math.min(180, Math.round(Number(action.minutes ?? 30)) || 30));
        const now = this.now();
        party.xpBoostUntil = now + minutes * 60_000;
        this.feed(party, { kind: 'phase', text: `⚡ DOUBLE XP for the next ${minutes} minutes. Everything you do counts twice for your creature.`, emoji: '⚡' });
        direct.push({ to: 'party', msg: { type: 'toast', text: `⚡ Double XP for ${minutes} minutes. Go!`, emoji: '⚡', tone: 'success' } });
        return this.ok(party, { until: party.xpBoostUntil }, direct);
      }
      case 'giveDrops': {
        const rarity = action.rarity && RARITIES.includes(action.rarity) ? action.rarity : undefined;
        const targets = Object.values(party.players).filter((p) => !p.removed && p.creature && (!action.playerId || p.id === action.playerId));
        if (!targets.length) return this.fail('Nobody to give it to.');
        for (const p of targets) this.addDrop(party, p, 'host', rarity, direct);
        if (targets.length === 1) direct.push({ to: targets[0].id, msg: { type: 'toast', text: `🎁 The host sent you a ${rarity ? RARITY[rarity].label : 'Lucky'} Drop. Open it on your Lobby.`, emoji: '🎁', tone: 'success' } });
        if (targets.length > 1) { this.feed(party, { kind: 'unlock', text: `🎁 The host dropped a ${rarity ? RARITY[rarity].label : 'Lucky'} Drop on everyone. Check your Lobby.`, emoji: '🎁' }); direct.push({ to: 'party', msg: { type: 'toast', text: '🎁 A Lucky Drop just landed for everyone. Tap it on your Lobby.', emoji: '🎁', tone: 'success' } }); }
        return this.ok(party, { given: targets.length }, direct);
      }
      case 'assignMole': {
        if (party.mole && !party.mole.revealed) {
          if (!action.playerId) return this.fail('The Moles are already in play. Reveal them first, or pick a lad to add.');
          if (party.mole.moles.length >= MOLE_MAX) return this.fail(`${MOLE_MAX} Moles is plenty.`);
          if (party.mole.moles.some((m) => m.playerId === action.playerId)) return this.fail('They are already a Mole.');
          const extra = party.players[action.playerId];
          if (!extra || extra.removed || !extra.creature) return this.fail('Pick a lad with a creature.');
          party.mole.moles.push({ playerId: extra.id, missions: this.moleMissions(party.mole) });
          direct.push({ to: extra.id, msg: { type: 'toast', text: '🕵️ YOU are a Mole now. Shh. Your secret missions are on the Challenges tab.', emoji: '🕵️', tone: 'warn' } });
          return this.ok(party, { playerIds: party.mole.moles.map((m) => m.playerId) }, direct);
        }
        const ok = this.assignMole(party, action.playerId, direct, action.count);
        if (!ok) return this.fail('Need at least four lads with creatures (not the host or the groom) for a Mole.');
        return this.ok(party, { playerIds: party.mole!.moles.map((m) => m.playerId) }, direct);
      }
      case 'revealMole': {
        const m = party.mole;
        if (!m || m.revealed) return this.fail('No Mole to reveal.');
        const voters = Object.entries(m.votes).filter(([v]) => party.players[v] && !party.players[v].removed);
        const isMole = (id: string) => m.moles.some((x) => x.playerId === id);
        m.caught = {}; m.revealed = true; m.revealedAt = this.now();
        for (const mole of m.moles) { const named = voters.filter(([, s]) => s.includes(mole.playerId)).length; m.caught[mole.playerId] = voters.length > 0 && named * 2 > voters.length; }
        // a point bonus per correct name: naming both Moles pays twice
        const correct = voters.filter(([, s]) => s.some(isMole)).map(([v]) => v);
        for (const [v, s] of voters) { const vp = party.players[v]; const n = s.filter(isMole).length; if (vp && n) this.grant(party, vp, MOLE_POINTS.correctGuess * n, 0, direct); }
        let done = 0; const names: string[] = [];
        for (const mole of m.moles) {
          const mp = party.players[mole.playerId]; const c = m.caught[mole.playerId];
          if (mp) this.grant(party, mp, c ? MOLE_POINTS.caught : MOLE_POINTS.escaped, 0, direct);
          done += mole.missions.filter((x) => x.done).length;
          names.push(`${mp?.nickname?.toUpperCase() ?? '?'} (${c ? 'caught' : 'got away with it'})`);
        }
        const total = m.moles.reduce((n, x) => n + x.missions.length, 0);
        const plural = m.moles.length > 1;
        this.feed(party, { kind: 'phase', text: `🕵️ THE MOLE${plural ? 'S WERE' : ' WAS'} ${names.join(' and ')}. ${correct.length} of ${voters.length} voters named ${plural ? 'at least one' : 'them'} (+${MOLE_POINTS.correctGuess} a name). ${done}/${total} secret missions pulled off.`, emoji: '🕵️' });
        direct.push({ to: 'party', msg: { type: 'toast', text: `🕵️ The Mole${plural ? 's' : ''}: ${m.moles.map((x) => party.players[x.playerId]?.nickname ?? '?').join(' & ')}!`, emoji: '🕵️', tone: 'warn' } });
        return this.ok(party, { moles: m.moles.map((x) => ({ playerId: x.playerId, caught: m.caught![x.playerId] })), correct: correct.length, voters: voters.length }, direct);
      }
      case 'setSpotlight': {
        if (action.clear) { party.spotlight = null; return this.ok(party, undefined, direct); }
        const cur = party.spotlight;
        const label = String(action.label ?? cur?.label ?? 'The Loser\'s Speech').replace(/\s+/g, ' ').trim().slice(0, 40) || 'The moment';
        if (!isClean(label)) return this.fail('Keep it clean.');
        const seconds = Math.max(10, Math.min(3600, Math.round(Number(action.seconds ?? cur?.seconds ?? 120)) || 120));
        const at = Number.isFinite(Number(action.at)) && Number(action.at) > 0 ? Number(action.at) : cur?.at ?? this.now();
        const playerId = action.playerId === null ? undefined : action.playerId ?? cur?.playerId;
        if (playerId && !party.players[playerId]) return this.fail('No such lad.');
        const next: Spotlight = { label, at, seconds, playerId, startedAt: action.stop ? undefined : action.start ? this.now() : cur?.startedAt };
        party.spotlight = next;
        if (action.start) {
          const who = playerId ? party.players[playerId]?.nickname : undefined;
          this.feed(party, { kind: 'phase', text: `🎤 ${label.toUpperCase()}${who ? `: ${who.toUpperCase()}` : ''}. ${seconds < 60 ? `${seconds} seconds` : `${Math.round(seconds / 60)} minute${seconds >= 90 ? 's' : ''}`} on the clock. Eyes on the TV.`, emoji: '🎤' });
          direct.push({ to: 'party', msg: { type: 'toast', text: `🎤 ${label}${who ? `: ${who}` : ''}. The clock is running.`, emoji: '🎤', tone: 'warn' } });
        }
        return this.ok(party, { spotlight: next }, direct);
      }
      case 'setTvMode': {
        const mode = action.mode === 'reel' ? 'reel' : 'auto';
        if (mode === party.tvMode) return { ack: { ok: true }, changed: false, direct: [] };
        party.tvMode = mode;
        if (mode === 'reel') this.feed(party, { kind: 'phase', text: '📽️ THE PHOTO REEL is rolling on the TV: every photo of the weekend, from the top.', emoji: '📽️' });
        return this.ok(party, { mode }, direct);
      }
      case 'startRowdy': {
        const kinds = Object.keys(ROWDY_KINDS) as RowdyKind[];
        const kind = action.rowdy && ROWDY_KINDS[action.rowdy] ? action.rowdy : kinds[Math.floor(this.rng() * kinds.length)];
        if (party.rowdy && !party.rowdy.revealed && this.now() < party.rowdy.endsAt) return this.fail('One is already running. End it first.');
        const used = party.rowdyUsed[kind] ?? [];
        let pool = ROWDY_PROMPTS[kind].filter((x) => !used.includes(x));
        if (!pool.length) { party.rowdyUsed[kind] = []; pool = ROWDY_PROMPTS[kind]; }
        const prompt = pool[Math.floor(this.rng() * pool.length)];
        party.rowdyUsed[kind] = [...(party.rowdyUsed[kind] ?? []), prompt];
        const def = ROWDY_KINDS[kind]; const now = this.now();
        party.rowdy = { id: `rw_${now.toString(36)}_${Math.floor(this.rng() * 1e6).toString(36)}`, kind, prompt, startedAt: now, endsAt: now + def.seconds * 1000, votes: {}, revealed: false, used: [] };
        const line = this.rowdyLine(kind, prompt);
        this.feed(party, { kind: 'phase', text: `🍻 ROWDY ROUND · ${def.label}: ${line}`, emoji: def.emoji });
        direct.push({ to: 'party', msg: { type: 'toast', text: `🍻 ${def.label}: ${line}`, emoji: def.emoji, tone: 'warn' } });
        return this.ok(party, { id: party.rowdy.id, kind, prompt }, direct);
      }
      case 'endRowdy': {
        if (!party.rowdy) return this.fail('Nothing running.');
        if (party.rowdy.revealed) { party.rowdy = null; return this.ok(party, undefined, direct); }
        this.revealRowdy(party, direct);
        return this.ok(party, undefined, direct);
      }
      case 'setScorer': {
        const t = party.players[action.playerId];
        if (!t || t.removed) return this.fail('No such lad.');
        t.isScorer = !!action.on;
        if (t.isScorer) { this.feed(party, { kind: 'host', text: `📋 ${t.nickname} is a Scorer: they enter the Bucks Olympics points.`, emoji: '📋' }); direct.push({ to: t.id, msg: { type: 'toast', text: '📋 You are a Scorer. The points pad is on your Lobby.', emoji: '📋', tone: 'success' } }); }
        return this.ok(party, { on: t.isScorer }, direct);
      }
      case 'runSheetSet': {
        const items = (Array.isArray(action.items) ? action.items : []).slice(0, 30).map((it) => {
          const label = String(it.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Next thing';
          const act = RUN_ACTIONS[it.action] ? it.action : 'none';
          const at = Number(it.at); const old = party.runSheet.find((x) => x.id === it.id);
          return { id: old?.id ?? `ri_${this.now().toString(36)}_${Math.floor(this.rng() * 1e6).toString(36)}`, at: Number.isFinite(at) ? at : this.now(), label, action: act, done: old?.done, doneAt: old?.doneAt, nudgedAt: old?.nudgedAt } as RunItem;
        });
        if (items.some((i) => !isClean(i.label))) return this.fail('Keep it clean.');
        party.runSheet = items.sort((a, b) => a.at - b.at);
        return this.ok(party, { count: items.length }, direct);
      }
      case 'runSheetFire': {
        const item = party.runSheet.find((i) => i.id === action.id);
        if (!item) return this.fail('No such item.');
        if (item.done) return this.fail('Already done.');
        const r = this.fireRunItem(party, item, direct);
        if (r) return r; // the underlying action refused: say why, leave the item open
        item.done = true; item.doneAt = this.now();
        return this.ok(party, { id: item.id }, direct);
      }
      case 'teamsMake': {
        const count = Math.max(2, Math.min(6, Math.round(Number(action.count)) || 2));
        const lads = Object.values(party.players).filter((p) => !p.removed && p.creature).sort((a, b) => b.points - a.points);
        if (lads.length < count * 2) return this.fail(`Need at least ${count * 2} lads for ${count} teams.`);
        const label = String(action.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 30) || 'Teams';
        if (!isClean(label)) return this.fail('Keep it clean.');
        const groups = snakeDraft(lads.map((p) => p.id), count);
        party.teams = { createdAt: this.now(), label, baseline: Object.fromEntries(lads.map((p) => [p.id, p.points])), teams: groups.map((members, i) => ({ id: `tm_${i}`, ...TEAM_LOOKS[i], members })) };
        this.feed(party, { kind: 'phase', text: `👥 TEAMS: ${party.teams.teams.map((t) => `${t.emoji} ${t.name}: ${t.members.map((m) => party.players[m]?.nickname ?? '?').join(', ')}`).join(' · ')}. Points from now count for your team.`, emoji: '👥' });
        for (const t of party.teams.teams) for (const m of t.members) direct.push({ to: m, msg: { type: 'toast', text: `${t.emoji} You're on ${t.name} with ${t.members.filter((x) => x !== m).map((x) => party.players[x]?.nickname ?? '?').join(', ')}.`, emoji: '👥', tone: 'success' } });
        return this.ok(party, { teams: party.teams.teams.map((t) => t.members) }, direct);
      }
      case 'teamsSwap': {
        const ts = party.teams; if (!ts) return this.fail('No teams yet.');
        const ta = ts.teams.find((t) => t.members.includes(action.a)); const tb = ts.teams.find((t) => t.members.includes(action.b));
        if (!ta || !tb) return this.fail('Pick two lads who are on teams.');
        if (ta === tb) return this.fail('They are already on the same team.');
        ta.members = ta.members.map((m) => (m === action.a ? action.b : m)); tb.members = tb.members.map((m) => (m === action.b ? action.a : m));
        return this.ok(party, undefined, direct);
      }
      case 'teamsClear': {
        if (!party.teams) return this.fail('No teams.');
        party.teams = null;
        this.feed(party, { kind: 'phase', text: '👥 Teams are dissolved. Every lad for himself again.', emoji: '👥' });
        return this.ok(party, undefined, direct);
      }
      case 'setCeremony': {
        const n = Math.max(0, Math.min(40, Math.round(Number(action.revealed)) || 0));
        if (n === party.ceremony) return { ack: { ok: true }, changed: false, direct: [] };
        party.ceremony = n;
        return this.ok(party, { revealed: n }, direct);
      }
      case 'liftXpCap': {
        if (party.capLifted) return this.fail('Final forms are already unlocked.');
        party.capLifted = true;
        this.feed(party, { kind: 'phase', text: '🧬 The host has unlocked FINAL FORMS early. Level 8 is open tonight.', emoji: '🧬' });
        direct.push({ to: 'party', msg: { type: 'toast', text: '🧬 Final forms unlocked early. Level 8 is open tonight!', emoji: '🧬', tone: 'success' } });
        return this.ok(party, undefined, direct);
      }
      case 'endGiveaway': {
        const g = party.giveaways.find((x) => x.id === action.giveawayId);
        if (!g) return this.fail('No such giveaway.');
        this.settleGiveaway(party, g, this.now());
        if (g.status !== 'active') return this.fail('That one is already closed.');
        g.status = 'cancelled'; g.closedAt = this.now(); // whoever already claimed keeps theirs
        this.feed(party, { kind: 'unlock', text: `🎁 "${g.title}" closed by the host: ${g.claims.length} of ${g.qty} claimed`, emoji: '🎁' });
        return this.ok(party);
      }
      case 'cancelEpic': {
        const e = party.epics.find((x) => x.id === action.epicId);
        if (!e || e.status !== 'open') return this.fail('Nothing to cancel.');
        e.status = 'cancelled';
        return this.ok(party);
      }
      case 'resolveTakedown': {
        const claim = party.claims[action.photoId];
        const entry = party.cellar.find((e) => e.id === action.photoId);
        const target = claim ?? entry;
        if (!target?.takedown) return this.fail('Nothing to decide on that one.');
        if (action.remove) return this.removePhoto(party, party.players[playerId], action.photoId);
        target.takedown = undefined;
        return this.ok(party);
      }
      case 'keepsake': return { ack: { ok: true, data: this.keepsake(party) }, changed: false, direct: [] };
      case 'exportToken': {
        // A short-lived download link for the .zip; held in memory only, so it never lands in state.json
        const now = this.now();
        for (const [t, v] of this.exportTokens) if (v.exp < now) this.exportTokens.delete(t);
        const token = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(24)), (n) => 'abcdefghijkmnpqrstuvwxyz23456789'[n & 31]).join('');
        this.exportTokens.set(token, { code: party.code, exp: now + EXPORT_TOKEN_MS });
        return { ack: { ok: true, data: { token, code: party.code } }, changed: false, direct: [] };
      }
      case 'transferHost': {
        const p = party.players[action.playerId];
        if (!p || p.removed) return this.fail('No such player.');
        party.players[playerId].isHost = false; p.isHost = true; party.hostId = p.id;
        this.feed(party, { kind: 'host', text: `${p.nickname} now holds the keys to the cellar.`, emoji: '🔑' });
        return this.ok(party, undefined, [{ to: p.id, msg: { type: 'toast', text: 'You are now the host.', emoji: '🔑', tone: 'success' } }]);
      }
      default: return this.fail('Unknown host action.');
    }
  }

  // ---------- Lucky Drops ----------
  private addDrop(party: PartyState, p: PlayerState, source: Drop['source'], rarity: Rarity | undefined, direct: Outbound[], opts: { item?: boolean } = {}) {
    const d = rollDrop(this.rng, p.unlocked, source, this.now(), rarity, opts);
    p.drops.push(d);
    if (p.drops.length > 40) p.drops = p.drops.filter((x) => !x.opened).concat(p.drops.filter((x) => x.opened).slice(-10));
    if (source === 'challenge') direct.push({ to: p.id, msg: { type: 'toast', text: '🎁 A Lucky Drop landed. Open it on your Lobby.', emoji: '🎁', tone: 'success' } });
    void party;
  }

  private openDrop(playerId: string, dropId: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed || !p.creature) return this.fail('Adopt a creature first.');
    const d = p.drops.find((x) => x.id === dropId);
    if (!d) return this.fail('That drop isn\'t yours.');
    if (d.opened) return { ack: { ok: true, data: { drop: d, already: true } }, changed: false, direct: [] };
    d.opened = true;
    const direct: Outbound[] = [];
    // The item was decided when the drop was earned; if it's been picked up elsewhere since, it's points instead
    if (d.item && p.unlocked.includes(d.item)) { d.points += RARITY[d.rarity].dupPoints; d.item = undefined; }
    if (d.item) p.unlocked.push(d.item);
    const reward = this.grant(party, p, d.points, d.xp, direct);
    const cos = d.item ? COSMETIC_BY_ID[d.item] : undefined;
    if (d.rarity === 'epic' || d.rarity === 'legendary') this.feed(party, { kind: 'unlock', text: `${d.rarity === 'legendary' ? '🌟 LEGENDARY' : '💜 EPIC'} drop for ${p.nickname}${cos ? `: ${theItem(cos)}` : ''}!`, playerId: p.id, emoji: d.rarity === 'legendary' ? '🌟' : '💜' });
    return this.ok(party, { drop: d, levelUp: reward.levelUp, evolved: reward.evolved }, direct);
  }

  // ---------- Saturday Quests ----------
  private assignQuests(party: PartyState, p: PlayerState) {
    const pool = [...QUEST_DEFS];
    p.quests = [];
    while (p.quests.length < QUESTS_PER_DAY && pool.length) {
      const i = Math.floor(this.rng() * pool.length); const def = pool.splice(i, 1)[0];
      if (def.id === 'jezza3' && party.groomId === p.id) continue; // the groom can't get the groom in
      p.quests.push({ defId: def.id, baseline: def.stat(p), done: false });
    }
  }

  private checkQuests(party: PartyState, p: PlayerState, direct: Outbound[]) {
    for (const q of p.quests) {
      if (q.done) continue;
      const def = QUEST_BY_ID[q.defId]; if (!def) continue;
      if (questProgress(q, p) < def.target) continue;
      q.done = true; q.doneAt = this.now();
      const reward = this.grant(party, p, def.points, 0, direct);
      this.addDrop(party, p, 'quest', def.drop, direct);
      this.feed(party, { kind: 'achievement', text: `${p.nickname} finished the quest "${def.title}" (+${def.points})`, playerId: p.id, emoji: def.emoji });
      direct.push({ to: p.id, msg: { type: 'reward', points: def.points, xp: 0, ...reward, title: `Quest done: ${def.title}`, bonus: `🎁 A ${RARITY[def.drop].label} drop is waiting on your Lobby`, quiet: true } });
    }
  }

  // ---------- The Mole ----------
  private assignMole(party: PartyState, playerId: string | undefined, direct: Outbound[], count?: number): boolean {
    const pool = Object.values(party.players).filter((p) => !p.removed && p.creature && p.id !== party.hostId && p.id !== party.groomId);
    let picks: PlayerState[];
    if (playerId) { const p = party.players[playerId]; if (!p || p.removed || !p.creature) return false; picks = [p]; }
    else {
      if (pool.length < 4) return false;
      const want = Number.isInteger(count) && (count as number) > 0 ? (count as number) : molesFor(pool.length);
      const n = Math.max(1, Math.min(MOLE_MAX, Math.floor(pool.length / 4), want));
      picks = [...pool].sort(() => this.rng() - 0.5).slice(0, n);
    }
    party.mole = { moles: [], assignedAt: this.now(), votes: {}, revealed: false };
    for (const p of picks) party.mole.moles.push({ playerId: p.id, missions: this.moleMissions(party.mole) });
    const plural = picks.length > 1;
    this.feed(party, { kind: 'phase', text: `🕵️ THERE ${plural ? `ARE ${picks.length} MOLES` : 'IS A MOLE'} among you, with secret missions to mess with the weekend. Vote on who before the finale.`, emoji: '🕵️' });
    direct.push({ to: 'party', msg: { type: 'toast', text: `🕵️ There ${plural ? `are ${picks.length} Moles` : 'is a Mole'} in the party. Watch your mates. Vote on the Lobby.`, emoji: '🕵️', tone: 'warn' } });
    for (const p of picks) direct.push({ to: p.id, msg: { type: 'toast', text: `🕵️ YOU are ${plural ? 'a' : 'the'} Mole. Shh. Your secret missions are on the Challenges tab.`, emoji: '🕵️', tone: 'warn' } });
    return true;
  }

  /** Three missions no other Mole in this room already has, so two Moles never chase the same gag. */
  private moleMissions(state: MoleState) {
    const taken = new Set(state.moles.flatMap((m) => m.missions.map((x) => x.text)));
    const fresh = MOLE_MISSIONS.filter((t) => !taken.has(t));
    const pool = fresh.length >= 3 ? fresh : MOLE_MISSIONS;
    return [...pool].sort(() => this.rng() - 0.5).slice(0, 3).map((text) => ({ text, done: false }));
  }

  private moleDone(playerId: string, index: number): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId]; const m = party?.mole;
    const mine = m?.moles.find((x) => x.playerId === playerId);
    if (!party || !p || !m || !mine || m.revealed) return this.fail('Nice try.');
    if (!Number.isInteger(index) || index < 0 || index >= mine.missions.length) return this.fail('No such mission.');
    const mission = mine.missions[index];
    if (mission.done) return { ack: { ok: true, data: { already: true } }, changed: false, direct: [] };
    mission.done = true;
    const direct: Outbound[] = [];
    const reward = this.grant(party, p, MOLE_POINTS.mission, 0, direct); // no feed line: that would blow the cover
    return this.ok(party, undefined, [...direct, { to: p.id, msg: { type: 'reward', points: MOLE_POINTS.mission, xp: 0, ...reward, title: 'Secret mission done', bonus: '🕵️ Nobody saw a thing', quiet: true } }]);
  }

  /** Tap a suspect to name them, tap again to take it back. One name per Mole in play; a new name past that bumps the oldest. */
  private moleVote(playerId: string, suspectId: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId]; const m = party?.mole;
    if (!party || !p || p.removed || !p.creature) return this.fail('Adopt a creature first.');
    if (!m || m.revealed) return this.fail('Voting is closed.');
    if (playerId === party.hostId) return this.fail('The host can see the answer, so the host doesn\'t vote.');
    const s = party.players[suspectId];
    if (!s || s.removed || !s.creature || s.id === playerId) return this.fail('Pick a mate (not yourself).');
    const mine = m.votes[playerId] ?? [];
    const next = mine.includes(suspectId) ? mine.filter((x) => x !== suspectId) : [...mine, suspectId].slice(-m.moles.length);
    if (next.length) m.votes[playerId] = next; else delete m.votes[playerId];
    return this.ok(party, { suspectIds: next });
  }

  // ---------- the scorer's pad (Bucks Olympics, manual points) ----------
  private scorerGrant(playerId: string, targetId: string, pointsRaw: number, reasonRaw: string): HandleResult {
    const party = this.partyOf(playerId); const by = party?.players[playerId];
    if (!party || !by || by.removed) return this.fail('Join a party first.');
    if (!by.isScorer && party.hostId !== playerId) return this.fail('Only a Scorer (or the host) can enter points.');
    const t = party.players[targetId];
    if (!t || t.removed || !t.creature) return this.fail('Pick a lad with a creature.');
    const pts = Math.max(-100, Math.min(200, Math.round(Number(pointsRaw) || 0)));
    if (!pts) return this.fail('Enter a non-zero amount (−100 to +200).');
    const reason = String(reasonRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (reason.length < 2) return this.fail('Name the event (e.g. Plank).');
    if (!isClean(reason)) return this.fail('Keep it clean.');
    const direct: Outbound[] = [];
    this.grant(party, t, pts, 0, direct);
    t.olympics += pts;
    party.lastScore = { playerId: t.id, points: pts, reason, by: by.nickname, at: this.now() };
    this.feed(party, { kind: 'host', text: `🏅 ${reason}: ${t.nickname} ${pts > 0 ? '+' : ''}${pts} (scored by ${by.nickname})`, playerId: t.id, emoji: '🏅' });
    direct.push({ to: t.id, msg: { type: 'toast', text: `🏅 ${reason}: ${pts > 0 ? '+' : ''}${pts} points`, emoji: '🏅', tone: pts > 0 ? 'success' : 'warn' } });
    return this.ok(party, { points: pts, total: t.olympics }, direct);
  }

  // ---------- the run sheet ----------
  /** Runs the item's action through the ordinary host actions. Returns a failure result if that action refused. */
  private fireRunItem(party: PartyState, item: RunItem, direct: Outbound[]): HandleResult | null {
    const host = party.hostId;
    const via = (action: HostAction) => { const r = this.hostAction(host, action); direct.push(...r.direct); return r.ack?.ok === false ? r : null; };
    switch (item.action) {
      case 'reel': return via({ kind: 'setTvMode', mode: 'reel' });
      case 'awards': return party.phase === 'finale' || party.phase === 'ended' ? null : via({ kind: 'setPhase', phase: 'finale' });
      case 'spotlight': return via({ kind: 'setSpotlight', label: party.spotlight?.label ?? item.label, start: true });
      case 'rowdy': return via({ kind: 'startRowdy' });
      case 'raid': return via({ kind: 'summonRaid' });
      case 'drops': return via({ kind: 'giveDrops', rarity: 'rare' });
      case 'xpBoost': return via({ kind: 'xpBoost', minutes: 30 });
      case 'mole': return via({ kind: 'revealMole' });
      case 'teams': return party.teams ? null : via({ kind: 'teamsMake', count: 2 });
      case 'olympics': {
        for (const p of Object.values(party.players)) if (p.isScorer && !p.removed) direct.push({ to: p.id, msg: { type: 'toast', text: `🏅 ${item.label}: time to open the scorer's pad.`, emoji: '🏅', tone: 'warn' } });
        this.feed(party, { kind: 'phase', text: `🏅 ${item.label.toUpperCase()} is on. Scorers, open your pads. Eyes on the TV.`, emoji: '🏅' });
        direct.push({ to: 'party', msg: { type: 'toast', text: `🏅 ${item.label}. Eyes on the TV.`, emoji: '🏅', tone: 'warn' } });
        return null;
      }
      default:
        this.feed(party, { kind: 'phase', text: `📌 ${item.label.toUpperCase()}. Now.`, emoji: '📌' });
        direct.push({ to: 'party', msg: { type: 'toast', text: `📌 ${item.label}`, emoji: '📌', tone: 'info' } });
        return null;
    }
  }

  // ---------- Bucks Olympics events ----------
  private scorerOf(playerId: string): { party: PartyState; by: PlayerState; fail?: undefined } | { fail: HandleResult } {
    const party = this.partyOf(playerId); const by = party?.players[playerId];
    if (!party || !by || by.removed) return { fail: this.fail('Join a party first.') };
    if (!by.isScorer && party.hostId !== playerId) return { fail: this.fail('Only a Scorer (or the host) can run events.') };
    return { party, by };
  }
  private olyStart(playerId: string, nameRaw: string, unit: OlyUnit): HandleResult {
    const sc = this.scorerOf(playerId); if (sc.fail) return sc.fail; const { party, by } = sc;
    if (party.olympics.current && party.olympics.current.status === 'open') return this.fail('An event is already open. Lock it or scrap it first.');
    const name = String(nameRaw ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
    if (name.length < 2) return this.fail('Name the event.');
    if (!isClean(name)) return this.fail('Keep it clean.');
    if (!OLY_UNITS[unit]) return this.fail('Pick how it is measured.');
    const now = this.now();
    party.olympics.current = { id: `oe_${now.toString(36)}_${Math.floor(this.rng() * 1e6).toString(36)}`, name, unit, scorerId: by.id, startedAt: now, results: [], timer: null, status: 'open' };
    const direct: Outbound[] = [];
    this.feed(party, { kind: 'phase', text: `🏅 BUCKS OLYMPICS · ${name.toUpperCase()} is on. ${OLY_UNITS[unit].blurb.split('.')[0]}. Eyes on the TV.`, emoji: '🏅' });
    direct.push({ to: 'party', msg: { type: 'toast', text: `🏅 Olympics: ${name}. Eyes on the TV.`, emoji: '🏅', tone: 'warn' } });
    return this.ok(party, { id: party.olympics.current.id }, direct);
  }
  private olyResult(playerId: string, targetId: string, valueRaw: number | null): HandleResult {
    const sc = this.scorerOf(playerId); if (sc.fail) return sc.fail; const { party } = sc;
    const ev = party.olympics.current;
    if (!ev || ev.status !== 'open') return this.fail('No event open.');
    const t = party.players[targetId];
    if (!t || t.removed || !t.creature) return this.fail('Pick a lad with a creature.');
    ev.results = ev.results.filter((r) => r.playerId !== targetId);
    if (valueRaw !== null && valueRaw !== undefined) {
      const v = Number(valueRaw);
      if (!Number.isFinite(v) || v < 0 || v > 100000) return this.fail('That number does not look right.');
      if (ev.unit === 'place' && (v < 1 || !Number.isInteger(v))) return this.fail('Placing is 1, 2, 3…');
      ev.results.push({ playerId: targetId, value: ev.unit === 'seconds' || ev.unit === 'metres' ? Math.round(v * 10) / 10 : Math.round(v), at: this.now() });
    }
    if (ev.timer?.playerId === targetId) ev.timer = null;
    return this.ok(party, { results: ev.results.length });
  }
  private olyTimer(playerId: string, targetId: string | null): HandleResult {
    const sc = this.scorerOf(playerId); if (sc.fail) return sc.fail; const { party } = sc;
    const ev = party.olympics.current;
    if (!ev || ev.status !== 'open') return this.fail('No event open.');
    if (targetId === null) { ev.timer = null; return this.ok(party); }
    const t = party.players[targetId];
    if (!t || t.removed || !t.creature) return this.fail('Pick a lad with a creature.');
    ev.timer = { playerId: targetId, startedAt: this.now() };
    return this.ok(party, { startedAt: ev.timer.startedAt });
  }
  private olyLock(playerId: string): HandleResult {
    const sc = this.scorerOf(playerId); if (sc.fail) return sc.fail; const { party, by } = sc;
    const ev = party.olympics.current;
    if (!ev || ev.status !== 'open') return this.fail('No event open.');
    if (!ev.results.length) return this.fail('Enter at least one result first.');
    const direct: Outbound[] = [];
    ev.awards = placeAwards(ev.unit, ev.results); ev.status = 'locked'; ev.lockedAt = this.now(); ev.timer = null;
    for (const a of ev.awards) {
      const t = party.players[a.playerId]; if (!t || !a.points) continue;
      this.grant(party, t, a.points, 0, direct); t.olympics += a.points;
      direct.push({ to: t.id, msg: { type: 'toast', text: `🏅 ${ev.name}: ${a.place ? `${a.place === 1 ? '🥇' : a.place === 2 ? '🥈' : a.place === 3 ? '🥉' : `${a.place}th`} · ` : ''}+${a.points} points`, emoji: '🏅', tone: 'success' } });
    }
    const top = ev.awards.filter((a) => a.place === 1 || (ev.unit === 'points' && a.points === Math.max(...ev.awards!.map((x) => x.points))));
    const winnerId = top[0]?.playerId;
    party.olympics.done.push({ id: ev.id, name: ev.name, unit: ev.unit, winnerId, lockedAt: ev.lockedAt });
    if (party.olympics.done.length > 40) party.olympics.done = party.olympics.done.slice(-40);
    const names = top.map((a) => party.players[a.playerId]?.nickname?.toUpperCase() ?? '?').join(' & ');
    this.feed(party, { kind: 'phase', text: `🏅 ${ev.name.toUpperCase()}: ${names} take${top.length > 1 ? '' : 's'} it${top[0] && ev.unit !== 'points' ? ` (${OLY_UNITS[ev.unit].fmt(top[0].value)})` : ''}. ${ev.awards.length} lads scored. Locked by ${by.nickname}.`, emoji: '🏅' });
    direct.push({ to: 'party', msg: { type: 'toast', text: `🏅 ${ev.name}: ${names} on top.`, emoji: '🏅', tone: 'success' } });
    return this.ok(party, { awards: ev.awards }, direct);
  }
  private olyScrap(playerId: string): HandleResult {
    const sc = this.scorerOf(playerId); if (sc.fail) return sc.fail; const { party } = sc;
    const ev = party.olympics.current;
    if (!ev) return this.fail('Nothing to scrap.');
    party.olympics.current = null; // an open event is binned without points; a locked one just leaves the TV
    return this.ok(party);
  }

  // ---------- Rowdy Rounds ----------
  private rowdyLine(kind: RowdyKind, prompt: string) {
    return kind === 'mostLikely' ? `most likely to ${prompt}` : kind === 'neverHaveIEver' ? `never have I ever ${prompt}` : kind === 'categories' ? `${prompt}. Round the circle, no repeats.` : prompt;
  }
  private rowdyPublic(party: PartyState): RowdyPublic | null {
    const r = party.rowdy; if (!r) return null;
    const tally = r.revealed ? Object.values(r.votes).reduce<Record<string, number>>((o, t) => { o[t] = (o[t] ?? 0) + 1; return o; }, {}) : undefined;
    return { id: r.id, kind: r.kind, prompt: r.prompt, startedAt: r.startedAt, endsAt: r.endsAt, votes: Object.keys(r.votes).length, revealed: r.revealed, tally: tally ? Object.entries(tally).map(([playerId, n]) => ({ playerId, n })).sort((a, b) => b.n - a.n) : undefined };
  }
  private rowdyVote(playerId: string, targetId: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId]; const r = party?.rowdy;
    if (!party || !p || p.removed || !p.creature) return this.fail('Adopt a creature first.');
    if (!r || r.revealed || this.now() >= r.endsAt) return this.fail('That round is over.');
    if (!ROWDY_KINDS[r.kind].vote) return this.fail('No voting in this one. Just play.');
    const t = party.players[targetId];
    if (!t || t.removed || !t.creature) return this.fail('Pick a lad.');
    const first = !r.votes[playerId];
    r.votes[playerId] = targetId;
    const direct: Outbound[] = [];
    if (first) this.grant(party, p, ROWDY_VOTE_POINTS, 0, direct); // a few points for joining in, never for drinking
    return this.ok(party, { targetId }, direct);
  }
  private revealRowdy(party: PartyState, direct: Outbound[]) {
    const r = party.rowdy; if (!r || r.revealed) return;
    r.revealed = true; r.endsAt = Math.min(r.endsAt, this.now());
    const def = ROWDY_KINDS[r.kind];
    if (def.vote) {
      const pub = this.rowdyPublic(party)!; const top = pub.tally?.[0];
      const name = top ? party.players[top.playerId]?.nickname ?? '?' : undefined;
      const tie = top && pub.tally!.filter((x) => x.n === top.n).length > 1;
      this.feed(party, { kind: 'phase', text: top ? `🍻 Most likely to ${r.prompt}: ${tie ? pub.tally!.filter((x) => x.n === top.n).map((x) => party.players[x.playerId]?.nickname?.toUpperCase() ?? '?').join(' & ') : name!.toUpperCase()} (${top.n} vote${top.n === 1 ? '' : 's'}). You know what to do.` : `🍻 Most likely to ${r.prompt}: nobody voted. Soft.`, emoji: '👉' });
      direct.push({ to: 'party', msg: { type: 'toast', text: top ? `👉 Most likely to ${r.prompt}: ${tie ? 'a tie!' : name}` : 'Nobody voted. Soft.', emoji: '🍻', tone: 'warn' } });
    } else {
      this.feed(party, { kind: 'phase', text: `🍻 ${def.label} is over. ${r.kind === 'newRule' ? 'Rule\'s off.' : 'Nice work, degenerates.'}`, emoji: def.emoji });
    }
  }

  // ---------- battle taunts ----------
  private taunt(playerId: string, battleId: string, emoji: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p) return this.fail('Join a party first.');
    const b = party.battles[battleId];
    if (!b || b.status !== 'active' || (b.a.playerId !== playerId && b.b.playerId !== playerId)) return this.fail('No fight to taunt in.');
    if (!TAUNTS.includes(emoji)) return this.fail('Not that one.');
    const now = this.now();
    if (now - p.lastTauntAt < TAUNT_GAP_MS) return this.fail('Easy on the taunts.');
    p.lastTauntAt = now;
    const other = b.a.playerId === playerId ? b.b.playerId : b.a.playerId;
    const msg = { type: 'taunt' as const, battleId, from: playerId, emoji };
    return { ack: { ok: true }, changed: false, direct: [{ to: playerId, msg }, { to: other, msg }], partyCode: party.code };
  }

  // ---------- comeback ----------
  /** Well behind the leader (under 60% of their points, once the leader has 200+): 1.5× on challenges until back to 80%. */
  private updateComeback(party: PartyState) {
    const live = Object.values(party.players).filter((p) => !p.removed && p.creature);
    const lead = Math.max(0, ...live.map((p) => p.points));
    for (const p of live) {
      if (lead < COMEBACK_MIN_LEAD) { p.comeback = false; continue; }
      if (!p.comeback && p.points < lead * COMEBACK_BELOW) p.comeback = true;
      else if (p.comeback && p.points >= lead * COMEBACK_UNTIL) p.comeback = false;
    }
  }

  // ---------- helpers ----------
  private feed(party: PartyState, ev: Omit<FeedEvent, 'id' | 'at'>) {
    const line: FeedEvent = { id: `f_${party.feed.length}_${Math.floor(this.rng() * 1e6).toString(36)}`, at: this.now(), ...ev };
    party.feed.push(line);
    if (party.feed.length > FEED_LIMIT) party.feed = party.feed.slice(-FEED_LIMIT);
    (party.log ??= []).push(line); // the long record for the keepsake (reactions and photos arrive on the feed copy)
    if (party.log.length > LOG_LIMIT) party.log = party.log.slice(-LOG_LIMIT);
  }
}

const CATEGORY_EMOJI: Record<string, string> = { laugh: '😂', dance: '🕺', sing: '🎤', photo: '📸', jezza: '🤵', cheers: '🍻', sneaky: '🕵️', chill: '😎', group: '🫂' };

function newPlayer(id: string, nickname: string, now: number, isHost: boolean, joinedPhase: Phase = 'friday'): PlayerState {
  return {
    id, nickname, creature: null, creatureName: '', level: 1, xp: 0, points: 0, equipped: { colorway: 0 }, unlocked: [], achievements: [], comeback: false,
    missionsCompleted: 0, wins: 0, losses: 0, title: 'Fresh Legend', online: true, isHost, joinedAt: now, lastSeen: now, categoryCounts: {}, witnessed: 0,
    rating: START_RATING, streak: 0, bestStreak: 0, bounties: 0, laughs: 0, fires: 0, groomLoves: 0, wallVotes: 0,
    cellarCount: 0, cellarFires: 0, raidDamage: 0, raidsJoined: 0, lowKey: false, freshLegs: 0, catchUp: false, joinedPhase, morningDrop: null, welcomeDrop: false, realMissions: 0, fairWins: 0, fairFights: 0, isScorer: false, olympics: 0,
    h2h: {}, upsetLosses: 0, reactionsGiven: 0, autoBattles: true, epicsDone: 0,
    hand: [], completedMissionIds: [], rerollsLeft: REROLLS_PER_PHASE, scoredBattlesVs: {}, missedRounds: 0, lastHonourClaimAt: 0, flagged: [], rerollRefillAt: 0, drops: [], quests: [], lastTauntAt: 0,
    away: [], lastAutoAt: 0, recentAuto: [], codeTries: [],
  };
}

function toPublic(p: PlayerState): PlayerPublic {
  const { hand, completedMissionIds, rerollsLeft, scoredBattlesVs, missedRounds, lastHonourClaimAt, flagged, rerollRefillAt, away, lastAutoAt, recentAuto, codeTries, creatureBefore, drops, quests, lastTauntAt, morningDrop, welcomeDrop, realMissions, ...pub } = p;
  return pub;
}

function unique<T>(xs: T[]): T[] { return [...new Set(xs)]; }
/** "the Viking Helmet", but "The Mo" (no "the The"). */
function theItem(cos: { name: string } | undefined): string { const n = cos?.name ?? 'mystery item'; return /^the /i.test(n) ? n : `the ${n}`; }
const needsHost = (c: Claim) => (c.status === 'pending' && (c.method === 'host' || c.review === 'host')) || c.status === 'disputed';
