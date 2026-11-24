/** @typedef {'content_safety' | 'refused'} RefusalCode */

import { recordMisuseAttempt } from './misuseLog.js';

export const CONTENT_SAFETY_TITLE = 'Misuse warning';

export const CONTENT_SAFETY_USER_MESSAGE =
  'This request violates Rabbit Hole’s rules. Misusing the site to seek harmful, illegal, or abusive content is not allowed. Repeated misuse may lead to access being restricted. Please use Rabbit Hole only for safe, general learning — try a different question or topic.';

export class ContentSafetyError extends Error {
  constructor(rawMessage) {
    super(typeof rawMessage === 'string' ? rawMessage : 'Content safety violation');
    this.name = 'ContentSafetyError';
  }
}

/** Model / guardrail refusal text (not infra failures). */
export function isContentSafetyMessage(message) {
  if (!message || typeof message !== 'string') return false;
  const m = message.toLowerCase();
  return (
    /content safety|cannot be processed as it violates|violates content safety guidelines/i.test(
      message,
    ) ||
    /safety filter|blocked due to|prompt was blocked|candidate was blocked|harmful content/i.test(m) ||
    /refus(e|al)|not allowed|can't help with that|cannot help with/i.test(m)
  );
}

/** Gemini SDK / API-level blocks when response.text() fails or finish reason is SAFETY. */
export function isLikelyGeminiSafetyBlock(err) {
  if (!err) return false;
  const msg = String(err.message || err).toLowerCase();
  return (
    msg.includes('prohibited_content') ||
    msg.includes('prohibited content') ||
    msg.includes('text not available') ||
    msg.includes('safety') ||
    msg.includes('blockreason') ||
    msg.includes('no content') ||
    (msg.includes('candidate') && msg.includes('blocked')) ||
    (msg.includes('prompt') && msg.includes('blocked')) ||
    (msg.includes('googlegenerativeai error') && msg.includes('blocked'))
  );
}

/** Turn Gemini / guardrail failures into ContentSafetyError for consistent API + logging. */
export function normalizeToContentSafetyError(err) {
  if (!err) return err;
  if (isContentSafetyError(err)) return err;
  if (isLikelyGeminiSafetyBlock(err) || isContentSafetyMessage(String(err.message || err))) {
    const message = err instanceof Error ? err.message : String(err);
    const out = new ContentSafetyError(message);
    if (err instanceof Error && err.name) out.name = err.name;
    return out;
  }
  return err;
}

export function isContentSafetyError(err) {
  if (!err) return false;
  if (err instanceof ContentSafetyError || err.name === 'ContentSafetyError') return true;
  if (err.name === 'GeminiGraphGuardrailRefusal') return true;
  return isContentSafetyMessage(err.message) || isLikelyGeminiSafetyBlock(err);
}

/** @param {unknown} parsed */
export function throwIfSafetyPayload(parsed) {
  if (parsed && typeof parsed === 'object' && typeof parsed.error === 'string') {
    const errText = parsed.error.trim();
    if (!errText) return;
    throw new ContentSafetyError(errText);
  }
}

/**
 * @param {import('express').Response} res
 * @param {{ req?: import('express').Request, queryText?: string, source?: 'search' | 'followup' }} [logContext]
 */
export function sendContentSafetyResponse(res, logContext) {
  if (logContext?.queryText?.trim()) {
    void recordMisuseAttempt({
      req: logContext.req,
      queryText: logContext.queryText,
      source: logContext.source === 'followup' ? 'followup' : 'search',
    });
  }

  return res.status(422).json({
    error: CONTENT_SAFETY_USER_MESSAGE,
    code: 'content_safety',
    title: CONTENT_SAFETY_TITLE,
  });
}

/**
 * @param {import('express').Response} res
 * @param {unknown} raw
 * @param {string} routeLabel
 * @param {string} fallbackMessage
 * @param {{ req?: import('express').Request, queryText?: string, source?: 'search' | 'followup' }} [logContext]
 */
export function sendRouteError(res, err, routeLabel, fallbackMessage, logContext) {
  const safetyErr = normalizeToContentSafetyError(err);
  if (isContentSafetyError(safetyErr)) {
    if (String(process.env.NODE_ENV ?? '').trim() !== 'production') {
      console.log(`[${routeLabel}] content safety refusal`);
    }
    return sendContentSafetyResponse(res, logContext);
  }
  const msg = safetyErr instanceof Error ? safetyErr.message : String(safetyErr);
  console.error(`[${routeLabel}]`, msg);
  if (/timeout|timed out|aborted|ETIMEDOUT/i.test(msg)) {
    return res.status(503).json({
      error: 'That explanation took too long. Try again, or switch to a shorter explain mode.',
    });
  }
  return res.status(500).json({ error: fallbackMessage });
}

/**
 * Graph JSON `{ error: "..." }` from Gemini — explore may receive without throwing.
 * @param {import('express').Response} res
 * @param {unknown} raw
 * @param {{ req?: import('express').Request, queryText?: string, source?: 'search' | 'followup' }} [logContext]
 */
export function respondIfGraphSafetyPayload(res, raw, logContext) {
  if (!raw || typeof raw !== 'object' || typeof raw.error !== 'string') return false;
  const errText = raw.error.trim();
  if (!errText) return false;
  // Graph JSON uses `{ error }` only for guardrail refusals (never mixed with nodes/edges).
  sendContentSafetyResponse(res, logContext);
  return true;
}
