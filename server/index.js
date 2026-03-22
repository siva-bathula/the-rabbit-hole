import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import exploreRouter from './routes/explore.js';
import expandRouter from './routes/expand.js';
import explainRouter from './routes/explain.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;
const IS_DEV = process.env.NODE_ENV !== 'production';

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please wait a minute before trying again.' },
});

// In dev the Vite dev server runs separately, so allow cross-origin.
// In production, the React build is served from the same origin — no CORS needed.
if (IS_DEV) {
  app.use(cors({ origin: 'http://localhost:3000' }));
}

app.use(express.json());
app.use('/api', apiLimiter);

app.use('/api/explore', exploreRouter);
app.use('/api/expand', expandRouter);
app.use('/api/explain', explainRouter);
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
});
