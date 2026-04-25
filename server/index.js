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
import { followupPostHandler } from './routes/followup.js';
import { startTrendingRefresh } from './services/trending.js';
import { probeGeminiFlashGraphOnStartup } from './services/deepseek.js';
import { startLlmMetrics } from './lib/llmMetrics.js';

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
const IS_DEV = process.env.NODE_ENV !== 'production';

// ── Security headers (every response) ────────────────────────────────────────
// Prevent the app from being embedded in any iframe (clickjacking protection).
app.use((_, res, next) => {
  res.set('X-Frame-Options', 'DENY');
  res.set('Content-Security-Policy', "frame-ancestors 'none'");
  next();
});

// ── CORS ─────────────────────────────────────────────────────────────────────
// Dev: allow the Vite dev server.
// Production: allow only our own domain(s), configured via ALLOWED_ORIGINS env
// var (comma-separated). Defaults to rabbitholeorg.org. Any other origin is
// rejected — this blocks third-party sites from calling our API via the browser.
const allowedOrigins = IS_DEV
  ? new Set(['http://localhost:3000'])
  : new Set(
      (process.env.ALLOWED_ORIGINS || 'https://rabbitholeorg.org')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    );

app.use(
  cors({
    origin: (origin, cb) => {
      // No Origin header → same-origin browser nav or non-browser client → allow.
      if (!origin) return cb(null, true);
      // Localhost is always safe — external clients cannot spoof it.
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      // Return a plain false (not an Error) so cors sends a 403 quietly
      // without bubbling an unhandled error through Express.
      cb(null, false);
    },
    credentials: false,
  })
);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait a minute before trying again.' },
});

app.use(express.json());
app.use('/api', apiLimiter);

app.use('/api/explore', exploreRouter);
app.use('/api/expand', expandRouter);
app.use('/api/explain', explainRouter);
app.use('/api/deepen', deepenRouter);
app.use('/api/trending', trendingRouter);
app.use('/api/quiz', quizRouter);
app.use('/api/share', shareRouter);
app.post('/api/followup', followupPostHandler);
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
