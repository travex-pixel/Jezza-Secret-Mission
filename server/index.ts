// PROJECT JEZZA game server: authoritative engine + WebSocket fan-out + persistence.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { Engine, type EngineState, type Outbound } from '../shared/engine';
import type { ClientMessage, ServerMessage } from '../shared/types';

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');
const PHOTO_DIR = path.join(DATA_DIR, 'photos');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const CLIENT_DIR = path.resolve(process.cwd(), 'dist/client');
fs.mkdirSync(PHOTO_DIR, { recursive: true });

// ---------- persistence ----------
function loadState(): EngineState | undefined {
  try { if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as EngineState; } catch (e) { console.error('[persist] could not load state, starting fresh', e); }
  return undefined;
}
let saveTimer: NodeJS.Timeout | null = null;
let saving = false; let dirty = false;
function saveSoon() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(saveNow, 400);
}
function saveNow() {
  saveTimer = null;
  if (saving) { dirty = true; return; }
  saving = true; dirty = false;
  const tmp = STATE_FILE + '.tmp';
  const json = JSON.stringify(engine.state);
  fs.writeFile(tmp, json, (err) => {
    if (err) { console.error('[persist] write failed', err); saving = false; return; }
    fs.rename(tmp, STATE_FILE, (err2) => { if (err2) console.error('[persist] rename failed', err2); saving = false; if (dirty) saveSoon(); });
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

const engine = new Engine({ storePhoto, deletePhotos }, loadState());
// Everyone starts offline after a restart; connections mark them online again.
for (const party of Object.values(engine.state.parties)) for (const p of Object.values(party.players)) p.online = false;

// ---------- http ----------
const app = express();
app.disable('x-powered-by');
app.get('/api/health', (_req, res) => res.json({ ok: true, parties: Object.keys(engine.state.parties).length, uptime: process.uptime() }));
app.get('/api/party/:code/exists', (req, res) => res.json({ exists: !!engine.state.parties[String(req.params.code).toUpperCase()] }));
app.use('/photos', express.static(PHOTO_DIR, { maxAge: '7d', immutable: true, fallthrough: false }));
if (fs.existsSync(CLIENT_DIR)) {
  app.use(express.static(CLIENT_DIR, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIR, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));
} else {
  app.get('/', (_req, res) => res.type('text').send('Project Jezza server is running. Build the client (npm run build) or use the Vite dev server.'));
}
const server = http.createServer(app);

// ---------- websocket ----------
interface Conn { ws: WebSocket; playerId: string | null; alive: boolean }
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 * 1024 });
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
wss.on('connection', (ws, req) => {
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
