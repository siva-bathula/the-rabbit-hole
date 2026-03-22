import { useState, useCallback, useRef } from 'react';

/**
 * BFS from `nodeId` through `links` to collect all descendant node IDs.
 * Handles both string IDs and D3-mutated node objects as source/target.
 */
function getDescendantIds(nodeId, links) {
  const descendants = new Set();
  const queue = [nodeId];
  while (queue.length > 0) {
    const curr = queue.shift();
    for (const link of links) {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      if (s === curr && !descendants.has(t)) {
        descendants.add(t);
        queue.push(t);
      }
    }
  }
  return descendants;
}

export function useGraph() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [expandingNodeId, setExpandingNodeId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isExploring, setIsExploring] = useState(false);
  const [error, setError] = useState(null);
  const [rootLabel, setRootLabel] = useState('');

  const nodesRef = useRef([]);
  const linksRef = useRef([]);
  const rootLabelRef = useRef('');
  // nodeId → label of its direct parent (for accurate context in explain/expand)
  const parentLabelOfRef = useRef(new Map());
  // nodeId → {x, y} before it was pushed outward (for restoring on collapse)
  const originalPositionRef = useRef(new Map());

  const explore = useCallback(async (topic) => {
    setIsExploring(true);
    setError(null);
    setSelectedNode(null);
    setExpandedNodes(new Set());
    // Clear graph immediately so Graph.jsx resets its seeded flag
    setGraphData({ nodes: [], links: [] });
    nodesRef.current = [];
    linksRef.current = [];
    rootLabelRef.current = '';
    parentLabelOfRef.current = new Map();
    originalPositionRef.current = new Map();

    try {
      const res = await fetch('/api/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Server error');
      const data = await res.json();

      const nodes = (data.nodes || []).map((n) => ({
        ...n,
        depth: n.id === 'root' ? 0 : 1,
      }));
      const links = (data.edges || []).map((e) => ({
        source: e.source,
        target: e.target,
      }));

      const rootNode = nodes.find((n) => n.id === 'root');
      const label = rootNode?.label || topic;
      rootLabelRef.current = label;
      setRootLabel(label);

      // Record root as parent of all initial nodes
      nodes.forEach((n) => {
        if (n.id !== 'root') parentLabelOfRef.current.set(n.id, label);
      });

      nodesRef.current = nodes;
      linksRef.current = links;
      setGraphData({ nodes, links });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsExploring(false);
    }
  }, []);

  const expand = useCallback(
    async (node) => {
      if (expandedNodes.has(node.id) || expandingNodeId) return;

      setExpandingNodeId(node.id);
      setError(null);

      try {
        const existingLabels = nodesRef.current.map((n) => n.label);

        // Use the node's actual parent label for context, not always root
        const nodeParentLabel = parentLabelOfRef.current.get(node.id) || rootLabelRef.current || node.label;

        const res = await fetch('/api/expand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeId: node.id,
            nodeLabel: node.label,
            parentContext: nodeParentLabel,
            existingLabels,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Server error');
        const data = await res.json();

        // Compute radial direction from root to this node
        const rootNode = nodesRef.current.find((n) => n.id === 'root');
        const rootX = rootNode?.fx ?? rootNode?.x ?? 0;
        const rootY = rootNode?.fy ?? rootNode?.y ?? 0;
        const nodeX = node.fx ?? node.x ?? 0;
        const nodeY = node.fy ?? node.y ?? 0;
        const dx = nodeX - rootX;
        const dy = nodeY - rootY;
        const radialAngle = Math.abs(dx) < 1 && Math.abs(dy) < 1
          ? 0
          : Math.atan2(dy, dx);

        // Store original position BEFORE pushing, so we can restore on collapse
        originalPositionRef.current.set(node.id, { x: nodeX, y: nodeY });

        const PUSH = 260;
        const newParentX = nodeX + Math.cos(radialAngle) * PUSH;
        const newParentY = nodeY + Math.sin(radialAngle) * PUSH;

        node.fx = newParentX;
        node.fy = newParentY;
        node.x = newParentX;
        node.y = newParentY;

        // 240° arc on the far side (away from root)
        const CHILD_RING_R = 165;
        const ARC = (4 / 3) * Math.PI;
        const count = data.nodes?.length || 1;
        const parentDepth = node.depth ?? 1;

        const newNodes = (data.nodes || []).map((n, i) => {
          const t = count > 1 ? i / (count - 1) : 0.5;
          const childAngle = radialAngle - ARC / 2 + t * ARC;
          const cx = newParentX + Math.cos(childAngle) * CHILD_RING_R;
          const cy = newParentY + Math.sin(childAngle) * CHILD_RING_R;
          // Record this node's parent label for future context propagation
          parentLabelOfRef.current.set(n.id, node.label);
          return { ...n, x: cx, y: cy, fx: cx, fy: cy, vx: 0, vy: 0, depth: parentDepth + 1 };
        });

        const newLinks = (data.edges || []).map((e) => ({
          source: e.source,
          target: e.target,
        }));

        nodesRef.current = [...nodesRef.current, ...newNodes];
        linksRef.current = [...linksRef.current, ...newLinks];
        setGraphData((prev) => ({
          nodes: [...prev.nodes, ...newNodes],
          links: [...prev.links, ...newLinks],
        }));
        setExpandedNodes((prev) => new Set([...prev, node.id]));
        setSelectedNode(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setExpandingNodeId(null);
      }
    },
    [expandedNodes, expandingNodeId]
  );

  const collapse = useCallback((node) => {
    // Restore node to its original pre-push position
    const orig = originalPositionRef.current.get(node.id);
    if (orig) {
      node.fx = orig.x;
      node.fy = orig.y;
      node.x = orig.x;
      node.y = orig.y;
    }

    // Find all descendants using current links
    const descendants = getDescendantIds(node.id, linksRef.current);

    // Remove descendants from refs
    nodesRef.current = nodesRef.current.filter((n) => !descendants.has(n.id));
    linksRef.current = linksRef.current.filter((l) => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      return !descendants.has(s) && !descendants.has(t);
    });
    descendants.forEach((id) => {
      originalPositionRef.current.delete(id);
      parentLabelOfRef.current.delete(id);
    });

    setGraphData({
      nodes: nodesRef.current,
      links: linksRef.current,
    });
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.delete(node.id);
      descendants.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setGraphData({ nodes: [], links: [] });
    setExpandedNodes(new Set());
    setSelectedNode(null);
    setExpandingNodeId(null);
    setError(null);
    setRootLabel('');
    nodesRef.current = [];
    linksRef.current = [];
    rootLabelRef.current = '';
    parentLabelOfRef.current = new Map();
    originalPositionRef.current = new Map();
  }, []);

  return {
    graphData,
    expandedNodes,
    expandingNodeId,
    selectedNode,
    setSelectedNode,
    isExploring,
    error,
    rootLabel,
    explore,
    expand,
    collapse,
    reset,
  };
}
