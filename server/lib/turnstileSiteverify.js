/** Shared Cloudflare Turnstile siteverify call. */

// API revision stays `v0`: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
const TURNSTILE_API_REVISION = 'v0';
const SITEVERIFY_URL = `https://challenges.cloudflare.com/turnstile/${TURNSTILE_API_REVISION}/siteverify`;

/**
 * @param {string} responseToken
 * @param {string} secretKey
 * @param {string | undefined} remoteIp
 * @returns {Promise<boolean>}
 */
export async function verifyTurnstileResponse(responseToken, secretKey, remoteIp) {
  try {
    const r = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: secretKey,
        response: responseToken.trim(),
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    });
    const data = await r.json();
    return Boolean(data.success);
  } catch (e) {
    console.error('[turnstile] siteverify request error:', e?.message || e);
    return false;
  }
}
