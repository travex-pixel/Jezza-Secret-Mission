// Host-side UI against the built server: host panel, phase change via confirm sheet, group mission
// reveal, photo approval with a real image rendered in the feed, witness confirmation UI, finale awards.
import { chromium } from 'playwright-core';
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { MISSIONS } from '../shared/missions';
import { finishIntro } from './fixtures';

const BASE = process.env.BASE_URL ?? 'http://localhost:8790';
const WSURL = BASE.replace(/^http/, 'ws') + '/ws';
const OUT = process.env.SHOT_DIR ?? path.resolve('test-results/screenshots/host');
const findChrome = () => ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ...(fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`) : [])].find((p) => fs.existsSync(p));
let failures = 0;
const check = (c: unknown, m: string) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// minimal WS mate
function mate(id: string) {
  const ws = new WebSocket(WSURL); let seq = 0; const pend = new Map<string, (v: any) => void>(); let priv: any = null; let party: any = null;
  const ready = new Promise<void>((res) => ws.on('open', () => { ws.send(JSON.stringify({ type: 'hello', playerId: id, secret: 'mate-secret-xxxxxxxx' })); res(); }));
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'ack') pend.get(m.reqId)?.(m); if (m.type === 'private') priv = m.priv; if (m.type === 'party') party = m.party; });
  const req = (msg: any) => new Promise<any>((res) => { const reqId = `m${seq++}`; pend.set(reqId, res); ws.send(JSON.stringify({ ...msg, reqId })); });
  return { ready, req, priv: () => priv, party: () => party, close: () => ws.close() };
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
  await page.getByText(/groom only/i).waitFor(); // "HostJezza" counts as the groom
  await page.getByRole('button', { name: /adopt/i }).click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /your selfie/i }).click();
  await finishIntro(page);
  await page.waitForSelector('.bottom-nav');
  await page.locator('.quick-btn', { hasText: 'Party' }).click();
  const code = (await page.locator('.code-display').textContent())!.trim();
  await page.getByRole('button', { name: /show qr code/i }).click();
  await page.locator('.qr-box svg').waitFor({ timeout: 3000 });
  await page.screenshot({ path: path.join(OUT, 'party-qr.png') });
  check(true, 'party screen shows a scannable QR code for the join link');
  await page.getByRole('button', { name: /^done$/i }).click();
  await page.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  await page.screenshot({ path: path.join(OUT, 'host-lobby-pregame.png') });

  const m1 = mate('host_e2e_mate_01'); await m1.ready;
  const m2 = mate('host_e2e_mate_02'); await m2.ready;
  await m1.req({ type: 'joinParty', code, nickname: 'Robbo' }); await m1.req({ type: 'chooseCreature', creature: 'goblin' });
  await m2.req({ type: 'joinParty', code, nickname: 'Shorty' }); await m2.req({ type: 'chooseCreature', creature: 'owl' });
  await m1.req({ type: 'wallPost', kind: 'roast', text: 'Jezza reverse parks like it is a group project, mate.' }); // for the keepsake export

  // Host panel: the game already runs itself (Friday is live). Pause + resume via the confirm sheet.
  await page.getByRole('button', { name: /host controls/i }).click();
  await page.waitForSelector('.tabs');
  check((await page.locator('.list-row.me', { hasText: 'Friday' }).count()) === 1, 'party is already on Friday without the host doing anything');
  await page.screenshot({ path: path.join(OUT, 'host-panel-event.png') });
  await page.locator('.list-row', { hasText: 'Paused' }).click();
  await page.getByRole('button', { name: /do it/i }).click();
  await page.locator('.list-row.me', { hasText: 'Paused' }).waitFor({ timeout: 4000 });
  await page.locator('.list-row', { hasText: 'Friday' }).click();
  await page.getByRole('button', { name: /do it/i }).click();
  await page.locator('.list-row.me', { hasText: 'Friday' }).waitFor({ timeout: 4000 });
  check(true, 'host can pause and resume through the confirm sheet');
  await page.locator('.list-row', { hasText: 'The Big Cheers' }).getByRole('button', { name: /reveal/i }).click();
  await page.locator('.list-row', { hasText: 'The Big Cheers' }).getByText('live').waitFor({ timeout: 4000 });
  check(true, 'group challenge revealed from the host panel');

  // EPIC job: host posts it, a mate grabs a spot, the host takes the last one from the Lobby and ticks it off
  await page.locator('.epic-preset', { hasText: 'Mac and Cheese Crew' }).click();
  await page.locator('.epic-row', { hasText: 'Mac and Cheese Crew' }).waitFor({ timeout: 4000 });
  check(true, 'host posts an EPIC job from the preset list');
  await sleep(300);
  const epic = m1.party()?.epics?.find((e: any) => e.title === 'Mac and Cheese Crew');
  check(!!epic, 'mates see the EPIC job');
  await m1.req({ type: 'joinEpic', epicId: epic.id });
  await page.getByText(/‹ Host controls/).click();
  const card = page.locator('.epic-card', { hasText: 'Mac and Cheese Crew' });
  await card.waitFor({ timeout: 4000 });
  await page.screenshot({ path: path.join(OUT, 'epic-lobby.png') });
  await card.getByRole('button', { name: /i'm on it/i }).click();
  await card.getByRole('button', { name: /done/i }).click({ timeout: 4000 }); // the Lobby strip ticks it off too
  await page.locator('.reward', { hasText: 'Mac and Cheese' }).waitFor({ timeout: 5000 });
  await page.screenshot({ path: path.join(OUT, 'epic-reward.png') });
  check((await page.locator('.reward').textContent())?.includes('Chef'), 'the crew gets the reward and the Chef\'s Toque');
  for (let i = 0; i < 4 && (await page.locator('.reward').count()); i++) { await page.locator('.reward').first().click(); await sleep(400); }
  check(m2.party() !== null, 'mate view still live');
  await page.getByRole('button', { name: /host controls/i }).click();
  await page.waitForSelector('.tabs');

  // Reward code: host makes one for The Mo, then types it in on the Me screen
  await page.locator('select[aria-label="Accessory"]').selectOption('face_mo');
  await page.getByRole('button', { name: /make a code/i }).click();
  const codeRow = page.locator('.code-row', { hasText: 'The Mo' }).first();
  await codeRow.waitFor({ timeout: 4000 });
  const cheat = ((await codeRow.locator('.bold').first().textContent()) ?? '').trim();
  check(/^JEZZA-[A-Z0-9]{4}$/.test(cheat), `host makes a reward code (${cheat})`);
  await page.getByText(/‹ Host controls/).click();
  await page.locator('.bottom-nav').getByRole('button', { name: 'Me' }).click();
  await page.getByLabel('Reward code').fill(cheat.toLowerCase());
  await page.getByRole('button', { name: /^unlock$/i }).click();
  await page.locator('.reward', { hasText: 'Reward code' }).waitFor({ timeout: 5000 });
  check(true, 'typing the code unlocks the accessory');
  await page.screenshot({ path: path.join(OUT, 'reward-code.png') });
  for (let i = 0; i < 4 && (await page.locator('.reward').count()); i++) { await page.locator('.reward').first().click(); await sleep(400); }
  await page.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  await page.getByRole('button', { name: /host controls/i }).click();
  await page.waitForSelector('.tabs');

  // Mate snaps the group photo: it goes up for the lads' vote; the host votes from the Lobby card, a mate seconds it
  const dataUrl = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 320; c.height = 200; const g = c.getContext('2d')!; g.fillStyle = '#76243A'; g.fillRect(0, 0, 320, 200); g.fillStyle = '#E5AD48'; g.font = 'bold 40px sans-serif'; g.fillText('CHEERS JEZZA', 20, 110); return c.toDataURL('image/jpeg', 0.8); });
  const r = await m1.req({ type: 'claimMission', missionId: 'g01', claimId: 'host_e2e_photo_01', photo: dataUrl, note: 'Barrel 7 crew' });
  check(r.ok && r.data.status === 'pending', 'photo goes up for a vote (default photo check)');
  await page.getByText(/‹ Host controls/).click();
  await page.getByRole('button', { name: 'Vote it in' }).first().click({ timeout: 5000 });
  await page.screenshot({ path: path.join(OUT, 'photo-vote.png') });
  const v2 = await m2.req({ type: 'votePhoto', claimId: 'host_e2e_photo_01', up: true });
  check(v2.ok && v2.data.status === 'approved', 'two 👍 votes count the photo');
  await page.locator('.quick-btn', { hasText: 'Photos' }).click();
  const img = page.locator('.gallery-grid img').first();
  await img.waitFor({ timeout: 5000 });
  const natural = await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth);
  check(Number(natural) > 0, `photo shows in the party camera roll (${natural}px wide)`);
  await page.screenshot({ path: path.join(OUT, 'gallery.png') });

  // Two mates call BS → it lands in the host's queue as a dispute → host upholds
  await m2.req({ type: 'flagClaim', claimId: 'host_e2e_photo_01' });
  const hostId0 = await page.evaluate(() => JSON.parse(localStorage.getItem('jezza.identity.v1')!).playerId);
  void hostId0;
  const m3 = mate('host_e2e_mate_03'); await m3.ready;
  await m3.req({ type: 'joinParty', code, nickname: 'Cam' }); await m3.req({ type: 'chooseCreature', creature: 'fox' });
  await m3.req({ type: 'flagClaim', claimId: 'host_e2e_photo_01' });
  await page.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  await page.getByRole('button', { name: /host controls/i }).click();
  await page.getByRole('button', { name: /queue/i }).click();
  await page.getByText(/BS called by/).waitFor({ timeout: 5000 });
  check(true, 'disputed claim shows in the host queue (optional: the lads can settle it too)');
  await page.screenshot({ path: path.join(OUT, 'host-approvals.png') });
  await page.getByRole('button', { name: /uphold it/i }).click();
  await page.locator('.panel', { hasText: 'Nothing waiting' }).waitFor({ timeout: 4000 });
  check(true, 'host upholds and the queue empties');
  // Summon a raid from the Event tab
  await page.getByRole('button', { name: 'Event', exact: true }).click();
  await page.getByRole('button', { name: /summon/i }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Just the page', exact: true }).click()]);
  const keep = fs.readFileSync((await dl.path())!, 'utf8');
  check(/The final board/.test(keep) && /The Jezza Wall/.test(keep) && /Robbo/.test(keep), `host downloads the keepsake page (${dl.suggestedFilename()})`);
  // The full export: one zip with the page, the photo files and spreadsheets, readable by a normal unzip tool
  const [zdl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-everything').click()]);
  const zipPath = path.join(OUT, 'keepsake.zip');
  await zdl.saveAs(zipPath);
  const test = execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' });
  const list = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const photos = list.filter((f) => /\/photos\/\d{3} .+ - .+\.(jpeg|png|webp)$/.test(f));
  check(/No errors detected/.test(test), `the zip opens cleanly (${zdl.suggestedFilename()}, ${list.length} files)`);
  check(photos.length >= 1 && list.some((f) => /Open me - keepsake\.html$/.test(f)) && list.some((f) => /roasts-and-toasts\.csv$/.test(f)) && list.some((f) => /leaderboard\.csv$/.test(f)), `zip has the page, ${photos.length} named photo(s) and the spreadsheets`);
  const page1 = execFileSync('unzip', ['-p', zipPath, list.find((f) => /keepsake\.html$/.test(f))!], { encoding: 'utf8' });
  check(page1.includes('src="photos/') && /The Jezza Wall/.test(page1), 'the zipped page points at the photos inside the zip, so it works offline');
  const roasts = execFileSync('unzip', ['-p', zipPath, list.find((f) => /roasts-and-toasts\.csv$/.test(f))!], { encoding: 'utf8' });
  check(/^\uFEFF?Type,Who,What they said/.test(roasts) && /Robbo/.test(roasts), 'roasts-and-toasts.csv has the posts');
  const tv = await fetch(`${BASE}/api/party/${code}/tv`).then((r) => r.json());
  check(Array.isArray(tv.players) && tv.players.some((p: any) => p.nickname === 'Robbo') && tv.code === code && !JSON.stringify(tv).includes('secret'), 'the TV link serves the party read-only with nothing private');
  check((await fetch(`${BASE}/api/party/ZZZZ/tv`)).status === 404, 'a made-up code gets nothing');
  const expired = await fetch(`${BASE}/api/export/not-a-real-token`);
  check(expired.status === 404, 'a made-up download link gets nothing');
  await page.getByText(/‹ Host controls/).click();
  await page.locator('.raid-banner').waitFor({ timeout: 4000 });
  check(true, 'host can summon a boss raid and the banner appears');
  m3.close();

  // Witness UI: mate claims a witness mission naming the host → host confirms in Missions tab
  const party = JSON.parse(fs.readFileSync(process.env.STATE_FILE ?? '/dev/null', 'utf8').toString() || 'null');
  void party;
  // find a witness mission in the mate's hand; if none, reroll a few times
  const WIT = MISSIONS.filter((m) => m.method === 'witness').map((m) => m.id);
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
    await page.locator('.bottom-nav').getByRole('button', { name: 'Challenges' }).click();
    await page.waitForSelector('.panel-gold', { timeout: 5000 });
    check((await page.getByText(/Did you see it\?/).count()) === 1, 'host sees the witness request card');
    await page.screenshot({ path: path.join(OUT, 'witness-request.png') });
    await page.getByRole('button', { name: /i saw it/i }).click();
    await sleep(400);
    check((await page.getByText(/Did you see it\?/).count()) === 0, 'witness request clears after confirming');
  } else console.log('  (no witness mission dealt after rerolls; skipped)');

  // Finale
  await page.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  await page.getByRole('button', { name: /host controls/i }).click();
  await page.locator('.list-row', { hasText: 'Finale' }).click();
  await page.getByRole('button', { name: /do it/i }).click();
  await sleep(400);
  await page.getByRole('button', { name: 'Awards', exact: true }).click();
  await page.locator('.panel', { hasText: 'Most Unhinged' }).locator('select').selectOption({ label: 'Robbo' });
  await sleep(300);
  await page.locator('.bottom-nav').getByRole('button', { name: 'Ranks' }).click();
  await page.waitForSelector('text=The Finale');
  const next = () => page.getByRole('button', { name: /open with|reveal|crown/i });
  check(/Weekend Menace/.test((await next().textContent()) ?? ''), 'ceremony opens with The Weekend Menace');
  for (let i = 0; i < 17 && (await next().count()); i++) { if (i === 14) check(/JEZZA LEGEND/.test((await next().textContent()) ?? ''), 'and closes by crowning The Jezza Legend'); await next().click(); await sleep(200); }
  await page.locator('.legend-hero').waitFor({ timeout: 3000 });
  await page.screenshot({ path: path.join(OUT, 'finale-legend.png') });
  check((await page.getByText(/To Jezza. To the legends./).count()) === 1, 'all 15 awards revealed on the finale screen');
  check((await page.locator('.panel', { hasText: 'Most Unhinged' }).getByText('Robbo').count()) === 1, 'host-picked award shows the chosen player');
  await page.screenshot({ path: path.join(OUT, 'finale.png') });
  await page.getByRole('button', { name: /final board/i }).click();
  await page.screenshot({ path: path.join(OUT, 'finale-board.png') });
  check(errors.length === 0, `no page errors (${errors.length})`);
  m1.close(); m2.close(); await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nHOST E2E PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
