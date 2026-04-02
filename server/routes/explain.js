import { Router } from 'express';
import { explainNode } from '../services/deepseek.js';

const router = Router();

/**
 * Search Wikipedia for the most relevant article and return its title + URL.
 * Returns null silently on any failure so it never blocks the main response.
 */
async function findWikipediaArticle(query) {
  try {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&list=search` +
      `&srsearch=${encodeURIComponent(query)}&srlimit=1&utf8=&format=json&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = data?.query?.search?.[0];
    if (!hit) return null;
    return {
      title: hit.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`,
    };
  } catch {
    return null;
  }
}

router.post('/', async (req, res) => {
  const { nodeLabel, parentContext, rootTopic, mode, sessionTopic, groundingContext } = req.body;

  if (!nodeLabel) {
    return res.status(400).json({ error: 'nodeLabel is required' });
  }

  try {
    // Run DeepSeek explanation and Wikipedia lookup in parallel.
    // Use nodeLabel alone for Wikipedia — appending parentContext causes the
    // search to rank broader/related articles above the specific concept.
    const [data, wikipedia] = await Promise.all([
      explainNode(
        nodeLabel,
        parentContext || '',
        rootTopic || '',
        mode || 'normal',
        sessionTopic || '',
        typeof groundingContext === 'string' ? groundingContext : '',
      ),
      findWikipediaArticle(nodeLabel),
    ]);

    if (!data.title || !data.summary) {
      return res.status(500).json({ error: 'Invalid response from AI' });
    }

    res.json({ ...data, wikipedia: wikipedia ?? null });
  } catch (err) {
    console.error('[explain]', err.message);
    res.status(500).json({ error: 'Failed to explain node' });
  }
});

export default router;
