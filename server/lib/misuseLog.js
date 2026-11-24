import { Timestamp } from '@google-cloud/firestore';
import { getSharedFirestore } from './firestoreClient.js';
import { resolveClientIp } from './clientIp.js';

export const MISUSE_LOG_COLLECTION = 'misuse_attempts';

const MAX_QUERY_LEN = 500;

const MISUSE_SOURCES = new Set(['search', 'followup']);

function isExplicitlyDisabled() {
  const v = String(process.env.MISUSE_LOG_ENABLED ?? '').trim();
  if (!v) return false;
  return /^(0|false|no|off)$/i.test(v);
}

export function isMisuseLogEnabled() {
  return !isExplicitlyDisabled();
}

/**
 * Append one misuse attempt (auto id). Fire-and-forget; never throws.
 * @param {{ req?: import('express').Request, queryText?: string, source: 'search' | 'followup' }} opts
 */
export function recordMisuseAttempt({ req, queryText, source }) {
  if (!isMisuseLogEnabled()) return Promise.resolve();

  const src = MISUSE_SOURCES.has(source) ? source : 'search';
  const q = String(queryText || '').trim().slice(0, MAX_QUERY_LEN);
  if (!q) return Promise.resolve();

  const ip = req ? resolveClientIp(req) : null;

  return (async () => {
    const firestore = getSharedFirestore();
    await firestore.collection(MISUSE_LOG_COLLECTION).add({
      ip,
      query: q,
      source: src,
      createdAt: Timestamp.now(),
    });
    if (String(process.env.NODE_ENV ?? '').trim() !== 'production') {
      console.log('[misuse-log] recorded — source=%s ip=%s query=%s', src, ip || '(unknown)', q.slice(0, 80));
    }
  })().catch((err) => {
    console.error('[misuse-log] Firestore write failed:', err?.code || err?.message || err);
  });
}