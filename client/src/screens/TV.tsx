// TV mode: mirror a phone onto the venue's telly. Full screen, no buttons: the lads' photos drift by with who took
// them and for what, every fourth slide is a roast or toast off the Wall big enough to read from the couch, live
// fights show in the corner as they happen, and the top five and the latest few things sit alongside with the join
// code. Works upright (a phone held in the hand) and sideways (mirrored to a TV). Tap anywhere to leave.
import { useEffect, useState } from 'react';
import type { Battle, PartyPublic, WallPost } from '@shared/types';
import { CREATURES } from '@shared/creatures';
import { sortLeaderboard } from '@shared/progression';
import { useStore } from '../store';
import { Creature, LadPic } from '../components/Creature';
import { FeedItem, timeAgo } from '../components/ui';

const SLIDE_MS = (() => { const v = Number(new URLSearchParams(location.search).get('slide')); return v >= 1000 ? v : 7000; })();
const WALL_EVERY = 4;        // every fourth slide is a Wall card
const RESULT_SHOW_MS = 25_000; // a finished fight stays in the corner this long

/** Best first: votes, with Jezza's ❤️ worth three, then newest. */
function rankWall(posts: WallPost[]) {
  return [...posts].sort((a, b) => (b.votes.length + (b.groomLove ? 3 : 0)) - (a.votes.length + (a.groomLove ? 3 : 0)) || b.at - a.at);
}

function FightCard({ b, party, now }: { b: Battle; party: PartyPublic; now: number }) {
  const who = (id: string) => party.players.find((p) => p.id === id);
  const pa = who(b.a.playerId), pb = who(b.b.playerId);
  const live = b.status === 'active';
  const win = b.winnerId ? who(b.winnerId) : undefined; const lose = b.loserId ? who(b.loserId) : undefined;
  const side = (s: Battle['a'], p: ReturnType<typeof who>, flip: boolean) => {
    const pct = Math.max(0, Math.min(1, s.hp / s.maxHp)); const out = !live && b.loserId === s.playerId;
    return (
      <div className={`tv-fighter ${out ? 'out' : ''}`}>
        <Creature creature={s.creature} level={p?.level ?? 1} colorway={p?.equipped.colorway ?? 0} equipped={p?.equipped} state={out ? 'defeat' : !live && b.winnerId === s.playerId ? 'victory' : 'idle'} flip={flip} style={{ width: 'min(13vw, 110px)' }} />
        <div className="tv-fighter-name ellipsis">{p?.nickname ?? '?'}</div>
        <div className="tv-hp"><i style={{ width: `${pct * 100}%`, background: pct > 0.5 ? '#6fd36f' : pct > 0.25 ? '#ffb347' : '#ff5a5a' }} /></div>
        <div className="tv-fighter-sub">{CREATURES[s.creature].name} · {Math.max(0, s.hp)}/{s.maxHp}</div>
      </div>
    );
  };
  const reason = b.reason === 'ko' ? 'knocked out' : b.reason === 'surrender' ? 'threw in the towel' : b.reason === 'timeout' ? 'phone face down' : b.reason === 'disconnect' ? 'lost connection' : 'on points';
  const headline = live
    ? (b.quick && !b.a.locked && !b.b.locked && b.round <= 1 ? 'Picking game plans…' : `Round ${Math.max(1, b.round)}`)
    : win && lose ? `${win.nickname} beat ${lose.nickname}` : 'Over';
  return (
    <div className={`tv-fight ${live ? 'live' : 'done'}`} data-testid="tv-fight">
      <div className="tv-fight-top"><span className="tv-fight-tag">{live ? '⚔️ LIVE FIGHT' : '🏁 RESULT'}</span><span className="tv-fight-head ellipsis">{headline}</span>{!live && <span className="tv-fight-reason">{reason}{b.finishedAt ? ` · ${timeAgo(b.finishedAt)}` : ''}</span>}</div>
      <div className="tv-fight-body">{side(b.a, pa, false)}<div className="tv-vs">VS</div>{side(b.b, pb, true)}</div>
    </div>
  );
}

function WallCard({ post, party, withFights }: { post: WallPost; party: PartyPublic; withFights: boolean }) {
  const who = party.players.find((p) => p.id === post.playerId);
  const roast = post.kind === 'roast';
  const len = post.text.length;
  const size = len > 160 ? 'clamp(18px, 2.6vw, 34px)' : len > 90 ? 'clamp(22px, 3.4vw, 44px)' : 'clamp(26px, 4.4vw, 58px)';
  return (
    <div className={`tv-wall ${roast ? 'roast' : 'toast'} ${withFights ? 'with-fights' : ''}`} key={post.id} data-testid="tv-wall">
      <div className="tv-wall-kind">{roast ? '🔥 ROAST' : '🥂 TOAST'} <span>· off the Jezza Wall</span></div>
      <div className="tv-wall-text" style={{ fontSize: size }}>“{post.text}”</div>
      <div className="tv-wall-by">
        <span className="avatar">{who ? <LadPic p={who} /> : '🎤'}</span>
        <span className="grow" style={{ minWidth: 0 }}><div className="tv-wall-name ellipsis">{who?.nickname ?? 'Someone'}</div><div className="tv-wall-sub">{timeAgo(post.at)}</div></span>
        <span className="tv-wall-votes">😂 {post.votes.length}{post.groomLove ? <span className="tv-wall-love"> · ❤️ Jezza approved</span> : null}</span>
      </div>
    </div>
  );
}

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
  const wallPosts = rankWall(party.wall ?? []);
  // every fourth slide is a Wall card (when there is one); photos keep their own count so none are skipped
  const wallSlide = wallPosts.length > 0 && i % WALL_EVERY === WALL_EVERY - 1;
  const wallPost = wallSlide ? wallPosts[Math.floor(i / WALL_EVERY) % wallPosts.length] : null;
  const photoIdx = i - (wallPosts.length > 0 ? Math.floor((i + 1) / WALL_EVERY) : 0);
  const photo = !wallSlide && photos.length ? photos[photos.length - 1 - (photoIdx % photos.length)] : null; // newest first, round and round
  const who = photo ? party.players.find((p) => p.id === photo.playerId) : undefined;
  const now = party.serverTime || Date.now();
  // fights: anything live, then the freshest result for a little while; two at most so the photo still shows
  const fights = [...party.battles].filter((b) => !b.auto && (b.status === 'active' || (b.status === 'finished' && b.finishedAt && now - b.finishedAt < RESULT_SHOW_MS)))
    .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt)).slice(0, 2);
  const board = sortLeaderboard(party.players.filter((p) => p.creature)).slice(0, 5);
  const latest = [...party.feed].reverse().filter((f) => f.kind !== 'join' && f.kind !== 'levelup').slice(0, 4);
  const parade = party.players.filter((p) => p.creature).slice(0, 8);
  return (
    <div className={`tv ${code ? 'standalone' : ''}`} onClick={() => { if (!code) setTab('party'); }} data-testid="tv">
      <div className="tv-photo">
        {fights.length > 0 && <div className="tv-fights">{fights.map((b) => <FightCard key={b.id} b={b} party={party} now={now} />)}</div>}
        {wallPost ? <WallCard post={wallPost} party={party} withFights={fights.length > 0} /> : photo ? (
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
