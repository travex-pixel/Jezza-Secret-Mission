// Shared test bits.
/** A tiny real PNG, for the first-challenge selfie. */
export const SELFIE_FILE = { name: 'selfie.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') };

/** Get through the intro without doing it: skip the selfie, roast and toast (the groom has only the selfie), then Start playing.
 *  Any step already done shows its "Next: …" button instead, which is pressed. */
export async function finishIntro(page: import('playwright-core').Page) {
  for (let i = 0; i < 8; i++) {
    const start = page.getByRole('button', { name: /start playing/i });
    if (await start.count()) { await start.click(); return; }
    const next = page.getByTestId('intro-next');
    if (await next.count()) { await next.click(); await page.waitForTimeout(150); continue; }
    const skip = page.getByRole('button', { name: /skip/i }).first();
    if (await skip.count()) { await skip.click(); await page.waitForTimeout(150); continue; }
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: /start playing/i }).click();
}
