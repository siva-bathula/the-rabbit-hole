import { useState, useRef, useEffect } from 'react';

export default function FollowUpModal({ triggerNode, onSubmit, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-60"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-60 mx-auto rounded-2xl shadow-2xl"
        style={{
          maxWidth: '480px',
          background: 'linear-gradient(160deg, #13102a 0%, #0c0a1e 100%)',
          border: '1px solid rgba(168,85,247,0.3)',
          boxShadow: '0 0 60px rgba(168,85,247,0.15)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-5 pt-5 pb-4"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div>
            <h2 className="text-white font-bold text-base">Ask a follow-up</h2>
            {triggerNode && (
              <p className="text-white/40 text-xs mt-1">
                From <span className="text-purple-300/80">{triggerNode.label}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="px-5 py-5">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to explore next?"
            className="w-full px-4 py-3 rounded-xl text-white text-sm font-medium
              placeholder-white/25 outline-none transition-all"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: query ? '0 0 0 2px rgba(168,85,247,0.35)' : 'none',
            }}
            onFocus={(e) => { e.target.style.border = '1px solid rgba(168,85,247,0.5)'; }}
            onBlur={(e) => { e.target.style.border = '1px solid rgba(255,255,255,0.12)'; }}
          />

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-white/50
                hover:text-white hover:bg-white/10 transition-colors border border-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!query.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all
                bg-purple-600 hover:bg-purple-500 active:scale-95 text-white
                disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100"
            >
              Explore
            </button>
          </div>

          <p className="text-white/20 text-xs text-center mt-3">
            Current exploration will be saved and you can return to it anytime
          </p>
        </form>
      </div>
    </>
  );
}
