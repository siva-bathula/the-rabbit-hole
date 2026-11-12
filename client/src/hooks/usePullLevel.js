import { useCallback, useMemo, useRef, useState } from 'react';
import { getSiblingContentNodes } from '../lib/siblingNodes.js';
import { getParentLabelForNode } from '../lib/followUpGraph.js';
import {
  fetchNodeExplanation,
  hasExplanationCached,
} from '../lib/fetchNodeExplanation.js';
import { modeCacheKey } from '../lib/replayRecall.js';

/**
 * Sequentially fetch /api/explain for each sibling of `anchorNode` missing cache at `explainMode`.
 */
export function usePullLevel({
  anchorNode,
  nodes,
  links,
  explainMode,
  rootLabel,
  sessionTopic,
  groundingContext,
  explanationCache,
  onCached,
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '', nodeId: null });
  const [lastError, setLastError] = useState(null);
  const cancelRef = useRef(false);

  const siblings = useMemo(
    () => (anchorNode ? getSiblingContentNodes(anchorNode.id, nodes, links) : []),
    [anchorNode, nodes, links],
  );

  const pendingNodes = useMemo(
    () => siblings.filter((n) => !hasExplanationCached(explanationCache, n.id, explainMode)),
    [siblings, explanationCache, explainMode],
  );

  const canPull =
    Boolean(anchorNode && !anchorNode.followUp) &&
    siblings.length > 0 &&
    pendingNodes.length > 0;

  const pullLevel = useCallback(async () => {
    if (!anchorNode || !canPull || running) return;

    cancelRef.current = false;
    setLastError(null);
    setRunning(true);

    const queue = siblings.filter(
      (n) => !hasExplanationCached(explanationCache, n.id, explainMode),
    );
    const total = queue.length;
    setProgress({ done: 0, total, label: '', nodeId: null });

    let done = 0;
    for (const node of queue) {
      if (cancelRef.current) break;
      if (hasExplanationCached(explanationCache, node.id, explainMode)) {
        done += 1;
        setProgress({ done, total, label: '', nodeId: null });
        continue;
      }

      setProgress({ done, total, label: node.label || '', nodeId: node.id });
      try {
        const parentContext = getParentLabelForNode(node.id, nodes, links, rootLabel);
        const data = await fetchNodeExplanation({
          node,
          parentContext,
          rootTopic: rootLabel,
          sessionTopic,
          groundingContext,
          explainMode,
        });
        if (cancelRef.current) break;

        const cacheKey = modeCacheKey(node.id, explainMode);
        explanationCache?.current?.set(cacheKey, { explanation: data, deeper: null });
        onCached?.();
        done += 1;
        setProgress({ done, total, label: '', nodeId: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to pull level.';
        setLastError(msg);
        break;
      }
    }

    setRunning(false);
    setProgress({ done: 0, total: 0, label: '', nodeId: null });
  }, [
    anchorNode,
    canPull,
    running,
    siblings,
    nodes,
    links,
    explainMode,
    rootLabel,
    sessionTopic,
    groundingContext,
    explanationCache,
    onCached,
  ]);

  const cancelPull = useCallback(() => {
    cancelRef.current = true;
  }, []);

  return {
    pullLevel,
    cancelPull,
    running,
    progress,
    canPull,
    siblingCount: siblings.length,
    pendingCount: pendingNodes.length,
    lastError,
    clearError: () => setLastError(null),
  };
}
