import { graphPrimaryRootId } from './graphRoot.js';
import { collectFollowUpMessages, linkIds } from './followUpGraph.js';
import { modeCacheKey } from './replayRecall.js';

/** Lowest → highest; export picks the highest mode with cached content per node. */
const EXPLAIN_MODES_BY_RANK = ['eli5', 'layman', 'normal', 'expert', 'verbose'];

const EXPLAIN_MODE_LABELS = {
  eli5: 'Simple',
  layman: 'Layman',
  normal: 'Normal',
  expert: 'Expert',
  verbose: 'Verbose',
};

function normalizeCache(cache) {
  if (cache instanceof Map) return cache;
  if (Array.isArray(cache)) return new Map(cache);
  return new Map();
}

function normalizeLinks(links) {
  return (links || []).map((l) => linkIds(l));
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugifyFilename(topic) {
  const base = String(topic || 'exploration')
    .trim()
    .slice(0, 80)
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  return base || 'exploration';
}

function parseCacheEntry(entry) {
  if (!entry) return { explanation: null, deeper: null };
  if (entry.explanation && typeof entry.explanation === 'object') {
    return { explanation: entry.explanation, deeper: entry.deeper ?? null };
  }
  if (typeof entry.summary === 'string') {
    return { explanation: entry, deeper: entry.deeper ?? null };
  }
  return { explanation: null, deeper: null };
}

function cacheEntryHasContent({ explanation, deeper }) {
  if (explanation?.summary || explanation?.details?.length) return true;
  if (deeper?.advancedInsights?.length) return true;
  if (typeof deeper?.code === 'string' && deeper.code.trim()) return true;
  return false;
}

/** Highest-ranked explain mode cached for this node (verbose beats expert, etc.). */
function getBestCacheEntry(cache, nodeId) {
  const map = normalizeCache(cache);
  for (let i = EXPLAIN_MODES_BY_RANK.length - 1; i >= 0; i -= 1) {
    const mode = EXPLAIN_MODES_BY_RANK[i];
    const raw = map.get(modeCacheKey(nodeId, mode));
    if (!raw) continue;
    const parsed = parseCacheEntry(raw);
    if (cacheEntryHasContent(parsed)) {
      return { ...parsed, explainMode: mode };
    }
  }
  return { explanation: null, deeper: null, explainMode: null };
}

function computeDepths(nodes, links, rootId) {
  const depth = new Map([[rootId, 0]]);
  const queue = [rootId];
  const normalized = normalizeLinks(links);

  while (queue.length > 0) {
    const u = queue.shift();
    const du = depth.get(u) ?? 0;
    for (const { s, t } of normalized) {
      if (s === u && !depth.has(t)) {
        const child = nodes.find((n) => n.id === t);
        if (child?.followUp) continue;
        depth.set(t, du + 1);
        queue.push(t);
      }
    }
  }
  return depth;
}

function getChildIds(parentId, links, nodes) {
  return normalizeLinks(links)
    .filter(({ s, t }) => s === parentId)
    .map(({ t }) => t)
    .filter((id) => {
      const n = nodes.find((x) => x.id === id);
      return n && !n.followUp;
    });
}

function nodeExportPayload(nodeId, nodes, links, cache) {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || node.followUp) return null;

  const { explanation, deeper, explainMode } = getBestCacheEntry(cache, nodeId);
  const messages = collectFollowUpMessages(nodes, links, nodeId);
  const followUps = [];
  for (let i = 0; i < messages.length; i += 2) {
    if (messages[i]?.role === 'user') {
      followUps.push({
        question: messages[i].content,
        answer: messages[i + 1]?.content || '',
      });
    }
  }

  const hasExplanation = Boolean(explanation?.summary || explanation?.details?.length);
  const hasDeeper = Boolean(
    deeper?.advancedInsights?.length || (typeof deeper?.code === 'string' && deeper.code.trim()),
  );
  const hasFollowUps = followUps.length > 0;

  if (!hasExplanation && !hasDeeper && !hasFollowUps) return null;

  return {
    nodeId,
    label: node.label,
    explanation,
    deeper: hasDeeper ? deeper : null,
    followUps,
    explainMode,
    hasExplanation,
    hasDeeper,
    hasFollowUps,
  };
}

function buildExportTree(nodeId, nodes, links, cache, depths) {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node || node.followUp) return null;

  const payload = nodeExportPayload(nodeId, nodes, links, cache);
  const childIds = getChildIds(nodeId, links, nodes);

  const children = childIds
    .map((id) => buildExportTree(id, nodes, links, cache, depths))
    .filter(Boolean);

  return {
    nodeId,
    label: node.label,
    depth: depths.get(nodeId) ?? 0,
    payload,
    children,
  };
}

function flattenTree(tree) {
  if (!tree) return [];
  const out = [];
  const walk = (item) => {
    if (item.payload) out.push(item);
    for (const child of item.children) walk(child);
  };
  walk(tree);
  return out;
}

function renderIndexTree(tree) {
  if (!tree) return '<p class="empty">No nodes in this exploration.</p>';

  const renderNode = (item) => {
    const indent = item.depth * 20;
    const parts = [];
    const { nodeId, label, payload } = item;

    if (payload) {
      const { hasDeeper, followUps, explainMode } = payload;
      const modeLabel = explainMode ? EXPLAIN_MODE_LABELS[explainMode] || explainMode : '';
      parts.push(`
        <li class="index-node index-node--explored" style="margin-left:${indent}px">
          <a href="#node-${escapeHtml(nodeId)}"><strong>${escapeHtml(label)}</strong></a>
          <span class="depth-tag">level ${item.depth}</span>
          ${modeLabel ? `<span class="mode-tag">${escapeHtml(modeLabel)}</span>` : ''}
      `);

      const sub = [];
      if (hasDeeper) {
        sub.push(`<li class="index-sub"><a href="#deeper-${escapeHtml(nodeId)}">Pull the thread</a></li>`);
      }
      followUps.forEach((fu, i) => {
        sub.push(
          `<li class="index-sub"><a href="#followup-${escapeHtml(nodeId)}-${i}">Follow-up: ${escapeHtml(fu.question.slice(0, 72))}${fu.question.length > 72 ? '…' : ''}</a></li>`,
        );
      });
      if (sub.length) {
        parts.push(`<ul class="index-sublist">${sub.join('')}</ul>`);
      }
      parts.push('</li>');
    } else {
      parts.push(`
        <li class="index-node index-node--unvisited" style="margin-left:${indent}px">
          <span class="index-label">${escapeHtml(label)}</span>
          <span class="depth-tag">level ${item.depth}</span>
          <span class="unvisited-tag">not explored</span>
        </li>
      `);
    }

    for (const child of item.children) {
      parts.push(renderNode(child));
    }
    return parts.join('');
  };

  return `<ul class="index-root">${renderNode(tree)}</ul>`;
}

function renderResources(explanation) {
  const blocks = [];
  if (explanation.wikipedia?.url) {
    blocks.push(
      `<li><a href="${escapeHtml(explanation.wikipedia.url)}" target="_blank" rel="noopener">Wikipedia — ${escapeHtml(explanation.wikipedia.title || 'Article')}</a></li>`,
    );
  }
  if (explanation.learnMore?.url) {
    blocks.push(
      `<li><a href="${escapeHtml(explanation.learnMore.url)}" target="_blank" rel="noopener">${escapeHtml(explanation.learnMore.title || 'Learn more')}</a></li>`,
    );
  }
  if (!blocks.length) return '';
  return `<div class="block"><h4>Resources</h4><ul>${blocks.join('')}</ul></div>`;
}

function renderExplanationSection(payload, depth) {
  const { nodeId, label, explanation, deeper, followUps, hasExplanation, explainMode } = payload;
  const modeLabel = explainMode ? EXPLAIN_MODE_LABELS[explainMode] || explainMode : '';
  const parts = [
    `<section class="node-section" id="node-${escapeHtml(nodeId)}">`,
    `<h2 class="node-heading"><span class="depth-label">Level ${depth}</span>${modeLabel ? `<span class="mode-tag">${escapeHtml(modeLabel)}</span>` : ''} ${escapeHtml(label)}</h2>`,
  ];

  if (hasExplanation && explanation) {
    if (explanation.summary) {
      parts.push(`<p class="summary">${escapeHtml(explanation.summary)}</p>`);
    }
    if (explanation.details?.length) {
      parts.push('<div class="block"><h3>Key insights</h3><ul>');
      for (const d of explanation.details) {
        parts.push(`<li>${escapeHtml(d)}</li>`);
      }
      parts.push('</ul></div>');
    }
    if (explanation.code) {
      parts.push(
        `<div class="block"><h3>Code example</h3><pre class="code">${escapeHtml(explanation.code)}</pre></div>`,
      );
    }
    parts.push(renderResources(explanation));
    if (explanation.keyTakeaway) {
      parts.push(
        `<div class="takeaway"><strong>Key takeaway:</strong> ${escapeHtml(explanation.keyTakeaway)}</div>`,
      );
    }
  }

  if (deeper) {
    parts.push(`<div class="deeper-block" id="deeper-${escapeHtml(nodeId)}">`);
    parts.push('<h3>Pull the thread</h3>');
    if (deeper.advancedInsights?.length) {
      parts.push('<ul>');
      for (const insight of deeper.advancedInsights) {
        parts.push(`<li>${escapeHtml(insight)}</li>`);
      }
      parts.push('</ul>');
    }
    if (deeper.code) {
      parts.push(`<pre class="code">${escapeHtml(deeper.code)}</pre>`);
    }
    parts.push('</div>');
  }

  if (followUps?.length) {
    parts.push('<div class="followups">');
    parts.push('<h3>Follow-up questions</h3>');
    followUps.forEach((fu, i) => {
      parts.push(`<article class="followup" id="followup-${escapeHtml(nodeId)}-${i}">`);
      parts.push(`<p class="followup-q"><strong>Q:</strong> ${escapeHtml(fu.question)}</p>`);
      parts.push(`<p class="followup-a"><strong>A:</strong> ${escapeHtml(fu.answer)}</p>`);
      parts.push('</article>');
    });
    parts.push('</div>');
  }

  parts.push('</section>');
  return parts.join('\n');
}

const EXPORT_STYLES = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 16px;
    line-height: 1.65;
    color: #111;
    background: linear-gradient(180deg, #fffef8 0%, #fffbeb 40%, #fef9e7 100%);
  }
  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: 2.5rem 1.5rem 4rem;
  }
  header.doc-header {
    background: #fff;
    border: 1px solid #fde68a;
    border-left: 5px solid #f59e0b;
    padding: 1.25rem 1.5rem;
    margin-bottom: 2rem;
    border-radius: 4px;
  }
  header.doc-header h1 {
    margin: 0 0 0.35rem;
    font-size: 1.75rem;
    font-weight: 800;
    color: #000;
  }
  .meta { font-size: 0.9rem; color: #333; margin: 0.25rem 0; }
  .disclaimer {
    margin-top: 0.75rem;
    font-size: 0.8rem;
    color: #555;
    border-top: 1px dashed #fcd34d;
    padding-top: 0.75rem;
  }
  .index-section {
    background: #fff;
    border: 1px solid #fde68a;
    padding: 1.25rem 1.5rem 1.5rem;
    margin-bottom: 2.5rem;
    border-radius: 4px;
  }
  .index-section > h2 {
    margin: 0 0 1rem;
    font-size: 1.35rem;
    font-weight: 800;
    color: #000;
    background: #fef3c7;
    display: inline-block;
    padding: 0.15rem 0.5rem;
  }
  .index-root, .index-sublist {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .index-node { margin: 0.35rem 0; line-height: 1.5; }
  .index-node--explored a { color: #111; text-decoration: none; border-bottom: 1px dotted #d97706; }
  .index-node--explored a:hover { color: #92400e; }
  .index-node--unvisited .index-label { color: #78716c; font-weight: 500; }
  .unvisited-tag {
    font-size: 0.72rem;
    color: #a8a29e;
    font-style: italic;
    margin-left: 0.35rem;
  }
  .depth-tag {
    font-size: 0.75rem;
    color: #78716c;
    margin-left: 0.35rem;
  }
  .mode-tag {
    font-size: 0.72rem;
    font-weight: 700;
    color: #92400e;
    background: #fef3c7;
    padding: 0.05rem 0.35rem;
    margin-left: 0.35rem;
    border-radius: 3px;
  }
  .index-sublist { margin: 0.25rem 0 0.5rem 1rem; }
  .index-sub { font-size: 0.92rem; margin: 0.2rem 0; }
  .index-sub a { color: #444; border-bottom-color: #fcd34d; }
  .content-section > h2 {
    font-size: 1.35rem;
    font-weight: 800;
    color: #000;
    background: #fef3c7;
    display: inline-block;
    padding: 0.15rem 0.5rem;
    margin: 0 0 1.5rem;
  }
  .node-section {
    background: #fff;
    border: 1px solid #fde68a;
    padding: 1.25rem 1.5rem 1.5rem;
    margin-bottom: 1.5rem;
    border-radius: 4px;
  }
  .node-heading {
    margin: 0 0 1rem;
    font-size: 1.25rem;
    font-weight: 800;
    color: #000;
    border-bottom: 2px solid #fcd34d;
    padding-bottom: 0.35rem;
  }
  .depth-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #92400e;
    background: #fef3c7;
    padding: 0.1rem 0.4rem;
    margin-right: 0.35rem;
    vertical-align: middle;
  }
  .summary { margin: 0 0 1rem; color: #111; }
  .block { margin: 1rem 0; }
  .block h3, .deeper-block h3, .followups h3 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 800;
    color: #000;
  }
  .block h4 {
    margin: 0 0 0.35rem;
    font-size: 0.9rem;
    font-weight: 800;
    color: #000;
  }
  ul { margin: 0.25rem 0 0.5rem 1.25rem; padding: 0; }
  li { margin: 0.35rem 0; }
  .code {
    background: #fffbeb;
    border: 1px solid #fde68a;
    padding: 0.75rem 1rem;
    overflow-x: auto;
    font-family: ui-monospace, monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    color: #111;
  }
  .takeaway {
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    background: #fef3c7;
    border-left: 4px solid #f59e0b;
    color: #111;
  }
  .deeper-block {
    margin-top: 1.25rem;
    padding-top: 1rem;
    border-top: 1px dashed #fcd34d;
  }
  .followups { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px dashed #fcd34d; }
  .followup { margin: 0.75rem 0; padding: 0.75rem; background: #fffef5; border: 1px solid #fde68a; }
  .followup-q { margin: 0 0 0.5rem; }
  .followup-a { margin: 0; white-space: pre-wrap; }
  .empty { color: #666; font-style: italic; }
  a { color: #92400e; }
  footer.doc-footer {
    margin-top: 2rem;
    font-size: 0.8rem;
    color: #666;
    text-align: center;
  }
`;

/**
 * Build a self-contained HTML document from an exploration snapshot.
 * Only includes nodes with cached explanations, deepen content, and/or follow-up threads.
 *
 * @param {object} params
 * @param {string} params.topic
 * @param {string} [params.rootLabel]
 * @param {object} params.snap — graphData, explanationCache, etc.
 */
export function buildExplorationHtml({ topic, rootLabel = '', snap }) {
  const nodes = snap?.graphData?.nodes || [];
  const links = snap?.graphData?.links || [];
  const cache = snap?.explanationCache;
  const rootId = graphPrimaryRootId(nodes);
  const depths = computeDepths(nodes, links, rootId);
  const tree = buildExportTree(rootId, nodes, links, cache, depths);
  const flat = flattenTree(tree);

  const exportedAt = new Date().toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const indexHtml = renderIndexTree(tree);
  const contentHtml = flat
    .map((item) => renderExplanationSection(item.payload, item.depth))
    .join('\n');

  const title = topic || rootLabel || 'Exploration';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} — The Rabbit Hole</title>
  <style>${EXPORT_STYLES}</style>
</head>
<body>
  <div class="page">
    <header class="doc-header">
      <h1>${escapeHtml(title)}</h1>
      ${rootLabel && rootLabel !== topic ? `<p class="meta"><strong>Root topic:</strong> ${escapeHtml(rootLabel)}</p>` : ''}
      <p class="meta"><strong>Exported:</strong> ${escapeHtml(exportedAt)}</p>
      <p class="meta"><strong>Explain depth:</strong> highest cached mode per node (Simple → Verbose)</p>
      <p class="disclaimer">AI-generated content exported from The Rabbit Hole. May be incomplete or inaccurate — verify important facts yourself. For personal reference only.</p>
    </header>

    <nav class="index-section" aria-label="Table of contents">
      <h2>Index</h2>
      ${indexHtml}
    </nav>

    <main class="content-section">
      <h2>Exploration</h2>
      ${contentHtml || '<p class="empty">No explored content to export.</p>'}
    </main>

    <footer class="doc-footer">
      Generated by The Rabbit Hole · ${escapeHtml(exportedAt)}
    </footer>
  </div>
</body>
</html>`;
}

/** @returns {number} Count of nodes that would appear in the export. */
export function countExploredExportNodes(snap) {
  const nodes = snap?.graphData?.nodes || [];
  const links = snap?.graphData?.links || [];
  const cache = snap?.explanationCache;
  const rootId = graphPrimaryRootId(nodes);
  const depths = computeDepths(nodes, links, rootId);
  const tree = buildExportTree(rootId, nodes, links, cache, depths);
  return flattenTree(tree).length;
}

export function sessionToExportSnap(session) {
  return {
    graphData: session.graphData,
    rootLabel: session.rootLabel || '',
    explanationCache: normalizeCache(session.explanationCache),
    parentLabelOf: session.parentLabelOf instanceof Map
      ? session.parentLabelOf
      : new Map(session.parentLabelOf || []),
  };
}

export function downloadExplorationHtml(html, topic) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rabbit-hole-${slugifyFilename(topic)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
