// Smoke test for the GitHub Pages (static demo) build: serve dist/client under a base path,
// host a party, confirm bots fill it and the host panel + battles work with no server at all.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE_PATH = '/Jezza-Secret-Mission/';
const ROOT = path.resolve('dist/client');
const PORT = 8799;
const findChrome = () => ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ...(fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`) : [])].find((p) => fs.existsSync(p));
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
let failures = 0; const check = (c: unknown, m: string) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };

const server = http.createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  if (!url.startsWith(BASE_PATH)) { res.writeHead(404); res.end('nope'); return; }
  let file = path.join(ROOT, url.slice(BASE_PATH.length) || 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ROOT, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
server.listen(PORT, async () => {
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  const failed: string[] = []; page.on('requestfailed', (r) => failed.push(r.url()));
  await page.goto(`http://localhost:${PORT}${BASE_PATH}`, { waitUntil: 'networkidle' });
  check((await page.locator('.conn').textContent())?.includes('Demo'), 'static build boots straight into demo mode (no server)');
  await page.getByRole('button', { name: /enter the vineyard/i }).click();
  await page.getByRole('button', { name: /i'm the host/i }).click();
  await page.getByPlaceholder(/big dave/i).fill('You');
  await page.getByRole('button', { name: /create the party/i }).click();
  await page.waitForSelector('.pick-grid');
  await page.locator('.pick-card').first().click();
  await page.getByRole('button', { name: /adopt/i }).click();
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /first mission/i }).click();
  await page.getByRole('button', { name: /i did it/i }).click();
  await page.waitForSelector('.reward'); await page.locator('.reward').click();
  await page.waitForSelector('.bottom-nav');
  check((await page.getByRole('button', { name: /host controls/i }).count()) === 1, 'hosting in demo gives you the host controls');
  await page.waitForTimeout(500);
  await page.locator('.quick-btn', { hasText: 'Party' }).click();
  const legends = await page.locator('.topbar .pill').textContent();
  check(/15 legends/.test(legends ?? ''), `bots joined the party you host (${legends?.trim()})`);
  await page.locator('.bottom-nav').getByRole('button', { name: 'Battle' }).click();
  await page.getByRole('button', { name: /challenge a mate/i }).click();
  await page.locator('.sheet .list-row').first().click();
  await page.waitForSelector('.actions', { timeout: 8000 });
  await page.locator('.action-btn.attack').click();
  await page.waitForTimeout(2500);
  check((await page.locator('.log-line').count()) > 0, 'bot accepted and a round resolved in-browser');
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
  check(failed.length === 0, `no failed asset requests (${failed.join(' | ')})`);
  await browser.close(); server.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nSTATIC DEMO PASSED');
  process.exit(failures ? 1 : 0);
});
