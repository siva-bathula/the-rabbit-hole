import { useState, useCallback, useRef, useEffect } from 'react';
import SearchBar, { getRandomN, STATIC_TOPICS } from './components/SearchBar.jsx';
import Graph from './components/Graph.jsx';
import NodeOverlay from './components/NodeOverlay.jsx';
import SlowBurnView from './components/SlowBurnView.jsx';
import SessionsDrawer from './components/SessionsDrawer.jsx';
import FollowUpModal from './components/FollowUpModal.jsx';
import { useGraph } from './hooks/useGraph.js';
import QuizOverlay from './components/QuizOverlay.jsx';
import {
  saveLive, loadLive, clearLive,
  saveSessions, loadSessions,
  saveMode, loadMode,
  saveExplainMode, loadExplainMode,
  serializeShareSnap, deserializeShareSnap,
} from './lib/persist.js';

function buildSession(topic, mode, snap, shareId = null) {
  const previewNodes = snap.graphData.nodes
    .filter((n) => n.id !== 'root')
    .slice(0, 3)
    .map((n) => n.label);
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    topic,
    rootLabel: snap.rootLabel,
    mode,
    createdAt: now,
    lastUsedAt: now,
    nodeCount: snap.graphData.nodes.length,
    previewNodes,
    shareId: shareId || null,
    // full restorable state
    graphData: snap.graphData,
    expandedNodes: snap.expandedNodes,
    parentLabelOf: snap.parentLabelOf,
    originalPosition: snap.originalPosition,
    explanationCache: snap.explanationCache,
    expandDataCache: snap.expandDataCache,
  };
}

function normalizeTopicKey(topic) {
  return (topic || '').trim().toLowerCase();
}

/** Append without duplicating the same display topic (case-insensitive). */
function upsertSessionByTopic(prev, session) {
  const key = normalizeTopicKey(session.topic);
  if (!key) return [...prev, session];
  return [...prev.filter((s) => normalizeTopicKey(s.topic) !== key), session];
}

/** Keep one session per topic; prefer the one with the latest lastUsedAt/createdAt. */
function dedupeSessionsByTopic(sessions) {
  if (!Array.isArray(sessions) || sessions.length < 2) return sessions;
  const byKey = new Map();
  for (const s of sessions) {
    const key = normalizeTopicKey(s.topic) || s.id;
    const prev = byKey.get(key);
    const score = (x) => x.lastUsedAt ?? x.createdAt ?? 0;
    if (!prev || score(s) >= score(prev)) byKey.set(key, s);
  }
  return Array.from(byKey.values());
}

export default function App() {
  const [phase, setPhase] = useState('search'); // 'search' | 'graph'
  const [currentTopic, setCurrentTopic] = useState('');

  // Static topic picks — refreshed each time the user navigates to the search screen.
  // Held here (not inside SearchBar) so StrictMode double-mount doesn't reshuffle them.
  const [staticPicks, setStaticPicks] = useState(() => getRandomN(STATIC_TOPICS, 4));

  // Mode — initialised from localStorage (#4)
  const [mode, setMode] = useState(() => loadMode());

  // Explain depth (ELI5 / Normal / Expert) — session-level, persisted
  const [explainMode, setExplainMode] = useState(() => loadExplainMode());

  // Search history — persisted to localStorage, cap 10, case-normalised (#5)
  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('rabbit-hole-history') || '[]');
    } catch {
      return [];
    }
  });

  // Sessions — initialised from localStorage (#2), deduped by topic to fix legacy duplicates
  const [sessions, setSessions] = useState(() => dedupeSessionsByTopic(loadSessions()));
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);

  // Prefill topic for fork flow (carries a node label to the search screen)
  const [prefillTopic, setPrefillTopic] = useState('');

  // Follow-up modal — triggered from NodeOverlay
  const [followUpNode, setFollowUpNode] = useState(null);

  // Quiz overlay — { node, explanation }
  const [quizTarget, setQuizTarget] = useState(null);

  // Share graph state
  const [shareId, setShareId] = useState(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const saveToHistory = useCallback((topic) => {
    const normalised = topic.trim();
    if (!normalised) return;
    setSearchHistory((prev) => {
      // Case-insensitive dedup (#5)
      const filtered = prev.filter(
        (t) => t.toLowerCase() !== normalised.toLowerCase(),
      );
      const next = [normalised, ...filtered].slice(0, 10); // cap at 10 (#5)
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

  // ── Persistence effects ────────────────────────────────────────────────────

  // #4 — Save mode whenever it changes
  useEffect(() => { saveMode(mode); }, [mode]);

  // Save explain depth whenever it changes
  useEffect(() => { saveExplainMode(explainMode); }, [explainMode]);

  // #2 — Save sessions whenever they change
  useEffect(() => { saveSessions(sessions); }, [sessions]);

  // #1 + #3 — Save live graph (including explanation cache) whenever graphData
  // changes. Guard: don't save while a fetch is in-flight (graphData is empty
  // during explore) or before the restore-on-mount effect has run.
  const restoredRef = useRef(false);
  const persistLive = useCallback(() => {
    if (!restoredRef.current) return;
    const snap = snapshot();
    if (!snap.graphData.nodes.length) return;
    saveLive({ snap, topic: currentTopic, mode, activeSessionId, shareId });
  }, [snapshot, currentTopic, mode, activeSessionId, shareId]);

  useEffect(() => {
    if (phase === 'graph' && !isExploring) persistLive();
  }, [graphData, phase, isExploring, persistLive]);

  // #1 — Restore live graph on first mount (runs once)
  // If a ?share= param is present, load that graph from the API instead.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');

    if (shareId) {
      // Load shared graph — skip live restore, clear the query param from the URL
      window.history.replaceState({}, '', window.location.pathname);
      fetch(`/api/share/${shareId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) return;
          const snap = deserializeShareSnap(data);
          restore(snap);
          setCurrentTopic(data.topic || '');
          setPhase('graph');
        })
        .catch((err) => console.error('[share restore]', err))
        .finally(() => { restoredRef.current = true; });
      return;
    }

    const saved = loadLive();
    if (saved && saved.snap.graphData.nodes.length > 0) {
      restore(saved.snap);
      setCurrentTopic(saved.topic);
      setMode(saved.mode);
      setPhase('graph');
      if (saved.activeSessionId) setActiveSessionId(saved.activeSessionId);
      if (saved.shareId) setShareId(saved.shareId);
    }
    restoredRef.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── End persistence effects ────────────────────────────────────────────────

  // Save the live graph into the sessions list.
  // Returns the new session id so callers can set activeSessionId.
  const saveCurrentSession = useCallback((topicOverride, modeOverride) => {
    const snap = snapshot();
    if (!snap.graphData.nodes.length) return null;
    const session = buildSession(
      topicOverride ?? currentTopic,
      modeOverride ?? mode,
      snap,
      shareId,
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
      return upsertSessionByTopic(prev, session);
    });
    return session.id;
  }, [snapshot, currentTopic, mode, activeSessionId, shareId]);

  // Switch to a saved session (saves current first)
  const switchToSession = useCallback((id) => {
    // Save current live graph back to its own session (only if there is one)
    if (graphData.nodes.length > 0 && activeSessionId) {
      const snap = snapshot();
      const updated = buildSession(currentTopic, mode, snap, shareId);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId
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
      setShareId(target.shareId || null);
      setSessionsOpen(false);
      // Bump lastUsedAt so the list stays sorted by most-recently-used
      return prev.map((s) => s.id === id ? { ...s, lastUsedAt: Date.now() } : s);
    });
  }, [snapshot, restore, graphData.nodes.length, currentTopic, mode, activeSessionId, shareId]);

  const deleteSession = useCallback((id) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) setActiveSessionId(null);
  }, [activeSessionId]);

  // Wipe all saved sessions, clear live graph, return to home (from sessions drawer)
  const handleClearAllSessions = useCallback(() => {
    setSessions([]);
    clearLive();
    reset();
    setPhase('search');
    setStaticPicks(getRandomN(STATIC_TOPICS, 4));
    setCurrentTopic('');
    setPrefillTopic('');
    setActiveSessionId(null);
    setShareId(null);
    setExplainMode('normal');
    setSelectedNode(null);
    setFollowUpNode(null);
    setQuizTarget(null);
    setSessionsOpen(false);
  }, [reset, setSelectedNode]);

  const handleShare = useCallback(async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const snap = snapshot();
      const body = {
        ...serializeShareSnap(snap, currentTopic),
        ...(shareId ? { id: shareId } : {}),
      };
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Share failed');
      const { id } = await res.json();
      setShareId(id);
      const url = `${window.location.origin}/?share=${id}`;
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch (err) {
      console.error('[share]', err);
    } finally {
      setIsSharing(false);
    }
  }, [snapshot, currentTopic, shareId, isSharing]);

  // "Open in new exploration" from NodeOverlay — saves current, goes to search pre-filled
  const handleForkHole = useCallback((nodeTopic) => {
    if (graphData.nodes.length > 0) {
      const snap = snapshot();
      const session = buildSession(currentTopic, mode, snap, shareId);
      setSessions((prev) => {
        if (activeSessionId) {
          const exists = prev.some((s) => s.id === activeSessionId);
          if (exists) {
            return prev.map((s) =>
              s.id === activeSessionId ? { ...session, id: activeSessionId } : s,
            );
          }
        }
        return upsertSessionByTopic(prev, session);
      });
    }
    setSelectedNode(null);
    setPrefillTopic(nodeTopic);
    reset();
    setPhase('search');
    setStaticPicks(getRandomN(STATIC_TOPICS, 4));
    setCurrentTopic('');
    setActiveSessionId(null);
    setShareId(null);
  }, [snapshot, graphData.nodes.length, currentTopic, mode, activeSessionId, shareId, reset, setSelectedNode]);

  // Submit from the follow-up modal: save current session, start new exploration in-place
  const handleFollowUpSubmit = useCallback(
    async (topic) => {
      setFollowUpNode(null);
      setSelectedNode(null);
      // Save current graph before wiping it
      if (graphData.nodes.length > 0) {
        const snap = snapshot();
        const session = buildSession(currentTopic, mode, snap, shareId);
        setSessions((prev) => {
          if (activeSessionId) {
            const exists = prev.some((s) => s.id === activeSessionId);
            if (exists) {
              return prev.map((s) =>
                s.id === activeSessionId ? { ...session, id: activeSessionId } : s,
              );
            }
          }
          return upsertSessionByTopic(prev, session);
        });
      }
      saveToHistory(topic);
      setCurrentTopic(topic);
      setActiveSessionId(null);
      setShareId(null);
      await explore(topic);
      // Stay on graph phase — no navigation needed
    },
    [snapshot, graphData.nodes.length, currentTopic, mode, activeSessionId, shareId, explore, saveToHistory, setSelectedNode],
  );

  const handleSearch = useCallback(
    async (input) => {
      // Accept either a plain string or {query, displayLabel} from trending chips
      const displayLabel = typeof input === 'string' ? input : input.displayLabel;
      const query = typeof input === 'string' ? input : input.query;
      saveToHistory(displayLabel);
      setPrefillTopic('');
      setCurrentTopic(displayLabel);
      await explore(query);
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
      const session = buildSession(currentTopic, mode, snap, shareId);
      setSessions((prev) => {
        if (activeSessionId) {
          const exists = prev.some((s) => s.id === activeSessionId);
          if (exists) {
            return prev.map((s) =>
              s.id === activeSessionId ? { ...session, id: activeSessionId } : s,
            );
          }
        }
        return upsertSessionByTopic(prev, session);
      });
    }
    clearLive(); // user explicitly left — don't auto-restore this graph
    reset();
    setPhase('search');
    setStaticPicks(getRandomN(STATIC_TOPICS, 4));
    setCurrentTopic('');
    setPrefillTopic('');
    setActiveSessionId(null);
    setShareId(null);
    setExplainMode('normal');
  };

  return (
    <div className={`w-full relative ${phase === 'graph' ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {phase === 'search' && (
        <SearchBar
          onSearch={handleSearch}
          isLoading={isExploring}
          mode={mode}
          onModeChange={setMode}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSwitchSession={switchToSession}
          prefillTopic={prefillTopic}
          staticPicks={staticPicks}
        />
      )}

      {phase === 'graph' && (
        <>
          {/* Graph View: full-screen interactive graph */}
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
                  explainMode={explainMode}
                  onExplainModeChange={setExplainMode}
                  onExplanationCached={persistLive}
                  onQuizMe={(node, explanation) => setQuizTarget({ node, explanation, rootTopic: rootLabel })}
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
                explainMode={explainMode}
                onExplainModeChange={setExplainMode}
                onQuizMe={(node, explanation) => setQuizTarget({ node, explanation, rootTopic: rootLabel })}
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
              {/* Share button */}
              <button
                onClick={handleShare}
                disabled={isSharing || graphData.nodes.length === 0}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-sm font-medium transition-all border
                  border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10
                  disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'rgba(34,211,238,0.07)' }}
                title="Copy shareable link"
              >
                {isSharing ? (
                  <div className="w-4 h-4 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
                ) : shareCopied ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                )}
                <span className="hidden sm:inline">{shareCopied ? 'Copied!' : 'Share'}</span>
              </button>

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

              {/* Mode toggle — always shows current mode, both states visually prominent */}
              <button
                onClick={handleModeToggle}
                disabled={isExploring}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl text-sm font-medium transition-all border
                  disabled:opacity-40 disabled:cursor-not-allowed
                  ${mode === 'slow'
                    ? 'bg-purple-600/20 border-purple-500/35 text-purple-300 hover:bg-purple-600/30'
                    : 'bg-white/8 border-white/15 text-white/80 hover:bg-white/12 hover:text-white'
                  }`}
              >
                {mode === 'slow' ? (
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
                    Graph View
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
        onClearAll={handleClearAllSessions}
      />

      {/* Follow-up modal — stays on the graph, saves current session */}
      {followUpNode && (
        <FollowUpModal
          triggerNode={followUpNode}
          onSubmit={handleFollowUpSubmit}
          onClose={() => setFollowUpNode(null)}
        />
      )}

      {/* Quiz overlay */}
      {quizTarget && (
        <QuizOverlay
          node={quizTarget.node}
          explanation={quizTarget.explanation}
          rootTopic={quizTarget.rootTopic || ''}
          onClose={() => setQuizTarget(null)}
        />
      )}
    </div>
  );
}
