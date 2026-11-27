import { followUpChat } from '../services/deepseek.js';
import { detectProhibitedUserInput } from '../lib/inputSafety.js';
import { sendContentSafetyResponse, sendRouteError } from '../lib/contentSafety.js';

const MAX_FOLLOWUP_MESSAGES = 20;

function normalizeFollowUpMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = typeof m.content === 'string' ? m.content.trim() : '';
    if (!content) continue;
    if (out.length > 0 && out[out.length - 1].role === m.role) {
      out[out.length - 1] = { role: m.role, content };
    } else {
      out.push({ role: m.role, content });
    }
  }
  return out.length > MAX_FOLLOWUP_MESSAGES
    ? out.slice(-MAX_FOLLOWUP_MESSAGES)
    : out;
}

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

  const validMessages = normalizeFollowUpMessages(messages);
  if (validMessages.length === 0) {
    return res.status(400).json({
      error: 'messages must contain at least one non-empty user or assistant entry',
    });
  }
  if (validMessages[validMessages.length - 1].role !== 'user') {
    return res.status(400).json({
      error: 'The latest message in the thread must be from the user',
    });
  }

  const latestUser = [...validMessages].reverse().find((m) => m.role === 'user');
  const followUpLog = {
    req,
    queryText: latestUser?.content || '',
    source: /** @type {const} */ ('followup'),
  };

  if (detectProhibitedUserInput(followUpLog.queryText)) {
    return sendContentSafetyResponse(res, followUpLog);
  }

  try {
    const result = await followUpChat({
      branchNodeLabel: branchNodeLabel.trim(),
      anchorParentContext: typeof anchorParentContext === 'string' ? anchorParentContext : '',
      rootTopic: typeof rootTopic === 'string' ? rootTopic : '',
      sessionTopic: typeof sessionTopic === 'string' ? sessionTopic : '',
      groundingContext: typeof groundingContext === 'string' ? groundingContext : '',
      messages: validMessages,
    });
    res.json(result);
  } catch (err) {
    sendRouteError(res, err, 'followup', 'Follow-up failed', followUpLog);
  }
}
