import { useEffect, useMemo, useRef, useState } from 'react';
import Graph from './Graph.jsx';
import {
  excerptFromExplanation,
  getCachedExplanationEntry,
} from '../lib/replayRecall.js';

const FOLLOWUP_EXCERPT_MAX = 320;

function recallForNode(node, explanationCache, explainMode) {
  if (!node) {
    return {
      title: '',
      excerpt: '',
      hint: '',
    };
  }
  if (node.followUp) {
    const q = (node.followUpQuestion || node.label || '').trim();
    const a = (node.followUpAnswer || '').trim();
    const excerpt = a
      ? excerptFromExplanation({ summary: a.slice(0, FOLLOWUP_EXCERPT_MAX * 2) })
      : '';
    return {
      title: q || 'Follow-up',
      excerpt: excerpt || 'Open this thread on the main graph to see the full reply.',
      hint: 'Follow-up thread',
    };
  }

  const entry = getCachedExplanationEntry(explanationCache, node.id, explainMode);
  const excerpt = excerptFromExplanation(entry);
  return {
    title: node.label || '',
    excerpt,
    hint: excerpt
      ? explainMode === 'normal'
        ? 'From your saved explanation'
        : `From your saved explanation (${explainMode})`
      : '',
  };
}

const ZOOM_IN = 1.32;
const ZOOM_OUT = 1 / ZOOM_IN;

/** Padding for replay open — larger = more zoomed out; balance vs label density. */
function pathPaddingInitial(pathLen) {
  return Math.min(152, 58 + pathLen * 7);
}

/** One-time zoom nudge after fit (>1 = zoom in). Lower = a bit more zoomed out overall. */
const INITIAL_ZOOM_NUDGE = 1.14;

/** First segment only at open — fewer nodes = tighter starting frame. */
const INITIAL_PATH_WINDOW = 3;

function initialPathSegment(pathIds) {
  if (!pathIds?.length) return [];
  return pathIds.slice(0, Math.min(INITIAL_PATH_WINDOW, pathIds.length));
}

/**
 * Full-screen graph replay so Slow Burn users (no inline graph) still see "their path".
 */
export default function PathReplayOverlay({
  open,
  graphData,
  expandedNodes,
  pathIds,
  stepIndex,
  onClose,
  /** Ref to Map of cache keys → { explanation, deeper } — same as NodeOverlay */
  explanationCache,
  /** Which explain depth to prefer when reading cache (eli5 | layman | normal | expert) */
  explainMode = 'normal',
  onStepIndexChange,
}) {
  const graphRef = useRef(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  const pathKey = pathIds?.length ? pathIds.join('\0') : '';

  useEffect(() => {
    if (!open) return;
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  // Single framing when replay opens: first path nodes, tight padding, then one zoom-in.
  // No debounced resize zoomToFit — that could fire right after open and look like zoom-out.
  useEffect(() => {
    if (!open || !graphData?.nodes?.length || !pathIds?.length) return;
    const segment = initialPathSegment(pathIds);
    const padding = pathPaddingInitial(segment.length);
    const t1 = window.setTimeout(() => {
      graphRef.current?.zoomToFitNodeIds?.(segment, 450, padding);
    }, 400);
    const t2 = window.setTimeout(() => {
      graphRef.current?.zoomByFactor?.(INITIAL_ZOOM_NUDGE, 220);
    }, 920);
    // After framing, break force-graph k === lastSetZoom so pan-only centers are not reset on the next tick.
    const t3 = window.setTimeout(() => {
      graphRef.current?.replayStabilizeCamera?.();
    }, 1220);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [open, pathKey, graphData?.nodes?.length, pathIds]);

  // One trigger per step: Graph.centerOnNodeId retries internally (canvas / coords / off-screen fallback).
  // Step 0 waits until after initial zoomToFit (400+450ms) + zoom nudge (920+220ms) so we do not race framing.
  useEffect(() => {
    if (!open || !pathIds || pathIds.length < 2) return;
    const currentId = pathIds[Math.min(stepIndex, pathIds.length - 1)];
    const leadMs = stepIndex === 0 ? 1260 : 180;
    const t = window.setTimeout(() => {
      graphRef.current?.centerOnNodeId?.(currentId, 450);
    }, leadMs);
    return () => clearTimeout(t);
  }, [open, stepIndex, pathKey, pathIds]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (!onStepIndexChange || !pathIds?.length) return;
      const maxIdx = pathIds.length - 1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        onStepIndexChange(Math.min(stepIndex + 1, maxIdx));
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        onStepIndexChange(Math.max(stepIndex - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onStepIndexChange, pathIds?.length, stepIndex]);

  const safeStep = pathIds?.length
    ? Math.min(Math.max(0, stepIndex), pathIds.length - 1)
    : 0;
  const currentNodeId = pathIds?.[safeStep];
  const currentNode = useMemo(
    () => graphData?.nodes?.find((n) => n.id === currentNodeId) ?? null,
    [graphData?.nodes, currentNodeId],
  );
  const recall = useMemo(
    () => recallForNode(currentNode, explanationCache, explainMode),
    [currentNode, explanationCache, explainMode],
  );

  const handleZoomIn = () => graphRef.current?.zoomByFactor?.(ZOOM_IN, 160);
  const handleZoomOut = () => graphRef.current?.zoomByFactor?.(ZOOM_OUT, 160);

  if (!open) return null;

  const explorationReplay =
    pathIds?.length >= 2 ? { pathIds, stepIndex: safeStep } : null;

  return (
    <div
      className="fixed inset-0 z-[85] flex flex-col"
      style={{ background: 'rgb(4,4,12)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Exploration path replay"
    >
      {/* Desktop: zoom — replay also auto-centers on the active path node each step */}
      <div className="absolute top-[3.25rem] left-4 z-30 hidden md:flex flex-col gap-1.5 pointer-events-auto">
        <button
          type="button"
          onClick={handleZoomIn}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white/85 transition-colors hover:bg-white/12 hover:text-white"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white/85 transition-colors hover:bg-white/12 hover:text-white"
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
      </div>

      <div className="relative z-10 flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0">
          <Graph
            ref={graphRef}
            graphData={graphData}
            selectedNode={null}
            expandedNodes={expandedNodes}
            expandingNodeId={null}
            onNodeClick={() => {}}
            explorationReplay={explorationReplay}
            widthOverride={size.w}
            heightOverride={Math.max(200, size.h - 260)}
          />
        </div>
      </div>

      <div
        className="relative z-20 flex-shrink-0 px-4 pt-3 pb-4 sm:pt-4 sm:pb-5 flex flex-col gap-3"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: '#0f0f1e',
        }}
      >
        <div className="flex items-center justify-between gap-2 text-xs text-amber-200/70 uppercase tracking-widest">
          <span>Replay with recall</span>
          {pathIds?.length >= 2 && (
            <span className="text-white/45 normal-case tracking-normal">
              Step {safeStep + 1} of {pathIds.length}
            </span>
          )}
        </div>

        <div
          className="rounded-xl px-4 py-3 text-left w-full max-w-3xl mx-auto"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <h3 className="text-white font-semibold text-sm sm:text-base leading-snug mb-2 line-clamp-2">
            {recall.title || '—'}
          </h3>
          {recall.hint && (
            <p className="text-green-400/80 text-xs mb-1.5">{recall.hint}</p>
          )}
          <p className="text-white/70 text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap">
            {recall.excerpt ||
              'No saved explanation for this stop yet. After you close replay, open this node on the graph to load it — it will appear here next time.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 sm:gap-3">
          {onStepIndexChange && pathIds?.length >= 2 && (
            <div className="flex items-center justify-center gap-2 order-2 sm:order-1">
              <button
                type="button"
                disabled={safeStep <= 0}
                onClick={() => onStepIndexChange(safeStep - 1)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white/85 border border-white/15
                  bg-white/5 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={safeStep >= pathIds.length - 1}
                onClick={() => onStepIndexChange(safeStep + 1)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white/85 border border-white/15
                  bg-white/5 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="order-1 sm:order-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{
              background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
              border: '1px solid rgba(196,148,255,0.45)',
            }}
          >
            Done
          </button>
        </div>
        <p className="text-center text-white/35 text-[11px] sm:text-xs">
          Advance with Previous / Next or arrow keys. Zoom controls are on the left (desktop).
        </p>
      </div>

      <button
        type="button"
        className="absolute top-4 right-4 z-30 p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-colors text-sm pointer-events-auto"
        onClick={onClose}
        aria-label="Close replay"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
