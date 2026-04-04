function buildTree(nodes, links, parentId, depth = 0) {
  const result = [];
  for (const link of links) {
    const s = typeof link.source === 'object' ? link.source.id : link.source;
    const t = typeof link.target === 'object' ? link.target.id : link.target;
    if (s === parentId) {
      const node = nodes.find((n) => n.id === t);
      if (node) {
        result.push({
          node,
          depth,
          children: buildTree(nodes, links, t, depth + 1),
        });
      }
    }
  }
  return result;
}

function TreeNode({ item, currentNodeId, visitedIds, onNodeClick }) {
  const { node, depth, children } = item;
  const isCurrent = node.id === currentNodeId;
  const isVisited = visitedIds.has(node.id);

  return (
    <div>
      <button
        onClick={() => onNodeClick(node.id)}
        className={`w-full flex items-center gap-2 py-1.5 pr-3 rounded-lg transition-colors text-left
          ${isCurrent
            ? 'bg-purple-500/15 text-white'
            : 'text-white/55 hover:text-white hover:bg-white/8'
          }`}
        style={{ paddingLeft: `${10 + depth * 14}px` }}
      >
        <span
          className={`flex-shrink-0 w-3 text-center text-xs font-mono ${
            isCurrent
              ? 'text-purple-400'
              : isVisited
              ? 'text-green-400/80'
              : 'text-white/30'
          }`}
        >
          {isCurrent ? '›' : isVisited ? '✓' : '·'}
        </span>
        <span
          className={`truncate text-xs leading-relaxed ${node.followUp ? 'text-fuchsia-200/85' : ''}`}
        >
          {node.followUp ? '↳ ' : ''}
          {node.label}
        </span>
      </button>

      {children.length > 0 && (
        <div
          className="border-l ml-4"
          style={{ borderColor: 'rgba(255,255,255,0.12)', paddingLeft: '4px' }}
        >
          {children.map((child) => (
            <TreeNode
              key={child.node.id}
              item={child}
              currentNodeId={currentNodeId}
              visitedIds={visitedIds}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FolderTree({ graphData, currentNodeId, visitedIds, rootLabel, onNodeClick }) {
  const { nodes, links } = graphData;
  const rootNode = nodes.find((n) => n.id === 'root');

  if (!rootNode || nodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-white/20 text-xs">Loading...</p>
      </div>
    );
  }

  const tree = buildTree(nodes, links, 'root');

  return (
    <div className="h-full overflow-y-auto py-4">
      {/* Root label */}
      <div
        className="px-4 pb-3 mb-1 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          <span className="text-white/80 font-semibold text-xs leading-tight">
            {rootLabel || rootNode.label}
          </span>
        </div>
      </div>

      {/* Tree */}
      <div className="px-2">
        {tree.map((item) => (
          <TreeNode
            key={item.node.id}
            item={item}
            currentNodeId={currentNodeId}
            visitedIds={visitedIds}
            onNodeClick={onNodeClick}
          />
        ))}
      </div>
    </div>
  );
}
