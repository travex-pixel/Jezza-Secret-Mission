import { useRef, useState } from 'react';
import type { GalleryPhoto } from '@shared/types';
import { Button, Sheet, timeAgo } from '../components/ui';
import PhotoViewer from '../components/PhotoViewer';
import CameraSheet, { canUseLiveCamera } from '../components/CameraSheet';
import { compressImage } from '../components/MissionCard';
import { useStore } from '../store';
import { newClaimId, request } from '../net';
import { sfx } from '../audio';

/** Party-only camera roll. Your own photos come down instantly; asking about someone else's goes to the host. */
export default function Gallery() {
  const party = useStore((s) => s.party);
  const setTab = useStore((s) => s.setTab);
  const toast = useStore((s) => s.toast);
  const [open, setOpen] = useState<GalleryPhoto | null>(null);
  const [confirm, setConfirm] = useState(false);
  const meId = useStore((s) => s.identity.playerId);
  // Photo drop: any photo, no challenge. Take it (or pick it), add a line if you like, post.
  const [camera, setCamera] = useState(false);
  const [drop, setDrop] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const lib = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  const claimId = useRef(newClaimId());
  if (!party) return null;
  const post = async () => {
    if (!drop || busy) return; setBusy(true);
    try { await request({ type: 'claimMission', missionId: 'f01', claimId: claimId.current, photo: drop, note: note.trim() || undefined }); claimId.current = newClaimId(); sfx.mission(); setDrop(null); setNote(''); }
    catch (e) { toast((e as Error).message, '⚠️', 'warn'); sfx.error(); }
    finally { setBusy(false); }
  };
  const onFile = async (f: File | undefined) => { if (!f) return; setBusy(true); try { setDrop(await compressImage(f)); } catch { toast('Could not read that photo. Try another.', '⚠️', 'warn'); } finally { setBusy(false); } };
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
      <div className="row" style={{ gap: 8, marginBottom: 8 }}>
        <Button size="sm" className="grow" disabled={busy} onClick={() => (canUseLiveCamera() ? setCamera(true) : cam.current?.click())} data-testid="photo-drop">📸 Drop a photo</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => lib.current?.click()}>🖼️</Button>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={lib} type="file" accept="image/*" data-drop-library hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      {camera && <CameraSheet facing="environment" hint="Anything funny or cool" useLabel="Use this one" onClose={() => setCamera(false)} onFallback={() => cam.current?.click()} onPhoto={(photo) => { setDrop(photo); setCamera(false); }} />}
      {drop && (
        <Sheet onClose={() => !busy && setDrop(null)}>
          <div className="stack-10">
            <div className="eyebrow center">Photo drop</div>
            <img src={drop} alt="" style={{ width: '100%', maxHeight: '38vh', objectFit: 'contain', borderRadius: 14 }} />
            <input className="input" style={{ minHeight: 46, fontSize: 16 }} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} placeholder="Caption (optional)" aria-label="Caption" />
            <Button onClick={() => void post()} disabled={busy} data-testid="post-drop">{busy ? 'Posting…' : '📸 Post it · +5'}</Button>
            <button className="small bold dim center" disabled={busy} onClick={() => setDrop(null)}>Cancel</button>
          </div>
        </Sheet>
      )}
      <div className="tiny faint" style={{ marginBottom: 8 }}>Drop anything funny or cool, no challenge needed. Only this party sees these. Yours you can delete any time; in one you don't love, tap it and ask the host.</div>
      <div className="screen-body scroll-y">
        {!party.gallery.length && <div className="panel pad center dim bold">No photos yet. Drop one.</div>}
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
