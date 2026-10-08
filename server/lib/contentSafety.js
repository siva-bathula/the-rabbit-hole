/** @typedef {'content_safety' | 'refused'} RefusalCode */

export const CONTENT_SAFETY_USER_MESSAGE =
  "We can't help with that request. Rabbit Hole is for safe, general learning — try a different question or topic.";

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

/** @param {import('express').Response} res */
export function sendContentSafetyResponse(res) {
  return res.status(422).json({
    error: CONTENT_SAFETY_USER_MESSAGE,
    code: 'content_safety',
  });
}

/**
 * @param {import('express').Response} res
 * @param {unknown} raw
 * @param {string} routeLabel
 * @param {string} fallbackMessage
 */
export function sendRouteError(res, err, routeLabel, fallbackMessage) {
  if (isContentSafetyError(err)) {
    return sendContentSafetyResponse(res);
  }
  console.error(`[${routeLabel}]`, err instanceof Error ? err.message : err);
  return res.status(500).json({ error: fallbackMessage });
}

/**
 * Graph JSON `{ error: "..." }` from Gemini — explore may receive without throwing.
 * @param {import('express').Response} res
 * @param {unknown} raw
 */
export function respondIfGraphSafetyPayload(res, raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.error !== 'string') return false;
  if (!isContentSafetyMessage(raw.error)) return false;
  sendContentSafetyResponse(res);
  return true;
}
