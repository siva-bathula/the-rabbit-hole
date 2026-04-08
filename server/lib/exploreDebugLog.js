/**
 * Verbose explore / generateNodes logging for local debugging.
 * Enable explicitly: DEBUG_EXPLORE=1
 * Or rely on non-production NODE_ENV (typical `npm run dev`).
 */
export function isExploreDebug() {
  return process.env.DEBUG_EXPLORE === '1' || process.env.NODE_ENV !== 'production';
}
