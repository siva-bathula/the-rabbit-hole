import { useState, useCallback, useRef } from 'react';

export function useGraph() {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [expandingNodeId, setExpandingNodeId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isExploring, setIsExploring] = useState(false);
  const [error, setError] = useState(null);
  const [rootLabel, setRootLabel] = useState('');
  // Keep a ref to current nodes for position seeding during expand
  const nodesRef = useRef([]);
  // Ref so expand() always reads the latest rootLabel without needing it as a dep
  const rootLabelRef = useRef('');

  const explore = useCallback(async (topic) => {
    setIsExploring(true);
    setError(null);
    setSelectedNode(null);
    setExpandedNodes(new Set());

    try {
      const res = await fetch('/api/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Server error');
      const data = await res.json();

      const nodes = data.nodes || [];
      const links = (data.edges || []).map((e) => ({
        source: e.source,
        target: e.target,
      }));

      const rootNode = nodes.find((n) => n.id === 'root');
      const label = rootNode?.label || topic;
      rootLabelRef.current = label;
      setRootLabel(label);

      nodesRef.current = nodes;
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

        const res = await fetch('/api/expand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodeId: node.id,
            nodeLabel: node.label,
            parentContext: rootLabelRef.current || node.label,
            existingLabels,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Server error');
        const data = await res.json();

        // Push the expanded node radially outward from root so its children
        // ring has guaranteed clearance from the root cluster.
        const rootNode = nodesRef.current.find((n) => n.id === 'root');
        const rootX = rootNode?.fx ?? rootNode?.x ?? 0;
        const rootY = rootNode?.fy ?? rootNode?.y ?? 0;
        const nodeX = node.fx ?? node.x ?? 0;
        const nodeY = node.fy ?? node.y ?? 0;
        const dx = nodeX - rootX;
        const dy = nodeY - rootY;
        // Fall back to angle 0 if the node happens to sit exactly on root
        const radialAngle = Math.abs(dx) < 1 && Math.abs(dy) < 1
          ? 0
          : Math.atan2(dy, dx);

        const PUSH = 260;
        const newParentX = nodeX + Math.cos(radialAngle) * PUSH;
        const newParentY = nodeY + Math.sin(radialAngle) * PUSH;

        // Pin the expanded node at its new outward position so the simulation
        // can never drag it back toward root
        node.fx = newParentX;
        node.fy = newParentY;
        node.x = newParentX;
        node.y = newParentY;

        // Place children in a 240° arc centered on the outward direction
        // (away from root). The 120° gap faces root so no child lands inside
        // or near the root cluster.
        const CHILD_RING_R = 165;
        const ARC = (4 / 3) * Math.PI; // 240° in radians
        const count = data.nodes?.length || 1;
        const newNodes = (data.nodes || []).map((n, i) => {
          const t = count > 1 ? i / (count - 1) : 0.5;
          const childAngle = radialAngle - ARC / 2 + t * ARC;
          const cx = newParentX + Math.cos(childAngle) * CHILD_RING_R;
          const cy = newParentY + Math.sin(childAngle) * CHILD_RING_R;
          return { ...n, x: cx, y: cy, fx: cx, fy: cy, vx: 0, vy: 0 };
        });

        const newLinks = (data.edges || []).map((e) => ({
          source: e.source,
          target: e.target,
        }));

        nodesRef.current = [...nodesRef.current, ...newNodes];
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

  const reset = useCallback(() => {
    setGraphData({ nodes: [], links: [] });
    setExpandedNodes(new Set());
    setSelectedNode(null);
    setExpandingNodeId(null);
    setError(null);
    setRootLabel('');
    nodesRef.current = [];
    rootLabelRef.current = '';
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
    reset,
  };
}
