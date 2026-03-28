import { useState, useEffect, useCallback } from 'react';
import FolderTree from './FolderTree.jsx';
import { useSlowBurn } from '../hooks/useSlowBurn.js';

function useNodeExplanation(node, parentContext, rootLabel, cache) {
  const [explanation, setExplanation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deeperContent, setDeeperContent] = useState(null);
  const [isPulling, setIsPulling] = useState(false);
  const [deeperError, setDeeperError] = useState(null);

  useEffect(() => {
    if (!node) return;

    setDeeperContent(null);
    setDeeperError(null);
    setIsPulling(false);

    // Serve from cache if available
    const cached = cache?.current?.get(node.id);
    if (cached) {
      setExplanation(cached.explanation ?? cached);
      setDeeperContent(cached.deeper ?? null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setExplanation(null);
    setError(null);
    setIsLoading(true);

    fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeLabel: node.label,
        parentContext: parentContext || node.label,
        rootTopic: rootLabel || '',
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          if (data.error) setError(data.error);
          else {
            setExplanation(data);
            cache?.current?.set(node.id, { explanation: data, deeper: null });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load explanation.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [node?.id, parentContext]);

  const handlePullThread = useCallback(async () => {
    if (!explanation || isPulling) return;
    setIsPulling(true);
    setDeeperError(null);
    try {
      const res = await fetch('/api/deepen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeLabel: node.label,
          parentContext: parentContext || node.label,
          rootTopic: rootLabel || '',
          existingSummary: explanation.summary || '',
        }),
      });
      const data = await res.json();
      if (data.error) {
        setDeeperError(data.error);
      } else {
        setDeeperContent(data);
        if (cache?.current?.has(node.id)) {
          const entry = cache.current.get(node.id);
          cache.current.set(node.id, { ...entry, deeper: data });
        }
      }
    } catch {
      setDeeperError('Failed to pull deeper content.');
    } finally {
      setIsPulling(false);
    }
  }, [explanation, isPulling, node, parentContext, rootLabel, cache]);

  return { explanation, isLoading, error, deeperContent, isPulling, deeperError, handlePullThread };
}

function ContentArea({ node, parentContext, rootLabel, cache, onExplore }) {
  const { explanation, isLoading, error, deeperContent, isPulling, deeperError, handlePullThread } = useNodeExplanation(node, parentContext, rootLabel, cache);
  const [copied, setCopied] = useState(false);
  const [copiedDeeper, setCopiedDeeper] = useState(false);

  const handleCopy = useCallback((code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  if (!node) return null;

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <span className="text-xs font-semibold uppercase tracking-widest text-purple-400 mb-2 block">
          {parentContext && parentContext !== node.label ? `${parentContext} →` : 'Exploring'}
        </span>
        <h1 className="text-3xl font-bold text-white leading-tight">{node.label}</h1>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-purple-500/30 border-t-purple-400 animate-spin" />
          <p className="text-white/40 text-sm">Thinking...</p>
        </div>
      )}

      {error && !isLoading && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {explanation && !isLoading && (
        <div className="space-y-8">
          {/* Summary */}
          <p className="text-white/80 leading-relaxed text-base">{explanation.summary}</p>

          {/* Code block */}
          {explanation.code && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-green-400">
                  Code Example
                </h3>
                <button
                  onClick={() => handleCopy(explanation.code)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {copied ? (
                    <span className="text-green-400">Copied</span>
                  ) : (
                    'Copy'
                  )}
                </button>
              </div>
              <pre
                className="rounded-xl p-4 overflow-x-auto text-sm leading-relaxed text-green-300 font-mono"
                style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(74,222,128,0.15)' }}
              >
                <code>{explanation.code}</code>
              </pre>
            </div>
          )}

          {/* Key Insights */}
          {explanation.details?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-4">
                Key Insights
              </h3>
              <ul className="space-y-3">
                {explanation.details.map((insight, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span className="text-white/70 leading-relaxed text-sm">{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Resources */}
          {(explanation.wikipedia || explanation.learnMore?.url) && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-sky-400 mb-3">
                Resources
              </h3>
              <div className="flex flex-col gap-2">
                {explanation.wikipedia?.url && (
                  <a
                    href={explanation.wikipedia.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors
                      bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/80 hover:text-white group"
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white group-hover:bg-white/20">
                      W
                    </span>
                    <span className="flex-1 truncate">Wikipedia — {explanation.wikipedia.title}</span>
                    <svg className="w-3.5 h-3.5 flex-shrink-0 text-white/30 group-hover:text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
                {explanation.learnMore?.url && (
                  <a
                    href={explanation.learnMore.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors
                      bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white/80 hover:text-white group"
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center group-hover:bg-sky-500/30">
                      <svg className="w-3.5 h-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </span>
                    <span className="flex-1 truncate">{explanation.learnMore.title}</span>
                    <svg className="w-3.5 h-3.5 flex-shrink-0 text-white/30 group-hover:text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Related Concepts */}
          {explanation.related?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400 mb-3">
                Related Concepts
              </h3>
              <div className="flex flex-wrap gap-2">
                {explanation.related.map((rel, i) => (
                  <button
                    key={i}
                    onClick={() => onExplore(rel)}
                    className="px-3 py-1 rounded-full text-xs font-medium transition-colors
                      bg-amber-500/10 border border-amber-500/20 text-amber-300
                      hover:bg-amber-500/25 hover:border-amber-500/40 hover:text-amber-200"
                  >
                    {rel}
                  </button>
                ))}
              </div>
              <p className="text-white/25 text-xs mt-2">Tap any concept to explore it</p>
            </div>
          )}

          {/* Pull the Thread — deeper content */}
          {!deeperContent && (
            <div className="pt-2">
              <button
                onClick={handlePullThread}
                disabled={isPulling}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl
                  text-sm font-medium transition-all border
                  bg-white/3 border-white/8 text-white/40
                  hover:bg-purple-500/10 hover:border-purple-500/25 hover:text-white/70
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPulling ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-purple-400 animate-spin" />
                    Unravelling…
                  </>
                ) : (
                  <>
                    <span>🧵</span>
                    Pull the Thread
                  </>
                )}
              </button>
              {deeperError && (
                <p className="text-red-400/70 text-xs mt-2 text-center">{deeperError}</p>
              )}
            </div>
          )}

          {/* Deeper content sections */}
          {deeperContent && (
            <div className="space-y-5 pt-4 border-t border-white/8">
              <div className="flex items-center gap-2">
                <span className="text-sm">🧵</span>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-purple-400">
                  Going Deeper
                </h3>
              </div>

              {deeperContent.analogy && (
                <div
                  className="px-4 py-3 rounded-xl text-sm text-white/75 leading-relaxed italic"
                  style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}
                >
                  {deeperContent.analogy}
                </div>
              )}

              {deeperContent.advancedInsights?.length > 0 && (
                <ul className="space-y-3">
                  {deeperContent.advancedInsights.map((insight, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-purple-400" />
                      <span className="text-white/70 text-sm leading-relaxed">{insight}</span>
                    </li>
                  ))}
                </ul>
              )}

              {deeperContent.code && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-green-400">
                      Advanced Example
                    </h3>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(deeperContent.code).then(() => {
                          setCopiedDeeper(true);
                          setTimeout(() => setCopiedDeeper(false), 2000);
                        });
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                        text-white/40 hover:text-white hover:bg-white/10"
                    >
                      {copiedDeeper ? <span className="text-green-400">Copied</span> : 'Copy'}
                    </button>
                  </div>
                  <pre
                    className="rounded-xl p-4 overflow-x-auto text-sm leading-relaxed text-green-300 font-mono"
                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(74,222,128,0.15)' }}
                  >
                    <code>{deeperContent.code}</code>
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SlowBurnView({
  graphData,
  expandedNodes,
  expand,
  expandingNodeId,
  rootLabel,
  isExploring,
  onExplore,
  explanationCache,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 640);

  const {
    currentNode,
    parentNode,
    visitedIds,
    slowQueue,
    slowIndex,
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
  } = useSlowBurn({ graphData, expandedNodes, expand, expandingNodeId });

  // Use the immediate parent's label as context — better than always using root
  const parentContext = parentNode?.label || rootLabel;

  const progress =
    slowQueue.length > 0 ? `${slowIndex + 1} / ${slowQueue.length}` : '';

  if (isExploring || graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-purple-500/30 border-t-purple-400 animate-spin" />
          <p className="text-white/40 text-sm">Building your learning path...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* Left sidebar — folder tree */}
      <div
        className="flex-shrink-0 overflow-hidden transition-all duration-300"
        style={{
          width: sidebarOpen ? '260px' : '0px',
          borderRight: sidebarOpen ? '1px solid rgba(255,255,255,0.07)' : 'none',
        }}
      >
        <FolderTree
          graphData={graphData}
          currentNodeId={currentNode?.id ?? null}
          visitedIds={visitedIds}
          rootLabel={rootLabel}
          onNodeClick={jumpToNode}
        />
      </div>

      {/* Right — content + footer nav */}
      <div className="relative flex-1 flex flex-col min-w-0 min-h-0">
        {/* Sidebar toggle button */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center
            w-5 h-10 rounded-r-lg text-white/40 hover:text-white transition-all"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          <span className="text-xs font-bold leading-none">{sidebarOpen ? '«' : '»'}</span>
        </button>
        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {currentNode ? (
            <ContentArea
              node={currentNode}
              parentContext={parentContext}
              rootLabel={rootLabel}
              cache={explanationCache}
              onExplore={onExplore}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-white/25 text-sm">Nothing to explore yet.</p>
            </div>
          )}
        </div>

        {/* Navigation footer */}
        <div
          className="flex-shrink-0 px-8 py-4 flex items-center justify-between gap-4"
          style={{
            borderTop: '1px solid rgba(255,255,255,0.07)',
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          {/* Left: progress + back */}
          <div className="flex items-center gap-4">
            {slowQueue.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all duration-300"
                    style={{ width: `${((slowIndex + 1) / slowQueue.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-white/25 font-mono tabular-nums">
                  {slowIndex + 1}/{slowQueue.length}
                </span>
              </div>
            )}
            {canGoBack && (
              <button
                onClick={back}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back
              </button>
            )}
          </div>

          {/* Right: depth actions + next */}
          <div className="flex items-center gap-3">
            {/* Enter existing subtopics (node already expanded) */}
            {canEnterChildren && (
              <button
                onClick={enterChildren}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
                  bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20
                  text-white/70 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Enter Subtopics
              </button>
            )}

            {/* Go deeper (node not yet expanded) */}
            {canGoDeeper && (
              <button
                onClick={() => goDeeper(currentNode)}
                disabled={isExpanding}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
                  bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20
                  text-white/70 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isExpanding ? (
                  <>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Expanding...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    Branch Out
                  </>
                )}
              </button>
            )}

            {/* Next / level-complete / all-done */}
            {isAtEnd ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white/30 border border-white/5">
                <svg className="w-4 h-4 text-green-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                All explored
              </div>
            ) : isLevelComplete ? (
              <span className="text-xs text-white/25 italic">
                Level complete — click Back to continue
              </span>
            ) : (
              <button
                onClick={next}
                disabled={!canGoNext}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all
                  bg-purple-600 hover:bg-purple-500 text-white
                  disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
