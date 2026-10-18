// Restart persistence: boot a server on its own data dir, create a party, kill it, boot again, verify the party is back.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = 8795;
const DATA = path.resolve(process.env.SCRATCH ?? '.', 'persist-test-data');
fs.rmSync(DATA, { recursive: true, force: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function boot(): Promise<ChildProcess> {
  const p = spawn('node', ['dist/server/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((res) => p.stdout!.on('data', (d) => { if (String(d).includes('server on')) res(); }));
  return p;
}
function ws(playerId: string, secret: string, onMsg: (m: any) => void): Promise<WebSocket> {
  return new Promise((res) => { const s = new WebSocket(`ws://localhost:${PORT}/ws`); s.on('open', () => { s.send(JSON.stringify({ type: 'hello', playerId, secret })); res(s); }); s.on('message', (d) => onMsg(JSON.parse(d.toString()))); });
}
async function main() {
  let p = await boot();
  let code = '';
  let s = await ws('persist_player_01', 'persist-secret-1', (m) => { if (m.type === 'ack' && m.ok && m.reqId === '1') code = m.data.code; });
  s.send(JSON.stringify({ type: 'createParty', reqId: '1', nickname: 'Keeper' }));
  await sleep(300);
  s.send(JSON.stringify({ type: 'chooseCreature', reqId: '2', creature: 'wombat', creatureName: 'Persisto' }));
  await sleep(900); // > debounce
  s.close();
  p.kill('SIGTERM'); await sleep(600);
  const saved = fs.existsSync(path.join(DATA, 'state.json'));
  console.log(`  ${saved ? '✔' : '✘'} state.json written (party ${code})`);
  p = await boot();
  let restored: any = null;
  s = await ws('persist_player_01', 'persist-secret-1', (m) => { if (m.type === 'party') restored = m.party; });
  await sleep(500);
  const ok = restored && restored.code === code && restored.players[0]?.creatureName === 'Persisto';
  console.log(`  ${ok ? '✔' : '✘'} party and creature restored after restart`);
  s.close(); p.kill('SIGTERM'); await sleep(300);
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(saved && ok ? '\nPERSISTENCE PASSED' : '\nPERSISTENCE FAILED');
  process.exit(saved && ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
