/** Shared Cloudflare Turnstile siteverify call. */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * @param {string} responseToken
 * @param {string} secretKey
 * @param {string | undefined} remoteIp
 * @returns {Promise<boolean>}
 */
export async function verifyTurnstileResponse(responseToken, secretKey, remoteIp) {
  const params = new URLSearchParams();
  params.set('secret', secretKey);
  params.set('response', responseToken.trim());
  if (remoteIp) params.set('remoteip', remoteIp);

  try {
    const r = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = await r.json();
    return Boolean(data.success);
  } catch (e) {
    console.error('[turnstile] siteverify request error:', e?.message || e);
    return false;
  }
}
