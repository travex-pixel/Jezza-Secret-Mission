// Redeploy handover: two server copies share one data folder (as on Cloud Run while a new version
// starts). The newer copy must take over: the old one drops its players (they reconnect to the new
// one), refuses new connections and stops writing the save file. Needs `npm run build` first.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'jezza-handover-'));
let failures = 0;
const check = (c: unknown, m: string) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function server(port: number): Promise<ChildProcess> {
  const p = spawn('node', ['dist/server/index.js'], { env: { ...process.env, PORT: String(port), DATA_DIR: DATA }, stdio: ['ignore', 'pipe', 'inherit'] });
  return new Promise((res) => p.stdout!.on('data', (d) => { if (String(d).includes('server on')) res(p); }));
}
function client(port: number, playerId: string) {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  let closeCode = 0; let party: any = null; let seq = 0;
  const pend = new Map<string, (m: any) => void>();
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'party') party = m.party; if (m.type === 'ack') pend.get(m.reqId)?.(m); });
  ws.on('close', (code) => { closeCode = code; });
  const ready = new Promise<void>((r) => ws.on('open', () => { ws.send(JSON.stringify({ type: 'hello', playerId, secret: 'handover-secret-1' })); r(); }));
  const req = (msg: any) => new Promise<any>((r) => { const reqId = `r${seq++}`; pend.set(reqId, r); ws.send(JSON.stringify({ ...msg, reqId })); });
  return { ready, req, close: () => ws.close(), code: () => closeCode, party: () => party };
}

async function main() {
  console.log('[redeploy handover]');
  const a = await server(8796);
  const host = client(8796, 'handover_host_01'); await host.ready;
  const r = await host.req({ type: 'createParty', nickname: 'Travis' });
  const code = r.data.code;
  const mate = client(8796, 'handover_mate_01'); await mate.ready;
  await mate.req({ type: 'joinParty', code, nickname: 'Ye Boi' });
  await sleep(800); // let the old copy save
  const b = await server(8797); // the new version starts and loads the save
  await sleep(6500);
  check(host.code() === 4001 && mate.code() === 4001, `old copy hands its players over (close codes ${host.code()}, ${mate.code()})`);
  const late = client(8796, 'handover_late_01'); await late.ready; await sleep(400);
  check(late.code() === 4001, 'old copy turns away new connections');
  const again = client(8797, 'handover_mate_01'); await again.ready; await sleep(500);
  check(again.party()?.players?.some((p: any) => p.nickname === 'Ye Boi'), 'the player reconnects to the new copy and is still in the room');
  const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'state.json'), 'utf8'));
  check(Object.values<any>(saved.parties)[0]?.players && Object.values<any>(Object.values<any>(saved.parties)[0].players).length === 2, 'save file has both players');
  again.close(); a.kill(); b.kill();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nHANDOVER PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
