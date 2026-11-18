import { FieldValue, Timestamp } from '@google-cloud/firestore';
import { getSharedFirestore } from './firestoreClient.js';

const COLLECTION = 'app_metrics';
export const DOC_EXPLAIN = 'api_explain_calls';
export const DOC_EXPAND = 'api_expand_calls';
export const DOC_SEARCH_START = 'search_starts';

function isExplicitlyDisabled() {
  const v = String(process.env.ENDPOINT_METRICS_ENABLED ?? '').trim();
  if (!v) return false;
  return /^(0|false|no|off)$/i.test(v);
}

export function isEndpointMetricsEnabled() {
  return !isExplicitlyDisabled();
}

/**
 * Persist increment immediately (fire-and-forget). Survives short-lived Cloud Run
 * instances better than batched in-memory counters flushed every 60s.
 */
function incrementMetricDoc(docId, n = 1) {
  if (!isEndpointMetricsEnabled() || n <= 0) return;

  void (async () => {
    const firestore = getSharedFirestore();
    await firestore.collection(COLLECTION).doc(docId).set(
      {
        total: FieldValue.increment(n),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
    if (String(process.env.NODE_ENV ?? '').trim() !== 'production') {
      console.log('[endpoint-metrics] +%s %s', n, docId);
    }
  })().catch((err) => {
    console.error(
      '[endpoint-metrics] Firestore increment failed (%s):',
      docId,
      err?.code || err?.message || err,
    );
  });
}

export function recordExplainRequest(n = 1) {
  incrementMetricDoc(DOC_EXPLAIN, n);
}

export function recordExpandRequest(n = 1) {
  incrementMetricDoc(DOC_EXPAND, n);
}

export function recordSearchStart(n = 1) {
  incrementMetricDoc(DOC_SEARCH_START, n);
}