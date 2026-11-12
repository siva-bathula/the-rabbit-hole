import { withTurnstilePayload, fetchWithTurnstile, readApiJson } from './turnstile.js';
import { modeCacheKey } from './replayRecall.js';

/** Whether this node already has a base explanation cached for `explainMode`. */
export function hasExplanationCached(cacheRef, nodeId, explainMode) {
  const map = cacheRef?.current;
  if (!map || !nodeId) return false;
  const entry = map.get(modeCacheKey(nodeId, explainMode));
  if (!entry) return false;
  const raw = entry.explanation ?? entry;
  return Boolean(raw && typeof raw === 'object' && raw.title && raw.summary);
}

/**
 * One POST /api/explain for a single node (same contract as NodeOverlay).
 * @returns {Promise<Record<string, unknown>>}
 */
export async function fetchNodeExplanation({
  node,
  parentContext,
  rootTopic,
  sessionTopic,
  groundingContext,
  explainMode,
}) {
  const body = await withTurnstilePayload({
    nodeLabel: node.label,
    parentContext: parentContext || node.label,
    rootTopic: rootTopic || '',
    sessionTopic: sessionTopic || '',
    groundingContext: groundingContext || '',
    mode: explainMode,
  });

  const res = await fetchWithTurnstile(
    '/api/explain',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    { retries: explainMode === 'verbose' ? 0 : 1 },
  );

  const data = await readApiJson(res);
  if (!res.ok || data.error) {
    const msg = typeof data.error === 'string' ? data.error : 'Failed to load explanation.';
    const err = new Error(msg);
    if (data?.code) err.code = data.code;
    throw err;
  }
  if (!data.title || !data.summary) {
    throw new Error('Invalid explanation from server.');
  }
  return data;
}
