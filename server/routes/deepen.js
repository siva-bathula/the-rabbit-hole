import { Router } from 'express';
import { deepenNode } from '../services/deepseek.js';
import { sendRouteError } from '../lib/contentSafety.js';

const router = Router();

router.post('/', async (req, res) => {
  const { nodeLabel, parentContext, rootTopic, existingSummary, mode, sessionTopic, groundingContext } = req.body;

  if (!nodeLabel) {
    return res.status(400).json({ error: 'nodeLabel is required' });
  }

  try {
    const data = await deepenNode(
      nodeLabel,
      parentContext || '',
      rootTopic || '',
      existingSummary || '',
      mode || 'normal',
      sessionTopic || '',
      typeof groundingContext === 'string' ? groundingContext : '',
    );

    if (!data.advancedInsights?.length) {
      return res.status(500).json({ error: 'Invalid response from AI' });
    }

    res.json(data);
  } catch (err) {
    sendRouteError(res, err, 'deepen', 'Failed to deepen explanation');
  }
});

export default router;
