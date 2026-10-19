// Full-screen photo viewer: pinch or double-tap to zoom, drag to look around, swipe down or ✕ to close.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

export default function PhotoViewer({ src, caption, sub, onClose, children }: { src: string; caption?: string; sub?: string; onClose: () => void; children?: ReactNode }) {
  const img = useRef<HTMLImageElement>(null);
  const view = useRef({ s: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; s: number; mx: number; my: number; x: number; y: number; moved: boolean; startY: number } | null>(null);
  const lastTap = useRef(0);

  const apply = (animate = false) => {
    const el = img.current; if (!el) return;
    const { s, x, y } = view.current;
    el.style.transition = animate ? 'transform 220ms ease' : 'none';
    el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  };
  // keep the photo from being dragged off into the void
  const clampPan = () => {
    const el = img.current; if (!el) return;
    const v = view.current;
    const maxX = Math.max(0, (el.offsetWidth * v.s - window.innerWidth) / 2);
    const maxY = Math.max(0, (el.offsetHeight * v.s - window.innerHeight) / 2);
    v.x = Math.max(-maxX, Math.min(maxX, v.x)); v.y = Math.max(-maxY, Math.min(maxY, v.y));
  };
  const centre = () => ({ cx: window.innerWidth / 2, cy: window.innerHeight / 2 });

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const v = view.current;
    if (pts.length === 2) {
      gesture.current = { dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), s: v.s, mx: (pts[0].x + pts[1].x) / 2, my: (pts[0].y + pts[1].y) / 2, x: v.x, y: v.y, moved: true, startY: e.clientY };
    } else if (pts.length === 1) {
      gesture.current = { dist: 0, s: v.s, mx: e.clientX, my: e.clientY, x: v.x, y: v.y, moved: false, startY: e.clientY };
    }
  };
  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()]; const g = gesture.current; const v = view.current;
    if (pts.length >= 2 && g.dist) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
      const s = Math.max(1, Math.min(MAX_SCALE, (g.s * dist) / g.dist));
      const { cx, cy } = centre();
      // keep the point between the fingers under the fingers
      const px = (g.mx - cx - g.x) / g.s, py = (g.my - cy - g.y) / g.s;
      v.s = s; v.x = mx - cx - px * s; v.y = my - cy - py * s;
      apply();
    } else if (pts.length === 1) {
      const dx = e.clientX - g.mx, dy = e.clientY - g.my;
      if (Math.abs(dx) + Math.abs(dy) > 6) g.moved = true;
      if (v.s > 1) { v.x = g.x + dx; v.y = g.y + dy; apply(); }
      else if (img.current) { img.current.style.transition = 'none'; img.current.style.transform = `translateY(${Math.max(0, dy)}px)`; img.current.style.opacity = String(1 - Math.min(0.6, Math.max(0, dy) / 400)); }
    }
  };
  const up = (e: React.PointerEvent) => {
    const g = gesture.current; const v = view.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) { // one finger lifted mid-pinch: carry on as a pan
      const [p] = [...pointers.current.values()];
      gesture.current = { dist: 0, s: v.s, mx: p.x, my: p.y, x: v.x, y: v.y, moved: true, startY: p.y };
      return;
    }
    gesture.current = null;
    if (img.current) img.current.style.opacity = '1';
    if (g && g.moved && g.s === 1 && v.s === 1 && e.clientY - g.startY > 110) { onClose(); return; } // swipe down
    if (v.s <= 1.02) { v.s = 1; v.x = 0; v.y = 0; }
    if (g && !g.moved) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        lastTap.current = 0;
        if (v.s > 1) { v.s = 1; v.x = 0; v.y = 0; }
        else { const { cx, cy } = centre(); v.s = DOUBLE_TAP_SCALE; v.x = (cx - e.clientX) * (DOUBLE_TAP_SCALE - 1); v.y = (cy - e.clientY) * (DOUBLE_TAP_SCALE - 1); }
      } else lastTap.current = now;
    }
    clampPan(); apply(true);
  };
  const wheel = (e: React.WheelEvent) => {
    const v = view.current;
    v.s = Math.max(1, Math.min(MAX_SCALE, v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    if (v.s === 1) { v.x = 0; v.y = 0; }
    clampPan(); apply(true);
  };

  return createPortal(
    <div className="viewer" role="dialog" aria-label="Photo">
      <div className="viewer-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
        <img ref={img} src={src} alt={caption ?? 'Photo'} draggable={false} />
      </div>
      <button className="viewer-close" onClick={onClose} aria-label="Close photo">✕</button>
      <div className="viewer-foot">
        {(caption || sub) && <div className="viewer-caption"><div className="bold">{caption}</div>{sub && <div className="tiny" style={{ opacity: 0.75 }}>{sub}</div>}</div>}
        {children}
        <div className="tiny" style={{ opacity: 0.55, textAlign: 'center' }}>Pinch or double-tap to zoom · swipe down to close</div>
      </div>
    </div>,
    document.body,
  );
}

/** App-wide viewer for any photo opened with useStore.getState().openPhoto(...). */
export function GlobalPhotoViewer() {
  const photo = useStore((s) => s.photo);
  const close = useStore((s) => s.openPhoto);
  if (!photo) return null;
  return <PhotoViewer src={photo.src} caption={photo.caption} sub={photo.sub} onClose={() => close(null)} />;
}
