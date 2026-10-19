// Turns the server's raw photo files into a keepsake folder, named by who took each one and for which mission.
//   npx tsx scripts/export-photos.ts <data-dir> <out-dir> [PARTYCODE]
// <data-dir> is a copy of the server's DATA_DIR (state.json + photos/). Nothing on the server is changed.
import fs from 'node:fs';
import path from 'node:path';
import { MISSION_BY_ID } from '../shared/missions';

const [dataDir, outDir, onlyCode] = process.argv.slice(2);
if (!dataDir || !outDir) { console.error('Usage: npx tsx scripts/export-photos.ts <data-dir> <out-dir> [PARTYCODE]'); process.exit(1); }
const state = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
let copied = 0, missing = 0;
for (const party of Object.values<any>(state.parties)) {
  if (onlyCode && party.code !== onlyCode.toUpperCase()) continue;
  const claims = [
    ...Object.values<any>(party.claims).filter((c) => c.photoUrl),
    ...(party.cellar ?? []).filter((e: any) => e.photoUrl).map((e: any) => ({ ...e, createdAt: e.at, missionId: `🍷 ${e.drink} (${e.stars}★)`, note: e.note, status: 'cellar' })),
  ].sort((a, b) => a.createdAt - b.createdAt);
  if (!claims.length) continue;
  const dir = path.join(outDir, safe(`${party.name} (${party.code})`));
  fs.mkdirSync(dir, { recursive: true });
  const lines: string[] = [];
  claims.forEach((c, i) => {
    const src = path.join(dataDir, 'photos', path.basename(c.photoUrl));
    if (!fs.existsSync(src)) { missing++; return; }
    const who = party.players[c.playerId]?.nickname ?? 'Someone';
    const mission = MISSION_BY_ID[c.missionId]?.title ?? c.missionId;
    const when = new Date(c.createdAt).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', hour: 'numeric', minute: '2-digit' });
    const name = `${String(i + 1).padStart(3, '0')} ${safe(who)} - ${safe(mission)}${c.status === 'rejected' ? ' (rejected)' : ''}${path.extname(src)}`;
    fs.copyFileSync(src, path.join(dir, name));
    lines.push(`${name}\n   ${when} · ${who} · "${mission}"${c.note ? ` · note: ${c.note}` : ''}`);
    copied++;
  });
  fs.writeFileSync(path.join(dir, 'captions.txt'), `${party.name} (${party.code})\n\n${lines.join('\n')}\n`);
}
console.log(`Copied ${copied} photo${copied === 1 ? '' : 's'} into ${outDir}${missing ? ` (${missing} already deleted from the server)` : ''}.`);
