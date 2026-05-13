import { useState, useCallback } from 'react';
import { withTurnstilePayload } from '../lib/turnstile.js';

export default function CompareMatrixOverlay({
  open,
  onClose,
  subjects,
  alignment,
  sessionTopic,
  groundingContext,
}) {
  const [detail, setDetail] = useState(null);
  const [loadingDimension, setLoadingDimension] = useState(null);
  const rows = alignment?.rows || [];

  const runCompare = useCallback(
    async (row) => {
      if (!row?.dimension || !subjects?.length) return;
      setLoadingDimension(row.dimension);
      setDetail(null);
      try {
        const body = await withTurnstilePayload({
          subjects,
          dimensionLabel: row.dimension,
          labelsPerSubject: row.picks || [],
          sessionTopic: sessionTopic || '',
          groundingContext: groundingContext || '',
        });
        const res = await fetch('/api/compare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Request failed');
        setDetail({ dimension: row.dimension, ...data });
      } catch (e) {
        setDetail({
          dimension: row.dimension,
          error: e.message || 'Failed to compare',
        });
      } finally {
        setLoadingDimension(null);
      }
    },
    [subjects, sessionTopic, groundingContext],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-matrix-title"
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col rounded-2xl shadow-2xl"
        style={{ background: '#0f1020', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 id="compare-matrix-title" className="text-lg font-semibold text-white">
            Comparison matrix
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white px-2 py-1 rounded-lg text-sm"
          >
            Close
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          <p className="text-white/40 text-xs leading-relaxed">
            Rows come from aligned subgraph topics. Tap a row for a side-by-side summary.
          </p>
          {!rows.length ? (
            <p className="text-white/45 text-sm">
              No aligned dimensions loaded — try another comparison search or wait for generation to finish.
            </p>
          ) : (
            rows.map((row, idx) => (
              <button
                key={`${row.dimension}-${idx}`}
                type="button"
                onClick={() => runCompare(row)}
                disabled={loadingDimension !== null}
                className="w-full text-left rounded-xl px-4 py-3 transition-colors border border-white/10 hover:border-cyan-500/40 hover:bg-white/5 disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white font-medium text-sm">{row.dimension}</span>
                  {loadingDimension === row.dimension && (
                    <span className="w-4 h-4 rounded-full border-2 border-cyan-400/40 border-t-cyan-300 animate-spin flex-shrink-0" />
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/50">
                  {(row.picks || []).map((p, i) => (
                    <span key={`${idx}-${i}`}>
                      {subjects[i]}:{' '}
                      <span className="text-white/70">{p}</span>
                    </span>
                  ))}
                </div>
              </button>
            ))
          )}
          {detail && (
            <div className="mt-4 rounded-xl p-4 border border-purple-500/25 bg-purple-500/5 space-y-4">
              <h3 className="text-white font-semibold text-sm">{detail.dimension}</h3>
              {detail.error ? (
                <p className="text-red-300 text-sm">{detail.error}</p>
              ) : (
                <>
                  {detail.summary && (
                    <p className="text-white/75 text-sm leading-relaxed">{detail.summary}</p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(detail.columns || []).map((col) => (
                      <div
                        key={col.subject}
                        className="rounded-lg p-3 bg-black/30 border border-white/8"
                      >
                        <div className="text-cyan-300 text-xs font-semibold mb-2">{col.subject}</div>
                        <ul className="space-y-1.5 text-sm text-white/70">
                          {(col.bullets || []).map((b, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-white/30 flex-shrink-0">•</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
