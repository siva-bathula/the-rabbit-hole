export const META_ROOT_ID = 'meta_root';

export function graphPrimaryRootId(nodes) {
  if (!nodes?.length) return 'root';
  return nodes.some((n) => n.id === META_ROOT_ID) ? META_ROOT_ID : 'root';
}

export function isPrimaryGraphRoot(nodeId) {
  return nodeId === 'root' || nodeId === META_ROOT_ID;
}
