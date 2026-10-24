import { useEffect, useState } from 'react';
import { defaultSpotlightAt, fmtTime, spotlightPhase } from '@shared/ceremony';
import { ROWDY_KINDS, type RowdyKind } from '@shared/rowdy';
import type { HostAction, Phase, PlayerPublic } from '@shared/types';
import { GROUP_MISSIONS, MISSION_BY_ID } from '@shared/missions';
import { AWARDS } from '@shared/progression';
import { Creature, ItemIcon, LadPic } from '../components/Creature';
import { Button, Sheet, timeAgo } from '../components/ui';
import { useStore, useIsHost } from '../store';
import { request } from '../net';
import { sfx } from '../audio';
import { downloadEverything, downloadKeepsake } from '../keepsake';
import { EPIC_PRESETS, EPIC_TIERS, type EpicTier } from '@shared/epics';
import { COSMETICS, COSMETIC_BY_ID, STARTER_COSMETICS } from '@shared/progression';

const PHASES: { id: Phase; label: string; blurb: string }[] = [
  { id: 'lobby', label: 'Paused', blurb: 'Everything on hold. Use it for speeches or dinner.' },
  { id: 'friday', label: 'Friday', blurb: 'Starts on its own when you create the party.' },
  { id: 'saturday', label: 'Saturday', blurb: 'Kicks in by itself at 5am Saturday. Final evolutions unlock.' },
  { id: 'finale', label: 'Finale', blurb: 'Awards reveal. Challenges close.' },
  { id: 'ended', label: 'Ended', blurb: 'Results final.' },
];

export default function Host() {
  const party = useStore((s) => s.party);
  const hostView = useStore((s) => s.hostView);
  const isHost = useIsHost();
  const setTab = useStore((s) => s.setTab);
  const toast = useStore((s) => s.toast);
  const priv = useStore((s) => s.priv);
  const [section, setSection] = useState<'event' | 'approvals' | 'players' | 'awards'>('event');
  const [target, setTarget] = useState<PlayerPublic | null>(null);
  const [rename, setRename] = useState('');
  const [grant, setGrant] = useState('10');
  const [reason, setReason] = useState('');
  const [confirmPhase, setConfirmPhase] = useState<Phase | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [epicTitle, setEpicTitle] = useState('');
  const [epicWhat, setEpicWhat] = useState('');
  const [epicMax, setEpicMax] = useState(2);
  const [epicTier, setEpicTier] = useState<EpicTier>('medium');
  const [codeItem, setCodeItem] = useState('face_mo');
  const [codeUses, setCodeUses] = useState(1);
  const [grabItem, setGrabItem] = useState('hat_viking');
  const [grabQty, setGrabQty] = useState(3);
  const [grabMins, setGrabMins] = useState(0);
  const [grabTitle, setGrabTitle] = useState('');
  const [confirmGrab, setConfirmGrab] = useState(false);
  const [grabBusy, setGrabBusy] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [dropRarity, setDropRarity] = useState<'common' | 'rare' | 'epic' | 'legendary' | 'any'>('any');
  const [confirmRemove, setConfirmRemove] = useState(false);
  // the spotlight (loser's speech): defaults to 10pm tonight on this phone's clock, 2 minutes, the lad in last place
  const spot = party?.spotlight ?? null;
  const toHHMM = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const fromHHMM = (v: string) => { const [h, m] = v.split(':').map(Number); const d = new Date(); d.setHours(h || 0, m || 0, 0, 0); return d.getTime(); };
  const [spotLabel, setSpotLabel] = useState(spot?.label ?? 'The Loser\'s Speech');
  const [spotTime, setSpotTime] = useState(toHHMM(spot?.at ?? defaultSpotlightAt()));
  const [spotSecs, setSpotSecs] = useState(spot?.seconds ?? 120);
  const [spotWho, setSpotWho] = useState<string>(spot?.playerId ?? '');

  useEffect(() => { setConfirmRemove(false); }, [target?.id]);
  const releaseGiveaway = async () => {
    if (grabBusy) return; setGrabBusy(true); // one release per confirm, however many times the button is hit
    try {
      const r = await request<{ id: string; duplicate?: boolean }>({ type: 'host', action: { kind: 'makeGiveaway', item: grabItem, qty: grabQty, title: grabTitle, minutes: grabMins } });
      sfx.reward(); if (r.duplicate) toast('That one is already out there.', '🎁', 'info'); // otherwise the party-wide announcement is the confirmation
      setConfirmGrab(false); setGrabTitle('');
    } catch (e) { toast((e as Error).message, '⚠️', 'warn'); }
    finally { setGrabBusy(false); }
  };
  const hostCodes = hostView?.codes ?? [];
  const makeCode = async () => {
    try { const r = await request<{ code: string }>({ type: 'host', action: { kind: 'makeCode', item: codeItem, uses: codeUses } }); sfx.reward(); toast(`Code ${r.code} ready. Whisper it to a legend.`, '🎁', 'success'); }
    catch (e) { toast((e as Error).message, '⚠️', 'warn'); }
  };
  if (!party || !isHost) return <div className="screen with-nav"><div className="panel pad center">Host only.</div></div>;

  const host = async (action: HostAction) => {
    try { await request({ type: 'host', action }); sfx.select(); return true; } catch (e) { toast((e as Error).message, '⚠️', 'warn'); sfx.error(); return false; }
  };
  const moleEligible = party.players.filter((p) => p.creature && !p.isHost && p.id !== party.groomId).length;
  const saveSpot = (extra: Partial<{ start: boolean; stop: boolean }> = {}) => host({ kind: 'setSpotlight', label: spotLabel, at: fromHHMM(spotTime), seconds: spotSecs, playerId: spotWho || null, ...extra });
  const approvals = hostView?.approvals ?? [];
  const takedowns = hostView?.takedowns ?? [];
  const nickOf = (id: string) => party.players.find((x) => x.id === id)?.nickname ?? '?';
  const players = [...party.players].sort((a, b) => a.nickname.localeCompare(b.nickname));

  return (
    <div className="screen with-nav">
      <div className="topbar"><button className="display title-md" onClick={() => setTab('home')}>‹ Host controls</button><span className="pill pill-gold">👑 {party.code}</span></div>
      <div className="tabs" style={{ marginBottom: 10, fontSize: 11 }}>
        <button className={`tab ${section === 'event' ? 'on' : ''}`} style={{ fontSize: 11, letterSpacing: '.04em' }} onClick={() => setSection('event')}>Event</button>
        <button className={`tab ${section === 'approvals' ? 'on' : ''}`} style={{ fontSize: 11, letterSpacing: '.04em' }} onClick={() => setSection('approvals')}>Queue{approvals.length + takedowns.length ? ` · ${approvals.length + takedowns.length}` : ''}</button>
        <button className={`tab ${section === 'players' ? 'on' : ''}`} style={{ fontSize: 11, letterSpacing: '.04em' }} onClick={() => setSection('players')}>Players</button>
        <button className={`tab ${section === 'awards' ? 'on' : ''}`} style={{ fontSize: 11, letterSpacing: '.04em' }} onClick={() => setSection('awards')}>Awards</button>
      </div>
      <div className="screen-body scroll-y stack-10">
        {section === 'event' && (
          <>
            <div className="eyebrow">Event phase</div>
            <div className="stack-6">
              {PHASES.map((p) => <button key={p.id} className={`list-row ${party.phase === p.id ? 'me' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => party.phase !== p.id && setConfirmPhase(p.id)}><span style={{ fontSize: 18 }}>{party.phase === p.id ? '📍' : '○'}</span><span className="grow"><div className="bold">{p.label}</div><div className="tiny faint">{p.blurb}</div></span>{party.phase === p.id && <span className="pill pill-xs pill-gold">current</span>}</button>)}
            </div>
            <div className="tiny faint">The game runs itself: Friday starts straight away, Saturday at 5am, group challenges drop every 40 minutes, avatars auto-battle, the lads settle BS calls. Everything here is optional. Step in whenever you like.</div>
            <div className="divider" />
            <div className="row-between"><div><div className="bold">Boss raid</div><div className="tiny faint">{party.raid?.status === 'active' ? 'One is on right now.' : 'Turns up on its own once the lads have done enough challenges. Or summon one now.'}</div></div><Button size="sm" variant="secondary" disabled={party.raid?.status === 'active'} onClick={() => host({ kind: 'summonRaid' })}>Summon</Button></div>
            <div className="divider" />
            <div className="row-between"><div><div className="bold">Missions {party.missionsOpen ? 'open' : 'paused'}</div><div className="tiny faint">Pause during dinner, speeches, emergencies.</div></div><Button size="sm" variant={party.missionsOpen ? 'secondary' : 'primary'} onClick={() => host({ kind: 'setMissionsOpen', open: !party.missionsOpen })}>{party.missionsOpen ? 'Pause' : 'Open'}</Button></div>
            <div className="divider" />
            <div className="eyebrow">🎤 Spotlight on the TV</div>
            <div className="tiny faint">A scheduled countdown for the big moment: the loser's speech, the toast, the trophy. Shows on every Lobby and takes over the TV when you start it. Change anything, any time.</div>
            <div className="panel pad stack-6" data-testid="spotlight-panel">
              <input className="input" style={{ minHeight: 44, fontSize: 15 }} value={spotLabel} maxLength={40} onChange={(e) => setSpotLabel(e.target.value)} placeholder="The Loser's Speech" aria-label="What is the moment" />
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="small">At</span><input className="input" type="time" style={{ minHeight: 44, fontSize: 15, width: 120, flex: '0 0 120px' }} value={spotTime} onChange={(e) => setSpotTime(e.target.value)} aria-label="Time" data-testid="spot-time" />
                <span className="small">for</span>{[60, 120, 180, 300].map((n) => <button key={n} className={`pill pill-tap ${spotSecs === n ? 'pill-gold' : ''}`} onClick={() => setSpotSecs(n)}>{n / 60} min</button>)}
              </div>
              <select className="input" style={{ minHeight: 44, fontSize: 15 }} value={spotWho} onChange={(e) => setSpotWho(e.target.value)} aria-label="Whose moment" data-testid="spot-who">
                <option value="">Nobody in particular</option>
                {[...party.players].filter((p) => p.creature).sort((a, b) => a.points - b.points).map((p, i) => <option key={p.id} value={p.id}>{p.nickname}{i === 0 ? ' (last place right now)' : ''}</option>)}
              </select>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <Button size="sm" variant="secondary" onClick={() => saveSpot()} data-testid="spot-save">{spot ? 'Update' : 'Schedule it'}</Button>
                {spot && spotlightPhase(spot, party.serverTime) !== 'running' && <Button size="sm" onClick={() => saveSpot({ start: true })} data-testid="spot-start">▶ Start the clock now</Button>}
                {spot && spotlightPhase(spot, party.serverTime) === 'running' && <Button size="sm" variant="danger" onClick={() => saveSpot({ stop: true })} data-testid="spot-stop">■ Stop</Button>}
                {spot && <Button size="sm" variant="ghost" onClick={() => host({ kind: 'setSpotlight', clear: true })}>Clear</Button>}
              </div>
              {spot && <div className="tiny bold" data-testid="spot-status">{spotlightPhase(spot, party.serverTime) === 'running' ? '⏱ Running on the TV now.' : `Scheduled: ${spot.label}${spot.playerId ? ` · ${nickOf(spot.playerId)}` : ''} · ${fmtTime(spot.at)} · ${spot.seconds / 60} min. Start it when the room is ready.`}</div>}
            </div>
            <div className="row-between"><div><div className="bold">📽️ Photo reel on the TV</div><div className="tiny faint">{party.tvMode === 'reel' ? 'Rolling: every photo of the weekend, oldest first, full screen.' : 'Switch the TV to a full-screen run of every photo, oldest first. Good with the lights down.'}</div></div><Button size="sm" variant={party.tvMode === 'reel' ? 'danger' : 'secondary'} onClick={() => host({ kind: 'setTvMode', mode: party.tvMode === 'reel' ? 'auto' : 'reel' })} data-testid="tv-reel-toggle">{party.tvMode === 'reel' ? 'Back to normal' : '▶ Play the reel'}</Button></div>
            <div className="divider" />
            <div className="eyebrow">Photo checks</div>
            <div className="stack-6" role="radiogroup" aria-label="Photo checks">
              {([['vote', '🗳️ The lads vote', 'Photos post with 👍/👎. Two thumbs up and they count; two down and they\'re binned. Unsettled after 20 min? Counts.'], ['host', '👑 I approve them', 'Photos come to your Queue first. Anything you don\'t get to is approved after 45 min.'], ['instant', '⚡ Instant', 'Photos count straight away. The lads can still call BS.']] as const).map(([id, label, blurb]) => (
                <button key={id} role="radio" aria-checked={party.photoMode === id} className={`list-row ${party.photoMode === id ? 'me' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => party.photoMode !== id && host({ kind: 'setPhotoMode', mode: id })}>
                  <span className="grow"><div className="bold">{label}</div><div className="tiny faint">{blurb}</div></span>{party.photoMode === id && <span className="pill pill-xs pill-gold">on</span>}
                </button>))}
            </div>
            <div className="divider" />
            <div className="eyebrow">🟣 EPIC jobs</div>
            <div className="tiny faint">Post a real job. First lads to tap "I'm on it" fill the crew; when it's done each of them gets the points, XP and a themed item. Bigger jobs pay more: Small {EPIC_TIERS.small.points}, Medium {EPIC_TIERS.medium.points}, Big {EPIC_TIERS.big.points}, Legend {EPIC_TIERS.legend.points} pts.</div>
            {(party.epics ?? []).filter((e) => e.status === 'open').map((e) => (
              <div key={e.id} className="list-row epic-row"><span style={{ fontSize: 18 }}>{e.emoji}</span><span className="grow"><div className="bold">{e.title}</div><div className="tiny faint">{e.crew.length}/{e.max} on it{e.crew.length ? `: ${e.crew.map((id) => party.players.find((p) => p.id === id)?.nickname).join(', ')}` : ''}</div></span><Button size="xs" variant="ghost" onClick={() => host({ kind: 'cancelEpic', epicId: e.id })}>Cancel</Button></div>))}
            {(['Dinner', 'Brekkie', 'Runs', 'Crew'] as const).map((g) => (
              <div key={g} className="stack-6">
                <div className="tiny bold" style={{ opacity: 0.8 }}>{g}</div>
                <div className="epic-presets">
                  {EPIC_PRESETS.filter((p) => p.group === g).map((p) => { const live = (party.epics ?? []).some((e) => e.status === 'open' && e.presetId === p.id); return (
                    <button key={p.id} className="epic-preset" disabled={live} onClick={() => host({ kind: 'postEpic', presetId: p.id })}>
                      <span style={{ fontSize: 20 }}>{p.emoji}</span><b>{p.title}</b><small>{p.min === p.max ? `${p.max}` : `${p.min}–${p.max}`} lad{p.max === 1 ? '' : 's'} · {EPIC_TIERS[p.tier].label} +{EPIC_TIERS[p.tier].points}{live ? ' · live' : ''}</small>
                    </button>); })}
                </div>
              </div>))}
            <div className="panel pad stack-6">
              <div className="small bold">Or make your own</div>
              <input className="input" style={{ minHeight: 44, fontSize: 16 }} value={epicTitle} maxLength={40} onChange={(e) => setEpicTitle(e.target.value)} placeholder="Job name, e.g. Ice Run" />
              <input className="input" style={{ minHeight: 44, fontSize: 16 }} value={epicWhat} maxLength={130} onChange={(e) => setEpicWhat(e.target.value)} placeholder="What needs doing" />
              <div className="row-between"><span className="small">How many lads?</span><span className="row" style={{ gap: 6 }}>{[1, 2, 3, 4].map((n) => <button key={n} className={`pill ${epicMax === n ? 'pill-epic' : ''}`} onClick={() => setEpicMax(n)}>{n}</button>)}</span></div>
              <div className="row-between"><span className="small">How big a job?</span><span className="row" style={{ gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{(Object.keys(EPIC_TIERS) as EpicTier[]).map((t) => <button key={t} className={`pill pill-xs ${epicTier === t ? 'pill-epic' : ''}`} onClick={() => setEpicTier(t)}>{EPIC_TIERS[t].label} +{EPIC_TIERS[t].points}</button>)}</span></div>
              <Button size="sm" disabled={epicTitle.trim().length < 3} onClick={() => { host({ kind: 'postEpic', title: epicTitle, instruction: epicWhat, min: epicMax, max: epicMax, tier: epicTier }); setEpicTitle(''); setEpicWhat(''); }}>🟣 Post EPIC job</Button>
            </div>
            <div className="divider" />
            <div className="eyebrow">⚡ Hype</div>
            <div className="tiny faint">Quick lifts for the room. Everyone gets told.</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {[30, 60].map((m) => <Button key={m} size="sm" variant="secondary" disabled={!!party.xpBoostUntil && party.xpBoostUntil > party.serverTime} onClick={() => host({ kind: 'xpBoost', minutes: m })}>⚡ Double XP · {m} min</Button>)}
              {!party.capLifted && (party.phase === 'friday' || party.phase === 'lobby') && <Button size="sm" variant="secondary" onClick={() => host({ kind: 'liftXpCap' })}>🧬 Unlock final forms tonight</Button>}
            </div>
            <div className="panel pad stack-6" data-testid="rowdy-panel">
              <div className="small bold">🍻 Rowdy Round</div>
              <div className="tiny faint">A prompt on every phone and the TV, with a clock. Sips are the room's forfeit; the app only counts votes and never scores drinking.</div>
              {party.rowdy && <div className="tiny bold">{party.rowdy.revealed ? 'Last round is showing its result.' : `Running: ${ROWDY_KINDS[party.rowdy.kind].label} · ${party.rowdy.votes} vote${party.rowdy.votes === 1 ? '' : 's'} in.`}</div>}
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(ROWDY_KINDS) as RowdyKind[]).map((k) => <Button key={k} size="sm" variant="secondary" disabled={!!party.rowdy && !party.rowdy.revealed} onClick={() => host({ kind: 'startRowdy', rowdy: k })} data-testid={`rowdy-${k}`}>{ROWDY_KINDS[k].emoji} {ROWDY_KINDS[k].label}</Button>)}
                <Button size="sm" variant="secondary" disabled={!!party.rowdy && !party.rowdy.revealed} onClick={() => host({ kind: 'startRowdy' })}>🎲 Lucky dip</Button>
                {party.rowdy && <Button size="sm" variant="danger" onClick={() => host({ kind: 'endRowdy' })} data-testid="rowdy-end">{party.rowdy.revealed ? 'Clear' : '■ End now'}</Button>}
              </div>
            </div>
            <div className="panel pad stack-6">
              <div className="small bold">🎁 Lucky Drop for everyone</div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{(['any', 'common', 'rare', 'epic', 'legendary'] as const).map((r) => <button key={r} className={`pill pill-tap ${dropRarity === r ? 'pill-gold' : ''}`} onClick={() => setDropRarity(r)}>{dropRarity === r ? '✓ ' : ''}{r === 'any' ? 'lucky dip' : r}</button>)}</div>
              <Button size="sm" variant="secondary" onClick={() => host({ kind: 'giveDrops', rarity: dropRarity === 'any' ? undefined : dropRarity })} data-testid="give-drops">🎁 Drop one on every lad</Button>
              <div className="tiny faint">Everyone also earns one every third challenge and for each quest. Legendary for all is a big moment; save it.</div>
            </div>
            <div className="panel pad stack-6">
              <div className="small bold">🕵️ The Mole</div>
              {(!party.mole || party.mole.revealed) && <><div className="tiny faint">Picks lads at random (not you, not the groom) and gives them secret sabotage missions. Everyone votes. Starts on its own at 5am Saturday. Only you see who they are.{moleEligible < 8 ? ' Two Moles needs eight eligible lads.' : ''}</div><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><Button size="sm" variant="secondary" disabled={moleEligible < 4} onClick={() => host({ kind: 'assignMole', count: 1 })} data-testid="assign-mole">🕵️ Pick 1 Mole</Button><Button size="sm" variant="secondary" disabled={moleEligible < 8} onClick={() => host({ kind: 'assignMole', count: 2 })} data-testid="assign-moles">🕵️🕵️ Pick 2 Moles</Button></div></>}
              {party.mole && party.mole.voting && <>
                <div className="tiny faint">{party.mole.count > 1 ? `${party.mole.count} Moles are` : 'A Mole is'} in play. {party.mole.votes} lad{party.mole.votes === 1 ? ' has' : 's have'} voted. Reveal at the finale, or whenever the room is ready.</div>
                <div className="panel pad stack-6" style={{ borderColor: 'var(--rose)' }} data-testid="mole-host">
                  <div className="tiny bold">Only you can see this.</div>
                  {(priv?.moleHost ?? []).map((m) => <div key={m.playerId} className="row small" style={{ gap: 8 }}><span>🕵️</span><span className="grow bold">{nickOf(m.playerId)}</span><span className="tiny faint">{m.done}/{m.total} missions done</span></div>)}
                  {party.mole.count < 3 && <div className="tiny faint">Add another: Players → tap a lad → Make them a Mole.</div>}
                </div>
                <Button size="sm" variant="danger" onClick={() => host({ kind: 'revealMole' })} data-testid="reveal-mole">🕵️ Reveal the Mole{party.mole.count > 1 ? 's' : ''}</Button>
              </>}
              {party.mole?.revealed && <div className="tiny bold">Revealed: {party.mole.revealed.moles.map((m) => `${nickOf(m.playerId)} (${m.caught ? 'caught' : 'got away'})`).join(', ')}. Pick again above for another round.</div>}
            </div>
            {!!party.xpBoostUntil && party.xpBoostUntil > party.serverTime && <div className="tiny bold">⚡ Double XP is on for another {Math.ceil((party.xpBoostUntil - party.serverTime) / 60_000)} min.</div>}
            <div className="divider" />
            <div className="eyebrow">🎁 Up for grabs</div>
            <div className="tiny faint">Release a few of an accessory for everyone to grab. First in, first served, one each. It shows on every lad's Lobby and Me screen.</div>
            <div className="panel pad stack-6">
              <div className="row" style={{ gap: 8 }}>
                <ItemIcon id={grabItem} size={40} />
                <select className="input grow" style={{ minHeight: 44, fontSize: 16 }} value={grabItem} onChange={(e) => setGrabItem(e.target.value)} aria-label="Item to release">
                  {COSMETICS.filter((c) => !STARTER_COSMETICS.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{/^(Reward code|Lucky Drop)/.test(c.description) ? '⭐ ' : ''}{c.name}</option>)}
                </select>
              </div>
              <div className="row-between"><span className="small">How many</span><span className="row" style={{ gap: 6 }}>{[...new Set([1, 3, 5, Math.max(1, party.players.length)])].sort((x, y) => x - y).map((n) => <button key={n} className={`pill ${grabQty === n ? 'pill-gold' : ''}`} onClick={() => setGrabQty(n)}>{n === party.players.length ? `all ${n}` : n}</button>)}</span></div>
              <div className="row-between"><span className="small">Open for</span><span className="row" style={{ gap: 6 }}>{[0, 10, 30, 60].map((m) => <button key={m} className={`pill ${grabMins === m ? 'pill-gold' : ''}`} onClick={() => setGrabMins(m)}>{m === 0 ? 'no limit' : m === 60 ? '1 hr' : `${m} min`}</button>)}</span></div>
              <input className="input" style={{ minHeight: 44, fontSize: 16 }} value={grabTitle} maxLength={60} onChange={(e) => setGrabTitle(e.target.value)} placeholder="Title (optional), e.g. Vikings for the speech crew" aria-label="Giveaway title" />
              <Button size="sm" onClick={() => setConfirmGrab(true)}>🎁 Release…</Button>
            </div>
            {[...(party.giveaways ?? [])].reverse().map((g) => { const live = g.status === 'active'; return (
              <div key={g.id} className="list-row" data-testid="host-giveaway">
                <ItemIcon id={g.item} size={30} />
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="bold ellipsis">{g.title} <span className={`pill pill-xs ${live ? 'pill-ok' : ''}`}>{live ? 'live' : g.status === 'exhausted' ? 'all gone' : g.status === 'cancelled' ? 'closed by you' : 'time up'}</span></div>
                  <div className="tiny faint ellipsis">{COSMETIC_BY_ID[g.item]?.name} · claimed {g.claims.length}/{g.qty}{g.claims.length ? ` by ${g.claims.map((c) => nickOf(c.playerId)).join(', ')}` : ''}</div>
                </span>
                {live && <Button size="xs" variant={closing === g.id ? 'danger' : 'ghost'} onClick={() => { if (closing === g.id) { host({ kind: 'endGiveaway', giveawayId: g.id }); setClosing(null); } else setClosing(g.id); }}>{closing === g.id ? 'Sure? Close' : 'Close'}</Button>}
              </div>); })}
            <div className="divider" />
            <div className="eyebrow">🎁 Reward codes</div>
            <div className="tiny faint">Make a code for an accessory and give it to whoever you reckon deserves it. They type it in on their Me screen. Only you can see these.</div>
            <div className="panel pad stack-6">
              <select className="input" style={{ minHeight: 44, fontSize: 16 }} value={codeItem} onChange={(e) => setCodeItem(e.target.value)} aria-label="Accessory">
                {COSMETICS.filter((c) => !STARTER_COSMETICS.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{/^(Reward code|Lucky Drop)/.test(c.description) ? '⭐ ' : ''}{c.name}</option>)}
              </select>
              <div className="tiny faint">{COSMETIC_BY_ID[codeItem]?.description}</div>
              <div className="row-between"><span className="small">Can be used by</span><span className="row" style={{ gap: 6 }}>{[1, 3, 15].map((n) => <button key={n} className={`pill ${codeUses === n ? 'pill-gold' : ''}`} onClick={() => setCodeUses(n)}>{n === 1 ? '1 lad' : n === 15 ? 'everyone' : `${n} lads`}</button>)}</span></div>
              <Button size="sm" onClick={makeCode}>🎁 Make a code</Button>
            </div>
            {[...hostCodes].reverse().map((c) => (
              <div key={c.code} className="list-row code-row">
                <span className="grow" style={{ minWidth: 0 }}><div className="bold" style={{ fontFamily: 'monospace', letterSpacing: '.08em' }}>{c.code}</div><div className="tiny faint ellipsis">{COSMETIC_BY_ID[c.item]?.name} · used {c.redeemedBy.length}/{c.uses}{c.redeemedBy.length ? ` by ${c.redeemedBy.map(nickOf).join(', ')}` : ''}</div></span>
                <Button size="xs" variant="ghost" onClick={() => host({ kind: 'deleteCode', code: c.code })}>Delete</Button>
              </div>))}
            <div className="divider" />
            <div className="eyebrow">Group challenges</div>
            {GROUP_MISSIONS.map((m) => { const on = party.revealedGroupMissions.includes(m.id); return <div key={m.id} className="list-row"><span className="grow"><div className="bold">{m.title} <span className="tiny faint">+{m.points}</span></div><div className="tiny dim">{m.instruction}</div></span>{on ? <span className="pill pill-xs pill-ok">live</span> : <Button size="xs" onClick={() => host({ kind: 'revealGroupMission', missionId: m.id })}>Reveal</Button>}</div>; })}
            <div className="divider" />
            <div className="eyebrow">Host PIN</div>
            <div className="small dim">{party.hasHostPin ? 'Set. Anyone in the party can use it on Party → Claim host, so keep it to yourself.' : 'Not set. Set one so you can take back host from another phone if yours dies.'}</div>
            <div className="row" style={{ gap: 6 }}><input className="input" style={{ minHeight: 44, fontSize: 16 }} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="4–6 digits" inputMode="numeric" type="password" /><Button size="sm" variant="secondary" disabled={newPin.length < 4} onClick={() => { host({ kind: 'setHostPin', pin: newPin }); setNewPin(''); toast('Host PIN saved', '🔐', 'success'); }}>{party.hasHostPin ? 'Change' : 'Set PIN'}</Button></div>
            <div className="divider" />
            <div className="eyebrow">📦 Keepsake</div>
            <div className="small dim">One .zip with every photo (named by who and what), every roast and toast, the awards, the final board and the cellar, plus spreadsheets. Best on a laptop; do it before you delete any photos.</div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button size="sm" onClick={() => downloadEverything().catch((e) => toast((e as Error).message, '⚠️', 'warn'))} data-testid="download-everything">📦 Download everything</Button>
              <Button size="sm" variant="ghost" onClick={() => downloadKeepsake().catch((e) => toast((e as Error).message, '⚠️', 'warn'))}>Just the page</Button>
            </div>
            <div className="divider" />
            <div className="eyebrow">Photos</div>
            <div className="row-between"><div className="small dim">Mission photos sit on this game's server only, visible to this party. Wipe them when the weekend's done.</div><Button size="sm" variant="danger" onClick={() => setConfirmPurge(true)}>Delete all</Button></div>
          </>
        )}
        {section === 'approvals' && (
          <>
            {takedowns.map((t) => (
              <div key={t.photoId} className="panel pad stack-6">
                <div className="row-between"><span className="bold">🗑️ Take-down request</span><span className="tiny faint">{timeAgo(t.at)}</span></div>
                <div className="small dim">{t.by.map(nickOf).join(' & ')} asked for {nickOf(t.ownerId)}&apos;s photo ({t.caption}) to come down.</div>
                <img src={t.url} alt="Photo" className="tap-photo" style={{ width: '100%', borderRadius: 12, maxHeight: 220, objectFit: 'cover' }} onClick={() => useStore.getState().openPhoto({ src: t.url, caption: t.caption })} />
                <div className="btn-row"><Button size="sm" variant="secondary" onClick={() => host({ kind: 'resolveTakedown', photoId: t.photoId, remove: false })}>Keep it up</Button><Button size="sm" variant="danger" onClick={() => host({ kind: 'resolveTakedown', photoId: t.photoId, remove: true })}>Take it down</Button></div>
              </div>))}
            {approvals.length === 0 && takedowns.length === 0 && <div className="panel pad center dim bold">Nothing waiting. The lads sort BS calls out themselves; you can step in here if you want.</div>}
            {approvals.some((c) => c.review === 'vote') && <div className="tiny faint">Photos marked 🗳️ are being voted on by the lads. You can settle them early.</div>}
            {approvals.map((c) => { const m = MISSION_BY_ID[c.missionId]; const p = party.players.find((x) => x.id === c.playerId); return (
              <div key={c.id} className="panel pad stack-6">
                <div className="row-between"><span className="bold">{p?.nickname ?? '?'} · {m?.title}</span><span className="tiny faint">{timeAgo(c.createdAt)}</span></div>
                {c.review === 'vote' && c.status === 'pending' && <div className="pill pill-xs" style={{ alignSelf: 'flex-start' }}>🗳️ lads voting · 👍 {c.votesUp?.length ?? 0} 👎 {c.votesDown?.length ?? 0}</div>}
                {c.status === 'disputed' && <div className="pill pill-ember" style={{ alignSelf: 'flex-start' }}>🚩 BS called by {(c.flags ?? []).map((id) => party.players.find((x) => x.id === id)?.nickname ?? '?').join(' & ')} · points frozen</div>}
                <div className="small dim">{m?.instruction}</div>
                {c.photoUrl && <img src={c.photoUrl} alt="Proof" className="tap-photo" onClick={() => useStore.getState().openPhoto({ src: c.photoUrl!, caption: m?.title })} style={{ width: '100%', borderRadius: 12, maxHeight: 260, objectFit: 'cover' }} />}
                {c.note && <div className="small italic">“{c.note}”</div>}
                <div className="btn-row"><Button size="sm" variant={c.status === 'disputed' ? 'danger' : 'secondary'} onClick={() => host({ kind: 'resolveClaim', claimId: c.id, approve: false })}>{c.status === 'disputed' ? 'Strike it out' : 'Reject'}</Button><Button size="sm" onClick={() => host({ kind: 'resolveClaim', claimId: c.id, approve: true })}>{c.status === 'disputed' ? 'Uphold it' : `Approve +${m?.points}`}</Button></div>
              </div>); })}
          </>
        )}
        {section === 'event' && <div className="tiny faint center" data-testid="build-stamp">Build {party.build}</div>}
        {section === 'players' && players.map((p) => (
          <button key={p.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { setTarget(p); setRename(p.nickname); }}>
            <span className="avatar sm"><LadPic p={p} /></span>
            <span className="grow"><div className="bold">{p.isHost ? '👑 ' : ''}{party.groomId === p.id ? '🤵 ' : ''}{p.nickname}{p.catchUp ? ' 🦵' : ''}</div><div className="tiny faint">{p.points} pts · {p.missionsCompleted} missions · {p.online ? 'online' : 'away'}</div></span>
            <span className="tiny faint">manage ›</span>
          </button>
        ))}
        {section === 'awards' && (
          <>
            <div className="tiny dim">Awards come from real play: reactions, votes, challenges, battles and raids. Override any of them here. "Most Unhinged" is yours alone to give.</div>
            {AWARDS.map((a) => { const cur = party.awards?.find((x) => x.id === a.id); return (
              <div key={a.id} className="panel pad stack-6">
                <div className="row-between"><span className="bold">{a.name}</span>{cur?.hostPick && <span className="pill pill-xs pill-gold">host pick</span>}</div>
                <div className="tiny faint">{a.blurb}{cur ? ` · currently: ${party.players.find((p) => p.id === cur.playerId)?.nickname ?? 'nobody'}` : ' · visible once the Finale starts'}</div>
                <select className="input" style={{ minHeight: 44, fontSize: 15 }} value={cur?.hostPick ? cur.playerId ?? '' : '__auto'} onChange={(e) => host({ kind: 'setAward', awardId: a.id, playerId: e.target.value === '__auto' ? null : e.target.value || null })}>
                  <option value="__auto">{a.hostPick ? 'Nobody (yet)' : 'Automatic (from play data)'}</option>
                  {players.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)}
                </select>
              </div>); })}
            <div className="divider" />
            <Button variant={party.finalized ? 'secondary' : 'primary'} onClick={() => host({ kind: 'finalize', finalized: !party.finalized })}>{party.finalized ? 'Un-finalise results' : 'Finalise results & crown the legends'}</Button>
          </>
        )}
      </div>

      {confirmPurge && <Sheet center onClose={() => setConfirmPurge(false)}><div className="center stack-10"><div className="eyebrow">Delete photos</div><div className="display title-md">Wipe every party photo?</div><div className="small dim">Files are deleted from the server and removed from the feed. Points already awarded stay. This cannot be undone, so download your keepsake copy first (see README → Photos).</div><div className="btn-row"><Button variant="secondary" size="sm" onClick={() => setConfirmPurge(false)}>Keep them</Button><Button variant="danger" size="sm" onClick={() => { host({ kind: 'purgePhotos' }); setConfirmPurge(false); }}>Delete all</Button></div></div></Sheet>}
      {confirmGrab && <Sheet center onClose={() => !grabBusy && setConfirmGrab(false)}><div className="center stack-10"><div className="eyebrow">Up for grabs</div><ItemIcon id={grabItem} size={64} /><div className="display title-md">Release {grabQty}× {COSMETIC_BY_ID[grabItem]?.name}?</div><div className="small dim">Every lad in {party.code} can grab one{grabMins ? `, for the next ${grabMins === 60 ? 'hour' : `${grabMins} minutes`}` : ''}. First in, first served, one each. You can close it early.</div><div className="btn-row"><Button variant="secondary" size="sm" disabled={grabBusy} onClick={() => setConfirmGrab(false)}>Cancel</Button><Button size="sm" disabled={grabBusy} onClick={() => void releaseGiveaway()} data-testid="confirm-release">{grabBusy ? 'Releasing…' : 'Release it'}</Button></div></div></Sheet>}
      {confirmPhase && <Sheet center onClose={() => setConfirmPhase(null)}><div className="center stack-10"><div className="eyebrow">Change phase</div><div className="display title-md">Move to {PHASES.find((p) => p.id === confirmPhase)?.label}?</div><div className="small dim">{PHASES.find((p) => p.id === confirmPhase)?.blurb} Everyone is notified.</div><div className="btn-row"><Button variant="secondary" size="sm" onClick={() => setConfirmPhase(null)}>Cancel</Button><Button size="sm" onClick={() => { host({ kind: 'setPhase', phase: confirmPhase }); setConfirmPhase(null); }}>Do it</Button></div></div></Sheet>}

      {target && (
        <Sheet onClose={() => setTarget(null)}>
          <div className="row" style={{ marginBottom: 10 }}><span className="avatar">{target.creature ? <Creature creature={target.creature} level={target.level} colorway={target.equipped.colorway} bare /> : '🥚'}</span><span className="grow"><div className="display title-md">{target.nickname}</div><div className="tiny faint">{target.creatureName || 'no creature'} · {target.points} pts</div></span></div>
          <div className="stack-10">
            <div className="row" style={{ gap: 6 }}><input className="input" style={{ minHeight: 44, fontSize: 15 }} value={rename} onChange={(e) => setRename(e.target.value)} maxLength={16} /><Button size="sm" variant="secondary" onClick={() => host({ kind: 'renamePlayer', playerId: target.id, nickname: rename })}>Rename</Button></div>
            <div className="row" style={{ gap: 6 }}><input className="input" style={{ minHeight: 44, fontSize: 15, width: 80, flex: '0 0 80px' }} type="number" value={grant} onChange={(e) => setGrant(e.target.value)} /><input className="input" style={{ minHeight: 44, fontSize: 15 }} placeholder="reason (e.g. best speech)" value={reason} onChange={(e) => setReason(e.target.value)} /><Button size="sm" variant="secondary" onClick={() => host({ kind: 'grantPoints', playerId: target.id, points: Number(grant), reason })}>Grant</Button></div>
            <div className="eyebrow">Reset a completed challenge</div>
            <div className="scroll-y stack-6" style={{ maxHeight: 140 }}>
              {Object.entries(target.categoryCounts).length === 0 && <div className="tiny faint">No completed challenges.</div>}
              {party.feed.filter((f) => f.kind === 'mission' && f.playerId === target.id).slice(-8).reverse().map((f) => { const title = f.text.match(/"([^"]+)"/)?.[1]; const m = title ? Object.values(MISSION_BY_ID).find((x) => x.title === title) : undefined; return m ? <div key={f.id} className="list-row"><span className="grow small">{m.title}</span><Button size="xs" variant="secondary" onClick={() => host({ kind: 'resetClaim', playerId: target.id, missionId: m.id })}>Reset</Button></div> : null; })}
            </div>
            <button className="row-between panel pad" style={{ width: '100%', textAlign: 'left', padding: '8px 12px' }} onClick={() => host({ kind: 'setCatchUp', playerId: target.id, on: !target.catchUp })} aria-label="Fresh Legs">
              <span><div className="bold small">🦵 Fresh Legs (late arrival)</div><div className="tiny faint">{target.catchUp ? `On: ${target.freshLegs} double-points challenges left, double XP till they catch up.` : 'Double points on 6 challenges, double XP till they catch the lads. Saturday turns it on by itself for anyone under 3 challenges.'}</div></span>
              <span className={`switch ${target.catchUp ? 'on' : ''}`} />
            </button>
            {target.creature && <div className="panel pad stack-6" data-testid="gift-drop-panel">
              <div className="bold small">🎁 Gift {target.nickname} a Lucky Drop</div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{(['any', 'common', 'rare', 'epic', 'legendary'] as const).map((r) => <button key={r} className={`pill pill-tap ${dropRarity === r ? 'pill-gold' : ''}`} onClick={() => setDropRarity(r)}>{dropRarity === r ? '✓ ' : ''}{r === 'any' ? 'lucky dip' : r}</button>)}</div>
              <Button size="sm" variant="secondary" onClick={async () => { if (await host({ kind: 'giveDrops', rarity: dropRarity === 'any' ? undefined : dropRarity, playerId: target.id })) toast(`Sent ${target.nickname} a drop.`, '🎁', 'success'); }} data-testid="gift-drop">🎁 Send it</Button>
            </div>}
            {target.creature && party.mole?.voting && !target.isHost && !(priv?.moleHost ?? []).some((m) => m.playerId === target.id) && party.mole.count < 3 && <Button size="sm" variant="secondary" onClick={() => { host({ kind: 'assignMole', playerId: target.id }); setTarget(null); }} data-testid="make-mole">🕵️ Make them a Mole too</Button>}
            {party.groomId !== target.id && <Button size="sm" variant="secondary" onClick={() => { host({ kind: 'setGroom', playerId: target.id }); setTarget(null); }}>🤵 This is Jezza (the groom)</Button>}
            <div className="btn-row">
              {!target.isHost && <Button size="sm" variant="secondary" onClick={() => { host({ kind: 'transferHost', playerId: target.id }); setTarget(null); }}>Make host</Button>}
              {!target.isHost && !confirmRemove && <Button size="sm" variant="danger" onClick={() => setConfirmRemove(true)}>Remove</Button>}
              {!target.isHost && confirmRemove && <Button size="sm" variant="danger" onClick={() => { host({ kind: 'removePlayer', playerId: target.id }); setTarget(null); setConfirmRemove(false); }} data-testid="confirm-remove" style={{ flex: '1 1 100%' }}>Sure? Remove them</Button>}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
