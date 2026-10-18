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
  await host.page.getByText(/Party →/).click();
  await host.page.waitForSelector('.code-display');
  const code = (await host.page.locator('.code-display').textContent())!.trim();
  check(/^[A-Z0-9]{4}$/.test(code), `host sees party code ${code}`);

  await mate.page.goto(`${BASE}/?p=${code}`, { waitUntil: 'networkidle' });
  await mate.page.getByRole('button', { name: /enter the vineyard/i }).click();
  check((await mate.page.locator('.input-code').inputValue()) === code, 'join link prefills the party code');
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

  // Host starts Friday from the lobby
  await host.page.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  await host.page.getByRole('button', { name: /start friday/i }).click();
  await mate.page.waitForTimeout(600);
  check((await mate.page.locator('.pill', { hasText: /Friday/ }).count()) > 0, 'mate sees the phase change to Friday');
  await mate.page.locator('.bottom-nav').getByRole('button', { name: 'Missions' }).click();
  await mate.page.waitForTimeout(300);
  check((await mate.page.locator('.mission-card').count()) >= 3, 'mate has a hand of missions after Friday starts');
  await mate.page.screenshot({ path: path.join(OUT, 'mate-missions.png') });

  // Battle: mate challenges host, host accepts
  await mate.page.locator('.bottom-nav').getByRole('button', { name: 'Battle' }).click();
  await mate.page.getByRole('button', { name: /challenge a mate/i }).click();
  await mate.page.locator('.sheet .list-row', { hasText: 'Jezza' }).click();
  await host.page.waitForSelector('.modal', { timeout: 8000 });
  check(true, 'host receives the challenge modal');
  await host.page.screenshot({ path: path.join(OUT, 'host-challenge.png') });
  await host.page.getByRole('button', { name: /accept/i }).click();
  await mate.page.waitForSelector('.actions', { timeout: 8000 });
  await host.page.waitForSelector('.actions', { timeout: 8000 });
  check(true, 'arena opens for both players');
  await mate.page.locator('.action-btn.attack').click();
  await host.page.getByText(/🔒 ready/).waitFor({ timeout: 5000 }).catch(() => undefined);
  check((await host.page.getByText(/🔒 ready/).count()) > 0, 'host sees the mate locked in (without the action)');
  await host.page.locator('.action-btn.special').click();
  let hpChanged = false;
  for (let i = 0; i < 30 && !hpChanged; i++) { await mate.page.waitForTimeout(250); const hp = await mate.page.locator('.hpcard').allTextContents(); hpChanged = hp.some((t) => !/(\d+)\/\1\b/.test(t)); }
  check(hpChanged, 'HP changed after the server resolved round 1');
  await mate.page.screenshot({ path: path.join(OUT, 'mate-battle.png') });
  await host.page.screenshot({ path: path.join(OUT, 'host-battle.png') });

  // Refresh survives
  await mate.page.reload({ waitUntil: 'networkidle' });
  await mate.page.getByRole('button', { name: /enter the vineyard/i }).click();
  await mate.page.waitForSelector('.bottom-nav', { timeout: 8000 });
  check(true, 'mate refreshes and lands straight back in the game (identity + party persisted)');
  await mate.page.locator('.bottom-nav').getByRole('button', { name: 'Battle' }).click();
  await mate.page.waitForSelector('.actions', { timeout: 8000 });
  check(true, 'live battle resumes after refresh');

  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nLIVE E2E PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
