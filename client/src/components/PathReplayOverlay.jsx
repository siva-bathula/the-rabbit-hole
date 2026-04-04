import { useEffect, useRef, useState } from 'react';
import Graph from './Graph.jsx';

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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleZoomIn = () => graphRef.current?.zoomByFactor?.(ZOOM_IN, 160);
  const handleZoomOut = () => graphRef.current?.zoomByFactor?.(ZOOM_OUT, 160);

  if (!open) return null;

  const explorationReplay =
    pathIds?.length >= 2 ? { pathIds, stepIndex } : null;

  return (
    <div
      className="fixed inset-0 z-[85] flex flex-col"
      style={{ background: 'rgba(4,4,12,0.92)' }}
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
            heightOverride={Math.max(200, size.h - 140)}
          />
        </div>
      </div>

      <div
        className="relative z-20 flex-shrink-0 px-4 py-4 sm:py-5 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(180deg, transparent, rgba(15,12,35,0.98))',
        }}
      >
        <p className="text-center text-white/75 text-sm sm:text-base max-w-md leading-relaxed">
          This was how you explored this topic — step by step through your curiosity.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
            border: '1px solid rgba(196,148,255,0.45)',
          }}
        >
          Done
        </button>
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
