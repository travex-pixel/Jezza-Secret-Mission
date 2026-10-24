import { useRef, useState } from 'react';
import { Button, timeAgo } from '../components/ui';
import { useStore, useMe } from '../store';
import { request } from '../net';
import { compressImage } from '../components/MissionCard';
import { sfx } from '../audio';
import { DRINK_GROUPS, drinkEmoji, type DrinkGroup } from '@shared/drinks';

export default function Cellar() {
  const party = useStore((s) => s.party);
  const me = useMe();
  const setTab = useStore((s) => s.setTab);
  const toast = useStore((s) => s.toast);
  const [adding, setAdding] = useState(false);
  const [drink, setDrink] = useState('');
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [group, setGroup] = useState<DrinkGroup>('beer');
  const fileRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  if (!party || !me) return null;
  const nick = (id: string) => party.players.find((p) => p.id === id)?.nickname ?? '?';
  const entries = [...party.cellar].sort((a, b) => b.fires.length - a.fires.length || b.at - a.at);
  const mineToday = party.cellar.filter((e) => e.playerId === me.id && e.phase === party.phase).length;
  const save = async () => {
    setBusy(true);
    try { await request({ type: 'cellarAdd', drink, stars, note: note || undefined, photo }); sfx.select(); setAdding(false); setDrink(''); setStars(0); setNote(''); setPhoto(undefined); }
    catch (e) { toast((e as Error).message, '⚠️', 'warn'); }
    finally { setBusy(false); }
  };
  const fire = async (id: string) => { try { await request({ type: 'cellarFire', entryId: id }); sfx.tap(); } catch (e) { toast((e as Error).message, '⚠️', 'warn'); } };
  return (
    <div className="screen with-nav">
      <div className="topbar"><button className="display title-md" onClick={() => setTab('home')}>‹ The Cellar</button><span className="pill">{Math.min(mineToday, 3)}/3 scored today</span></div>
      {adding ? (
        <div className="panel pad stack-10">
          <div className="stack-6" data-testid="drink-menu">
            <span className="label">Tap yours, or type it</span>
            <div className="tabs" style={{ marginBottom: 0 }}>{DRINK_GROUPS.map((g) => <button key={g.id} className={`tab ${group === g.id ? 'on' : ''}`} onClick={() => setGroup(g.id)} style={{ whiteSpace: 'nowrap' }}>{g.emoji} {g.label}</button>)}</div>
            <div className="row drink-chips">{DRINK_GROUPS.find((g) => g.id === group)!.items.map((d) => <button key={d} className={`pill pill-tap ${drink === d ? 'pill-gold' : ''}`} onClick={() => { setDrink(d); sfx.tap(); }} data-testid="drink-chip">{d}</button>)}</div>
          </div>
          <label><span className="label">What are you drinking?</span><input className="input" value={drink} maxLength={40} onChange={(e) => setDrink(e.target.value)} placeholder="Or type it: 2019 Hunter Semillon, a cheeky Milo…" /></label>
          <div className="row-between"><span className="label" style={{ margin: 0 }}>Rating</span><span className="stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={n <= stars ? 'on' : ''} onClick={() => setStars(n)} aria-label={`${n} stars`}>★</button>)}</span></div>
          <label><span className="label">Tasting note (optional)</span><input className="input" value={note} maxLength={90} onChange={(e) => setNote(e.target.value)} placeholder="Notes of oak, regret and a long finish of Saturday" /></label>
          {[fileRef, libRef].map((r, i) => <input key={i} ref={r} type="file" accept="image/*" capture={i === 0 ? 'environment' : undefined} className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { try { setPhoto(await compressImage(f)); } catch { toast('That photo didn\'t work', '⚠️', 'warn'); } } }} />)}
          <div className="btn-row"><Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>{photo ? '✅ Label added' : '📸 Snap the label'}</Button><Button variant="secondary" size="sm" onClick={() => libRef.current?.click()} aria-label="Pick from your photos">🖼️</Button><Button size="sm" disabled={busy || drink.trim().length < 2 || !stars} onClick={save}>Post review</Button></div>
          <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      ) : (
        <>
          <Button onClick={() => setAdding(true)}>🍺 Review your drink</Button>
          <div className="tiny faint center" style={{ margin: '6px 0 8px' }}>Beers, softies, wines, spirits, a cheeky Yakult: all count the same. Your first three reviews a day score points. The game never rewards drinking more.</div>
          <div className="screen-body scroll-y stack-6">
            {!entries.length && <div className="panel pad center dim bold">The Cellar's empty. Be the first sommelier fraud.</div>}
            {entries.map((e) => (
              <div key={e.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                {e.photoUrl ? <img src={e.photoUrl} className="tap-photo" onClick={() => useStore.getState().openPhoto({ src: e.photoUrl!, caption: e.drink, sub: e.note })} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flex: '0 0 auto' }} loading="lazy" /> : <span style={{ fontSize: 28 }}>{drinkEmoji(e.drink)}</span>}
                <span className="grow" style={{ minWidth: 0 }}>
                  <div className="bold ellipsis">{e.drink}</div>
                  <div className="small" style={{ color: 'var(--gold)' }}>{'★'.repeat(e.stars)}<span className="faint">{'★'.repeat(5 - e.stars)}</span></div>
                  {e.note && <div className="small dim italic">"{e.note}"</div>}
                  <div className="tiny faint">{nick(e.playerId)} · {timeAgo(e.at)}</div>
                </span>
                <button className={`react-btn ${e.fires.includes(me.id) ? 'on' : ''}`} disabled={e.playerId === me.id || e.fires.includes(me.id)} onClick={() => fire(e.id)}>🔥 {e.fires.length || ''}</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
