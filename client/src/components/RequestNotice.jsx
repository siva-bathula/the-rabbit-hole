/**
 * Inline notice for API failures — amber for content-policy refusals, red for other errors.
 */
export default function RequestNotice({
  kind = 'error',
  message,
  onRetry,
  retryLabel = 'Try again',
  className = '',
}) {
  if (!message) return null;

  const isSafety = kind === 'content_safety';

  return (
    <div
      className={`rounded-xl p-4 text-sm ${className}`}
      style={
        isSafety
          ? {
              background: 'rgba(251,191,36,0.08)',
              border: '1px solid rgba(251,191,36,0.28)',
              color: 'rgba(253,230,138,0.95)',
            }
          : {
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.22)',
              color: 'rgba(252,165,165,0.95)',
            }
      }
      role="alert"
    >
      <div className="flex gap-3">
        <svg
          className="w-5 h-5 flex-shrink-0 mt-0.5 opacity-90"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          {isSafety ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          )}
        </svg>
        <div className="min-w-0 flex-1">
          <p className="leading-relaxed">{message}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                hover:bg-white/10 border border-white/10"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {retryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
