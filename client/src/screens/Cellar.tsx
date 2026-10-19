import { useRef, useState } from 'react';
import { Button, timeAgo } from '../components/ui';
import { useStore, useMe } from '../store';
import { request } from '../net';
import { compressImage } from '../components/MissionCard';
import { sfx } from '../audio';

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
  const fileRef = useRef<HTMLInputElement>(null);
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
          <label><span className="label">What are you drinking?</span><input className="input" value={drink} maxLength={40} onChange={(e) => setDrink(e.target.value)} placeholder="2019 Hunter Semillon, Pepsi Max, tap water…" /></label>
          <div className="row-between"><span className="label" style={{ margin: 0 }}>Rating</span><span className="stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} className={n <= stars ? 'on' : ''} onClick={() => setStars(n)} aria-label={`${n} stars`}>★</button>)}</span></div>
          <label><span className="label">Tasting note (optional)</span><input className="input" value={note} maxLength={90} onChange={(e) => setNote(e.target.value)} placeholder="Notes of oak, regret and a long finish of Saturday" /></label>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setPhoto(await compressImage(f)); } catch { toast('That photo didn\'t work', '⚠️', 'warn'); } } }} />
          <div className="btn-row"><Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>{photo ? '✅ Label snapped' : '📸 Snap the label'}</Button><Button size="sm" disabled={busy || drink.trim().length < 2 || !stars} onClick={save}>Post review</Button></div>
          <Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
        </div>
      ) : (
        <>
          <Button onClick={() => setAdding(true)}>🍷 Review your drink</Button>
          <div className="tiny faint center" style={{ margin: '6px 0 8px' }}>Any drink counts: wine, beer, mocktails, a cheeky Yakult. Your first three reviews a day score points. The game never rewards drinking more.</div>
          <div className="screen-body scroll-y stack-6">
            {!entries.length && <div className="panel pad center dim bold">The Cellar's empty. Be the first sommelier fraud.</div>}
            {entries.map((e) => (
              <div key={e.id} className="list-row" style={{ alignItems: 'flex-start' }}>
                {e.photoUrl ? <img src={e.photoUrl} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flex: '0 0 auto' }} loading="lazy" /> : <span style={{ fontSize: 28 }}>🍷</span>}
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
