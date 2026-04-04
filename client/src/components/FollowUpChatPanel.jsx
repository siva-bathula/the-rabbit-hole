import { useState, useEffect, useRef, useCallback } from 'react';
import {
  getFollowUpBranchAnchor,
  getParentLabelForNode,
  getFollowUpChainLeafId,
  collectFollowUpMessages,
} from '../lib/followUpGraph.js';

export default function FollowUpChatPanel({
  triggerNode,
  graphData,
  rootLabel,
  sessionTopic,
  groundingContext,
  onClose,
  addFollowUpNode,
  onStartNewExploration,
  onPersist,
}) {
  const { nodes, links } = graphData;
  const { branchAnchorId, anchorLabel } = getFollowUpBranchAnchor(triggerNode, nodes);
  const anchorParentContext = getParentLabelForNode(branchAnchorId, nodes, links, rootLabel);

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [offTopicNote, setOffTopicNote] = useState(null);
  const bottomRef = useRef(null);
  const lastQuestionRef = useRef('');

  const thread = collectFollowUpMessages(nodes, links, branchAnchorId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread.length, sending]);

  const handleSend = useCallback(
    async (e) => {
      e?.preventDefault();
      const q = input.trim();
      if (!q || sending) return;

      setSending(true);
      setError(null);
      setOffTopicNote(null);

      const prior = collectFollowUpMessages(nodes, links, branchAnchorId);
      const apiMessages = [...prior, { role: 'user', content: q }];

      try {
        const res = await fetch('/api/followup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branchNodeLabel: anchorLabel,
            anchorParentContext,
            rootTopic: rootLabel || '',
            sessionTopic: sessionTopic || '',
            groundingContext: groundingContext || '',
            messages: apiMessages,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');

        const leafId = getFollowUpChainLeafId(nodes, links, branchAnchorId);
        addFollowUpNode(leafId, {
          fullQuestion: q,
          answer: data.reply || '',
          followUpAnchorId: branchAnchorId,
          followUpAnchorLabel: anchorLabel,
        });

        lastQuestionRef.current = q;
        if (data.offTopic) {
          setOffTopicNote(data.reply || '');
        }
        setInput('');
        onPersist?.();
      } catch (err) {
        setError(err.message || 'Something went wrong.');
      } finally {
        setSending(false);
      }
    },
    [
      input,
      sending,
      nodes,
      links,
      branchAnchorId,
      anchorLabel,
      anchorParentContext,
      rootLabel,
      sessionTopic,
      groundingContext,
      addFollowUpNode,
      onPersist,
    ],
  );

  const handleStartFresh = () => {
    const q = (lastQuestionRef.current || input).trim();
    if (q) onStartNewExploration(q);
    onClose();
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[70]"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      <div className="fixed inset-x-0 bottom-0 z-[75] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg px-3 pb-safe sm:pb-0">
        <div
          className="rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88vh] sm:max-h-[85vh]"
          style={{
            background: 'linear-gradient(160deg, #13102a 0%, #0c0a1e 100%)',
            border: '1px solid rgba(168,85,247,0.3)',
            boxShadow: '0 0 60px rgba(168,85,247,0.15)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-start justify-between px-5 pt-4 pb-3 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="min-w-0 pr-2">
              <h2 className="text-white font-bold text-base">Follow-up thread</h2>
              <p className="text-white/45 text-xs mt-1 truncate">
                Branch: <span className="text-purple-300/90">{anchorLabel}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mx-5 mt-3 mb-1 py-2 px-3 rounded-xl text-xs font-medium text-white/55 hover:text-white hover:bg-white/8 transition-colors text-left flex items-center gap-2 flex-shrink-0"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to main session
          </button>

          <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 min-h-0">
            {thread.length === 0 && (
              <p className="text-white/35 text-sm leading-relaxed">
                Ask a precise question about <span className="text-white/55">{anchorLabel}</span>. You can keep
                going — each reply stays in this thread and appears on your graph.
              </p>
            )}
            {thread.map((m, i) => (
              <div
                key={`${i}-${m.role}`}
                className={`rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-6 text-white/90'
                    : 'mr-4 text-white/80'
                }`}
                style={{
                  background:
                    m.role === 'user'
                      ? 'rgba(168,85,247,0.12)'
                      : 'rgba(255,255,255,0.06)',
                  border:
                    m.role === 'user'
                      ? '1px solid rgba(168,85,247,0.22)'
                      : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span className="text-[10px] uppercase tracking-wider text-white/35 block mb-1">
                  {m.role === 'user' ? 'You' : 'Answer'}
                </span>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-red-300 text-sm">
                {error}
              </div>
            )}
            {offTopicNote && (
              <div
                className="rounded-xl p-4 space-y-3"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}
              >
                <p className="text-amber-200/90 text-sm">
                  This may be off-topic for this branch. You can start a fresh exploration with your question as
                  a new topic.
                </p>
                <button
                  type="button"
                  onClick={handleStartFresh}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-amber-100"
                  style={{
                    background: 'rgba(251,191,36,0.15)',
                    border: '1px solid rgba(251,191,36,0.35)',
                  }}
                >
                  Start new session from this question
                </button>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={handleSend}
            className="flex-shrink-0 px-5 py-4 flex flex-col gap-2"
            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask another follow-up…"
              disabled={sending}
              className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-white/30 outline-none"
              style={{
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-35"
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                border: '1px solid rgba(196,148,255,0.4)',
              }}
            >
              {sending ? 'Thinking…' : 'Send'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
