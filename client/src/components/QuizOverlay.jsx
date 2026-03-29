import { useState, useEffect, useCallback } from 'react';

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function quizKey(rootTopic, nodeId) {
  return `rabbit-hole-quiz-${rootTopic || 'default'}::${nodeId}`;
}

function loadQuizState(rootTopic, nodeId) {
  try {
    return JSON.parse(localStorage.getItem(quizKey(rootTopic, nodeId)) || 'null');
  } catch {
    return null;
  }
}

function saveQuizState(rootTopic, nodeId, state) {
  try {
    localStorage.setItem(quizKey(rootTopic, nodeId), JSON.stringify(state));
  } catch {}
}

function clearQuizState(rootTopic, nodeId) {
  localStorage.removeItem(quizKey(rootTopic, nodeId));
}

function scoreLabel(score, total) {
  const pct = score / total;
  if (pct === 1) return { text: 'Perfect score! Outstanding! 🏆', color: 'text-yellow-300' };
  if (pct >= 0.8) return { text: 'Excellent work! 🎉', color: 'text-green-300' };
  if (pct >= 0.6) return { text: 'Good effort! Keep going 👍', color: 'text-blue-300' };
  if (pct >= 0.4) return { text: 'Not bad — revisit the topic and try again', color: 'text-orange-300' };
  return { text: "Keep studying — you'll get there!", color: 'text-red-300' };
}

// ─── Single Question Screen ───────────────────────────────────────────────────

function QuestionScreen({ question, index, total, onAnswer }) {
  const [selected, setSelected] = useState(null);
  const revealed = selected !== null;

  const optionStyle = (i) => {
    if (!revealed) {
      return selected === i
        ? 'border-purple-500 bg-purple-500/20 text-white'
        : 'border-white/10 bg-white/4 text-white/75 hover:border-white/30 hover:bg-white/8';
    }
    if (i === question.correct) return 'border-green-500 bg-green-500/20 text-green-200';
    if (i === selected) return 'border-red-500 bg-red-500/20 text-red-200';
    return 'border-white/6 bg-white/2 text-white/30';
  };

  return (
    <div className="px-6 pt-4 pb-6">
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-purple-500 transition-all"
            style={{ width: `${(index / total) * 100}%` }}
          />
        </div>
        <span className="text-white/40 text-xs flex-shrink-0">{index + 1} / {total}</span>
      </div>

      {/* Question */}
      <p className="text-white font-semibold text-base leading-snug mb-5">
        {question.question}
      </p>

      {/* Options */}
      <div className="space-y-2.5">
        {question.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => { if (!revealed) setSelected(i); }}
            disabled={revealed}
            className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border text-sm transition-all ${optionStyle(i)}`}
          >
            <span className="flex-shrink-0 w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold mt-0.5">
              {OPTION_LABELS[i]}
            </span>
            <span className="leading-snug flex-1">{opt}</span>
            {revealed && i === question.correct && (
              <span className="ml-auto text-green-400 flex-shrink-0">✓</span>
            )}
            {revealed && i === selected && i !== question.correct && (
              <span className="ml-auto text-red-400 flex-shrink-0">✗</span>
            )}
          </button>
        ))}
      </div>

      {/* Explanation + Next — revealed after selecting */}
      {revealed && (
        <div className="mt-5 space-y-3">
          <div
            className="rounded-xl px-4 py-3 text-sm leading-relaxed"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <span className="text-white/40 text-xs font-semibold uppercase tracking-widest block mb-1">
              Explanation
            </span>
            <p className="text-white/70">{question.explanation}</p>
          </div>
          <button
            onClick={() => onAnswer(selected)}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all active:scale-95 bg-purple-600 hover:bg-purple-500"
          >
            {index + 1 === total ? 'See Results' : 'Next Question →'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Results Screen ───────────────────────────────────────────────────────────

function ResultsScreen({ score, total, onRecap, onRetake, onClose }) {
  const { text, color } = scoreLabel(score, total);
  const pct = Math.round((score / total) * 100);

  return (
    <div className="px-6 py-8 flex flex-col items-center gap-6 text-center">
      {/* Conic score ring */}
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: `conic-gradient(#a855f7 0%, #a855f7 ${pct}%, rgba(255,255,255,0.08) ${pct}%)`,
        }}
      >
        <div
          className="w-20 h-20 rounded-full flex flex-col items-center justify-center"
          style={{ background: '#0f0f1e' }}
        >
          <span className="text-white font-black text-xl leading-none">{score}</span>
          <span className="text-white/40 text-xs">/{total}</span>
        </div>
      </div>

      <div className="space-y-1">
        <p className={`font-bold text-lg ${color}`}>{text}</p>
        <p className="text-white/40 text-sm">{pct}% correct</p>
      </div>

      <div className="flex flex-col gap-3 w-full">
        <button
          onClick={onRecap}
          className="w-full py-3 rounded-xl font-semibold text-sm border transition-all text-purple-300 hover:bg-purple-500/15 active:scale-95"
          style={{ border: '1px solid rgba(168,85,247,0.35)' }}
        >
          Review Answers
        </button>
        <button
          onClick={onRetake}
          className="w-full py-3 rounded-xl font-semibold text-sm border transition-all text-amber-300 hover:bg-amber-500/15 active:scale-95"
          style={{ border: '1px solid rgba(251,191,36,0.35)' }}
        >
          Retake Quiz
        </button>
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl font-semibold text-sm text-white/50 hover:text-white hover:bg-white/10 transition-all"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Recap Screen ─────────────────────────────────────────────────────────────

function RecapScreen({ questions, userAnswers, onClose }) {
  return (
    <div className="px-6 pb-6 pt-2">
      <p className="text-white/40 text-xs uppercase tracking-widest mb-4">Review</p>

      <div className="space-y-5">
        {questions.map((q, qi) => {
          const userAns = userAnswers[qi];
          const correct = q.correct;
          const isRight = userAns === correct;
          return (
            <div
              key={qi}
              className="rounded-xl p-4 space-y-3"
              style={{
                background: isRight ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)',
                border: `1px solid ${isRight ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}
            >
              <div className="flex items-start gap-2">
                <span className={`flex-shrink-0 mt-0.5 text-sm ${isRight ? 'text-green-400' : 'text-red-400'}`}>
                  {isRight ? '✓' : '✗'}
                </span>
                <p className="text-white text-sm font-medium leading-snug">{q.question}</p>
              </div>
              <div className="space-y-1.5 pl-5">
                {q.options.map((opt, oi) => {
                  const isCorrect = oi === correct;
                  const isUser = oi === userAns;
                  let style = 'text-white/30';
                  if (isCorrect) style = 'text-green-300 font-medium';
                  else if (isUser && !isCorrect) style = 'text-red-300 line-through';
                  return (
                    <p key={oi} className={`text-xs ${style}`}>
                      {OPTION_LABELS[oi]}. {opt}{isCorrect && ' ✓'}
                    </p>
                  );
                })}
              </div>
              <p className="pl-5 text-white/45 text-xs italic leading-relaxed">{q.explanation}</p>
            </div>
          );
        })}
      </div>

      <button
        onClick={onClose}
        className="mt-6 w-full py-3 rounded-xl font-semibold text-sm text-white/60 hover:text-white hover:bg-white/10 transition-all"
      >
        Close
      </button>
    </div>
  );
}

// ─── Main QuizOverlay ─────────────────────────────────────────────────────────

export default function QuizOverlay({ node, explanation, rootTopic, onClose }) {
  const [phase, setPhase] = useState('loading');
  const [questions, setQuestions] = useState([]);
  const [userAnswers, setUserAnswers] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [error, setError] = useState(null);

  // Load or fetch quiz on mount
  useEffect(() => {
    const saved = loadQuizState(rootTopic, node.id);

    if (saved?.questions?.length) {
      setQuestions(saved.questions);
      setUserAnswers(saved.userAnswers || []);
      setCurrentIndex(saved.currentIndex ?? 0);
      setPhase(saved.completed ? 'results' : 'question');
      return;
    }

    fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeLabel: node.label, explanation }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const qs = data.questions;
        setQuestions(qs);
        setUserAnswers([]);
        setCurrentIndex(0);
        saveQuizState(rootTopic, node.id, { questions: qs, userAnswers: [], currentIndex: 0, completed: false });
        setPhase('question');
      })
      .catch((err) => {
        setError(err.message || 'Failed to generate quiz');
        setPhase('error');
      });
  }, [node.id, rootTopic]);

  const handleAnswer = useCallback((answerIndex) => {
    const newAnswers = [...userAnswers, answerIndex];
    const nextIndex = currentIndex + 1;
    const completed = nextIndex >= questions.length;

    setUserAnswers(newAnswers);
    saveQuizState(rootTopic, node.id, {
      questions,
      userAnswers: newAnswers,
      currentIndex: nextIndex,
      completed,
    });

    if (completed) {
      setPhase('results');
    } else {
      setCurrentIndex(nextIndex);
    }
  }, [userAnswers, currentIndex, questions, node.id, rootTopic]);

  const score = userAnswers.filter((a, i) => a === questions[i]?.correct).length;

  const handleRecap = () => setPhase('recap');

  const handleRetake = useCallback(() => {
    clearQuizState(rootTopic, node.id);
    setQuestions([]);
    setUserAnswers([]);
    setCurrentIndex(0);
    setPhase('loading');

    fetch('/api/quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeLabel: node.label, explanation }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const qs = data.questions;
        setQuestions(qs);
        setUserAnswers([]);
        setCurrentIndex(0);
        saveQuizState(rootTopic, node.id, { questions: qs, userAnswers: [], currentIndex: 0, completed: false });
        setPhase('question');
      })
      .catch((err) => {
        setError(err.message || 'Failed to generate quiz');
        setPhase('error');
      });
  }, [node.id, node.label, rootTopic, explanation]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50" onClick={onClose} style={{ background: 'rgba(0,0,0,0.5)' }} />

      {/* Panel — slides up from bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
        <div className="mx-auto max-w-2xl">
          <div
            className="rounded-t-2xl border border-white/10 shadow-2xl flex flex-col"
            style={{
              background: 'linear-gradient(160deg, #100d20 0%, #0a0a18 100%)',
              backdropFilter: 'blur(20px)',
              maxHeight: '88vh',
            }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-3 pb-3 border-b border-white/10 flex-shrink-0">
              <div>
                <span className="text-xs font-semibold uppercase tracking-widest text-amber-400 mb-0.5 block">
                  Quiz
                </span>
                <h2 className="text-white font-bold text-base leading-tight">{node.label}</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Single scrollable content area — no nested scrolls */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {phase === 'loading' && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-8 h-8 rounded-full border-2 border-amber-500/30 border-t-amber-400 animate-spin" />
                  <p className="text-white/40 text-sm">Generating quiz questions…</p>
                </div>
              )}

              {phase === 'error' && (
                <div className="px-6 py-10 text-center space-y-3">
                  <p className="text-red-300 text-sm">{error}</p>
                  <button onClick={onClose} className="text-white/50 hover:text-white text-sm underline">
                    Close
                  </button>
                </div>
              )}

              {phase === 'question' && questions[currentIndex] && (
                <QuestionScreen
                  key={currentIndex}
                  question={questions[currentIndex]}
                  index={currentIndex}
                  total={questions.length}
                  onAnswer={handleAnswer}
                />
              )}

              {phase === 'results' && (
                <ResultsScreen
                  score={score}
                  total={questions.length}
                  onRecap={handleRecap}
                  onRetake={handleRetake}
                  onClose={onClose}
                />
              )}

              {phase === 'recap' && (
                <RecapScreen
                  questions={questions}
                  userAnswers={userAnswers}
                  onClose={onClose}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
