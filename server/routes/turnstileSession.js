import { verifyTurnstileResponse } from '../lib/turnstileSiteverify.js';
import {
  getTurnstileSessionSlideSec,
  resolveTurnstileSessionSignerSecret,
  signRhTurnstileSessionInitial,
} from '../lib/rhTurnstileSession.js';

/**
 * Exchange one Turnstile widget token for a short-lived HMAC session token (fewer Cloudflare round-trips per browse session).
 */
export function createTurnstileSessionPostHandler({
  turnstileSecret,
  disableTurnstile,
  isDev,
}) {
  const skipCloudflareVerify = disableTurnstile || (isDev && !turnstileSecret);

  const sessionSecret = resolveTurnstileSessionSignerSecret(turnstileSecret, {
    disableTurnstile,
    isDev,
  });

  return async function turnstileSessionPost(req, res) {
    if (!sessionSecret) {
      return res.status(503).json({ error: 'Turnstile session signing is not configured.' });
    }

    if (!skipCloudflareVerify) {
      const tok = typeof req.body?.turnstileToken === 'string' ? req.body.turnstileToken.trim() : '';
      if (!tok) {
        return res.status(400).json({ error: 'turnstileToken is required' });
      }
      const ok = await verifyTurnstileResponse(tok, turnstileSecret, req.ip || req.socket?.remoteAddress);
      if (!ok) {
        console.warn('[turnstile/session] siteverify failed');
        return res.status(403).json({ error: 'Verification failed. Please try again.' });
      }
    }

    const sessionToken = signRhTurnstileSessionInitial(sessionSecret);
    const expiresInSec = getTurnstileSessionSlideSec();
    res.json({ sessionToken, expiresInSec });
  };
}
