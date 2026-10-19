// In-app camera. Opening the phone's camera app from a web page can make Android close the browser to free
// memory ("Unable to complete previous operation due to low memory") and the photo never arrives. A live camera
// inside the page never leaves it. If the camera can't start (no permission, old phone), one tap opens the
// phone's own camera app instead.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sfx } from '../audio';

export const canUseLiveCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

const MAX_SIDE = 1600;

export default function CameraSheet({ facing: initial, onPhoto, onFallback, onClose }: {
  facing: 'user' | 'environment';
  onPhoto: (dataUrl: string) => void;
  onFallback: () => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState(initial);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false); setFailed(false);
    navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } } })
      .then(async (s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        const v = video.current; if (!v) return;
        v.srcObject = s;
        await v.play().catch(() => undefined);
        setReady(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  }, [facing]); // eslint-disable-line react-hooks/exhaustive-deps

  const snap = () => {
    const v = video.current; if (!v || !v.videoWidth) return;
    const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
    const g = c.getContext('2d')!;
    if (facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); } // keep the selfie the way you saw it
    g.drawImage(v, 0, 0, c.width, c.height);
    sfx.tap();
    setShot(c.toDataURL('image/jpeg', 0.85));
  };

  return createPortal(
    <div className="camera" role="dialog" aria-label="Camera">
      {/* the video stays mounted under the preview so Retake picks up the same live stream */}
      <video ref={video} className={`camera-view ${facing === 'user' ? 'mirror' : ''}`} style={shot ? { display: 'none' } : undefined} playsInline muted autoPlay />
      {shot && <img className="camera-view" src={shot} alt="Your photo" />}
      {!ready && !shot && !failed && <div className="camera-wait">Starting the camera…</div>}
      {failed && (
        <div className="camera-wait"><div className="center stack-10" style={{ padding: 24 }}>
          <div className="bold">Couldn't open the camera here.</div>
          <div className="small" style={{ opacity: 0.8 }}>No stress: use your phone's camera instead. If it says it's low on memory, close a few other apps first.</div>
          {/* a tap, so the browser lets us open the phone's camera */}
          <button className="camera-use" onClick={() => { onFallback(); onClose(); }}>📸 Use phone camera</button>
        </div></div>
      )}
      <div className="camera-bar">
        {shot ? (
          <>
            <button className="camera-text" onClick={() => setShot(null)}>Retake</button>
            <button className="camera-use" onClick={() => onPhoto(shot)}>✅ Use it</button>
          </>
        ) : (
          <>
            <button className="camera-round" onClick={onClose} aria-label="Close camera">✕</button>
            <button className="camera-shutter" onClick={snap} disabled={!ready || failed} aria-label="Take photo" />
            <button className="camera-round" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Flip camera">🔄</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
