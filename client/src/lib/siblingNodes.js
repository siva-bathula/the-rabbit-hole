import { linkIds } from './followUpGraph.js';

/** Parent id along a directed edge into `nodeId`, if any. */
export function getParentIdOfNode(nodeId, links) {
  if (!nodeId || !links?.length) return null;
  for (const link of links) {
    const { s, t } = linkIds(link);
    if (t === nodeId) return s;
  }
  return null;
}

/**
 * Content nodes that share the same parent as `anchorId` (siblings of selection).
 * Excludes follow-up chat nodes. Returns [] when the anchor is the root (no peers).
 * @param {string} anchorId
 * @param {{ id: string, label?: string, followUp?: boolean }[]} nodes
 * @param {unknown[]} links
 */
export function getSiblingContentNodes(anchorId, nodes, links) {
  if (!anchorId || !nodes?.length) return [];

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const anchor = nodeById.get(anchorId);
  if (!anchor || anchor.followUp) return [];

  const parentId = getParentIdOfNode(anchorId, links);
  if (parentId == null) return [];

  const siblings = [];
  for (const link of links) {
    const { s, t } = linkIds(link);
    if (s !== parentId) continue;
    const child = nodeById.get(t);
    if (child && !child.followUp) siblings.push(child);
  }

  siblings.sort((a, b) => (a.label || '').localeCompare(b.label || '', undefined, { sensitivity: 'base' }));
  return siblings;
}
