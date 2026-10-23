// The end-of-weekend keepsake: every roast, toast, drink review, award, the final board and the photos.
// One builder for both the single page (host download in the app) and the page inside the full .zip export,
// where the photos sit next to it in photos/ so it keeps working after the server is switched off.
import type { Keepsake } from './types';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const keepsakeWhen = (t: number) => new Date(t).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** Windows-, Mac- and phone-safe file name piece: letters, numbers and plain punctuation only. */
export const safeFileName = (s: string) => s.normalize('NFKD').replace(/[^\w\s\-'&(),.!]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'photo';

/** "007 Big Dave - Jezza Vision.jpeg": numbered in the order they were taken. */
export function photoFileNames(k: Keepsake): string[] {
  return k.photos.map((p, i) => `${String(i + 1).padStart(3, '0')} ${safeFileName(p.author)} - ${safeFileName(p.caption)}.${(/\.(png|webp|jpe?g)$/i.exec(p.url)?.[1] ?? 'jpeg').toLowerCase()}`);
}

/** The keepsake page. `photoSrc` says where each photo loads from: the live server, or the photos/ folder in the zip. */
export function keepsakeHtml(k: Keepsake, photoSrc: (index: number) => string, note: string): string {
  const section = (title: string, body: string) => `<h2>${title}</h2>${body}`;
  const board = `<ol>${k.board.map((p) => `<li><b>${esc(p.nickname)}</b>: ${p.points} pts · ${esc(p.creatureName)} Lv${p.level} · ${p.missions} challenges · ${p.wins}W ${p.losses}L</li>`).join('')}</ol>`;
  const awards = `<ul>${k.awards.map((a) => `<li><b>${esc(a.name)}</b>: ${esc(a.winner)} <span class="sub">(${esc(a.reason)})</span></li>`).join('')}</ul>`;
  const wall = k.wall.length ? k.wall.map((w) => `<div class="post ${w.kind}"><div class="tag">${w.kind === 'roast' ? '🔥 Roast' : '🥂 Toast'} · ${esc(w.author)} · 😂 ${w.votes}${w.groomLove ? ' · ❤️ Jezza' : ''} · ${keepsakeWhen(w.at)}</div><div class="txt">“${esc(w.text)}”</div></div>`).join('') : '<p>No roasts or toasts.</p>';
  const cellar = k.cellar.length ? `<ul>${k.cellar.map((c) => `<li><b>${esc(c.drink)}</b> ${'★'.repeat(c.stars)}${'☆'.repeat(5 - c.stars)} by ${esc(c.author)}${c.note ? `: “${esc(c.note)}”` : ''}${c.fires ? ` · 🔥 ${c.fires}` : ''}</li>`).join('')}</ul>` : '<p>No reviews.</p>';
  const photos = k.photos.length ? `${note ? `<p class="note">${note}</p>` : ''}<div class="grid">${k.photos.map((p, i) => `<figure><a href="${esc(photoSrc(i))}"><img src="${esc(photoSrc(i))}" loading="lazy" alt=""></a><figcaption>${esc(p.caption)} · ${esc(p.author)} · ${keepsakeWhen(p.at)}</figcaption></figure>`).join('')}</div>` : '<p>No photos.</p>';
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(k.name)} keepsake</title>
<style>body{font-family:system-ui,sans-serif;background:#1d1820;color:#f6ebdd;max-width:760px;margin:0 auto;padding:16px;line-height:1.45}h1{color:#e5ad48;margin:0 0 4px}h2{color:#e5ad48;border-bottom:1px solid #4a3d45;padding-bottom:4px;margin-top:28px}.post{background:#2a232c;border-radius:12px;padding:10px 12px;margin:8px 0}.post.roast{border-left:4px solid #f07842}.post.toast{border-left:4px solid #e5ad48}.tag{font-size:12px;opacity:.75}.txt{font-size:17px;font-weight:600}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}figure{margin:0}img{width:100%;border-radius:10px}figcaption{font-size:12px;opacity:.8}.note,.sub{font-size:13px;opacity:.75}</style></head>
<body><h1>${esc(k.name)}</h1><div class="sub">Party ${esc(k.code)} · saved ${keepsakeWhen(Date.now())}</div>
${section('The final board', board)}${section('Awards', awards)}${section('The Jezza Wall', wall)}${section('The Cellar', cellar)}${section(`Photos (${k.photos.length})`, photos)}
<p class="sub">To Jezza. To the legends.</p></body></html>`;
}

const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (rows: unknown[][]) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; // BOM so Excel reads the emoji

/** Spreadsheet-friendly copies of everything (open in Excel, Numbers or Google Sheets). */
export function keepsakeCsvs(k: Keepsake, names: string[]): Record<string, string> {
  return {
    'roasts-and-toasts.csv': csv([['Type', 'Who', 'What they said', 'Laughs', 'Jezza loved it', 'When'], ...k.wall.map((w) => [w.kind, w.author, w.text, w.votes, w.groomLove ? 'yes' : '', keepsakeWhen(w.at)])]),
    'leaderboard.csv': csv([['Place', 'Lad', 'Creature', 'Level', 'Points', 'Challenges', 'Wins', 'Losses'], ...k.board.map((p, i) => [i + 1, p.nickname, p.creatureName, p.level, p.points, p.missions, p.wins, p.losses])]),
    'awards.csv': csv([['Award', 'Winner', 'Why'], ...k.awards.map((a) => [a.name, a.winner, a.reason])]),
    'cellar.csv': csv([['Drink', 'Stars', 'Who', 'Note', 'Fires', 'When'], ...k.cellar.map((c) => [c.drink, c.stars, c.author, c.note ?? '', c.fires, keepsakeWhen(c.at)])]),
    'photos.csv': csv([['File', 'Who', 'What', 'When'], ...k.photos.map((p, i) => [names[i], p.author, p.caption, keepsakeWhen(p.at)])]),
    'stats.csv': csv([
      ['Lad', 'Creature', 'Creature name', 'Level', 'Points', 'Challenges', 'Photos', 'Wins', 'Losses', 'Best streak', 'Bounties', 'Upset losses', 'Laughs got', 'Fires got', 'Jezza hearts', 'Reactions given', 'Wall posts', 'Wall laughs', 'Cellar reviews', 'Cellar fires', 'Raid damage', 'Raids joined', 'EPIC jobs', 'Witnessed', 'Badges', 'Items', 'Joined', 'Challenges by type', 'Head to head'],
      ...(k.stats ?? []).map((s) => [s.nickname, s.creature, s.creatureName, s.level, s.points, s.missions, s.photos, s.wins, s.losses, s.bestStreak, s.bounties, s.upsets, s.laughs, s.fires, s.groomLoves, s.reactionsGiven, s.wallPosts, s.wallVotes, s.cellarReviews, s.cellarFires, s.raidDamage, s.raidsJoined, s.epicsDone, s.witnessed, s.badges, s.items, s.joined, s.categories, s.h2h]),
    ]),
    'feed.csv': csv([['When', 'Type', 'Who', 'What happened'], ...(k.feed ?? []).map((f) => [keepsakeWhen(f.at), f.kind, f.who ?? '', f.text])]),
  };
}
