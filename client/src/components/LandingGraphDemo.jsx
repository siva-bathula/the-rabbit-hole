import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

/** Fixed mini-graph — loops a highlight along a path (~10s) to show the product above the fold. */
const DEMO_GRAPH = {
  nodes: [
    { id: 'root', label: 'Why is the sky blue?', group: 'core', fx: 0, fy: 0 },
    { id: 'n1', label: 'Sunlight', group: 'mechanism', fx: -72, fy: -52 },
    { id: 'n2', label: 'Atmosphere', group: 'theory', fx: 78, fy: -44 },
    { id: 'n3', label: 'Rayleigh scatter', group: 'theory', fx: -58, fy: 58 },
    { id: 'n4', label: 'Blue vs red', group: 'example', fx: 62, fy: 62 },
    { id: 'n5', label: 'Sunsets', group: 'related', fx: 0, fy: -92 },
  ],
  links: [
    { source: 'root', target: 'n1' },
    { source: 'root', target: 'n2' },
    { source: 'root', target: 'n3' },
    { source: 'root', target: 'n4' },
    { source: 'root', target: 'n5' },
    { source: 'n2', target: 'n3' },
  ],
};

const LOOP_PATH = ['root', 'n1', 'n3', 'n4', 'n2', 'n5'];
const STEP_MS = 1650;

const GROUP_COLORS = {
  core: '#F59E0B',
  theory: '#A855F7',
  mechanism: '#8B5CF6',
  example: '#10B981',
  related: '#06B6D4',
};

export default function LandingGraphDemo() {
  const fgRef = useRef(null);
  const [step, setStep] = useState(0);
  const activeId = LOOP_PATH[step % LOOP_PATH.length];

  const graphData = useMemo(
    () => ({
      nodes: DEMO_GRAPH.nodes.map((n) => ({ ...n })),
      links: DEMO_GRAPH.links.map((l) => ({ ...l })),
    }),
    [],
  );

  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), STEP_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      fgRef.current?.zoomToFit?.(400, 28);
    }, 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="w-full max-w-md mx-auto mb-8 rounded-2xl overflow-hidden relative"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(168,85,247,0.22)',
        boxShadow: '0 24px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <div
        className="pointer-events-none absolute top-2.5 left-3 right-3 flex items-center justify-between z-10"
        aria-hidden
      >
        <span className="text-[10px] uppercase tracking-widest text-white/35 font-semibold">
          Live knowledge map
        </span>
        <span className="text-[10px] text-purple-300/70 font-medium">Click nodes to explore</span>
      </div>
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={Math.min(400, typeof window !== 'undefined' ? window.innerWidth - 48 : 360)}
        height={200}
        cooldownTicks={0}
        enableNodeDrag={false}
        enablePanInteraction={false}
        enableZoomInteraction={false}
        minZoom={0.85}
        maxZoom={0.85}
        linkColor={() => 'rgba(148,163,184,0.28)'}
        linkWidth={1.2}
        nodeRelSize={5}
        nodeVal={(n) => (n.id === 'root' ? 12 : 7)}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const isRoot = node.id === 'root';
          const isActive = node.id === activeId;
          const r = isRoot ? 9 : 6;
          const base = isRoot ? GROUP_COLORS.core : GROUP_COLORS[node.group] || '#3B82F6';

          if (isActive) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 7 / globalScale, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(168,85,247,0.22)';
            ctx.fill();
          }

          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = isActive ? '#E9D5FF' : base;
          ctx.fill();
          if (isActive) {
            ctx.strokeStyle = 'rgba(196,181,253,0.9)';
            ctx.lineWidth = 2 / globalScale;
            ctx.stroke();
          }

          const label = node.label || '';
          const fontSize = Math.max(10 / globalScale, 3.2);
          ctx.font = `${isActive ? 600 : 500} ${fontSize}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = isActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)';
          ctx.fillText(label, node.x, node.y + r + 3 / globalScale);
        }}
        nodePointerAreaPaint={(node, color, ctx) => {
          const r = node.id === 'root' ? 14 : 10;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fill();
        }}
      />
    </div>
  );
}
