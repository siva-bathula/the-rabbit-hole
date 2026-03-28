import { useState, useCallback, useRef } from 'react';
import SearchBar from './components/SearchBar.jsx';
import Graph from './components/Graph.jsx';
import NodeOverlay from './components/NodeOverlay.jsx';
import SlowBurnView from './components/SlowBurnView.jsx';
import SessionsDrawer from './components/SessionsDrawer.jsx';
import FollowUpModal from './components/FollowUpModal.jsx';
import { useGraph } from './hooks/useGraph.js';

function buildSession(topic, mode, snap) {
  const previewNodes = snap.graphData.nodes
    .filter((n) => n.id !== 'root')
    .slice(0, 3)
    .map((n) => n.label);
  return {
    id: crypto.randomUUID(),
    topic,
    rootLabel: snap.rootLabel,
    mode,
    createdAt: Date.now(),
    nodeCount: snap.graphData.nodes.length,
    previewNodes,
    // full restorable state
    graphData: snap.graphData,
    expandedNodes: snap.expandedNodes,
    parentLabelOf: snap.parentLabelOf,
    originalPosition: snap.originalPosition,
    explanationCache: snap.explanationCache,
    expandDataCache: snap.expandDataCache,
  };
}

export default function App() {
  const [phase, setPhase] = useState('search'); // 'search' | 'graph'
  const [currentTopic, setCurrentTopic] = useState('');
  const [mode, setMode] = useState('fast'); // 'fast' | 'slow'

  // Search history — persisted to localStorage
  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('rabbit-hole-history') || '[]');
    } catch {
      return [];
    }
  });

  // In-memory exploration sessions
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);

  // Prefill topic for fork flow (carries a node label to the search screen)
  const [prefillTopic, setPrefillTopic] = useState('');

  // Follow-up modal — triggered from NodeOverlay
  const [followUpNode, setFollowUpNode] = useState(null);

  const saveToHistory = useCallback((topic) => {
    setSearchHistory((prev) => {
      const next = [topic, ...prev.filter((t) => t !== topic)].slice(0, 5);
      localStorage.setItem('rabbit-hole-history', JSON.stringify(next));
      return next;
    });
  }, []);

  const {
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
    snapshot,
    restore,
    explanationCache,
  } = useGraph();

  // Save the live graph into the sessions list.
  // Returns the new session id so callers can set activeSessionId.
  const saveCurrentSession = useCallback((topicOverride, modeOverride) => {
    const snap = snapshot();
    if (!snap.graphData.nodes.length) return null;
    const session = buildSession(
      topicOverride ?? currentTopic,
      modeOverride ?? mode,
      snap,
    );
    setSessions((prev) => {
      // Replace existing session for same activeSessionId if switching back
      if (activeSessionId) {
        const exists = prev.some((s) => s.id === activeSessionId);
        if (exists) {
          return prev.map((s) =>
            s.id === activeSessionId ? { ...session, id: activeSessionId } : s,
          );
        }
      }
      return [...prev, session];
    });
    return session.id;
  }, [snapshot, currentTopic, mode, activeSessionId]);

  // Switch to a saved session (saves current first)
  const switchToSession = useCallback((id) => {
    // Save current live graph under activeSessionId
    if (graphData.nodes.length > 0) {
      const snap = snapshot();
      const updated = buildSession(currentTopic, mode, snap);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === (activeSessionId ?? id)
            ? { ...updated, id: s.id }
            : s,
        ),
      );
    }

    setSessions((prev) => {
      const target = prev.find((s) => s.id === id);
      if (!target) return prev;

      restore({
        graphData: target.graphData,
        expandedNodes: target.expandedNodes,
        rootLabel: target.rootLabel,
        parentLabelOf: target.parentLabelOf,
        originalPosition: target.originalPosition,
        explanationCache: target.explanationCache,
        expandDataCache: target.expandDataCache,
      });
      setCurrentTopic(target.topic);
      setMode(target.mode);
      setPhase('graph');
      setActiveSessionId(id);
      setSessionsOpen(false);
      return prev;
    });
  }, [snapshot, restore, graphData.nodes.length, currentTopic, mode, activeSessionId]);

  const deleteSession = useCallback((id) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
  }, [activeSessionId]);

  // "Open in new exploration" from NodeOverlay — saves current, goes to search pre-filled
  const handleForkHole = useCallback((nodeTopic) => {
    if (graphData.nodes.length > 0) {
      const snap = snapshot();
      const session = buildSession(currentTopic, mode, snap);
      setSessions((prev) => {
        if (activeSessionId) {
          const exists = prev.some((s) => s.id === activeSessionId);
          if (exists) {
            return prev.map((s) =>
              s.id === activeSessionId ? { ...session, id: activeSessionId } : s,
            );
          }
        }
        return [...prev, session];
      });
    }
    setSelectedNode(null);
    setPrefillTopic(nodeTopic);
    reset();
    setPhase('search');
    setCurrentTopic('');
    setActiveSessionId(null);
  }, [snapshot, graphData.nodes.length, currentTopic, mode, activeSessionId, reset, setSelectedNode]);

  // Submit from the follow-up modal: save current session, start new exploration in-place
  const handleFollowUpSubmit = useCallback(
    async (topic) => {
      setFollowUpNode(null);
      setSelectedNode(null);
      // Save current graph before wiping it
      if (graphData.nodes.length > 0) {
        const snap = snapshot();
        const session = buildSession(currentTopic, mode, snap);
        setSessions((prev) => {
          if (activeSessionId) {
            const exists = prev.some((s) => s.id === activeSessionId);
            if (exists) {
              return prev.map((s) =>
                s.id === activeSessionId ? { ...session, id: activeSessionId } : s,
              );
            }
          }
          return [...prev, session];
        });
      }
      saveToHistory(topic);
      setCurrentTopic(topic);
      setActiveSessionId(null);
      await explore(topic);
      // Stay on graph phase — no navigation needed
    },
    [snapshot, graphData.nodes.length, currentTopic, mode, activeSessionId, explore, saveToHistory, setSelectedNode],
  );

  const handleSearch = useCallback(
    async (topic) => {
      saveToHistory(topic);
      setPrefillTopic('');
      setCurrentTopic(topic);
      await explore(topic);
      setPhase('graph');
      setActiveSessionId(null);
    },
    [explore, saveToHistory],
  );

  const handleNodeClick = useCallback(
    (node) => {
      setSelectedNode((prev) => (prev?.id === node.id ? null : node));
    },
    [setSelectedNode],
  );

  const handleExpand = useCallback(
    async (node) => {
      await expand(node);
    },
    [expand],
  );

  const handleCollapse = useCallback(
    (node) => {
      collapse(node);
      setSelectedNode(null);
    },
    [collapse, setSelectedNode],
  );

  const handleRelatedExplore = useCallback(
    async (topic) => {
      saveToHistory(topic);
      setSelectedNode(null);
      setCurrentTopic(topic);
      await explore(topic);
      setPhase('graph');
      setActiveSessionId(null);
    },
    [explore, setSelectedNode, saveToHistory],
  );

  const handleModeToggle = useCallback(() => {
    setMode((m) => (m === 'fast' ? 'slow' : 'fast'));
  }, []);

  const handleNewSearch = () => {
    // Save live graph before going home
    if (graphData.nodes.length > 0) {
      const snap = snapshot();
      const session = buildSession(currentTopic, mode, snap);
      setSessions((prev) => {
        if (activeSessionId) {
          const exists = prev.some((s) => s.id === activeSessionId);
          if (exists) {
            return prev.map((s) =>
              s.id === activeSessionId ? { ...session, id: activeSessionId } : s,
            );
          }
        }
        return [...prev, session];
      });
    }
    reset();
    setPhase('search');
    setCurrentTopic('');
    setMode('fast');
    setPrefillTopic('');
    setActiveSessionId(null);
  };

  return (
    <div className="w-full h-full relative">
      {phase === 'search' && (
        <SearchBar
          onSearch={handleSearch}
          isLoading={isExploring}
          mode={mode}
          onModeChange={setMode}
          recentTopics={searchHistory}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSwitchSession={switchToSession}
          prefillTopic={prefillTopic}
        />
      )}

      {phase === 'graph' && (
        <>
          {/* Fast mode: full-screen graph */}
          {mode === 'fast' && (
            <>
              <Graph
                graphData={graphData}
                selectedNode={selectedNode}
                expandedNodes={expandedNodes}
                expandingNodeId={expandingNodeId}
                onNodeClick={handleNodeClick}
              />

              {selectedNode && (
                <NodeOverlay
                  node={selectedNode}
                  rootTopic={rootLabel}
                  onClose={() => setSelectedNode(null)}
                  onExpand={handleExpand}
                  onCollapse={handleCollapse}
                  onExplore={handleRelatedExplore}
                  isExpanding={expandingNodeId === selectedNode.id}
                  isExpanded={expandedNodes.has(selectedNode.id)}
                  explanationCache={explanationCache}
                  onForkHole={handleForkHole}
                  onAskFollowUp={(node) => { setSelectedNode(null); setFollowUpNode(node); }}
                />
              )}

              {/* Legend */}
              <div
                className="absolute bottom-5 right-5 z-30 p-3 rounded-xl space-y-2"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {[
                  { color: '#F59E0B', label: 'Root topic' },
                  { color: '#22D3EE', label: 'Expanded' },
                  { color: '#A855F7', label: 'Selected / Theory' },
                  { color: '#22C55E', label: 'Application' },
                  { color: '#F97316', label: 'History' },
                  { color: '#3B82F6', label: 'Core / Other' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="text-white/40 text-xs">{label}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Slow burn mode: sidebar tree + content panel */}
          {mode === 'slow' && (
            <div
              className="absolute inset-0 pt-[90px] sm:pt-[56px]"
              style={{ background: '#07070f' }}
            >
              <SlowBurnView
                graphData={graphData}
                expandedNodes={expandedNodes}
                expand={expand}
                expandingNodeId={expandingNodeId}
                rootLabel={rootLabel}
                isExploring={isExploring}
                onExplore={handleRelatedExplore}
                explanationCache={explanationCache}
                onAskFollowUp={(node) => setFollowUpNode(node)}
              />
            </div>
          )}

          {/* Top bar — floats over both modes */}
          <div
            className="absolute top-0 left-0 right-0 z-30 pointer-events-none
              flex flex-col sm:flex-row sm:items-center sm:justify-between
              px-4 sm:px-5 pt-2.5 pb-2 gap-1.5 sm:gap-0"
            style={{ background: mode === 'slow' ? 'rgba(7,7,15,0.92)' : 'rgba(7,7,15,0.75)' }}
          >
            {/* Row 1 (both mobile & desktop): New Search + current topic */}
            <div className="flex items-center justify-between sm:justify-start gap-3 pointer-events-auto">
              <button
                onClick={handleNewSearch}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-white/60
                  hover:text-white hover:bg-white/10 transition-all text-sm font-medium flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                New Search
              </button>
              <div
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white/70 truncate"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  maxWidth: '160px',
                }}
              >
                {currentTopic}
              </div>
            </div>

            {/* Row 2 (mobile) / right side (desktop): Sessions + mode toggle + node count */}
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 pointer-events-auto">
              {/* Sessions pill */}
              {sessions.length > 0 && (
                <button
                  onClick={() => setSessionsOpen(true)}
                  className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-sm font-medium transition-all border
                    border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
                  style={{ background: 'rgba(168,85,247,0.08)' }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Sessions
                  <span
                    className="flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold text-white"
                    style={{ background: 'rgba(168,85,247,0.6)' }}
                  >
                    {sessions.length}
                  </span>
                </button>
              )}

              {/* Mode toggle */}
              <button
                onClick={handleModeToggle}
                disabled={isExploring}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-sm font-medium transition-all border
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${mode === 'slow'
                    ? 'bg-purple-600/20 border-purple-500/35 text-purple-300 hover:bg-purple-600/30'
                    : 'border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                  }`}
              >
                {mode === 'fast' ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                    Slow Burn
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Fast Mode
                  </>
                )}
              </button>

              {mode === 'fast' && (
                <span className="text-xs text-white/30 hidden sm:inline">
                  {graphData.nodes.length} nodes
                </span>
              )}
            </div>
          </div>

          {/* Error toast */}
          {error && (
            <div
              className="absolute top-16 left-1/2 -translate-x-1/2 z-50
                px-4 py-2.5 rounded-xl text-sm text-red-300 flex items-center gap-2"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              {error}
            </div>
          )}
        </>
      )}

      {/* Sessions drawer — available from any phase */}
      <SessionsDrawer
        sessions={sessions}
        activeSessionId={activeSessionId}
        isOpen={sessionsOpen}
        onClose={() => setSessionsOpen(false)}
        onSwitch={switchToSession}
        onDelete={deleteSession}
      />

      {/* Follow-up modal — stays on the graph, saves current session */}
      {followUpNode && (
        <FollowUpModal
          triggerNode={followUpNode}
          onSubmit={handleFollowUpSubmit}
          onClose={() => setFollowUpNode(null)}
        />
      )}
    </div>
  );
}
