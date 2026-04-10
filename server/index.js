import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

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

// Serve the React build in production
if (!IS_DEV) {
  const staticPath = path.join(__dirname, 'public');
  app.use(express.static(staticPath));
  // SPA fallback — let React Router handle all non-API routes
  app.get('*', (_, res) => res.sendFile(path.join(staticPath, 'index.html')));
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Rabbit Hole server running on http://0.0.0.0:${PORT}`);
  // Warm the cache immediately, then refresh every 30 minutes
  startTrendingRefresh();
  probeGeminiFlashGraphOnStartup().catch((e) =>
    console.error('[gemini] startup probe unexpected error:', e?.message || e),
  );
});
