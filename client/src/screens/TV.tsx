// TV mode: mirror a phone onto the venue's telly. Full screen, no buttons: the lads' photos drift by with who took
// them and for what, every fourth slide is a roast or toast off the Wall big enough to read from the couch, live
// fights show in the corner as they happen, and the top five and the latest few things sit alongside with the join
// code. Works upright (a phone held in the hand) and sideways (mirrored to a TV). Tap anywhere to leave.
import { useEffect, useState } from 'react';
import type { Battle, PartyPublic, WallPost } from '@shared/types';
import { CREATURES } from '@shared/creatures';
import { fmtClock, fmtTime, orderAwards, spotlightPhase } from '@shared/ceremony';
import { ROWDY_KINDS } from '@shared/rowdy';
import { OLY_UNITS, ordinal, placeAwards } from '@shared/olympics';
import { RUN_ACTIONS, nextItem } from '@shared/runsheet';
import { themeFor } from '../theme';
import { THEMES } from '@shared/themes';
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

function SpotlightView({ party, now }: { party: PartyPublic; now: number }) {
  const s = party.spotlight!; const state = spotlightPhase(s, now);
  const who = s.playerId ? party.players.find((p) => p.id === s.playerId) : undefined;
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 250); return () => clearInterval(t); }, []);
  const left = s.startedAt ? Math.max(0, Math.ceil((s.startedAt + s.seconds * 1000 - Date.now()) / 1000)) : s.seconds;
  const urgent = state === 'running' && left <= 10;
  if (state === 'upcoming') return (
    <div className="tv-spot-banner" data-testid="tv-spot-banner">
      <span style={{ fontSize: 'clamp(20px, 2.6vw, 30px)' }}>🎤</span>
      <span className="grow" style={{ minWidth: 0 }}><div className="tv-spot-banner-title ellipsis">{s.label}{who ? `: ${who.nickname}` : ''}</div><div className="tv-spot-banner-sub">{new Date(s.at).getHours() >= 17 ? 'Tonight' : 'Today'} at {fmtTime(s.at)}{s.at > now ? ` · ${fmtClock(Math.ceil((s.at - now) / 1000))} to go` : ' · any minute'}</div></span>
    </div>
  );
  return (
    <div className={`tv-spot ${state} ${urgent ? 'urgent' : ''}`} data-testid="tv-spot">
      <div className="tv-spot-label">🎤 {s.label.toUpperCase()}</div>
      {who && (
        <div className="tv-spot-who">
          {who.creature && <Creature creature={who.creature} level={who.level} colorway={who.equipped.colorway} equipped={who.equipped} state={state === 'done' ? 'victory' : 'idle'} style={{ width: 'min(22vw, 200px)' }} />}
          <div className="tv-spot-name">{who.nickname}</div>
        </div>
      )}
      <div className="tv-spot-clock" data-testid="tv-spot-clock">{state === 'done' ? 'TIME' : fmtClock(left)}</div>
      <div className="tv-spot-sub">{state === 'done' ? (s.playerId ? 'That\'s the speech. Shout him dinner.' : 'Done. Well played.') : urgent ? 'Wrap it up, legend.' : 'Eyes up. Phones down.'}</div>
    </div>
  );
}

function CeremonyView({ party, now }: { party: PartyPublic; now: number }) {
  void now;
  const ordered = orderAwards(party.awards);
  const shown = ordered.slice(0, party.ceremony);
  const latest = shown[shown.length - 1];
  const done = party.ceremony >= ordered.length && ordered.length > 0;
  const board = sortLeaderboard(party.players.filter((p) => p.creature));
  const legend = party.players.find((p) => p.id === ordered.find((a) => a.id === 'legend')?.playerId);
  const who = latest ? party.players.find((p) => p.id === latest.playerId) : undefined;
  if (party.ceremony === 0) return (
    <div className="tv-cer tv-cer-wait" data-testid="tv-ceremony">
      <div className="tv-cer-eyebrow">THE FINALE</div>
      <div className="tv-cer-title">THE CEREMONY</div>
      <div className="tv-cer-sub">{ordered.length} awards. The Weekend Menace first. The {party.honourName} Legend last.</div>
      <div className="tv-parade">{board.slice(0, 8).map((p) => <Creature key={p.id} creature={p.creature!} level={p.level} colorway={p.equipped.colorway} equipped={p.equipped} state="idle" style={{ width: 'min(10vw, 110px)' }} />)}</div>
      <div className="tv-cer-sub dim">Waiting on the host…</div>
    </div>
  );
  if (done && legend) return (
    <div className="tv-cer tv-cer-legend" data-testid="tv-ceremony">
      <div className="tv-cer-eyebrow">THE {party.honourName.toUpperCase()} LEGEND</div>
      <div className="tv-podium">
        {[board[1], board[0], board[2]].map((p, i) => p?.creature ? (
          <div key={p.id} className={`tv-podium-step step-${i === 1 ? 1 : i === 0 ? 2 : 3}`}>
            {i === 1 && <div className="tv-crown">👑</div>}
            {p.avatarUrl && <span className="tv-podium-face"><LadPic p={p} /></span>}
            <Creature creature={p.creature} level={p.level} colorway={p.equipped.colorway} equipped={p.equipped} state={i === 1 ? 'victory' : 'happy'} />
            <div className="tv-podium-block"><b>{i === 1 ? 1 : i === 0 ? 2 : 3}</b><span className="ellipsis">{p.nickname}</span><small>{p.points} pts</small></div>
          </div>) : <div key={i} />)}
      </div>
      <div className="row" style={{ gap: 14, alignItems: 'center', justifyContent: 'center' }}>{legend.avatarUrl && <span className="tv-cer-face big"><LadPic p={legend} /></span>}<div className="tv-cer-title gold">{legend.nickname.toUpperCase()}</div></div>
      <div className="tv-cer-sub">{themeFor(party.theme, party.honourName).t(ordered.find((a) => a.id === 'legend')?.reason ?? '')}</div>
      <div className="tv-confetti" aria-hidden>{Array.from({ length: 36 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, background: ['#E5AD48', '#F6EBDD', '#76243A', '#a8e58f', '#f07842'][i % 5], animationDelay: `${(i % 7) * 0.18}s`, animationDuration: `${2.4 + (i % 5) * 0.3}s` }} />)}</div>
    </div>
  );
  return (
    <div className="tv-cer" data-testid="tv-ceremony">
      <div className="tv-cer-eyebrow">AWARD {shown.length} OF {ordered.length}</div>
      <div className="tv-cer-award" key={latest?.id}>
        <div className="tv-cer-award-name">{themeFor(party.theme, party.honourName).t(latest?.name ?? '')}</div>
        <div className="tv-cer-who">
          {who?.avatarUrl && <span className="tv-cer-face"><LadPic p={who} /></span>}
          {who?.creature && <Creature creature={who.creature} level={who.level} colorway={who.equipped.colorway} equipped={who.equipped} state={latest?.id === 'menace' ? 'defeat' : 'victory'} style={{ width: who?.avatarUrl ? 'min(16vw, 150px)' : 'min(24vw, 220px)' }} />}
          <div>
            <div className="tv-cer-title">{(who?.nickname ?? 'Nobody').toUpperCase()}</div>
            <div className="tv-cer-sub">{themeFor(party.theme, party.honourName).t(latest?.reason ?? '')}</div>
          </div>
        </div>
      </div>
      <div className="tv-cer-prev">{shown.slice(0, -1).reverse().slice(0, 6).map((a) => <span key={a.id} className="tv-cer-chip"><b>{themeFor(party.theme, party.honourName).t(a.name)}</b> {party.players.find((p) => p.id === a.playerId)?.nickname ?? 'Nobody'}</span>)}</div>
    </div>
  );
}

function RowdyView({ party }: { party: PartyPublic }) {
  const r = party.rowdy!; const def = ROWDY_KINDS[r.kind];
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 250); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.ceil((r.endsAt - Date.now()) / 1000));
  const line = r.kind === 'mostLikely' ? `Most likely to ${r.prompt}` : r.kind === 'neverHaveIEver' ? `Never have I ever ${r.prompt}` : r.kind === 'categories' ? r.prompt : r.prompt;
  const who = (id: string) => party.players.find((p) => p.id === id);
  const max = r.tally?.[0]?.n ?? 1;
  return (
    <div className={`tv-rowdy ${r.revealed ? 'revealed' : ''}`} data-testid="tv-rowdy">
      <div className="tv-cer-eyebrow">🍻 ROWDY ROUND · {def.label.toUpperCase()}</div>
      <div className="tv-rowdy-prompt">{r.kind === 'categories' ? 'Categories: ' : r.kind === 'newRule' ? 'New rule: ' : ''}{line}</div>
      {!r.revealed && <div className="tv-rowdy-clock">{fmtClock(left)}</div>}
      {!r.revealed && <div className="tv-cer-sub">{def.vote ? `${r.votes} vote${r.votes === 1 ? '' : 's'} in · name a lad on your phone` : def.blurb}</div>}
      {r.revealed && def.vote && (
        <div className="tv-rowdy-tally">
          {(r.tally ?? []).slice(0, 6).map((t, i) => { const p = who(t.playerId); return (
            <div key={t.playerId} className={`tv-rowdy-row ${i === 0 ? 'top' : ''}`}>
              <span className="avatar">{p ? <LadPic p={p} /> : '?'}</span>
              <span className="tv-rowdy-name ellipsis">{p?.nickname ?? '?'}</span>
              <span className="tv-rowdy-bar"><i style={{ width: `${(t.n / max) * 100}%` }} /></span>
              <span className="tv-rowdy-n">{t.n}</span>
            </div>); })}
          {!(r.tally ?? []).length && <div className="tv-cer-sub">Nobody voted. Soft.</div>}
          {(r.tally ?? []).length > 0 && <div className="tv-cer-sub">{who(r.tally![0].playerId)?.nickname ?? '?'}: you know what to do.</div>}
        </div>
      )}
      {r.revealed && !def.vote && <div className="tv-cer-title gold">TIME</div>}
    </div>
  );
}

function OlyEventView({ party }: { party: PartyPublic }) {
  const ev = party.olympics.current!; const u = OLY_UNITS[ev.unit];
  const [, tick] = useState(0);
  useEffect(() => { if (!ev.timer) return; const t = setInterval(() => tick((n) => n + 1), 100); return () => clearInterval(t); }, [ev.timer?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const who = (id: string) => party.players.find((p) => p.id === id);
  const lads = party.players.filter((p) => p.creature).length;
  if (ev.status === 'locked') {
    const awards = [...(ev.awards ?? [])].sort((a, b) => a.place - b.place || b.points - a.points);
    const podium = [awards[1], awards[0], awards[2]]; // the first three lads in finishing order, ties included (centre step is the best)
    return (
      <div className="tv-cer tv-cer-legend" data-testid="tv-oly-event">
        <div className="tv-cer-eyebrow">🏅 {(THEMES[party.theme] ?? THEMES.bucks).copy.olympics.toUpperCase()} · {ev.name.toUpperCase()} · RESULT</div>
        {ev.unit !== 'points' ? (
          <div className="tv-podium">
            {podium.map((a, i) => { const p = a ? who(a.playerId) : undefined; return p?.creature ? (
              <div key={a!.playerId} className={`tv-podium-step step-${i === 1 ? 1 : i === 0 ? 2 : 3}`}>
                {a!.place === 1 && <div className="tv-crown">🥇</div>}
                {p.avatarUrl && <span className="tv-podium-face"><LadPic p={p} /></span>}
                <Creature creature={p.creature} level={p.level} colorway={p.equipped.colorway} equipped={p.equipped} state={i === 1 ? 'victory' : 'happy'} />
                <div className="tv-podium-block"><b>{a!.place}</b><span className="ellipsis">{p.nickname}</span><small>{u.fmt(a!.value)} · +{a!.points}</small></div>
              </div>) : <div key={i} />; })}
          </div>
        ) : null}
        <div className="tv-oly-table">{awards.slice(ev.unit === 'points' ? 0 : 3, 11).map((a) => { const p = who(a.playerId); return <div key={a.playerId} className="tv-oly-row"><span className="tv-oly-medal">{a.place ? ordinal(a.place) : '•'}</span><span className="avatar sm">{p ? <LadPic p={p} /> : '?'}</span><span className="ellipsis bold">{p?.nickname ?? '?'} <span className="tv-oly-val">{u.fmt(a.value)}</span></span><span className="gold-text bold">+{a.points}</span></div>; })}</div>
        <div className="tv-confetti" aria-hidden>{Array.from({ length: 30 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, background: ['#E5AD48', '#F6EBDD', '#76243A', '#a8e58f', '#f07842'][i % 5], animationDelay: `${(i % 7) * 0.18}s`, animationDuration: `${2.4 + (i % 5) * 0.3}s` }} />)}</div>
      </div>
    );
  }
  const live = placeAwards(ev.unit, ev.results);
  const timerWho = ev.timer ? who(ev.timer.playerId) : undefined;
  const ms = ev.timer ? Math.max(0, Date.now() - ev.timer.startedAt) : 0;
  const best = ev.results.length && ev.unit === 'seconds' ? Math.max(...ev.results.map((r) => r.value)) : null;
  return (
    <div className="tv-oly" data-testid="tv-oly-event">
      <div className="tv-cer-eyebrow">🏅 {(THEMES[party.theme] ?? THEMES.bucks).copy.olympics.toUpperCase()} · EVENT {party.olympics.done.length + 1}</div>
      <div className="tv-rowdy-prompt">{ev.name}</div>
      {timerWho ? (
        <div className="tv-oly-sw" data-testid="tv-oly-stopwatch">
          {timerWho.avatarUrl ? <span className="tv-cer-face"><LadPic p={timerWho} /></span> : timerWho.creature ? <Creature creature={timerWho.creature} level={timerWho.level} colorway={timerWho.equipped.colorway} equipped={timerWho.equipped} state="idle" style={{ width: 'min(14vw, 130px)' }} /> : null}
          <div><div className="tv-cer-sub">{timerWho.nickname}</div><div className="tv-spot-clock" style={{ fontSize: 'clamp(56px, 12vw, 150px)' }}>{`${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}.${Math.floor((ms % 1000) / 100)}`}</div>{best !== null && <div className="tv-cer-sub dim">to beat: {u.fmt(best)}</div>}</div>
        </div>
      ) : <div className="tv-cer-sub">{u.emoji} {u.label} · {ev.results.length} of {lads} in{ev.results.length ? '' : ' · results land here as the scorer types them'}</div>}
      <div className="tv-oly-table">
        {live.slice(0, 8).map((a) => { const p = who(a.playerId); return <div key={a.playerId} className={`tv-oly-row ${a.place === 1 ? 'hot' : ''}`}><span className="tv-oly-medal">{a.place ? ordinal(a.place) : '•'}</span><span className="avatar sm">{p ? <LadPic p={p} /> : '?'}</span><span className="ellipsis bold">{p?.nickname ?? '?'}</span><span className="gold-text bold">{u.fmt(a.value)}</span></div>; })}
      </div>
    </div>
  );
}

const SCORE_SHOW_MS = 12_000;
function OlympicsView({ party }: { party: PartyPublic }) {
  const ls = party.lastScore!; const who = party.players.find((p) => p.id === ls.playerId);
  const table = [...party.players].filter((p) => p.creature && p.olympics !== 0).sort((a, b) => b.olympics - a.olympics).slice(0, 6);
  return (
    <div className="tv-oly" data-testid="tv-olympics">
      <div className="tv-cer-eyebrow">🏅 {(THEMES[party.theme] ?? THEMES.bucks).copy.olympics.toUpperCase()} · {ls.reason.toUpperCase()}</div>
      <div className="tv-oly-main" key={ls.at}>
        {who?.avatarUrl ? <span className="tv-cer-face"><LadPic p={who} /></span> : who?.creature ? <Creature creature={who.creature} level={who.level} colorway={who.equipped.colorway} equipped={who.equipped} state="victory" style={{ width: 'min(16vw, 150px)' }} /> : null}
        <div>
          <div className="tv-cer-title">{(who?.nickname ?? '?').toUpperCase()}</div>
          <div className={`tv-oly-pts ${ls.points < 0 ? 'neg' : ''}`}>{ls.points > 0 ? '+' : ''}{ls.points}</div>
          <div className="tv-cer-sub dim">scored by {ls.by}</div>
        </div>
      </div>
      <div className="tv-oly-table">
        {table.map((p, i) => <div key={p.id} className={`tv-oly-row ${p.id === ls.playerId ? 'hot' : ''}`}><span className="tv-oly-medal">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span><span className="avatar sm"><LadPic p={p} /></span><span className="ellipsis bold">{p.nickname}</span><span className="gold-text bold">{p.olympics}</span></div>)}
      </div>
    </div>
  );
}

function BookView({ party }: { party: PartyPublic }) {
  const th = themeFor(party.theme, party.honourName);
  const entries = [...party.wall].filter((w) => w.kind === 'toast').sort((a, b) => a.at - b.at);
  const [i, setI] = useState(-1);
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1 > entries.length ? -1 : n + 1)), 9000); return () => clearInterval(t); }, [entries.length]);
  const e = i >= 0 && i < entries.length ? entries[i] : null;
  const who = e ? party.players.find((p) => p.id === e.playerId) : undefined;
  if (i === -1 || !entries.length) return (
    <div className="tv-wall toast" data-testid="tv-book">
      <div className="tv-cer-eyebrow">📖 THE BIRTHDAY BOOK</div>
      <div className="tv-cer-title gold">FOR {th.name.toUpperCase()}</div>
      <div className="tv-cer-sub">{entries.length ? `${entries.length} ${entries.length === 1 ? 'page' : 'pages'}, written quietly through the afternoon by the people who love you.` : 'Nothing written yet.'}</div>
    </div>
  );
  if (!e) return (
    <div className="tv-wall toast" data-testid="tv-book">
      <div className="tv-cer-eyebrow">📖 THE BIRTHDAY BOOK</div>
      <div className="tv-cer-title gold">HAPPY BIRTHDAY, {th.name.toUpperCase()}</div>
      <div className="tv-cer-sub">From everyone here. It's all yours to keep.</div>
    </div>
  );
  return (
    <div className="tv-wall toast" key={e.id} data-testid="tv-book">
      <div className="tv-wall-kind">📖 PAGE {i + 1} OF {entries.length} <span>· the Birthday Book</span></div>
      <div className="tv-wall-text" style={{ fontSize: e.text.length > 160 ? 'clamp(18px, 2.6vw, 34px)' : e.text.length > 90 ? 'clamp(22px, 3.2vw, 42px)' : 'clamp(26px, 4vw, 54px)' }}>“{e.text}”</div>
      <div className="tv-wall-by"><span className="avatar">{who ? <LadPic p={who} /> : '💌'}</span><span className="grow" style={{ minWidth: 0 }}><div className="tv-wall-name ellipsis">{who?.nickname ?? 'Someone'}</div><div className="tv-wall-sub">for {th.name}</div></span>{e.groomLove && <span className="tv-wall-votes"><span className="tv-wall-love">❤️ {th.name} loved it</span></span>}</div>
    </div>
  );
}

const REEL_MS = 2600;
function ReelView({ party }: { party: PartyPublic }) {
  const photos = [...(party.gallery ?? [])].sort((a, b) => a.at - b.at); // the weekend in order
  const [i, setI] = useState(-1); // -1 is the title card
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1 >= photos.length ? -1 : n + 1)), REEL_MS); return () => clearInterval(t); }, [photos.length]);
  const photo = i >= 0 ? photos[i] : null;
  const who = photo ? party.players.find((p) => p.id === photo.playerId) : undefined;
  if (!photo) return (
    <div className="tv-reel-title" data-testid="tv-reel">
      <div className="tv-cer-eyebrow">THE PHOTO REEL</div>
      <div className="tv-cer-title gold">{photos.length} PHOTOS</div>
      <div className="tv-cer-sub">The whole {themeFor(party.theme, party.honourName).theme.copy.partyWord}, from the top. To {party.honourName}.</div>
    </div>
  );
  return (
    <div className="tv-reel" data-testid="tv-reel">
      <img key={photo.id} src={photo.url} alt="" className="tv-reel-img" />
      <div className="tv-cap">
        <span className="avatar">{who ? <LadPic p={who} /> : '📸'}</span>
        <span className="grow" style={{ minWidth: 0 }}>
          <div className="tv-cap-title ellipsis"><b>{who?.nickname ?? 'Someone'}</b> · {photo.caption}</div>
          <div className="tv-cap-sub ellipsis">{photo.note ? `“${photo.note}” · ` : ''}{new Date(photo.at).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} · {i + 1} of {photos.length}</div>
        </span>
      </div>
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
      <div className="tv-wall-kind">{roast ? '🔥 ROAST' : '🥂 TOAST'} <span>· off the {themeFor(party.theme, party.honourName).t(themeFor(party.theme, party.honourName).theme.copy.wallTitle)}</span></div>
      <div className="tv-wall-text" style={{ fontSize: size }}>“{post.text}”</div>
      <div className="tv-wall-by">
        <span className="avatar">{who ? <LadPic p={who} /> : '🎤'}</span>
        <span className="grow" style={{ minWidth: 0 }}><div className="tv-wall-name ellipsis">{who?.nickname ?? 'Someone'}</div><div className="tv-wall-sub">{timeAgo(post.at)}</div></span>
        <span className="tv-wall-votes">😂 {post.votes.length}{post.groomLove ? <span className="tv-wall-love"> · ❤️ {party.honourName} approved</span> : null}</span>
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
  const spotState = spotlightPhase(party.spotlight, now);
  const ceremonyOn = party.phase === 'finale' || party.phase === 'ended';
  const reelOn = (party.tvMode === 'reel' || party.tvMode === 'book') && spotState !== 'running' && spotState !== 'done';
  const rowdyOn = !!party.rowdy && spotState !== 'running' && spotState !== 'done';
  const scoreOn = !!party.lastScore && now - party.lastScore.at < SCORE_SHOW_MS && spotState !== 'running' && spotState !== 'done';
  const olyOn = !!party.olympics?.current && spotState !== 'running' && spotState !== 'done';
  const board = sortLeaderboard(party.players.filter((p) => p.creature)).slice(0, 5);
  const latest = [...party.feed].reverse().filter((f) => f.kind !== 'join' && f.kind !== 'levelup').slice(0, 4);
  const parade = party.players.filter((p) => p.creature).slice(0, 8);
  return (
    <div className={`tv ${code ? 'standalone' : ''} ${reelOn ? 'reel-mode' : ''}`} onClick={() => { if (!code) setTab('party'); }} data-testid="tv">
      <div className="tv-photo">
        {olyOn ? <OlyEventView party={party} /> : scoreOn ? <OlympicsView party={party} /> : rowdyOn ? <RowdyView party={party} /> : reelOn && (party.tvMode === 'book' ? <BookView party={party} /> : <ReelView party={party} />)}
        {!reelOn && !rowdyOn && !scoreOn && !olyOn && spotState !== 'running' && spotState !== 'done' && fights.length > 0 && <div className="tv-fights">{fights.map((b) => <FightCard key={b.id} b={b} party={party} now={now} />)}</div>}
        {spotState === 'upcoming' && !ceremonyOn && !reelOn && !rowdyOn && !scoreOn && !olyOn && <SpotlightView party={party} now={now} />}
        {spotState === 'running' || spotState === 'done' ? <SpotlightView party={party} now={now} /> : olyOn || scoreOn || rowdyOn || reelOn ? null : ceremonyOn ? <CeremonyView party={party} now={now} /> : wallPost ? <WallCard post={wallPost} party={party} withFights={fights.length > 0} /> : photo ? (
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
        <div className="tv-brand">{party.theme === 'bucks' && party.honourName === 'Jezza' ? 'PROJECT JEZZA' : party.name.toUpperCase()} <span className="live-dot" /><span className="tv-live">LIVE</span></div>
        <div className="tv-join">Join the game: code <b className="gold-text">{party.code}</b></div>
        {(() => { const n = nextItem(party.runSheet ?? [], now); return n ? <div className="tv-nextup" data-testid="tv-nextup">{RUN_ACTIONS[n.action].emoji} <b>{n.at <= now ? 'Now' : 'Next'}:</b> {n.label} · {fmtTime(n.at)}</div> : null; })()}
        {party.teams && (
          <>
            <div className="eyebrow">Teams</div>
            <div className="tv-teams" data-testid="tv-teams">{[...party.teams.teams].sort((a, b) => b.score - a.score).map((t, i) => <div key={t.id} className="tv-team" style={{ borderColor: t.color }}><span>{i === 0 ? '👑' : t.emoji}</span><span className="grow ellipsis bold">{t.name}</span><span className="bold" style={{ color: t.color }}>{t.score}</span></div>)}</div>
          </>
        )}
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
