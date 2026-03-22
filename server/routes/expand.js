import { Router } from 'express';
import { expandNode } from '../services/deepseek.js';

const router = Router();

router.post('/', async (req, res) => {
  const { nodeId, nodeLabel, parentContext, existingLabels } = req.body;

  if (!nodeId || !nodeLabel) {
    return res.status(400).json({ error: 'nodeId and nodeLabel are required' });
  }

  try {
    const data = await expandNode(
      nodeId,
      nodeLabel,
      parentContext || nodeLabel,
      existingLabels || []
    );

    if (!data.nodes || !data.edges) {
      return res.status(500).json({ error: 'Invalid response from AI' });
    }

    res.json(data);
  } catch (err) {
    console.error('[expand]', err.message);
    res.status(500).json({ error: 'Failed to expand node' });
  }
});

export default router;
