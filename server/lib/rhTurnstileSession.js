import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Prefer explicit env; else derive from Turnstile secret so all instances share the same key. */
export function deriveTurnstileSessionSecret(turnstileSecretKey) {
  const explicit = String(process.env.TURNSTILE_SESSION_SECRET ?? '').trim();
  if (explicit) return explicit;
  const ts = String(turnstileSecretKey ?? '').trim();
  if (ts) return createHash('sha256').update(`${ts}:rh-turnstile-session-v1`).digest('hex');
  return null;
}

/** Default sliding window / initial session length (60–3600s). Also used when SLIDE_SEC unset. */
export function getTurnstileSessionTtlSec() {
  const n = parseInt(String(process.env.TURNSTILE_SESSION_TTL_SEC ?? '600'), 10);
  return Number.isFinite(n) && n >= 60 && n <= 3600 ? n : 600;
}

/** Seconds to extend `exp` on each successful AI call (sliding). Defaults to TURNSTILE_SESSION_TTL_SEC behavior via fallback. */
export function getTurnstileSessionSlideSec() {
  const raw = String(process.env.TURNSTILE_SESSION_SLIDE_SEC ?? '').trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 60 && n <= 3600) return n;
  }
  return getTurnstileSessionTtlSec();
}

/** Max seconds since `last` activity; beyond this the session is invalid (needs new Turnstile exchange). */
export function getTurnstileSessionIdleSec() {
  const n = parseInt(String(process.env.TURNSTILE_SESSION_IDLE_SEC ?? '1800'), 10);
  return Number.isFinite(n) && n >= 120 && n <= 86400 ? n : 1800;
}

/** Max lifetime since first proof (`iat`). Caps sliding renewal. */
export function getTurnstileSessionMaxAbsSec() {
  const n = parseInt(String(process.env.TURNSTILE_SESSION_MAX_ABS_SEC ?? '86400'), 10);
  return Number.isFinite(n) && n >= 300 && n <= 604800 ? n : 86400;
}

function signPayload(secret, payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** First session after Turnstile siteverify (POST /api/turnstile/session). */
export function signRhTurnstileSessionInitial(secret) {
  const nowSec = Math.floor(Date.now() / 1000);
  const slide = getTurnstileSessionSlideSec();
  const maxAbs = getTurnstileSessionMaxAbsSec();
  const iat = nowSec;
  const last = nowSec;
  const exp = Math.min(nowSec + slide, iat + maxAbs);
  return signPayload(secret, { exp, iat, last });
}

/**
 * Renew after a successful AI request authenticated with a non-legacy session.
 * @param {object} prev parsed payload { exp, iat, last }
 */
export function signRhTurnstileSessionRenew(secret, prev) {
  const nowSec = Math.floor(Date.now() / 1000);
  const slide = getTurnstileSessionSlideSec();
  const maxAbs = getTurnstileSessionMaxAbsSec();
  const iat = prev.iat;
  const exp = Math.min(nowSec + slide, iat + maxAbs);
  const last = nowSec;
  return signPayload(secret, { exp, iat, last });
}

/**
 * Legacy tokens: `{ exp }` only (fixed window from mint).
 * v2 tokens: `{ exp, iat, last }` with idle + absolute caps.
 * @returns {null | { legacy?: true, exp: number, iat?: number, last?: number }}
 */
export function parseAndVerifyRhTurnstileSession(token, secret) {
  if (!token || typeof token !== 'string' || !secret) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return null;
  try {
    if (!timingSafeEqual(a, b)) return null;
    const body = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    const nowSec = Math.floor(Date.now() / 1000);

    if (typeof body.exp !== 'number') return null;
    if (body.exp < nowSec) return null;

    if (body.iat === undefined && body.last === undefined) {
      return { legacy: true, exp: body.exp };
    }

    if (typeof body.iat !== 'number' || typeof body.last !== 'number') return null;

    const idleSec = getTurnstileSessionIdleSec();
    const maxAbsSec = getTurnstileSessionMaxAbsSec();

    if (nowSec - body.last > idleSec) return null;
    if (nowSec > body.iat + maxAbsSec) return null;

    return body;
  } catch {
    return null;
  }
}

export function verifyRhTurnstileSession(token, secret) {
  return parseAndVerifyRhTurnstileSession(token, secret) !== null;
}

/** Used when verification is off or dev has no Turnstile secret — not for locked-down production APIs. */
export const DEV_FALLBACK_TURNSTILE_SESSION_SECRET = 'dev-rh-turnstile-session-insecure';

/**
 * @param {string} turnstileSecretKey
 * @param {{ disableTurnstile: boolean, isDev: boolean }} opts
 */
export function resolveTurnstileSessionSignerSecret(turnstileSecretKey, opts) {
  const derived = deriveTurnstileSessionSecret(turnstileSecretKey);
  if (derived) return derived;
  const ts = String(turnstileSecretKey ?? '').trim();
  if (opts.disableTurnstile || (opts.isDev && !ts)) return DEV_FALLBACK_TURNSTILE_SESSION_SECRET;
  return null;
}
