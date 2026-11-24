/**
 * Server-side blocklist for clearly prohibited free-text (search / follow-up).
 * Complements model guardrails when the API returns a generic failure instead of a refusal JSON.
 */
const PROHIBITED_PATTERNS = [
  /\b(kids?|children|child|minors?|underage|toddler|preteen|teen(?:ager)?s?)\b[\s\S]{0,48}\b(xxx|porn|pornography|nudes?|hentai|nsfw|onlyfans|sex\s*tape)/i,
  /\b(xxx|porn|pornography|nudes?|hentai|nsfw)\b[\s\S]{0,48}\b(kids?|children|child|minors?|underage)/i,
  /\bhow\s+to\s+(?:make|build|create)\b[\s\S]{0,40}\b(bomb|explosive|meth|weapon)/i,
];

export function detectProhibitedUserInput(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return PROHIBITED_PATTERNS.some((re) => re.test(t));
}