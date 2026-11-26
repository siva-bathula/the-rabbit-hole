import { graphPrimaryRootId } from './graphRoot.js';
import { countRootLevelChildren, getRootLevelChildIds, MAX_ROOT_LEVEL_CHILDREN } from './rootRingLayout.js';

/** True when the map is still only root + first ring (no Go Deeper subtrees). */
export function isBaseLevelGraph({ graphData, comparisonSubjects }) {
  if (comparisonSubjects?.length >= 2) return false;
  const nodes = graphData?.nodes;
  if (!nodes?.length) return false;
  const links = graphData?.links ?? [];
  const primary = graphPrimaryRootId(nodes);
  const childIds = getRootLevelChildIds(nodes, links, primary);
  const ring = new Set([primary, ...childIds]);
  return nodes.every((n) => ring.has(n.id));
}

export function canAddMoreRootLevelTopics({ graphData, links, comparisonSubjects }) {
  if (!isBaseLevelGraph({ graphData, comparisonSubjects })) return false;
  const childCount = countRootLevelChildren(
    graphData.nodes,
    links ?? graphData.links ?? [],
  );
  return childCount < MAX_ROOT_LEVEL_CHILDREN;
}