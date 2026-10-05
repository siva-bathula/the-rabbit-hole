/** Clears cached explain output and fetches fresh content for the current node + depth mode. */
export default function RegenerateExplanationButton({ onClick, disabled = false, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Regenerate explanation"
      aria-label="Regenerate explanation"
      className={`flex items-center justify-center gap-1.5 min-w-[2rem] sm:min-w-0 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium transition-colors flex-shrink-0
        text-white/45 hover:text-white/80 hover:bg-white/10 border border-transparent hover:border-white/10
        disabled:opacity-40 disabled:pointer-events-none ${className}`}
    >
      <svg
        className={`w-4 h-4 sm:w-3.5 sm:h-3.5 ${disabled ? 'animate-spin' : ''}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      <span className="hidden sm:inline">Regenerate</span>
    </button>
  );
}
