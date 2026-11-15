import { useEffect, useMemo, useState } from 'react';
import { BookOpen, FileText, GitBranch, Lightbulb, Link2, Loader2, Plus, Save, Sparkles, X } from 'lucide-react';
import { api } from '../api/client';
import type { GraphData, Subject, SubjectDetail } from '../types';

interface SubjectHubProps {
  subjects: Subject[];
  initialSubjectId?: string;
  onRefreshSubjects: () => Promise<void>;
}

export function SubjectHub({ subjects, initialSubjectId, onRefreshSubjects }: SubjectHubProps) {
  const [selectedId, setSelectedId] = useState<string>(initialSubjectId || subjects[0]?.id || '');
  const [detail, setDetail] = useState<SubjectDetail | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [mobileTab, setMobileTab] = useState<'notes' | 'transcript' | 'concepts'>('notes');

  // Obsidian [[wikilink]] autocomplete & AI suggestions
  const [wikiQuery, setWikiQuery] = useState<string | null>(null);
  const [suggestingLinks, setSuggestingLinks] = useState(false);
  const [linkSuggestions, setLinkSuggestions] = useState<
    Array<{ label: string; reason: string; targetSubject: string }>
  >([]);

  // Knowledge Graph Modal
  const [showGraph, setShowGraph] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);

  // Create Subject state
  const [showNewSubject, setShowNewSubject] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('#22d3ee');

  // Add Concept (Feynman breakdown) state
  const [conceptSubtopic, setConceptSubtopic] = useState('');
  const [conceptTitle, setConceptTitle] = useState('');
  const [conceptSummary, setConceptSummary] = useState('');
  const [conceptFeynman, setConceptFeynman] = useState('');

  useEffect(() => {
    if (initialSubjectId) setSelectedId(initialSubjectId);
  }, [initialSubjectId]);

  useEffect(() => {
    const target = selectedId || subjects[0]?.id;
    if (!target) return;
    setLinkSuggestions([]);
    api.getSubject(target).then((d) => {
      setDetail(d);
      setNotesDraft(d.notes_markdown);
      setTranscriptDraft(d.transcript_markdown);
    });
  }, [selectedId, subjects]);

  const handleNotesChange = (value: string) => {
    setNotesDraft(value);
    const match = value.match(/\[\[([^\[\]\n]*)$/);
    setWikiQuery(match ? match[1] : null);
  };

  const wikiCandidates = useMemo(() => {
    if (wikiQuery === null) return [];
    const q = wikiQuery.toLowerCase();
    return subjects.filter((s) => s.id !== detail?.id && s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [wikiQuery, subjects, detail?.id]);

  const insertWikiLink = (label: string) => {
    const next = notesDraft.replace(/\[\[([^\[\]\n]*)$/, `[[${label}]]`);
    setNotesDraft(next);
    setWikiQuery(null);
  };

  const appendWikiChip = (label: string) => {
    const spacer = notesDraft.endsWith('\n') || !notesDraft ? '' : '\n';
    setNotesDraft(`${notesDraft}${spacer}Conectado com [[${label}]]`);
  };

  const handleSaveNotes = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.updateSubject(detail.id, {
        notes_markdown: notesDraft,
        transcript_markdown: transcriptDraft,
      });
      const refreshed = await api.getSubject(detail.id);
      setDetail(refreshed);
      await onRefreshSubjects();
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleSuggestLinks = async () => {
    if (!detail) return;
    setSuggestingLinks(true);
    try {
      const res = await api.suggestNoteLinks(detail.id);
      setLinkSuggestions(res.suggestions);
    } catch {
      setLinkSuggestions([]);
    } finally {
      setSuggestingLinks(false);
    }
  };

  const handleOpenGraph = async () => {
    setShowGraph(true);
    setLoadingGraph(true);
    try {
      const g = await api.getGraph();
      setGraphData(g);
    } finally {
      setLoadingGraph(false);
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const created = await api.createSubject({
      name: newName.trim(),
      description: newDesc.trim(),
      color: newColor,
    });
    setNewName('');
    setNewDesc('');
    setShowNewSubject(false);
    await onRefreshSubjects();
    setSelectedId(created.id);
  };

  const handleAddConcept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !conceptTitle.trim() || !conceptSummary.trim()) return;
    await api.createConcept(detail.id, {
      subtopic: conceptSubtopic.trim() || 'Geral',
      title: conceptTitle.trim(),
      summary: conceptSummary.trim(),
      feynman_explanation: conceptFeynman.trim(),
    });
    setConceptSubtopic('');
    setConceptTitle('');
    setConceptSummary('');
    setConceptFeynman('');
    const refreshed = await api.getSubject(detail.id);
    setDetail(refreshed);
    await onRefreshSubjects();
  };

  // Circular layout for SVG Knowledge Graph
  const graphNodes = useMemo(() => {
    if (!graphData) return [];
    const count = Math.max(1, graphData.subjects.length);
    const cx = 280;
    const cy = 175;
    const r = count === 1 ? 0 : 120;
    return graphData.subjects.map((s, idx) => {
      const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
      return {
        ...s,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      };
    });
  }, [graphData]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
            Arquitetura de Conhecimento
          </p>
          <h1 className="heading-fluid font-bold text-zinc-50">Matérias & Notas</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenGraph}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2 text-sm font-medium text-zinc-200 hover:border-cyan-500/40 hover:text-cyan-300"
          >
            <GitBranch className="h-4 w-4 text-cyan-400" />
            Mapa de Conexões
          </button>
          <button
            type="button"
            onClick={() => setShowNewSubject((v) => !v)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white"
          >
            <Plus className="h-4 w-4" />
            Nova Matéria
          </button>
        </div>
      </div>

      {showNewSubject && (
        <form
          onSubmit={handleCreateSubject}
          className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:grid-cols-4"
        >
          <input
            type="text"
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome da Matéria (ex: Álgebra Linear)"
            className="min-h-[44px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Descrição curta"
            className="min-h-[44px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 sm:col-span-2"
          />
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Cor da matéria"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-11 w-12 cursor-pointer rounded-lg border border-zinc-700 bg-zinc-950 p-1"
            />
            <button
              type="submit"
              className="min-h-[44px] flex-1 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-cyan-400"
            >
              Criar
            </button>
          </div>
        </form>
      )}

      {/* Horizontal swipeable subject selector */}
      <div className="swipe-deck" role="region" aria-label="Matérias">
        {subjects.map((s) => {
          const active = s.id === (detail?.id || selectedId);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedId(s.id)}
              className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium ${
                active
                  ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200'
                  : 'border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </button>
          );
        })}
      </div>

      {/* Mobile View Switcher */}
      <div className="flex gap-2 lg:hidden">
        {(
          [
            { id: 'notes', label: 'Notas [[Link]]' },
            { id: 'transcript', label: 'Transcrição' },
            { id: 'concepts', label: 'Conceitos Feynman' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileTab(tab.id)}
            className={`min-h-[40px] flex-1 rounded-xl px-3 text-xs font-semibold ${
              mobileTab === tab.id
                ? 'bg-cyan-500 text-zinc-950'
                : 'border border-zinc-800 bg-zinc-900 text-zinc-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {detail && (
        <div className="grid gap-5 lg:grid-cols-12">
          {/* Left Pane (Markdown + [[Wikilinks]] + Backlinks + Transcript) */}
          <div className="space-y-4 lg:col-span-7">
            <div
              className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 ${
                mobileTab === 'notes' ? 'block' : 'hidden lg:block'
              }`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <BookOpen className="h-4 w-4 text-cyan-400" />
                  Notas em Markdown (use [[Matéria]] para conectar)
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={suggestingLinks}
                    onClick={handleSuggestLinks}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
                  >
                    {suggestingLinks ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Sugerir Conexões
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveNotes}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-cyan-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-cyan-400"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {savedToast ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar Hub'}
                  </button>
                </div>
              </div>

              <textarea
                aria-label="Notas em Markdown da Matéria"
                rows={12}
                value={notesDraft}
                onChange={(e) => handleNotesChange(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm leading-relaxed text-zinc-100 focus:border-cyan-500"
                placeholder="# Conceitos-chave, equações, modelos mentais... Digite [[ para conectar com outra matéria!"
              />

              {/* [[ Autocomplete bar */}
              {wikiQuery !== null && wikiCandidates.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-zinc-950 p-2">
                  <span className="text-[11px] text-cyan-300 font-medium px-1">Conectar com:</span>
                  {wikiCandidates.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => insertWikiLink(c.name)}
                      className="rounded-lg bg-zinc-800 px-2.5 py-1 text-xs text-zinc-100 hover:bg-cyan-500/20 hover:text-cyan-200"
                    >
                      [[{c.name}]]
                    </button>
                  ))}
                </div>
              )}

              {/* AI Suggested Connections */}
              {linkSuggestions.length > 0 && (
                <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 space-y-2">
                  <div className="text-xs font-medium text-cyan-300">Conexões sugeridas pela IA:</div>
                  <div className="flex flex-wrap gap-2">
                    {linkSuggestions.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => appendWikiChip(s.targetSubject || s.label)}
                        title={s.reason}
                        className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200 hover:bg-cyan-500/20"
                      >
                        <Plus className="h-3 w-3" />
                        [[{s.targetSubject || s.label}]] — {s.reason}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Backlinks Panel */}
              {detail.backlinks && detail.backlinks.length > 0 && (
                <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 mb-2">
                    <Link2 className="h-3.5 w-3.5 text-cyan-400" />
                    Backlinks ({detail.backlinks.length} matérias mencionam esta)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detail.backlinks.map((bl) => (
                      <button
                        key={bl.id}
                        type="button"
                        onClick={() => setSelectedId(bl.source_subject_id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 hover:border-cyan-500/40"
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: bl.source_subject_color }}
                        />
                        {bl.source_subject_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div
              className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 ${
                mobileTab === 'transcript' ? 'block' : 'hidden lg:block'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <FileText className="h-4 w-4 text-violet-400" />
                  Transcrição de Aula / Áudio
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveNotes}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-700 lg:hidden"
                >
                  <Save className="h-3.5 w-3.5" />
                  Salvar
                </button>
              </div>
              <textarea
                aria-label="Transcrição da Aula"
                rows={7}
                value={transcriptDraft}
                onChange={(e) => setTranscriptDraft(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-200 focus:border-violet-500"
                placeholder="[00:00] Cole aqui a transcrição da aula ou síntese de estudo..."
              />
            </div>
          </div>

          {/* Right Pane: Core Conceptual Breakdown & Feynman Technique */}
          <div
            className={`space-y-4 lg:col-span-5 ${
              mobileTab === 'concepts' ? 'block' : 'hidden lg:block'
            }`}
          >
            <form
              onSubmit={handleAddConcept}
              className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                Novo Conceito + Auto-Flashcard
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={conceptSubtopic}
                  onChange={(e) => setConceptSubtopic(e.target.value)}
                  placeholder="Subtópico (ex: Limites)"
                  className="min-h-[42px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                />
                <input
                  type="text"
                  required
                  value={conceptTitle}
                  onChange={(e) => setConceptTitle(e.target.value)}
                  placeholder="Título do Conceito"
                  className="min-h-[42px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                />
              </div>
              <textarea
                required
                rows={2}
                value={conceptSummary}
                onChange={(e) => setConceptSummary(e.target.value)}
                placeholder="Definição formal / regra central..."
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100"
              />
              <textarea
                rows={2}
                value={conceptFeynman}
                onChange={(e) => setConceptFeynman(e.target.value)}
                placeholder="Técnica Feynman: explique de forma simples..."
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100"
              />
              <button
                type="submit"
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                <Plus className="h-4 w-4" />
                Salvar Conceito & Gerar Card SM-2
              </button>
            </form>

            <div className="space-y-3">
              {detail.concepts.map((c) => (
                <article
                  key={c.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-zinc-100">{c.title}</h3>
                    <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-300">
                      {c.subtopic}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">{c.summary}</p>
                  {c.feynman_explanation && (
                    <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                        <Lightbulb className="h-3.5 w-3.5" />
                        Analogia Feynman
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-emerald-100/90">
                        {c.feynman_explanation}
                      </p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Knowledge Graph Modal */}
      {showGraph && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-semibold text-zinc-100">
                <GitBranch className="w-5 h-5 text-cyan-400" />
                Mapa de Conexões (Grafo Obsidian)
              </div>
              <button
                type="button"
                onClick={() => setShowGraph(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {loadingGraph ? (
              <div className="py-16 text-center text-sm text-zinc-400">Construindo grafo...</div>
            ) : (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2 overflow-hidden">
                <svg viewBox="0 0 560 350" className="w-full h-auto">
                  {graphData?.links.map((link) => {
                    const src = graphNodes.find((n) => n.id === link.source_subject_id);
                    const dst = graphNodes.find((n) => n.id === link.target_subject_id);
                    if (!src || !dst) return null;
                    return (
                      <line
                        key={link.id}
                        x1={src.x}
                        y1={src.y}
                        x2={dst.x}
                        y2={dst.y}
                        stroke="#22d3ee"
                        strokeOpacity="0.35"
                        strokeWidth="2"
                      />
                    );
                  })}
                  {graphNodes.map((node) => (
                    <g
                      key={node.id}
                      onClick={() => {
                        setSelectedId(node.id);
                        setShowGraph(false);
                      }}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={16}
                        fill={node.color || '#22d3ee'}
                        fillOpacity={0.22}
                        stroke={node.color || '#22d3ee'}
                        strokeWidth={2}
                      />
                      <text
                        x={node.x}
                        y={node.y + 30}
                        textAnchor="middle"
                        fill="#e4e4e7"
                        fontSize="11"
                        fontWeight="600"
                      >
                        {node.name}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            )}

            <p className="text-xs text-zinc-400">
              Dica: escreva <code className="text-cyan-300">[[Nome da Matéria]]</code> dentro de qualquer nota e clique em <strong>Salvar Hub</strong> para criar arestas no grafo. Clique em um nó para abrir a matéria.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
