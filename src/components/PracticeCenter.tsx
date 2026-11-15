import { useState } from 'react';
import { BarChart3, Brain, Layers } from 'lucide-react';
import type { AnalyticsData, QuizSummary, Subject } from '../types';
import { SpacedRepetitionQueue } from './SpacedRepetitionQueue';
import { ActiveRecallQuiz } from './ActiveRecallQuiz';
import { AnalyticsView } from './AnalyticsView';

interface PracticeCenterProps {
  subjects: Subject[];
  quizzes: QuizSummary[];
  analytics: AnalyticsData | null;
  dueCardsCount: number;
  initialQuizId?: string;
  onRefresh: () => Promise<void>;
}

export function PracticeCenter({
  subjects,
  quizzes,
  analytics,
  dueCardsCount,
  initialQuizId,
  onRefresh,
}: PracticeCenterProps) {
  const [tab, setTab] = useState<'reviews' | 'quizzes' | 'analytics'>(
    initialQuizId ? 'quizzes' : 'reviews'
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Prática & Retenção</h1>
          <p className="text-sm text-zinc-400">
            Revisão espaçada SM-2, quizzes de recuperação ativa e telemetria de memória.
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900/70 p-1">
          <button
            type="button"
            onClick={() => setTab('reviews')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === 'reviews' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-indigo-400" />
            Revisões
            {dueCardsCount > 0 && (
              <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                {dueCardsCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('quizzes')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === 'quizzes' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Brain className="h-3.5 w-3.5 text-emerald-400" />
            Quizzes ({quizzes.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('analytics')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === 'analytics' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
            Métricas
          </button>
        </div>
      </div>

      {tab === 'reviews' && <SpacedRepetitionQueue subjects={subjects} onReviewed={onRefresh} />}
      {tab === 'quizzes' && (
        <ActiveRecallQuiz
          quizzes={quizzes}
          initialQuizId={initialQuizId}
          onQuizCompleted={onRefresh}
        />
      )}
      {tab === 'analytics' && <AnalyticsView analytics={analytics} />}
    </div>
  );
}
