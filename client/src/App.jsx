import { useState, useCallback } from 'react';
import SearchBar from './components/SearchBar.jsx';
import Graph from './components/Graph.jsx';
import NodeOverlay from './components/NodeOverlay.jsx';
import SlowBurnView from './components/SlowBurnView.jsx';
import { useGraph } from './hooks/useGraph.js';

export default function App() {
  const [phase, setPhase] = useState('search'); // 'search' | 'graph'
  const [currentTopic, setCurrentTopic] = useState('');
  const [mode, setMode] = useState('fast'); // 'fast' | 'slow'

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
  } = useGraph();

  const handleSearch = useCallback(
    async (topic) => {
      setCurrentTopic(topic);
      await explore(topic);
      setPhase('graph');
    },
    [explore]
  );

  const handleNodeClick = useCallback(
    (node) => {
      setSelectedNode((prev) => (prev?.id === node.id ? null : node));
    },
    [setSelectedNode]
  );

  const handleExpand = useCallback(
    async (node) => {
      await expand(node);
    },
    [expand]
  );

  const handleCollapse = useCallback(
    (node) => {
      collapse(node);
      setSelectedNode(null);
    },
    [collapse, setSelectedNode]
  );

  const handleRelatedExplore = useCallback(
    async (topic) => {
      setSelectedNode(null);
      setCurrentTopic(topic);
      await explore(topic);
      setPhase('graph');
    },
    [explore, setSelectedNode]
  );

  const handleModeToggle = useCallback(async () => {
    const newMode = mode === 'fast' ? 'slow' : 'fast';
    setMode(newMode);
    await explore(currentTopic);
  }, [mode, currentTopic, explore]);

  const handleNewSearch = () => {
    reset();
    setPhase('search');
    setCurrentTopic('');
    setMode('fast');
  };

  return (
    <div className="w-full h-full relative">
      {phase === 'search' && (
        <SearchBar
          onSearch={handleSearch}
          isLoading={isExploring}
          mode={mode}
          onModeChange={setMode}
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
              className="absolute inset-0"
              style={{ paddingTop: '56px', background: '#07070f' }}
            >
              <SlowBurnView
                graphData={graphData}
                expandedNodes={expandedNodes}
                expand={expand}
                expandingNodeId={expandingNodeId}
                rootLabel={rootLabel}
                isExploring={isExploring}
                onExplore={handleRelatedExplore}
              />
            </div>
          )}

          {/* Top bar — floats over both modes */}
          <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-5 pt-3 pb-2 pointer-events-none"
            style={{ background: mode === 'slow' ? 'rgba(7,7,15,0.92)' : 'transparent' }}
          >
            <div className="flex items-center gap-3 pointer-events-auto">
              <button
                onClick={handleNewSearch}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-white/60
                  hover:text-white hover:bg-white/10 transition-all text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                New Search
              </button>
              <div
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white/70 truncate max-w-xs"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {currentTopic}
              </div>
            </div>

            <div className="flex items-center gap-3 pointer-events-auto">
              {/* Mode toggle */}
              <button
                onClick={handleModeToggle}
                disabled={isExploring}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border
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
                <span className="text-xs text-white/30">
                  {graphData.nodes.length} nodes
                </span>
              )}
            </div>
          </div>

          {/* Error toast */}
          {error && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50
              px-4 py-2.5 rounded-xl text-sm text-red-300
              flex items-center gap-2"
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
    </div>
  );
}
