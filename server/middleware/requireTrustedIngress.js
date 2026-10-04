import { timingSafeEqual } from 'crypto';

/** @param {string | undefined} host */
export function isCloudRunHost(host) {
  return typeof host === 'string' && host.toLowerCase().endsWith('.run.app');
}

/** @param {string | undefined} host */
export function isFirebaseHostingHost(host) {
  if (!host) return false;
  const h = host.toLowerCase();
  return h.endsWith('.web.app') || h.endsWith('.firebaseapp.com');
}

/** Host the client used (respects trust proxy / Firebase / Cloudflare). */
export function requestHost(req) {
  const forwarded = req?.get?.('X-Forwarded-Host');
  const raw = forwarded ? forwarded.split(',')[0].trim() : req?.get?.('Host') ?? '';
  return raw.split(':')[0].toLowerCase();
}

function safeEqualStrings(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Production ingress hardening:
 * - Reject direct Cloud Run URLs (*.run.app) — pair with Cloud Run ingress settings in GCP.
 * - Custom domains (e.g. rabbitholeorg.org) require X-RH-Edge-Secret from Cloudflare.
 * - Firebase default domains (*.web.app, *.firebaseapp.com) skip the secret (no Cloudflare on that path).
 *
 * @param {{ edgeSecret: string, customDomainHosts: Set<string> }} opts
 */
export function createRequireTrustedIngress({ edgeSecret, customDomainHosts }) {
  const secret = edgeSecret.trim();
  const enforceEdgeSecret = secret.length > 0;

  return function requireTrustedIngress(req, res, next) {
    const host = requestHost(req);

    // Cloud Run health checks / uptime probes
    if (req.path === '/api/health') return next();

    if (isCloudRunHost(host)) {
      return res.status(404).end();
    }

    if (
      enforceEdgeSecret &&
      req.path.startsWith('/api') &&
      customDomainHosts.has(host) &&
      !isFirebaseHostingHost(host)
    ) {
      const provided = req.get('X-RH-Edge-Secret')?.trim() ?? '';
      if (!safeEqualStrings(provided, secret)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    next();
  };
}
