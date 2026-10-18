// Visual + layout QA: walks the first-30-seconds flow at real phone viewports,
// screenshots every core screen and fails on horizontal overflow, core-screen
// scrolling, or console errors. Run with the dev server up (npm run dev) or
// pass BASE_URL for a built server.
import { chromium, type Page } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = process.env.SHOT_DIR ?? path.resolve('test-results/screenshots');
const VIEWPORTS = [[320, 568], [360, 640], [390, 844], [412, 915]] as const;
const CORE_NO_SCROLL = new Set(['01-opening', '03-choose', '04-reveal', '05-first-mission', '07-lobby', '09-battle-arena']);

const findChrome = () => {
  const roots = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome'];
  for (const r of roots) if (r && fs.existsSync(r)) return r;
  for (const d of fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers') : []) { const p = `/opt/pw-browsers/${d}/chrome-linux/chrome`; if (fs.existsSync(p)) return p; }
  return undefined;
};

interface Problem { viewport: string; screen: string; issue: string }
const problems: Problem[] = [];

async function shot(page: Page, vp: string, name: string) {
  const dir = path.join(OUT, vp); fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
  const m = await page.evaluate(() => {
    const body = document.querySelector('.screen-body') as HTMLElement | null;
    const scr = document.querySelector('.screen') as HTMLElement | null;
    return {
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1 || (scr ? scr.scrollWidth > scr.clientWidth + 1 : false),
      bodyScroll: body && !body.classList.contains('scroll-y') ? body.scrollHeight - body.clientHeight : 0,
      screenScroll: scr ? scr.scrollHeight - scr.clientHeight : 0,
    };
  });
  if (m.overflowX) problems.push({ viewport: vp, screen: name, issue: 'horizontal overflow' });
  if (CORE_NO_SCROLL.has(name) && (m.bodyScroll > 2 || m.screenScroll > 2)) problems.push({ viewport: vp, screen: name, issue: `core screen needs scrolling (${Math.max(m.bodyScroll, m.screenScroll)}px)` });
}

async function run() {
  const exe = findChrome();
  const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  for (const [w, h] of VIEWPORTS) {
    const vp = `${w}x${h}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}/?demo=1`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1600);
    await shot(page, vp, '01-opening');
    await page.getByRole('button', { name: /enter the vineyard/i }).click();
    await page.getByPlaceholder(/big dave/i).fill('Tester');
    await shot(page, vp, '02-join');
    await page.getByRole('button', { name: /join the legends/i }).click();
    await page.waitForSelector('.pick-grid');
    await page.locator('.pick-card').nth(1).click();
    await shot(page, vp, '03-choose');
    await page.getByRole('button', { name: /adopt/i }).click();
    await page.waitForTimeout(2200);
    await shot(page, vp, '04-reveal');
    await page.getByRole('button', { name: /first mission/i }).click();
    await page.waitForSelector('.mission-card');
    await shot(page, vp, '05-first-mission');
    await page.getByRole('button', { name: /i did it/i }).click();
    await page.waitForSelector('.reward');
    await shot(page, vp, '06-reward');
    await page.locator('.reward').click();
    await page.waitForSelector('.bottom-nav');
    await shot(page, vp, '07-lobby');
    await page.locator('.bottom-nav').getByRole('button', { name: 'Missions' }).click();
    await shot(page, vp, '08-missions');
    await page.locator('.bottom-nav').getByRole('button', { name: 'Battle' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /challenge a mate/i }).click();
    await page.locator('.sheet .list-row').first().click();
    await page.waitForSelector('.actions', { timeout: 8000 });
    await shot(page, vp, '09-battle-arena');
    await page.locator('.action-btn.attack').click();
    await page.waitForTimeout(2600);
    await shot(page, vp, '10-battle-round');
    await page.locator('.bottom-nav').getByRole('button', { name: 'Ranks' }).click();
    await shot(page, vp, '11-ranks');
    await page.locator('.bottom-nav').getByRole('button', { name: 'Me' }).click();
    await shot(page, vp, '12-profile');
    await page.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
    await page.locator('.topbar').getByText(/party →|Party/).first().click().catch(() => undefined);
    await page.getByText(/Party →/).click().catch(() => undefined);
    await shot(page, vp, '13-party');
    const realErrors = errors.filter((e) => !/favicon|WebGL|GPU|swiftshader|GroupMarkerNotSet|Automatic fallback/i.test(e));
    if (realErrors.length) problems.push({ viewport: vp, screen: '*', issue: `console errors: ${realErrors.slice(0, 3).join(' | ')}` });
    await ctx.close();
    console.log(`✔ ${vp} captured`);
  }
  await browser.close();
  if (problems.length) { console.log('\nPROBLEMS:'); for (const p of problems) console.log(` - [${p.viewport}] ${p.screen}: ${p.issue}`); process.exitCode = 1; }
  else console.log('\nAll viewports clean: no horizontal overflow, no scrolling on core screens, no console errors.');
}
run().catch((e) => { console.error(e); process.exit(1); });
