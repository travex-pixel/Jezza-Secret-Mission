import { useState } from 'react';
import type { GalleryPhoto } from '@shared/types';
import { Button, timeAgo } from '../components/ui';
import PhotoViewer from '../components/PhotoViewer';
import { useStore } from '../store';
import { request } from '../net';

/** Party-only camera roll. Your own photos come down instantly; asking about someone else's goes to the host. */
export default function Gallery() {
  const party = useStore((s) => s.party);
  const setTab = useStore((s) => s.setTab);
  const toast = useStore((s) => s.toast);
  const [open, setOpen] = useState<GalleryPhoto | null>(null);
  const [confirm, setConfirm] = useState(false);
  const meId = useStore((s) => s.identity.playerId);
  if (!party) return null;
  const canDelete = !!open && (open.playerId === meId || party.hostId === meId);
  const nick = (id: string) => party.players.find((p) => p.id === id)?.nickname ?? '?';
  const remove = async () => {
    if (!open) return;
    try {
      const r = await request<{ requested?: boolean }>({ type: 'deletePhoto', photoId: open.id });
      toast(r?.requested ? 'Sent to the host. They\'ll decide.' : 'Photo taken down', '🗑️');
      setOpen(null); setConfirm(false);
    }
    catch (e) { toast((e as Error).message, '⚠️', 'warn'); }
  };
  return (
    <div className="screen with-nav">
      <div className="topbar"><button className="display title-md" onClick={() => setTab('home')}>‹ Camera roll</button><span className="pill">{party.gallery.length} photo{party.gallery.length === 1 ? '' : 's'}</span></div>
      <div className="tiny faint" style={{ marginBottom: 8 }}>Only people in this party can see these. Yours you can delete any time. In one you don't love? Tap it and ask the host to take it down.</div>
      <div className="screen-body scroll-y">
        {!party.gallery.length && <div className="panel pad center dim bold">No photos yet. The Cooked Photos challenges are calling.</div>}
        <div className="gallery-grid">
          {party.gallery.map((g) => <button key={g.id} onClick={() => setOpen(g)} aria-label={g.caption}><img src={g.url} alt={g.caption} loading="lazy" /></button>)}
        </div>
      </div>
      {open && (
        <PhotoViewer src={open.url} caption={`${open.source === 'cellar' ? '🍷' : '📸'} ${open.caption}`} sub={`${open.note ? `“${open.note}” · ` : ''}${nick(open.playerId)} · ${timeAgo(open.at)}`} onClose={() => { setOpen(null); setConfirm(false); }}>
          {confirm
            ? <div className="stack-6"><div className="tiny faint center">{canDelete ? 'This deletes the photo from the server for good.' : 'The host gets a request and decides. The photo stays up until then.'}</div><div className="btn-row"><Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>Keep it</Button><Button variant="danger" size="sm" onClick={remove}>{canDelete ? 'Delete it' : 'Ask the host'}</Button></div></div>
            : <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}>{canDelete ? '🗑️ Delete this photo' : '🗑️ Ask the host to take it down'}</Button>}
        </PhotoViewer>
      )}
    </div>
  );
}
