import { useState, useEffect, useCallback } from 'react';

export default function NodeOverlay({ node, rootTopic, onClose, onExpand, isExpanding }) {
  const [explanation, setExplanation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((code) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  useEffect(() => {
    if (!node) return;

    let cancelled = false;
    setExplanation(null);
    setError(null);
    setIsLoading(true);

    fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeLabel: node.label, parentContext: rootTopic || node.label }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          if (data.error) setError(data.error);
          else setExplanation(data);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load explanation.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [node?.id]);

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

            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-3 pb-4 border-b border-white/10 flex-shrink-0">
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
                className="mt-1 p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

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

                  {/* Related Concepts */}
                  {explanation.related?.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-widest text-amber-400 mb-3">
                        Related Concepts
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {explanation.related.map((rel, i) => (
                          <span
                            key={i}
                            className="px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 border border-amber-500/20 text-amber-300"
                          >
                            {rel}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-6 py-4 border-t border-white/10 flex gap-3 flex-shrink-0">
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
                    Diving deeper…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 9l-7 7-7-7" />
                    </svg>
                    Go Deeper
                  </>
                )}
              </button>
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
    </>
  );
}
