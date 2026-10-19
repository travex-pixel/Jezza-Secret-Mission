// The authoritative game engine. Pure logic, no I/O: the Node server wraps it
// with WebSockets + persistence; the browser demo mode runs it locally for
// offline previews and practice battles (which never award real points).
import type {
  Battle, BattleAction, Claim, TapQuality, ClientMessage, CreatureId, Equipped, FeedEvent, HostAction, HostView,
  MissionAssignment, PartyPublic, Phase, PlayerPrivate, PlayerPublic, ServerMessage, WitnessRequest,
} from './types';
import { CREATURES, CREATURE_IDS } from './creatures';
import { MISSIONS, MISSION_BY_ID, STARTER_MISSION, missionAvailableInPhase, type Mission } from './missions';
import {
  ACHIEVEMENTS, COSMETIC_BY_ID, colorwaysUnlocked, computeAwards, cosmeticsForLevel, levelForXp, titleForLevel,
} from './progression';
import { validateCreatureName, validateNickname } from './names';
import {
  BATTLE_REWARDS, CHALLENGE_TTL_MS, MAX_SCORED_VS_SAME_OPPONENT, ROUND_SECONDS, TAP_BAR_MS, finish, makeCreatureState, redactBattle, resolveRound,
} from './battle';

export interface PlayerState extends PlayerPublic {
  hand: MissionAssignment[];
  completedMissionIds: string[];
  rerollsLeft: number;
  scoredBattlesVs: Record<string, number>;
  missedRounds: number;
  lastHonourClaimAt: number;
  flagged: string[];
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
const REROLLS_PER_PHASE = 3;
const FEED_LIMIT = 60;
const MAX_PHOTO_CHARS = 450_000; // ~330KB jpeg base64
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
    const showAwards = party.phase === 'finale' || party.phase === 'ended';
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
      pendingApprovals: Object.values(party.claims).filter((c) => (c.status === 'pending' && c.method !== 'witness') || c.status === 'disputed').length,
      awards: showAwards ? computeAwards(players, Object.values(party.battles), party.fridayPoints, party.awardOverrides) : null,
      finalized: party.finalized,
      hasHostPin: !!party.hostPinHash,
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
      pendingWitness,
      honourCooldownUntil: (p.lastHonourClaimAt ?? 0) + HONOUR_COOLDOWN_MS,
      flagged: p.flagged ?? [],
      secret: '',
    };
  }

  hostView(party: PartyState): HostView {
    return { approvals: Object.values(party.claims).filter((c) => (c.status === 'pending' && c.method !== 'witness') || c.status === 'disputed').sort((a, b) => a.createdAt - b.createdAt) };
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
        case 'flagClaim': return this.flagClaim(playerId, msg.claimId);
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
      code, name: (partyName ?? '').trim().slice(0, 40) || "Jezza's Bucks Weekend", hostId: playerId, phase: 'lobby', missionsOpen: false,
      createdAt: now, players: {}, feed: [], claims: {}, revealedGroupMissions: [], battles: {}, awardOverrides: {}, finalized: false, fridayPoints: null, seq: 0,
    };
    party.players[playerId] = newPlayer(playerId, v.name, now, true);
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
      party.players[playerId] = newPlayer(playerId, v.name, now, false);
      this.feed(party, { kind: 'join', text: `${v.name} wandered into the vineyard.`, playerId, emoji: '🍇' });
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
  private chooseCreature(playerId: string, creature: CreatureId, creatureName?: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    if (!CREATURE_IDS.includes(creature)) return this.fail('Unknown creature.');
    if (p.creature) return this.fail('You already adopted a creature. Loyalty matters.');
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
    const hostInHand = p.hand.some((h) => MISSION_BY_ID[h.missionId]?.method === 'host' && h.status !== 'done');
    return MISSIONS.filter((m) =>
      m.scope === 'private' && !m.starter && missionAvailableInPhase(m, phase)
      && !inHand.has(m.id) && !p.completedMissionIds.includes(m.id)
      && !(m.secret && secretInHand) && !(m.method === 'host' && hostInHand),
    );
  }

  private refillHand(party: PartyState, p: PlayerState) {
    p.hand = p.hand.filter((h) => h.status !== 'done');
    if (!this.activePhase(party)) return; // only the starter mission before the host opens Friday
    while (p.hand.length < HAND_SIZE) {
      const pool = this.drawPool(party, p);
      if (!pool.length) break;
      // Weight toward easier missions early, harder as the creature levels; prefer category variety.
      const inHandCats = new Set(p.hand.filter((h) => h.status !== 'done').map((h) => MISSION_BY_ID[h.missionId]?.category));
      const varied = pool.filter((m) => !inHandCats.has(m.category));
      const base = varied.length ? varied : pool;
      const weighted = base.filter((m) => m.difficulty <= Math.min(3, 1 + Math.floor(p.level / 3) + (this.rng() < 0.35 ? 1 : 0)));
      const src = weighted.length ? weighted : base;
      const m = src[Math.floor(this.rng() * src.length)];
      p.hand.push({ missionId: m.id, assignedAt: this.now(), status: 'active' });
    }
  }

  private claimMission(playerId: string, missionId: string, claimId: string, photo?: string, witnessId?: string, note?: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    if (!p.creature) return this.fail('Adopt a creature before taking missions.');
    if (!claimId || !/^[A-Za-z0-9_-]{6,64}$/.test(claimId)) return this.fail('Bad claim id.');
    const existing = party.claims[claimId];
    if (existing) {
      if (existing.playerId !== playerId) return this.fail('Bad claim id.');
      return { ack: { ok: true, data: { duplicate: true, status: existing.status } }, changed: false, direct: [] };
    }
    const mission = MISSION_BY_ID[missionId];
    if (!mission) return this.fail('Unknown mission.');
    if (p.completedMissionIds.includes(missionId)) return this.fail('Already completed. No double dipping.');
    const isGroup = mission.scope === 'group';
    if (isGroup) {
      if (!party.revealedGroupMissions.includes(missionId)) return this.fail('The host has not revealed that group mission.');
    } else {
      const h = p.hand.find((x) => x.missionId === missionId);
      if (!h) return this.fail('That mission is not in your hand.');
      if (h.status === 'pending') return this.fail('Already submitted. Patience, legend.');
      if (h.status === 'done') return this.fail('Already completed.');
    }
    if (!mission.starter) {
      if (!this.activePhase(party)) return this.fail('The host has not started the event yet.');
      if (!party.missionsOpen) return this.fail('Missions are closed right now. The host will reopen them.');
    }
    if (Object.values(party.claims).some((c) => c.playerId === playerId && c.missionId === missionId && c.status === 'pending')) return this.fail('Already submitted.');

    const now = this.now();
    if (mission.method === 'self' && !mission.starter && !isGroup) {
      const wait = (p.lastHonourClaimAt ?? 0) + HONOUR_COOLDOWN_MS - now;
      if (wait > 0) return this.fail(`Easy, legend. Next honour-system claim in ${Math.floor(wait / 60000)}:${String(Math.ceil((wait % 60000) / 1000)).padStart(2, '0')}. Photo and witness missions are still open.`);
      p.lastHonourClaimAt = now;
    }
    const claim: Claim = { id: claimId, playerId, missionId, method: mission.method, status: 'pending', createdAt: now, group: isGroup, note: (note ?? '').slice(0, 120) || undefined };
    if (mission.method === 'photo') {
      if (!photo || typeof photo !== 'string' || !photo.startsWith('data:image/')) return this.fail('This mission needs a photo.');
      if (photo.length > MAX_PHOTO_CHARS) return this.fail('Photo too large. Try again, it will be compressed.');
      const url = this.storePhoto(photo, party.code);
      if (!url) return this.fail('Could not save the photo. Try again.');
      claim.photoUrl = url;
    }
    if (mission.method === 'witness') {
      const w = witnessId ? party.players[witnessId] : undefined;
      if (!w || w.removed || w.id === playerId || !w.creature) return this.fail('Pick a mate in the party as your witness.');
      claim.witnessId = witnessId;
    }
    party.claims[claimId] = claim;
    const direct: Outbound[] = [];
    if (mission.method === 'self') {
      this.approveClaim(party, claim, direct);
    } else {
      if (!isGroup) { const h = p.hand.find((x) => x.missionId === missionId)!; h.status = 'pending'; h.claimId = claimId; }
      if (mission.method === 'witness') direct.push({ to: witnessId!, msg: { type: 'toast', text: `${p.nickname} needs you to witness "${mission.title}".`, emoji: '👀', tone: 'info' } });
      if (mission.method !== 'witness') direct.push({ to: party.hostId, msg: { type: 'toast', text: `${p.nickname} submitted "${mission.title}" for approval.`, emoji: '📥', tone: 'info' } });
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
    p.missionsCompleted += 1;
    p.categoryCounts[mission.category] = (p.categoryCounts[mission.category] ?? 0) + 1;
    const reward = this.grant(party, p, mission.points, mission.xp, direct);
    const label = mission.secret ? 'a SECRET mission' : `"${mission.title}"`;
    this.feed(party, { kind: 'mission', text: `${p.nickname} completed ${label} (+${mission.points} pts)`, playerId: p.id, photoUrl: claim.photoUrl, emoji: mission.secret ? '🕵️' : '✅', claimId: claim.id, flags: 0 });
    direct.push({ to: p.id, msg: { type: 'reward', points: mission.points, xp: mission.xp, ...reward, title: mission.title } });
    this.refillHand(party, p);
  }

  /** Award points + xp, handle level ups, unlocks, achievements. Returns level/unlock info. */
  private grant(party: PartyState, p: PlayerState, points: number, xp: number, direct: Outbound[]) {
    const before = p.level;
    p.points = Math.max(0, p.points + points);
    p.xp = Math.max(0, p.xp + xp);
    p.level = levelForXp(p.xp);
    const unlocked: string[] = [];
    if (p.level > before) {
      for (const c of cosmeticsForLevel(p.level)) if (!p.unlocked.includes(c)) { p.unlocked.push(c); unlocked.push(c); }
      p.title = titleForLevel(p.level);
      this.feed(party, { kind: 'levelup', text: `${p.creatureName} (${p.nickname}) reached level ${p.level}!`, playerId: p.id, emoji: '⬆️' });
    }
    const ach = this.checkAchievements(party, p, direct);
    return { levelUp: p.level > before ? p.level : undefined, unlocked: [...unlocked, ...ach.cosmetics], achievements: ach.ids };
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
        p.points += a.points; p.xp += a.xp;
        const before = p.level; p.level = levelForXp(p.xp);
        if (p.level > before) { for (const c of cosmeticsForLevel(p.level)) if (!p.unlocked.includes(c)) { p.unlocked.push(c); cosmetics.push(c); } p.title = titleForLevel(p.level); }
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
    if (!h || h.status !== 'active') return this.fail('That mission cannot be swapped.');
    if (MISSION_BY_ID[missionId]?.starter) return this.fail('The first mission is sacred. Do it.');
    if (p.rerollsLeft <= 0) return this.fail('No swaps left this phase.');
    p.rerollsLeft -= 1;
    p.hand = p.hand.filter((x) => x !== h);
    this.refillHand(party, p);
    return this.ok(party, { rerollsLeft: p.rerollsLeft });
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

  private resolve(party: PartyState, claim: Claim, approve: boolean, direct: Outbound[], resolver?: PlayerState) {
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
          this.feed(party, { kind: 'host', text: `The host upheld ${owner.nickname}'s "${mission.title}". Points restored. Apologies owed.`, emoji: '⚖️' });
          direct.push({ to: owner.id, msg: { type: 'reward', points: mission.points, xp: mission.xp, ...r, title: `${mission.title} (upheld by the host)` } });
        } else {
          owner.hand = owner.hand.filter((h) => h.missionId !== mission.id);
          this.refillHand(party, owner);
          this.feed(party, { kind: 'host', text: `The host struck out ${owner.nickname}'s "${mission.title}". BS confirmed.`, emoji: '🚩' });
          direct.push({ to: owner.id, msg: { type: 'toast', text: `"${mission.title}" was struck out by the host. The people have spoken.`, emoji: '🚩', tone: 'warn' } });
        }
      }
      return;
    }
    if (approve) {
      this.approveClaim(party, claim, direct);
      if (resolver && claim.method === 'witness') { resolver.witnessed += 1; this.checkAchievements(party, resolver, direct); }
    } else {
      claim.status = 'rejected'; claim.resolvedAt = this.now();
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
      claim.status = 'disputed';
      if (ev) ev.disputed = true;
      if (owner) {
        // Freeze: take the reward back until the host rules.
        owner.points = Math.max(0, owner.points - mission.points); owner.xp = Math.max(0, owner.xp - mission.xp); owner.level = levelForXp(owner.xp);
        owner.missionsCompleted = Math.max(0, owner.missionsCompleted - 1);
        owner.categoryCounts[mission.category] = Math.max(0, (owner.categoryCounts[mission.category] ?? 1) - 1);
        owner.completedMissionIds = owner.completedMissionIds.filter((x) => x !== mission.id);
        this.feed(party, { kind: 'host', text: `BS CALLED on ${owner.nickname}'s "${mission.title}". Points frozen until the host rules.`, emoji: '🚩' });
        direct.push({ to: owner.id, msg: { type: 'toast', text: `Your mates called BS on "${mission.title}". The host decides. Start sweating.`, emoji: '🚩', tone: 'warn' } });
        direct.push({ to: party.hostId, msg: { type: 'toast', text: `BS called on ${owner.nickname}'s "${mission.title}". Your call.`, emoji: '⚖️', tone: 'info' } });
      }
    } else if (owner) {
      direct.push({ to: owner.id, msg: { type: 'toast', text: `Someone side-eyed your "${mission.title}". One more and the host gets involved.`, emoji: '👀', tone: 'warn' } });
    }
    return this.ok(party, { flags: claim.flags.length, disputed: claim.status === 'disputed' }, direct);
  }

  // ---------- battles ----------
  private liveBattleFor(party: PartyState, playerId: string): Battle | undefined {
    return Object.values(party.battles).find((b) => (b.status === 'active' || b.status === 'challenge') && (b.a.playerId === playerId || b.b.playerId === playerId));
  }

  private challenge(playerId: string, opponentId: string): HandleResult {
    const party = this.partyOf(playerId); const p = party?.players[playerId]; const o = party?.players[opponentId];
    if (!party || !p || p.removed) return this.fail('Join a party first.');
    if (!this.activePhase(party)) return this.fail('Battles open once the host starts the event.');
    if (!o || o.removed || o.id === p.id) return this.fail('Pick a mate to challenge.');
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
    party.battles[id] = battle;
    return this.ok(party, { battleId: id }, [{ to: o.id, msg: { type: 'toast', text: `${p.nickname} challenges you to a battle!`, emoji: '⚔️', tone: 'info' } }]);
  }

  private respondChallenge(playerId: string, battleId: string, accept: boolean): HandleResult {
    const party = this.partyOf(playerId);
    const b = party?.battles[battleId];
    if (!party || !b || b.status !== 'challenge' || b.opponentId !== playerId) return this.fail('No challenge to answer.');
    const now = this.now();
    if (!accept) { b.status = 'declined'; b.finishedAt = now; return this.ok(party, undefined, [{ to: b.challengerId, msg: { type: 'toast', text: `${party.players[playerId]?.nickname} declined. Cowardice noted.`, emoji: '🐔', tone: 'warn' } }]); }
    if (this.liveBattleFor(party, playerId)?.id !== b.id && this.liveBattleFor(party, playerId)) return this.fail('You are already in a battle.');
    b.status = 'active'; b.startedAt = now; b.round = 1; b.roundDeadline = now + ROUND_SECONDS * 1000;
    const pa = party.players[b.a.playerId]; const pb = party.players[b.b.playerId];
    if (pa) pa.missedRounds = 0; if (pb) pb.missedRounds = 0;
    this.feed(party, { kind: 'battle', text: `${pa?.nickname} vs ${pb?.nickname}: battle begins!`, emoji: '⚔️' });
    return this.ok(party);
  }

  private battleAction(playerId: string, battleId: string, round: number, action: BattleAction, tap?: TapQuality): HandleResult {
    const party = this.partyOf(playerId);
    const b = party?.battles[battleId];
    if (!party || !b || b.status !== 'active') return this.fail('That battle is not live.');
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
    if (!w || !l) return;
    w.wins += 1; l.losses += 1;
    b.rewards = {};
    const scored = b.scored && b.reason !== 'disconnect';
    if (scored) {
      w.scoredBattlesVs[l.id] = (w.scoredBattlesVs[l.id] ?? 0) + 1;
      l.scoredBattlesVs[w.id] = (l.scoredBattlesVs[w.id] ?? 0) + 1;
      const rw = this.grant(party, w, BATTLE_REWARDS.win.points, BATTLE_REWARDS.win.xp, direct);
      const rl = b.reason === 'surrender' || b.reason === 'timeout' ? { levelUp: undefined, unlocked: [], achievements: [] } : this.grant(party, l, BATTLE_REWARDS.lose.points, BATTLE_REWARDS.lose.xp, direct);
      b.rewards[w.id] = { ...BATTLE_REWARDS.win };
      b.rewards[l.id] = b.reason === 'surrender' || b.reason === 'timeout' ? { points: 0, xp: 0 } : { ...BATTLE_REWARDS.lose };
      direct.push({ to: w.id, msg: { type: 'reward', points: BATTLE_REWARDS.win.points, xp: BATTLE_REWARDS.win.xp, ...rw, title: `Victory over ${l.nickname}` } });
      if (b.rewards[l.id].xp > 0) direct.push({ to: l.id, msg: { type: 'reward', points: BATTLE_REWARDS.lose.points, xp: BATTLE_REWARDS.lose.xp, ...rl, title: `Honourable defeat to ${w.nickname}` } });
    } else {
      b.rewards[w.id] = { points: 0, xp: 0 }; b.rewards[l.id] = { points: 0, xp: 0 };
      this.checkAchievements(party, w, direct); this.checkAchievements(party, l, direct);
    }
    const how = b.reason === 'ko' ? 'knocked out' : b.reason === 'rounds' ? 'outlasted' : b.reason === 'surrender' ? 'accepted the surrender of' : 'outstayed';
    this.feed(party, { kind: 'battle', text: `${w.creatureName} (${w.nickname}) ${how} ${l.creatureName} (${l.nickname})${scored ? '' : ' (friendly)'}`, emoji: '🏆' });
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

  /** Periodic housekeeping: expire challenges, auto-resolve timed-out rounds. Returns codes of changed parties + direct messages. */
  tick(): { changed: string[]; direct: Outbound[] } {
    const now = this.now();
    const changed: string[] = []; const direct: Outbound[] = [];
    for (const party of Object.values(this.state.parties)) {
      let dirty = false;
      for (const b of Object.values(party.battles)) {
        if (b.status === 'challenge' && now - b.createdAt > CHALLENGE_TTL_MS) { b.status = 'expired'; b.finishedAt = now; dirty = true; }
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
      // prune old finished battles and feed
      for (const [id, b] of Object.entries(party.battles)) if (b.finishedAt && now - b.finishedAt > 6 * 3600_000 && Object.keys(party.battles).length > 60) delete party.battles[id];
      if (dirty) { party.seq++; changed.push(party.code); }
    }
    return { changed, direct };
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
        const prev = party.phase;
        party.phase = action.phase;
        if (action.phase === 'friday' || action.phase === 'saturday') {
          party.missionsOpen = true;
          if (action.phase === 'saturday' && prev === 'friday') party.fridayPoints = Object.fromEntries(Object.values(party.players).map((p) => [p.id, p.points]));
          for (const p of Object.values(party.players)) { if (p.removed) continue; p.rerollsLeft = REROLLS_PER_PHASE; if (p.creature) this.refillHand(party, p); }
        }
        if (action.phase === 'finale' || action.phase === 'ended') party.missionsOpen = false;
        if (action.phase === 'lobby') party.missionsOpen = false;
        const labels: Record<Phase, string> = { lobby: 'The party returns to the lobby.', friday: 'FRIDAY: THE AWAKENING begins. Missions are live!', saturday: 'SATURDAY: THE CHAMPIONSHIP begins. New missions, new secrets.', finale: 'THE FINALE. Awards incoming. Hold onto your hats.', ended: 'The weekend is complete. Legends, every one of you.' };
        this.feed(party, { kind: 'phase', text: labels[action.phase], emoji: '📣' });
        direct.push({ to: 'party', msg: { type: 'toast', text: labels[action.phase], emoji: '📣', tone: 'info' } });
        return this.ok(party, undefined, direct);
      }
      case 'setMissionsOpen': {
        party.missionsOpen = !!action.open;
        this.feed(party, { kind: 'host', text: action.open ? 'Missions are OPEN.' : 'Missions are paused by the host.', emoji: action.open ? '🟢' : '⏸️' });
        return this.ok(party);
      }
      case 'revealGroupMission': {
        const m = MISSION_BY_ID[action.missionId];
        if (!m || m.scope !== 'group') return this.fail('Not a group mission.');
        if (!party.revealedGroupMissions.includes(m.id)) party.revealedGroupMissions.push(m.id);
        this.feed(party, { kind: 'group', text: `GROUP MISSION: ${m.title}. Everyone in!`, emoji: '🫂' });
        direct.push({ to: 'party', msg: { type: 'toast', text: `Group mission revealed: ${m.title}`, emoji: '🫂', tone: 'info' } });
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
      case 'purgePhotos': {
        const urls: string[] = [];
        for (const c of Object.values(party.claims)) if (c.photoUrl) { urls.push(c.photoUrl); c.photoUrl = undefined; }
        for (const f of party.feed) if (f.photoUrl) { if (!urls.includes(f.photoUrl)) urls.push(f.photoUrl); f.photoUrl = undefined; }
        this.deletePhotos(urls);
        this.feed(party, { kind: 'host', text: `The host deleted ${urls.length} photo${urls.length === 1 ? '' : 's'} from the server. What happens in the vineyard…`, emoji: '🗑️' });
        return this.ok(party, { deleted: urls.length });
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

function newPlayer(id: string, nickname: string, now: number, isHost: boolean): PlayerState {
  return {
    id, nickname, creature: null, creatureName: '', level: 1, xp: 0, points: 0, equipped: { colorway: 0 }, unlocked: [], achievements: [],
    missionsCompleted: 0, wins: 0, losses: 0, title: 'Fresh Legend', online: true, isHost, joinedAt: now, lastSeen: now, categoryCounts: {}, witnessed: 0,
    hand: [], completedMissionIds: [], rerollsLeft: REROLLS_PER_PHASE, scoredBattlesVs: {}, missedRounds: 0, lastHonourClaimAt: 0, flagged: [],
  };
}

function toPublic(p: PlayerState): PlayerPublic {
  const { hand, completedMissionIds, rerollsLeft, scoredBattlesVs, missedRounds, lastHonourClaimAt, flagged, ...pub } = p;
  return pub;
}

function unique<T>(xs: T[]): T[] { return [...new Set(xs)]; }
