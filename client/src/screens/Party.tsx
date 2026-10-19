import { useState } from 'react';
import { Creature } from '../components/Creature';
import { Button, FeedItem, Sheet, timeAgo } from '../components/ui';
import { useStore, useMe } from '../store';
import { isDemo, leaveParty, request } from '../net';
import { sfx } from '../audio';

export default function Party() {
  const party = useStore((s) => s.party);
  const me = useMe();
  const setTab = useStore((s) => s.setTab);
  const toast = useStore((s) => s.toast);
  const [view, setView] = useState<'roster' | 'feed'>('roster');
  const [sheet, setSheet] = useState<'leave' | 'claim' | null>(null);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!party) return null;
  const link = `${location.origin}${location.pathname}?p=${party.code}${isDemo() ? '&demo=1' : ''}`;
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Project Jezza', text: `Join the vineyard. Party code ${party.code}`, url: link });
      else { await navigator.clipboard.writeText(link); toast('Join link copied', '📋', 'success'); }
    } catch { try { await navigator.clipboard.writeText(link); toast('Join link copied', '📋', 'success'); } catch { toast(`Code: ${party.code}`, '🔑'); } }
  };
  const amHost = party.hostId === me?.id;
  const doLeave = async () => { setBusy(true); try { await leaveParty(); sfx.select(); } catch (e) { toast((e as Error).message, '⚠️', 'warn'); setBusy(false); } };
  const doClaim = async () => {
    setBusy(true); setErr(null);
    try { await request({ type: 'claimHost', pin }); sfx.reward(); setSheet(null); setPin(''); setTab('host'); }
    catch (e) { setErr((e as Error).message); sfx.error(); }
    finally { setBusy(false); }
  };
  const players = [...party.players].sort((a, b) => Number(b.isHost) - Number(a.isHost) || Number(b.online) - Number(a.online) || a.joinedAt - b.joinedAt);
  return (
    <div className="screen with-nav">
      <div className="topbar"><button className="display title-md" onClick={() => setTab('home')}>‹ {party.name}</button><span className="pill">{party.players.length} legends</span></div>
      <div className="panel pad row" style={{ gap: 12, marginBottom: 10 }}>
        <div><div className="eyebrow">Party code</div><div className="code-display gold-text">{party.code}</div></div>
        <div className="grow"><Button size="sm" onClick={share} style={{ width: '100%' }}>Share join link</Button><div className="tiny faint center" style={{ marginTop: 4 }}>Mates open the link, pick a name, done.</div></div>
      </div>
      <div className="tabs" style={{ marginBottom: 10 }}><button className={`tab ${view === 'roster' ? 'on' : ''}`} onClick={() => setView('roster')}>Who's here</button><button className={`tab ${view === 'feed' ? 'on' : ''}`} onClick={() => setView('feed')}>Live feed</button></div>
      <div className="screen-body scroll-y stack-6">
        {view === 'roster' && players.map((p) => (
          <div key={p.id} className={`list-row ${p.id === me?.id ? 'me' : ''}`}>
            <span className="avatar">{p.creature ? <Creature creature={p.creature} level={p.level} colorway={p.equipped.colorway} equipped={p.equipped} bare /> : <span style={{ fontSize: 20 }}>🥚</span>}</span>
            <span className="grow" style={{ minWidth: 0 }}><div className="bold ellipsis">{p.isHost ? '👑 ' : ''}{p.nickname}{p.id === me?.id ? ' (you)' : ''}</div><div className="tiny faint ellipsis">{p.creature ? `${p.creatureName} · Lv ${p.level} · ${p.title}` : 'Still choosing a creature…'}</div></span>
            <span className="col" style={{ alignItems: 'flex-end', gap: 4 }}><span className="bold gold-text">{p.points}</span><span className={`pill pill-xs ${p.online ? 'pill-ok' : ''}`}>{p.online ? 'online' : timeAgo(p.lastSeen)}</span></span>
          </div>
        ))}
        {view === 'feed' && <div className="tiny faint" style={{ padding: '0 4px' }}>Reckon someone's lying? 🚩 Call BS. Two calls freeze the points until the host rules.</div>}
        {view === 'feed' && [...party.feed].reverse().map((f) => <FeedItem key={f.id} f={f} />)}
        {view === 'feed' && party.feed.length === 0 && <div className="center dim pad">Nothing has happened. Yet.</div>}
        {view === 'roster' && (
          <div className="col" style={{ gap: 0, paddingTop: 6 }}>
            {!amHost && party.hasHostPin && <Button variant="ghost" onClick={() => { setErr(null); setSheet('claim'); }}>🔑 Host lost their phone? Claim host</Button>}
            <Button variant="ghost" onClick={() => setSheet('leave')}>🚪 Leave this party</Button>
          </div>
        )}
      </div>
      {sheet === 'leave' && (
        <Sheet center onClose={() => setSheet(null)}>
          <div className="center stack-10">
            <div className="eyebrow">Leave party {party.code}</div>
            <div className="display title-md">Head home early?</div>
            <div className="small dim">{amHost
              ? `You're the host. The party stays as it is, but nobody can run it unless someone uses your host PIN${party.hasHostPin ? '' : ' (you haven\'t set one)'}. Perfect for ditching a test room.`
              : 'Your creature and points stay in this party. Come back any time with the same code and nickname.'}</div>
            <div className="btn-row"><Button variant="secondary" size="sm" onClick={() => setSheet(null)}>Stay</Button><Button variant="danger" size="sm" disabled={busy} onClick={doLeave}>Leave</Button></div>
          </div>
        </Sheet>
      )}
      {sheet === 'claim' && (
        <Sheet center onClose={() => setSheet(null)}>
          <div className="center stack-10">
            <div className="eyebrow">Claim host</div>
            <div className="display title-md">Enter the host PIN</div>
            <div className="small dim">Wrong guesses are reported to the current host. Five strikes and you're locked out for 10 minutes.</div>
            <input className="input input-code" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••" inputMode="numeric" type="password" autoFocus onKeyDown={(e) => e.key === 'Enter' && doClaim()} />
            {err && <div className="field-error">{err}</div>}
            <div className="btn-row"><Button variant="secondary" size="sm" onClick={() => setSheet(null)}>Cancel</Button><Button size="sm" disabled={busy || pin.length < 4} onClick={doClaim}>Claim</Button></div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
