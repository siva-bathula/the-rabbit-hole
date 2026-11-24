/**
 * Server-side blocklist for clearly prohibited free-text (search / follow-up).
 * Complements model guardrails when the API returns a generic failure instead of a refusal JSON.
 */
import {
  PROHIBITED_COMPACT_TERMS,
  PROHIBITED_PATTERNS,
  PROHIBITED_TOKEN_TERMS,
} from './prohibitedTermsLists.js';

const TOKEN_SET = new Set(PROHIBITED_TOKEN_TERMS);
const COMPACT_SET = new Set([
  ...PROHIBITED_TOKEN_TERMS,
  ...PROHIBITED_COMPACT_TERMS,
]);

/** Min length for compact substring match — avoids "rape" in "grape", "anal" in "analog". */
const COMPACT_SUBSTRING_MIN = 7;

function normalizeCompact(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function detectProhibitedUserInput(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (PROHIBITED_PATTERNS.some((re) => re.test(t))) return true;

  const compact = normalizeCompact(t);
  if (COMPACT_SET.has(compact)) return true;

  for (const word of tokenize(t)) {
    if (TOKEN_SET.has(word)) return true;
  }

  for (const term of COMPACT_SET) {
    if (term.length >= COMPACT_SUBSTRING_MIN && compact.includes(term)) return true;
  }

  return false;
}