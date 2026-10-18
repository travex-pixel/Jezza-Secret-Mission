// Host-side UI against the built server: host panel, phase change via confirm sheet, group mission
// reveal, photo approval with a real image rendered in the feed, witness confirmation UI, finale awards.
import { chromium } from 'playwright-core';
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:8790';
const WSURL = BASE.replace(/^http/, 'ws') + '/ws';
const OUT = process.env.SHOT_DIR ?? path.resolve('test-results/screenshots/host');
const findChrome = () => ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ...(fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`) : [])].find((p) => fs.existsSync(p));
let failures = 0;
const check = (c: unknown, m: string) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// minimal WS mate
function mate(id: string) {
  const ws = new WebSocket(WSURL); let seq = 0; const pend = new Map<string, (v: any) => void>(); let priv: any = null;
  const ready = new Promise<void>((res) => ws.on('open', () => { ws.send(JSON.stringify({ type: 'hello', playerId: id, secret: 'mate-secret-xxxxxxxx' })); res(); }));
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'ack') pend.get(m.reqId)?.(m); if (m.type === 'private') priv = m.priv; });
  const req = (msg: any) => new Promise<any>((res) => { const reqId = `m${seq++}`; pend.set(reqId, res); ws.send(JSON.stringify({ ...msg, reqId })); });
  return { ready, req, priv: () => priv, close: () => ws.close() };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /enter the vineyard/i }).click();
  await page.getByRole('button', { name: /i'm the host/i }).click();
  await page.getByPlaceholder(/big dave/i).fill('HostJezza');
  await page.getByRole('button', { name: /create the party/i }).click();
  await page.waitForSelector('.pick-grid');
  await page.locator('.pick-card').first().click();
  await page.getByRole('button', { name: /adopt/i }).click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /first mission/i }).click();
  await page.getByRole('button', { name: /skip for now/i }).click();
  await page.waitForSelector('.bottom-nav');
  await page.getByText(/Party →/).click();
  const code = (await page.locator('.code-display').textContent())!.trim();
  await page.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  await page.screenshot({ path: path.join(OUT, 'host-lobby-pregame.png') });

  const m1 = mate('host_e2e_mate_01'); await m1.ready;
  const m2 = mate('host_e2e_mate_02'); await m2.ready;
  await m1.req({ type: 'joinParty', code, nickname: 'Robbo' }); await m1.req({ type: 'chooseCreature', creature: 'goblin' });
  await m2.req({ type: 'joinParty', code, nickname: 'Shorty' }); await m2.req({ type: 'chooseCreature', creature: 'owl' });

  // Host panel → Event → Friday via confirm sheet
  await page.getByRole('button', { name: /host controls/i }).click();
  await page.waitForSelector('.tabs');
  await page.screenshot({ path: path.join(OUT, 'host-panel-event.png') });
  await page.locator('.list-row', { hasText: 'Friday' }).click();
  await page.getByRole('button', { name: /do it/i }).click();
  await sleep(500);
  check((await page.locator('.list-row.me', { hasText: 'Friday' }).count()) === 1, 'host moved the phase to Friday via the confirm sheet');
  await page.locator('.list-row', { hasText: 'The Cellar Ceremony' }).getByRole('button', { name: /reveal/i }).click();
  await sleep(400);
  check((await page.locator('.list-row', { hasText: 'The Cellar Ceremony' }).getByText('live').count()) === 1, 'group mission revealed from the host panel');

  // Mate submits a photo for the group mission (photo method) → approvals tab
  const png = fs.readFileSync(path.resolve('client/public/favicon.svg')).toString('base64');
  // use a real JPEG-ish payload: generate a tiny PNG via canvas in the page
  const dataUrl = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 320; c.height = 200; const g = c.getContext('2d')!; g.fillStyle = '#76243A'; g.fillRect(0, 0, 320, 200); g.fillStyle = '#E5AD48'; g.font = 'bold 40px sans-serif'; g.fillText('CHEERS JEZZA', 20, 110); return c.toDataURL('image/jpeg', 0.8); });
  void png;
  const r = await m1.req({ type: 'claimMission', missionId: 'm050', claimId: 'host_e2e_photo_01', photo: dataUrl, note: 'Barrel 7 crew' });
  check(r.ok && r.data.status === 'pending', 'mate photo claim is pending');
  await sleep(500);
  await page.getByRole('button', { name: /queue/i }).click();
  await page.waitForSelector('img[alt="Proof"]');
  check(true, 'host sees the submitted photo in the approvals queue');
  await page.screenshot({ path: path.join(OUT, 'host-approvals.png') });
  await page.getByRole('button', { name: /approve \+/i }).click();
  await sleep(500);
  check((await page.locator('.panel', { hasText: 'Nothing waiting' }).count()) === 1, 'approval queue empties after approving');
  await page.getByText(/‹ Host controls/).click();
  await page.getByText(/Party →/).click();
  await page.getByRole('button', { name: /live feed/i }).click();
  const img = page.locator('.feed-item img').first();
  await img.waitFor({ timeout: 5000 });
  const natural = await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth);
  check(Number(natural) > 0, `approved photo renders in the live feed (${natural}px wide)`);
  await page.screenshot({ path: path.join(OUT, 'feed-with-photo.png') });

  // Witness UI: mate claims a witness mission naming the host → host confirms in Missions tab
  const party = JSON.parse(fs.readFileSync(process.env.STATE_FILE ?? '/dev/null', 'utf8').toString() || 'null');
  void party;
  // find a witness mission in the mate's hand; if none, reroll a few times
  const WIT = ['m010', 'm011', 'm015', 'm020', 'm040', 'm046', 'm083', 'm093', 'm100', 'm102', 'm105'];
  let wid: string | undefined;
  for (let i = 0; i < 4 && !wid; i++) {
    await sleep(200);
    const hand = (m2.priv()?.hand ?? []).filter((h: any) => h.status === 'active');
    wid = hand.find((h: any) => WIT.includes(h.missionId))?.missionId;
    if (!wid && hand[i % hand.length]) await m2.req({ type: 'rerollMission', missionId: hand[i % hand.length].missionId });
  }
  if (wid) {
    const hostId = await page.evaluate(() => JSON.parse(localStorage.getItem('jezza.identity.v1')!).playerId);
    await m2.req({ type: 'claimMission', missionId: wid, claimId: 'host_e2e_wit_01', witnessId: hostId });
    await page.locator('.bottom-nav').getByRole('button', { name: 'Missions' }).click();
    await page.waitForSelector('.panel-gold', { timeout: 5000 });
    check((await page.getByText(/Witness request/).count()) === 1, 'host sees the witness request card');
    await page.screenshot({ path: path.join(OUT, 'witness-request.png') });
    await page.getByRole('button', { name: /i saw it/i }).click();
    await sleep(400);
    check((await page.getByText(/Witness request/).count()) === 0, 'witness request clears after confirming');
  } else console.log('  (no witness mission dealt after rerolls; skipped)');

  // Finale
  await page.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  await page.getByRole('button', { name: /host controls/i }).click();
  await page.locator('.list-row', { hasText: 'Finale' }).click();
  await page.getByRole('button', { name: /do it/i }).click();
  await sleep(400);
  await page.getByRole('button', { name: 'Awards', exact: true }).click();
  await page.locator('.panel', { hasText: 'Most Unhinged Strategy' }).locator('select').selectOption({ label: 'Robbo' });
  await sleep(300);
  await page.locator('.bottom-nav').getByRole('button', { name: 'Ranks' }).click();
  await page.waitForSelector('text=The Finale');
  for (let i = 0; i < 10; i++) { await page.getByRole('button', { name: /reveal/i }).click(); await sleep(250); }
  check((await page.getByText(/To Jezza. To the legends./).count()) === 1, 'all ten awards revealed on the finale screen');
  check((await page.locator('.panel', { hasText: 'Most Unhinged Strategy' }).getByText('Robbo').count()) === 1, 'host-picked award shows the chosen player');
  await page.screenshot({ path: path.join(OUT, 'finale.png') });
  await page.getByRole('button', { name: /final board/i }).click();
  await page.screenshot({ path: path.join(OUT, 'finale-board.png') });
  check(errors.length === 0, `no page errors (${errors.length})`);
  m1.close(); m2.close(); await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nHOST E2E PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
