// The authoritative game engine. Pure logic, no I/O: the Node server wraps it
// with WebSockets + persistence; the browser demo mode runs it locally for
// offline previews and practice battles (which never award real points).
import type {
  Battle, BattleAction, Claim, TapQuality, ClientMessage, CreatureId, Equipped, FeedEvent, HostAction, HostView,
  MissionAssignment, PartyPublic, Phase, PlayerPrivate, PlayerPublic, ServerMessage, WitnessRequest,
  Raid, Reaction, WallPost, CellarEntry, GalleryPhoto, PhotoMode, AwayEvent, Keepsake, Epic, RewardCode,
} from './types';
import { EPIC_CUSTOM_ITEM, EPIC_MAX_CREW, EPIC_PRESET_BY_ID, EPIC_TIERS, isEpicTier } from './epics';
import { CREATURES, CREATURE_IDS, FORMS, GROOM_CREATURE, starterTrio } from './creatures';
import { MISSIONS, MISSION_BY_ID, STARTER_MISSION, GROUP_MISSIONS, missionAvailableInPhase, rookieLeft, type Mission } from './missions';
import {
  ACHIEVEMENTS, COSMETIC_BY_ID, colorwaysUnlocked, computeAwards, cosmeticsForLevel, levelForXp, titleForLevel,
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
const VARIETY_BONUS = 5;                        // first challenge in a new category
const WALL_PER_PHASE = 3;
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
const MAX_PHOTO_CHARS = 1_400_000; // ~1MB jpeg as base64 (phones send ~1600px, usually 250-500KB)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class Engine {
  state: EngineState;
  private now: () => number;
  private rng: () => number;
  private storePhoto: (dataUrl: string, partyCode: string) => string | null;
  private deletePhotos: (urls: string[]) => void;
  private codeLength: number;

  constructor(opts: EngineOptions = {}, state?: EngineState) {
    this.now = opts.now ?? (() => Date.now());
    this.rng = opts.rng ?? Math.random;
    this.storePhoto = opts.storePhoto ?? ((d) => d);
    this.deletePhotos = opts.deletePhotos ?? (() => undefined);
    this.codeLength = opts.codeLength ?? 4;
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
      party.epics ??= []; party.codes ??= [];
      for (const e of party.epics) { e.tier ??= 'medium'; e.points ??= EPIC_TIERS[e.tier].points; e.xp ??= EPIC_TIERS[e.tier].xp; }
      for (const b of Object.values(party.battles)) if (b.status === 'active' && !b.quick && !b.auto) { b.quick = true; b.roundDeadline = Math.min(b.roundDeadline ?? Infinity, this.now() + PLAN_SECONDS * 1000); }
      party.nextAutoAt ??= this.now() + FIRST_AUTO_DELAY_MS;
      for (const p of Object.values(party.players)) {
        p.rating ??= START_RATING; p.streak ??= 0; p.bestStreak ??= 0; p.bounties ??= 0;
        p.laughs ??= 0; p.fires ??= 0; p.groomLoves ??= 0; p.wallVotes ??= 0; p.cellarCount ??= 0; p.cellarFires ??= 0;
        p.raidDamage ??= 0; p.raidsJoined ??= 0; p.lowKey ??= false; p.freshLegs ??= 0; p.joinedPhase ??= 'friday';
        p.rerollRefillAt ??= 0;
        p.h2h ??= {}; p.upsetLosses ??= 0; p.reactionsGiven ??= 0; p.autoBattles ??= true;
        p.away ??= []; p.lastAutoAt ??= 0; p.recentAuto ??= []; p.epicsDone ??= 0; p.codeTries ??= [];
      }
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
    return party.code;
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
        .map((c) => ({ id: c.id, url: c.photoUrl!, at: c.resolvedAt ?? c.createdAt, playerId: c.playerId, caption: MISSION_BY_ID[c.missionId]?.secret ? 'A sneaky one' : MISSION_BY_ID[c.missionId]?.title ?? 'Challenge', source: 'mission' as const, eventId: eventByClaim.get(c.id) })),
      ...party.cellar.filter((e) => e.photoUrl).map((e) => ({ id: e.id, url: e.photoUrl!, at: e.at, playerId: e.playerId, caption: e.drink, source: 'cellar' as const })),
    ].sort((a, b) => b.at - a.at).slice(0, 80);
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
        case 'claimMission': return this.claimMission(playerId, msg.missionId, msg.claimId, msg.photo, msg.witnessId, msg.note);
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
      raids: [], wall: [], cellar: [], phaseMissions: { friday: 0, saturday: 0 }, photoMode: 'vote', nextAutoAt: now + FIRST_AUTO_DELAY_MS, epics: [], codes: [],
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
      if (party.phase === 'saturday') np.freshLegs = FRESH_LEGS;
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
    p.title = titleForLevel(1);
    // Starter mission straight away, regardless of phase.
    p.hand = [{ missionId: STARTER_MISSION.id, assignedAt: this.now(), status: 'active' }];
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
      m.scope === 'private' && !m.starter && m.method !== 'host' && missionAvailableInPhase(m, phase)
      && !inHand.has(m.id) && !p.completedMissionIds.includes(m.id)
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
      let src = varied.length ? varied : pool;
      if (rookieLeft(p.missionsCompleted) > 0) { const easy = src.filter((m) => m.difficulty === 1); if (easy.length) src = easy; }
      // keep a photo one in every hand: they're quick and they fill the gallery
      if (!p.hand.some((h) => MISSION_BY_ID[h.missionId]?.method === 'photo')) { const snaps = src.filter((m) => m.method === 'photo'); if (snaps.length) src = snaps; }
      if (sameDifficultyAs) { const same = src.filter((m) => m.difficulty === sameDifficultyAs); if (same.length) src = same; sameDifficultyAs = undefined; }
      const m = src[Math.floor(this.rng() * src.length)];
      p.hand.push({ missionId: m.id, assignedAt: this.now(), status: 'active' });
    }
  }

  private claimMission(playerId: string, missionId: string, claimId: string, photo?: string, witnessId?: string, note?: string): HandleResult {
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
    if (p.completedMissionIds.includes(missionId)) return this.fail('Already done that one. No double dipping.');
    const now = this.now();
    const isGroup = mission.scope === 'group';
    if (isGroup) {
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

    const rookie = !isGroup && rookieLeft(p.missionsCompleted) > 0;
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
    if (mission.method === 'photo' && party.photoMode !== 'instant' && others > 0 && !mission.starter && !rookie) { // the selfie and rookie snaps count straight away
      // Photo check: the lads vote it in (or the host approves it). Nobody is ever stuck: it times out in the snapper's favour.
      claim.review = party.photoMode; claim.votesUp = []; claim.votesDown = [];
      if (!isGroup) { const h = p.hand.find((x) => x.missionId === missionId)!; h.status = 'pending'; h.claimId = claimId; }
      if (claim.review === 'vote') {
        this.feed(party, { kind: 'vote', text: `${p.nickname} reckons they nailed "${mission.title}". Legit?`, playerId: p.id, photoUrl: claim.photoUrl, emoji: '🗳️', claimId: claim.id });
        direct.push({ to: 'party', msg: { type: 'toast', text: `${p.nickname} posted a photo. Vote it in 👍 or bin it 👎`, emoji: '🗳️', tone: 'info' } });
      } else direct.push({ to: party.hostId, msg: { type: 'toast', text: `${p.nickname} sent a photo for "${mission.title}". Check your queue.`, emoji: '📥', tone: 'info' } });
    } else if (mission.method === 'self' || mission.method === 'photo') {
      this.approveClaim(party, claim, direct); // self-service: points land straight away, mates can call BS
    } else {
      if (!isGroup) { const h = p.hand.find((x) => x.missionId === missionId)!; h.status = 'pending'; h.claimId = claimId; }
      if (mission.method === 'witness') direct.push({ to: witnessId!, msg: { type: 'toast', text: `${p.nickname} reckons you saw "${mission.title}". Check your Missions tab.`, emoji: '👀', tone: 'info' } });
      else direct.push({ to: party.hostId, msg: { type: 'toast', text: `${p.nickname} sent "${mission.title}" to you.`, emoji: '📥', tone: 'info' } });
    }
    return this.ok(party, { status: claim.status }, direct);
  }

  private approveClaim(party: PartyState, claim: Claim, direct: Outbound[]) {
    const p = party.players[claim.playerId];
    const mission = MISSION_BY_ID[claim.missionId];
    if (!p || !mission) return;
    claim.status = 'approved'; claim.resolvedAt = this.now();
    if (!p.completedMissionIds.includes(mission.id)) p.completedMissionIds.push(mission.id);
    const h = p.hand.find((x) => x.missionId === mission.id);
    if (h) { h.status = 'done'; h.claimId = claim.id; }
    const newCategory = (p.categoryCounts[mission.category] ?? 0) === 0;
    const rookie = !mission.starter && mission.scope === 'private' && rookieLeft(p.missionsCompleted) > 0 && p.joinedPhase !== 'saturday'; // Saturday arrivals have Fresh Legs instead
    p.missionsCompleted += 1;
    p.categoryCounts[mission.category] = (p.categoryCounts[mission.category] ?? 0) + 1;
    const fresh = p.freshLegs > 0;
    if (fresh) p.freshLegs -= 1;
    const points = mission.points * (fresh ? 2 : 1) + (newCategory ? VARIETY_BONUS : 0);
    const xp = mission.xp * (rookie ? 2 : 1);
    const bonus = [rookie ? '🚀 Rookie boost: double XP' : '', fresh ? '🦵 Fresh Legs: double points' : '', newCategory ? `+${VARIETY_BONUS} new category` : ''].filter(Boolean).join(' · ') || undefined;
    const reward = this.grant(party, p, points, xp, direct);
    const label = mission.secret ? 'a sneaky one' : `"${mission.title}"`;
    this.feed(party, { kind: 'mission', text: `${p.nickname} did ${label} (+${points})`, playerId: p.id, photoUrl: claim.photoUrl, emoji: mission.secret ? '🕵️' : CATEGORY_EMOJI[mission.category], claimId: claim.id, flags: 0 });
    direct.push({ to: p.id, msg: { type: 'reward', points, xp, ...reward, title: mission.title, bonus } });
    // Raid + phase progress
    const phase = this.activePhase(party);
    if (phase && !mission.starter) party.phaseMissions[phase] += 1;
    const raid = this.liveRaid(party);
    if (raid) this.damageRaid(party, raid, p, mission.points * RAID_MISSION_DMG_MULT, false, 'mission', direct);
    else this.maybeSpawnRaid(party, direct);
    this.refillHand(party, p);
  }

  /** Add XP respecting the phase cap (one evolution max on Friday). Handles levels, unlocks and titles. */
  private applyXp(party: PartyState, p: PlayerState, xp: number): { unlocked: string[]; capped: boolean } {
    const cap = xpCapFor(party.phase);
    const before = p.level;
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
    // Saturday arrivals earn double XP until they've caught up to the group.
    const boosted = xp > 0 && p.joinedPhase === 'saturday' && p.level < this.medianLevel(party, p.id) ? xp * 2 : xp;
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
    if (m?.starter) return this.fail('The first one is sacred. Do it.');
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
          direct.push({ to: owner.id, msg: { type: 'reward', points: mission.points, xp: mission.xp, ...r, title: `${mission.title} (upheld by the host)` } });
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
    if (!ev || ev.kind !== 'mission' || !ev.playerId) return this.fail('Can\'t react to that.');
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
    direct.push({ to: playerId, msg: { type: 'toast', text: `Posted (+5). ${r.achievements.length ? '' : 'Now get the lads to vote it up.'}`, emoji: kind === 'roast' ? '🔥' : '🥂', tone: 'success' } });
    this.feed(party, { kind: 'wall', text: `${p.nickname} ${kind === 'roast' ? 'roasted' : 'toasted'} Jezza on the Wall`, emoji: kind === 'roast' ? '🎤' : '🥂' });
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
    if (rewarded) { this.grant(party, p, 5, 10, direct); direct.push({ to: playerId, msg: { type: 'toast', text: 'Reviewed (+5). Very sophisticated.', emoji: '🍷', tone: 'success' } }); }
    else { this.checkAchievements(party, p, direct); direct.push({ to: playerId, msg: { type: 'toast', text: 'Logged. (Only your first 3 reviews a day score: the game never rewards drinking more.)', emoji: '🍷', tone: 'info' } }); }
    this.feed(party, { kind: 'cellar', text: `${p.nickname} reviewed ${drink} ${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`, emoji: '🍷' });
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
    if (p.unlocked.includes(c.item)) return this.fail(`You already have the ${cos?.name ?? 'item'}. Save it for a mate.`);
    c.redeemedBy.push(playerId);
    p.unlocked.push(c.item);
    this.feed(party, { kind: 'unlock', text: `🎁 ${p.nickname} redeemed a reward code and unlocked the ${cos?.name ?? 'mystery item'}`, playerId: p.id, emoji: '🎁' });
    return this.ok(party, { item: c.item }, [{ to: playerId, msg: { type: 'reward', points: 0, xp: 0, unlocked: [c.item], title: 'Reward code unlocked!', bonus: '🎁 Straight from the host' } }]);
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
    const dealt = Math.min(raid.hp, Math.max(1, Math.round(dmg)));
    raid.hp -= dealt;
    raid.damage[p.id] = (raid.damage[p.id] ?? 0) + dealt;
    p.raidDamage += dealt;
    raid.log.push({ at: this.now(), playerId: p.id, dmg: dealt, crit, source });
    if (raid.log.length > 14) raid.log = raid.log.slice(-14);
    if (raid.hp <= 0) this.endRaid(party, raid, 'won', direct);
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
      direct.push({ to: pid, msg: { type: 'reward', points: base.points + mvp, xp: base.xp, ...r, unlocked: [...(fresh ? [raid.cosmetic] : []), ...r.unlocked], title: outcome === 'won' ? `${boss.name} defeated!` : `${boss.name} got away`, bonus: mvp ? `#${i + 1} damage: +${mvp} MVP bonus` : undefined } });
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
    b.rewards = {};
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
    this.feed(party, { kind: 'battle', text: `${w.creatureName} (${w.nickname}) ${how} ${l.creatureName} (${l.nickname})${bountyText}${scored ? (w.streak >= 3 ? ` · 🔥${w.streak} streak` : '') : ' (friendly)'}`, emoji: bountyText ? '👑' : '🏆', battleId: b.id });
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
    this.feed(party, { kind: 'battle', text: `🤖 AUTO-BATTLE: ${w.creatureName} (${w.nickname}) ${how} ${l.creatureName} (${l.nickname})${w.streak >= 3 ? ` · 🔥${w.streak} streak` : ''}`, emoji: '🤖', battleId: b.id });
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
      // Raid timer
      const raid = party.raids[party.raids.length - 1];
      if (raid && raid.status === 'active' && now >= raid.endsAt) { this.endRaid(party, raid, 'escaped', direct); dirty = true; }
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
      case 'keepsake': {
        const nick = (id: string) => party.players[id]?.nickname ?? 'Someone';
        const players = Object.values(party.players).filter((x) => !x.removed && x.creature);
        const data: Keepsake = {
          name: party.name, code: party.code,
          board: sortLeaderboard(players).map((x) => ({ nickname: x.nickname, creatureName: x.creatureName, level: x.level, points: x.points, missions: x.missionsCompleted, wins: x.wins, losses: x.losses })),
          awards: computeAwards(players.map(toPublic), Object.values(party.battles), party.awardOverrides).map((a) => ({ name: a.name, winner: a.playerId ? nick(a.playerId) : 'Nobody', reason: a.reason })),
          wall: party.wall.filter((w) => !w.hidden).map((w) => ({ author: nick(w.playerId), kind: w.kind, text: w.text, votes: w.votes.length, groomLove: w.groomLove, at: w.at })).sort((a, b) => b.votes + (b.groomLove ? 3 : 0) - (a.votes + (a.groomLove ? 3 : 0))),
          cellar: party.cellar.map((e) => ({ author: nick(e.playerId), drink: e.drink, stars: e.stars, note: e.note, fires: e.fires.length, at: e.at })),
          photos: [
            ...Object.values(party.claims).filter((c) => c.photoUrl && (c.status === 'approved' || c.status === 'disputed')).map((c) => ({ url: c.photoUrl!, caption: MISSION_BY_ID[c.missionId]?.title ?? 'Challenge', author: nick(c.playerId), at: c.resolvedAt ?? c.createdAt })),
            ...party.cellar.filter((e) => e.photoUrl).map((e) => ({ url: e.photoUrl!, caption: `🍷 ${e.drink}`, author: nick(e.playerId), at: e.at })),
          ].sort((a, b) => a.at - b.at),
        };
        return { ack: { ok: true, data }, changed: false, direct: [] };
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

  // ---------- helpers ----------
  private feed(party: PartyState, ev: Omit<FeedEvent, 'id' | 'at'>) {
    party.feed.push({ id: `f_${party.feed.length}_${Math.floor(this.rng() * 1e6).toString(36)}`, at: this.now(), ...ev });
    if (party.feed.length > FEED_LIMIT) party.feed = party.feed.slice(-FEED_LIMIT);
  }
}

const CATEGORY_EMOJI: Record<string, string> = { laugh: '😂', dance: '🕺', sing: '🎤', photo: '📸', jezza: '🤵', cheers: '🍻', sneaky: '🕵️', chill: '😎', group: '🫂' };

function newPlayer(id: string, nickname: string, now: number, isHost: boolean, joinedPhase: Phase = 'friday'): PlayerState {
  return {
    id, nickname, creature: null, creatureName: '', level: 1, xp: 0, points: 0, equipped: { colorway: 0 }, unlocked: [], achievements: [],
    missionsCompleted: 0, wins: 0, losses: 0, title: 'Fresh Legend', online: true, isHost, joinedAt: now, lastSeen: now, categoryCounts: {}, witnessed: 0,
    rating: START_RATING, streak: 0, bestStreak: 0, bounties: 0, laughs: 0, fires: 0, groomLoves: 0, wallVotes: 0,
    cellarCount: 0, cellarFires: 0, raidDamage: 0, raidsJoined: 0, lowKey: false, freshLegs: 0, joinedPhase,
    h2h: {}, upsetLosses: 0, reactionsGiven: 0, autoBattles: true, epicsDone: 0,
    hand: [], completedMissionIds: [], rerollsLeft: REROLLS_PER_PHASE, scoredBattlesVs: {}, missedRounds: 0, lastHonourClaimAt: 0, flagged: [], rerollRefillAt: 0,
    away: [], lastAutoAt: 0, recentAuto: [], codeTries: [],
  };
}

function toPublic(p: PlayerState): PlayerPublic {
  const { hand, completedMissionIds, rerollsLeft, scoredBattlesVs, missedRounds, lastHonourClaimAt, flagged, rerollRefillAt, away, lastAutoAt, recentAuto, codeTries, creatureBefore, ...pub } = p;
  return pub;
}

function unique<T>(xs: T[]): T[] { return [...new Set(xs)]; }
const needsHost = (c: Claim) => (c.status === 'pending' && (c.method === 'host' || c.review === 'host')) || c.status === 'disputed';
