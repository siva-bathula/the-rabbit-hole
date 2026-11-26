export default function ActionStatusOverlay({ message, fading, bannerOffset = false }) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 z-[45] -translate-x-1/2 pointer-events-none transition-opacity ease-out duration-[1800ms]
        max-sm:top-[calc(env(safe-area-inset-top,0px)+5.5rem)]
        sm:top-[4.75rem]
        ${bannerOffset ? 'max-sm:top-[calc(env(safe-area-inset-top,0px)+8rem)] sm:top-[6.25rem]' : ''}
        ${fading ? 'opacity-0' : 'opacity-100'}`}
    >
      <p
        className="px-4 py-2.5 rounded-xl text-sm font-medium text-white/92 text-center shadow-lg leading-snug"
        style={{
          background: 'rgba(10,10,22,0.9)',
          border: '1px solid rgba(255,255,255,0.14)',
          backdropFilter: 'blur(14px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
          maxWidth: 'min(92vw, 22rem)',
        }}
      >
        {message}
      </p>
    </div>
  );
}