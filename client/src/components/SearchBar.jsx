import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import RequestNotice from './RequestNotice.jsx';
import LandingGraphDemo from './LandingGraphDemo.jsx';

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

/** Typewriter placeholder — mix of questions and topics so both feel natural. */
const PLACEHOLDER_SUGGESTIONS = [
  'Why is the sky blue?',
  'How does CRISPR actually work?',
  'What caused the 2008 financial crisis?',
  'Quantum Mechanics',
  'Why do we forget dreams?',
  'Artificial Intelligence',
  'What is consciousness?',
  'Behavioral Economics',
  'How do black holes form?',
  'Stoicism',
  'Why does music give us chills?',
  'Game Theory',
];

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
  searchHistory = [],
  onOpenSharedGraph,
  requestNotice = null,
  onCancelExplore,
  onClearRequestNotice,
}) {
  const [topic, setTopic] = useState(prefillTopic);
  const [submittedTopic, setSubmittedTopic] = useState('');
  const [trendingTopics, setTrendingTopics] = useState([]);
  const [shareLinkInput, setShareLinkInput] = useState('');
  const [shareLinkError, setShareLinkError] = useState('');
  const [loadingSlow, setLoadingSlow] = useState(false);
  const inputRef = useRef(null);
  const typingRef = useRef(null);
  // Typewriter uses refs — no state updates during animation so zero extra renders
  const suggestionIndexRef = useRef(0);

  useEffect(() => {
    if (!isLoading) {
      setLoadingSlow(false);
      return;
    }
    const t = setTimeout(() => setLoadingSlow(true), 28_000);
    return () => clearTimeout(t);
  }, [isLoading]);

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
      const currentSuggestion = PLACEHOLDER_SUGGESTIONS[suggestionIndexRef.current];
      if (isDeleting) {
        const text = currentSuggestion.slice(0, charIndex);
        if (inputRef.current) inputRef.current.placeholder = text;
        charIndex--;
        if (charIndex < 0) {
          isDeleting = false;
          suggestionIndexRef.current = (suggestionIndexRef.current + 1) % PLACEHOLDER_SUGGESTIONS.length;
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

  const runSearch = useCallback(
    (query) => {
      const trimmed = String(query || '').trim();
      if (!trimmed || isLoading) return;
      setTopic(trimmed);
      setSubmittedTopic(trimmed);
      onSearch(trimmed);
    },
    [isLoading, onSearch],
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    runSearch(topic);
  };

  const handleSuggestionClick = (s) => {
    const label = String(s || '').trim();
    if (!label || isLoading) return;
    setTopic(label);
    setSubmittedTopic(label);
    onSearch({ query: label, displayLabel: label, source: 'popular_chip' });
  };

  const sharedSessions = useMemo(
    () => sortedSessions.filter((s) => s.shareId),
    [sortedSessions],
  );

  const parseShareId = (text) => {
    const raw = String(text || '').trim();
    if (/^[a-z0-9]{8}$/.test(raw)) return raw;
    try {
      const url = new URL(raw.includes('://') ? raw : `https://x/?${raw}`);
      const fromQuery = url.searchParams.get('share');
      if (fromQuery && /^[a-z0-9]{8}$/.test(fromQuery)) return fromQuery;
    } catch {
      /* not a URL */
    }
    const m = raw.match(/share=([a-z0-9]{8})/i) || raw.match(/\/([a-z0-9]{8})(?:\?|$)/);
    return m?.[1] || null;
  };

  const handleOpenShareLink = (e) => {
    e.preventDefault();
    const id = parseShareId(shareLinkInput);
    if (!id) {
      setShareLinkError('Paste a link like yoursitename.org/?share=abcd1234');
      return;
    }
    setShareLinkError('');
    setShareLinkInput('');
    onOpenSharedGraph?.(id);
  };

  const copyShareUrl = async (id) => {
    const url = `${window.location.origin}/?share=${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link:', url);
    }
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
              {loadingSlow && (
                <div className="mt-4 space-y-3">
                  <p className="text-amber-200/75 text-sm">
                    Still working… or verification may have failed silently.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onCancelExplore?.();
                      setLoadingSlow(false);
                    }}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-500 transition-colors"
                  >
                    Cancel and try again
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Default search state ── */
          <>
            <LandingGraphDemo />

            <div className="mb-2 flex justify-center">
              <span className="inline-block w-10 h-10 rounded-full bg-purple-600/20 border border-purple-500/30 text-xl flex items-center justify-center">
                🕳️
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-black text-white mb-2 tracking-tight">
              The Rabbit Hole
            </h1>
            <p className="text-white/45 text-[0.9375rem] sm:text-base mb-8 leading-snug max-w-md mx-auto text-balance">
              Not another answer box — an interactive map you click through, branch by branch.
            </p>

            {/* Search form */}
            <form onSubmit={handleSubmit} className="relative">
              <input
                ref={inputRef}
                type="text"
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  onClearRequestNotice?.();
                }}
                placeholder="Ask a question or enter a topic…"
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

            {requestNotice?.message && (
              <div className="mt-4 text-left">
                <RequestNotice
                  kind={requestNotice.kind}
                  message={requestNotice.message}
                />
              </div>
            )}

            {searchHistory.length > 0 && (
              <div className="mt-5">
                <p className="text-white/20 text-xs mb-2 uppercase tracking-widest">Recent searches</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {searchHistory.slice(0, 5).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => runSearch(q)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-all
                        bg-white/5 border border-white/10 text-white/55
                        hover:bg-purple-500/15 hover:border-purple-500/30 hover:text-white/85"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Shared maps growth loop */}
            <div className="mt-6 text-left max-w-md mx-auto">
              <p className="text-white/25 text-xs uppercase tracking-widest text-center mb-2">
                Shared explorations
              </p>
              <p className="text-white/30 text-xs text-center mb-3 leading-relaxed">
                Finish a map, tap Share in the graph — anyone with the link picks up your explored nodes.
              </p>
              {sharedSessions.length > 0 && (
                <div className="flex flex-col gap-2 mb-3">
                  {sharedSessions.slice(0, 3).map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl text-left"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onOpenSharedGraph?.(s.shareId)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <span className="text-xs font-semibold text-white/80 truncate block">
                          {sessionListTitle(s)}
                        </span>
                        <span className="text-[10px] text-white/35">Open shared map</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => copyShareUrl(s.shareId)}
                        className="shrink-0 text-[10px] font-medium px-2 py-1 rounded-lg text-purple-200
                          border border-purple-500/30 hover:bg-purple-500/10"
                      >
                        Copy link
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleOpenShareLink} className="flex gap-2">
                <input
                  type="text"
                  value={shareLinkInput}
                  onChange={(e) => {
                    setShareLinkInput(e.target.value);
                    setShareLinkError('');
                  }}
                  placeholder="Paste a friend’s ?share= link"
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl text-xs text-white placeholder-white/25 outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                />
                <button
                  type="submit"
                  className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold text-white
                    bg-purple-600 hover:bg-purple-500 transition-colors"
                >
                  Open
                </button>
              </form>
              {shareLinkError && (
                <p className="text-orange-300/80 text-[10px] mt-1.5 text-center">{shareLinkError}</p>
              )}
            </div>

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
                  {/* News explainer lane */}
                  <div>
                    <p className="text-white/20 text-xs mb-1 uppercase tracking-widest flex items-center justify-center gap-1.5">
                      <span>📰</span> Today&apos;s news — explained
                    </p>
                    <p className="text-white/25 text-[10px] mb-2 text-center max-w-xs mx-auto leading-snug">
                      Maps grounded in headlines. For evergreen topics, use Popular below.
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
                                source: 'trending_chip',
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

            {/* Mode — two named options */}
            <div className="mt-8 flex flex-col items-center gap-2">
              <div
                className="inline-flex p-1 rounded-2xl border gap-0.5"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  borderColor: 'rgba(255,255,255,0.1)',
                }}
                role="group"
                aria-label="Exploration mode"
              >
                <button
                  type="button"
                  onClick={() => onModeChange('fast')}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    mode === 'fast'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                      : 'text-white/45 hover:text-white/70'
                  }`}
                >
                  Graph view
                </button>
                <button
                  type="button"
                  onClick={() => onModeChange('slow')}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    mode === 'slow'
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                      : 'text-white/45 hover:text-white/70'
                  }`}
                >
                  Slow Burn
                </button>
              </div>
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
              : 'Click any node to explore · "Go Deeper" to expand · Scroll to zoom'}
          </p>
          <p className="text-white/12 text-xs">
            AI-generated content · may be inaccurate · not professional advice
          </p>
        </div>
      )}
    </div>
  );
}
