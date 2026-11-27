/**
 * Verbose follow-up logging (raw model text, parse path).
 * On when DEBUG_FOLLOWUP=1, or DISABLE_TURNSTILE=1 (local dev), unless DEBUG_FOLLOWUP=0.
 */
export function isFollowUpDebug() {
  const flag = String(process.env.DEBUG_FOLLOWUP ?? '').trim();
  if (flag === '0' || /^false$/i.test(flag)) return false;
  if (flag === '1' || /^true$/i.test(flag)) return true;
  return process.env.DISABLE_TURNSTILE === '1';
}

export function logFollowUpDebug(label, payload) {
  if (!isFollowUpDebug()) return;
  if (payload === undefined) {
    console.log(`[followup][debug] ${label}`);
    return;
  }
  console.log(`[followup][debug] ${label}`, payload);
}