/** Cloudflare Turnstile server-side verification for anonymous AI routes. */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * @param {{ secretKey: string }} opts
 * @returns {import('express').RequestHandler}
 */
export function createRequireTurnstile({ secretKey }) {
  return async function requireTurnstile(req, res, next) {
    const token =
      (typeof req.body?.turnstileToken === 'string' && req.body.turnstileToken) ||
      (typeof req.headers['x-turnstile-token'] === 'string' && req.headers['x-turnstile-token']);

    if (!token?.trim()) {
      return res.status(403).json({
        error: 'Verification required. Please reload the page and try again.',
      });
    }

    const params = new URLSearchParams();
    params.set('secret', secretKey);
    params.set('response', token.trim());
    const ip = req.ip || req.socket?.remoteAddress;
    if (ip) params.set('remoteip', ip);

    try {
      const r = await fetch(SITEVERIFY_URL, {
        method: 'POST',
        body: params,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const data = await r.json();
      if (!data.success) {
        const codes = data['error-codes'];
        console.warn('[turnstile] verify failed', codes);
        return res.status(403).json({
          error: 'Verification failed. Please try again.',
        });
      }
    } catch (e) {
      console.error('[turnstile] siteverify request error:', e?.message || e);
      return res.status(503).json({ error: 'Verification service unavailable. Try again shortly.' });
    }

    if (req.body && typeof req.body === 'object') delete req.body.turnstileToken;
    next();
  };
}
