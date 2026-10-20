// Shared test bits.
/** A tiny real PNG, for the first-challenge selfie. */
export const SELFIE_FILE = { name: 'selfie.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') };

/** Get through the intro without doing it: "do it later" on the selfie, pass the roast and toast (the groom has neither), then Let's go. */
export async function finishIntro(page: import('playwright-core').Page) {
  const later = page.getByRole('button', { name: /do it later/i });
  if (await later.count()) await later.click();
  for (let i = 0; i < 2; i++) {
    const pass = page.getByRole('button', { name: /pass for now/i });
    try { await pass.waitFor({ timeout: 1500 }); } catch { break; }
    await pass.click();
  }
  await page.getByRole('button', { name: /let's go/i }).click();
}
