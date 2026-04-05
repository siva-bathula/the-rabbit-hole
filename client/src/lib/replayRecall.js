/** Matches NodeOverlay / SlowBurnView explanation cache keys. */
export function modeCacheKey(nodeId, mode) {
  return mode === 'normal' ? nodeId : `${nodeId}::${mode}`;
}

const MAX_EXCERPT = 360;

/**
 * @param {{ current?: Map<string, unknown> } | null | undefined} cacheRef
 * @param {string} nodeId
 * @param {string} explainMode
 * @returns {object | null} Raw explanation object from API shape, or null
 */
export function getCachedExplanationEntry(cacheRef, nodeId, explainMode) {
  const map = cacheRef?.current;
  if (!map || !nodeId) return null;

  const primary = map.get(modeCacheKey(nodeId, explainMode));
  if (primary) {
    const raw = primary.explanation ?? primary;
    if (raw && typeof raw === 'object') return raw;
  }

  if (explainMode !== 'normal') {
    const normal = map.get(modeCacheKey(nodeId, 'normal'));
    if (normal) {
      const raw = normal.explanation ?? normal;
      if (raw && typeof raw === 'object') return raw;
    }
  }

  return null;
}

/**
 * Prefer key takeaway, then start of summary; soft truncate at sentence or word.
 * @param {{ summary?: string, keyTakeaway?: string } | null} explanation
 * @returns {string}
 */
export function excerptFromExplanation(explanation) {
  if (!explanation || typeof explanation !== 'object') return '';

  const takeaway =
    typeof explanation.keyTakeaway === 'string'
      ? explanation.keyTakeaway.trim()
      : '';
  if (takeaway) return truncateSmart(takeaway, MAX_EXCERPT);

  const summary =
    typeof explanation.summary === 'string' ? explanation.summary.trim() : '';
  if (summary) return truncateSmart(summary, MAX_EXCERPT);

  return '';
}

function truncateSmart(text, max) {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastPeriod = slice.lastIndexOf('. ');
  const lastBang = slice.lastIndexOf('! ');
  const lastQ = slice.lastIndexOf('? ');
  const lastSentence = Math.max(lastPeriod, lastBang, lastQ);
  if (lastSentence > 80) return `${slice.slice(0, lastSentence + 1).trimEnd()}…`;
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace > 40) return `${slice.slice(0, lastSpace).trimEnd()}…`;
  return `${slice.trimEnd()}…`;
}
