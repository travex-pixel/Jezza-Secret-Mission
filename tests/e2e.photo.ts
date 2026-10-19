// Photo upload against a built server: the photo button lets you pick from the library (no forced camera),
// and a full-size 12MP phone photo arrives as a sharp 1600px copy.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:8790';
const findChrome = () => ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ...(fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`) : [])].find((p) => fs.existsSync(p));
let failures = 0;
const check = (c: unknown, m: string) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };

async function main() {
  const b = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors: string[] = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /enter the vineyard/i }).click();
  await p.getByRole('button', { name: /i'm the host/i }).click();
  await p.getByPlaceholder(/big dave/i).fill('Travis');
  await p.getByRole('button', { name: /create the party/i }).click();
  await p.waitForSelector('.pick-grid'); await p.locator('.pick-card').first().click();
  await p.getByRole('button', { name: /adopt/i }).click(); await p.waitForTimeout(2000);
  await p.getByRole('button', { name: /first mission/i }).click(); await p.getByRole('button', { name: /skip for now/i }).click();
  await p.getByRole('button', { name: /host controls/i }).click();
  await p.locator('.list-row', { hasText: 'The Big Cheers' }).getByRole('button', { name: /reveal/i }).click();
  await p.waitForTimeout(400);
  await p.getByText(/‹ Host controls/).click();
  await p.locator('.bottom-nav').getByRole('button', { name: 'Missions' }).click();
  const input = p.locator('input[type=file]').first();
  await input.waitFor({ state: 'attached', timeout: 5000 });
  check((await input.getAttribute('capture')) === null, 'photo button offers camera OR library (no forced camera)');
  // a 4000x3000 "camera roll" photo, made in the browser
  const b64 = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const g = c.getContext('2d')!; for (let i = 0; i < 300; i++) { g.fillStyle = `hsl(${i * 37 % 360} 70% 50%)`; g.fillRect((i * 997) % 4000, (i * 613) % 3000, 40 + (i % 9) * 30, 40 + (i % 7) * 30); } return c.toDataURL('image/jpeg', 0.92).split(',')[1]; });
  await input.setInputFiles({ name: 'IMG_0001.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') });
  await p.locator('.reward').first().waitFor({ timeout: 8000 });
  check(true, 'photo counted (solo room: no one to vote, so it goes straight through)');
  for (let i = 0; i < 5 && (await p.locator('.reward').count()); i++) { await p.locator('.reward').first().click(); await p.waitForTimeout(500); }
  await p.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  await p.locator('.quick-btn', { hasText: 'Photos' }).click();
  const img = p.locator('.gallery-grid img').first();
  await img.waitFor({ timeout: 6000 });
  const size = await img.evaluate((el: HTMLImageElement) => [el.naturalWidth, el.naturalHeight]);
  check(size[0] === 1600 && size[1] === 1200, `12MP photo stored as a sharp ${size[0]}x${size[1]} copy`);
  const url = await img.getAttribute('src');
  const bytes = (await (await fetch(new URL(url!, BASE))).arrayBuffer()).byteLength;
  check(bytes > 100_000 && bytes < 1_100_000, `stored file is ${Math.round(bytes / 1024)} KB`);
  check(errors.length === 0, 'no page errors');
  await b.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nPHOTO E2E PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
