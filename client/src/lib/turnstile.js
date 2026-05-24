/** Cloudflare Turnstile (invisible) — serialized token minting for AI POST bodies. */

import { captureRhTurnstileSessionFromResponse, ensureRhTurnstileSession } from './turnstileSession.js';

// API revision stays `v0`; do not proxy/cache this script (Turnstile requirement).
// https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
const TURNSTILE_API_REVISION = 'v0';
const SCRIPT_SRC = `https://challenges.cloudflare.com/turnstile/${TURNSTILE_API_REVISION}/api.js?render=explicit`;

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
    document.body.appendChild(el);
  }
  // Always refresh styles (older builds used 0×0 which breaks the iframe).
  Object.assign(el.style, {
    position: 'fixed',
    width: '320px',
    height: '90px',
    overflow: 'hidden',
    opacity: '0',
    pointerEvents: 'none',
    left: '-320px',
    top: '0',
    zIndex: '-1',
  });
  return el;
}

/** Wait two frames so Turnstile can attach its iframe before execute(). */
function afterNextPaint(fn) {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
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

          const onErr = (errorCode) => {
            const p = pending;
            pending = null;
            const host =
              typeof window !== 'undefined' ? window.location.hostname : '';
            console.warn('[turnstile] widget error', { errorCode, host });

            /** Turnstile may pass numeric strings (e.g. `"300031"`); normalize for reliable matching. */
            const codeNorm =
              errorCode == null || errorCode === ''
                ? NaN
                : typeof errorCode === 'number'
                  ? errorCode
                  : Number.parseInt(String(errorCode), 10);
            const codeFamily =
              Number.isFinite(codeNorm) ? Math.floor(codeNorm / 1000) : NaN;

            let detail = '';
            if (codeNorm === 110200) {
              detail = ` Domain not allowed for this site key (browser reports hostname "${host}"). In Turnstile → Hostname Management add this exact hostname — often you must add \`::1\` separately from \`localhost\`. Or use http://127.0.0.1:${window.location.port || 'PORT'} in the address bar.`;
            } else if (codeNorm === 200500) {
              detail =
                ' Challenge iframe failed to load — disable ad blockers for this page, allow challenges.cloudflare.com, or try another browser. A broken integration can also cause this (try rebuilding the client after updating turnstile.js).';
            } else if (
              codeNorm === 110100 ||
              codeNorm === 110110 ||
              codeNorm === 400020
            ) {
              detail =
                ' Check that VITE_TURNSTILE_SITE_KEY matches the site key shown in the Cloudflare Turnstile dashboard for this widget.';
            } else if (codeNorm === 400070) {
              detail = ' This site key is disabled in the Cloudflare Turnstile dashboard.';
            } else if (codeFamily === 300 || codeFamily === 600) {
              // 300031, 600010, … — trailing digits are internal per Cloudflare; means "generic challenge failure".
              detail =
                ' Cloudflare flagged this session during the invisible check (often VPN/browser extensions/private mode/network). Retry or refresh; try another browser, disable extensions, avoid VPN/proxy, or switch networks.';
            } else if (errorCode != null && errorCode !== '') {
              detail = ` See Cloudflare Turnstile client-side error codes (code ${errorCode}).`;
            }

            const looksLocal =
              typeof window !== 'undefined' &&
              /^(localhost|127\.0\.0\.1|::1)$/i.test(host);
            const genericLocalHint = looksLocal
              ? ' When creating the Turnstile widget, choose type Invisible (a Managed-widget site key may not work with invisible rendering in code). Or use dummy invisible site key 1x00000000000000000000BB + secret 1x0000000000000000000000000000000AA for dev — see Cloudflare Turnstile testing docs.'
              : '';

            const codePart =
              errorCode != null && errorCode !== ''
                ? ` (error code ${errorCode})`
                : ' (token expired or challenge error)';
            p?.reject(new Error(`Turnstile verification failed${codePart}.${detail}${genericLocalHint}`));
          };

          try {
            const runExecute = () => {
              try {
                window.turnstile.execute(widgetId);
              } catch (e) {
                const p = pending;
                pending = null;
                reject(e instanceof Error ? e : new Error(String(e)));
              }
            };

            if (widgetId == null) {
              widgetId = window.turnstile.render(el, {
                sitekey: siteKey,
                size: 'invisible',
                execution: 'execute',
                callback: (token) => {
                  const p = pending;
                  pending = null;
                  p?.resolve(token);
                },
                'error-callback': onErr,
                'expired-callback': onErr,
              });
              afterNextPaint(runExecute);
            } else {
              window.turnstile.reset(widgetId);
              afterNextPaint(runExecute);
            }
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

/** Wrap fetch so sliding Turnstile session headers update sessionStorage after AI calls. */
export async function fetchWithTurnstile(url, init) {
  const res = await fetch(url, init);
  captureRhTurnstileSessionFromResponse(res);
  return res;
}

/** Adds `turnstileSession` when Turnstile + session exchange are configured (amortizes widget latency). */
export async function withTurnstilePayload(payload) {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();
  if (!siteKey) return payload;
  const session = await ensureRhTurnstileSession(siteKey);
  return { ...payload, turnstileSession: session };
}
