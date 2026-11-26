import { Router } from 'express';
import { addRootLevelNodes, expandNode } from '../services/deepseek.js';
import { sendRouteError } from '../lib/contentSafety.js';
const router = Router();

router.post('/', async (req, res) => {
  const { nodeId, nodeLabel, parentContext, existingLabels, sessionTopic, groundingContext } = req.body;

  if (!nodeId || !nodeLabel) {
    return res.status(400).json({ error: 'nodeId and nodeLabel are required' });
  }

  try {
    const data = await expandNode(
      nodeId,
      nodeLabel,
      parentContext || nodeLabel,
      existingLabels || [],
      sessionTopic || '',
      typeof groundingContext === 'string' ? groundingContext : '',
    );

    if (!data.nodes || !data.edges) {
      return res.status(500).json({ error: 'Invalid response from AI' });
    }

    res.json(data);
  } catch (err) {
    sendRouteError(res, err, 'expand', 'Failed to expand node');
  }
});

/** POST /api/expand/root-level — more first-ring siblings (base map only; no Go Deeper). */
router.post('/root-level', async (req, res) => {
  const { rootId, rootTopic, existingLabels, sessionTopic, groundingContext } = req.body || {};

  if (!rootTopic?.trim()) {
    return res.status(400).json({ error: 'rootTopic is required' });
  }

  const primaryRoot = typeof rootId === 'string' && rootId.trim() ? rootId.trim() : 'root';

  try {
    const data = await addRootLevelNodes(
      primaryRoot,
      rootTopic.trim(),
      Array.isArray(existingLabels) ? existingLabels : [],
      sessionTopic || '',
      typeof groundingContext === 'string' ? groundingContext : '',
    );

    if (!data.nodes?.length || !data.edges?.length) {
      return res.status(500).json({ error: 'Invalid response from AI' });
    }

    res.json(data);
  } catch (err) {
    sendRouteError(res, err, 'expand-root-level', 'Failed to add topics');
  }
});

export default router;
