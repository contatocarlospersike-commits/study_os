import { BarChart3, CheckCircle2, Layers, TrendingUp } from 'lucide-react';
import type { AnalyticsData } from '../types';

interface AnalyticsViewProps {
  analytics: AnalyticsData | null;
}

export function AnalyticsView({ analytics }: AnalyticsViewProps) {
  if (!analytics) {
    return <p className="text-sm text-zinc-400">Loading analytics...</p>;
  }

  const buckets = [
    { label: '1d (Novo / Reiniciado)', count: analytics.intervalBuckets.d1 || 0, color: 'bg-rose-400' },
    { label: '3d (Inicial)', count: analytics.intervalBuckets.d3 || 0, color: 'bg-amber-400' },
    { label: '7d (Consolidando)', count: analytics.intervalBuckets.d7 || 0, color: 'bg-cyan-400' },
    { label: '15d (Forte)', count: analytics.intervalBuckets.d15 || 0, color: 'bg-violet-400' },
    { label: '30d+ (Dominado)', count: analytics.intervalBuckets.d30_plus || 0, color: 'bg-emerald-400' },
  ];
  const maxBucket = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
          Telemetria de Retenção & Domínio
        </p>
        <h1 className="heading-fluid font-bold text-zinc-50">Métricas de Aprendizado</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Interval Ladder Distribution */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Layers className="h-4 w-4 text-cyan-400" />
            Spaced Repetition Interval Distribution
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Cards progressing across the 1 → 3 → 7 → 15 → 30+ day memory ladder.
          </p>

          <div className="mt-5 space-y-3">
            {buckets.map((b) => (
              <div key={b.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-300">{b.label}</span>
                  <span className="font-mono font-semibold text-zinc-100">{b.count}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${b.color}`}
                    style={{ width: `${Math.round((b.count / maxBucket) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Subject Performance Breakdown */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <BarChart3 className="h-4 w-4 text-violet-400" />
            Subject Mastery & Due Load
          </div>
          <div className="mt-4 space-y-3">
            {analytics.bySubject.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: sub.color }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{sub.name}</p>
                    <p className="text-xs text-zinc-400">
                      {sub.card_count} cards · avg interval {sub.avg_interval_days ?? 0}d
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-zinc-100">
                    {sub.avg_quiz_score !== null ? `${sub.avg_quiz_score}%` : '—'}
                  </p>
                  <p className="text-xs text-cyan-400">{sub.due_count} due</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Recent Quiz Attempts */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          Recent Active Recall Attempts
        </div>
        {analytics.recentAttempts.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            No quiz attempts logged yet. Complete an Active Recall quiz to track retention.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {analytics.recentAttempts.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3.5"
              >
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{a.subject_name}</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-zinc-200">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    {a.score_pct}%
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-1 text-sm font-semibold text-zinc-100">
                  {a.quiz_title}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {a.correct_count}/{a.total_count} correct ·{' '}
                  {new Date(a.completed_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
