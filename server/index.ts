// PROJECT JEZZA game server: authoritative engine + WebSocket fan-out + persistence.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { Engine, type EngineState, type Outbound } from '../shared/engine';
import type { ClientMessage, ServerMessage } from '../shared/types';
import { keepsakeCsvs, keepsakeHtml, photoFileNames, safeFileName } from '../shared/keepsake';
import { ZipStream } from './zip';

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const CLIENT_DIR = path.resolve(process.cwd(), 'dist/client');
fs.mkdirSync(PHOTO_DIR, { recursive: true });

// ---------- persistence ----------
// The save file is the weekend. Three layers of protection:
//  1. load falls back to the previous good save, then the newest timestamped backup, if state.json won't parse;
//  2. with REQUIRE_STATE=1 (set by the deploy script once a save exists) a boot that finds no readable save waits
//     for the volume for a while and then exits, instead of serving a blank game that would save over the real one;
//  3. a blank game is never written over a save file that has parties in it.
const PREV_FILE = path.join(DATA_DIR, 'state.prev.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_EVERY_MS = 5 * 60_000; const BACKUPS_KEPT = 36; // every 5 minutes, the last 3 hours
const PREV_EVERY_MS = 60_000;
const REQUIRE_STATE = process.env.REQUIRE_STATE === '1';
let loadedFrom: string | null = null;
function readState(file: string): EngineState | undefined {
  try { if (!fs.existsSync(file)) return undefined; const st = JSON.parse(fs.readFileSync(file, 'utf8')) as EngineState; if (!st || typeof st !== 'object' || !st.parties) throw new Error('not a state file'); return st; }
  catch (e) { console.error(`[persist] could not read ${path.basename(file)}`, (e as Error).message); return undefined; }
}
function newestBackup(): string | undefined {
  try { return fs.readdirSync(BACKUP_DIR).filter((f) => /^state-.*\.json$/.test(f)).sort().reverse().map((f) => path.join(BACKUP_DIR, f))[0]; } catch { return undefined; }
}
function loadState(): EngineState | undefined {
  for (const file of [STATE_FILE, PREV_FILE, newestBackup()].filter(Boolean) as string[]) {
    const st = readState(file);
    if (st) { loadedFrom = file; if (file !== STATE_FILE) console.error(`[persist] state.json unreadable; loaded ${path.relative(DATA_DIR, file)} instead`); return st; }
  }
  if (fs.existsSync(STATE_FILE)) console.error('[persist] a save file exists but nothing could be read from it or its backups');
  return undefined;
}
function waitForState(): EngineState | undefined {
  // the data volume can take a moment to appear after a restart: give it 40 seconds before deciding there is no save
  const deadline = Date.now() + 40_000;
  for (;;) {
    const st = loadState();
    if (st) return st;
    if (!REQUIRE_STATE) return undefined;
    if (Date.now() > deadline) { console.error('[persist] REQUIRE_STATE is set and no save could be read: refusing to start a blank game. Check the data volume.'); process.exit(1); }
    console.error('[persist] no readable save yet, waiting for the data volume…');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
}
let saveTimer: NodeJS.Timeout | null = null;
let saving = false; let dirty = false;
let lastPrevAt = 0; let lastBackupAt = Date.now();
let stateFileTrusted = false; // true once state.json is known good (loaded from it, or written by this copy): only then is it copied into prev/backups
function saveSoon() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(saveNow, 400);
}
function saveNow() {
  saveTimer = null;
  if (superseded) return; // a newer copy of the server owns the save file now
  if (saving) { dirty = true; return; }
  if (!stateFileTrusted) {
    // This copy did not load state.json (it was missing or unreadable at boot). If a real game is sitting there now
    // (the volume arrived late), writing would destroy it: exit instead, and the restart loads it.
    const disk = readState(STATE_FILE);
    if (disk && Object.keys(disk.parties).length > 0) { console.error('[persist] the save file holds a game this copy never loaded; exiting so the restart picks it up instead of overwriting it'); process.exit(1); }
  }
  saving = true; dirty = false;
  const now = Date.now();
  try {
    if (stateFileTrusted && now - lastPrevAt > PREV_EVERY_MS && fs.existsSync(STATE_FILE)) { fs.copyFileSync(STATE_FILE, PREV_FILE); lastPrevAt = now; }
    if (stateFileTrusted && now - lastBackupAt > BACKUP_EVERY_MS && fs.existsSync(STATE_FILE)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.copyFileSync(STATE_FILE, path.join(BACKUP_DIR, `state-${new Date(now).toISOString().replace(/[:.]/g, '-')}.json`)); lastBackupAt = now;
      for (const old of fs.readdirSync(BACKUP_DIR).filter((f) => /^state-.*\.json$/.test(f)).sort().reverse().slice(BACKUPS_KEPT)) fs.unlink(path.join(BACKUP_DIR, old), () => undefined);
    }
  } catch (e) { console.error('[persist] backup copy failed', (e as Error).message); }
  const tmp = STATE_FILE + '.tmp';
  const json = JSON.stringify(engine.state);
  fs.writeFile(tmp, json, (err) => {
    if (err) { console.error('[persist] write failed', err); saving = false; return; }
    fs.rename(tmp, STATE_FILE, (err2) => { if (err2) console.error('[persist] rename failed', err2); else stateFileTrusted = true; saving = false; if (dirty) saveSoon(); });
  });
}

function storePhoto(dataUrl: string, partyCode: string): string | null {
  const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const ext = m[1] === 'jpg' ? 'jpeg' : m[1];
  const id = `${partyCode}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try { fs.writeFileSync(path.join(PHOTO_DIR, id), Buffer.from(m[2], 'base64')); return `/photos/${id}`; } catch (e) { console.error('[photo] write failed', e); return null; }
}

function deletePhotos(urls: string[]) {
  for (const u of urls) {
    const name = path.basename(u);
    if (!/^[A-Z0-9]+_[a-z0-9]+_[a-z0-9]+\.(jpeg|png|webp)$/.test(name)) continue;
    fs.unlink(path.join(PHOTO_DIR, name), (err) => { if (err && err.code !== 'ENOENT') console.error('[photo] delete failed', err); });
  }
}

// ---------- one live copy at a time ----------
// During a redeploy Cloud Run briefly runs the old and new copies side by side, each with its own memory,
// so players connected to the old copy can't see players who joined on the new one. The newest copy
// claims the data folder; an older copy that notices stops saving and drops its connections, and the
// phones reconnect (to the new copy) by themselves a second later.
const BOOT_ID = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const LEADER_FILE = path.join(DATA_DIR, 'leader.json');
let superseded = false;
try { fs.writeFileSync(LEADER_FILE, JSON.stringify({ bootId: BOOT_ID, at: Date.now() })); } catch (e) { console.error('[leader] could not write', e); }

const BUILD = (() => {
  try { const b = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'build.json'), 'utf8')) as { sha?: string; at?: string }; if (b.sha) return `${b.sha}${b.at ? ` · ${b.at}` : ''}`; } catch { /* no stamp */ }
  return process.env.K_REVISION ?? 'dev';
})();
const engine = new Engine({ storePhoto, deletePhotos, build: BUILD }, waitForState());
stateFileTrusted = loadedFrom === STATE_FILE;
if (loadedFrom) console.log(`[persist] loaded ${Object.keys(engine.state.parties).length} part${Object.keys(engine.state.parties).length === 1 ? 'y' : 'ies'} from ${path.relative(DATA_DIR, loadedFrom)}`); else console.log('[persist] no save found: starting a fresh game');
// Everyone starts offline after a restart; connections mark them online again.
for (const party of Object.values(engine.state.parties)) for (const p of Object.values(party.players)) p.online = false;

// ---------- http ----------
const app = express();
app.disable('x-powered-by');
app.get('/api/health', (_req, res) => res.json({ ok: true, build: BUILD, parties: Object.keys(engine.state.parties).length, uptime: process.uptime() }));
app.get('/api/party/:code/exists', (req, res) => {
  const party = engine.state.parties[String(req.params.code).toUpperCase()];
  if (!party) return res.json({ exists: false });
  // what the invite screen shows: the party's name and how many lads are already in
  res.json({ exists: true, name: party.name, lads: Object.values(party.players).filter((p) => !p.removed && p.creature).length });
});
// End-of-weekend export: one .zip with the keepsake page, every photo and spreadsheets. The link comes from the
// host's phone (Host → Event → Download everything) and works for 15 minutes.
app.get('/api/export/:token', async (req, res) => {
  const code = engine.exportCodeFor(String(req.params.token));
  const party = code ? engine.state.parties[code] : undefined;
  if (!party) return res.status(404).type('text').send('That download link has expired. Tap Download everything again in Host controls.');
  const k = engine.keepsake(party);
  const names = photoFileNames(k);
  const top = safeFileName(`${party.name} keepsake (${party.code})`);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="jezza-keepsake-${party.code}.zip"`);
  res.setHeader('Cache-Control', 'no-store');
  const zip = new ZipStream(res);
  let missing = 0;
  try {
    const kept: number[] = [];
    for (let i = 0; i < k.photos.length; i++) {
      const file = path.basename(k.photos[i].url);
      if (!/^[A-Z0-9]+_[a-z0-9]+_[a-z0-9]+\.(jpeg|png|webp)$/.test(file)) { missing++; continue; }
      const data = await fs.promises.readFile(path.join(PHOTO_DIR, file)).catch(() => null);
      if (!data) { missing++; continue; }
      await zip.add(`${top}/photos/${names[i]}`, data);
      kept.push(i);
    }
    const shown = { ...k, photos: kept.map((i) => k.photos[i]) };
    const shownNames = kept.map((i) => names[i]);
    await zip.add(`${top}/Open me - keepsake.html`, keepsakeHtml(shown, (i) => `photos/${encodeURIComponent(shownNames[i])}`, ''));
    for (const [name, body] of Object.entries(keepsakeCsvs(shown, shownNames))) await zip.add(`${top}/${name}`, body);
    await zip.add(`${top}/keepsake.json`, JSON.stringify({ ...shown, photos: shown.photos.map((p, i) => ({ ...p, file: `photos/${shownNames[i]}` })) }, null, 2));
    await zip.add(`${top}/README.txt`, [
      `${party.name} (${party.code})`, '',
      'Open me - keepsake.html  every roast, toast, award, the final board, the cellar and the photos (works offline)',
      'photos/                  every photo, named "number Who - What", in the order they were taken',
      '*.csv                    the same in spreadsheets (Excel, Numbers, Google Sheets)',
      'keepsake.json            all of it as data', '',
      `${kept.length} photos${missing ? ` (${missing} had already been deleted from the server)` : ''}.`, '',
      'Unzip first (on iPhone: tap the zip in Files), then open the keepsake page.',
    ].join('\r\n'));
    await zip.finish();
    console.log(`[export] ${party.code}: ${kept.length} photos, ${missing} missing`);
  } catch (e) { console.error('[export] failed', e); }
  res.end();
});
// Read-only party view for a TV, laptop or anything with a browser (…/?tv=CODE). The code is the same one the
// lads join with; it shows exactly what every member already sees, nothing private, no way to act.
app.get('/api/party/:code/tv', (req, res) => {
  const party = engine.state.parties[String(req.params.code).toUpperCase()];
  if (!party) return res.status(404).json({ error: 'No party with that code.' });
  res.set('Cache-Control', 'no-store').json(engine.publicView(party));
});
app.use('/photos', express.static(PHOTO_DIR, { maxAge: '7d', immutable: true, fallthrough: false }));
if (fs.existsSync(CLIENT_DIR)) {
  app.use(express.static(CLIENT_DIR, { maxAge: '1h', index: false }));
  // Link previews (WhatsApp, Messenger…) need absolute URLs. Fill in whatever address the visitor used,
  // so previews work on the first deploy and on any domain. PUBLIC_URL overrides it if set.
  const indexTemplate = fs.readFileSync(path.join(CLIENT_DIR, 'index.html'), 'utf8');
  app.get('*', (req, res) => {
    const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https' || req.secure ? 'https' : 'http';
    const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim();
    const origin = (process.env.PUBLIC_URL ?? '').replace(/\/$/, '') || (/^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) ? `${proto}://${host}` : '');
    // The preview's own address keeps the invite code, so tapping the link card in Messenger opens the invite, not the front door
    const code = /^[A-Z0-9]{4,6}$/i.test(String(req.query.p ?? '')) ? String(req.query.p).toUpperCase() : '';
    res.set('Cache-Control', 'no-cache').type('html').send(indexTemplate.replace('__PUBLIC_URL__/"', `${origin}/${code ? `?p=${code}` : ''}"`).replaceAll('__PUBLIC_URL__', origin));
  });
} else {
  app.get('/', (_req, res) => res.type('text').send('Project Jezza server is running. Build the client (npm run build) or use the Vite dev server.'));
}
const server = http.createServer(app);

// ---------- websocket ----------
interface Conn { ws: WebSocket; playerId: string | null; alive: boolean }
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2 * 1024 * 1024 });
const conns = new Set<Conn>();
const byPlayer = new Map<string, Set<Conn>>();

function send(ws: WebSocket, msg: ServerMessage) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); }
function sendToPlayer(playerId: string, msg: ServerMessage) { for (const c of byPlayer.get(playerId) ?? []) send(c.ws, msg); }

/** Push fresh party + private views to every connected member of a party. */
function broadcastParty(code: string) {
  const party = engine.state.parties[code];
  if (!party) return;
  for (const pid of Object.keys(party.players)) {
    const set = byPlayer.get(pid);
    if (!set?.size) continue;
    if (engine.partyOf(pid)?.code !== code) continue;
    const pub = engine.publicView(party, pid);
    const priv = engine.privateView(party, pid);
    const hostView = party.hostId === pid ? engine.hostView(party) : undefined;
    for (const c of set) { send(c.ws, { type: 'party', party: pub }); send(c.ws, { type: 'private', priv, hostView }); }
  }
  saveSoon();
}
function deliver(direct: Outbound[], code?: string) {
  for (const d of direct) {
    if (d.to === 'party') { const party = code ? engine.state.parties[code] : undefined; if (party) for (const pid of Object.keys(party.players)) sendToPlayer(pid, d.msg); }
    else sendToPlayer(d.to, d.msg);
  }
}
function sendCurrentViews(c: Conn) {
  if (!c.playerId) return;
  const party = engine.partyOf(c.playerId);
  if (!party) { send(c.ws, { type: 'private', priv: null }); return; }
  send(c.ws, { type: 'party', party: engine.publicView(party, c.playerId) });
  send(c.ws, { type: 'private', priv: engine.privateView(party, c.playerId), hostView: party.hostId === c.playerId ? engine.hostView(party) : undefined });
}

const RATE_WINDOW_MS = 10_000, RATE_MAX = 60;
setInterval(() => {
  if (superseded) return;
  try {
    const cur = JSON.parse(fs.readFileSync(LEADER_FILE, 'utf8')) as { bootId?: string };
    if (cur.bootId && cur.bootId !== BOOT_ID) {
      superseded = true;
      console.log(`[leader] a newer server copy took over; moving ${conns.size} connection(s) across`);
      for (const c of conns) { try { c.ws.close(4001, 'Server updated'); } catch { /* */ } }
    }
  } catch { /* file missing mid-write: check again next time */ }
}, 5000);

wss.on('connection', (ws, req) => {
  if (superseded) { ws.close(4001, 'Server updated'); return; }
  const c: Conn = { ws, playerId: null, alive: true };
  conns.add(c);
  let hits: number[] = [];
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const now = Date.now();
    hits = hits.filter((t) => now - t < RATE_WINDOW_MS); hits.push(now);
    if (hits.length > RATE_MAX) { if ('reqId' in msg) send(ws, { type: 'ack', reqId: msg.reqId, ok: false, error: 'Slow down, legend.' }); return; }

    if (msg.type === 'hello') {
      if (!engine.auth(String(msg.playerId ?? ''), String(msg.secret ?? ''))) { send(ws, { type: 'kicked', reason: 'Identity mismatch. Clear site data and rejoin.' }); ws.close(); return; }
      c.playerId = msg.playerId;
      if (!byPlayer.has(c.playerId)) byPlayer.set(c.playerId, new Set());
      byPlayer.get(c.playerId)!.add(c);
      const code = engine.setOnline(c.playerId, true);
      send(ws, { type: 'welcome', playerId: c.playerId, serverTime: now, inParty: !!code });
      if (code) broadcastParty(code); else sendCurrentViews(c);
      return;
    }
    if (msg.type === 'ping') { send(ws, { type: 'pong', t: msg.t, serverTime: now }); return; }
    if (!c.playerId) { if ('reqId' in msg) send(ws, { type: 'ack', reqId: msg.reqId, ok: false, error: 'Say hello first.' }); return; }

    const before = engine.partyOf(c.playerId)?.code;
    const res = engine.handle(c.playerId, msg);
    const after = engine.partyOf(c.playerId)?.code;
    if (res.changed) {
      const codes = new Set([before, after, res.partyCode].filter(Boolean) as string[]);
      for (const code of codes) broadcastParty(code);
      if (!after) sendCurrentViews(c);
    }
    deliver(res.direct, res.partyCode ?? after ?? before);
    if ('reqId' in msg && res.ack) send(ws, res.ack.ok ? { type: 'ack', reqId: msg.reqId, ok: true, data: res.ack.data } : { type: 'ack', reqId: msg.reqId, ok: false, error: res.ack.error });
  });
  ws.on('close', () => {
    conns.delete(c);
    if (c.playerId) {
      const set = byPlayer.get(c.playerId); set?.delete(c);
      if (!set?.size) { byPlayer.delete(c.playerId); const code = engine.setOnline(c.playerId, false); if (code) broadcastParty(code); }
    }
  });
  ws.on('error', () => { /* close follows */ });
  void req;
});

// Heartbeat: drop dead sockets so presence stays accurate.
setInterval(() => { for (const c of conns) { if (!c.alive) { c.ws.terminate(); continue; } c.alive = false; try { c.ws.ping(); } catch { /* */ } } }, 30_000);
// Engine housekeeping: battle timeouts, challenge expiry.
setInterval(() => { const t = engine.tick(); for (const code of t.changed) broadcastParty(code); for (const code of t.changed) deliver(t.direct, code); if (!t.changed.length && t.direct.length) deliver(t.direct); }, 1000);

server.listen(PORT, () => console.log(`🍇 Project Jezza server on http://localhost:${PORT}  (data: ${DATA_DIR}, client: ${fs.existsSync(CLIENT_DIR) ? 'built' : 'dev-proxy'})`));
process.on('SIGTERM', () => { saveNow(); setTimeout(() => process.exit(0), 300); });
process.on('SIGINT', () => { saveNow(); setTimeout(() => process.exit(0), 300); });
