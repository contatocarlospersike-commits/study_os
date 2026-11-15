import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { api } from '../api/client';
import type { QuizAttemptResult, QuizDetail, QuizSummary } from '../types';

interface ActiveRecallQuizProps {
  quizzes: QuizSummary[];
  initialQuizId?: string;
  onQuizCompleted: () => Promise<void>;
}

export function ActiveRecallQuiz({
  quizzes,
  initialQuizId,
  onQuizCompleted,
}: ActiveRecallQuizProps) {
  const [activeQuizId, setActiveQuizId] = useState<string>(initialQuizId || quizzes[0]?.id || '');
  const [quiz, setQuiz] = useState<QuizDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizAttemptResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialQuizId) {
      setActiveQuizId(initialQuizId);
    }
  }, [initialQuizId]);

  useEffect(() => {
    const id = activeQuizId || quizzes[0]?.id;
    if (!id) return;
    setResult(null);
    setAnswers({});
    api.getQuiz(id).then(setQuiz);
  }, [activeQuizId, quizzes]);

  const handleSelectOption = (questionId: string, optionIdx: number) => {
    if (result) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionIdx }));
  };

  const handleSubmit = async () => {
    if (!quiz) return;
    setSubmitting(true);
    try {
      const res = await api.submitQuiz(quiz.id, answers);
      setResult(res);
      await onQuizCompleted();
    } finally {
      setSubmitting(false);
    }
  };

  const answeredCount = quiz ? quiz.questions.filter((q) => typeof answers[q.id] === 'number').length : 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
          Retrieval Practice & Remediation
        </p>
        <h1 className="heading-fluid font-bold text-zinc-50">Active Recall Quizzes</h1>
      </div>

      {/* Swipeable Quiz Selector */}
      <div className="swipe-deck" role="region" aria-label="Available Quizzes">
        {quizzes.map((q) => {
          const selected = q.id === (quiz?.id || activeQuizId);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setActiveQuizId(q.id)}
              className={`flex min-w-[230px] max-w-[270px] shrink-0 flex-col items-start rounded-2xl border p-3.5 text-left ${
                selected
                  ? 'border-amber-400 bg-amber-950/30 text-zinc-50'
                  : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <div className="flex w-full items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-zinc-400">{q.subject_name}</span>
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${
                    q.type === 'recovery'
                      ? 'bg-amber-500/20 text-amber-300'
                      : q.type === 'auto_session'
                        ? 'bg-violet-500/20 text-violet-300'
                        : 'bg-cyan-500/15 text-cyan-300'
                  }`}
                >
                  {q.type === 'recovery' ? 'Recovery' : q.type === 'auto_session' ? 'Auto 5Q' : 'Standard'}
                </span>
              </div>
              <span className="mt-1.5 line-clamp-2 text-sm font-semibold">{q.title}</span>
            </button>
          );
        })}
      </div>

      {quiz && (
        <div className="space-y-5">
          {/* Quiz Header */}
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                {quiz.subject_name}
              </span>
              <h2 className="text-lg font-bold text-zinc-50">{quiz.title}</h2>
            </div>
            <div className="text-sm text-zinc-400">
              {answeredCount} / {quiz.questions.length} answered
            </div>
          </div>

          {/* Result & Automated Recovery Plan Banner */}
          {result && (
            <div
              className={`rounded-2xl border p-5 ${
                result.scorePct >= result.threshold
                  ? 'border-emerald-500/40 bg-emerald-950/25'
                  : 'border-amber-500/50 bg-amber-950/25'
              }`}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    {result.scorePct >= result.threshold ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="h-6 w-6 text-amber-400" />
                    )}
                    <h3 className="text-xl font-bold text-zinc-50">
                      Score: {result.scorePct}% ({result.correctCount}/{result.totalCount})
                    </h3>
                  </div>
                  <p className="mt-1 text-sm text-zinc-300">
                    {result.scorePct >= result.threshold
                      ? 'Mastery threshold met! Your retrieval pathways are consolidating.'
                      : `Below ${result.threshold}% threshold. Automated Recovery Plan generated for: ${result.weakSubtopics.join(', ')}.`}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResult(null);
                      setAnswers({});
                    }}
                    className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 text-xs font-semibold text-zinc-100 hover:bg-zinc-800"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                  {result.recoveryPlan?.recoveryQuizId && (
                    <button
                      type="button"
                      onClick={() => setActiveQuizId(result.recoveryPlan!.recoveryQuizId)}
                      className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Launch Remediation Quiz
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Questions */}
          <div className="space-y-4">
            {quiz.questions.map((q, idx) => {
              const selected = answers[q.id];
              const feedback = result?.breakdown.find((b) => b.questionId === q.id);

              return (
                <div
                  key={q.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-400">
                      Question {idx + 1} · {q.subtopic}
                    </span>
                    {feedback && (
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold ${
                          feedback.isCorrect ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {feedback.isCorrect ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" /> Correct
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4" /> Missed
                          </>
                        )}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 text-base font-medium text-zinc-100">{q.prompt}</p>

                  <div className="mt-4 grid gap-2.5">
                    {q.options.map((opt, optIdx) => {
                      const isChosen = selected === optIdx;
                      const isCorrectOption = feedback && feedback.correctIndex === optIdx;
                      const isWrongChosen = feedback && isChosen && !feedback.isCorrect;

                      let cls =
                        'border-zinc-800 bg-zinc-950/70 text-zinc-200 hover:border-zinc-600';
                      if (isCorrectOption) {
                        cls = 'border-emerald-500 bg-emerald-950/40 text-emerald-100';
                      } else if (isWrongChosen) {
                        cls = 'border-rose-500 bg-rose-950/40 text-rose-100';
                      } else if (isChosen) {
                        cls = 'border-cyan-400 bg-cyan-950/40 text-cyan-100';
                      }

                      return (
                        <button
                          key={optIdx}
                          type="button"
                          disabled={Boolean(result)}
                          onClick={() => handleSelectOption(q.id, optIdx)}
                          className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm ${cls}`}
                        >
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold">
                            {String.fromCharCode(65 + optIdx)}
                          </span>
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {feedback && (
                    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-300">
                      <span className="font-semibold text-cyan-400">Explanation: </span>
                      {feedback.explanation}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!result && (
            <button
              type="button"
              disabled={submitting || answeredCount === 0}
              onClick={handleSubmit}
              className="min-h-[50px] w-full rounded-2xl bg-cyan-500 px-6 text-sm font-bold text-zinc-950 hover:bg-cyan-400 disabled:opacity-50"
            >
              {submitting ? 'Scoring & Evaluating Recovery Plan...' : 'Submit Active Recall Quiz'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
