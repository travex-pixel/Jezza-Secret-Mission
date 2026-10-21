import type { Battle, PartyPublic, PlayerPublic } from '@shared/types';
import { rankFor } from '@shared/progression';
import { Creature, LadPic } from '../components/Creature';
import { useStore } from '../store';

interface Highlight { emoji: string; title: string; text: string; battle: Battle }

/** Interesting bouts from the recent battle log: closest finish, fastest KO, biggest comeback. */
function highlights(party: PartyPublic): Highlight[] {
  const nick = (id?: string) => party.players.find((p) => p.id === id)?.nickname ?? '?';
  const done = party.battles.filter((b) => b.status === 'finished' && b.winnerId && b.log.length);
  const side = (b: Battle, id?: string) => (b.a.playerId === id ? b.a : b.b);
  const out: Highlight[] = [];
  const closest = [...done].sort((x, y) => side(x, x.winnerId).hp / side(x, x.winnerId).maxHp - side(y, y.winnerId).hp / side(y, y.winnerId).maxHp)[0];
  if (closest) out.push({ emoji: '😬', title: 'Closest shave', text: `${nick(closest.winnerId)} beat ${nick(closest.loserId)} with ${side(closest, closest.winnerId).hp} HP left`, battle: closest });
  const ko = done.filter((b) => b.reason === 'ko' && b !== closest).sort((x, y) => x.log.length - y.log.length)[0];
  if (ko) out.push({ emoji: '💥', title: 'Fastest KO', text: `${nick(ko.winnerId)} flattened ${nick(ko.loserId)} in ${ko.log.length} round${ko.log.length === 1 ? '' : 's'}`, battle: ko });
  // comeback: the winner was behind on HP% at some point by the widest margin
  let best: { b: Battle; gap: number } | null = null;
  for (const b of done) {
    if (b === closest || b === ko) continue;
    const w = b.winnerId === b.a.playerId ? 'a' : 'b'; const l = w === 'a' ? 'b' : 'a';
    let hp = { a: b.a.maxHp, b: b.b.maxHp };
    for (const r of b.log) {
      hp = { a: Math.max(0, Math.min(b.a.maxHp, hp.a - r.a.dmgTaken + r.a.heal)), b: Math.max(0, Math.min(b.b.maxHp, hp.b - r.b.dmgTaken + r.b.heal)) };
      const gap = hp[l] / b[l].maxHp - hp[w] / b[w].maxHp;
      if (gap > 0.25 && (!best || gap > best.gap)) best = { b, gap };
    }
  }
  if (best) out.push({ emoji: '🔄', title: 'Comeback of the night', text: `${nick(best.b.winnerId)} was down ${Math.round(best.gap * 100)}% and still beat ${nick(best.b.loserId)}`, battle: best.b });
  return out;
}

function topRivalries(players: PlayerPublic[]) {
  const seen = new Set<string>();
  const out: { a: PlayerPublic; b: PlayerPublic; w: number; l: number }[] = [];
  for (const p of players) for (const [id, r] of Object.entries(p.h2h ?? {})) {
    const key = [p.id, id].sort().join('|');
    const o = players.find((x) => x.id === id);
    if (seen.has(key) || !o || r.w + r.l < 2) continue;
    seen.add(key);
    out.push(r.w >= r.l ? { a: p, b: o, w: r.w, l: r.l } : { a: o, b: p, w: r.l, l: r.w });
  }
  return out.sort((x, y) => y.w + y.l - (x.w + x.l) || Math.abs(x.w - x.l) - Math.abs(y.w - y.l)).slice(0, 4);
}

export default function BattleBoard({ meId }: { meId?: string }) {
  const party = useStore((s) => s.party);
  const setReplay = useStore((s) => s.setReplay);
  if (!party) return null;
  const fighters = party.players.filter((p) => p.creature && !p.removed && p.wins + p.losses > 0).sort((a, b) => b.rating - a.rating);
  const hot = [...fighters].filter((p) => p.streak >= 2).sort((a, b) => b.streak - a.streak)[0];
  const rivals = topRivalries(party.players);
  const hl = highlights(party);
  return (
    <div className="screen-body scroll-y stack-6">
      {fighters.length === 0 && <div className="panel pad center dim">No battles yet. Avatars start auto-battling about 10 minutes in.</div>}
      {hot && <div className="panel pad row" style={{ gap: 10 }}><span style={{ fontSize: 24 }}>🔥</span><span className="grow"><div className="eyebrow">Hottest streak</div><div className="bold">{hot.nickname}: {hot.streak} wins in a row</div></span></div>}
      {hl.length > 0 && <div className="eyebrow">Highlights</div>}
      {hl.map((h) => (
        <button key={h.title} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setReplay(h.battle)}>
          <span style={{ fontSize: 20 }}>{h.emoji}</span>
          <span className="grow" style={{ minWidth: 0 }}><div className="tiny bold gold-text">{h.title}</div><div className="small bold ellipsis">{h.text}</div></span>
          <span className="pill pill-gold pill-xs">▶</span>
        </button>))}
      {rivals.length > 0 && <div className="eyebrow">Rivalries</div>}
      {rivals.map((r) => (
        <div key={r.a.id + r.b.id} className="list-row">
          <span style={{ fontSize: 18 }}>⚔️</span>
          <span className="grow small bold ellipsis">{r.w === r.l ? `${r.a.nickname} and ${r.b.nickname}: dead level ${r.w}–${r.l}` : `${r.a.nickname} leads ${r.b.nickname} ${r.w}–${r.l}`}</span>
        </div>))}
      {fighters.length > 0 && <div className="eyebrow">Battle ladder</div>}
      {fighters.map((p, i) => (
        <div key={p.id} className={`list-row ${p.id === meId ? 'me' : ''}`}>
          <span className="rank">#{i + 1}</span>
          <span className="avatar sm"><LadPic p={p} /></span>
          <span className="grow" style={{ minWidth: 0 }}><div className="bold ellipsis">{p.nickname}</div><div className="tiny faint ellipsis">{rankFor(p.rating).emoji} {rankFor(p.rating).name} · {p.title}</div></span>
          <span className="tiny bold nowrap" style={{ textAlign: 'right' }}>{p.rating}<br /><span className="faint">{p.wins}W {p.losses}L{p.streak >= 2 ? ` 🔥${p.streak}` : ''}</span></span>
        </div>))}
      <div className="tiny faint center pad">Battle rating moves with every fight, auto or manual. Weekend points only come from challenges and fights you play yourself.</div>
    </div>
  );
}
