import { useState } from 'react';
import type { GalleryPhoto } from '@shared/types';
import { Button, Sheet, timeAgo } from '../components/ui';
import { useStore } from '../store';
import { request } from '../net';

/** Party-only camera roll of challenge and Cellar photos. Anyone can take a photo down. */
export default function Gallery() {
  const party = useStore((s) => s.party);
  const setTab = useStore((s) => s.setTab);
  const toast = useStore((s) => s.toast);
  const [open, setOpen] = useState<GalleryPhoto | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (!party) return null;
  const nick = (id: string) => party.players.find((p) => p.id === id)?.nickname ?? '?';
  const remove = async () => {
    if (!open) return;
    try { await request({ type: 'deletePhoto', photoId: open.id }); toast('Photo taken down', '🗑️'); setOpen(null); setConfirm(false); }
    catch (e) { toast((e as Error).message, '⚠️', 'warn'); }
  };
  return (
    <div className="screen with-nav">
      <div className="topbar"><button className="display title-md" onClick={() => setTab('home')}>‹ Camera roll</button><span className="pill">{party.gallery.length} photos</span></div>
      <div className="tiny faint" style={{ marginBottom: 8 }}>Only people in this party can see these. In one you don't love? Tap it and take it down, no questions asked.</div>
      <div className="screen-body scroll-y">
        {!party.gallery.length && <div className="panel pad center dim bold">No photos yet. The Cooked Photos challenges are calling.</div>}
        <div className="gallery-grid">
          {party.gallery.map((g) => <button key={g.id} onClick={() => setOpen(g)} aria-label={g.caption}><img src={g.url} alt={g.caption} loading="lazy" /></button>)}
        </div>
      </div>
      {open && (
        <Sheet onClose={() => { setOpen(null); setConfirm(false); }}>
          <img src={open.url} alt={open.caption} style={{ width: '100%', maxHeight: '55vh', objectFit: 'contain', borderRadius: 14 }} />
          <div className="row-between" style={{ margin: '10px 0' }}>
            <span><div className="bold">{open.source === 'cellar' ? '🍷' : '📸'} {open.caption}</div><div className="tiny faint">{nick(open.playerId)} · {timeAgo(open.at)}</div></span>
          </div>
          {confirm
            ? <div className="btn-row"><Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>Keep it</Button><Button variant="danger" size="sm" onClick={remove}>Take it down</Button></div>
            : <Button variant="ghost" onClick={() => setConfirm(true)}>🗑️ Take this photo down</Button>}
        </Sheet>
      )}
    </div>
  );
}
