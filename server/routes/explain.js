import { Router } from 'express';
import { explainNode } from '../services/deepseek.js';

const router = Router();

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'has', 'have', 'been',
  'not', 'but', 'what', 'all', 'can', 'her', 'his', 'how', 'its', 'may', 'new', 'now', 'old',
  'see', 'two', 'way', 'who', 'boy', 'did', 'get', 'she', 'use', 'many', 'then', 'them',
]);

const WIKI_SEARCH_LIMIT = 8;
const WIKI_QUERY_MAX_LEN = 180;
const FETCH_TIMEOUT_MS = 4000;

/**
 * Single search string: node label first, then distinct parent/root/session context.
 */
function buildWikipediaSearchQuery(nodeLabel, parentContext, rootTopic, sessionTopic) {
  const parts = [];
  const seen = new Set();
  const add = (s) => {
    const t = (s || '').trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    parts.push(t);
  };
  add(nodeLabel);
  add(parentContext);
  add(rootTopic);
  add(sessionTopic);
  let q = parts.join(' ');
  if (q.length > WIKI_QUERY_MAX_LEN) q = q.slice(0, WIKI_QUERY_MAX_LEN).trim();
  return q || String(nodeLabel || '').trim();
}

function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Significant tokens (length >= 3) minus stopwords. */
function contextTokensFrom(...strings) {
  const out = new Set();
  for (const str of strings) {
    if (!str || typeof str !== 'string') continue;
    for (const w of str.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 3 && !STOPWORDS.has(w)) out.add(w);
    }
  }
  return [...out];
}

/** Anchor tokens from the node label: 2+ char alnum words (keeps SQL, AI). */
function labelAnchorTokens(nodeLabel) {
  if (!nodeLabel || typeof nodeLabel !== 'string') return [];
  const words = nodeLabel.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const out = new Set();
  for (const w of words) {
    if (w.length >= 2) out.add(w);
  }
  return [...out];
}

function wordSetFromHaystack(haystack) {
  return new Set(haystack.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function scoreWikipediaHit(hit, labelAnchors, contextTokenList) {
  const snippet = stripHtml(hit.snippet || '');
  const hay = `${hit.title} ${snippet}`;
  const words = wordSetFromHaystack(hay);

  let labelHits = 0;
  for (const t of labelAnchors) {
    if (words.has(t)) labelHits++;
  }

  let ctxHits = 0;
  for (const t of contextTokenList) {
    if (words.has(t)) ctxHits++;
  }

  const score = labelHits * 3 + ctxHits;
  return { labelHits, ctxHits, score };
}

function wikipediaHitPassesGate({ labelHits, ctxHits }, labelAnchors) {
  if (labelAnchors.length === 0) return ctxHits >= 2;
  if (labelHits >= 1) return true;
  return ctxHits >= 3;
}

/**
 * Wikipedia search with enriched query and relevance gating on top hits.
 * Returns null on failure or when no hit passes the gate.
 */
async function findWikipediaArticleForContext(nodeLabel, parentContext, rootTopic, sessionTopic) {
  try {
    const query = buildWikipediaSearchQuery(
      nodeLabel,
      parentContext,
      rootTopic,
      sessionTopic,
    );
    const labelAnchors = labelAnchorTokens(nodeLabel);
    const contextTokenList = contextTokensFrom(
      nodeLabel,
      parentContext,
      rootTopic,
      sessionTopic,
    );

    const url =
      `https://en.wikipedia.org/w/api.php?action=query&list=search` +
      `&srsearch=${encodeURIComponent(query)}&srlimit=${WIKI_SEARCH_LIMIT}` +
      `&srprop=snippet&utf8=&format=json&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json();
    const hits = data?.query?.search;
    if (!Array.isArray(hits) || hits.length === 0) return null;

    let best = null;
    let bestScore = -1;
    for (const hit of hits) {
      if (!hit?.title) continue;
      const metrics = scoreWikipediaHit(hit, labelAnchors, contextTokenList);
      if (!wikipediaHitPassesGate(metrics, labelAnchors)) continue;
      if (metrics.score > bestScore) {
        bestScore = metrics.score;
        best = hit;
      }
    }
    if (!best) return null;

    const title = best.title;
    return {
      title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    };
  } catch {
    return null;
  }
}

function isLearnMoreShape(obj) {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.url === 'string' &&
    typeof obj.title === 'string' &&
    obj.url.trim().length > 0 &&
    obj.title.trim().length > 0
  );
}

async function verifyExternalUrl(href) {
  const timeout = 3500;
  const req = (method, headers = {}) =>
    fetch(href, {
      method,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
      headers,
    });
  try {
    let res = await req('HEAD');
    if (res.ok || (res.status >= 300 && res.status < 400)) return true;
    res = await req('GET', { Range: 'bytes=0-0' });
    return res.ok || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}

/**
 * Keep learnMore only when URL is https and responds successfully.
 */
async function sanitizeLearnMore(learnMore) {
  if (!isLearnMoreShape(learnMore)) return null;

  let parsed;
  try {
    parsed = new URL(learnMore.url.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (!parsed.hostname || parsed.hostname.includes('..')) return null;

  const ok = await verifyExternalUrl(parsed.href);
  if (!ok) return null;

  return {
    title: learnMore.title.trim().slice(0, 240),
    url: parsed.href,
  };
}

router.post('/', async (req, res) => {
  const { nodeLabel, parentContext, rootTopic, mode, sessionTopic, groundingContext } = req.body;

  if (!nodeLabel) {
    return res.status(400).json({ error: 'nodeLabel is required' });
  }

  const parent = parentContext || '';
  const root = rootTopic || '';
  const session = sessionTopic || '';

  try {
    const [data, wikipedia] = await Promise.all([
      explainNode(
        nodeLabel,
        parent,
        root,
        mode || 'normal',
        session,
        typeof groundingContext === 'string' ? groundingContext : '',
      ),
      findWikipediaArticleForContext(nodeLabel, parent, root, session),
    ]);

    if (!data.title || !data.summary) {
      return res.status(500).json({ error: 'Invalid response from AI' });
    }

    const learnMore = await sanitizeLearnMore(data.learnMore);
    const payload = { ...data, wikipedia: wikipedia ?? null };
    if (learnMore) payload.learnMore = learnMore;
    else delete payload.learnMore;

    res.json(payload);
  } catch (err) {
    console.error('[explain]', err.message);
    res.status(500).json({ error: 'Failed to explain node' });
  }
});

export default router;
