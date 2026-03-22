import { useState, useRef, useEffect } from 'react';

const SUGGESTIONS = [
  'Macroeconomics',
  'Quantum Mechanics',
  'The Roman Empire',
  'Machine Learning',
  'Evolutionary Biology',
  'Philosophy of Mind',
  'Climate Change',
  'Cryptography',
  'Jazz Music',
  'The Renaissance',
];

export default function SearchBar({ onSearch, isLoading }) {
  const [topic, setTopic] = useState('');
  const [placeholder, setPlaceholder] = useState('');
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const inputRef = useRef(null);
  const typingRef = useRef(null);

  // Cycle through placeholder suggestions with typewriter effect
  useEffect(() => {
    let charIndex = 0;
    let currentSuggestion = SUGGESTIONS[suggestionIndex];
    let isDeleting = false;
    let pauseCount = 0;

    const type = () => {
      if (isDeleting) {
        setPlaceholder(currentSuggestion.slice(0, charIndex));
        charIndex--;
        if (charIndex < 0) {
          isDeleting = false;
          const nextIndex = (suggestionIndex + 1) % SUGGESTIONS.length;
          setSuggestionIndex(nextIndex);
          currentSuggestion = SUGGESTIONS[nextIndex];
          charIndex = 0;
          typingRef.current = setTimeout(type, 400);
          return;
        }
        typingRef.current = setTimeout(type, 50);
      } else {
        setPlaceholder(currentSuggestion.slice(0, charIndex));
        charIndex++;
        if (charIndex > currentSuggestion.length) {
          pauseCount++;
          if (pauseCount > 20) {
            isDeleting = true;
            pauseCount = 0;
          }
          typingRef.current = setTimeout(type, 80);
          return;
        }
        typingRef.current = setTimeout(type, 80);
      }
    };

    typingRef.current = setTimeout(type, 600);
    return () => clearTimeout(typingRef.current);
  }, [suggestionIndex]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed || isLoading) return;
    onSearch(trimmed);
  };

  const handleSuggestionClick = (s) => {
    setTopic(s);
    inputRef.current?.focus();
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: '#07070f' }}
    >
      {/* Background radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(88,28,235,0.12) 0%, transparent 70%)',
        }}
      />
      {/* Subtle grid lines */}
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 w-full max-w-xl text-center">
        {/* Logo / Title */}
        <div className="mb-3 flex justify-center">
          <span className="inline-block w-12 h-12 rounded-full bg-purple-600/20 border border-purple-500/30 text-2xl flex items-center justify-center">
            🕳️
          </span>
        </div>

        <h1 className="text-5xl font-black text-white mb-3 tracking-tight">
          The Rabbit Hole
        </h1>
        <p className="text-white/40 text-base mb-10 leading-relaxed">
          Enter any topic and explore the infinite web of ideas beneath it.
        </p>

        {/* Search form */}
        <form onSubmit={handleSubmit} className="relative">
          <input
            ref={inputRef}
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={placeholder || 'Try anything…'}
            disabled={isLoading}
            autoFocus
            className="w-full px-5 py-4 pr-14 rounded-2xl text-white text-base font-medium
              placeholder-white/25 outline-none transition-all
              disabled:opacity-50"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: topic
                ? '0 0 0 2px rgba(168,85,247,0.4), 0 20px 40px rgba(0,0,0,0.4)'
                : '0 20px 40px rgba(0,0,0,0.3)',
            }}
            onFocus={(e) => {
              e.target.style.border = '1px solid rgba(168,85,247,0.5)';
            }}
            onBlur={(e) => {
              e.target.style.border = '1px solid rgba(255,255,255,0.12)';
            }}
          />

          <button
            type="submit"
            disabled={!topic.trim() || isLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl
              flex items-center justify-center transition-all
              bg-purple-600 hover:bg-purple-500 active:scale-95
              disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100"
          >
            {isLoading ? (
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            )}
          </button>
        </form>

        {isLoading && (
          <p className="mt-4 text-white/30 text-sm animate-pulse">
            Mapping the knowledge graph…
          </p>
        )}

        {/* Quick suggestions */}
        {!isLoading && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.slice(0, 6).map((s) => (
              <button
                key={s}
                onClick={() => handleSuggestionClick(s)}
                className="px-3 py-1.5 rounded-full text-xs font-medium
                  bg-white/5 border border-white/10 text-white/50
                  hover:bg-purple-500/15 hover:border-purple-500/30 hover:text-white/80
                  transition-all"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom hint */}
      <p className="absolute bottom-6 text-white/15 text-xs">
        Click any node to explore · "Go Deeper" to expand · Scroll to zoom
      </p>
    </div>
  );
}
