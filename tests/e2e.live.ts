// Live multiplayer end-to-end in two separate browser sessions against the built
// server: host creates a party, a mate joins by link, both adopt creatures, the
// host starts Friday, the mate challenges, the host accepts, a round resolves,
// then the mate refreshes and lands back in the game with state intact.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { SELFIE_FILE, finishIntro } from './fixtures';

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
  // "Jezza" is the groom: no choice of creature, he gets the Golden Stag
  await host.page.getByText(/groom only/i).waitFor();
  check((await host.page.locator('.pick-grid').count()) === 0 && (await host.page.getByText('Golden Stag').count()) > 0, 'the groom is offered only the Golden Stag');
  await host.page.getByRole('button', { name: /adopt goldhorn/i }).click();
  await host.page.waitForTimeout(2000);
  await host.page.getByRole('button', { name: /group selfie/i }).click();
  await finishIntro(host.page);
  await host.page.waitForSelector('.bottom-nav');
  await host.page.locator('.quick-btn', { hasText: 'Party' }).click();
  await host.page.waitForSelector('.code-display');
  const code = (await host.page.locator('.code-display').textContent())!.trim();
  check(/^[A-Z0-9]{4}$/.test(code), `host sees party code ${code}`);

  await mate.page.goto(`${BASE}/?p=${code}`, { waitUntil: 'networkidle' });
  // the invite link lands straight on one screen: whose party, who's in, your name, I'm in
  await mate.page.getByTestId('invite-line').waitFor();
  check((await mate.page.getByRole('button', { name: /enter the vineyard/i }).count()) === 0 && (await mate.page.locator('.input-code').count()) === 0, 'invite link skips the opening screen and the code box');
  await mate.page.waitForFunction(() => /already in/.test(document.querySelector('[data-testid=invite-line]')?.textContent ?? ''), undefined, { timeout: 5000 }).catch(() => undefined);
  check(/Jezza's Bucks Weekend.*1 lad already in/.test((await mate.page.getByTestId('invite-line').textContent()) ?? ''), `invite shows whose party and who's in (${(await mate.page.getByTestId('invite-line').textContent())?.trim()})`);
  await mate.page.getByPlaceholder(/big dave/i).fill('Tommo');
  await mate.page.getByRole('button', { name: /i'm in/i }).click();
  await mate.page.waitForSelector('.pick-grid');
  await mate.page.locator('.pick-card').nth(2).click();
  await mate.page.getByRole('button', { name: /adopt/i }).click();
  await mate.page.waitForTimeout(2000);
  await mate.page.getByRole('button', { name: /group selfie/i }).click();
  await mate.page.locator('input[data-selfie]').setInputFiles(SELFIE_FILE); // tutorial: the first challenge is a selfie
  await mate.page.getByTestId('intro-next').waitFor();
  check(/level\s*2/i.test((await mate.page.locator('.screen').textContent()) ?? ''), 'the selfie counts straight away and levels the creature up (shown on the step, no pop-up)');
  check((await mate.page.locator('.reward').count()) === 0, 'no reward pop-up interrupts the intro');
  await finishIntro(mate.page);
  await mate.page.waitForSelector('.bottom-nav');

  await host.page.waitForTimeout(500);
  check((await host.page.locator('.list-row', { hasText: 'Tommo' }).count()) > 0, 'host sees Tommo in the roster in real time');
  await host.page.screenshot({ path: path.join(OUT, 'host-party.png') });

  // No host step needed: Friday is already live
  await host.page.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  check((await mate.page.locator('.pill', { hasText: /Friday/ }).count()) > 0, 'Friday is live for the mate without the host doing anything');
  await mate.page.locator('.bottom-nav').getByRole('button', { name: 'Challenges' }).click();
  await mate.page.waitForTimeout(300);
  check((await mate.page.locator('.mission-card').count()) >= 3, 'mate has a hand of challenges');
  await mate.page.screenshot({ path: path.join(OUT, 'mate-missions.png') });

  // Battle: mate challenges host, host accepts
  await mate.page.locator('.bottom-nav').getByRole('button', { name: 'Battle' }).click();
  await mate.page.getByRole('button', { name: /fight a mate/i }).click();
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
  // (the invite link in the address bar: no opening screen, the game remembers the mate and lands him back in)
  await mate.page.waitForSelector('.bottom-nav', { timeout: 8000 });
  check(true, 'mate refreshes and lands straight back in the game (identity + party persisted)');
  await mate.page.locator('.bottom-nav').getByRole('button', { name: 'Battle' }).click();
  await mate.page.waitForSelector('.plans', { timeout: 8000 });
  check(true, 'the battle resumes after refresh');
  // Mate: plan + charge-up tap
  await mate.page.locator('.plan-btn.plan-aggro').click();
  await mate.page.waitForSelector('.pt-screen', { timeout: 3000 });
  const xs: number[] = [];
  for (let i = 0; i < 12; i++) { xs.push(await mate.page.locator('.pt-marker').evaluate((el) => parseFloat((el as HTMLElement).style.left))); await mate.page.waitForTimeout(120); }
  check(xs.some((x, i) => i > 1 && (x - xs[i - 1]) * (xs[i - 1] - xs[i - 2]) < 0), `power bar swings back and forth (${xs.map((x) => Math.round(x)).join(',')})`);
  await mate.page.screenshot({ path: path.join(OUT, 'power-bar.png') });
  await mate.page.waitForTimeout(150);
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

  // Done really means done: the result doesn't come back after switching tabs, or after a second fight
  const clearRewards = async (pg: typeof mate.page) => { for (let i = 0; i < 6 && (await pg.locator('.reward').count()); i++) { await pg.locator('.reward').first().click(); await pg.waitForTimeout(400); } };
  const resultShown = async (pg: typeof mate.page) => (await pg.getByText(/^(VICTORY|DEFEATED)$/).count()) > 0;
  const fight = async () => {
    await mate.page.getByRole('button', { name: /fight a mate/i }).click();
    await mate.page.locator('.sheet .list-row', { hasText: 'Jezza' }).click();
    await host.page.getByRole('button', { name: /accept/i }).click({ timeout: 8000 });
    for (const pg of [mate.page, host.page]) { await pg.locator('.plan-btn.plan-balanced').click({ timeout: 8000 }); await pg.waitForSelector('.pt-screen'); await pg.waitForTimeout(500); await pg.locator('.pt-screen').click({ position: { x: 20, y: 300 } }); }
    await mate.page.getByText(/^(VICTORY|DEFEATED)$/).waitFor({ timeout: 25000 });
    await host.page.getByText(/^(VICTORY|DEFEATED)$/).waitFor({ timeout: 25000 });
  };
  await clearRewards(mate.page); await clearRewards(host.page);
  await mate.page.getByRole('button', { name: /^done$/i }).click();
  await host.page.getByRole('button', { name: /^done$/i }).click();
  await mate.page.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  await mate.page.locator('.bottom-nav').getByRole('button', { name: 'Battle' }).click();
  await mate.page.waitForTimeout(600);
  check(!(await resultShown(mate.page)) && (await mate.page.getByRole('button', { name: /fight a mate/i }).count()) === 1, 'after Done the fight stays finished, even after switching tabs');
  await fight();
  await clearRewards(mate.page); await clearRewards(host.page);
  await mate.page.getByRole('button', { name: /^done$/i }).click();
  await mate.page.waitForTimeout(600);
  check(!(await resultShown(mate.page)), 'Done after a second fight does not bring the first one back');

  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nLIVE E2E PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
