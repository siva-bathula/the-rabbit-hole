/**
 * Comparison-mode explore: parse multi-subject prompts, merge namespaced subgraphs.
 */

export const COMPARISON_MAX_SUBJECTS = 4;

/** @returns {string[] | null} subject strings if comparison detected */
export function tryParseComparisonSubjects(topic) {
  if (!topic || typeof topic !== 'string') return null;
  const t = topic.trim();
  if (!t) return null;

  const byVs = splitByVersus(t);
  if (byVs && byVs.length >= 2 && byVs.length <= COMPARISON_MAX_SUBJECTS) return byVs;

  const compareMatch = t.match(/^compare\s+(.+)$/i);
  if (!compareMatch) return null;
  const rest = compareMatch[1].trim();
  const chunks = rest
    .split(/\s*,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (chunks.length >= 2 && chunks.length <= COMPARISON_MAX_SUBJECTS) return chunks;

  return null;
}

function splitByVersus(t) {
  const parts = t.split(/\s+vs\.?\s+/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return parts.length > COMPARISON_MAX_SUBJECTS ? null : parts;
}

/**
 * @param {{ nodes: object[], edges: object[] }} graph single-topic graph after sanitizeGraph (has root)
 * @returns {{ nodes: object[], edges: object[], hubId: string }}
 */
export function remapSubjectGraphForMerge(graph, index, subjectLabel) {
  const hubId = `cmp_${index}_hub`;
  const prefix = `cmp_${index}_`;
  const idMap = new Map();
  for (const n of graph.nodes) {
    if (n.id === 'root') idMap.set(n.id, hubId);
    else idMap.set(n.id, prefix + String(n.id));
  }
  const nodes = graph.nodes.map((n) => {
    const newId = idMap.get(n.id);
    const label = n.id === 'root' ? subjectLabel.trim() : n.label;
    return { ...n, id: newId, label };
  });
  const edges = graph.edges.map((e) => ({
    source: idMap.get(e.source),
    target: idMap.get(e.target),
  }));
  return { nodes, edges, hubId };
}

/**
 * @param {Array<{ nodes: object[], edges: object[], hubId: string }>} remapped
 */
export function mergeComparisonGraphs(remapped, metaLabel) {
  const metaId = 'meta_root';
  const label =
    typeof metaLabel === 'string' && metaLabel.trim()
      ? metaLabel.trim().slice(0, 140)
      : 'Comparison';
  const metaNode = { id: metaId, label, group: 'core' };
  const nodes = [metaNode];
  const edges = [];
  for (const block of remapped) {
    nodes.push(...block.nodes);
    edges.push(...block.edges);
    edges.push({ source: metaId, target: block.hubId });
  }
  return { nodes, edges };
}

export function comparisonHubIds(subjectCount) {
  return Array.from({ length: subjectCount }, (_, i) => `cmp_${i}_hub`);
}

/** Drop edges with missing endpoints (merged graph has no single root id). */
export function sanitizeMergedComparisonGraph(data) {
  const nodeIds = new Set(data.nodes.map((n) => n.id));
  data.edges = data.edges.filter(
    (e) => nodeIds.has(e.source) && nodeIds.has(e.target),
  );
  return data;
}

/** Labels for direct children of each hub (same order as subjects). */
export function labelsPerHubChildren(merged, subjectCount) {
  const hubIds = comparisonHubIds(subjectCount);
  const byHub = new Map(hubIds.map((id) => [id, []]));
  for (const e of merged.edges) {
    const src = e.source;
    const tgt = e.target;
    if (src.startsWith('cmp_') && src.endsWith('_hub') && tgt !== 'meta_root') {
      const arr = byHub.get(src);
      if (arr) {
        const node = merged.nodes.find((n) => n.id === tgt);
        if (node) arr.push(node.label);
      }
    }
  }
  return hubIds.map((id) => byHub.get(id) || []);
}
