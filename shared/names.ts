// Nickname / creature-name moderation. Deliberately simple: block the obviously
// unsuitable, block impersonating the host/system, keep everything else.
const BLOCKED = [
  'nigg', 'fag', 'retard', 'cunt', 'rape', 'hitler', 'nazi', 'kike', 'spic', 'chink', 'tranny', 'paki',
];
const RESERVED = ['host', 'admin', 'system', 'server', 'moderator', 'gamemaster'];

export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} '._-]/gu, '').trim().slice(0, 16);
}

export function validateNickname(raw: string, existing: string[] = [], opts: { allowReserved?: boolean } = {}): { ok: true; name: string } | { ok: false; error: string } {
  const name = cleanName(raw);
  if (name.length < 2) return { ok: false, error: 'Nickname needs at least 2 characters.' };
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (BLOCKED.some((b) => lower.includes(b))) return { ok: false, error: 'That nickname is not vineyard-appropriate. Try again.' };
  if (!opts.allowReserved && RESERVED.includes(lower)) return { ok: false, error: 'Nice try. That name is reserved.' };
  if (existing.some((e) => e.toLowerCase().replace(/[^a-z0-9]/g, '') === lower)) return { ok: false, error: 'Someone already took that name. Add a flourish.' };
  return { ok: true, name };
}

export function validateCreatureName(raw: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = cleanName(raw);
  if (name.length < 2) return { ok: false, error: 'Give your creature at least 2 letters.' };
  const lower = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (BLOCKED.some((b) => lower.includes(b))) return { ok: false, error: 'Your creature deserves a better name than that.' };
  return { ok: true, name };
}
