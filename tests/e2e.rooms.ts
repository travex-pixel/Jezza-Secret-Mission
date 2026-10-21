// Two phones against a built server: share link (no code box), leave a test room,
// make a fresh room with a PIN, and take host back from a second phone using the PIN.
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import { finishIntro } from './fixtures';

const BASE = process.env.BASE_URL ?? 'http://localhost:8790';
const findChrome = () => ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ...(fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`) : [])].find((p) => fs.existsSync(p));
let failures = 0;
const check = (c: unknown, m: string) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };

async function onboard(page: Page) {
  await page.waitForSelector('.pick-grid');
  await page.locator('.pick-card').first().click();
  await page.getByRole('button', { name: /adopt/i }).click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /group selfie/i }).click();
  await finishIntro(page);
  await page.waitForSelector('.bottom-nav');
}
async function partyCode(page: Page) {
  await page.locator('.quick-btn', { hasText: 'Party' }).click();
  await page.waitForSelector('.code-display');
  return (await page.locator('.code-display').textContent())!.trim();
}

async function main() {
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const mk = async () => (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const phoneA = await mk(); const phoneB = await mk();
  const errors: string[] = []; for (const p of [phoneA, phoneB]) p.on('pageerror', (e) => errors.push(e.message));

  // Test room, then leave it
  await phoneA.goto(BASE, { waitUntil: 'networkidle' });
  await phoneA.getByRole('button', { name: /enter the vineyard/i }).click();
  await phoneA.getByRole('button', { name: /i'm the host/i }).click();
  await phoneA.getByPlaceholder(/big dave/i).fill('Travis');
  await phoneA.getByRole('button', { name: /create the party/i }).click();
  await onboard(phoneA);
  const testCode = await partyCode(phoneA);
  await phoneA.getByRole('button', { name: /leave this party/i }).click();
  await phoneA.locator('.modal').getByRole('button', { name: /^leave$/i }).click();
  await phoneA.waitForSelector('text=Who are you, legend?');
  check(true, `host left test room ${testCode} and is back on the join screen`);

  // Fresh room with a PIN
  await phoneA.getByRole('button', { name: /i'm the host/i }).click();
  await phoneA.getByPlaceholder(/big dave/i).fill('Travis');
  await phoneA.locator('input[type=password]').fill('4821');
  await phoneA.getByRole('button', { name: /create the party/i }).click();
  await onboard(phoneA); // a fresh room is a fresh start: new creature
  const code = await partyCode(phoneA);
  check(code !== testCode, `fresh room created (${code}) with a PIN`);

  // Phone B opens the share link: no code box
  await phoneB.goto(`${BASE}/?p=${code}`, { waitUntil: 'networkidle' });
  await phoneB.getByTestId('invite-line').waitFor();
  check((await phoneB.locator('.input-code').count()) === 0 && (await phoneB.getByRole('button', { name: /enter the vineyard/i }).count()) === 0, 'share link opens the invite screen straight away, no code box');
  await phoneB.getByPlaceholder(/big dave/i).fill('Tommo');
  await phoneB.getByRole('button', { name: /i'm in/i }).click();
  await onboard(phoneB);
  check(true, 'mate joined from the link by typing only a nickname');

  // Wrong PIN gets reported to the host
  await phoneB.locator('.quick-btn', { hasText: 'Party' }).click();
  await phoneB.getByRole('button', { name: /claim host/i }).click();
  await phoneB.locator('.modal input').fill('0000');
  await phoneB.locator('.modal').getByRole('button', { name: /^claim$/i }).click();
  await phoneB.getByText('Wrong PIN.').waitFor({ timeout: 4000 });
  await phoneA.getByText(/tried the host PIN/).waitFor({ timeout: 4000 });
  check(true, 'wrong PIN rejected and the host was told');
  // Right PIN moves host
  await phoneB.locator('.modal input').fill('4821');
  await phoneB.locator('.modal').getByRole('button', { name: /^claim$/i }).click();
  await phoneB.getByText('‹ Host controls').waitFor({ timeout: 4000 });
  check(true, 'right PIN: second phone lands in Host controls');
  await phoneA.getByText(/took over as host/).waitFor({ timeout: 4000 });
  await phoneA.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  check((await phoneA.getByRole('button', { name: /host controls/i }).count()) === 0, 'old phone no longer has host controls');

  // The real party: a new host makes a brand-new room, and a tester still in the old room opens its link
  const phoneC = await mk(); phoneC.on('pageerror', (e) => errors.push(e.message));
  await phoneC.goto(BASE, { waitUntil: 'networkidle' });
  await phoneC.getByRole('button', { name: /enter the vineyard/i }).click();
  await phoneC.getByRole('button', { name: /i'm the host/i }).click();
  await phoneC.getByPlaceholder(/big dave/i).fill('Nath');
  await phoneC.getByRole('button', { name: /create the party/i }).click();
  await onboard(phoneC);
  const realCode = await partyCode(phoneC);
  await phoneB.goto(`${BASE}/?p=${realCode}`, { waitUntil: 'networkidle' });
  await phoneB.getByTestId('invite-line').waitFor({ timeout: 6000 }).catch(() => undefined);
  await phoneB.waitForTimeout(800); // give the old party's update time to arrive and (wrongly) win
  check((await phoneB.getByTestId('invite-line').count()) === 1, 'a tester still in an old party who opens the new link gets the new invite, not the old party');
  check(new RegExp(code).test((await phoneB.getByTestId('invite-old').textContent().catch(() => '')) ?? ''), 'the invite says which party they are leaving');
  await phoneB.getByPlaceholder(/big dave/i).fill('Tommo');
  await phoneB.getByRole('button', { name: /i'm in/i }).click().catch(() => undefined);
  await onboard(phoneB).catch(() => undefined);
  check((await partyCode(phoneB).catch(() => '')) === realCode, `the tester is now in the new party ${realCode} with a fresh creature`);
  await phoneC.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  await phoneC.locator('.quick-btn', { hasText: 'Party' }).click();
  check((await phoneC.locator('.list-row', { hasText: 'Tommo' }).count()) > 0, 'the new host sees the tester arrive');
  // ...and if they later tap the old test link in the group chat, they can stay where they are
  await phoneB.goto(`${BASE}/?p=${code}`, { waitUntil: 'networkidle' });
  await phoneB.getByTestId('invite-old').waitFor({ timeout: 6000 });
  await phoneB.getByRole('button', { name: new RegExp(`stay in ${realCode}`, 'i') }).click();
  await phoneB.waitForSelector('.bottom-nav');
  check((await partyCode(phoneB)) === realCode && phoneB.url().includes(`p=${realCode}`), 'an old link offers "Stay in" and keeps them in the real party');
  await phoneB.reload({ waitUntil: 'networkidle' });
  await phoneB.waitForSelector('.bottom-nav', { timeout: 8000 });
  check((await phoneB.getByTestId('invite-line').count()) === 0, 'a refresh after that stays in the real party');

  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nROOMS E2E PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
