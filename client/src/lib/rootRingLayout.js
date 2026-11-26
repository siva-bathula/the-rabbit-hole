import { graphPrimaryRootId } from './graphRoot.js';

/** IDs of nodes directly linked to the primary root (first ring). */
export function getRootLevelChildIds(nodes, links, primaryRoot = null) {
  const root = primaryRoot || graphPrimaryRootId(nodes);
  const childIds = new Set();
  for (const l of links || []) {
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    if (s === root && t !== root) childIds.add(t);
    if (t === root && s !== root) childIds.add(s);
  }
  return childIds;
}

export function countRootLevelChildren(nodes, links, primaryRoot = null) {
  return getRootLevelChildIds(nodes, links, primaryRoot).size;
}

/**
 * Evenly space direct children of primary root on a ring (matches Graph.jsx defaults).
 * Mutates fx/fy/x/y on child node objects in `nodes` array.
 */
export function layoutRootChildrenOnRing(nodes, links, options = {}) {
  const { viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024 } = options;
  const primaryRoot = graphPrimaryRootId(nodes);
  const childIds = getRootLevelChildIds(nodes, links, primaryRoot);
  const rootChildren = nodes.filter((n) => childIds.has(n.id));
  if (!rootChildren.length) return nodes;

  const nKids = rootChildren.length;
  let ringR = Math.min(320, Math.max(190, 150 + nKids * 14));
  if (viewportWidth < 640) {
    const scale = Math.min(1.35, Math.max(1, 420 / Math.max(viewportWidth, 280)));
    ringR = Math.min(360, ringR * scale);
  }

  rootChildren.forEach((node, i) => {
    const angle = (i / nKids) * 2 * Math.PI - Math.PI / 2;
    const px = ringR * Math.cos(angle);
    const py = ringR * Math.sin(angle);
    node.fx = px;
    node.fy = py;
    node.x = px;
    node.y = py;
    node.vx = 0;
    node.vy = 0;
  });

  const rootNode = nodes.find((n) => n.id === primaryRoot);
  if (rootNode) {
    rootNode.fx = 0;
    rootNode.fy = 0;
    rootNode.x = 0;
    rootNode.y = 0;
  }

  return nodes;
}

export const MAX_ROOT_LEVEL_CHILDREN = 18;
export const ROOT_LEVEL_ADD_TARGET = 5;