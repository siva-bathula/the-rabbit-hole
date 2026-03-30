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
import { startTrendingRefresh } from './services/trending.js';

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
      // Requests with no Origin header (same-origin browser nav, curl, etc.)
      // are not cross-origin CORS requests — let them through.
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      cb(Object.assign(new Error('CORS: origin not allowed'), { status: 403 }));
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
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

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
});
