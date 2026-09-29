import { developerMailtoHref } from './ContactDeveloperButton.jsx';

export default function FeedbackBanner({ visible, onDismiss }) {
  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 text-center"
      style={{
        background: 'linear-gradient(90deg, rgba(88,28,235,0.92) 0%, rgba(124,58,237,0.92) 50%, rgba(168,85,247,0.92) 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.15)',
        boxShadow: '0 4px 24px rgba(88,28,235,0.25)',
      }}
      role="region"
      aria-label="Feedback request"
    >
      <p className="text-white/95 text-xs sm:text-sm leading-snug min-w-0">
        <span className="font-semibold">We&apos;d love your feedback</span>
        <span className="hidden sm:inline text-white/85"> — help shape The Rabbit Hole while it&apos;s still early.</span>
      </p>
      <a
        href={developerMailtoHref()}
        className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-purple-900 transition-colors hover:bg-white/95"
        style={{ background: 'rgba(255,255,255,0.92)' }}
      >
        Send feedback
      </a>
      <button
        type="button"
        onClick={onDismiss}
        className="flex-shrink-0 p-1 rounded-md text-white/70 hover:text-white hover:bg-white/15 transition-colors"
        aria-label="Dismiss feedback banner"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
