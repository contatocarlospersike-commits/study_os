import React, { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';
import {
  BrainCircuit,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Sliders,
  Sparkles,
  AlertTriangle,
  Trash2,
  Upload,
  Video,
  MessageSquareText,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  ChecklistItem,
  DailyPlanResponse,
  FeynmanLesson,
  LearningProfile,
  ProfessorEvaluation,
  ProfessorLesson,
  RoutineConfig,
  Subject,
  YoutubeEvaluationResult,
} from '../types';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'strict',
});

function MermaidDiagram({ chart }: { chart: string }) {
  const uid = useId().replace(/:/g, '');
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    if (!chart.trim()) return;
    mermaid
      .render(`prof_${uid}`, chart)
      .then((res) => {
        if (mounted) setSvg(res.svg);
      })
      .catch(() => {
        if (mounted) setSvg('');
      });
    return () => {
      mounted = false;
    };
  }, [chart, uid]);

  if (!svg) {
    return (
      <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 overflow-x-auto">
        {chart}
      </pre>
    );
  }
  return (
    <div
      className="p-3 rounded-xl bg-slate-950 border border-slate-800 overflow-x-auto flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function buildGoogleCalendarUrl(item: {
  title: string;
  subject_name: string;
  duration_min: number;
  reason: string;
}): string {
  const start = new Date();
  start.setMinutes(start.getMinutes() + 15);
  const end = new Date(start.getTime() + (item.duration_min || 25) * 60000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `[Study OS] ${item.subject_name}: ${item.title}`,
    details: `${item.reason}\n\nGerado pelo Planejador Cognitivo Study OS.`,
    dates: `${fmt(start)}/${fmt(end)}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

interface ProfessorPlannerProps {
  subjects: Subject[];
  onNotify: (title: string, msg: string) => void;
}

export const ProfessorPlanner: React.FC<ProfessorPlannerProps> = ({ subjects, onNotify }) => {
  const [subTab, setSubTab] = useState<'feynman' | 'professor' | 'planner' | 'calibration'>('feynman');

  // Multimodal Feynman Pipeline (PDF slides + transcript)
  const [feynmanLessons, setFeynmanLessons] = useState<FeynmanLesson[]>([]);
  const [activeFeynman, setActiveFeynman] = useState<FeynmanLesson | null>(null);
  const [feynmanTopic, setFeynmanTopic] = useState('');
  const [feynmanTranscript, setFeynmanTranscript] = useState('');
  const [feynmanPdfBase64, setFeynmanPdfBase64] = useState<string | undefined>();
  const [feynmanPdfName, setFeynmanPdfName] = useState('');
  const [saveToWorkspace, setSaveToWorkspace] = useState(true);
  const [generatingFeynman, setGeneratingFeynman] = useState(false);

  // Professor Feynman + Creator (YouTube)
  const [subjectId, setSubjectId] = useState<string>(subjects[0]?.id ?? '');
  const [topic, setTopic] = useState('');
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [lesson, setLesson] = useState<ProfessorLesson | null>(null);

  const [evalMode, setEvalMode] = useState<'youtube' | 'text'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [transcriptFallback, setTranscriptFallback] = useState('');
  const [explanation, setExplanation] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<ProfessorEvaluation | null>(null);
  const [ytEvaluation, setYtEvaluation] = useState<YoutubeEvaluationResult | null>(null);

  // Daily Planner + Routine + Checklist
  const [availableMin, setAvailableMin] = useState(60);
  const [examGoal, setExamGoal] = useState('');
  const [preferredTime, setPreferredTime] = useState('Noite (19h–22h)');
  const [focusBalance, setFocusBalance] = useState<RoutineConfig['focusBalance']>('balanced');
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [plan, setPlan] = useState<DailyPlanResponse | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);

  // Calibration
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    api.getFeynmanLessons().then((list) => {
      setFeynmanLessons(list);
      if (list[0]) setActiveFeynman(list[0]);
    }).catch(() => {});
  }, []);

  const handleFeynmanPdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFeynmanPdfName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      setFeynmanPdfBase64(res.includes(',') ? res.split(',')[1] : res);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateFeynman = async (e: React.FormEvent) => {
    e.preventDefault();
    if (generatingFeynman || (!feynmanPdfBase64 && !feynmanTranscript.trim() && !feynmanTopic.trim())) return;
    setGeneratingFeynman(true);
    try {
      const created = await api.generateFeynmanLesson({
        subject_id: subjectId || null,
        pdf_base64: feynmanPdfBase64,
        pdf_filename: feynmanPdfName,
        transcript_text: feynmanTranscript,
        topic_hint: feynmanTopic,
        save_to_workspace: saveToWorkspace,
      });
      setFeynmanLessons((prev) => [created, ...prev]);
      setActiveFeynman(created);
      setFeynmanTranscript('');
      setFeynmanTopic('');
      setFeynmanPdfBase64(undefined);
      setFeynmanPdfName('');
      onNotify(
        'Aula Feynman gerada!',
        created.workspace_note_id
          ? 'Salva no banco e também adicionada como nota no seu Workspace.'
          : 'Aula estruturada salva com sucesso.'
      );
    } catch (err) {
      onNotify('Erro ao gerar aula Feynman', (err as Error).message);
    } finally {
      setGeneratingFeynman(false);
    }
  };

  useEffect(() => {
    if (!subjectId && subjects[0]?.id) setSubjectId(subjects[0].id);
  }, [subjects, subjectId]);

  useEffect(() => {
    api
      .getLearningProfile()
      .then((p) => {
        setProfile(p);
        if (p?.routine_json) {
          try {
            const parsed = JSON.parse(p.routine_json) as RoutineConfig;
            if (parsed.examGoal) setExamGoal(parsed.examGoal);
            if (parsed.preferredTime) setPreferredTime(parsed.preferredTime);
            if (parsed.focusBalance) setFocusBalance(parsed.focusBalance);
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {});

    api
      .getChecklist()
      .then(setChecklist)
      .catch(() => {});
  }, []);

  const handleGenerateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !topic.trim()) return;
    setLoadingLesson(true);
    setLesson(null);
    setEvaluation(null);
    setYtEvaluation(null);
    try {
      const res = await api.generateProfessorLesson({ subject_id: subjectId, topic: topic.trim() });
      setLesson(res);
    } catch (err) {
      onNotify('Erro no Modo Professor', (err as Error).message);
    } finally {
      setLoadingLesson(false);
    }
  };

  const handleEvaluateText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !topic.trim() || !explanation.trim()) return;
    setEvaluating(true);
    setYtEvaluation(null);
    try {
      const res = await api.evaluateProfessorExplanation({
        subject_id: subjectId,
        topic: topic.trim(),
        user_explanation: explanation.trim(),
      });
      setEvaluation(res);
      onNotify('Avaliação concluída', `Nota Feynman: ${res.score}/100`);
    } catch (err) {
      onNotify('Erro ao avaliar', (err as Error).message);
    } finally {
      setEvaluating(false);
    }
  };

  const handleEvaluateYoutube = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || (!youtubeUrl.trim() && !transcriptFallback.trim())) return;
    setEvaluating(true);
    setEvaluation(null);
    try {
      const res = await api.evaluateYoutubeLesson({
        subject_id: subjectId || undefined,
        topic: topic.trim(),
        youtube_url: youtubeUrl.trim() || undefined,
        transcript_fallback: transcriptFallback.trim() || undefined,
      });
      setYtEvaluation(res);
      onNotify(
        'Vídeo analisado!',
        `Técnica: ${res.technicalScore}/100 · Creator: ${res.creatorScore}/100`
      );
    } catch (err) {
      onNotify('Erro na análise do vídeo', (err as Error).message);
    } finally {
      setEvaluating(false);
    }
  };

  const handleGeneratePlan = async () => {
    setLoadingPlan(true);
    try {
      const res = await api.generateDailyPlan({
        available_minutes: availableMin,
        routine: {
          examGoal: examGoal.trim(),
          preferredTime,
          focusBalance,
        },
      });
      setPlan(res);
      if (res.checklist) setChecklist(res.checklist);
      onNotify('Planejamento pronto!', 'Checklist atualizado e pronto para o Google Agenda.');
    } catch (err) {
      onNotify('Erro no Planejador', (err as Error).message);
    } finally {
      setLoadingPlan(false);
    }
  };

  const handleToggleChecklist = async (id: string) => {
    try {
      const updated = await api.toggleChecklistItem(id);
      setChecklist((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch {
      // ignore
    }
  };

  const handleDeleteChecklist = async (id: string) => {
    try {
      await api.deleteChecklistItem(id);
      setChecklist((prev) => prev.filter((c) => c.id !== id));
    } catch {
      // ignore
    }
  };

  const handleSaveProfile = async (patch: Partial<LearningProfile>) => {
    if (!profile) return;
    setSavingProfile(true);
    try {
      const updated = await api.updateLearningProfile(patch);
      setProfile(updated);
      onNotify('Perfil calibrado', 'Suas preferências cognitivas foram salvas.');
    } catch (err) {
      onNotify('Erro ao salvar', (err as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Subtabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-cyan-400" />
            Professor Creator & Planejador
          </h2>
          <p className="text-sm text-slate-400">
            Estruture aulas para o YouTube, receba análise dupla (fixação + comunicação) e organize sua rotina em checklist.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 bg-zinc-900/90 p-1 rounded-xl border border-zinc-800">
          {[
            { id: 'feynman', label: 'Aula Feynman (PDF + Áudio)', icon: Sparkles },
            { id: 'professor', label: 'Carlos Creator (YouTube)', icon: BrainCircuit },
            { id: 'planner', label: 'Planejador & Agenda', icon: CalendarClock },
            { id: 'calibration', label: 'Calibração', icon: Sliders },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id as typeof subTab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  active
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* SUBTAB 0: PIPELINE FEYNMAN MULTIMODAL (PDF SLIDES + TRANSCRIÇÃO) */}
      {subTab === 'feynman' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleGenerateFeynman}
            className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 lg:col-span-5"
          >
            <div>
              <h3 className="text-base font-semibold text-white">Gerar Aula Feynman Multimodal</h3>
              <p className="mt-0.5 text-xs text-zinc-400">
                Envie o PDF dos slides e/ou a transcrição da aula. A IA aplica a Técnica de Feynman com analogias, tradução técnica, armadilhas e perguntas de Active Recall.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">Matéria / Projeto</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              >
                <option value="">Geral (sem vínculo)</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icon || '📚'} {s.name}
                  </option>
                ))}
              </select>
            </div>

            <input
              value={feynmanTopic}
              onChange={(e) => setFeynmanTopic(e.target.value)}
              placeholder="Tema / Foco da aula (opcional se enviar PDF)"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder:text-zinc-500"
            />

            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-zinc-700 bg-zinc-950/70 px-3.5 py-2.5 text-xs text-zinc-300 hover:border-indigo-400">
              <span className="flex items-center gap-2 truncate">
                <Upload className="h-4 w-4 text-indigo-400" />
                {feynmanPdfName ? `PDF pronto: ${feynmanPdfName}` : 'Subir PDF de slides (opcional)'}
              </span>
              <input type="file" accept="application/pdf" onChange={handleFeynmanPdfSelect} className="hidden" />
            </label>

            <textarea
              rows={5}
              value={feynmanTranscript}
              onChange={(e) => setFeynmanTranscript(e.target.value)}
              placeholder="Cole aqui a transcrição da aula ou suas anotações brutas..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-white placeholder:text-zinc-500"
            />

            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={saveToWorkspace}
                onChange={(e) => setSaveToWorkspace(e.target.checked)}
                className="rounded border-zinc-700 bg-zinc-950"
              />
              Salvar também como nota no Workspace da matéria
            </label>

            <button
              type="submit"
              disabled={generatingFeynman || (!feynmanPdfBase64 && !feynmanTranscript.trim() && !feynmanTopic.trim())}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {generatingFeynman ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generatingFeynman ? 'Processando slides + transcrição...' : 'Gerar Aula Feynman'}
            </button>

            {feynmanLessons.length > 0 && (
              <div className="space-y-1.5 border-t border-zinc-800 pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                  Aulas Salvas ({feynmanLessons.length})
                </span>
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {feynmanLessons.map((fl) => (
                    <div
                      key={fl.id}
                      onClick={() => setActiveFeynman(fl)}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-xs transition ${
                        activeFeynman?.id === fl.id
                          ? 'border-indigo-500/60 bg-indigo-500/15 text-white'
                          : 'border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <span className="truncate font-medium">{fl.titulo_aula}</span>
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await api.deleteFeynmanLesson(fl.id);
                          setFeynmanLessons((p) => p.filter((x) => x.id !== fl.id));
                          if (activeFeynman?.id === fl.id) setActiveFeynman(null);
                        }}
                        className="ml-2 text-zinc-500 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>

          <div className="lg:col-span-7">
            {activeFeynman ? (
              <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
                <div className="border-b border-zinc-800 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                      {activeFeynman.subject_name || 'Aula Feynman'}
                    </span>
                    {activeFeynman.model_used && (
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                        {activeFeynman.model_used}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 text-xl font-bold text-white">{activeFeynman.titulo_aula}</h3>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Conceito Central</h4>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">{activeFeynman.conceito_central}</p>
                </div>

                <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                    Analogia do Mundo Real
                  </h4>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-100">{activeFeynman.analogia_mundo_real}</p>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    Tradução Técnica
                  </h4>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-200">{activeFeynman.traducao_tecnica}</p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
                    <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-rose-300">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Armadilhas Comuns
                    </h4>
                    <ul className="mt-2 space-y-1.5 text-xs text-zinc-300">
                      {activeFeynman.armadilhas_comuns.map((a, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                    <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Active Recall (Teste Agora)
                    </h4>
                    <ul className="mt-2 space-y-1.5 text-xs text-zinc-200">
                      {activeFeynman.perguntas_active_recall.map((p, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="font-semibold text-amber-400">{i + 1}.</span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[340px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center">
                <Sparkles className="h-8 w-8 text-indigo-400/70" />
                <p className="mt-3 text-sm font-medium text-zinc-200">
                  Nenhuma aula Feynman selecionada
                </p>
                <p className="mt-1 max-w-sm text-xs text-zinc-400">
                  Suba o PDF dos slides e/ou cole a transcrição da aula ao lado para gerar uma explicação completa com analogias e Active Recall.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 1: MODO CARLOS PROFESSOR + CREATOR YOUTUBE */}
      {subTab === 'professor' && (
        <div className="space-y-5">
          <form
            onSubmit={handleGenerateLesson}
            className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col sm:flex-row gap-3"
          >
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="sm:w-56 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100"
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Tema da aula/vídeo (ex: Árvore B+, Pipeline RISC, 3ª Forma Normal)"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100"
              required
            />
            <button
              type="submit"
              disabled={loadingLesson || !topic.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
            >
              {loadingLesson ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Gerar Esqueleto de Aula
            </button>
          </form>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Creator Skeleton */}
            <div className="lg:col-span-7">
              {lesson ? (
                <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-slate-100">{lesson.title}</h3>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                      Esqueleto Guiado
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-violet-500/10 border border-violet-500/25 text-xs text-violet-100 leading-relaxed">
                    <strong className="block text-violet-300 mb-1">Gancho YouTube (0–30s):</strong>
                    {lesson.hook30s}
                  </div>

                  {lesson.structureBlocks && lesson.structureBlocks.length > 0 && (
                    <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                      <div className="text-xs font-semibold text-slate-200">
                        Blocos para você estruturar e explicar com suas palavras:
                      </div>
                      <ol className="list-decimal pl-4 text-xs text-slate-300 space-y-1">
                        {lesson.structureBlocks.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-xs text-cyan-100 leading-relaxed">
                    <strong className="block text-cyan-300 mb-1">Analogia do Mundo Real:</strong>
                    {lesson.analogy}
                  </div>

                  <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {lesson.coreExplanation}
                  </div>

                  {lesson.mermaidDiagram && (
                    <div>
                      <div className="text-xs font-medium text-slate-400 mb-1.5">
                        Diagrama Visual (para usar na tela)
                      </div>
                      <MermaidDiagram chart={lesson.mermaidDiagram} />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs">
                    <div className="text-slate-300">
                      <strong className="text-emerald-300 block mb-0.5">Pergunta para Comentários:</strong>
                      {lesson.audienceQuestion}
                    </div>
                    <div className="text-slate-400">
                      <strong className="text-slate-200 block mb-0.5">Termo em Inglês:</strong>
                      {lesson.englishTermTip}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-2">
                  <p className="text-sm text-slate-300">
                    Escolha uma matéria e digite o tema acima para gerar seu esqueleto de aula.
                  </p>
                  <p className="text-xs text-slate-400">
                    A IA não escreve texto decorado: ela te dá o gancho, os blocos lógicos e o diagrama para você estruturar e gravar do seu jeito (máxima fixação).
                  </p>
                </div>
              )}
            </div>

            {/* Right: Evaluate YouTube Video OR Text */}
            <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Avaliar Sua Aula
                </span>
                <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEvalMode('youtube')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium ${
                      evalMode === 'youtube' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400'
                    }`}
                  >
                    <Video className="w-3 h-3" />
                    Link YouTube
                  </button>
                  <button
                    type="button"
                    onClick={() => setEvalMode('text')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium ${
                      evalMode === 'text' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400'
                    }`}
                  >
                    <MessageSquareText className="w-3 h-3" />
                    Texto
                  </button>
                </div>
              </div>

              {evalMode === 'youtube' ? (
                <form onSubmit={handleEvaluateYoutube} className="space-y-3">
                  <input
                    type="url"
                    placeholder="Cole o link do vídeo no YouTube (https://youtube.com/...)"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                  <textarea
                    rows={4}
                    placeholder="Opcional (ou se o vídeo for privado): cole aqui a transcrição/roteiro que você falou..."
                    value={transcriptFallback}
                    onChange={(e) => setTranscriptFallback(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={evaluating || !topic.trim() || (!youtubeUrl.trim() && !transcriptFallback.trim())}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                    Analisar Vídeo (Fixação + Creator)
                  </button>
                </form>
              ) : (
                <form onSubmit={handleEvaluateText} className="space-y-3">
                  {lesson?.checkpointQuestion && (
                    <p className="text-xs text-slate-300 font-medium">{lesson.checkpointQuestion}</p>
                  )}
                  <textarea
                    rows={6}
                    placeholder="Explique o tema com suas próprias palavras..."
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100"
                    required
                  />
                  <button
                    type="submit"
                    disabled={evaluating || !topic.trim() || !explanation.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Avaliar Explicação Feynman
                  </button>
                </form>
              )}

              {/* YouTube 2-layer Evaluation Output */}
              {ytEvaluation && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center">
                      <div className="text-[11px] text-slate-400">Domínio Técnico</div>
                      <div className="text-lg font-bold text-emerald-400">{ytEvaluation.technicalScore}/100</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-center">
                      <div className="text-[11px] text-slate-400">Comunicação Creator</div>
                      <div className="text-lg font-bold text-cyan-400">{ytEvaluation.creatorScore}/100</div>
                    </div>
                  </div>
                  <div>
                    <strong className="text-violet-300 block mb-0.5">Gancho (Primeiros 30s):</strong>
                    <p className="text-slate-300">{ytEvaluation.hookFeedback}</p>
                  </div>
                  <div>
                    <strong className="text-cyan-300 block mb-0.5">Didática & Ritmo:</strong>
                    <p className="text-slate-300">{ytEvaluation.communicationFeedback}</p>
                  </div>
                  {ytEvaluation.gaps.length > 0 && (
                    <div>
                      <div className="text-amber-300 font-medium mb-1">Lacunas Técnicas</div>
                      <ul className="list-disc pl-4 text-slate-300 space-y-0.5">
                        {ytEvaluation.gaps.map((g, i) => (
                          <li key={i}>{g}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-800 text-slate-200">
                    <strong className="text-emerald-300 block mb-0.5">Próximo Passo:</strong>
                    {ytEvaluation.nextStep}
                  </div>
                </div>
              )}

              {/* Text Evaluation Output */}
              {evaluation && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Nota Feynman</span>
                    <span className={`text-base font-bold ${evaluation.score >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {evaluation.score}/100
                    </span>
                  </div>
                  {evaluation.strengths.length > 0 && (
                    <ul className="list-disc pl-4 text-emerald-200/90 space-y-0.5">
                      {evaluation.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                  {evaluation.gaps.length > 0 && (
                    <div>
                      <div className="text-amber-300 font-medium mb-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Lacunas
                      </div>
                      <ul className="list-disc pl-4 text-slate-300 space-y-0.5">
                        {evaluation.gaps.map((g, i) => (
                          <li key={i}>{g}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-800 text-slate-200">
                    <strong className="text-cyan-300 block mb-0.5">Versão Lapidada:</strong>
                    {evaluation.correctedExplanation}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: PLANEJADOR COM ROTINA + CHECKLIST + GOOGLE AGENDA */}
      {subTab === 'planner' && (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-100">Perguntas da sua Rotina</div>
              <p className="text-xs text-slate-400">
                A IA equilibra revisões pendentes com estudo novo programado e gera seu checklist diário.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Próxima prova / meta da semana</label>
                <input
                  type="text"
                  placeholder="Ex: Prova de Cálculo sexta / Avançar Grafos"
                  value={examGoal}
                  onChange={(e) => setExamGoal(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Melhor horário para estudar</label>
                <input
                  type="text"
                  value={preferredTime}
                  onChange={(e) => setPreferredTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Foco do Planejamento</label>
                <select
                  value={focusBalance}
                  onChange={(e) => setFocusBalance(e.target.value as RoutineConfig['focusBalance'])}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100"
                >
                  <option value="balanced">Equilibrado (70% Avanço Novo / 30% Revisão)</option>
                  <option value="advance">Foco em Conteúdo Novo</option>
                  <option value="catchup">Zerar Pendências e Recuperações</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-400 mr-1">Tempo disponível hoje:</span>
                {[25, 45, 60, 90, 120].map((m) => (
                  <button
                    key={m}
                    onClick={() => setAvailableMin(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                      availableMin === m
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
              <button
                onClick={handleGeneratePlan}
                disabled={loadingPlan}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                {loadingPlan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Gerar Planejamento & Checklist
              </button>
            </div>
          </div>

          {plan?.summary && (
            <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-xs text-cyan-100">
              {plan.summary}
            </div>
          )}

          {/* Persistent Checklist + Google Calendar export */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                Checklist de Estudo ({checklist.filter((c) => c.completed).length}/{checklist.length} concluídos)
              </h3>
            </div>
            {checklist.length === 0 ? (
              <p className="text-xs text-slate-400">
                Clique em "Gerar Planejamento & Checklist" acima para montar seus blocos de hoje.
              </p>
            ) : (
              <div className="space-y-2">
                {checklist.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      item.completed
                        ? 'bg-slate-950/40 border-slate-800/60 opacity-65'
                        : 'bg-slate-950/90 border-slate-800'
                    }`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={Boolean(item.completed)}
                        onChange={() => handleToggleChecklist(item.id)}
                        className="mt-1 rounded border-slate-700 bg-slate-900 text-cyan-500"
                      />
                      <div className="space-y-0.5">
                        <div className={`text-sm font-medium ${item.completed ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                          {item.title}
                        </div>
                        <div className="text-xs text-slate-400">
                          <span className="text-cyan-300">{item.subject_name}</span> · {item.duration_min} min · {item.reason}
                        </div>
                      </div>
                    </label>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={buildGoogleCalendarUrl(item)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-700 text-slate-200 hover:border-cyan-500/40 hover:text-cyan-300"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        Google Agenda
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeleteChecklist(item.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400"
                        title="Remover item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 3: CALIBRAÇÃO COGNITIVA */}
      {subTab === 'calibration' && profile && (
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-5 max-w-2xl">
          <div>
            <h3 className="text-base font-semibold text-slate-100">Calibração Cognitiva</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Ajusta automaticamente os blocos do Planejador, o estilo das aulas do Professor e o suporte em inglês.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-300 block mb-1.5">Duração ideal de bloco (min)</label>
              <select
                value={profile.preferred_block_min}
                onChange={(e) => handleSaveProfile({ preferred_block_min: Number(e.target.value) })}
                disabled={savingProfile}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100"
              >
                {[15, 25, 35, 45, 60].map((v) => (
                  <option key={v} value={v}>
                    {v} minutos
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-300 block mb-1.5">Nível de Inglês Técnico</label>
              <select
                value={profile.english_level}
                onChange={(e) =>
                  handleSaveProfile({ english_level: e.target.value as LearningProfile['english_level'] })
                }
                disabled={savingProfile}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100"
              >
                <option value="beginner">Iniciante (mais suporte em PT-BR)</option>
                <option value="intermediate">Intermediário (termos técnicos bilíngues)</option>
                <option value="advanced">Avançado (imersão técnica)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-2">
            <label className="flex items-center gap-2.5 text-sm text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(profile.visual_preference)}
                onChange={(e) => handleSaveProfile({ visual_preference: e.target.checked ? 1 : 0 })}
                className="rounded border-slate-700 bg-slate-950 text-cyan-500"
              />
              Preferir diagramas visuais (Mermaid)
            </label>

            <label className="flex items-center gap-2.5 text-sm text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(profile.frequent_questions)}
                onChange={(e) => handleSaveProfile({ frequent_questions: e.target.checked ? 1 : 0 })}
                className="rounded border-slate-700 bg-slate-950 text-cyan-500"
              />
              Checkpoints frequentes (Active Recall)
            </label>
          </div>
        </div>
      )}
    </div>
  );
};
