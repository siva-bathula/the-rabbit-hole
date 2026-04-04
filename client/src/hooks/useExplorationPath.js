import { useState, useCallback } from 'react';

/**
 * Ordered list of node IDs the user engaged with (dedupe consecutive duplicates).
 * Reset when starting a new exploration or restoring a different graph.
 */
export function useExplorationPath() {
  const [pathIds, setPathIds] = useState([]);

  const appendStep = useCallback((nodeId) => {
    if (!nodeId) return;
    setPathIds((prev) => {
      if (prev.length > 0 && prev[prev.length - 1] === nodeId) return prev;
      return [...prev, nodeId];
    });
  }, []);

  const resetPath = useCallback(() => {
    setPathIds([]);
  }, []);

  const replacePath = useCallback((ids) => {
    setPathIds(Array.isArray(ids) ? ids.filter(Boolean) : []);
  }, []);

  return {
    pathIds,
    appendStep,
    resetPath,
    replacePath,
    canReplay: pathIds.length >= 2,
  };
}
