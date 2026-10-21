// Host-only keepsake downloads. The full one is a .zip built by the server (photos included, works offline);
// the demo has no server, so it gets the single page instead.
import type { Keepsake } from '@shared/types';
import { keepsakeHtml } from '@shared/keepsake';
import { isDemo, request } from './net';

function save(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}

/** One page: roasts, toasts, reviews, awards, the board. Photos load from the server while it's running. */
export async function downloadKeepsake() {
  const k = await request<Keepsake>({ type: 'host', action: { kind: 'keepsake' } });
  const html = keepsakeHtml(k, (i) => location.origin + k.photos[i].url, 'Photos load from the game server, so they show while it\'s running. For the files themselves, use Download everything.');
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  save(url, `jezza-keepsake-${k.code}.html`);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Everything in one .zip: the page, every photo (named by who and what), and spreadsheets of the lot. */
export async function downloadEverything() {
  if (isDemo()) return downloadKeepsake();
  const { token, code } = await request<{ token: string; code: string }>({ type: 'host', action: { kind: 'exportToken' } });
  save(`/api/export/${encodeURIComponent(token)}`, `jezza-keepsake-${code}.zip`);
}
