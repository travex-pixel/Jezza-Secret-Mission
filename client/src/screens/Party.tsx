import { useState } from 'react';
import { Creature } from '../components/Creature';
import { Button, timeAgo } from '../components/ui';
import { useStore, useMe } from '../store';
import { isDemo } from '../net';

export default function Party() {
  const party = useStore((s) => s.party);
  const me = useMe();
  const setTab = useStore((s) => s.setTab);
  const toast = useStore((s) => s.toast);
  const [view, setView] = useState<'roster' | 'feed'>('roster');
  if (!party) return null;
  const link = `${location.origin}${location.pathname}?p=${party.code}${isDemo() ? '&demo=1' : ''}`;
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Project Jezza', text: `Join the vineyard. Party code ${party.code}`, url: link });
      else { await navigator.clipboard.writeText(link); toast('Join link copied', '📋', 'success'); }
    } catch { try { await navigator.clipboard.writeText(link); toast('Join link copied', '📋', 'success'); } catch { toast(`Code: ${party.code}`, '🔑'); } }
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
            <span className="avatar">{p.creature ? <Creature creature={p.creature} colorway={p.equipped.colorway} equipped={p.equipped} bare /> : <span style={{ fontSize: 20 }}>🥚</span>}</span>
            <span className="grow" style={{ minWidth: 0 }}><div className="bold ellipsis">{p.isHost ? '👑 ' : ''}{p.nickname}{p.id === me?.id ? ' (you)' : ''}</div><div className="tiny faint ellipsis">{p.creature ? `${p.creatureName} · Lv ${p.level} · ${p.title}` : 'Still choosing a creature…'}</div></span>
            <span className="col" style={{ alignItems: 'flex-end', gap: 4 }}><span className="bold gold-text">{p.points}</span><span className={`pill pill-xs ${p.online ? 'pill-ok' : ''}`}>{p.online ? 'online' : timeAgo(p.lastSeen)}</span></span>
          </div>
        ))}
        {view === 'feed' && [...party.feed].reverse().map((f) => (
          <div key={f.id} className="feed-item"><span className="emoji">{f.emoji ?? '•'}</span><span className="grow"><span>{f.text}</span>{f.photoUrl && <img src={f.photoUrl} alt="Mission proof" loading="lazy" />}<time>{timeAgo(f.at)}</time></span></div>
        ))}
        {view === 'feed' && party.feed.length === 0 && <div className="center dim pad">Nothing has happened. Yet.</div>}
      </div>
    </div>
  );
}
