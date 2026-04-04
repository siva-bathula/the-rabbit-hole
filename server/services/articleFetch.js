/**
 * Best-effort fetch of public article HTML for trending explore grounding.
 * SSRF-hardened: only http(s), block obvious private/local targets on the request URL.
 */

const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_EXCERPT_CHARS = 12000;
const FETCH_TIMEOUT_MS = 14000;

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function isPrivateOrLocalHostname(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local')) return true;
  if (h === '0.0.0.0') return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = ipv4.exec(h);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = Number(m[3]);
    const d = Number(m[4]);
    if ([a, b, c, d].some((n) => n > 255)) return true;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 255) return true;
  }

  if (h.includes(':') && (h.startsWith('[') || h.includes('::'))) {
    const compact = h.replace(/^\[|\]$/g, '');
    if (compact === '::1') return true;
    if (/^fe[c-f]/i.test(compact)) return true;
    if (compact.toLowerCase().startsWith('fd')) return true;
  }

  return false;
}

/**
 * @param {string} urlString
 * @returns {boolean}
 */
export function isSafeHttpUrlForServerFetch(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;
  let u;
  try {
    u = new URL(urlString.trim());
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (isPrivateOrLocalHostname(u.hostname)) return false;
  return true;
}

/**
 * @param {string} articleUrl
 * @returns {Promise<{ ok: true, text: string } | { ok: false }>}
 */
export async function fetchArticlePlainText(articleUrl) {
  if (!isSafeHttpUrlForServerFetch(articleUrl)) return { ok: false };

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(articleUrl, {
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RabbitHole/1.0; +https://rabbitholeorg.org)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) return { ok: false };

    const reader = res.body?.getReader();
    if (!reader) {
      const text = await res.text();
      const slice = text.slice(0, MAX_RESPONSE_BYTES);
      const plain = stripHtml(slice);
      const excerpt = plain.slice(0, MAX_EXCERPT_CHARS);
      return excerpt.length > 80 ? { ok: true, text: excerpt } : { ok: false };
    }

    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total <= MAX_RESPONSE_BYTES) chunks.push(value);
        else {
          const room = MAX_RESPONSE_BYTES - (total - value.length);
          if (room > 0) chunks.push(value.slice(0, room));
          break;
        }
      }
    }

    const buf = Buffer.concat(chunks.map((u8) => Buffer.from(u8)));
    const html = buf.toString('utf8', 0, Math.min(buf.length, MAX_RESPONSE_BYTES));
    const plain = stripHtml(html);
    const excerpt = plain.slice(0, MAX_EXCERPT_CHARS);
    return excerpt.length > 80 ? { ok: true, text: excerpt } : { ok: false };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {string} baseGrounding RSS snippet + optional Source URL line
 * @param {string} articleExcerpt
 * @returns {string}
 */
export function mergeArticleIntoGrounding(baseGrounding, articleExcerpt) {
  const base = typeof baseGrounding === 'string' ? baseGrounding.trim() : '';
  const ex = typeof articleExcerpt === 'string' ? articleExcerpt.trim() : '';
  if (!ex) return base;
  if (!base) {
    return `ARTICLE EXCERPT (from source link; truncated):\n\n${ex}`;
  }
  return `ARTICLE EXCERPT (from source link; truncated):\n\n${ex}\n\n---\n\nRSS / feed context:\n\n${base}`;
}
