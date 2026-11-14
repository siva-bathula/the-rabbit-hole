import { FieldValue, Timestamp } from '@google-cloud/firestore';
import { getSharedFirestore } from './firestoreClient.js';

const COLLECTION = 'app_metrics';
const DOC_GEMINI = 'gemini_calls';
const DOC_DEEPSEEK = 'deepseek_calls';

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

let pendingGemini = 0;
let pendingDeepseek = 0;
let started = false;

/** One Google Gemini `generateContent` request (graph, quiz, alignment, startup probe). */
export function recordGeminiCall(n = 1) {
  if (!isLlmMetricsEnabled() || n <= 0) return;
  pendingGemini += n;
}

/** One DeepSeek chat completion request (explain, deepen, trending, follow-up, compare, …). */
export function recordDeepseekCall(n = 1) {
  if (!isLlmMetricsEnabled() || n <= 0) return;
  pendingDeepseek += n;
}

/** Always resolves; restores pending counts on failure. */
export function flushLlmMetricsNow() {
  if (!isLlmMetricsEnabled()) return Promise.resolve();

  const geminiN = pendingGemini;
  const deepseekN = pendingDeepseek;
  pendingGemini = 0;
  pendingDeepseek = 0;
  if (geminiN <= 0 && deepseekN <= 0) return Promise.resolve();

  return (async () => {
    const firestore = getSharedFirestore();
    const now = Timestamp.now();
    const batch = firestore.batch();

    if (geminiN > 0) {
      batch.set(
        firestore.collection(COLLECTION).doc(DOC_GEMINI),
        { total: FieldValue.increment(geminiN), updatedAt: now },
        { merge: true },
      );
    }
    if (deepseekN > 0) {
      batch.set(
        firestore.collection(COLLECTION).doc(DOC_DEEPSEEK),
        { total: FieldValue.increment(deepseekN), updatedAt: now },
        { merge: true },
      );
    }

    await batch.commit();
  })().catch((err) => {
    pendingGemini += geminiN;
    pendingDeepseek += deepseekN;
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