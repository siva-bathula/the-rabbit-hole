import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import exploreRouter from './routes/explore.js';
import expandRouter from './routes/expand.js';
import explainRouter from './routes/explain.js';
import deepenRouter from './routes/deepen.js';
import trendingRouter from './routes/trending.js';
import quizRouter from './routes/quiz.js';
import shareRouter from './routes/share.js';
import compareRouter from './routes/compare.js';
import { followupPostHandler } from './routes/followup.js';
import { startTrendingRefresh } from './services/trending.js';
import { probeGeminiFlashGraphOnStartup } from './services/deepseek.js';
import { startLlmMetrics } from './lib/llmMetrics.js';
import { FirestoreRateLimitStore } from './lib/rateLimitFirestoreStore.js';
import { resolveTurnstileSessionSignerSecret } from './lib/rhTurnstileSession.js';
import { createRequireTurnstile } from './middleware/requireTurnstile.js';
import { createTurnstileSessionPostHandler } from './routes/turnstileSession.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

// Help diagnose surprise exits (listen failures, stray async throws, etc.)
process.on('unhandledRejection', (reason, p) => {
  console.error('[process] unhandledRejection:', reason, p);
});
process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException:', err);
});

// Trust the first proxy hop (GCP Cloud Run / any load balancer)
// so express-rate-limit can read the real client IP from X-Forwarded-For
app.set('trust proxy', 1);
const nodeEnv = String(process.env.NODE_ENV ?? '').trim();
const IS_DEV = nodeEnv !== 'production';

// ── Security headers (every response) ────────────────────────────────────────
// Prevent the app from being embedded in any iframe (clickjacking protection).
app.use((_, res, next) => {
  res.set('X-Frame-Options', 'DENY');
  res.set('Content-Security-Policy', "frame-ancestors 'none'");
  next();
});

// ── CORS ─────────────────────────────────────────────────────────────────────
// Dev: allow the Vite dev server.
// Production: allow our domain(s) via ALLOWED_ORIGINS (comma-separated), plus
// Firebase Hosting defaults (*.web.app / *.firebaseapp.com from GCLOUD_PROJECT).
// Same-site requests (Origin host matches Host) are always allowed so alternate
// entry URLs (Firebase default domains, Cloud Run URL) work without listing every host.
function buildProductionAllowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || 'https://rabbitholeorg.org,https://www.rabbitholeorg.org')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const projectId = String(process.env.GCLOUD_PROJECT ?? '').trim();
  if (projectId) {
    fromEnv.push(`https://${projectId}.web.app`, `https://${projectId}.firebaseapp.com`);
  }
  return new Set(fromEnv);
}

const allowedOrigins = IS_DEV ? new Set(['http://localhost:3000']) : buildProductionAllowedOrigins();

/** Host the client used for this request (respects trust proxy / Firebase / Cloudflare). */
function requestHost(req) {
  const forwarded = req?.get?.('X-Forwarded-Host');
  const raw = forwarded ? forwarded.split(',')[0].trim() : req?.get?.('Host') ?? '';
  return raw.split(':')[0].toLowerCase();
}

/** Origin matches the request host — legitimate same-site browser traffic on any deploy URL. */
function isSameSiteOrigin(origin, req) {
  if (!req || !origin) return false;
  try {
    return new URL(origin).hostname.toLowerCase() === requestHost(req);
  } catch {
    return false;
  }
}

/** Local dev only — production must not accept cross-origin calls from localhost. */
function isLocalhostOrigin(origin) {
  return /^https?:\/\/localhost(:\d+)?$/.test(origin);
}

/** Used by CORS and production POST /api origin enforcement. */
function isAllowedBrowserOrigin(origin, req) {
  if (!origin || typeof origin !== 'string') return false;
  if (IS_DEV && isLocalhostOrigin(origin)) return true;
  if (isSameSiteOrigin(origin, req)) return true;
  return allowedOrigins.has(origin);
}

// Pass req into origin callback (cors package does not provide it by default).
app.use((req, res, next) => {
  cors({
    origin(origin, cb) {
      // No Origin header → same-origin browser nav or non-browser client → allow.
      if (!origin) return cb(null, true);
      if (isAllowedBrowserOrigin(origin, req)) return cb(null, true);
      // Return a plain false (not an Error) so cors sends a 403 quietly
      // without bubbling an unhandled error through Express.
      cb(null, false);
    },
    credentials: false,
    exposedHeaders: ['X-RH-Turnstile-Session'],
    allowedHeaders: ['Content-Type', 'X-RH-Turnstile-Session', 'X-Turnstile-Token'],
  })(req, res, next);
});

const useFirestoreRateLimitFlag = String(process.env.USE_FIRESTORE_RATE_LIMIT ?? '').trim();
const useFirestoreRateLimit =
  useFirestoreRateLimitFlag === '1' ||
  (nodeEnv === 'production' && useFirestoreRateLimitFlag !== '0');

console.log(
  '[rate-limit] NODE_ENV=%s USE_FIRESTORE_RATE_LIMIT=%s → store=%s',
  nodeEnv || '(unset)',
  useFirestoreRateLimitFlag || '(unset)',
  useFirestoreRateLimit ? 'firestore (collection api_rate_limits)' : 'memory',
);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait a minute before trying again.' },
  ...(useFirestoreRateLimit
    ? { store: new FirestoreRateLimitStore(), passOnStoreError: true }
    : {}),
});

const disableTurnstile = String(process.env.DISABLE_TURNSTILE ?? '').trim() === '1';
const turnstileSecret = String(process.env.TURNSTILE_SECRET_KEY ?? '').trim();

/** Skip verification only when explicitly disabled or in local dev without a secret. */
let requireTurnstile;
if (disableTurnstile) {
  console.log('[turnstile] DISABLE_TURNSTILE=1 — AI route verification skipped');
  requireTurnstile = (_req, _res, next) => next();
} else if (!turnstileSecret) {
  if (IS_DEV) {
    console.log('[turnstile] No TURNSTILE_SECRET_KEY — verification skipped (development)');
    requireTurnstile = (_req, _res, next) => next();
  } else {
    console.error(
      '[turnstile] Production requires TURNSTILE_SECRET_KEY or DISABLE_TURNSTILE=1 — AI routes will fail until configured.',
    );
    requireTurnstile = (_req, res) =>
      res.status(503).json({ error: 'Server misconfiguration: Turnstile secret is not set.' });
  }
} else {
  const sessionSignerSecret = resolveTurnstileSessionSignerSecret(turnstileSecret, {
    disableTurnstile,
    isDev: IS_DEV,
  });
  requireTurnstile = createRequireTurnstile({
    secretKey: turnstileSecret,
    sessionSignerSecret,
  });
}

app.use(express.json());

app.post(
  '/api/turnstile/session',
  createTurnstileSessionPostHandler({
    turnstileSecret,
    disableTurnstile,
    isDev: IS_DEV,
  }),
);

// Production: POST /api must declare an allowed Origin (blocks naive curl/Postman without Origin).
// Does not stop clients that forge Origin; pairs with Turnstile on LLM routes.
app.use((req, res, next) => {
  if (IS_DEV) return next();
  if (req.method !== 'POST' || !req.path.startsWith('/api')) return next();
  const origin = req.get('Origin');
  if (!isAllowedBrowserOrigin(origin, req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
});

// Apply limiter to every /api request (explicit guard — same as mount, avoids edge cases with sub-mount paths).
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  return apiLimiter(req, res, next);
});

app.use('/api/explore', requireTurnstile, exploreRouter);
app.use('/api/expand', requireTurnstile, expandRouter);
app.use('/api/explain', requireTurnstile, explainRouter);
app.use('/api/deepen', requireTurnstile, deepenRouter);
app.use('/api/trending', trendingRouter);
app.use('/api/quiz', requireTurnstile, quizRouter);
app.use('/api/share', shareRouter);
app.use('/api/compare', requireTurnstile, compareRouter);
app.post('/api/followup', requireTurnstile, followupPostHandler);
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// Block well-known vulnerability scanner paths before they hit the SPA fallback.
// Without this every path returns 200 (React HTML), which tells bots the server
// is "interesting". A 404 here makes the server look boring and reduces noise.
const SCANNER_RE = /\.(php|asp|aspx|jsp|cgi|env|git|sql|bak|log|cfg|ini|xml|yaml|yml|sh|bash)$|\/wp-|\/wordpress|\/phpinfo|\/xmlrpc|\/\.env|\/admin\/|\/phpmyadmin|\/cgi-bin/i;

app.use((req, res, next) => {
  if (SCANNER_RE.test(req.path)) return res.status(404).end();
  next();
});

// Serve the Vite build when present — even in dev, so http://localhost:4000/ works after `npm run build`.
// (Without a build, only /api/* is available unless you use the Vite dev server on :3000.)
const staticPath = path.join(__dirname, 'public');
const publicIndex = path.join(staticPath, 'index.html');
const hasSpaBuild = fs.existsSync(publicIndex);

if (hasSpaBuild) {
  app.use(express.static(staticPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(publicIndex);
  });
} else if (!IS_DEV) {
  console.warn(
    '[server] No React build at server/public/index.html — run `npm run build` from the repo root before production start.',
  );
}

// Omit host so Node binds dual-stack where supported (fixes some Windows setups where "localhost" uses IPv6).
const server = app.listen(PORT, () => {
  console.log(`Rabbit Hole server running on http://127.0.0.1:${PORT} (and your LAN interface)`);
  // Warm the cache immediately, then refresh every 30 minutes
  startTrendingRefresh();
  startLlmMetrics();
  probeGeminiFlashGraphOnStartup().catch((e) =>
    console.error('[gemini] startup probe unexpected error:', e?.message || e),
  );
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(
      `[server] Port ${PORT} is already in use — another process is bound there. Stop it or set PORT in .env.`,
    );
  } else {
    console.error('[server] HTTP server error:', err);
  }
  process.exit(1);
});
