import { Router } from 'express';
import { getCachedTrending } from '../services/trending.js';

const router = Router();

router.get('/', (_, res) => {
  res.json({ topics: getCachedTrending() });
});

export default router;
