import { FieldValue, Timestamp } from '@google-cloud/firestore';
import { getSharedFirestore } from './firestoreClient.js';

const COLLECTION = 'app_metrics';
const DOC_ID = 'llm_calls';

function isExplicitlyDisabled() {
  const v = String(process.env.LLM_METRICS_ENABLED ?? '').trim();
  if (!v) return false;
  return /^(0|false|no|off)$/i.test(v);
}

export function isLlmMetricsEnabled() {
  return !isExplicitlyDisabled();
}

const FLUSH_MS = Math.max(
  5000,
  Number(process.env.LLM_METRICS_FLUSH_MS || 60_000) || 60_000,
);

let pendingDelta = 0;
let started = false;

export function recordLlmCall(n = 1) {
  if (!isLlmMetricsEnabled() || n <= 0) return;
  pendingDelta += n;
}

/** Always resolves; restores pending count on failure (Firestore may reject auxiliary promises otherwise). */
export function flushLlmMetricsNow() {
  if (!isLlmMetricsEnabled()) return Promise.resolve();

  const n = pendingDelta;
  pendingDelta = 0;
  if (n <= 0) return Promise.resolve();

  return (async () => {
    const firestore = getSharedFirestore();
    await firestore.collection(COLLECTION).doc(DOC_ID).set(
      {
        total: FieldValue.increment(n),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
  })().catch((err) => {
    pendingDelta += n;
    console.error('[llm-metrics] flush failed:', err?.message || err);
  });
}

function onShutdown() {
  void flushLlmMetricsNow();
}

export function startLlmMetrics() {
  if (started || !isLlmMetricsEnabled()) return;
  started = true;

  setInterval(() => {
    void flushLlmMetricsNow();
  }, FLUSH_MS);

  process.on('SIGTERM', onShutdown);
  process.on('SIGINT', onShutdown);
}
