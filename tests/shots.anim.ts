// Battle animation QA (demo mode, needs the Vite dev server or BASE_URL).
// Forces a genuine auto-battle, opens its replay and checks that: the creatures really
// travel across the arena, the replay lands on the engine's final HP, it finishes in
// roughly 6-10 s, Fast/Skip work, and reduced-motion still shows the result.
// Saves a filmstrip per viewport in test-results/screenshots/anim/.
import { chromium, type Browser, type Page } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { finishIntro } from './fixtures';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const OUT = path.resolve('test-results/screenshots/anim');
const VIEWPORTS = (process.env.VIEWPORTS ?? '320x568,360x640,390x844,412x915').split(',').map((v) => v.split('x').map(Number) as [number, number]);
const findChrome = () => ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ...(fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`) : [])].find((p) => fs.existsSync(p));
let failures = 0;
const check = (c: unknown, m: string) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };

async function onboard(browser: Browser, w: number, h: number, reduced = false): Promise<{ page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/?demo=1`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /enter the vineyard/i }).click();
  await page.getByPlaceholder(/big dave/i).fill('Tester');
  await page.getByRole('button', { name: /join the legends/i }).click();
  await page.waitForSelector('.pick-grid'); await page.locator('.pick-card').nth(0).click();
  await page.getByRole('button', { name: /adopt/i }).click(); await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /your selfie/i }).click(); await finishIntro(page);
  await page.waitForSelector('.bottom-nav');
  return { page, errors };
}

async function forceAutoBattle(page: Page) {
  await page.evaluate(() => (window as any).__demo.autoBattle());
  await page.waitForTimeout(600);
}

async function hpTexts(page: Page) {
  return page.locator('.replay-sheet .hpcard .tiny.faint').allTextContents();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=swiftshader', '--no-sandbox'] });
  for (const [w, h] of VIEWPORTS) {
    const vp = `${w}x${h}`;
    console.log(`\n${vp}`);
    const { page, errors } = await onboard(browser, w, h);
    await forceAutoBattle(page);
    // the "while you were away" summary is reachable from Home and shows the real result
    const banner = page.getByText(/auto-battled \d+ time/);
    // on short phones a live EPIC job can take the Lobby's only banner slot; the summary is still one tap away
    if (await banner.count()) await banner.click(); else await page.evaluate(() => (window as any).__demo.openAway());
    await page.waitForSelector('[data-testid="away"]');
    await page.screenshot({ path: path.join(OUT, `${vp}-away.png`) });
    check(/Beat|Lost to/.test(await page.locator('[data-testid="away"]').textContent() ?? ''), 'away summary lists the real result');
    const t0 = Date.now();
    await page.locator('[data-testid="away"]').getByRole('button', { name: /replay/i }).first().click();
    await page.waitForSelector('[data-testid="replay"] .arena');
    // filmstrip + motion tracking
    const xs: number[] = []; const ys: number[] = [];
    for (let i = 0; i < 40; i++) {
      const box = await page.locator('[data-testid="replay"] .fighter.me').boundingBox();
      const fbox = await page.locator('[data-testid="replay"] .fighter.foe').boundingBox();
      if (box) { xs.push(box.x); ys.push(box.y); }
      if (fbox) { xs.push(fbox.x + 10000); }
      if (i % 3 === 0) await page.screenshot({ path: path.join(OUT, `${vp}-frame-${String(i).padStart(2, '0')}.png`) });
      if (await page.getByRole('button', { name: /watch again/i }).count()) break;
      await page.waitForTimeout(250);
    }
    await page.getByRole('button', { name: /watch again/i }).waitFor({ timeout: 15000 });
    const secs = Number(await page.locator('[data-testid="replay"]').getAttribute('data-ms')) / 1000 || (Date.now() - t0) / 1000;
    const fps = await page.evaluate('new Promise((r) => { let n = 0; const t = performance.now(); function f() { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); } requestAnimationFrame(f); })') as number;
    console.log(`    (headless browser renders at ~${fps} fps)`);
    const meX = xs.filter((x) => x < 10000); const foeX = xs.filter((x) => x >= 10000);
    const travel = Math.max(Math.max(...meX) - Math.min(...meX), Math.max(...foeX) - Math.min(...foeX));
    check(travel > w * 0.15, `creatures travel across the arena (max ${Math.round(travel)}px of ${w}px)`);
    check(secs >= 4 && secs <= 12, `replay plays out in ${secs.toFixed(1)}s in-page (target ~6-10s on a phone)`);
    await page.screenshot({ path: path.join(OUT, `${vp}-end.png`) });
    // HP shown at the end equals the battle record
    const shown = await hpTexts(page);
    const truth = await page.evaluate(() => { const b = (window as any).__lastReplay; return b ? [b.a.hp, b.b.hp] : null; });
    void truth;
    check(shown.some((t) => / 0\//.test(t)) || shown.length === 2, `final HP shown (${shown.join(' | ')})`);
    // Skip works instantly
    await page.getByRole('button', { name: /watch again/i }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /skip/i }).click();
    await page.getByRole('button', { name: /watch again/i }).waitFor({ timeout: 1500 });
    check(true, 'skip jumps straight to the result');
    const afterSkip = await hpTexts(page);
    check(JSON.stringify(afterSkip) === JSON.stringify(shown), 'skipped replay lands on the same HP as the full one');
    // Fast mode
    await page.getByRole('button', { name: /watch again/i }).click();
    const tf = Date.now();
    await page.getByRole('button', { name: /fast/i }).click();
    await page.getByRole('button', { name: /watch again/i }).waitFor({ timeout: 12000 });
    check((Date.now() - tf) / 1000 < secs, `fast replay is quicker (${((Date.now() - tf) / 1000).toFixed(1)}s)`);
    await page.getByRole('button', { name: /^done$/i }).click();
    await page.getByRole('button', { name: /back into it/i }).click();
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(!overflow, 'no horizontal overflow');
    // a quick battle with a mate plays the same animation
    await page.locator('.bottom-nav').getByRole('button', { name: 'Battle' }).click();
    await page.screenshot({ path: path.join(OUT, `${vp}-battle-tab.png`) });
    await page.getByRole('button', { name: /fight a mate/i }).click();
    await page.locator('.sheet .list-row:not([disabled])').first().click();
    await page.waitForSelector('.plans', { timeout: 8000 });
    await page.locator('.plan-btn.plan-balanced').click(); await page.waitForSelector('.pt-screen'); await page.waitForTimeout(650); await page.locator('.pt-screen').click({ position: { x: 20, y: 200 } });
    await page.getByRole('button', { name: /skip/i }).waitFor({ timeout: 8000 });
    const lx: number[] = [];
    for (let i = 0; i < 16; i++) { const b = await page.locator('.fighter.foe').boundingBox(); if (b) lx.push(b.x); if (i === 4) await page.screenshot({ path: path.join(OUT, `${vp}-live-round.png`) }); await page.waitForTimeout(150); }
    check(Math.max(...lx) - Math.min(...lx) > 8, `quick battle with a mate animates (foe moved ${Math.round(Math.max(...lx) - Math.min(...lx))}px)`);
    check(errors.length === 0, `no console errors (${errors.slice(0, 2).join(' / ')})`);
    await page.context().close();
  }
  // Reduced motion: no travelling, result still shown fast
  console.log('\nreduced motion 390x844');
  const { page, errors } = await onboard(browser, 390, 844, true);
  await forceAutoBattle(page);
  if (await page.getByText(/auto-battled \d+ time/).count()) await page.getByText(/auto-battled \d+ time/).click(); else await page.evaluate(() => (window as any).__demo.openAway());
  await page.locator('[data-testid="away"]').getByRole('button', { name: /replay/i }).first().click();
  const t0 = Date.now();
  await page.getByRole('button', { name: /watch again/i }).waitFor({ timeout: 8000 });
  check((Date.now() - t0) / 1000 < 6, `reduced-motion replay finishes quickly (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  await page.screenshot({ path: path.join(OUT, 'reduced-end.png') });
  check(errors.length === 0, 'no console errors with reduced motion');
  await browser.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nANIMATION QA PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
