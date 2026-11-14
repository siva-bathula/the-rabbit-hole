const SOURCES = new Set(['search_bar', 'popular_chip', 'trending_chip']);

/**
 * Log when the user starts a search from the home search bar or topic chips.
 * Best-effort; failures are ignored.
 */
export function logSearchStart({ query, source, chipLabel = null }) {
  const q = String(query || '').trim();
  const src = String(source || '').trim();
  if (!q || !SOURCES.has(src)) return;

  const body = { query: q, source: src };
  if (chipLabel != null && String(chipLabel).trim()) {
    body.chipLabel = String(chipLabel).trim();
  }

  void fetch('/api/search-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}