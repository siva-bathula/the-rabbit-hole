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

let pendingExplain = 0;
let pendingExpand = 0;
let pendingSearchStart = 0;

export function recordExplainRequest(n = 1) {
  if (!isEndpointMetricsEnabled() || n <= 0) return;
  pendingExplain += n;
}

export function recordExpandRequest(n = 1) {
  if (!isEndpointMetricsEnabled() || n <= 0) return;
  pendingExpand += n;
}

export function recordSearchStart(n = 1) {
  if (!isEndpointMetricsEnabled() || n <= 0) return;
  pendingSearchStart += n;
}

/** Returns counts flushed; restores pending on failure. */
export function takePendingEndpointMetrics() {
  const explainN = pendingExplain;
  const expandN = pendingExpand;
  const searchN = pendingSearchStart;
  pendingExplain = 0;
  pendingExpand = 0;
  pendingSearchStart = 0;
  return { explainN, expandN, searchN };
}

export function restorePendingEndpointMetrics({ explainN, expandN, searchN }) {
  pendingExplain += explainN;
  pendingExpand += expandN;
  pendingSearchStart += searchN;
}

export function hasPendingEndpointMetrics() {
  return pendingExplain > 0 || pendingExpand > 0 || pendingSearchStart > 0;
}

/** @param {import('@google-cloud/firestore').WriteBatch} batch */
export function addEndpointMetricsToBatch(batch, firestore, { explainN, expandN, searchN }, now) {
  if (explainN > 0) {
    batch.set(
      firestore.collection(COLLECTION).doc(DOC_EXPLAIN),
      { total: FieldValue.increment(explainN), updatedAt: now },
      { merge: true },
    );
  }
  if (expandN > 0) {
    batch.set(
      firestore.collection(COLLECTION).doc(DOC_EXPAND),
      { total: FieldValue.increment(expandN), updatedAt: now },
      { merge: true },
    );
  }
  if (searchN > 0) {
    batch.set(
      firestore.collection(COLLECTION).doc(DOC_SEARCH_START),
      { total: FieldValue.increment(searchN), updatedAt: now },
      { merge: true },
    );
  }
}