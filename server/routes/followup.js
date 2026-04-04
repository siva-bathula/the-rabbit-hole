import { followUpChat } from '../services/deepseek.js';

/** POST /api/followup — mounted directly from index.js (avoids sub-router 404 if process is stale). */
export async function followupPostHandler(req, res) {
  const {
    branchNodeLabel,
    anchorParentContext,
    rootTopic,
    sessionTopic,
    groundingContext,
    messages,
  } = req.body || {};

  if (!branchNodeLabel || typeof branchNodeLabel !== 'string') {
    return res.status(400).json({ error: 'branchNodeLabel is required' });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  try {
    const result = await followUpChat({
      branchNodeLabel: branchNodeLabel.trim(),
      anchorParentContext: typeof anchorParentContext === 'string' ? anchorParentContext : '',
      rootTopic: typeof rootTopic === 'string' ? rootTopic : '',
      sessionTopic: typeof sessionTopic === 'string' ? sessionTopic : '',
      groundingContext: typeof groundingContext === 'string' ? groundingContext : '',
      messages: messages.filter(
        (m) =>
          m &&
          (m.role === 'user' || m.role === 'assistant') &&
          typeof m.content === 'string',
      ),
    });
    res.json(result);
  } catch (err) {
    console.error('[followup]', err);
    res.status(500).json({ error: err.message || 'Follow-up failed' });
  }
}
