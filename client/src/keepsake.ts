// Host-only keepsake: every roast, toast, drink review, award and the final board as one self-contained page.
import type { Keepsake } from '@shared/types';
import { request } from './net';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const when = (t: number) => new Date(t).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', hour: 'numeric', minute: '2-digit' });

export function keepsakeHtml(k: Keepsake, origin: string): string {
  const section = (title: string, body: string) => `<h2>${title}</h2>${body}`;
  const board = `<ol>${k.board.map((p) => `<li><b>${esc(p.nickname)}</b>: ${p.points} pts · ${esc(p.creatureName)} Lv${p.level} · ${p.missions} challenges · ${p.wins}W ${p.losses}L</li>`).join('')}</ol>`;
  const awards = `<ul>${k.awards.map((a) => `<li><b>${esc(a.name)}</b>: ${esc(a.winner)} <span class="sub">(${esc(a.reason)})</span></li>`).join('')}</ul>`;
  const wall = k.wall.length ? k.wall.map((w) => `<div class="post ${w.kind}"><div class="tag">${w.kind === 'roast' ? '🔥 Roast' : '🥂 Toast'} · ${esc(w.author)} · 😂 ${w.votes}${w.groomLove ? ' · ❤️ Jezza' : ''} · ${when(w.at)}</div><div class="txt">“${esc(w.text)}”</div></div>`).join('') : '<p>No roasts or toasts.</p>';
  const cellar = k.cellar.length ? `<ul>${k.cellar.map((c) => `<li><b>${esc(c.drink)}</b> ${'★'.repeat(c.stars)}${'☆'.repeat(5 - c.stars)} by ${esc(c.author)}${c.note ? `: “${esc(c.note)}”` : ''}${c.fires ? ` · 🔥 ${c.fires}` : ''}</li>`).join('')}</ul>` : '<p>No reviews.</p>';
  const photos = k.photos.length ? `<p class="note">Photos load from the game server, so they show while it's still running. To keep the files themselves, download the bucket (see the README).</p><div class="grid">${k.photos.map((p) => `<figure><img src="${esc(origin + p.url)}" loading="lazy" alt=""><figcaption>${esc(p.caption)} · ${esc(p.author)}</figcaption></figure>`).join('')}</div>` : '<p>No photos.</p>';
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(k.name)} keepsake</title>
<style>body{font-family:system-ui,sans-serif;background:#1d1820;color:#f6ebdd;max-width:760px;margin:0 auto;padding:16px;line-height:1.45}h1{color:#e5ad48;margin:0 0 4px}h2{color:#e5ad48;border-bottom:1px solid #4a3d45;padding-bottom:4px;margin-top:28px}.post{background:#2a232c;border-radius:12px;padding:10px 12px;margin:8px 0}.post.roast{border-left:4px solid #f07842}.post.toast{border-left:4px solid #e5ad48}.tag{font-size:12px;opacity:.75}.txt{font-size:17px;font-weight:600}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}figure{margin:0}img{width:100%;border-radius:10px}figcaption{font-size:12px;opacity:.8}.note,.sub{font-size:13px;opacity:.75}</style></head>
<body><h1>${esc(k.name)}</h1><div class="sub">Party ${esc(k.code)} · saved ${when(Date.now())}</div>
${section('The final board', board)}${section('Awards', awards)}${section('The Jezza Wall', wall)}${section('The Cellar', cellar)}${section('Photos', photos)}
<p class="sub">To Jezza. To the legends.</p></body></html>`;
}

export async function downloadKeepsake() {
  const k = await request<Keepsake>({ type: 'host', action: { kind: 'keepsake' } });
  const html = keepsakeHtml(k, location.origin);
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `jezza-keepsake-${k.code}.html`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}
