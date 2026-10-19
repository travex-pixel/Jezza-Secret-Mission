import { useState } from 'react';
import type { HostAction, Phase, PlayerPublic } from '@shared/types';
import { GROUP_MISSIONS, MISSION_BY_ID } from '@shared/missions';
import { AWARDS } from '@shared/progression';
import { Creature } from '../components/Creature';
import { Button, Sheet, timeAgo } from '../components/ui';
import { useStore, useIsHost } from '../store';
import { request } from '../net';
import { sfx } from '../audio';
import { downloadKeepsake } from '../keepsake';

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
  const [section, setSection] = useState<'event' | 'approvals' | 'players' | 'awards'>('event');
  const [target, setTarget] = useState<PlayerPublic | null>(null);
  const [rename, setRename] = useState('');
  const [grant, setGrant] = useState('10');
  const [reason, setReason] = useState('');
  const [confirmPhase, setConfirmPhase] = useState<Phase | null>(null);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [newPin, setNewPin] = useState('');
  if (!party || !isHost) return <div className="screen with-nav"><div className="panel pad center">Host only.</div></div>;

  const host = async (action: HostAction) => {
    try { await request({ type: 'host', action }); sfx.select(); } catch (e) { toast((e as Error).message, '⚠️', 'warn'); sfx.error(); }
  };
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
            <div className="eyebrow">Photo checks</div>
            <div className="stack-6" role="radiogroup" aria-label="Photo checks">
              {([['vote', '🗳️ The lads vote', 'Photos post with 👍/👎. Two thumbs up and they count; two down and they\'re binned. Unsettled after 20 min? Counts.'], ['host', '👑 I approve them', 'Photos come to your Queue first. Anything you don\'t get to is approved after 45 min.'], ['instant', '⚡ Instant', 'Photos count straight away. The lads can still call BS.']] as const).map(([id, label, blurb]) => (
                <button key={id} role="radio" aria-checked={party.photoMode === id} className={`list-row ${party.photoMode === id ? 'me' : ''}`} style={{ width: '100%', textAlign: 'left' }} onClick={() => party.photoMode !== id && host({ kind: 'setPhotoMode', mode: id })}>
                  <span className="grow"><div className="bold">{label}</div><div className="tiny faint">{blurb}</div></span>{party.photoMode === id && <span className="pill pill-xs pill-gold">on</span>}
                </button>))}
            </div>
            <div className="divider" />
            <div className="eyebrow">Group missions</div>
            {GROUP_MISSIONS.map((m) => { const on = party.revealedGroupMissions.includes(m.id); return <div key={m.id} className="list-row"><span className="grow"><div className="bold">{m.title} <span className="tiny faint">+{m.points}</span></div><div className="tiny dim">{m.instruction}</div></span>{on ? <span className="pill pill-xs pill-ok">live</span> : <Button size="xs" onClick={() => host({ kind: 'revealGroupMission', missionId: m.id })}>Reveal</Button>}</div>; })}
            <div className="divider" />
            <div className="eyebrow">Host PIN</div>
            <div className="small dim">{party.hasHostPin ? 'Set. Anyone in the party can use it on Party → Claim host, so keep it to yourself.' : 'Not set. Set one so you can take back host from another phone if yours dies.'}</div>
            <div className="row" style={{ gap: 6 }}><input className="input" style={{ minHeight: 44, fontSize: 16 }} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="4–6 digits" inputMode="numeric" type="password" /><Button size="sm" variant="secondary" disabled={newPin.length < 4} onClick={() => { host({ kind: 'setHostPin', pin: newPin }); setNewPin(''); toast('Host PIN saved', '🔐', 'success'); }}>{party.hasHostPin ? 'Change' : 'Set PIN'}</Button></div>
            <div className="divider" />
            <div className="eyebrow">Keepsake</div>
            <div className="row-between"><div className="small dim">Download every roast, toast, drink review, award and the final board as one page you can keep.</div><Button size="sm" variant="secondary" onClick={() => downloadKeepsake().catch((e) => toast((e as Error).message, '⚠️', 'warn'))}>Download</Button></div>
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
        {section === 'players' && players.map((p) => (
          <button key={p.id} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { setTarget(p); setRename(p.nickname); }}>
            <span className="avatar sm">{p.creature ? <Creature creature={p.creature} level={p.level} colorway={p.equipped.colorway} bare /> : '🥚'}</span>
            <span className="grow"><div className="bold">{p.isHost ? '👑 ' : ''}{party.groomId === p.id ? '🤵 ' : ''}{p.nickname}</div><div className="tiny faint">{p.points} pts · {p.missionsCompleted} missions · {p.online ? 'online' : 'away'}</div></span>
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
      {confirmPhase && <Sheet center onClose={() => setConfirmPhase(null)}><div className="center stack-10"><div className="eyebrow">Change phase</div><div className="display title-md">Move to {PHASES.find((p) => p.id === confirmPhase)?.label}?</div><div className="small dim">{PHASES.find((p) => p.id === confirmPhase)?.blurb} Everyone is notified.</div><div className="btn-row"><Button variant="secondary" size="sm" onClick={() => setConfirmPhase(null)}>Cancel</Button><Button size="sm" onClick={() => { host({ kind: 'setPhase', phase: confirmPhase }); setConfirmPhase(null); }}>Do it</Button></div></div></Sheet>}

      {target && (
        <Sheet onClose={() => setTarget(null)}>
          <div className="row" style={{ marginBottom: 10 }}><span className="avatar">{target.creature ? <Creature creature={target.creature} level={target.level} colorway={target.equipped.colorway} bare /> : '🥚'}</span><span className="grow"><div className="display title-md">{target.nickname}</div><div className="tiny faint">{target.creatureName || 'no creature'} · {target.points} pts</div></span></div>
          <div className="stack-10">
            <div className="row" style={{ gap: 6 }}><input className="input" style={{ minHeight: 44, fontSize: 15 }} value={rename} onChange={(e) => setRename(e.target.value)} maxLength={16} /><Button size="sm" variant="secondary" onClick={() => host({ kind: 'renamePlayer', playerId: target.id, nickname: rename })}>Rename</Button></div>
            <div className="row" style={{ gap: 6 }}><input className="input" style={{ minHeight: 44, fontSize: 15, width: 80, flex: '0 0 80px' }} type="number" value={grant} onChange={(e) => setGrant(e.target.value)} /><input className="input" style={{ minHeight: 44, fontSize: 15 }} placeholder="reason (e.g. best speech)" value={reason} onChange={(e) => setReason(e.target.value)} /><Button size="sm" variant="secondary" onClick={() => host({ kind: 'grantPoints', playerId: target.id, points: Number(grant), reason })}>Grant</Button></div>
            <div className="eyebrow">Reset a completed mission</div>
            <div className="scroll-y stack-6" style={{ maxHeight: 140 }}>
              {Object.entries(target.categoryCounts).length === 0 && <div className="tiny faint">No completed missions.</div>}
              {party.feed.filter((f) => f.kind === 'mission' && f.playerId === target.id).slice(-8).reverse().map((f) => { const title = f.text.match(/"([^"]+)"/)?.[1]; const m = title ? Object.values(MISSION_BY_ID).find((x) => x.title === title) : undefined; return m ? <div key={f.id} className="list-row"><span className="grow small">{m.title}</span><Button size="xs" variant="secondary" onClick={() => host({ kind: 'resetClaim', playerId: target.id, missionId: m.id })}>Reset</Button></div> : null; })}
            </div>
            {party.groomId !== target.id && <Button size="sm" variant="secondary" onClick={() => { host({ kind: 'setGroom', playerId: target.id }); setTarget(null); }}>🤵 This is Jezza (the groom)</Button>}
            <div className="btn-row">
              {!target.isHost && <Button size="sm" variant="secondary" onClick={() => { host({ kind: 'transferHost', playerId: target.id }); setTarget(null); }}>Make host</Button>}
              {!target.isHost && <Button size="sm" variant="danger" onClick={() => { host({ kind: 'removePlayer', playerId: target.id }); setTarget(null); }}>Remove</Button>}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
