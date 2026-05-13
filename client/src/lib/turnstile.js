/** Cloudflare Turnstile (invisible) — serialized token minting for AI POST bodies. */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise = null;

function loadTurnstileScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Turnstile requires a browser'));
  }
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      // Dynamically inserted scripts default to async=true; Turnstile rejects that combination with turnstile.ready(). We use onload instead of ready(), but keep async=false to match explicit-render expectations.
      s.async = false;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load Turnstile'));
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

function ensureHostEl() {
  let el = document.getElementById('rh-turnstile-host');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rh-turnstile-host';
    el.setAttribute('aria-hidden', 'true');
    Object.assign(el.style, {
      position: 'fixed',
      width: '0',
      height: '0',
      overflow: 'hidden',
      opacity: '0',
      pointerEvents: 'none',
      left: '-9999px',
    });
    document.body.appendChild(el);
  }
  return el;
}

let widgetId = null;
/** @type {{ resolve: (t: string) => void, reject: (e: Error) => void } | null} */
let pending = null;

/** Serialize Turnstile runs so one invisible widget is safe under concurrent API calls. */
let chain = Promise.resolve();

function runTurnstileOnce(siteKey) {
  return loadTurnstileScript()
    .then(
      () =>
        new Promise((resolve, reject) => {
          pending = { resolve, reject };
          const el = ensureHostEl();

          const onErr = (code) => {
            const p = pending;
            pending = null;
            if (code != null) console.warn('[turnstile] widget error', code);
            const local =
              typeof window !== 'undefined' &&
              /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
            const hint = local
              ? ' For local testing: add `localhost` (and/or `127.0.0.1`) to your Turnstile widget hostnames in Cloudflare, or use Cloudflare’s dummy site + secret keys from their Turnstile testing docs.'
              : '';
            p?.reject(new Error(`Turnstile verification failed.${hint}`));
          };

          try {
            if (widgetId == null) {
              widgetId = window.turnstile.render(el, {
                sitekey: siteKey,
                size: 'invisible',
                callback: (token) => {
                  const p = pending;
                  pending = null;
                  p?.resolve(token);
                },
                'error-callback': onErr,
                'expired-callback': onErr,
              });
            } else {
              window.turnstile.reset(widgetId);
            }
            window.turnstile.execute(widgetId);
          } catch (e) {
            const p = pending;
            pending = null;
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        }),
    );
}

export async function getTurnstileToken(siteKey) {
  const done = chain.then(() => runTurnstileOnce(siteKey));
  chain = done.catch(() => {});
  return done;
}

/** Adds `turnstileToken` when `VITE_TURNSTILE_SITE_KEY` is set (production / optional dev). */
export async function withTurnstilePayload(payload) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  if (!siteKey) return payload;
  const token = await getTurnstileToken(siteKey);
  return { ...payload, turnstileToken: token };
}
