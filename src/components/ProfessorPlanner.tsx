import React, { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';
import {
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Sliders,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  DailyPlanResponse,
  LearningProfile,
  ProfessorEvaluation,
  ProfessorLesson,
  Subject,
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

interface ProfessorPlannerProps {
  subjects: Subject[];
  onNotify: (title: string, msg: string) => void;
}

export const ProfessorPlanner: React.FC<ProfessorPlannerProps> = ({ subjects, onNotify }) => {
  const [subTab, setSubTab] = useState<'professor' | 'planner' | 'calibration'>('professor');

  // Professor Feynman
  const [subjectId, setSubjectId] = useState<string>(subjects[0]?.id ?? '');
  const [topic, setTopic] = useState('');
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [lesson, setLesson] = useState<ProfessorLesson | null>(null);
  const [explanation, setExplanation] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<ProfessorEvaluation | null>(null);

  // Daily Planner
  const [availableMin, setAvailableMin] = useState(45);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [plan, setPlan] = useState<DailyPlanResponse | null>(null);

  // Calibration
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (!subjectId && subjects[0]?.id) setSubjectId(subjects[0].id);
  }, [subjects, subjectId]);

  useEffect(() => {
    api
      .getLearningProfile()
      .then(setProfile)
      .catch(() => {});
  }, []);

  const handleGenerateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !topic.trim()) return;
    setLoadingLesson(true);
    setLesson(null);
    setEvaluation(null);
    try {
      const res = await api.generateProfessorLesson({ subject_id: subjectId, topic: topic.trim() });
      setLesson(res);
    } catch (err) {
      onNotify('Erro no Modo Professor', (err as Error).message);
    } finally {
      setLoadingLesson(false);
    }
  };

  const handleEvaluate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !topic.trim() || !explanation.trim()) return;
    setEvaluating(true);
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

  const handleGeneratePlan = async () => {
    setLoadingPlan(true);
    try {
      const res = await api.generateDailyPlan({ available_minutes: availableMin });
      setPlan(res);
    } catch (err) {
      onNotify('Erro no Planejador', (err as Error).message);
    } finally {
      setLoadingPlan(false);
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
            Professor & Planejador Cognitivo
          </h2>
          <p className="text-sm text-slate-400">
            Aprenda com analogias + método Feynman, monte seu plano pelo tempo livre e calibre seu perfil.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          {[
            { id: 'professor', label: 'Carlos Professor', icon: BrainCircuit },
            { id: 'planner', label: 'Planejador Hoje', icon: CalendarClock },
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

      {/* SUBTAB 1: MODO CARLOS PROFESSOR */}
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
              placeholder="Qual tópico quer dominar? (ex: Árvore B+, Pipeline RISC, 3ª Forma Normal)"
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
              Gerar Mini-Aula
            </button>
          </form>

          {lesson && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Lesson Card */}
              <div className="lg:col-span-7 p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
                <h3 className="text-lg font-semibold text-slate-100">{lesson.title}</h3>
                <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-xs text-cyan-100 leading-relaxed">
                  <strong className="block text-cyan-300 mb-1">Analogia do Mundo Real:</strong>
                  {lesson.analogy}
                </div>
                <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {lesson.coreExplanation}
                </div>
                {lesson.mermaidDiagram && (
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1.5">Mapa Visual</div>
                    <MermaidDiagram chart={lesson.mermaidDiagram} />
                  </div>
                )}
                {lesson.englishTermTip && (
                  <div className="text-xs text-slate-400 border-t border-slate-800 pt-3">
                    <strong className="text-slate-300">Termo em Inglês:</strong> {lesson.englishTermTip}
                  </div>
                )}
              </div>

              {/* Feynman Teach-Back */}
              <div className="lg:col-span-5 p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold">
                    Teste Feynman (Sua vez de ensinar)
                  </span>
                  <p className="text-sm text-slate-200 mt-1 font-medium">{lesson.checkpointQuestion}</p>
                </div>

                <form onSubmit={handleEvaluate} className="space-y-3">
                  <textarea
                    rows={6}
                    placeholder="Explique com suas próprias palavras como se estivesse ensinando um colega..."
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100"
                    required
                  />
                  <button
                    type="submit"
                    disabled={evaluating || !explanation.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Avaliar Minha Explicação
                  </button>
                </form>

                {evaluation && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-medium">Nota de Clareza & Precisão</span>
                      <span
                        className={`text-base font-bold ${
                          evaluation.score >= 70 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {evaluation.score}/100
                      </span>
                    </div>
                    {evaluation.strengths.length > 0 && (
                      <div>
                        <div className="text-emerald-300 font-medium mb-1">Pontos Fortes</div>
                        <ul className="list-disc pl-4 text-slate-300 space-y-0.5">
                          {evaluation.strengths.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {evaluation.gaps.length > 0 && (
                      <div>
                        <div className="text-amber-300 font-medium mb-1 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Lacunas Detectadas
                        </div>
                        <ul className="list-disc pl-4 text-slate-300 space-y-0.5">
                          {evaluation.gaps.map((g, i) => (
                            <li key={i}>{g}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-800 text-slate-200 leading-relaxed">
                      <strong className="text-cyan-300 block mb-0.5">Versão Lapidada:</strong>
                      {evaluation.correctedExplanation}
                    </div>
                    <div className="text-slate-400">
                      <strong className="text-slate-200">Próximo passo:</strong> {evaluation.nextStep}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 2: PLANEJADOR DIÁRIO */}
      {subTab === 'planner' && (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium text-slate-100">Quanto tempo livre você tem agora?</div>
              <p className="text-xs text-slate-400">
                A IA prioriza revisões SM-2 atrasadas, planos de recuperação pendentes e seu bloco ideal.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[15, 25, 45, 60, 90, 120].map((m) => (
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
              <button
                onClick={handleGeneratePlan}
                disabled={loadingPlan}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
              >
                {loadingPlan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Montar Plano
              </button>
            </div>
          </div>

          {plan && (
            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-200">{plan.summary}</p>
                <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  {plan.availableMinutes} min · blocos de ~{plan.recommendedBlockMin} min
                </span>
              </div>
              <div className="space-y-2.5">
                {plan.blocks.map((block) => (
                  <div
                    key={block.order}
                    className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-cyan-400">#{block.order}</span>
                        <span className="text-sm font-medium text-slate-100">{block.title}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                          {block.subjectName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{block.reason}</p>
                    </div>
                    <div className="text-xs font-semibold text-emerald-300 shrink-0">{block.durationMin} min</div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
