import { useReducer, useEffect, useRef, useCallback } from 'react';

function findPathToNode(nodeId, links) {
  const parent = new Map([['root', null]]);
  const queue = ['root'];
  while (queue.length > 0) {
    const curr = queue.shift();
    if (curr === nodeId) {
      const path = [];
      let n = nodeId;
      while (n !== null) { path.unshift(n); n = parent.get(n); }
      return path;
    }
    for (const link of links) {
      const s = typeof link.source === 'object' ? link.source.id : link.source;
      const t = typeof link.target === 'object' ? link.target.id : link.target;
      if (s === curr && !parent.has(t)) { parent.set(t, curr); queue.push(t); }
    }
  }
  return null;
}

function getChildIds(parentId, links) {
  const result = [];
  for (const link of links) {
    const s = typeof link.source === 'object' ? link.source.id : link.source;
    const t = typeof link.target === 'object' ? link.target.id : link.target;
    if (s === parentId) result.push(t);
  }
  return result;
}

function markVisited(visitedIds, nodeId) {
  if (!nodeId || visitedIds.has(nodeId)) return visitedIds;
  const next = new Set(visitedIds);
  next.add(nodeId);
  return next;
}

const initialState = {
  slowQueue: [],   // node IDs at the current depth level
  slowIndex: 0,    // current position within that level
  levelStack: [],  // [{queue, index, parentNodeId}] for back navigation
  visitedIds: new Set(),
};

function reducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return { ...initialState, visitedIds: new Set() };

    case 'INIT_QUEUE': {
      const firstId = action.payload[0];
      return {
        ...state,
        slowQueue: action.payload,
        slowIndex: 0,
        levelStack: [],
        visitedIds: markVisited(new Set(), firstId),
      };
    }

    case 'NEXT': {
      if (state.slowIndex >= state.slowQueue.length - 1) return state;
      const nextIndex = state.slowIndex + 1;
      return {
        ...state,
        slowIndex: nextIndex,
        visitedIds: markVisited(state.visitedIds, state.slowQueue[nextIndex]),
      };
    }

    case 'GO_DEEPER': {
      const firstChildId = action.payload[0];
      return {
        ...state,
        levelStack: [
          ...state.levelStack,
          {
            queue: state.slowQueue,
            index: state.slowIndex,
            parentNodeId: action.parentNodeId ?? null,
          },
        ],
        slowQueue: action.payload,
        slowIndex: 0,
        visitedIds: markVisited(state.visitedIds, firstChildId),
      };
    }

    case 'BACK': {
      if (state.levelStack.length === 0) return state;
      const top = state.levelStack[state.levelStack.length - 1];
      return {
        ...state,
        slowQueue: top.queue,
        slowIndex: top.index,
        levelStack: state.levelStack.slice(0, -1),
      };
    }

    case 'JUMP_TO_NODE':
      return {
        ...state,
        slowQueue: action.payload.queue,
        slowIndex: action.payload.index,
        levelStack: action.payload.levelStack,
        visitedIds: markVisited(state.visitedIds, action.payload.nodeId),
      };

    default:
      return state;
  }
}

export function useSlowBurn({ graphData, expandedNodes, expand, expandingNodeId }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Refs so effects always read the latest values without needing them as deps
  const stateRef = useRef(state);
  stateRef.current = state;

  const graphDataRef = useRef(graphData);
  graphDataRef.current = graphData;

  // nodeId currently waiting for expand() to complete
  const pendingExpandRef = useRef(null);
  const prevNodeCountRef = useRef(0);

  // React to graphData node count changing (initial load or expand completing)
  useEffect(() => {
    const { nodes, links } = graphDataRef.current;
    const newCount = nodes.length;

    if (newCount === 0) {
      dispatch({ type: 'RESET' });
      prevNodeCountRef.current = 0;
      pendingExpandRef.current = null;
      return;
    }

    if (newCount === prevNodeCountRef.current) return;
    prevNodeCountRef.current = newCount;

    if (pendingExpandRef.current) {
      // expand() just finished — the new children are now in the graph
      const children = getChildIds(pendingExpandRef.current, links);
      if (children.length > 0) {
        dispatch({ type: 'GO_DEEPER', payload: children, parentNodeId: pendingExpandRef.current });
      }
      pendingExpandRef.current = null;
      return;
    }

    // Initial load: queue root's direct children
    if (stateRef.current.slowQueue.length === 0) {
      const rootChildren = getChildIds('root', links);
      if (rootChildren.length > 0) {
        dispatch({ type: 'INIT_QUEUE', payload: rootChildren });
      }
    }
  }, [graphData.nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived current node
  const currentNodeId = state.slowQueue[state.slowIndex] ?? null;
  const currentNode = graphData.nodes.find((n) => n.id === currentNodeId) ?? null;

  // Parent node label (for context in explain API calls)
  const parentNode =
    state.levelStack.length > 0
      ? graphData.nodes.find(
          (n) => n.id === state.levelStack[state.levelStack.length - 1].parentNodeId
        ) ?? null
      : null;

  // Navigation state flags
  // Check that every node in the current queue has been visited before declaring done —
  // prevents "All explored" from firing when the user jumps directly to the last node.
  const allInQueueVisited =
    state.slowQueue.length > 0 &&
    state.slowQueue.every((id) => state.visitedIds.has(id));

  const isAtEnd =
    allInQueueVisited &&
    state.slowIndex === state.slowQueue.length - 1 &&
    state.levelStack.length === 0;

  const isLevelComplete =
    allInQueueVisited &&
    state.slowIndex === state.slowQueue.length - 1 &&
    state.levelStack.length > 0;

  const canGoNext =
    state.slowQueue.length > 0 && state.slowIndex < state.slowQueue.length - 1;

  const canGoBack = state.levelStack.length > 0;

  const isExpanding = !!pendingExpandRef.current || !!expandingNodeId;

  // "Go Deeper": node not yet expanded — will call API
  const canGoDeeper =
    currentNode !== null &&
    currentNode.id !== 'root' &&
    !expandedNodes.has(currentNode.id) &&
    !isExpanding;

  // "Enter Subtopics": node already expanded — enter its children without API call
  const canEnterChildren =
    currentNode !== null &&
    currentNode.id !== 'root' &&
    expandedNodes.has(currentNode.id);

  const next = useCallback(() => {
    dispatch({ type: 'NEXT' });
  }, []);

  const goDeeper = useCallback(
    async (node) => {
      if (!node || !canGoDeeper) return;
      pendingExpandRef.current = node.id;
      await expand(node);
    },
    [canGoDeeper, expand]
  );

  const enterChildren = useCallback(() => {
    const node = stateRef.current
      ? graphDataRef.current.nodes.find(
          (n) => n.id === stateRef.current.slowQueue[stateRef.current.slowIndex]
        )
      : null;
    if (!node) return;
    const children = getChildIds(node.id, graphDataRef.current.links);
    if (children.length > 0) {
      dispatch({ type: 'GO_DEEPER', payload: children, parentNodeId: node.id });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const back = useCallback(() => {
    dispatch({ type: 'BACK' });
  }, []);

  const jumpToNode = useCallback((nodeId) => {
    const { links } = graphDataRef.current;
    const path = findPathToNode(nodeId, links);
    if (!path || path.length < 2) return;
    const newLevelStack = [];
    for (let i = 1; i < path.length - 1; i++) {
      const q = getChildIds(path[i - 1], links);
      newLevelStack.push({ queue: q, index: Math.max(0, q.indexOf(path[i])), parentNodeId: path[i - 1] });
    }
    const parentId = path[path.length - 2];
    const newQueue = getChildIds(parentId, links);
    const newIndex = Math.max(0, newQueue.indexOf(nodeId));
    dispatch({ type: 'JUMP_TO_NODE', payload: { queue: newQueue, index: newIndex, levelStack: newLevelStack, nodeId } });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    currentNode,
    parentNode,
    visitedIds: state.visitedIds,
    slowQueue: state.slowQueue,
    slowIndex: state.slowIndex,
    levelStack: state.levelStack,
    next,
    goDeeper,
    enterChildren,
    back,
    jumpToNode,
    isAtEnd,
    canGoNext,
    isLevelComplete,
    canGoBack,
    canGoDeeper,
    canEnterChildren,
    isExpanding,
  };
}
