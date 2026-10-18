// Anonymous, persistent player identity. Survives refresh; never leaves the device except to our own server.
const KEY = 'jezza.identity.v1';

export interface Identity { playerId: string; secret: string }

function randomId(len: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Identity;
      if (parsed.playerId && parsed.secret) return parsed;
    }
  } catch { /* private mode etc. */ }
  const id: Identity = { playerId: 'p_' + randomId(20), secret: randomId(32) };
  try { localStorage.setItem(KEY, JSON.stringify(id)); } catch { /* ignore */ }
  return id;
}

export function resetIdentity() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

export function loadPref<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem('jezza.' + key); return raw === null ? fallback : (JSON.parse(raw) as T); } catch { return fallback; }
}
export function savePref<T>(key: string, value: T) { try { localStorage.setItem('jezza.' + key, JSON.stringify(value)); } catch { /* ignore */ } }
