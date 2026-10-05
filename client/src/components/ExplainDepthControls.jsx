import RegenerateExplanationButton from './RegenerateExplanationButton.jsx';

const MODES = [
  { id: 'eli5', label: 'Simple' },
  { id: 'layman', label: 'Layman' },
  { id: 'normal', label: 'Normal' },
  { id: 'expert', label: 'Expert' },
  { id: 'verbose', label: 'Verbose' },
];

/**
 * Depth mode picker + regenerate. Mobile: 3-column grid + regen in header row.
 * Desktop: single compact row.
 */
export default function ExplainDepthControls({
  explainMode,
  onExplainModeChange,
  showRegenerate = false,
  onRegenerate,
  isLoading = false,
  headerSpinner = false,
  className = 'mt-3',
}) {
  return (
    <div className={`space-y-2 min-w-0 overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-white/30 text-xs font-medium tracking-wide">Depth</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {headerSpinner && (
            <div
              className="w-3.5 h-3.5 rounded-full border-2 border-purple-400/30 border-t-purple-400 animate-spin"
              aria-hidden
            />
          )}
          {showRegenerate && (
            <RegenerateExplanationButton onClick={onRegenerate} disabled={isLoading} />
          )}
        </div>
      </div>

      <div
        className="grid grid-cols-3 gap-1 p-1 rounded-xl w-full sm:inline-flex sm:w-auto sm:gap-0.5 sm:rounded-lg"
        style={{ background: 'rgba(255,255,255,0.07)' }}
        role="group"
        aria-label="Explanation depth"
      >
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onExplainModeChange?.(id)}
            className={`px-2 py-1.5 sm:px-3 sm:py-1 rounded-lg sm:rounded-md text-xs font-medium text-center transition-all ${
              explainMode === id
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-white/40 hover:text-white/70 active:text-white/90'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
