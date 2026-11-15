import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Flame,
  Layers,
  Play,
  Sparkles,
  Square,
  Zap,
} from 'lucide-react';
import type { AnalyticsData, NavView, QuizSummary, RecoveryPlan, StudySession, Subject } from '../types';

interface DashboardProps {
  subjects: Subject[];
  analytics: AnalyticsData | null;
  recoveryPlans: RecoveryPlan[];
  quizzes: QuizSummary[];
  activeSession: StudySession | null;
  elapsedSec: number;
  sessionEnding: boolean;
  onStartSession: (subjectId: string, subtopic: string, mode: 'deep_work' | 'feynman' | 'interleaving') => Promise<void>;
  onEndSession: () => Promise<void>;
  onNavigate: (view: NavView, opts?: { subjectId?: string; quizId?: string }) => void;
}

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function Dashboard({
  subjects,
  analytics,
  recoveryPlans,
  quizzes,
  activeSession,
  elapsedSec,
  sessionEnding,
  onStartSession,
  onEndSession,
  onNavigate,
}: DashboardProps) {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(subjects[0]?.id || '');
  const [subtopic, setSubtopic] = useState('Limits');
  const [mode, setMode] = useState<'deep_work' | 'feynman' | 'interleaving'>('deep_work');
  const [starting, setStarting] = useState(false);

  const effectiveSubjectId = selectedSubjectId || subjects[0]?.id || '';
  const pendingRecoveries = recoveryPlans.filter((p) => p.status === 'pending');
  const dueCards = analytics?.totals.due_cards ?? 0;
  const avgScore = analytics?.totals.avg_score_pct;

  const handleStart = async () => {
    if (!effectiveSubjectId) return;
    setStarting(true);
    try {
      await onStartSession(effectiveSubjectId, subtopic.trim() || 'General', mode);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
            Cognitive Command Center
          </p>
          <h1 className="heading-fluid font-bold tracking-tight text-zinc-50">
            Evidence-Based Study OS
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigate('reviews')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-400"
          >
            <Layers className="h-4 w-4" />
            Review Due ({dueCards})
          </button>
          <button
            type="button"
            onClick={() => onNavigate('quizzes')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800"
          >
            <Zap className="h-4 w-4 text-amber-400" />
            Active Recall
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Due Queue</span>
            <Layers className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-50">{dueCards}</p>
          <p className="mt-1 text-xs text-zinc-400">
            of {analytics?.totals.total_cards ?? 0} total cards
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Avg Recall Score</span>
            <Brain className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-50">
            {avgScore !== null && avgScore !== undefined ? `${avgScore}%` : '—'}
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            {analytics?.totals.total_attempts ?? 0} quiz attempts
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Recovery Plans</span>
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-50">{pendingRecoveries.length}</p>
          <p className="mt-1 text-xs text-zinc-400">Flagged weak sub-topics</p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Deep Focus</span>
            <Flame className="h-4 w-4 text-violet-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-zinc-50">
            {Math.round((analytics?.totals.total_study_sec ?? 0) / 60)}m
          </p>
          <p className="mt-1 text-xs text-zinc-400">Logged retrieval blocks</p>
        </div>
      </div>

      {/* Study Session Launcher + Auto-Quiz Trigger */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <h2 className="text-base font-semibold text-zinc-100">
                Study Block & Auto-Quiz Trigger
              </h2>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              Ending a session automatically synthesizes a 5-question Active Recall quiz and fires your configured webhook (n8n / WhatsApp / Push).
            </p>
          </div>

          {activeSession ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-cyan-500/40 bg-cyan-950/30 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-400" />
                <span className="font-mono text-lg font-bold text-cyan-300">
                  {formatDuration(elapsedSec)}
                </span>
              </div>
              <span className="text-xs text-zinc-300">
                {activeSession.subtopic} ({activeSession.mode.replace('_', ' ')})
              </span>
              <button
                type="button"
                disabled={sessionEnding}
                onClick={onEndSession}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-rose-500 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-400 disabled:opacity-50"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                {sessionEnding ? 'Generating Auto-Quiz...' : 'End & Trigger 5Q Quiz'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                aria-label="Study Subject"
                value={effectiveSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="min-h-[44px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                aria-label="Sub-topic"
                value={subtopic}
                onChange={(e) => setSubtopic(e.target.value)}
                placeholder="Sub-topic (e.g. Limits)"
                className="min-h-[44px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-500"
              />

              <select
                aria-label="Learning Technique"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'deep_work' | 'feynman' | 'interleaving')}
                className="min-h-[44px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
              >
                <option value="deep_work">Deep Work</option>
                <option value="feynman">Feynman Technique</option>
                <option value="interleaving">Interleaving</option>
              </select>

              <button
                type="button"
                disabled={starting || !effectiveSubjectId}
                onClick={handleStart}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                <Play className="h-4 w-4 fill-current" />
                Start Block
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Automated Recovery Plans Banner */}
      {pendingRecoveries.length > 0 && (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-950/20 p-5">
          <div className="flex items-center gap-2 text-amber-300">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-base font-semibold">
              Automated Recovery Plans ({pendingRecoveries.length} Pending)
            </h2>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {pendingRecoveries.slice(0, 4).map((plan) => (
              <div
                key={plan.id}
                className="flex flex-col justify-between rounded-xl border border-amber-500/25 bg-zinc-950/70 p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                      {plan.subject_name}
                    </span>
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-200">
                      Weak: {plan.weak_subtopics.join(', ')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">{plan.recommendation}</p>
                </div>
                {plan.recovery_quiz_id && (
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate('quizzes', { quizId: plan.recovery_quiz_id || undefined })
                    }
                    className="mt-3 inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
                  >
                    Launch Remediation Quiz
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Subject Hubs (Swipeable on mobile, Grid on desktop via container query) */}
      <section className="cq-panel">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">Subject Hubs</h2>
          <button
            type="button"
            onClick={() => onNavigate('subjects')}
            className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
          >
            Manage all hubs →
          </button>
        </div>

        <div className="cq-grid">
          {subjects.map((subject) => (
            <div
              key={subject.id}
              className="group flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 hover:border-zinc-700"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: subject.color }}
                    />
                    <h3 className="font-semibold text-zinc-100">{subject.name}</h3>
                  </div>
                  {(subject.due_count ?? 0) > 0 && (
                    <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
                      {subject.due_count} due
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-400">{subject.description}</p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-zinc-800/80 pt-3">
                <span className="text-xs text-zinc-400">
                  {subject.concept_count ?? 0} concepts · {subject.card_count ?? 0} cards
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('subjects', { subjectId: subject.id })}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-zinc-800 px-3 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
                >
                  Open Hub
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Quizzes */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-100">Ready Active Recall Quizzes</h2>
          <button
            type="button"
            onClick={() => onNavigate('quizzes')}
            className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
          >
            View all →
          </button>
        </div>

        <div className="swipe-deck" role="region" aria-label="Ready quizzes">
          {quizzes.slice(0, 6).map((q) => (
            <div
              key={q.id}
              className="flex min-w-[260px] max-w-[300px] flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-400">{q.subject_name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      q.type === 'recovery'
                        ? 'bg-amber-500/20 text-amber-300'
                        : q.type === 'auto_session'
                          ? 'bg-violet-500/20 text-violet-300'
                          : 'bg-cyan-500/15 text-cyan-300'
                    }`}
                  >
                    {q.type === 'recovery'
                      ? 'Recovery'
                      : q.type === 'auto_session'
                        ? 'Auto 5Q'
                        : 'Standard'}
                  </span>
                </div>
                <h3 className="mt-2 line-clamp-2 text-sm font-semibold text-zinc-100">{q.title}</h3>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                  {q.last_score_pct !== null ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      Last: {q.last_score_pct}%
                    </>
                  ) : (
                    <>
                      <Clock className="h-3.5 w-3.5" />
                      {q.question_count} questions
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('quizzes', { quizId: q.id })}
                  className="min-h-[36px] rounded-lg bg-zinc-100 px-3 text-xs font-semibold text-zinc-950 hover:bg-white"
                >
                  Start
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
