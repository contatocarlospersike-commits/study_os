import { useEffect, useState } from 'react';
import { BookOpen, FileText, Lightbulb, Plus, Save, Sparkles } from 'lucide-react';
import { api } from '../api/client';
import type { Subject, SubjectDetail } from '../types';

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
    api.getSubject(target).then((d) => {
      setDetail(d);
      setNotesDraft(d.notes_markdown);
      setTranscriptDraft(d.transcript_markdown);
    });
  }, [selectedId, subjects]);

  const handleSaveNotes = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.updateSubject(detail.id, {
        notes_markdown: notesDraft,
        transcript_markdown: transcriptDraft,
      });
      await onRefreshSubjects();
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 2000);
    } finally {
      setSaving(false);
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
      subtopic: conceptSubtopic.trim() || 'General',
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
            Knowledge Architecture
          </p>
          <h1 className="heading-fluid font-bold text-zinc-50">Subject Hubs</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowNewSubject((v) => !v)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-white"
        >
          <Plus className="h-4 w-4" />
          New Subject
        </button>
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
            placeholder="Subject Name (e.g. Linear Algebra)"
            className="min-h-[44px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
          />
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Short description"
            className="min-h-[44px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 sm:col-span-2"
          />
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Subject color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-11 w-12 cursor-pointer rounded-lg border border-zinc-700 bg-zinc-950 p-1"
            />
            <button
              type="submit"
              className="min-h-[44px] flex-1 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-cyan-400"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {/* Horizontal swipeable subject selector */}
      <div className="swipe-deck" role="region" aria-label="Subjects">
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
            { id: 'notes', label: 'Markdown Notes' },
            { id: 'transcript', label: 'Transcript' },
            { id: 'concepts', label: 'Feynman Concepts' },
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
          {/* Left Pane (Desktop Deep Work Markdown + Transcript Editor) */}
          <div className="space-y-4 lg:col-span-7">
            <div
              className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 ${
                mobileTab === 'notes' ? 'block' : 'hidden lg:block'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <BookOpen className="h-4 w-4 text-cyan-400" />
                  Markdown Notes
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveNotes}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-cyan-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-cyan-400"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savedToast ? 'Saved!' : saving ? 'Saving...' : 'Save Hub'}
                </button>
              </div>
              <textarea
                aria-label="Subject Markdown Notes"
                rows={12}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm leading-relaxed text-zinc-100 focus:border-cyan-500"
                placeholder="# Core concepts, equations, mental models..."
              />
            </div>

            <div
              className={`rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 ${
                mobileTab === 'transcript' ? 'block' : 'hidden lg:block'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <FileText className="h-4 w-4 text-violet-400" />
                  Lecture / Audio Transcript
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveNotes}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-700 lg:hidden"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save
                </button>
              </div>
              <textarea
                aria-label="Lecture Transcript"
                rows={7}
                value={transcriptDraft}
                onChange={(e) => setTranscriptDraft(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-200 focus:border-violet-500"
                placeholder="[00:00] Paste lecture transcript or study synthesis..."
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
                Add Core Concept + Auto-Flashcard
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={conceptSubtopic}
                  onChange={(e) => setConceptSubtopic(e.target.value)}
                  placeholder="Sub-topic (e.g. Limits)"
                  className="min-h-[42px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                />
                <input
                  type="text"
                  required
                  value={conceptTitle}
                  onChange={(e) => setConceptTitle(e.target.value)}
                  placeholder="Concept Title"
                  className="min-h-[42px] rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                />
              </div>
              <textarea
                required
                rows={2}
                value={conceptSummary}
                onChange={(e) => setConceptSummary(e.target.value)}
                placeholder="Formal definition / core rule..."
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100"
              />
              <textarea
                rows={2}
                value={conceptFeynman}
                onChange={(e) => setConceptFeynman(e.target.value)}
                placeholder="Feynman Technique: Explain it simply to a 12-year-old..."
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-100"
              />
              <button
                type="submit"
                className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                <Plus className="h-4 w-4" />
                Save Concept & Generate SR Card
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
                        Feynman Analogy
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
    </div>
  );
}
