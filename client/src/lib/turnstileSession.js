const STORAGE_KEY = 'rh-turnstile-session-v1';

const SESSION_HEADER = 'x-rh-turnstile-session';

/** Renew this many seconds before server expiry so requests rarely see a stale session. */
const REFRESH_BUFFER_SEC = 120;

let mintInFlight = null;

function base64UrlPayloadToJson(payloadB64) {
  const pad = payloadB64.length % 4 === 0 ? '' : '='.repeat(4 - (payloadB64.length % 4));
  const b64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return JSON.parse(atob(b64));
}

/** @param {string | null | undefined} sessionToken */
export function turnstileSessionExpiresSoon(sessionToken) {
  if (!sessionToken || typeof sessionToken !== 'string') return true;
  const dot = sessionToken.indexOf('.');
  if (dot <= 0) return true;
  try {
    const { exp } = base64UrlPayloadToJson(sessionToken.slice(0, dot));
    if (typeof exp !== 'number') return true;
    const expMs = exp * 1000;
    return Date.now() > expMs - REFRESH_BUFFER_SEC * 1000;
  } catch {
    return true;
  }
}

function readStored() {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(t) {
  try {
    sessionStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
}

export function invalidateRhTurnstileSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Persist renewed sliding session from AI responses (`X-RH-Turnstile-Session`). */
export function captureRhTurnstileSessionFromResponse(res) {
  const t = res.headers.get(SESSION_HEADER);
  if (t?.trim()) writeStored(t.trim());
}

async function mintSession(siteKey) {
  const { getTurnstileToken } = await import('./turnstile.js');
  const tsToken = await getTurnstileToken(siteKey);
  const res = await fetch('/api/turnstile/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turnstileToken: tsToken }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Could not establish verification session');
  }
  if (!data.sessionToken || typeof data.sessionToken !== 'string') {
    throw new Error('Invalid session response from server');
  }
  writeStored(data.sessionToken);
  captureRhTurnstileSessionFromResponse(res);
  return data.sessionToken;
}

/**
 * Returns a short-lived HMAC session token. Turnstile widget runs only when minting or refreshing (~every TURNSTILE_SESSION_TTL_SEC).
 */
export async function ensureRhTurnstileSession(siteKey) {
  const cur = readStored();
  if (cur && !turnstileSessionExpiresSoon(cur)) {
    return cur;
  }

  if (!mintInFlight) {
    mintInFlight = mintSession(siteKey)
      .catch((e) => {
        invalidateRhTurnstileSession();
        throw e;
      })
      .finally(() => {
        mintInFlight = null;
      });
  }
  return mintInFlight;
}

/** Warm session after load so the first exploration skips Turnstile wait when possible. */
export function prefetchRhTurnstileSession() {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  if (!siteKey) return Promise.resolve();
  return ensureRhTurnstileSession(siteKey).catch(() => {});
}
