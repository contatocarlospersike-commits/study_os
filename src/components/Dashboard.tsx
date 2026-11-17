import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Circle,
  Clock,
  Layers,
  Play,
  Sparkles,
  Square,
  Zap,
} from 'lucide-react';
import { api, getCachedSync } from '../api/client';
import type {
  AnalyticsData,
  ChecklistItem,
  NavView,
  QuizSummary,
  RecoveryPlan,
  StudySession,
  Subject,
} from '../types';

interface DashboardProps {
  subjects: Subject[];
  analytics: AnalyticsData | null;
  recoveryPlans: RecoveryPlan[];
  quizzes: QuizSummary[];
  activeSession: StudySession | null;
  elapsedSec: number;
  sessionEnding: boolean;
  onStartSession: (
    subjectId: string,
    subtopic: string,
    mode: 'deep_work' | 'feynman' | 'interleaving'
  ) => Promise<void>;
  onEndSession: () => Promise<void>;
  onNavigate: (view: NavView, opts?: { subjectId?: string; quizId?: string }) => void;
}

const COVER_MINI: Record<string, string> = {
  aurora: 'from-indigo-600/80 via-violet-600/70 to-fuchsia-600/70',
  ocean: 'from-cyan-600/80 via-sky-600/70 to-blue-700/80',
  emerald: 'from-emerald-600/80 via-teal-600/70 to-cyan-700/80',
  sunset: 'from-amber-500/80 via-orange-600/75 to-rose-600/80',
  slate: 'from-zinc-700/90 via-zinc-800/90 to-zinc-900',
  crimson: 'from-rose-600/80 via-pink-600/70 to-purple-700/80',
};

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
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
  const [subtopic, setSubtopic] = useState('');
  const [mode, setMode] = useState<'deep_work' | 'feynman' | 'interleaving'>('deep_work');
  const [starting, setStarting] = useState(false);

  const [checklist, setChecklist] = useState<ChecklistItem[]>(
    () => getCachedSync<ChecklistItem[]>('/api/cognitive/checklist') || []
  );

  // Post-session check-in
  const [showCheckin, setShowCheckin] = useState(false);
  const [energyLevel, setEnergyLevel] = useState(4);
  const [focusLevel, setFocusLevel] = useState(4);
  const [savingCheckin, setSavingCheckin] = useState(false);

  useEffect(() => {
    if (!selectedSubjectId && subjects[0]?.id) {
      setSelectedSubjectId(subjects[0].id);
    }
  }, [subjects, selectedSubjectId]);

  useEffect(() => {
    api
      .getChecklist()
      .then(setChecklist)
      .catch(() => {});
  }, []);

  const handleToggleChecklist = async (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: item.completed ? 0 : 1 } : item))
    );
    try {
      const updated = await api.toggleChecklistItem(id);
      setChecklist((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch {
      // revert silently if failed
    }
  };

  const handleStart = async () => {
    const sid = selectedSubjectId || subjects[0]?.id;
    if (!sid) return;
    setStarting(true);
    try {
      await onStartSession(sid, subtopic.trim() || 'Bloco Focado', mode);
    } finally {
      setStarting(false);
    }
  };

  const handleEnd = async () => {
    await onEndSession();
    setShowCheckin(true);
  };

  const handleSaveCheckin = async () => {
    setSavingCheckin(true);
    try {
      await api.createCheckin({
        block_mode: mode,
        duration_min: Math.max(15, Math.round(elapsedSec / 60) || 25),
        energy_level: energyLevel,
        focus_level: focusLevel,
      });
      setShowCheckin(false);
    } finally {
      setSavingCheckin(false);
    }
  };

  const dueCards = analytics?.totals.due_cards ?? 0;
  const totalStudyMin = Math.round((analytics?.totals.total_study_sec ?? 0) / 60);
  const avgScore = analytics?.totals.avg_score_pct;
  const pendingRecoveries = recoveryPlans.filter((r) => r.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Clean Hero Header */}
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-indigo-400">Study OS · Central de Execução</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">{getGreeting()}!</h1>
          <p className="mt-1 text-xs text-zinc-400">
            {subjects.length} espaço(s) ativos • {dueCards} revisão(ões) SM-2 pendentes • {totalStudyMin} min estudados
            {avgScore !== null && avgScore !== undefined ? ` • ${avgScore}% acurácia` : ''}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onNavigate('subjects')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Workspace
          </button>
          <button
            type="button"
            onClick={() => onNavigate('practice')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:border-zinc-700"
          >
            <Layers className="h-3.5 w-3.5 text-cyan-400" />
            Revisões ({dueCards})
          </button>
          <button
            type="button"
            onClick={() => onNavigate('professor')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:border-zinc-700"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            Aula Feynman
          </button>
          <button
            type="button"
            onClick={() => onNavigate('tutor')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:border-zinc-700"
          >
            <Bot className="h-3.5 w-3.5 text-emerald-400" />
            Tutor IA
          </button>
        </div>
      </div>

      {/* Compact Focus Timer Bar */}
      {subjects.length > 0 && (
        <section className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4">
          {activeSession ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
                <div>
                  <p className="text-xs font-semibold text-emerald-300">Sessão de Foco em Andamento</p>
                  <p className="text-sm font-medium text-white">{activeSession.subtopic}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-2xl font-bold tabular-nums text-white">
                  {formatDuration(elapsedSec)}
                </span>
                <button
                  type="button"
                  onClick={handleEnd}
                  disabled={sessionEnding}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-400 disabled:opacity-50"
                >
                  <Square className="h-3.5 w-3.5" />
                  {sessionEnding ? 'Gerando Quiz...' : 'Finalizar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icon || '📚'} {s.name}
                  </option>
                ))}
              </select>
              <input
                value={subtopic}
                onChange={(e) => setSubtopic(e.target.value)}
                placeholder="O que vai estudar neste bloco? (ex: Limites, Aula 03...)"
                className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none"
              />
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
              >
                <option value="deep_work">Deep Work</option>
                <option value="feynman">Feynman</option>
                <option value="interleaving">Intercalado</option>
              </select>
              <button
                type="button"
                onClick={handleStart}
                disabled={starting}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                Iniciar Bloco
              </button>
            </div>
          )}

          {showCheckin && !activeSession && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 text-xs">
              <span className="font-medium text-indigo-200">Check-in rápido pós-sessão:</span>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-zinc-300">
                  Energia (1-5):
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={energyLevel}
                    onChange={(e) => setEnergyLevel(Number(e.target.value))}
                    className="w-12 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-center text-white"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-zinc-300">
                  Foco (1-5):
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={focusLevel}
                    onChange={(e) => setFocusLevel(Number(e.target.value))}
                    className="w-12 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-center text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleSaveCheckin}
                  disabled={savingCheckin}
                  className="rounded-lg bg-indigo-600 px-3 py-1 font-semibold text-white hover:bg-indigo-500"
                >
                  {savingCheckin ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Main 2-Column Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Checklist & Recovery */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Checklist de Hoje</h2>
              <button
                type="button"
                onClick={() => onNavigate('professor')}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
              >
                Montar agenda →
              </button>
            </div>

            {checklist.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 p-5 text-center text-xs text-zinc-400">
                Nenhuma tarefa agendada para hoje ainda. Use o <strong>Estudo Ativo</strong> no Workspace ou o <strong>Planejador</strong> na aba Professor.
              </div>
            ) : (
              <div className="space-y-1.5">
                {checklist.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleToggleChecklist(item.id)}
                    className="flex w-full items-start gap-2.5 rounded-xl border border-zinc-800/70 bg-zinc-950/60 px-3 py-2.5 text-left transition hover:border-zinc-700"
                  >
                    {item.completed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs font-medium ${
                          item.completed ? 'text-zinc-500 line-through' : 'text-zinc-100'
                        }`}
                      >
                        {item.title}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {item.subject_name} · {item.duration_min} min
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {pendingRecoveries.length > 0 && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                Pontos de Reforço ({pendingRecoveries.length})
              </div>
              {pendingRecoveries.slice(0, 2).map((plan) => (
                <div key={plan.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 text-xs">
                  <p className="font-semibold text-white">{plan.subject_name}</p>
                  <p className="mt-1 text-zinc-400">{plan.recommendation}</p>
                  {plan.recovery_quiz_id && (
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate('practice', { quizId: plan.recovery_quiz_id || undefined })
                      }
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-zinc-950 hover:bg-amber-400"
                    >
                      Reforçar Agora <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Spaces (Subjects & Projects) */}
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Seus Espaços (Matérias & Projetos)</h2>
            <button
              type="button"
              onClick={() => onNavigate('subjects')}
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
            >
              Ver todos →
            </button>
          </div>

          {subjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-8 text-center">
              <p className="text-sm font-medium text-zinc-200">Comece criando suas matérias e cursos</p>
              <p className="mt-1 text-xs text-zinc-400">
                Organize Ciência da Computação, Alura, Asimov e n8n no Workspace com capas, notas e planos de estudo.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('subjects')}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Abrir Workspace <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {subjects.slice(0, 6).map((sub) => {
                const isImg =
                  sub.cover_style &&
                  (sub.cover_style.startsWith('data:image/') || sub.cover_style.startsWith('http'));
                const gradient = COVER_MINI[sub.cover_style || 'aurora'] || COVER_MINI.aurora;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => onNavigate('subjects', { subjectId: sub.id })}
                    className="group overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/60 text-left transition hover:border-zinc-700"
                  >
                    <div
                      style={
                        isImg
                          ? {
                              backgroundImage: `url(${sub.cover_style})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }
                          : undefined
                      }
                      className={`h-12 w-full ${isImg ? 'bg-zinc-900' : `bg-gradient-to-r ${gradient}`}`}
                    />
                    <div className="p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-white">
                          {sub.icon || '📚'} {sub.name}
                        </span>
                        <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                          {sub.kind === 'project' ? 'Projeto' : 'Matéria'}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-400">
                        <span>{sub.note_count ?? 0} notas</span>
                        <span>•</span>
                        <span>{sub.card_count ?? 0} cards</span>
                        {(sub.due_count ?? 0) > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-amber-300">{sub.due_count} pendentes</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Quizzes Ready */}
          {quizzes.length > 0 && (
            <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  Quizzes Recentes
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigate('practice')}
                  className="text-xs text-cyan-400 hover:text-cyan-300"
                >
                  Ver todos →
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {quizzes.slice(0, 4).map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => onNavigate('practice', { quizId: q.id })}
                    className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2.5 text-left hover:border-amber-500/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white">{q.title}</p>
                      <p className="text-[11px] text-zinc-500">{q.subject_name}</p>
                    </div>
                    <span className="ml-2 shrink-0 inline-flex items-center gap-1 text-[11px] text-zinc-400">
                      <Clock className="h-3 w-3" />
                      {q.last_score_pct !== null ? `${q.last_score_pct}%` : `${q.question_count}Q`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
