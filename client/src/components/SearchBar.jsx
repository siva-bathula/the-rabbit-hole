import { useState, useRef, useEffect, useMemo } from 'react';

export function getRandomN(arr, n) {
  // Handle cases where n is greater than the array length
  const size = n > arr.length ? arr.length : n;
  
  // Create a copy to avoid mutating the original array
  const shuffled = [...arr];
  
  // Fisher-Yates Shuffle (partial)
  for (let i = shuffled.length - 1; i > shuffled.length - 1 - size; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled.slice(-size);
}

export const STATIC_TOPICS = [
  'Macroeconomics',
  'Quantum Mechanics',
  'Artificial Intelligence',
  'Machine Learning',
  'Evolutionary Biology',
  'Philosophy of Mind',
  'Climate Change',
  'Cryptography',
  'Jazz Music',
  'Behavioral Economics',
  'Black Holes',
  'The Human Genome',
  'Nuclear Fusion',
  'Ancient Indian Philosophy',
  'Game Theory',
  'The Internet Protocol',
  'Renaissance Art',
  'Stoicism',
  'Neuroscience of Memory',
  'The Stock Market',
  'Blockchain Technology',
  'The French Revolution',
  'Linguistics',
  'Vedic Mathematics',
  'The Solar System',
  'Geopolitics',
  'Classical Mythology',
  'Supply Chain Economics'
];

function sessionListTitle(s) {
  return (s.displayName && String(s.displayName).trim()) || s.topic;
}

export default function SearchBar({
  onSearch,
  isLoading,
  mode,
  onModeChange,
  sessions = [],
  activeSessionId,
  onSwitchSession,
  onOpenSessions,
  prefillTopic = '',
  staticPicks = [],
}) {
  const [topic, setTopic] = useState(prefillTopic);
  const [submittedTopic, setSubmittedTopic] = useState('');
  const [trendingTopics, setTrendingTopics] = useState([]);
  const inputRef = useRef(null);
  const typingRef = useRef(null);
  // Typewriter uses refs — no state updates during animation so zero extra renders
  const suggestionIndexRef = useRef(0);

  // When a fork pre-fills the topic, sync it into state
  useEffect(() => {
    if (prefillTopic) {
      setTopic(prefillTopic);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [prefillTopic]);

  // Fetch server-warmed trending topics on mount; retry up to 3 times if cache is still warming
  useEffect(() => {
    let attempts = 0;
    let timerId;

    const load = () => {
      fetch('/api/trending', { cache: 'no-store' })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data.topics) && data.topics.length > 0) {
            setTrendingTopics(data.topics);
          } else if (attempts < 3) {
            // Cache still warming — retry with back-off (5s, 10s, 20s)
            attempts += 1;
            if (timerId) clearTimeout(timerId);
            timerId = setTimeout(load, 5000 * attempts);
          }
        })
        .catch(() => {
          if (attempts < 3) {
            attempts += 1;
            if (timerId) clearTimeout(timerId);
            timerId = setTimeout(load, 5000 * attempts);
          }
        });
    };

    load();
    return () => clearTimeout(timerId);
  }, []);

  // Cycle through placeholder suggestions with typewriter effect.
  // Writes directly to the DOM via inputRef — no React state updates, zero re-renders.
  useEffect(() => {
    let charIndex = 0;
    let isDeleting = false;
    let pauseCount = 0;

    const type = () => {
      const currentSuggestion = STATIC_TOPICS[suggestionIndexRef.current];
      if (isDeleting) {
        const text = currentSuggestion.slice(0, charIndex);
        if (inputRef.current) inputRef.current.placeholder = text;
        charIndex--;
        if (charIndex < 0) {
          isDeleting = false;
          suggestionIndexRef.current = (suggestionIndexRef.current + 1) % STATIC_TOPICS.length;
          charIndex = 0;
          typingRef.current = setTimeout(type, 400);
          return;
        }
        typingRef.current = setTimeout(type, 50);
      } else {
        const text = currentSuggestion.slice(0, charIndex);
        if (inputRef.current) inputRef.current.placeholder = text;
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Memoised sort — only recomputes when `sessions` reference changes, not on every render
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => (b.lastUsedAt ?? b.createdAt ?? 0) - (a.lastUsedAt ?? a.createdAt ?? 0)),
    [sessions],
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = topic.trim();
    if (!trimmed || isLoading) return;
    setSubmittedTopic(trimmed);
    onSearch(trimmed);
  };

  const handleSuggestionClick = (s) => {
    setTopic(s);
    inputRef.current?.focus();
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 relative overflow-y-auto"
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

      <div className="relative z-10 w-full max-w-xl text-center my-auto py-16">
        {isLoading ? (
          /* ── Loading state ── */
          <div className="flex flex-col items-center gap-6 py-8">
            {/* Spinning ring */}
            <div className="relative flex items-center justify-center">
              <div
                className="w-16 h-16 rounded-full border-4 border-purple-500/20 border-t-purple-400 animate-spin"
              />
              <span className="absolute text-2xl">🕳️</span>
            </div>

            <div className="space-y-2">
              <p className="text-white font-bold text-xl tracking-tight">
                Going down the rabbit hole…
              </p>
              {submittedTopic && (
                <p
                  className="text-sm font-medium px-4 py-1.5 rounded-full mx-auto inline-block"
                  style={{
                    background: 'rgba(168,85,247,0.15)',
                    border: '1px solid rgba(168,85,247,0.3)',
                    color: 'rgba(216,180,254,0.9)',
                  }}
                >
                  {submittedTopic}
                </p>
              )}
              <p className="text-white/35 text-sm animate-pulse mt-2">
                Mapping the knowledge graph…
              </p>
            </div>
          </div>
        ) : (
          /* ── Default search state ── */
          <>
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
                placeholder="Try anything…"
                autoFocus
                className="w-full px-5 py-4 pr-14 rounded-2xl text-white text-base font-medium
                  placeholder-white/25 outline-none transition-all"
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
                disabled={!topic.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-xl
                  flex items-center justify-center transition-all
                  bg-purple-600 hover:bg-purple-500 active:scale-95
                  disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100"
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </form>

            {/* Recent sessions (2) + Sessions drawer */}
            {sortedSessions.length > 0 && (
              <div className="mt-5">
                <p className="text-white/20 text-xs mb-2 uppercase tracking-widest flex items-center justify-center gap-1.5">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  Continue exploring
                </p>
                {sortedSessions.length > 2 && (
                  <p className="text-white/25 text-xs text-center mb-2">
                    Showing 2 most recent — open Sessions for all {sortedSessions.length}.
                  </p>
                )}
                <div className="flex gap-2 overflow-x-auto pb-1 justify-center flex-wrap items-stretch">
                  {sortedSessions.slice(0, 2).map((s) => {
                    const isActive = s.id === activeSessionId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onSwitchSession?.(s.id)}
                        className="flex-shrink-0 flex flex-col items-start gap-1 px-3 py-2 rounded-xl text-left transition-all"
                        style={{
                          background: isActive ? 'rgba(168,85,247,0.15)' : 'rgba(255,255,255,0.05)',
                          border: isActive
                            ? '1px solid rgba(168,85,247,0.4)'
                            : '1px solid rgba(255,255,255,0.1)',
                          maxWidth: '160px',
                        }}
                      >
                        <span className="text-xs font-semibold text-white/80 truncate w-full">
                          {sessionListTitle(s)}
                        </span>
                        <span className="text-white/30 text-xs">
                          {s.nodeCount} nodes
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => onOpenSessions?.()}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all border
                      border-purple-500/30 text-purple-300 hover:bg-purple-500/10 self-stretch"
                    style={{ background: 'rgba(168,85,247,0.08)' }}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    Sessions
                    <span
                      className="flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-xs font-bold text-white"
                      style={{ background: 'rgba(168,85,247,0.6)' }}
                    >
                      {sortedSessions.length}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Topic suggestions — trending + static */}
            <div className="mt-5 space-y-3">
              {trendingTopics.length > 0 ? (
                <>
                  {/* Trending row */}
                  <div>
                    <p className="text-white/20 text-xs mb-2 uppercase tracking-widest flex items-center justify-center gap-1.5">
                      <span>🔥</span> Trending
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {trendingTopics.map((t) => {
                        // Support both old string format and new {label, headline, grounding?} format
                        const label = typeof t === 'string' ? t : t.label;
                        const headline = typeof t === 'string' ? t : (t.headline || t.label);
                        const groundingContext = typeof t === 'string' ? '' : (t.grounding || '');
                        const articleUrl =
                          typeof t === 'string' ? '' : String(t.link || '').trim();
                        return (
                          <button
                            key={`${label}::${headline.slice(0, 48)}`}
                            onClick={() =>
                              onSearch({
                                query: `${label} — ${headline}`,
                                displayLabel: label,
                                groundingContext,
                                articleUrl,
                                fromTrending: true,
                              })
                            }
                            title={headline}
                            className="px-3 py-1.5 rounded-full text-xs font-medium transition-all
                              text-orange-200/80 hover:text-white
                              hover:bg-orange-500/20 hover:border-orange-400/40"
                            style={{
                              background: 'rgba(251,146,60,0.10)',
                              border: '1px solid rgba(251,146,60,0.25)',
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Static picks row */}
                  <div>
                    <p className="text-white/20 text-xs mb-2 uppercase tracking-widest">Popular</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {staticPicks.map((s) => (
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
                  </div>
                </>
              ) : (
                /* Fallback: show static picks while trending cache is warming */
                <div>
                  <p className="text-white/20 text-xs mb-2 uppercase tracking-widest">Explore</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {staticPicks.map((s) => (
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
                </div>
              )}
            </div>

            {/* Mode toggle */}
            <div className="mt-8 flex flex-col items-center gap-2">
              <button
                onClick={() => onModeChange(mode === 'fast' ? 'slow' : 'fast')}
                className={`flex items-center gap-3 px-5 py-2.5 rounded-2xl text-sm font-medium transition-all border
                  ${mode === 'slow'
                    ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
                    : 'bg-white/4 border-white/8 text-white/40 hover:text-white/60 hover:bg-white/8'
                  }`}
              >
                {/* Toggle pill */}
                <span
                  className={`relative inline-flex w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                    mode === 'slow' ? 'bg-purple-500' : 'bg-white/15'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                      mode === 'slow' ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </span>
                <span>Slow Burn mode</span>
              </button>
              <p className="text-white/20 text-xs">
                {mode === 'slow'
                  ? 'One concept at a time, guided reading'
                  : 'Full graph — explore freely'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Bottom hint + disclaimer */}
      {!isLoading && (
        <div className="absolute bottom-4 flex flex-col items-center gap-1">
          <p className="text-white/15 text-xs">
            {mode === 'slow'
              ? 'Guided reading · one concept at a time · go as deep as you want'
              : 'Click any node to explore · "Branch Out" to expand · Scroll to zoom'}
          </p>
          <p className="text-white/12 text-xs">
            AI-generated content · may be inaccurate · not professional advice
          </p>
        </div>
      )}
    </div>
  );
}
