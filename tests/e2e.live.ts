// Live multiplayer end-to-end in two separate browser sessions against the built
// server: host creates a party, a mate joins by link, both adopt creatures, the
// host starts Friday, the mate challenges, the host accepts, a round resolves,
// then the mate refreshes and lands back in the game with state intact.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:8790';
const OUT = process.env.SHOT_DIR ?? path.resolve('test-results/screenshots/live');
const findChrome = () => ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ...(fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`) : [])].find((p) => fs.existsSync(p));
let failures = 0;
const check = (c: unknown, m: string) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const mk = async () => { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const page = await ctx.newPage(); return { ctx, page }; };
  const host = await mk(); const mate = await mk();

  await host.page.goto(BASE, { waitUntil: 'networkidle' });
  await host.page.getByRole('button', { name: /enter the vineyard/i }).click();
  await host.page.getByRole('button', { name: /i'm the host/i }).click();
  await host.page.getByPlaceholder(/big dave/i).fill('Jezza');
  await host.page.getByRole('button', { name: /create the party/i }).click();
  await host.page.waitForSelector('.pick-grid');
  await host.page.locator('.pick-card').first().click();
  await host.page.getByRole('button', { name: /adopt/i }).click();
  await host.page.waitForTimeout(2000);
  await host.page.getByRole('button', { name: /first mission/i }).click();
  await host.page.getByRole('button', { name: /skip for now/i }).click();
  await host.page.waitForSelector('.bottom-nav');
  await host.page.locator('.quick-btn', { hasText: 'Party' }).click();
  await host.page.waitForSelector('.code-display');
  const code = (await host.page.locator('.code-display').textContent())!.trim();
  check(/^[A-Z0-9]{4}$/.test(code), `host sees party code ${code}`);

  await mate.page.goto(`${BASE}/?p=${code}`, { waitUntil: 'networkidle' });
  await mate.page.getByRole('button', { name: /enter the vineyard/i }).click();
  check((await mate.page.getByText(`Joining party ${code}`).count()) === 1 && (await mate.page.locator('.input-code').count()) === 0, 'join link carries the party code (no code box to fill)');
  await mate.page.getByPlaceholder(/big dave/i).fill('Tommo');
  await mate.page.getByRole('button', { name: /join the legends/i }).click();
  await mate.page.waitForSelector('.pick-grid');
  await mate.page.locator('.pick-card').nth(2).click();
  await mate.page.getByRole('button', { name: /adopt/i }).click();
  await mate.page.waitForTimeout(2000);
  await mate.page.getByRole('button', { name: /first mission/i }).click();
  await mate.page.getByRole('button', { name: /i did it/i }).click();
  await mate.page.waitForSelector('.reward');
  await mate.page.locator('.reward').click();
  await mate.page.waitForSelector('.bottom-nav');

  await host.page.waitForTimeout(500);
  check((await host.page.locator('.list-row', { hasText: 'Tommo' }).count()) > 0, 'host sees Tommo in the roster in real time');
  await host.page.screenshot({ path: path.join(OUT, 'host-party.png') });

  // No host step needed: Friday is already live
  await host.page.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  check((await mate.page.locator('.pill', { hasText: /Friday/ }).count()) > 0, 'Friday is live for the mate without the host doing anything');
  await mate.page.locator('.bottom-nav').getByRole('button', { name: 'Missions' }).click();
  await mate.page.waitForTimeout(300);
  check((await mate.page.locator('.mission-card').count()) >= 3, 'mate has a hand of challenges');
  await mate.page.screenshot({ path: path.join(OUT, 'mate-missions.png') });

  // Battle: mate challenges host, host accepts
  await mate.page.locator('.bottom-nav').getByRole('button', { name: 'Battle' }).click();
  await mate.page.getByRole('button', { name: /challenge a mate/i }).click();
  await mate.page.locator('.sheet .list-row', { hasText: 'Jezza' }).click();
  await host.page.waitForSelector('.modal', { timeout: 8000 });
  check(true, 'host receives the challenge modal');
  await host.page.screenshot({ path: path.join(OUT, 'host-challenge.png') });
  await host.page.getByRole('button', { name: /accept/i }).click();
  await mate.page.waitForSelector('.plans', { timeout: 8000 });
  await host.page.waitForSelector('.plans', { timeout: 8000 });
  check(true, 'quick battle: both get the game-plan picker');
  await mate.page.screenshot({ path: path.join(OUT, 'mate-plan.png') });
  // Refresh mid-battle survives
  await mate.page.reload({ waitUntil: 'networkidle' });
  await mate.page.getByRole('button', { name: /enter the vineyard/i }).click();
  await mate.page.waitForSelector('.bottom-nav', { timeout: 8000 });
  check(true, 'mate refreshes and lands straight back in the game (identity + party persisted)');
  await mate.page.locator('.bottom-nav').getByRole('button', { name: 'Battle' }).click();
  await mate.page.waitForSelector('.plans', { timeout: 8000 });
  check(true, 'the battle resumes after refresh');
  // Mate: plan + charge-up tap
  await mate.page.locator('.plan-btn.plan-aggro').click();
  await mate.page.waitForSelector('.pt-screen', { timeout: 3000 });
  await mate.page.waitForTimeout(650);
  await mate.page.locator('.pt-screen').click({ position: { x: 20, y: 300 } });
  await mate.page.getByText(/locked in/).first().waitFor({ timeout: 5000 });
  await host.page.getByText(/🔒 ready/).waitFor({ timeout: 5000 }).catch(() => undefined);
  check((await host.page.getByText(/🔒 ready/).count()) > 0, 'host sees the mate locked in (without the plan)');
  // Host: plan + charge-up tap → the fight plays itself for both
  await host.page.locator('.plan-btn.plan-sneaky').click();
  await host.page.waitForSelector('.pt-screen', { timeout: 3000 });
  await host.page.waitForTimeout(650);
  await host.page.locator('.pt-screen').click({ position: { x: 20, y: 300 } });
  await mate.page.getByRole('button', { name: /skip/i }).waitFor({ timeout: 8000 });
  check(true, 'both locked in: the fight starts playing straight away');
  let hpChanged = false;
  for (let i = 0; i < 40 && !hpChanged; i++) { await mate.page.waitForTimeout(250); const hp = await mate.page.locator('.hpcard').allTextContents(); hpChanged = hp.some((t) => !/(\d+)\/\1\b/.test(t)); }
  check(hpChanged, 'HP drops as the fight plays out');
  await mate.page.screenshot({ path: path.join(OUT, 'mate-battle.png') });
  await mate.page.getByText(/^(VICTORY|DEFEATED)$/).waitFor({ timeout: 25000 });
  await host.page.getByText(/^(VICTORY|DEFEATED)$/).waitFor({ timeout: 25000 });
  const mateWon = (await mate.page.getByText(/^VICTORY$/).count()) === 1; const hostWon = (await host.page.getByText(/^VICTORY$/).count()) === 1;
  check(mateWon !== hostWon, `exactly one winner (${mateWon ? 'mate' : 'host'}), same result on both phones`);
  await host.page.screenshot({ path: path.join(OUT, 'host-battle.png') });

  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nLIVE E2E PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
