import { Router } from 'express';
import { getCachedTrending } from '../services/trending.js';

const router = Router();

router.get('/', (_, res) => {
  // Never let browsers or CDNs cache this — the list changes every 30 minutes
  res.set('Cache-Control', 'no-store');
  res.json({ topics: getCachedTrending() });
});

export default router;
