/** Client IP for logging / rate limits (trust proxy must be configured on the app). */
export function resolveClientIp(req) {
  const cf = req?.get?.('CF-Connecting-IP')?.trim();
  if (cf) return normalizeIp(cf);

  const trueClient = req?.get?.('True-Client-IP')?.trim();
  if (trueClient) return normalizeIp(trueClient);

  const forwarded = req?.get?.('X-Forwarded-For');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }

  const ip = req?.ip || req?.socket?.remoteAddress;
  if (ip) return normalizeIp(String(ip));

  return null;
}

function normalizeIp(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  // Node often reports IPv4-mapped IPv6 as ::ffff:a.b.c.d
  const v4Mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(s);
  if (v4Mapped) s = v4Mapped[1];
  if (s.startsWith('::ffff:')) s = s.slice(7);
  return s || null;
}