/** Cloudflare Turnstile + short-lived HMAC session for anonymous AI routes. */

import { verifyTurnstileResponse } from '../lib/turnstileSiteverify.js';
import {
  parseAndVerifyRhTurnstileSession,
  signRhTurnstileSessionRenew,
} from '../lib/rhTurnstileSession.js';

function stripTurnstileFields(req) {
  if (req.body && typeof req.body === 'object') {
    delete req.body.turnstileToken;
    delete req.body.turnstileSession;
  }
}

function readTurnstileSession(req) {
  const fromBody =
    typeof req.body?.turnstileSession === 'string' ? req.body.turnstileSession.trim() : '';
  const fromHeader =
    typeof req.headers['x-rh-turnstile-session'] === 'string'
      ? req.headers['x-rh-turnstile-session'].trim()
      : '';
  return fromBody || fromHeader || '';
}

function readWidgetToken(req) {
  return (
    (typeof req.body?.turnstileToken === 'string' && req.body.turnstileToken.trim()) ||
    (typeof req.headers['x-turnstile-token'] === 'string' && req.headers['x-turnstile-token'].trim()) ||
    ''
  );
}

function attachSlidingSessionHeader(res, req) {
  const origJson = res.json.bind(res);
  res.json = function slidingTurnstileJson(body) {
    const code = res.statusCode;
    if (req.rhIssueSlidingSession && code >= 200 && code < 300) {
      res.setHeader('X-RH-Turnstile-Session', req.rhIssueSlidingSession);
    }
    delete req.rhIssueSlidingSession;
    return origJson(body);
  };
}

/**
 * @param {{ secretKey: string, sessionSignerSecret: string }} opts
 */
export function createRequireTurnstile({ secretKey, sessionSignerSecret }) {
  return async function requireTurnstile(req, res, next) {
    const sessionTok = readTurnstileSession(req);
    const parsed = sessionTok ? parseAndVerifyRhTurnstileSession(sessionTok, sessionSignerSecret) : null;

    if (parsed) {
      stripTurnstileFields(req);
      if (!parsed.legacy) {
        req.rhIssueSlidingSession = signRhTurnstileSessionRenew(sessionSignerSecret, parsed);
        attachSlidingSessionHeader(res, req);
      }
      return next();
    }

    const token = readWidgetToken(req);
    if (!token) {
      return res.status(403).json({
        error: 'Verification required. Please reload the page and try again.',
      });
    }

    const ok = await verifyTurnstileResponse(token, secretKey, req.ip || req.socket?.remoteAddress);
    if (!ok) {
      console.warn('[turnstile] siteverify failed');
      return res.status(403).json({
        error: 'Verification failed. Please try again.',
      });
    }

    stripTurnstileFields(req);
    next();
  };
}
