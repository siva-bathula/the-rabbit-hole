const DEVELOPER_EMAIL = 'rabbithole.srk@gmail.com';

export function developerMailtoHref(subject = 'The Rabbit Hole feedback') {
  return `mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export default function ContactDeveloperButton({ className = '', compact = false }) {
  return (
    <a
      href={developerMailtoHref()}
      className={`inline-flex items-center gap-1.5 rounded-xl text-sm font-medium transition-all
        text-white/50 hover:text-white/85 hover:bg-white/10 border border-white/10 hover:border-white/20
        ${compact ? 'px-2.5 py-1.5 sm:px-3 sm:py-2' : 'px-4 py-2'}
        ${className}`}
      style={{ background: 'rgba(255,255,255,0.04)' }}
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
        />
      </svg>
      {compact ? (
        <>
          <span className="hidden sm:inline">Contact</span>
          <span className="sr-only">Contact developer</span>
        </>
      ) : (
        'Contact developer'
      )}
    </a>
  );
}
