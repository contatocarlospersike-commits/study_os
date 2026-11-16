import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { api } from '../api/client';
import type { StudyBlock, StudyPlan, SubjectDetail } from '../types';

interface SubjectStudyPlanProps {
  subject: SubjectDetail;
  onOpenQuiz: (quizId?: string) => void;
  onRefresh?: () => Promise<void>;
}

const WEEK_DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

function LessonMarkdownView({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n');
  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed text-zinc-300">
      {lines.map((line, idx) => {
        const t = line.trim();
        if (!t) return <div key={idx} className="h-1.5" />;
        if (t.startsWith('### ')) {
          return (
            <h3 key={idx} className="pt-3 text-base font-semibold text-white">
              {t.slice(4)}
            </h3>
          );
        }
        if (t.startsWith('## ')) {
          return (
            <h2 key={idx} className="border-b border-zinc-800 pb-1.5 pt-4 text-lg font-semibold text-indigo-200">
              {t.slice(3)}
            </h2>
          );
        }
        if (t.startsWith('# ')) {
          return (
            <h1 key={idx} className="pt-2 text-xl font-bold text-white">
              {t.slice(2)}
            </h1>
          );
        }
        if (t.startsWith('- ') || t.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
              <span>{t.slice(2)}</span>
            </div>
          );
        }
        return <p key={idx}>{line}</p>;
      })}
    </div>
  );
}

export function SubjectStudyPlan({ subject, onOpenQuiz, onRefresh }: SubjectStudyPlanProps) {
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [blocks, setBlocks] = useState<StudyBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCalibrator, setShowCalibrator] = useState(false);

  // Calibrator state
  const [days, setDays] = useState<string[]>(['Seg', 'Qua', 'Sex']);
  const [morningMin, setMorningMin] = useState(20);
  const [afternoonMin, setAfternoonMin] = useState(40);
  const [nightMin, setNightMin] = useState(60);
  const [examDate, setExamDate] = useState('');
  const [generatingPlan, setGeneratingPlan] = useState(false);

  // Active block / lesson state
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getStudyPlan(subject.id);
      setPlan(res.plan);
      setBlocks(res.blocks);
      if (!res.plan) {
        setShowCalibrator(true);
      } else {
        setShowCalibrator(false);
        setDays(res.plan.days?.length ? res.plan.days : ['Seg', 'Qua', 'Sex']);
        setMorningMin(res.plan.slots?.morning ?? 0);
        setAfternoonMin(res.plan.slots?.afternoon ?? 0);
        setNightMin(res.plan.slots?.night ?? 0);
        setExamDate(res.plan.exam_date || '');
        const firstReady = res.blocks.find((b) => b.lesson_markdown) || res.blocks[0];
        if (firstReady) setActiveBlockId(firstReady.id);
      }
    } finally {
      setLoading(false);
    }
  }, [subject.id]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const toggleDay = (d: string) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (days.length === 0 || generatingPlan) return;
    setGeneratingPlan(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      const res = await api.generateStudyPlan({
        subject_id: subject.id,
        days,
        slots: { morning: morningMin, afternoon: afternoonMin, night: nightMin },
        exam_date: examDate.trim(),
      });
      setPlan(res.plan);
      setBlocks(res.blocks);
      setShowCalibrator(false);
      setActiveBlockId(res.blocks[0]?.id || null);
      setStatusMsg('Plano semanal montado com base nos seus materiais e turnos!');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao montar plano');
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handlePrepareBlock = async (blockId: string, force = false) => {
    setPreparingId(blockId);
    setErrorMsg('');
    setStatusMsg('');
    try {
      const res = await api.prepareStudyBlock(blockId, force);
      setBlocks((prev) => prev.map((b) => (b.id === blockId ? res.block : b)));
      setActiveBlockId(blockId);
      if (res.createdFlashcards > 0 || res.quizId) {
        setStatusMsg(
          `Aula pronta! Gerados ${res.createdFlashcards} flashcards${res.quizId ? ' + 1 quiz do bloco' : ''}.`
        );
      }
      if (onRefresh) await onRefresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao gerar aula do bloco');
    } finally {
      setPreparingId(null);
    }
  };

  const handleToggleComplete = async (blockId: string) => {
    const updated = await api.toggleStudyBlockComplete(blockId);
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? updated : b)));
  };

  const activeBlock = blocks.find((b) => b.id === activeBlockId) || null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-xs text-zinc-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Carregando plano de estudo ativo...
      </div>
    );
  }

  return (
    <div className="space-y-5 p-5 md:p-6">
      {/* Top Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <Sparkles className="h-4 w-4 text-indigo-400" />
            Estudo Ativo Guiado ({subject.name})
          </h3>
          <p className="text-xs text-zinc-400">
            A IA distribui seus materiais nos seus dias e horários e gera aulas prontas + quiz por bloco.
          </p>
        </div>

        {plan && (
          <button
            type="button"
            onClick={() => setShowCalibrator((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-indigo-500/50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {showCalibrator ? 'Fechar Calibragem' : 'Recalibrar Rotina'}
          </button>
        )}
      </div>

      {statusMsg && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      {/* Calibrator Form */}
      {showCalibrator && (
        <form
          onSubmit={handleGeneratePlan}
          className="space-y-4 rounded-2xl border border-indigo-500/30 bg-zinc-900/70 p-5"
        >
          <div>
            <label className="text-xs font-semibold text-zinc-200">
              1. Quais dias da semana você vai estudar {subject.name}?
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WEEK_DAYS.map((d) => {
                const selected = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      selected
                        ? 'bg-indigo-600 text-white'
                        : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-[11px] font-medium text-zinc-400">Manhã (min)</label>
              <input
                type="number"
                min={0}
                max={240}
                value={morningMin}
                onChange={(e) => setMorningMin(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-400">Tarde (min)</label>
              <input
                type="number"
                min={0}
                max={240}
                value={afternoonMin}
                onChange={(e) => setAfternoonMin(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-400">Noite (min)</label>
              <input
                type="number"
                min={0}
                max={240}
                value={nightMin}
                onChange={(e) => setNightMin(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-400">Data da Prova / Meta (opcional)</label>
              <input
                type="text"
                placeholder="Ex: 10/12 ou 3 semanas"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={generatingPlan || days.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {generatingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generatingPlan
              ? 'Analisando materiais e montando blocos...'
              : 'Transformar Materiais em Estudo Ativo'}
          </button>
        </form>
      )}

      {/* Strategy Summary & Blocks */}
      {plan && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-xs leading-relaxed text-zinc-300">
            <span className="font-semibold text-indigo-300">Estratégia da IA para você: </span>
            {plan.strategy_summary}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Blocks List */}
            <div className="space-y-2 lg:col-span-5">
              {blocks.map((b) => {
                const isSelected = activeBlock?.id === b.id;
                const isPreparing = preparingId === b.id;
                return (
                  <div
                    key={b.id}
                    onClick={() => setActiveBlockId(b.id)}
                    className={`cursor-pointer rounded-xl border p-3.5 transition ${
                      isSelected
                        ? 'border-indigo-500/60 bg-indigo-500/10'
                        : 'border-zinc-800/80 bg-zinc-900/50 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-indigo-300">
                        <Calendar className="h-3 w-3" />
                        Sem {b.week_number} · {b.day_label} ({b.shift_label})
                      </span>
                      <span className="inline-flex items-center gap-1 text-zinc-400">
                        <Clock className="h-3 w-3" />
                        {b.duration_min}m
                      </span>
                    </div>
                    <h4
                      className={`mt-1.5 text-sm font-semibold ${
                        b.status === 'completed' ? 'text-zinc-500 line-through' : 'text-white'
                      }`}
                    >
                      {b.topic}
                    </h4>
                    <p className="mt-0.5 text-[11px] text-zinc-400">{b.technique}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {!b.lesson_markdown ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handlePrepareBlock(b.id);
                          }}
                          disabled={isPreparing}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                        >
                          {isPreparing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                          {isPreparing ? 'Preparando aula...' : 'Gerar Aula + Quiz'}
                        </button>
                      ) : (
                        <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                          Aula Pronta
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleComplete(b.id);
                        }}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium ${
                          b.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {b.status === 'completed' ? 'Concluído' : 'Concluir'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active Lesson Panel */}
            <div className="lg:col-span-7">
              {activeBlock ? (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800 pb-4">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                        {activeBlock.day_label} · {activeBlock.shift_label} · {activeBlock.duration_min} min
                      </span>
                      <h3 className="mt-1 text-lg font-bold text-white">{activeBlock.topic}</h3>
                      {activeBlock.objective && (
                        <p className="mt-0.5 text-xs text-zinc-400">{activeBlock.objective}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {activeBlock.quiz_id && (
                        <button
                          type="button"
                          onClick={() => onOpenQuiz(activeBlock.quiz_id || undefined)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400"
                        >
                          <Zap className="h-3.5 w-3.5" />
                          Fazer Quiz do Bloco
                        </button>
                      )}
                      {activeBlock.lesson_markdown && (
                        <button
                          type="button"
                          onClick={() => void handlePrepareBlock(activeBlock.id, true)}
                          disabled={preparingId === activeBlock.id}
                          className="inline-flex items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Regenerar
                        </button>
                      )}
                    </div>
                  </div>

                  {activeBlock.lesson_markdown ? (
                    <LessonMarkdownView markdown={activeBlock.lesson_markdown} />
                  ) : (
                    <div className="py-10 text-center space-y-3">
                      <BookOpen className="mx-auto h-8 w-8 text-indigo-400/70" />
                      <p className="text-sm font-medium text-zinc-200">
                        Este bloco ainda não teve a aula gerada
                      </p>
                      <p className="text-xs text-zinc-400">
                        Clique abaixo para a IA sintetizar os seus materiais em uma aula pronta + flashcards + quiz.
                      </p>
                      <button
                        type="button"
                        onClick={() => void handlePrepareBlock(activeBlock.id)}
                        disabled={preparingId === activeBlock.id}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {preparingId === activeBlock.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        {preparingId === activeBlock.id
                          ? 'Gerando aula e questões...'
                          : 'Gerar Aula Pronta + Quiz Agora'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-xs text-zinc-400">
                  Selecione um bloco ao lado para estudar.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
