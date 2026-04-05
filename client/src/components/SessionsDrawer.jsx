import { useMemo } from 'react';

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function sessionPrimaryLabel(s) {
  return (s.displayName && String(s.displayName).trim()) || s.topic;
}

export default function SessionsDrawer({
  sessions,
  activeSessionId,
  isOpen,
  onClose,
  onSwitch,
  onDelete,
  onRenameSession,
  onClearAll,
}) {
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => (b.lastUsedAt ?? b.createdAt ?? 0) - (a.lastUsedAt ?? a.createdAt ?? 0)),
    [sessions],
  );

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.55)' }}
        onClick={onClose}
      />

      {/* Drawer — slides in from the right */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex flex-col"
        style={{
          width: 'min(360px, 100vw)',
          background: 'linear-gradient(160deg, #0f0f1e 0%, #0a0a18 100%)',
          borderLeft: '1px solid rgba(168,85,247,0.2)',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-white font-bold text-base">Your Explorations</h2>
            <p className="text-white/35 text-xs mt-0.5">
              {sessions.length} saved — rename or delete to organize
            </p>
            {sessions.length > 0 && onClearAll && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('Remove all saved explorations and go to the home screen? This cannot be undone.')) {
                    onClearAll();
                  }
                }}
                className="mt-2 text-xs font-medium text-red-400/80 hover:text-red-300 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Session cards */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
              <span className="text-4xl opacity-30">🕳️</span>
              <p className="text-white/30 text-sm">No saved explorations yet.</p>
              <p className="text-white/20 text-xs">
                Use "Open in new exploration" on any node, or click "New Search", to save your current hole.
              </p>
            </div>
          ) : (
            sortedSessions.map((s) => {
              const isActive = s.id === activeSessionId;
              const primary = sessionPrimaryLabel(s);
              const renamed = Boolean(s.displayName && String(s.displayName).trim());
              return (
                <div
                  key={s.id}
                  className="rounded-2xl p-4 cursor-pointer transition-all group"
                  style={{
                    background: isActive
                      ? 'rgba(168,85,247,0.12)'
                      : 'rgba(255,255,255,0.04)',
                    border: isActive
                      ? '1px solid rgba(168,85,247,0.45)'
                      : '1px solid rgba(255,255,255,0.08)',
                  }}
                  onClick={() => onSwitch(s.id)}
                >
                  {/* Top row: topic + actions */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isActive && (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{
                              background: 'rgba(168,85,247,0.25)',
                              color: 'rgba(216,180,254,1)',
                            }}
                          >
                            Active
                          </span>
                        )}
                        <span
                          className={`text-xs flex-shrink-0 ${
                            s.mode === 'slow' ? 'text-purple-400/70' : 'text-cyan-400/70'
                          }`}
                        >
                          {s.mode === 'slow' ? 'Slow Burn' : 'Fast'}
                        </span>
                      </div>
                      <p className="text-white font-semibold text-sm leading-tight truncate">
                        {primary}
                      </p>
                      {renamed && (
                        <p className="text-white/35 text-xs mt-0.5 truncate">Topic: {s.topic}</p>
                      )}
                      {!renamed && s.rootLabel && s.rootLabel !== s.topic && (
                        <p className="text-white/40 text-xs mt-0.5 truncate">{s.rootLabel}</p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-0.5">
                      {onRenameSession && (
                        <button
                          type="button"
                          title="Rename"
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = window.prompt('Name this exploration', primary);
                            if (next === null) return;
                            onRenameSession(s.id, next);
                          }}
                          className="p-1 rounded-lg text-white/25 hover:text-purple-300 hover:bg-white/10 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                      <button
                        type="button"
                        title="Remove"
                        onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                        className="p-1 rounded-lg text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Preview node chips */}
                  {(s.previewNodes?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {s.previewNodes.map((label) => (
                        <span
                          key={label}
                          className="px-2 py-0.5 rounded-full text-xs text-white/50"
                          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Footer: node count + time */}
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-white/30 text-xs">
                      {s.nodeCount} node{s.nodeCount !== 1 ? 's' : ''}
                    </span>
                    <span className="text-white/25 text-xs">{timeAgo(s.createdAt)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
