import { Router } from 'express';
import { generateQuiz } from '../services/deepseek.js';

const router = Router();

router.post('/', async (req, res) => {
  const { nodeLabel, explanation } = req.body;
  if (!nodeLabel || !explanation) {
    return res.status(400).json({ error: 'nodeLabel and explanation are required' });
  }
  try {
    const questions = await generateQuiz(nodeLabel, explanation);
    res.json({ questions });
  } catch (err) {
    console.error('[quiz]', err.message);
    res.status(500).json({ error: 'Failed to generate quiz' });
  }
});

export default router;
