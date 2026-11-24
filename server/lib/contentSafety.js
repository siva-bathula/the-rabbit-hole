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
  return /content safety|cannot be processed as it violates|violates content safety guidelines/i.test(
    message,
  );
}

export function isContentSafetyError(err) {
  if (!err) return false;
  if (err instanceof ContentSafetyError || err.name === 'ContentSafetyError') return true;
  if (err.name === 'GeminiGraphGuardrailRefusal') return true;
  return isContentSafetyMessage(err.message);
}

/** @param {unknown} parsed */
export function throwIfSafetyPayload(parsed) {
  if (parsed && typeof parsed === 'object' && typeof parsed.error === 'string') {
    if (isContentSafetyMessage(parsed.error)) {
      throw new ContentSafetyError(parsed.error);
    }
    throw new Error(parsed.error);
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
  if (isContentSafetyError(err)) {
    return sendContentSafetyResponse(res, logContext);
  }
  const msg = err instanceof Error ? err.message : String(err);
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
  if (!isContentSafetyMessage(raw.error)) return false;
  sendContentSafetyResponse(res, logContext);
  return true;
}
