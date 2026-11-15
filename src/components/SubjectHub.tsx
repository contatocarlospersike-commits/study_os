import { useEffect, useMemo, useState } from 'react';
import {
  Eye,
  FileText,
  FileUp,
  GitBranch,
  Lightbulb,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type { GraphData, Material, Subject, SubjectDetail } from '../types';

interface SubjectHubProps {
  subjects: Subject[];
  initialSubjectId?: string;
  onRefreshSubjects: () => Promise<void>;
}

function RichNotesRenderer({
  markdown,
  subjects,
  onOpenSubject,
}: {
  markdown: string;
  subjects: Subject[];
  onOpenSubject: (id: string) => void;
}) {
  if (!markdown.trim()) {
    return (
      <div className="py-10 text-center text-sm text-zinc-500">
        Nenhuma nota escrita ainda. Clique em <strong>Editar</strong> para começar suas anotações.
      </div>
    );
  }

  const renderInline = (line: string) => {
    const parts = line.split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('[[') && part.endsWith(']]')) {
        const label = part.slice(2, -2).trim();
        const match = subjects.find((s) => s.name.toLowerCase() === label.toLowerCase());
        return (
          <button
            key={i}
            type="button"
            onClick={() => match && onOpenSubject(match.id)}
            className={`mx-0.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
              match
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 cursor-pointer'
                : 'bg-zinc-800 text-zinc-300 border border-zinc-700'
            }`}
          >
            <Link2 className="h-3 w-3" />
            {label}
          </button>
        );
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-zinc-50">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-zinc-200">
      {markdown.split('\n').map((raw, idx) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={idx} className="h-1.5" />;
        if (line.startsWith('### ')) {
          return (
            <h4 key={idx} className="pt-2 text-sm font-semibold text-cyan-300">
              {renderInline(line.slice(4))}
            </h4>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h3 key={idx} className="pt-3 text-base font-semibold text-zinc-100 border-b border-zinc-800/80 pb-1">
              {renderInline(line.slice(3))}
            </h3>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h2 key={idx} className="pt-1 text-lg font-bold text-zinc-50">
              {renderInline(line.slice(2))}
            </h2>
          );
        }
        if (/^\s*[-*]\s+/.test(line)) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
              <div>{renderInline(line.replace(/^\s*[-*]\s+/, ''))}</div>
            </div>
          );
        }
        if (/^\s*\d+\.\s+/.test(line)) {
          const num = line.match(/^\s*(\d+)\./)?.[1];
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="font-semibold text-cyan-400 text-xs mt-0.5">{num}.</span>
              <div>{renderInline(line.replace(/^\s*\d+\.\s+/, ''))}</div>
            </div>
          );
        }
        return <p key={idx}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

export function SubjectHub({ subjects, initialSubjectId, onRefreshSubjects }: SubjectHubProps) {
  const [selectedId, setSelectedId] = useState<string>(initialSubjectId || subjects[0]?.id || '');
  const [detail, setDetail] = useState<SubjectDetail | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesMode, setNotesMode] = useState<'preview' | 'edit'>('preview');
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [mobileTab, setMobileTab] = useState<'notes' | 'materials' | 'concepts'>('notes');

  // Direct Material Upload inside Subject
  const [matTitle, setMatTitle] = useState('');
  const [matText, setMatText] = useState('');
  const [matPdfBase64, setMatPdfBase64] = useState<string | undefined>();
  const [matFileName, setMatFileName] = useState('');
  const [matAutoGenerate, setMatAutoGenerate] = useState(false);
  const [uploadingMat, setUploadingMat] = useState(false);
  const [matFeedback, setMatFeedback] = useState('');

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
    const target = selectedId && subjects.some((s) => s.id === selectedId) ? selectedId : subjects[0]?.id;
    if (!target) {
      setDetail(null);
      setMaterials([]);
      return;
    }
    if (target !== selectedId) setSelectedId(target);
    setLinkSuggestions([]);
    setMatFeedback('');
    Promise.all([api.getSubject(target), api.getMaterials(target)]).then(([d, mats]) => {
      setDetail(d);
      setNotesDraft(d.notes_markdown);
      setTranscriptDraft(d.transcript_markdown);
      setNotesMode(d.notes_markdown.trim() ? 'preview' : 'edit');
      setMaterials(mats);
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
    setNotesMode('edit');
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
      setNotesMode('preview');
      setTimeout(() => setSavedToast(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubject = async () => {
    if (!detail) return;
    if (!window.confirm(`Excluir a matéria "${detail.name}" e todas as suas notas/conceitos?`)) return;
    await api.deleteSubject(detail.id);
    setSelectedId('');
    await onRefreshSubjects();
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMatFileName(file.name);
    if (!matTitle) setMatTitle(file.name.replace(/\.pdf$/i, ''));
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setMatPdfBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !matTitle.trim() || (!matText.trim() && !matPdfBase64)) return;
    setUploadingMat(true);
    setMatFeedback('');
    try {
      if (matAutoGenerate) {
        const res = await api.triageInbox({
          title: matTitle.trim(),
          subject_id: detail.id,
          file_type: matPdfBase64 ? 'pdf' : 'text',
          content_base64: matPdfBase64,
          text_content: matText.trim() || undefined,
        });
        setMatFeedback(
          `Indexado no Tutor IA + ${res.createdConcepts} conceitos e ${res.createdFlashcards} flashcards gerados!`
        );
      } else {
        await api.ingestMaterial({
          title: matTitle.trim(),
          subject_id: detail.id,
          file_type: matPdfBase64 ? 'pdf' : 'text',
          content_base64: matPdfBase64,
          text_content: matText.trim() || undefined,
        });
        setMatFeedback('Material indexado no Tutor IA com sucesso!');
      }
      setMatTitle('');
      setMatText('');
      setMatPdfBase64(undefined);
      setMatFileName('');
      const [refreshed, mats] = await Promise.all([api.getSubject(detail.id), api.getMaterials(detail.id)]);
      setDetail(refreshed);
      setMaterials(mats);
      await onRefreshSubjects();
    } catch (err) {
      setMatFeedback(`Erro: ${(err as Error).message}`);
    } finally {
      setUploadingMat(false);
    }
  };

  const handleDeleteMaterial = async (matId: string) => {
    if (!detail) return;
    await api.deleteMaterial(matId);
    const mats = await api.getMaterials(detail.id);
    setMaterials(mats);
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
          <h1 className="heading-fluid font-bold text-zinc-50">Matérias, Materiais & Notas</h1>
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

      {subjects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-10 text-center space-y-3">
          <p className="text-base font-semibold text-zinc-100">Você ainda não tem matérias cadastradas.</p>
          <p className="text-sm text-zinc-400">
            Crie sua primeira matéria da faculdade acima para subir PDFs, fazer anotações e usar o Tutor IA.
          </p>
          <button
            type="button"
            onClick={() => setShowNewSubject(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-400"
          >
            <Plus className="h-4 w-4" />
            Criar Primeira Matéria
          </button>
        </div>
      ) : (
        <>
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
                { id: 'notes', label: 'Notas' },
                { id: 'materials', label: 'Materiais/PDF' },
                { id: 'concepts', label: 'Conceitos' },
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
              {/* Left Pane: Rich Obsidian Notes + Direct Materials Upload */}
              <div className="space-y-4 lg:col-span-7">
                {/* Clean Obsidian Notes Card */}
                <div
                  className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4 ${
                    mobileTab === 'notes' ? 'block' : 'hidden lg:block'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: detail.color }} />
                      <h2 className="text-base font-semibold text-zinc-100">{detail.name}</h2>
                      <button
                        type="button"
                        onClick={handleDeleteSubject}
                        title="Excluir matéria"
                        className="rounded-lg p-1 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
                        <button
                          type="button"
                          onClick={() => setNotesMode('preview')}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                            notesMode === 'preview' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400'
                          }`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ler
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotesMode('edit')}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                            notesMode === 'edit' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400'
                          }`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editar
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={suggestingLinks}
                        onClick={handleSuggestLinks}
                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 disabled:opacity-50"
                      >
                        {suggestingLinks ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        Conectar (IA)
                      </button>

                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleSaveNotes}
                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-cyan-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-cyan-400"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {savedToast ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>

                  {notesMode === 'preview' ? (
                    <div
                      onDoubleClick={() => setNotesMode('edit')}
                      className="min-h-[220px] rounded-xl bg-zinc-950/50 p-4 border border-zinc-800/60"
                    >
                      <RichNotesRenderer
                        markdown={notesDraft}
                        subjects={subjects}
                        onOpenSubject={(id) => setSelectedId(id)}
                      />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: 'Título', insert: '\n## Novo Tópico\n' },
                          { label: 'Negrito', insert: '**texto**' },
                          { label: 'Lista', insert: '\n- Item' },
                          { label: '+ [[Conexão]]', insert: ' [[' },
                        ].map((btn) => (
                          <button
                            key={btn.label}
                            type="button"
                            onClick={() => handleNotesChange(notesDraft + btn.insert)}
                            className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        aria-label="Notas da Matéria"
                        rows={11}
                        value={notesDraft}
                        onChange={(e) => handleNotesChange(e.target.value)}
                        className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3.5 text-sm leading-relaxed text-zinc-100 focus:border-cyan-500 focus:outline-none"
                        placeholder="Escreva suas anotações aqui... Use # para títulos, **negrito** e [[ para conectar com outra matéria!"
                      />
                    </div>
                  )}

                  {/* [[ Autocomplete bar */}
                  {wikiQuery !== null && wikiCandidates.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-zinc-950 p-2">
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
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 space-y-2">
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
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
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

                {/* Direct Material Upload Inside Subject */}
                <div
                  className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 space-y-4 ${
                    mobileTab === 'materials' ? 'block' : 'hidden lg:block'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                      <FileUp className="h-4 w-4 text-cyan-400" />
                      Materiais & PDFs desta Matéria ({materials.length})
                    </div>
                  </div>

                  <form onSubmit={handleUploadMaterial} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        placeholder="Título do material (ex: Slides Aula 01)"
                        value={matTitle}
                        onChange={(e) => setMatTitle(e.target.value)}
                        className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-100"
                        required
                      />
                      <label className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-700 cursor-pointer">
                        <FileText className="h-3.5 w-3.5" />
                        {matFileName ? matFileName : 'Anexar PDF'}
                        <input type="file" accept="application/pdf" onChange={handlePdfSelect} className="hidden" />
                      </label>
                    </div>

                    <textarea
                      rows={3}
                      placeholder="Ou cole o texto/resumo/transcrição da aula aqui..."
                      value={matText}
                      onChange={(e) => setMatText(e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-zinc-100"
                    />

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={matAutoGenerate}
                          onChange={(e) => setMatAutoGenerate(e.target.checked)}
                          className="rounded border-zinc-700 bg-zinc-900 text-cyan-500"
                        />
                        Também gerar Conceitos + Flashcards + Quiz automaticamente
                      </label>
                      <button
                        type="submit"
                        disabled={uploadingMat || !matTitle.trim() || (!matText.trim() && !matPdfBase64)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-cyan-400 disabled:opacity-50"
                      >
                        {uploadingMat ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                        {uploadingMat ? 'Enviando...' : 'Subir na Matéria'}
                      </button>
                    </div>

                    {matFeedback && <p className="text-xs text-emerald-300">{matFeedback}</p>}
                  </form>

                  {materials.length > 0 && (
                    <div className="space-y-2">
                      {materials.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-xs"
                        >
                          <div>
                            <span className="font-medium text-zinc-100">{m.title}</span>
                            <span className="ml-2 text-zinc-400">
                              {m.file_type.toUpperCase()} · {m.page_count} pág. · {m.chunk_count} blocos RAG
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteMaterial(m.id)}
                            className="p-1 text-zinc-500 hover:text-rose-400"
                            title="Remover material"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
        </>
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
              Dica: escreva <code className="text-cyan-300">[[Nome da Matéria]]</code> dentro de qualquer nota e clique em <strong>Salvar</strong> para criar arestas no grafo. Clique em um nó para abrir a matéria.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
