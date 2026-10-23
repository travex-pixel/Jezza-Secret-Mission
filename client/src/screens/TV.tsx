// TV mode: mirror a phone onto the venue's telly. Full screen, no buttons: the lads' photos drift by with who took
// them and for what, the top five and the latest few things that happened sit alongside, with the join code.
// Works upright (a phone held in the hand) and sideways (mirrored to a TV). Tap anywhere to leave.
import { useEffect, useState } from 'react';
import { sortLeaderboard } from '@shared/progression';
import { useStore } from '../store';
import { Creature, LadPic } from '../components/Creature';
import { FeedItem, timeAgo } from '../components/ui';

const SLIDE_MS = 7000;

export default function TV({ code }: { code?: string }) {
  const party = useStore((s) => s.party);
  const setTab = useStore((s) => s.setTab);
  const [i, setI] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  // Standalone (…/?tv=CODE on a TV or laptop): no login, just read the party every few seconds
  useEffect(() => {
    if (!code) return;
    let stop = false;
    const pull = async () => {
      try { const r = await fetch(`/api/party/${encodeURIComponent(code)}/tv`); if (!r.ok) { setErr((await r.json().catch(() => ({})))?.error ?? 'Could not reach the party.'); return; } useStore.setState({ party: await r.json() }); setErr(null); }
      catch { setErr('Lost the connection. Retrying…'); }
    };
    void pull(); const t = setInterval(() => { if (!stop) void pull(); }, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [code]);
  useEffect(() => { const t = setInterval(() => setI((n) => n + 1), SLIDE_MS); return () => clearInterval(t); }, []);
  // keep the screen on while it's up on the TV
  useEffect(() => {
    let lock: { release?: () => Promise<void> } | undefined;
    (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release?: () => Promise<void> }> } }).wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    return () => { void lock?.release?.(); };
  }, []);
  if (!party) return <div className="tv" data-testid="tv"><div className="tv-empty"><div className="display title-lg gold-text">{err ?? 'Finding the party…'}</div>{code && <div className="small dim bold">Code {code.toUpperCase()}</div>}</div></div>;
  const photos = party.gallery ?? [];
  const photo = photos.length ? photos[photos.length - 1 - (i % photos.length)] : null; // newest first, round and round
  const who = photo ? party.players.find((p) => p.id === photo.playerId) : undefined;
  const board = sortLeaderboard(party.players.filter((p) => p.creature)).slice(0, 5);
  const latest = [...party.feed].reverse().filter((f) => f.kind !== 'join' && f.kind !== 'levelup').slice(0, 4);
  const parade = party.players.filter((p) => p.creature).slice(0, 8);
  return (
    <div className={`tv ${code ? 'standalone' : ''}`} onClick={() => { if (!code) setTab('party'); }} data-testid="tv">
      <div className="tv-photo">
        {photo ? (
          <>
            <img key={photo.id} src={photo.url} alt="" className="tv-img" />
            <div className="tv-cap">
              <span className="avatar">{who ? <LadPic p={who} /> : '📸'}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <div className="tv-cap-title ellipsis"><b>{who?.nickname ?? 'Someone'}</b> · {photo.caption}</div>
                <div className="tv-cap-sub ellipsis">{photo.note ? `“${photo.note}” · ` : ''}{timeAgo(photo.at)} · {photos.length} photo{photos.length === 1 ? '' : 's'} so far</div>
              </span>
            </div>
          </>
        ) : (
          <div className="tv-empty">
            <div className="tv-parade">{parade.map((p) => <Creature key={p.id} creature={p.creature!} level={p.level} colorway={p.equipped.colorway} equipped={p.equipped} state="idle" style={{ width: 'min(18vw, 140px)' }} />)}</div>
            <div className="display title-lg gold-text">No photos yet</div>
            <div className="small dim bold">First cooked photo goes up here.</div>
          </div>
        )}
      </div>
      <aside className="tv-side">
        <div className="tv-brand">PROJECT JEZZA <span className="live-dot" /><span className="tv-live">LIVE</span></div>
        <div className="tv-join">Join the game: code <b className="gold-text">{party.code}</b></div>
        <div className="eyebrow">Leaderboard</div>
        <div className="stack-6">
          {board.map((p, k) => (
            <div key={p.id} className="tv-row">
              <span className={`tv-rank ${k === 0 ? 'top' : ''}`}>{k === 0 ? '👑' : k + 1}</span>
              <span className="avatar sm"><LadPic p={p} /></span>
              <span className="grow ellipsis bold">{p.nickname}</span>
              <span className="bold gold-text">{p.points}</span>
            </div>
          ))}
        </div>
        <div className="eyebrow" style={{ marginTop: 10 }}>Just now</div>
        <div className="stack-6 tv-feed">{latest.map((f) => <FeedItem key={f.id} f={f} compact />)}</div>
        {code ? (err && <div className="tiny faint center">{err}</div>) : <div className="tiny faint center">Tap anywhere to leave TV mode</div>}
      </aside>
    </div>
  );
}
