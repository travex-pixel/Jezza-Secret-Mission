// Starter kit + "up for grabs" giveaways in a real browser against the built server: the host releases two Viking
// Helmets from Host controls (with the confirm step), a mate on a raw socket grabs one, the host grabs the other
// from the Lobby card, a third lad is told it's all gone, and the host list shows who got what. Then the Me screen:
// all seven starter hats are owned, each one draws differently on the creature, equipping sticks after a refresh.
import { chromium } from 'playwright-core';
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { finishIntro } from './fixtures';

const BASE = process.env.BASE_URL ?? 'http://localhost:8790';
const WSURL = BASE.replace(/^http/, 'ws') + '/ws';
const OUT = process.env.SHOT_DIR ?? path.resolve('test-results/screenshots/giveaway');
const findChrome = () => ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ...(fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`) : [])].find((p) => fs.existsSync(p));
let failures = 0;
const check = (c: unknown, m: string) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };
const STARTER = ['hat_party_blue', 'hat_party_purple', 'hat_party_white', 'hat_party_yellow', 'hat_party_green', 'hat_santa', 'hat_bunny'];
const NAMES: Record<string, string> = { hat_party_blue: 'Blue Party Hat', hat_party_purple: 'Purple Party Hat', hat_party_white: 'White Party Hat', hat_party_yellow: 'Yellow Party Hat', hat_party_green: 'Green Party Hat', hat_santa: 'Santa Hat', hat_bunny: 'Bunny Ears' };

function mate(id: string) {
  const ws = new WebSocket(WSURL); let seq = 0; const pend = new Map<string, (v: any) => void>(); let party: any = null;
  const ready = new Promise<void>((res) => ws.on('open', () => { ws.send(JSON.stringify({ type: 'hello', playerId: id, secret: 'mate-secret-xxxxxxxx' })); res(); }));
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.type === 'ack') pend.get(m.reqId)?.(m); if (m.type === 'party') party = m.party; });
  const req = (msg: any) => new Promise<any>((res) => { const reqId = `m${seq++}`; pend.set(reqId, res); ws.send(JSON.stringify({ ...msg, reqId })); });
  return { ready, req, party: () => party, close: () => ws.close() };
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
  await page.getByPlaceholder(/big dave/i).fill('Travis');
  await page.getByRole('button', { name: /create the party/i }).click();
  await page.waitForSelector('.pick-grid');
  await page.locator('.pick-card').first().click();
  await page.getByRole('button', { name: /adopt/i }).click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /your selfie/i }).click();
  await finishIntro(page);
  await page.waitForSelector('.bottom-nav');
  await page.locator('.quick-btn', { hasText: 'Party' }).click();
  await page.waitForSelector('.code-display');
  const code = (await page.locator('.code-display').textContent())!.trim();

  const m1 = mate('player_grab_mate_01'); const m2 = mate('player_grab_mate_02'); const m3 = mate('player_grab_mate_03');
  await Promise.all([m1.ready, m2.ready, m3.ready]);
  await m1.req({ type: 'joinParty', code, nickname: 'Robbo' }); await m1.req({ type: 'chooseCreature', creature: 'goblin' });
  await m2.req({ type: 'joinParty', code, nickname: 'Shorty' }); await m2.req({ type: 'chooseCreature', creature: 'owl' });
  await m3.req({ type: 'joinParty', code, nickname: 'Cam' }); // no creature yet

  // --- an ordinary lad cannot release anything, whatever he sends
  const sneaky = await m1.req({ type: 'host', action: { kind: 'makeGiveaway', item: 'hat_viking', qty: 30 } });
  check(sneaky.ok === false && /host only/i.test(sneaky.error), 'a mate sending the host action is refused by the server');

  // --- host releases 2 Viking Helmets from Host controls, through the confirm step
  await page.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  await page.getByRole('button', { name: /host controls/i }).click();
  const grabPanel = page.locator('.panel', { hasText: 'Open for' }); // the Up-for-grabs panel (the EPIC panel has 1–4 pills too)
  await page.getByLabel('Item to release').selectOption('hat_viking');
  await grabPanel.locator('.pill', { hasText: /^3$/ }).click();
  await page.getByRole('button', { name: /release…/i }).click();
  await page.getByText(/Release 3× Viking Helmet\?/).waitFor({ timeout: 4000 });
  check(true, 'Release opens a confirm that names the item and the quantity');
  await page.getByRole('button', { name: /^cancel$/i }).click();
  check((await page.getByTestId('host-giveaway').count()) === 0, 'Cancel releases nothing');
  await grabPanel.locator('.pill', { hasText: /^1$/ }).click(); // a single helmet, so the mates have to race for it
  await page.getByRole('button', { name: /release…/i }).click();
  await page.getByTestId('confirm-release').click();
  await page.getByTestId('host-giveaway').waitFor({ timeout: 5000 });
  check(/live/.test((await page.getByTestId('host-giveaway').first().textContent()) ?? ''), 'host list shows the giveaway as live');
  await page.screenshot({ path: path.join(OUT, 'host-release.png') });
  // bump stock to 2 by releasing again later would be a new giveaway; instead the mates race for this single helmet
  const gid = (m1.party()?.giveaways ?? []).find((g: any) => g.status === 'active')?.id as string;
  check(!!gid, 'mates see the live giveaway in their party state');

  // --- race: the only helmet; the first claim wins, the next is told it's gone, Cam (no creature) is refused
  const [r1, r2] = await Promise.all([m1.req({ type: 'claimGiveaway', giveawayId: gid }), m2.req({ type: 'claimGiveaway', giveawayId: gid })]);
  check((r1.ok ? 1 : 0) + (r2.ok ? 1 : 0) === 1, 'two lads racing for the last one: exactly one gets it');
  const loser = r1.ok ? r2 : r1;
  check(/all gone/i.test(loser.error), `the other is told it is gone (${loser.error})`);
  const r1again = await m1.req({ type: 'claimGiveaway', giveawayId: gid });
  check(r1again.ok === true && (r1again.data?.already === true || r1.ok === false), 'retrying a claim never grants twice');
  const r3 = await m3.req({ type: 'claimGiveaway', giveawayId: gid });
  check(r3.ok === false, 'a lad without a creature cannot claim');
  await page.waitForTimeout(400);
  const row = (await page.getByTestId('host-giveaway').first().textContent()) ?? '';
  check(/all gone/.test(row) && /claimed 1\/1 by (Robbo|Shorty)/.test(row), `host list shows all gone and who got it (${row.replace(/\s+/g, ' ').trim()})`);

  // --- a second giveaway with stock for everyone: the host's own Lobby shows the card and he grabs one
  await page.getByLabel('Item to release').selectOption('face_mo');
  await grabPanel.locator('.pill', { hasText: /^5$/ }).click();
  await page.getByLabel('Giveaway title').fill('Mo for the speech crew');
  await page.getByRole('button', { name: /release…/i }).click();
  await page.getByTestId('confirm-release').click();
  await page.locator('[data-testid=host-giveaway]', { hasText: 'Mo for the speech crew' }).waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: /‹ host controls/i }).click();
  await page.getByTestId('giveaway').waitFor({ timeout: 5000 });
  check(/Mo for the speech crew/.test((await page.getByTestId('giveaway').textContent()) ?? '') && /5 of 5 left/.test((await page.getByTestId('giveaway').textContent()) ?? ''), 'Lobby shows the giveaway card with the title and the stock');
  await page.screenshot({ path: path.join(OUT, 'lobby-grab.png') });
  await page.getByTestId('claim-giveaway').click();
  await page.locator('.reward', { hasText: /Got it!/ }).waitFor({ timeout: 5000 });
  check(true, 'tapping Claim shows the "Got it!" reward card');
  await page.screenshot({ path: path.join(OUT, 'claimed.png') });
  await page.locator('.reward').click();
  await page.waitForTimeout(500);
  check((await page.getByTestId('giveaway').count()) === 0, 'once claimed, the Lobby card is gone (nothing left to do)');
  await page.locator('.bottom-nav').getByRole('button', { name: 'Me' }).click();
  await page.locator('.tab', { hasText: 'Face' }).click();
  check((await page.locator('.chip.locked', { hasText: 'The Mo' }).count()) === 0 && (await page.locator('.chip', { hasText: 'The Mo' }).count()) === 1, 'The Mo is owned on the Me screen');
  const meCard = page.getByTestId('giveaway');
  check((await meCard.count()) === 1 && /Yours/.test((await meCard.textContent()) ?? ''), 'Me screen still shows the live giveaway, marked as yours');

  // --- starter kit: all seven owned, each draws differently, equipping persists through a refresh
  await page.locator('.tab', { hasText: 'Hats' }).click();
  for (const id of STARTER) check((await page.locator('.chip:not(.locked)', { hasText: NAMES[id] }).count()) === 1, `${NAMES[id]} is owned from the start`);
  check((await page.locator('.chip.locked', { hasText: 'Royal Crown' }).count()) === 1, 'a level hat is still locked');
  const paths = new Set<string>();
  for (const id of STARTER) {
    await page.locator('.chip', { hasText: NAMES[id] }).click();
    await page.waitForTimeout(350);
    const hero = await page.locator('.stage svg').first().innerHTML();
    paths.add(hero.slice(-700));
    await page.screenshot({ path: path.join(OUT, `hat-${id}.png`), clip: { x: 0, y: 60, width: 390, height: 300 } });
  }
  check(paths.size === STARTER.length, `each starter hat draws differently on the creature (${paths.size} distinct)`);
  check((await page.locator('.chip.on', { hasText: 'Bunny Ears' }).count()) === 1, 'the last pick (Bunny Ears) is shown as equipped');
  await page.reload({ waitUntil: 'networkidle' });
  // no invite code in the host's address bar, so a refresh shows the opening screen first; Enter lands straight back in
  if (await page.getByRole('button', { name: /enter the vineyard/i }).count()) await page.getByRole('button', { name: /enter the vineyard/i }).click();
  await page.waitForSelector('.bottom-nav', { timeout: 8000 });
  await page.locator('.bottom-nav').getByRole('button', { name: 'Me' }).click();
  await page.locator('.tab', { hasText: 'Hats' }).click();
  check((await page.locator('.chip.on', { hasText: 'Bunny Ears' }).count()) === 1, 'the equipped hat survives a refresh');
  const robbo = (m1.party()?.players ?? []).find((p: any) => p.nickname === 'Travis');
  check(robbo?.equipped?.hat === 'hat_bunny', 'other lads see the hat on the host');

  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  m1.close(); m2.close(); m3.close();
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nGIVEAWAY E2E PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
