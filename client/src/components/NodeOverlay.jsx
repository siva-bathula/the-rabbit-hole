import { useState, useEffect, useCallback } from 'react';

const MODES = [
  { id: 'eli5', label: 'Simple' },
  { id: 'normal', label: 'Normal' },
  { id: 'expert', label: 'Expert' },
];

function modeCacheKey(nodeId, mode) {
  return mode === 'normal' ? nodeId : `${nodeId}::${mode}`;
}

export default function NodeOverlay({ node, rootTopic, sessionTopic = '', onClose, onExpand, onCollapse, onExplore, isExpanding, isExpanded, explanationCache, onForkHole, onExplanationCached, onAskFollowUp, onQuizMe, explainMode = 'normal', onExplainModeChange }) {
  const [explanation, setExplanation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [deeperContent, setDeeperContent] = useState(null);
  const [isPulling, setIsPulling] = useState(false);
  const [deeperError, setDeeperError] = useState(null);
  const [copiedDeeper, setCopiedDeeper] = useState(false);

  const handleCopy = useCallback((code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  useEffect(() => {
    if (!node) return;

    const cacheKey = modeCacheKey(node.id, explainMode);

    setDeeperContent(null);
    setDeeperError(null);
    setIsPulling(false);

    // Serve from per-mode cache if available
    const cached = explanationCache?.current?.get(cacheKey);
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
        parentContext: rootTopic || node.label,
        rootTopic: rootTopic || '',
        sessionTopic: sessionTopic || '',
        mode: explainMode,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          if (data.error) setError(data.error);
          else {
            setExplanation(data);
            explanationCache?.current?.set(cacheKey, { explanation: data, deeper: null });
            onExplanationCached?.();
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load explanation.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [node?.id, explainMode, rootTopic, sessionTopic]);

  const handlePullThread = useCallback(async () => {
    if (!explanation || isPulling) return;
    setIsPulling(true);
    setDeeperError(null);
    const cacheKey = modeCacheKey(node.id, explainMode);
    try {
      const res = await fetch('/api/deepen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeLabel: node.label,
          parentContext: rootTopic || node.label,
          rootTopic: rootTopic || '',
          sessionTopic: sessionTopic || '',
          existingSummary: explanation.summary || '',
          mode: explainMode,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setDeeperError(data.error);
      } else {
        setDeeperContent(data);
        // Merge into the per-mode cache entry
        const entry = explanationCache?.current?.get(cacheKey);
        if (entry) {
          explanationCache.current.set(cacheKey, { ...entry, deeper: data });
          onExplanationCached?.();
        }
      }
    } catch {
      setDeeperError('Failed to pull deeper content.');
    } finally {
      setIsPulling(false);
    }
  }, [explanation, isPulling, node, rootTopic, sessionTopic, explainMode, explanationCache]);

  if (!node) return null;

  const handleExpand = () => {
    onExpand(node);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Panel — flex column so header/footer stay fixed while content scrolls */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
        <div className="mx-auto max-w-2xl">
          <div
            className="rounded-t-2xl border border-white/10 shadow-2xl flex flex-col"
            style={{
              background: 'linear-gradient(160deg, #0f0f1e 0%, #0a0a18 100%)',
              backdropFilter: 'blur(20px)',
              maxHeight: '85vh',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Branch-out progress bar */}
            {isExpanding && (
              <div className="w-full h-1 bg-white/10 overflow-hidden flex-shrink-0">
                <div className="h-full bg-purple-400 animate-progress-indeterminate" />
              </div>
            )}

            {/* Header */}
            <div className="px-6 pt-3 pb-4 border-b border-white/10 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-medium uppercase tracking-widest text-purple-400 mb-1 block">
                    Exploring
                  </span>
                  <h2 className="text-2xl font-bold text-white">
                    {node.label}
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  className="mt-1 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Explain depth toggle */}
              <div className="flex items-center gap-2 mt-3">
                <span className="text-white/30 text-xs">Depth:</span>
                <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.07)' }}>
                  {MODES.map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => onExplainModeChange?.(id)}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                        explainMode === id
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {isLoading && explainMode !== 'normal' && (
                  <div className="w-3 h-3 rounded-full border border-purple-400/30 border-t-purple-400 animate-spin" />
                )}
              </div>
            </div>

            {/* Branch Out progress banner */}
            {isExpanding && (
              <div
                className="flex items-center gap-3 px-5 py-3 flex-shrink-0"
                style={{ background: 'rgba(168,85,247,0.12)', borderBottom: '1px solid rgba(168,85,247,0.2)' }}
              >
                <div className="w-4 h-4 rounded-full border-2 border-purple-400/30 border-t-purple-400 animate-spin flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-purple-300 text-sm font-medium">Branching out…</p>
                  <p className="text-purple-300/50 text-xs mt-0.5">Fetching subtopics for <span className="text-purple-300/80">{node.label}</span></p>
                </div>
                {/* Animated progress bar */}
                <div className="w-20 h-1 rounded-full bg-purple-900/60 overflow-hidden flex-shrink-0">
                  <div
                    className="h-full rounded-full bg-purple-400"
                    style={{ animation: 'progressSlide 1.6s ease-in-out infinite' }}
                  />
                </div>
              </div>
            )}

            {/* Content — grows and scrolls */}
            <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">
              {isLoading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-purple-500/30 border-t-purple-400 animate-spin" />
                  <p className="text-white/40 text-sm">Thinking...</p>
                </div>
              )}

              {error && !isLoading && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-red-300 text-sm">
                  {error}
                </div>
              )}

              {explanation && !isLoading && (
                <div className="space-y-5">
                  {/* Summary */}
                  <p className="text-white/80 leading-relaxed text-base">
                    {explanation.summary}
                  </p>

                  {/* Code block */}
                  {explanation.code && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-semibold uppercase tracking-widest text-green-400">
                          Code Example
                        </h3>
                        <button
                          onClick={() => handleCopy(explanation.code)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors
                            text-white/40 hover:text-white hover:bg-white/10"
                        >
                          {copied ? (
                            <>
                              <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="text-green-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy
                            </>
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
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-cyan-400 mb-3">
                        Key Insights
                      </h3>
                      <ul className="space-y-2.5">
                        {explanation.details.map((insight, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-cyan-400" />
                            <span className="text-white/70 text-sm leading-relaxed">
                              {insight}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* External Resources */}
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
                            {/* Wikipedia "W" icon */}
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white group-hover:bg-white/20">
                              W
                            </span>
                            <span className="flex-1 truncate">
                              Wikipedia — {explanation.wikipedia.title}
                            </span>
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
                            {/* Link icon */}
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center group-hover:bg-sky-500/30">
                              <svg className="w-3.5 h-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                            </span>
                            <span className="flex-1 truncate">
                              {explanation.learnMore.title}
                            </span>
                            <svg className="w-3.5 h-3.5 flex-shrink-0 text-white/30 group-hover:text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Related Concepts — click to explore */}
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

                  {/* Open in new exploration (fork) */}
                  {onForkHole && (
                    <div className="pt-1">
                      <button
                        onClick={() => onForkHole(node.label)}
                        className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl
                          text-xs font-medium transition-all border
                          bg-white/3 border-white/8 text-white/35
                          hover:bg-cyan-500/10 hover:border-cyan-500/25 hover:text-cyan-300/80"
                      >
                        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Open in new exploration
                      </button>
                    </div>
                  )}

                  {/* Key Takeaway card */}
                  {explanation.keyTakeaway && (
                    <div
                      className="rounded-xl px-4 py-3.5"
                      style={{
                        background: 'rgba(168,85,247,0.07)',
                        border: '1px solid rgba(168,85,247,0.18)',
                      }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-widest text-purple-400/70 mb-2 flex items-center gap-1.5">
                        <span>💡</span> Key Takeaway
                      </p>
                      <p className="text-white/70 text-sm leading-relaxed italic">
                        {explanation.keyTakeaway}
                      </p>
                    </div>
                  )}

                  {/* Quiz Me */}
                  {onQuizMe && explanation && (
                    <div className="pt-1">
                      <button
                        onClick={() => onQuizMe(node, explanation)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl
                          text-sm font-medium transition-all border
                          hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-200
                          active:scale-95"
                        style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', color: 'rgba(253,230,138,0.8)' }}
                      >
                        <span>🧠</span>
                        Quiz Me on This
                      </button>
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
                    <div className="space-y-5 pt-2 border-t border-white/8">
                      <div className="flex items-center gap-2 pt-1">
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

            {/* AI disclaimer */}
            <p className="px-6 pb-3 text-center text-white/20 text-xs leading-relaxed">
              AI-generated · may be inaccurate · not professional advice
            </p>

            {/* Footer actions */}
            <div className="px-6 pt-4 pb-4 border-t border-white/10 flex flex-col gap-2.5 flex-shrink-0">
              {/* Ask follow-up — always visible for non-root nodes */}
              {onAskFollowUp && node.id !== 'root' && (
                <button
                  onClick={() => onAskFollowUp(node)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl
                    text-sm font-medium transition-all
                    text-purple-200/80 hover:text-white active:scale-95"
                  style={{
                    background: 'rgba(168,85,247,0.10)',
                    border: '1px solid rgba(168,85,247,0.28)',
                  }}
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Ask a follow-up
                </button>
              )}
            <div className="flex gap-3">
              {node.id !== 'root' && (isExpanded ? (
                <button
                  onClick={() => onCollapse(node)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all
                    bg-white/10 hover:bg-white/15 active:scale-95 text-white/70 hover:text-white border border-white/10"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M5 15l7-7 7 7" />
                  </svg>
                  Collapse
                </button>
              ) : (
                <button
                  onClick={handleExpand}
                  disabled={isExpanding}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-sm transition-all
                    bg-purple-600 hover:bg-purple-500 active:scale-95 text-white
                    disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
                >
                  {isExpanding ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      Branching out…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 9l-7 7-7-7" />
                      </svg>
                      Branch Out
                    </>
                  )}
                </button>
              ))}
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              >
                Close
              </button>
            </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
