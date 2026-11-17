import { FieldValue, Timestamp } from '@google-cloud/firestore';
import { getSharedFirestore } from './firestoreClient.js';
import { resolveClientIp } from './clientIp.js';

export const IP_USAGE_COLLECTION = 'client_ip_usage';

function isExplicitlyDisabled() {
  const v = String(process.env.IP_USAGE_LOG_ENABLED ?? '').trim();
  if (!v) return false;
  return /^(0|false|no|off)$/i.test(v);
}

export function isIpUsageLogEnabled() {
  return !isExplicitlyDisabled();
}

/** Firestore doc id from IP (IPv6 colons are valid in doc ids). */
function docIdForIp(ip) {
  return ip.replace(/\//g, '_');
}

/**
 * Upsert client IP: set ip + firstSeenAt on first hit; always refresh lastSeenAt.
 * Fire-and-forget; never throws to callers.
 */
export function recordIpUsage(ip) {
  if (!isIpUsageLogEnabled()) return Promise.resolve();

  const normalized = String(ip || '').trim();
  if (!normalized) return Promise.resolve();

  return (async () => {
    const firestore = getSharedFirestore();
    const ref = firestore.collection(IP_USAGE_COLLECTION).doc(docIdForIp(normalized));
    const now = Timestamp.now();

    await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        tx.set(ref, {
          ip: normalized,
          firstSeenAt: now,
          lastSeenAt: now,
          hitCount: 1,
        });
      } else {
        tx.update(ref, {
          lastSeenAt: now,
          hitCount: FieldValue.increment(1),
        });
      }
    });

    if (String(process.env.NODE_ENV ?? '').trim() !== 'production') {
      console.log('[ip-usage] updated — ip=%s', normalized);
    }
  })().catch((err) => {
    console.error('[ip-usage] Firestore write failed:', err?.code || err?.message || err);
  });
}

/** Middleware: record resolved client IP for /api traffic (skips health). */
export function createRecordIpUsageMiddleware() {
  return function recordIpUsageMiddleware(req, res, next) {
    if (!isIpUsageLogEnabled()) return next();
    if (!req.path.startsWith('/api')) return next();
    if (req.path === '/api/health') return next();

    const ip = resolveClientIp(req);
    if (ip) void recordIpUsage(ip);
    return next();
  };
}