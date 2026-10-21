// In-app camera against a built server: the selfie and SNAP IT use a live camera inside the page (no switching to
// the phone's camera app, which Android can kill for memory). With a fake camera the photo goes through; with the
// camera blocked, one tap falls back to the phone's own camera picker.
import { chromium, type Browser } from 'playwright-core';
import fs from 'node:fs';
import { finishIntro } from './fixtures';

const BASE = process.env.BASE_URL ?? 'http://localhost:8790';
const findChrome = () => ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', ...(fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`) : [])].find((p) => fs.existsSync(p));
let failures = 0;
const check = (c: unknown, m: string) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) failures++; };

async function onboard(b: Browser, name: string, grant: boolean) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: grant ? ['camera'] : [] });
  const p = await ctx.newPage();
  const errors: string[] = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: /enter the vineyard/i }).click();
  await p.getByRole('button', { name: /i'm the host/i }).click();
  await p.getByPlaceholder(/big dave/i).fill(name);
  await p.getByRole('button', { name: /create the party/i }).click();
  await p.waitForSelector('.pick-grid'); await p.locator('.pick-card').first().click();
  await p.getByRole('button', { name: /adopt/i }).click(); await p.waitForTimeout(2000);
  await p.getByRole('button', { name: /your selfie/i }).click();
  return { p, errors };
}

async function main() {
  console.log('live camera');
  const b = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const { p, errors } = await onboard(b, 'Snappy', true);
  // Opening the camera and closing it again is harmless
  await p.getByRole('button', { name: /take your selfie/i }).click();
  await p.locator('.camera-shutter:not([disabled])').waitFor({ timeout: 8000 });
  check(/just you/i.test((await p.locator('.camera-top').textContent()) ?? ''), 'the live camera says what to get in the shot');
  await p.getByRole('button', { name: 'Close camera' }).click();
  check((await p.locator('.camera').count()) === 0 && (await p.getByRole('button', { name: /take your selfie/i }).count()) === 1, 'closing the camera early just returns to the step, nothing sent');
  await p.getByRole('button', { name: /take your selfie/i }).click();
  await p.locator('.camera').waitFor();
  await p.locator('.camera-shutter:not([disabled])').waitFor({ timeout: 8000 });
  check((await p.locator('.camera video').evaluate((v: HTMLVideoElement) => v.videoWidth)) > 0, 'the selfie opens a live camera inside the game (no app switch)');
  await p.screenshot({ path: 'test-results/screenshots/camera-live.png' });
  // A nervous double-tap on the shutter is one photo
  await p.locator('.camera-shutter').click({ clickCount: 2, delay: 20 });
  await p.locator('.camera-still').waitFor({ timeout: 5000 });
  await p.waitForTimeout(300);
  check((await p.locator('.camera-still').count()) === 1 && (await p.locator('.camera-shutter').count()) === 0, 'after the shutter: the photo is framed, "Photo taken", and the shutter is gone (no re-taking by accident)');
  check(/photo taken/i.test((await p.locator('.camera-top').textContent()) ?? ''), 'the taken state is labelled');
  check((await p.locator('.camera-bar button').allTextContents()).join('|') === '↺ Retake|✅ Use this photo', 'two clear choices: Retake or Use this photo');
  await p.screenshot({ path: 'test-results/screenshots/camera-taken.png' });
  await p.getByRole('button', { name: /retake/i }).click();
  await p.locator('.camera-shutter:not([disabled])').waitFor({ timeout: 5000 });
  check(true, 'Retake goes back to the live camera');
  await p.locator('.camera-shutter').click();
  await p.getByTestId('use-photo').click();
  // The step shows what you earned and names the next step: no pop-up, no guessing
  await p.getByTestId('intro-next').waitFor({ timeout: 8000 });
  const stepText = (await p.locator('.screen').textContent()) ?? '';
  check(/photo.s in/i.test(stepText) && /level 2/i.test(stepText), 'the selfie counts straight away: "Photo\'s in", Level 2, shown on the step itself');
  check((await p.locator('.reward').count()) === 0 && (await p.locator('.toast').count()) === 0, 'nothing pops up over the intro');
  check((await p.locator('.camera').count()) === 0, 'the camera closes once the photo is sent');
  check(/next: roast jezza/i.test((await p.getByTestId('intro-next').textContent()) ?? ''), 'the button says where you are going next');
  await p.screenshot({ path: 'test-results/screenshots/intro-selfie-done.png' });
  await p.getByTestId('intro-next').click();
  // intro 2 + 3: roast and toast go on the Jezza Wall and count once
  await p.locator('textarea[data-intro=roast]').fill('Jezza\'s Year 9 haircut had its own postcode');
  await p.getByRole('button', { name: /post the roast/i }).click();
  await p.getByTestId('intro-next').waitFor({ timeout: 8000 });
  check(/roast posted/i.test((await p.locator('.screen').textContent()) ?? ''), 'posting the roast confirms it in place');
  await p.getByTestId('intro-next').click();
  await p.locator('textarea[data-intro=toast]').fill('Best bloke I know. Worst at parallel parking.');
  await p.getByRole('button', { name: /post the toast/i }).click();
  await p.getByTestId('intro-next').waitFor({ timeout: 8000 });
  await p.getByTestId('intro-next').click();
  await p.getByText(/the roast is open/i).waitFor();
  check((await p.locator('.mission-card').count()) === 1 && (await p.locator('.mission-card button').count()) === 0, 'the intro ends on a preview of the next challenge, with one button: Start playing');
  await p.screenshot({ path: 'test-results/screenshots/intro-go.png' });
  await p.getByRole('button', { name: /start playing/i }).click();
  await p.locator('.bottom-nav').waitFor();
  check((await p.locator('.toast').count()) >= 1, 'the achievement toast waits until the intro is over');
  // the intro can be replayed from ❓, and doesn't let you score it twice
  await p.getByRole('button', { name: 'How it works' }).click();
  await p.getByRole('button', { name: /replay the intro/i }).click();
  await p.getByText(/the roast is open/i).waitFor();
  check((await p.locator('textarea[data-intro]').count()) === 0, 'replaying the intro skips the steps already done');
  await p.getByRole('button', { name: /start playing/i }).click();
  await p.locator('.quick-btn', { hasText: 'Wall' }).click();
  await p.waitForTimeout(500);
  const wall = (await p.locator('.screen').textContent()) ?? '';
  check(/postcode/.test(wall) && /parallel parking/.test(wall), 'the intro roast and toast are on the Jezza Wall');
  await p.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  await p.locator('.bottom-nav').getByRole('button', { name: 'Challenges' }).click();
  const snap = p.getByRole('button', { name: /snap it/i }).first();
  await snap.waitFor({ timeout: 5000 });
  await snap.click();
  await p.locator('.camera-shutter:not([disabled])').waitFor({ timeout: 8000 });
  check((await p.locator('.camera video.mirror').count()) === 0, 'challenge photos use the back camera');
  await p.locator('.camera-shutter').click();
  await p.getByTestId('use-photo').click();
  await p.locator('.reward').waitFor({ timeout: 8000 });
  check(true, 'a SNAP IT challenge goes through with the in-game camera');
  // rewards, maybe an evolution (it can't be tapped away until the reveal, ~2.5 s)
  for (let i = 0; i < 12 && (await p.locator('.reward').count()); i++) { await p.locator('.reward').first().click(); await p.waitForTimeout(700); }
  await p.locator('.bottom-nav').getByRole('button', { name: 'Lobby' }).click();
  await p.locator('.quick-btn', { hasText: 'Photos' }).click();
  await p.waitForTimeout(800);
  check((await p.locator('.gallery-grid img').count()) >= 2, `both photos are in the gallery (${await p.locator('.gallery-grid img').count()})`);
  check(errors.length === 0, `no page errors ${errors.slice(0, 2).join(' / ')}`);
  await b.close();

  console.log('camera blocked');
  const b2 = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox', '--deny-permission-prompts'] });
  const { p: q } = await onboard(b2, 'NoCam', false);
  await q.getByRole('button', { name: /take your selfie/i }).click();
  const fallback = q.getByRole('button', { name: /use phone camera/i });
  await fallback.waitFor({ timeout: 8000 });
  check(true, 'blocked camera: a clear message instead of a dead end');
  await q.screenshot({ path: 'test-results/screenshots/camera-blocked.png' });
  const chooser = q.waitForEvent('filechooser', { timeout: 5000 });
  await fallback.click();
  const fc = await chooser;
  check(fc.isMultiple() === false, 'one tap opens the phone\'s own camera/photo picker');
  await b2.close();

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nCAMERA E2E PASSED');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
