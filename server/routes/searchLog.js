import { Router } from 'express';
import { isSearchLogEnabled, recordSearchLog, SEARCH_SOURCES } from '../lib/searchLog.js';

const router = Router();

/** POST /api/search-log — log search-bar or chip search starts (no Turnstile). */
router.post('/', (req, res) => {
  if (!isSearchLogEnabled()) {
    return res.status(204).end();
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const query = String(body.query || '').trim();
  const source = String(body.source || '').trim();
  const chipLabel =
    body.chipLabel == null || body.chipLabel === ''
      ? null
      : String(body.chipLabel).trim();

  if (!query) {
    return res.status(400).json({ error: 'query is required' });
  }
  if (!SEARCH_SOURCES.includes(source)) {
    return res.status(400).json({ error: 'invalid source' });
  }

  void recordSearchLog({ query, source, chipLabel });
  return res.status(204).end();
});

export default router;