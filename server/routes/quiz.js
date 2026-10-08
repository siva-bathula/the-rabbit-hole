import { Router } from 'express';
import { generateQuiz } from '../services/deepseek.js';
import { sendRouteError } from '../lib/contentSafety.js';

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
    sendRouteError(res, err, 'quiz', 'Failed to generate quiz');
  }
});

export default router;
