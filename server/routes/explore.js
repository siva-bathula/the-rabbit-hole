import { Router } from 'express';
import { generateNodes } from '../services/deepseek.js';
import {
  fetchArticlePlainText,
  mergeArticleIntoGrounding,
  isSafeHttpUrlForServerFetch,
} from '../services/articleFetch.js';

const router = Router();

/** Same rule as deepseek isNewsAnchoredTopic — trending "label — headline" sessions only. */
function isNewsAnchoredTopic(topic) {
  return typeof topic === 'string' && /\s[—–]\s/.test(topic);
}

/**
 * Defensive cleanup applied to every AI response before it reaches the client.
 *
 * 1. If the AI didn't use "root" as the root node id, find the topmost node
 *    (the one that only appears as a source, never as a target) and rename it.
 * 2. Re-attach any orphaned child nodes to root with a synthetic edge so
 *    nothing floats disconnected.
 * 3. Drop any edges that still reference a non-existent node id.
 */
function sanitizeGraph(data) {
  const nodes = data.nodes;
  const edges = data.edges;
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Step 1: Ensure a node with id "root" exists
  if (!nodeIds.has('root')) {
    const targetIds = new Set(edges.map((e) => e.target));
    // The root candidate is a node that is never the target of any edge
    const rootCandidate = nodes.find((n) => !targetIds.has(n.id));
    if (rootCandidate) {
      const oldId = rootCandidate.id;
      // Rewrite all edges that reference the old id
      for (const edge of edges) {
        if (edge.source === oldId) edge.source = 'root';
        if (edge.target === oldId) edge.target = 'root';
      }
      rootCandidate.id = 'root';
      nodeIds.delete(oldId);
      nodeIds.add('root');
    }
  }

  // Step 2: Any child node not reachable from root gets a synthetic edge added
  if (nodeIds.has('root')) {
    const connectedToRoot = new Set(
      edges.filter((e) => e.source === 'root').map((e) => e.target)
    );
    for (const node of nodes) {
      if (node.id !== 'root' && !connectedToRoot.has(node.id)) {
        edges.push({ source: 'root', target: node.id });
      }
    }
  }

  // Step 3: Drop edges where either end references a node that doesn't exist
  data.edges = edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
  );

  return data;
}

router.post('/', async (req, res) => {
  const { topic, groundingContext, articleUrl } = req.body;

  if (!topic?.trim()) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  try {
    const topicTrim = topic.trim();
    const base =
      typeof groundingContext === 'string' ? groundingContext.trim() : '';

    let effectiveGrounding = base;
    const url = typeof articleUrl === 'string' ? articleUrl.trim() : '';
    if (isNewsAnchoredTopic(topicTrim) && url && isSafeHttpUrlForServerFetch(url)) {
      const fetched = await fetchArticlePlainText(url);
      if (fetched.ok && fetched.text) {
        effectiveGrounding = mergeArticleIntoGrounding(base, fetched.text);
      }
    }

    const raw = await generateNodes(topicTrim, {
      groundingContext: effectiveGrounding,
    });

    if (!raw.nodes || !raw.edges) {
      return res.status(500).json({ error: 'Invalid response from AI' });
    }

    const data = sanitizeGraph(raw);
    res.json({ ...data, groundingContext: effectiveGrounding });
  } catch (err) {
    console.error('[explore]', err.message);
    res.status(500).json({ error: 'Failed to generate knowledge graph' });
  }
});

export default router;
