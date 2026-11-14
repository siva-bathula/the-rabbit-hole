import { Timestamp } from '@google-cloud/firestore';
import { getSharedFirestore } from './firestoreClient.js';

export const SEARCH_LOG_COLLECTION = 'search_logs';

export const SEARCH_SOURCES = ['search_bar', 'popular_chip', 'trending_chip'];

const MAX_QUERY_LEN = 500;
const MAX_CHIP_LABEL_LEN = 200;

function isExplicitlyDisabled() {
  const v = String(process.env.SEARCH_LOG_ENABLED ?? '').trim();
  if (!v) return false;
  return /^(0|false|no|off)$/i.test(v);
}

export function isSearchLogEnabled() {
  return !isExplicitlyDisabled();
}

/**
 * Append one search-start event (auto id). Fire-and-forget; never throws.
 */
export function recordSearchLog({ query, source, chipLabel = null }) {
  if (!isSearchLogEnabled()) return Promise.resolve();

  const q = String(query || '').trim().slice(0, MAX_QUERY_LEN);
  const src = String(source || '').trim();
  if (!q || !SEARCH_SOURCES.includes(src)) return Promise.resolve();

  const chip =
    chipLabel == null || chipLabel === ''
      ? null
      : String(chipLabel).trim().slice(0, MAX_CHIP_LABEL_LEN);

  return (async () => {
    const firestore = getSharedFirestore();
    await firestore.collection(SEARCH_LOG_COLLECTION).add({
      query: q,
      source: src,
      chipLabel: chip,
      createdAt: Timestamp.now(),
    });
    if (String(process.env.NODE_ENV ?? '').trim() !== 'production') {
      console.log('[search-log] recorded — source=%s chip=%s query=%s', src, chip || '(none)', q.slice(0, 80));
    }
  })().catch((err) => {
    console.error('[search-log] Firestore write failed:', err?.code || err?.message || err);
  });
}