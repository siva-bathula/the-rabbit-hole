export const CONTENT_SAFETY_KIND = 'content_safety';

export function isContentSafetyCode(code) {
  return code === CONTENT_SAFETY_KIND;
}

/** @param {{ error?: string, code?: string } | null | undefined} data */
export function errorKindFromPayload(data) {
  return isContentSafetyCode(data?.code) ? CONTENT_SAFETY_KIND : 'error';
}

/** @param {{ error?: string, code?: string } | null | undefined} data @param {string} fallback */
export function messageFromPayload(data, fallback) {
  return data?.error || fallback;
}

/** Attach API `code` to a thrown Error for UI styling. */
export function apiErrorFromPayload(data, fallback) {
  const err = new Error(messageFromPayload(data, fallback));
  if (data?.code) err.code = data.code;
  return err;
}

export function errorKindFromError(err) {
  return isContentSafetyCode(err?.code) ? CONTENT_SAFETY_KIND : 'error';
}

/** @param {Response} res @param {string} fallback */
export async function parseApiResponse(res, fallback) {
  const data = await res.json();
  if (!res.ok || data?.error) {
    throw apiErrorFromPayload(data, fallback);
  }
  return data;
}
