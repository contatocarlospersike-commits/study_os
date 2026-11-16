import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Bold,
  BookOpen,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Edit3,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Heading2,
  Link2,
  List,
  Loader2,
  Network,
  Palette,
  Plus,
  Quote,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { SubjectStudyPlan } from './SubjectStudyPlan';
import type {
  GraphData,
  Material,
  NavView,
  NoteDetail,
  NoteItem,
  Subject,
  SubjectDetail,
} from '../types';

interface SubjectHubProps {
  onNavigate: (view: NavView, opts?: { subjectId?: string; quizId?: string }) => void;
  onStartStudy?: (subjectId: string) => void;
}

const COVER_PRESETS: Array<{ id: string; label: string; gradient: string }> = [
  { id: 'aurora', label: 'Aurora', gradient: 'from-indigo-600/80 via-violet-600/70 to-fuchsia-600/70' },
  { id: 'ocean', label: 'Oceano', gradient: 'from-cyan-600/80 via-sky-600/70 to-blue-700/80' },
  { id: 'emerald', label: 'Esmeralda', gradient: 'from-emerald-600/80 via-teal-600/70 to-cyan-700/80' },
  { id: 'sunset', label: 'Crepúsculo', gradient: 'from-amber-500/80 via-orange-600/75 to-rose-600/80' },
  { id: 'slate', label: 'Minimal', gradient: 'from-zinc-700/90 via-zinc-800/90 to-zinc-900' },
  { id: 'crimson', label: 'Rubi', gradient: 'from-rose-600/80 via-pink-600/70 to-purple-700/80' },
];

const ICON_PRESETS = ['📚', '🧠', '💻', '⚗️', '📐', '⚖️', '🧬', '🚀', '📝', '🎯', '🗂️', '⚡', '🌱', '🔬'];

const COLOR_PRESETS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6'];

function isCustomCoverImage(coverStyle?: string) {
  return Boolean(coverStyle && (coverStyle.startsWith('data:image/') || coverStyle.startsWith('http')));
}

function getCoverGradient(coverStyle?: string) {
  return COVER_PRESETS.find((c) => c.id === coverStyle)?.gradient || COVER_PRESETS[0].gradient;
}

async function compressCoverImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler imagem'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.onload = () => {
        const maxW = 1200;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(String(reader.result));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function RichMarkdown({
  content,
  onSelectLink,
}: {
  content: string;
  onSelectLink: (label: string) => void;
}) {
  const lines = content.split('\n');

  const renderInline = (text: string) => {
    const tokens = text.split(/(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|`[^`]+`)/g);
    return tokens.map((tok, i) => {
      if (tok.startsWith('[[') && tok.endsWith(']]')) {
        const label = tok.slice(2, -2).trim();
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelectLink(label)}
            className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[13px] font-medium text-indigo-300 ring-1 ring-indigo-500/30 transition hover:bg-indigo-500/25"
          >
            <Link2 className="h-3 w-3" />
            {label}
          </button>
        );
      }
      if (tok.startsWith('**') && tok.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-zinc-100">
            {tok.slice(2, -2)}
          </strong>
        );
      }
      if (tok.startsWith('`') && tok.endsWith('`')) {
        return (
          <code key={i} className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-xs text-amber-300">
            {tok.slice(1, -1)}
          </code>
        );
      }
      return <span key={i}>{tok}</span>;
    });
  };

  if (!content.trim()) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 px-5 py-10 text-center text-sm text-zinc-500">
        Esta página ainda está em branco. Clique em <strong className="text-zinc-300">Editar</strong> para começar a escrever ou use{' '}
        <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-indigo-300">[[Nome da Nota]]</code> para conectar ideias.
      </div>
    );
  }

  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed text-zinc-300">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1.5" />;
        if (trimmed.startsWith('### ')) {
          return (
            <h3 key={idx} className="pt-3 text-base font-semibold text-zinc-100">
              {renderInline(trimmed.slice(4))}
            </h3>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={idx} className="border-b border-zinc-800/70 pb-1.5 pt-4 text-lg font-semibold text-zinc-50">
              {renderInline(trimmed.slice(3))}
            </h2>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={idx} className="pt-3 text-xl font-bold text-white">
              {renderInline(trimmed.slice(2))}
            </h1>
          );
        }
        if (trimmed.startsWith('> ')) {
          return (
            <blockquote
              key={idx}
              className="rounded-r-lg border-l-2 border-indigo-500/70 bg-zinc-900/60 px-4 py-2 text-sm italic text-zinc-300"
            >
              {renderInline(trimmed.slice(2))}
            </blockquote>
          );
        }
        if (trimmed.startsWith('- [x] ') || trimmed.startsWith('- [X] ')) {
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-1 text-zinc-400 line-through">
              <span className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-emerald-500/50 bg-emerald-500/20 text-emerald-300">
                <Check className="h-3 w-3" />
              </span>
              <span>{renderInline(trimmed.slice(6))}</span>
            </div>
          );
        }
        if (trimmed.startsWith('- [ ] ')) {
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-1">
              <span className="mt-1 inline-flex h-4 w-4 shrink-0 rounded border border-zinc-600 bg-zinc-900" />
              <span>{renderInline(trimmed.slice(6))}</span>
            </div>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-2.5 pl-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
              <span>{renderInline(trimmed.slice(2))}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

export function SubjectHub({ onNavigate }: SubjectHubProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [allNotes, setAllNotes] = useState<NoteItem[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectDetail | null>(null);
  const [activeNote, setActiveNote] = useState<NoteDetail | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);

  const [viewMode, setViewMode] = useState<'gallery' | 'workspace'>('gallery');
  const [workspaceTab, setWorkspaceTab] = useState<'notes' | 'plan'>('notes');
  const [kindFilter, setKindFilter] = useState<'all' | 'subject' | 'project'>('all');
  const [treeSearch, setTreeSearch] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Editor state
  const [editorMode, setEditorMode] = useState<'read' | 'edit'>('read');
  const [noteTitleDraft, setNoteTitleDraft] = useState('');
  const [noteContentDraft, setNoteContentDraft] = useState('');
  const [noteStatusDraft, setNoteStatusDraft] = useState('active');
  const [savingNote, setSavingNote] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [wikiQuery, setWikiQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Create Space Modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newKind, setNewKind] = useState<'subject' | 'project'>('subject');
  const [newIcon, setNewIcon] = useState('📚');
  const [newCover, setNewCover] = useState('aurora');
  const [newColor, setNewColor] = useState('#6366f1');
  const [creatingSpace, setCreatingSpace] = useState(false);

  // Customize Subject Cover Modal
  const [showCoverPicker, setShowCoverPicker] = useState(false);

  // New Note / Folder inline prompt
  const [creatingNoteType, setCreatingNoteType] = useState<'note' | 'folder' | null>(null);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteParentId, setNewNoteParentId] = useState<string | null>(null);

  // Material Upload inside Workspace
  const [showMaterialPanel, setShowMaterialPanel] = useState(false);
  const [matTitle, setMatTitle] = useState('');
  const [matText, setMatText] = useState('');
  const [uploadingMat, setUploadingMat] = useState(false);

  // AI Actions
  const [suggestingLinks, setSuggestingLinks] = useState(false);
  const [suggestedLinks, setSuggestedLinks] = useState<Array<{ target: string; reason: string }>>([]);
  const [triageLoading, setTriageLoading] = useState(false);
  const [statusBanner, setStatusBanner] = useState('');

  // Knowledge Graph
  const [showGraph, setShowGraph] = useState(false);
  const [graphData, setGraphData] = useState<GraphData | null>(null);

  // Drag & Drop state
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

  const loadSubjects = useCallback(async () => {
    const [subs, notes] = await Promise.all([api.getSubjects(), api.getNotes()]);
    setSubjects(subs);
    setAllNotes(notes);
  }, []);

  useEffect(() => {
    loadSubjects().catch(console.error);
  }, [loadSubjects]);

  const openNoteById = useCallback(
    async (noteId: string, localNote?: NoteItem) => {
      const fallback = localNote || selectedSubject?.notes?.find((n) => n.id === noteId);
      if (fallback) {
        setActiveNote({ ...fallback, backlinks: [] });
        setNoteTitleDraft(fallback.title);
        setNoteContentDraft(fallback.content_markdown || '');
        setNoteStatusDraft(fallback.status || 'active');
        setEditorMode(fallback.content_markdown?.trim() ? 'read' : 'edit');
        setSuggestedLinks([]);
      }
      const detail = await api.getNote(noteId);
      setActiveNote(detail);
      setNoteTitleDraft(detail.title);
      setNoteContentDraft(detail.content_markdown || '');
      setNoteStatusDraft(detail.status || 'active');
      setEditorMode(detail.content_markdown?.trim() ? 'read' : 'edit');
      setSuggestedLinks([]);
    },
    [selectedSubject]
  );

  const handleMoveNote = useCallback(
    async (noteId: string, targetParentId: string | null) => {
      if (!selectedSubject || noteId === targetParentId) return;
      // Optimistic tree update
      setSelectedSubject((prev) =>
        prev
          ? {
              ...prev,
              notes: (prev.notes || []).map((n) =>
                n.id === noteId ? { ...n, parent_id: targetParentId } : n
              ),
            }
          : prev
      );
      if (targetParentId) {
        setExpandedFolders((p) => ({ ...p, [targetParentId]: true }));
      }
      await api.updateNote(noteId, { parent_id: targetParentId });
      await loadSubjects();
    },
    [selectedSubject, loadSubjects]
  );

  const openSubjectWorkspace = useCallback(
    async (subjectId: string, preferredNoteId?: string) => {
      const [detail, mats] = await Promise.all([api.getSubject(subjectId), api.getMaterials(subjectId)]);
      setSelectedSubject(detail);
      setMaterials(mats);
      setViewMode('workspace');
      setShowCoverPicker(false);
      setSuggestedLinks([]);

      const notes = detail.notes || [];
      const folderMap: Record<string, boolean> = {};
      notes.filter((n) => n.page_type === 'folder').forEach((f) => {
        folderMap[f.id] = true;
      });
      setExpandedFolders((prev) => ({ ...folderMap, ...prev }));

      const targetNote =
        (preferredNoteId && notes.find((n) => n.id === preferredNoteId)) ||
        notes.find((n) => n.page_type !== 'folder') ||
        notes[0];
      if (targetNote) {
        void openNoteById(targetNote.id, targetNote);
      } else {
        setActiveNote(null);
      }
    },
    [openNoteById]
  );

  const handleSaveNote = useCallback(async () => {
    if (!activeNote || savingNote) return;
    setSavingNote(true);
    try {
      const updated = await api.updateNote(activeNote.id, {
        title: noteTitleDraft.trim() || 'Sem título',
        content_markdown: noteContentDraft,
        status: noteStatusDraft,
      });
      const refreshed = await api.getNote(updated.id);
      setActiveNote(refreshed);
      if (selectedSubject) {
        const detail = await api.getSubject(selectedSubject.id);
        setSelectedSubject(detail);
      }
      await loadSubjects();
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 1800);
    } finally {
      setSavingNote(false);
    }
  }, [activeNote, savingNote, noteTitleDraft, noteContentDraft, noteStatusDraft, selectedSubject, loadSubjects]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's' && viewMode === 'workspace' && activeNote) {
        e.preventDefault();
        handleSaveNote();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMode, activeNote, handleSaveNote]);

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || creatingSpace) return;
    setCreatingSpace(true);
    try {
      const created = await api.createSubject({
        name: newName.trim(),
        description: newDescription.trim(),
        kind: newKind,
        icon: newIcon,
        cover_style: newCover,
        color: newColor,
      });
      setNewName('');
      setNewDescription('');
      setShowNewModal(false);
      await loadSubjects();
      await openSubjectWorkspace(created.id);
    } finally {
      setCreatingSpace(false);
    }
  };

  const handleDeleteSpace = async (id: string, name: string) => {
    if (!confirm(`Excluir "${name}" e todas as suas notas e flashcards?`)) return;
    await api.deleteSubject(id);
    if (selectedSubject?.id === id) {
      setSelectedSubject(null);
      setActiveNote(null);
      setViewMode('gallery');
    }
    await loadSubjects();
  };

  const handleCreateNoteOrFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubject || !creatingNoteType || !newNoteTitle.trim()) return;
    const created = await api.createNote({
      subject_id: selectedSubject.id,
      parent_id: newNoteParentId,
      title: newNoteTitle.trim(),
      icon: creatingNoteType === 'folder' ? '📁' : '📄',
      page_type: creatingNoteType,
      content_markdown: '',
    });
    setCreatingNoteType(null);
    setNewNoteTitle('');
    setNewNoteParentId(null);
    const detail = await api.getSubject(selectedSubject.id);
    setSelectedSubject(detail);
    await loadSubjects();
    if (created.page_type !== 'folder') {
      await openNoteById(created.id);
      setEditorMode('edit');
    }
  };

  const handleDeleteNote = async (note: NoteItem) => {
    if (!selectedSubject) return;
    if (!confirm(`Excluir "${note.title}"?`)) return;
    await api.deleteNote(note.id);
    const detail = await api.getSubject(selectedSubject.id);
    setSelectedSubject(detail);
    await loadSubjects();
    if (activeNote?.id === note.id) {
      const next = (detail.notes || []).find((n) => n.page_type !== 'folder') || detail.notes?.[0];
      if (next) await openNoteById(next.id);
      else setActiveNote(null);
    }
  };

  const handleUpdateSubjectAppearance = async (patch: Partial<Pick<Subject, 'icon' | 'cover_style' | 'kind' | 'color'>>) => {
    if (!selectedSubject) return;
    await api.updateSubject(selectedSubject.id, patch);
    const detail = await api.getSubject(selectedSubject.id);
    setSelectedSubject(detail);
    await loadSubjects();
  };

  const handleEditorChange = (val: string) => {
    setNoteContentDraft(val);
    const el = textareaRef.current;
    const cursor = el ? el.selectionStart : val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/\[\[([^\]]*)$/);
    setWikiQuery(match ? match[1] : null);
  };

  const insertWikiLink = (label: string) => {
    const el = textareaRef.current;
    const cursor = el ? el.selectionStart : noteContentDraft.length;
    const before = noteContentDraft.slice(0, cursor);
    const after = noteContentDraft.slice(cursor);
    const replaced = before.replace(/\[\[([^\]]*)$/, `[[${label}]]`);
    const next = replaced.endsWith(`[[${label}]]`) ? `${replaced}${after}` : `${before} [[${label}]]${after}`;
    setNoteContentDraft(next);
    setWikiQuery(null);
    setTimeout(() => el?.focus(), 0);
  };

  const insertSnippet = (prefix: string, suffix = '') => {
    const el = textareaRef.current;
    if (!el) {
      setNoteContentDraft((p) => `${p}\n${prefix}${suffix}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = noteContentDraft.slice(start, end);
    const next =
      noteContentDraft.slice(0, start) + prefix + selected + suffix + noteContentDraft.slice(end);
    setNoteContentDraft(next);
    setEditorMode('edit');
    setTimeout(() => {
      el.focus();
      const pos = start + prefix.length + selected.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleLinkClick = async (label: string) => {
    const norm = label.toLowerCase().trim();
    const matchedNote = allNotes.find((n) => n.title.toLowerCase().trim() === norm);
    if (matchedNote) {
      if (selectedSubject?.id === matchedNote.subject_id) {
        await openNoteById(matchedNote.id);
      } else {
        await openSubjectWorkspace(matchedNote.subject_id, matchedNote.id);
      }
      return;
    }
    const matchedSubject = subjects.find((s) => s.name.toLowerCase().trim() === norm);
    if (matchedSubject) {
      await openSubjectWorkspace(matchedSubject.id);
    }
  };

  const handleSuggestLinks = async () => {
    if (!selectedSubject) return;
    setSuggestingLinks(true);
    try {
      const res = await api.suggestNoteLinks(selectedSubject.id);
      setSuggestedLinks(
        (res.suggestions || []).map((s) => ({
          target: s.label || s.targetSubject,
          reason: s.reason,
        }))
      );
    } finally {
      setSuggestingLinks(false);
    }
  };

  const handleGenerateFlashcardsFromNote = async () => {
    if (!selectedSubject || !activeNote || !noteContentDraft.trim()) return;
    setTriageLoading(true);
    setStatusBanner('');
    try {
      const res = await api.triageInbox({
        subject_id: selectedSubject.id,
        title: activeNote.title,
        file_type: 'text',
        text_content: noteContentDraft,
      });
      setStatusBanner(
        `Criados ${res.createdFlashcards} flashcards e ${res.createdConcepts} conceitos a partir desta nota.`
      );
      await loadSubjects();
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Falha ao gerar flashcards');
    } finally {
      setTriageLoading(false);
    }
  };

  const handleUploadTextMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubject || !matTitle.trim() || !matText.trim()) return;
    setUploadingMat(true);
    try {
      await api.ingestMaterial({
        subject_id: selectedSubject.id,
        title: matTitle.trim(),
        file_type: 'text',
        text_content: matText.trim(),
      });
      setMatTitle('');
      setMatText('');
      setShowMaterialPanel(false);
      const mats = await api.getMaterials(selectedSubject.id);
      setMaterials(mats);
      setStatusBanner('Material indexado no RAG e pronto para o Tutor IA.');
    } finally {
      setUploadingMat(false);
    }
  };

  const handlePdfUpload = async (file: File) => {
    if (!selectedSubject) return;
    setUploadingMat(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const comma = result.indexOf(',');
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error('Falha ao ler PDF'));
        reader.readAsDataURL(file);
      });
      await api.ingestMaterial({
        subject_id: selectedSubject.id,
        title: file.name.replace(/\.pdf$/i, ''),
        file_type: 'pdf',
        content_base64: base64,
      });
      const mats = await api.getMaterials(selectedSubject.id);
      setMaterials(mats);
      setStatusBanner(`PDF "${file.name}" indexado com sucesso.`);
    } finally {
      setUploadingMat(false);
    }
  };

  const openGraphModal = async () => {
    const data = await api.getGraph();
    setGraphData(data);
    setShowGraph(true);
  };

  const filteredSubjects = useMemo(() => {
    if (kindFilter === 'all') return subjects;
    return subjects.filter((s) => (s.kind || 'subject') === kindFilter);
  }, [subjects, kindFilter]);

  const wikiSuggestions = useMemo(() => {
    if (wikiQuery === null) return [];
    const q = wikiQuery.toLowerCase();
    const noteChoices = allNotes
      .filter((n) => n.id !== activeNote?.id && n.page_type !== 'folder')
      .map((n) => ({ label: n.title, sub: subjects.find((s) => s.id === n.subject_id)?.name || 'Nota', icon: n.icon || '📄' }));
    const subjectChoices = subjects.map((s) => ({
      label: s.name,
      sub: s.kind === 'project' ? 'Projeto' : 'Matéria',
      icon: s.icon || '📚',
    }));
    const combined = [...noteChoices, ...subjectChoices];
    const seen = new Set<string>();
    return combined
      .filter((item) => {
        const key = item.label.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return !q || key.includes(q);
      })
      .slice(0, 7);
  }, [wikiQuery, allNotes, subjects, activeNote]);

  // Tree rendering helper
  const renderTree = (parentId: string | null, depth = 0) => {
    const notes = selectedSubject?.notes || [];
    const children = notes.filter((n) => {
      const matchesParent = (n.parent_id || null) === parentId;
      const matchesSearch = !treeSearch.trim() || n.title.toLowerCase().includes(treeSearch.toLowerCase());
      return treeSearch.trim() ? parentId === null && matchesSearch : matchesParent;
    });

    return children.map((node) => {
      const isFolder = node.page_type === 'folder';
      const isExpanded = !!expandedFolders[node.id];
      const isActive = activeNote?.id === node.id;
      const isDragOver = dragOverTarget === node.id;

      return (
        <div key={node.id}>
          <div
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              setDraggedNoteId(node.id);
              e.dataTransfer.setData('text/plain', node.id);
            }}
            onDragEnd={() => {
              setDraggedNoteId(null);
              setDragOverTarget(null);
            }}
            onDragOver={(e) => {
              if (!isFolder || !draggedNoteId || draggedNoteId === node.id) return;
              e.preventDefault();
              setDragOverTarget(node.id);
            }}
            onDragLeave={() => {
              if (dragOverTarget === node.id) setDragOverTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const id = e.dataTransfer.getData('text/plain') || draggedNoteId;
              setDragOverTarget(null);
              setDraggedNoteId(null);
              if (isFolder && id && id !== node.id) {
                void handleMoveNote(id, node.id);
              }
            }}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            className={`group flex items-center justify-between rounded-lg pr-1.5 py-1.5 text-[13px] transition ${
              isDragOver
                ? 'bg-indigo-500/25 ring-1 ring-indigo-400 text-white'
                : isActive
                  ? 'bg-indigo-500/15 text-indigo-200 font-medium'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
            }`}
          >
            <button
              type="button"
              onClick={() => {
                if (isFolder) {
                  setExpandedFolders((p) => ({ ...p, [node.id]: !p[node.id] }));
                } else {
                  void openNoteById(node.id, node);
                }
              }}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left cursor-grab active:cursor-grabbing"
            >
              {isFolder ? (
                <span className="text-zinc-500">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
              ) : (
                <span className="w-3.5" />
              )}
              <span className="shrink-0 text-sm">
                {isFolder ? (
                  isExpanded ? (
                    <FolderOpen className="h-3.5 w-3.5 text-amber-400/90" />
                  ) : (
                    <Folder className="h-3.5 w-3.5 text-amber-400/80" />
                  )
                ) : (
                  node.icon || '📄'
                )}
              </span>
              <span className="truncate">{node.title}</span>
            </button>
            <div className="hidden items-center gap-0.5 group-hover:flex">
              {isFolder && (
                <button
                  type="button"
                  title="Nova nota nesta pasta"
                  onClick={() => {
                    setNewNoteParentId(node.id);
                    setCreatingNoteType('note');
                    setExpandedFolders((p) => ({ ...p, [node.id]: true }));
                  }}
                  className="rounded p-1 text-zinc-500 hover:bg-zinc-700/70 hover:text-zinc-200"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
              <button
                type="button"
                title="Excluir"
                onClick={() => handleDeleteNote(node)}
                className="rounded p-1 text-zinc-500 hover:bg-rose-500/20 hover:text-rose-300"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
          {isFolder && isExpanded && !treeSearch.trim() && renderTree(node.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Workspace & Conhecimento</h1>
          <p className="text-sm text-zinc-400">
            Organize matérias, projetos com capas Notion, pastas, notas conectadas e materiais PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {viewMode === 'workspace' && (
            <button
              type="button"
              onClick={() => setViewMode('gallery')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Galeria de Espaços
            </button>
          )}
          <button
            type="button"
            onClick={openGraphModal}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-indigo-500/50 hover:text-indigo-300"
          >
            <Network className="h-3.5 w-3.5 text-indigo-400" />
            Mapa de Conexões
          </button>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo Espaço
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
          <span>{statusBanner}</span>
          <button type="button" onClick={() => setStatusBanner('')} className="text-emerald-300 hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* GALLERY VIEW (Notion Covers) */}
      {viewMode === 'gallery' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {(
              [
                ['all', 'Todos'],
                ['subject', 'Matérias'],
                ['project', 'Projetos'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setKindFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  kindFilter === key
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredSubjects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-10 text-center">
              <p className="text-base font-medium text-zinc-200">Seu Workspace está limpo</p>
              <p className="mt-1 text-sm text-zinc-400">
                Crie sua primeira matéria ou projeto com capa personalizada para começar a organizar suas notas.
              </p>
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Criar primeiro espaço
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSubjects.map((sub) => (
                <div
                  key={sub.id}
                  onClick={() => openSubjectWorkspace(sub.id)}
                  className="group cursor-pointer overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/60 transition hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900/90"
                >
                  {/* Notion Cover */}
                  <div
                    style={
                      isCustomCoverImage(sub.cover_style)
                        ? {
                            backgroundImage: `linear-gradient(to top, rgba(9,9,11,0.55), rgba(9,9,11,0.15)), url(${sub.cover_style})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }
                        : undefined
                    }
                    className={`relative h-24 w-full ${
                      isCustomCoverImage(sub.cover_style)
                        ? 'bg-zinc-900'
                        : `bg-gradient-to-r ${getCoverGradient(sub.cover_style)}`
                    }`}
                  >
                    <div className="absolute right-3 top-3 flex items-center gap-1.5">
                      <span className="rounded-full bg-black/35 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                        {sub.kind === 'project' ? 'Projeto' : 'Matéria'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSpace(sub.id, sub.name);
                        }}
                        className="rounded-full bg-black/35 p-1.5 text-zinc-200 opacity-0 transition hover:bg-rose-600/80 group-hover:opacity-100"
                        title="Excluir"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="absolute -bottom-5 left-4 flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-xl shadow-md">
                      {sub.icon || '📚'}
                    </div>
                  </div>

                  <div className="px-4 pb-4 pt-7">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-base font-semibold text-white">{sub.name}</h3>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-500 transition group-hover:text-indigo-400" />
                    </div>
                    <p className="mt-1 line-clamp-2 min-h-[32px] text-xs text-zinc-400">
                      {sub.description || 'Clique para abrir notas, pastas e materiais.'}
                    </p>
                    <div className="mt-3 flex items-center gap-3 border-t border-zinc-800/70 pt-3 text-[11px] text-zinc-400">
                      <span>{sub.note_count ?? 0} notas</span>
                      <span>•</span>
                      <span>{sub.card_count ?? 0} flashcards</span>
                      {(sub.due_count ?? 0) > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-amber-300">{sub.due_count} pendentes</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* WORKSPACE VIEW (Notion Cover + Collapsible Tree + Markdown Note Canvas) */}
      {viewMode === 'workspace' && selectedSubject && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/80 shadow-xl">
          {/* Subject Notion Cover Banner */}
          <div
            style={
              isCustomCoverImage(selectedSubject.cover_style)
                ? {
                    backgroundImage: `linear-gradient(to top, rgba(9,9,11,0.72), rgba(9,9,11,0.2)), url(${selectedSubject.cover_style})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
            className={`relative h-32 w-full ${
              isCustomCoverImage(selectedSubject.cover_style)
                ? 'bg-zinc-900'
                : `bg-gradient-to-r ${getCoverGradient(selectedSubject.cover_style)}`
            }`}
          >
            <div className="absolute right-4 top-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCoverPicker((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/60"
              >
                <Palette className="h-3.5 w-3.5" />
                Personalizar Capa
              </button>
              <button
                type="button"
                onClick={() => setSidebarCollapsed((v) => !v)}
                className="rounded-lg bg-black/40 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/60"
              >
                {sidebarCollapsed ? 'Mostrar Árvore' : 'Foco Total'}
              </button>
            </div>

            <div className="absolute bottom-3 left-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-zinc-950/90 text-2xl shadow-lg">
                {selectedSubject.icon || '📚'}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white drop-shadow">{selectedSubject.name}</h2>
                  <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-100">
                    {selectedSubject.kind === 'project' ? 'Projeto' : 'Matéria'}
                  </span>
                </div>
                {selectedSubject.description && (
                  <p className="text-xs text-zinc-100/85 drop-shadow-sm">{selectedSubject.description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Inline Cover & Icon Customizer */}
          {showCoverPicker && (
            <div className="border-b border-zinc-800 bg-zinc-900/90 px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-zinc-400">Capa:</span>
                  {COVER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleUpdateSubjectAppearance({ cover_style: preset.id })}
                      className={`h-6 w-12 rounded-md bg-gradient-to-r ${preset.gradient} ring-2 transition ${
                        selectedSubject.cover_style === preset.id ? 'ring-white' : 'ring-transparent hover:ring-zinc-500'
                      }`}
                      title={preset.label}
                    />
                  ))}
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:border-indigo-400 hover:text-white">
                    <Upload className="h-3 w-3" />
                    Subir Imagem
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const dataUrl = await compressCoverImage(file);
                        await handleUpdateSubjectAppearance({ cover_style: dataUrl });
                      }}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium text-zinc-400">Ícone:</span>
                  {ICON_PRESETS.slice(0, 10).map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => handleUpdateSubjectAppearance({ icon: ic })}
                      className={`rounded-md px-1.5 py-0.5 text-base hover:bg-zinc-800 ${
                        selectedSubject.icon === ic ? 'bg-zinc-800 ring-1 ring-indigo-400' : ''
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Workspace Sub-tabs: Notas & Materiais vs Estudo Ativo */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 bg-zinc-900/50 px-5 py-2">
            <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-950/70 p-0.5">
              <button
                type="button"
                onClick={() => setWorkspaceTab('notes')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  workspaceTab === 'notes' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileText className="h-3.5 w-3.5 text-indigo-400" />
                Notas & Materiais
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceTab('plan')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  workspaceTab === 'plan'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-indigo-300'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Estudo Ativo (Plano & Aulas)
              </button>
            </div>
            <span className="text-[11px] text-zinc-500">
              {materials.length} materiais indexados • {selectedSubject.notes?.length || 0} páginas
            </span>
          </div>

          {workspaceTab === 'plan' ? (
            <SubjectStudyPlan
              subject={selectedSubject}
              onOpenQuiz={(quizId) => onNavigate('practice', { quizId })}
              onRefresh={loadSubjects}
            />
          ) : (
          /* Split Body */
          <div className="flex min-h-[560px] flex-col md:flex-row">
            {/* Left Sidebar Tree */}
            {!sidebarCollapsed && (
              <aside className="flex w-full shrink-0 flex-col border-b border-zinc-800/80 bg-zinc-900/40 md:w-72 md:border-b-0 md:border-r">
                <div className="space-y-2.5 border-b border-zinc-800/80 p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                    <input
                      value={treeSearch}
                      onChange={(e) => setTreeSearch(e.target.value)}
                      placeholder="Filtrar notas..."
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 py-1.5 pl-8 pr-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setNewNoteParentId(null);
                        setCreatingNoteType('note');
                      }}
                      className="inline-flex items-center justify-center gap-1 rounded-lg bg-zinc-800/80 px-2 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
                    >
                      <Plus className="h-3.5 w-3.5 text-indigo-400" />
                      Nova Nota
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewNoteParentId(null);
                        setCreatingNoteType('folder');
                      }}
                      className="inline-flex items-center justify-center gap-1 rounded-lg bg-zinc-800/80 px-2 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
                    >
                      <FolderPlus className="h-3.5 w-3.5 text-amber-400" />
                      Nova Pasta
                    </button>
                  </div>

                  {creatingNoteType && (
                    <form onSubmit={handleCreateNoteOrFolder} className="space-y-1.5 rounded-lg border border-zinc-700 bg-zinc-950 p-2">
                      <input
                        autoFocus
                        value={newNoteTitle}
                        onChange={(e) => setNewNoteTitle(e.target.value)}
                        placeholder={creatingNoteType === 'folder' ? 'Nome da pasta...' : 'Título da nota...'}
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-white focus:border-indigo-500 focus:outline-none"
                      />
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setCreatingNoteType(null);
                            setNewNoteTitle('');
                          }}
                          className="rounded px-2 py-0.5 text-[11px] text-zinc-400 hover:text-white"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="rounded bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-indigo-500"
                        >
                          Criar
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Pages Tree */}
                <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
                  {draggedNoteId && (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOverTarget('__root__');
                      }}
                      onDragLeave={() => setDragOverTarget(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        const id = e.dataTransfer.getData('text/plain') || draggedNoteId;
                        setDragOverTarget(null);
                        setDraggedNoteId(null);
                        if (id) void handleMoveNote(id, null);
                      }}
                      className={`mb-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-center text-[11px] transition ${
                        dragOverTarget === '__root__'
                          ? 'border-indigo-400 bg-indigo-500/20 text-white'
                          : 'border-zinc-700 text-zinc-400'
                      }`}
                    >
                      Soltar aqui para mover para a raiz
                    </div>
                  )}
                  {renderTree(null, 0)}
                </div>

                {/* Materials & PDFs section inside Workspace */}
                <div className="border-t border-zinc-800/80 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Materiais ({materials.length})
                    </span>
                    <div className="flex items-center gap-1">
                      <label className="cursor-pointer rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white" title="Subir PDF">
                        <Upload className="h-3.5 w-3.5" />
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handlePdfUpload(f);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowMaterialPanel((v) => !v)}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                        title="Colar texto"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {showMaterialPanel && (
                    <form onSubmit={handleUploadTextMaterial} className="mt-2 space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                      <input
                        value={matTitle}
                        onChange={(e) => setMatTitle(e.target.value)}
                        placeholder="Título do material"
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-white"
                      />
                      <textarea
                        rows={3}
                        value={matText}
                        onChange={(e) => setMatText(e.target.value)}
                        placeholder="Cole o conteúdo ou resumo..."
                        className="w-full rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-white"
                      />
                      <button
                        type="submit"
                        disabled={uploadingMat}
                        className="w-full rounded bg-indigo-600 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {uploadingMat ? 'Indexando...' : 'Salvar Material'}
                      </button>
                    </form>
                  )}

                  <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                    {materials.map((m) => (
                      <div key={m.id} className="flex items-center justify-between rounded bg-zinc-950/60 px-2 py-1 text-[11px] text-zinc-300">
                        <span className="truncate">{m.title}</span>
                        <span className="ml-2 shrink-0 text-[10px] text-zinc-500">{m.chunk_count}ch</span>
                      </div>
                    ))}
                    {materials.length === 0 && (
                      <p className="text-[11px] text-zinc-500">Suba PDFs ou textos para o Tutor IA.</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigate('library')}
                    className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/70 py-1.5 text-[11px] font-medium text-zinc-300 hover:border-indigo-500/40 hover:text-indigo-300"
                  >
                    <BookOpen className="h-3 w-3" />
                    Sugerir Livros na Biblioteca
                  </button>
                </div>
              </aside>
            )}

            {/* Main Note Canvas */}
            <main className="flex flex-1 flex-col bg-zinc-950/50">
              {activeNote ? (
                <>
                  {/* Note Toolbar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 px-5 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={noteStatusDraft}
                        onChange={(e) => setNoteStatusDraft(e.target.value)}
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 focus:outline-none"
                      >
                        <option value="active">Ativo</option>
                        <option value="draft">Rascunho</option>
                        <option value="done">Concluído</option>
                      </select>

                      <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
                        <button
                          type="button"
                          onClick={() => setEditorMode('read')}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                            editorMode === 'read' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ler
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditorMode('edit')}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                            editorMode === 'edit' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Editar
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSuggestLinks}
                        disabled={suggestingLinks}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-indigo-300 transition hover:border-indigo-500/40 disabled:opacity-50"
                      >
                        {suggestingLinks ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Sugerir Conexões
                      </button>
                      <button
                        type="button"
                        onClick={handleGenerateFlashcardsFromNote}
                        disabled={triageLoading || !noteContentDraft.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-emerald-300 transition hover:border-emerald-500/40 disabled:opacity-50"
                      >
                        {triageLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        Gerar Flashcards
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveNote}
                        disabled={savingNote}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                      >
                        {savingNote ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : savedNotice ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : null}
                        {savedNotice ? 'Salvo' : 'Salvar'}
                      </button>
                    </div>
                  </div>

                  {/* Formatting bar when editing */}
                  {editorMode === 'edit' && (
                    <div className="flex flex-wrap items-center gap-1 border-b border-zinc-800/60 bg-zinc-900/30 px-5 py-1.5">
                      <button
                        type="button"
                        onClick={() => insertSnippet('## ', '')}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      >
                        <Heading2 className="h-3.5 w-3.5" /> Título
                      </button>
                      <button
                        type="button"
                        onClick={() => insertSnippet('**', '**')}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      >
                        <Bold className="h-3.5 w-3.5" /> Negrito
                      </button>
                      <button
                        type="button"
                        onClick={() => insertSnippet('- ', '')}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      >
                        <List className="h-3.5 w-3.5" /> Lista
                      </button>
                      <button
                        type="button"
                        onClick={() => insertSnippet('- [ ] ', '')}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      >
                        <CheckSquare className="h-3.5 w-3.5" /> Checklist
                      </button>
                      <button
                        type="button"
                        onClick={() => insertSnippet('> ', '')}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      >
                        <Quote className="h-3.5 w-3.5" /> Citação
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          insertSnippet('[[', '');
                          setWikiQuery('');
                        }}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-500/15"
                      >
                        <Link2 className="h-3.5 w-3.5" /> [[Conexão]]
                      </button>
                    </div>
                  )}

                  {/* AI Link Suggestions */}
                  {suggestedLinks.length > 0 && (
                    <div className="border-b border-indigo-500/20 bg-indigo-500/5 px-5 py-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-indigo-300">Conexões sugeridas pela IA:</span>
                        <button type="button" onClick={() => setSuggestedLinks([])} className="text-zinc-500 hover:text-white">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {suggestedLinks.map((sug, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              setEditorMode('edit');
                              setNoteContentDraft((p) => `${p}\n- Relacionado: [[${sug.target}]] — ${sug.reason}`);
                            }}
                            className="rounded-lg border border-indigo-500/30 bg-zinc-900 px-2.5 py-1 text-left text-xs text-zinc-200 hover:border-indigo-400"
                          >
                            <span className="font-semibold text-indigo-300">+ [[{sug.target}]]</span>
                            <span className="ml-1.5 text-zinc-400">{sug.reason}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Note Content */}
                  <div className="relative flex-1 overflow-y-auto px-6 py-6 md:px-10">
                    <div className="mx-auto max-w-3xl space-y-5">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{activeNote.icon || '📄'}</span>
                        <input
                          value={noteTitleDraft}
                          onChange={(e) => setNoteTitleDraft(e.target.value)}
                          placeholder="Título da página..."
                          className="w-full bg-transparent text-2xl font-bold tracking-tight text-white placeholder:text-zinc-600 focus:outline-none"
                        />
                      </div>

                      {editorMode === 'edit' ? (
                        <div className="relative">
                          <textarea
                            ref={textareaRef}
                            rows={16}
                            value={noteContentDraft}
                            onChange={(e) => handleEditorChange(e.target.value)}
                            placeholder="Escreva em Markdown... Use [[ para conectar com outras notas ou matérias."
                            className="w-full resize-y rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 font-sans text-[15px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-indigo-500/60 focus:outline-none"
                          />
                          {wikiQuery !== null && wikiSuggestions.length > 0 && (
                            <div className="mt-1.5 max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-2xl">
                              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                Conectar a uma nota ou espaço
                              </div>
                              {wikiSuggestions.map((s, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => insertWikiLink(s.label)}
                                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-200 hover:bg-indigo-600/25"
                                >
                                  <span className="flex items-center gap-2 truncate">
                                    <span>{s.icon}</span>
                                    <span className="truncate font-medium">{s.label}</span>
                                  </span>
                                  <span className="ml-2 shrink-0 text-[10px] text-zinc-500">{s.sub}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <RichMarkdown content={noteContentDraft} onSelectLink={handleLinkClick} />
                      )}

                      {/* Backlinks Footer */}
                      <div className="border-t border-zinc-800/80 pt-5">
                        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          <Link2 className="h-3.5 w-3.5 text-indigo-400" />
                          Backlinks ({activeNote.backlinks?.length || 0})
                        </h4>
                        {activeNote.backlinks && activeNote.backlinks.length > 0 ? (
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {activeNote.backlinks.map((bl) => (
                              <button
                                key={bl.id}
                                type="button"
                                onClick={() => {
                                  if (bl.source_note_id) {
                                    openSubjectWorkspace(bl.source_subject_id, bl.source_note_id);
                                  } else {
                                    openSubjectWorkspace(bl.source_subject_id);
                                  }
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 text-xs text-zinc-300 hover:border-indigo-500/40 hover:text-white"
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: bl.source_subject_color || '#6366f1' }}
                                />
                                <span>{bl.source_note_title || bl.source_subject_name}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1.5 text-xs text-zinc-500">
                            Nenhuma nota aponta para esta página ainda. Use <code className="text-indigo-300">[[{activeNote.title}]]</code> em outra nota.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                  <p className="text-sm text-zinc-400">Selecione uma nota na barra lateral ou crie uma nova.</p>
                </div>
              )}
            </main>
          </div>
          )}
        </div>
      )}

      {/* CREATE SPACE MODAL */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateSpace}
            className="w-full max-w-lg space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Novo Espaço no Workspace</h3>
              <button type="button" onClick={() => setShowNewModal(false)} className="text-zinc-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNewKind('subject')}
                className={`rounded-xl border py-2 text-xs font-medium transition ${
                  newKind === 'subject'
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                }`}
              >
                📚 Matéria / Disciplina
              </button>
              <button
                type="button"
                onClick={() => setNewKind('project')}
                className={`rounded-xl border py-2 text-xs font-medium transition ${
                  newKind === 'project'
                    ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                }`}
              >
                🚀 Projeto / Pesquisa
              </button>
            </div>

            <div className="space-y-3">
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Anatomia Humana, Canal YouTube, TCC..."
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Descrição curta (opcional)"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-400">Capa estilo Notion</label>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:border-indigo-400">
                  <Upload className="h-3 w-3" />
                  Subir Imagem
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const dataUrl = await compressCoverImage(file);
                      setNewCover(dataUrl);
                    }}
                  />
                </label>
              </div>
              {isCustomCoverImage(newCover) && (
                <div
                  className="mt-2 h-14 w-full rounded-lg border border-zinc-700 bg-cover bg-center"
                  style={{ backgroundImage: `url(${newCover})` }}
                />
              )}
              <div className="mt-1.5 grid grid-cols-6 gap-2">
                {COVER_PRESETS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setNewCover(c.id)}
                    className={`h-8 rounded-lg bg-gradient-to-r ${c.gradient} ring-2 ${
                      newCover === c.id ? 'ring-white' : 'ring-transparent'
                    }`}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-400">Ícone</label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {ICON_PRESETS.slice(0, 8).map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setNewIcon(ic)}
                      className={`rounded-lg px-2 py-1 text-base ${
                        newIcon === ic ? 'bg-zinc-800 ring-1 ring-indigo-500' : 'hover:bg-zinc-900'
                      }`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400">Cor</label>
                <div className="mt-1 flex gap-1.5">
                  {COLOR_PRESETS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setNewColor(col)}
                      style={{ backgroundColor: col }}
                      className={`h-6 w-6 rounded-full ring-2 ${newColor === col ? 'ring-white' : 'ring-transparent'}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingSpace}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {creatingSpace ? 'Criando...' : 'Criar Espaço'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* KNOWLEDGE GRAPH MODAL (Subjects + Notes) */}
      {showGraph && graphData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
              <div>
                <h3 className="text-base font-semibold text-white">Mapa de Conhecimento (Obsidian Graph)</h3>
                <p className="text-xs text-zinc-400">
                  {graphData.subjects.length} espaços • {graphData.notes?.length || 0} notas • {graphData.links.length} conexões
                </p>
              </div>
              <button type="button" onClick={() => setShowGraph(false)} className="text-zinc-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4">
              {graphData.subjects.length === 0 ? (
                <p className="py-12 text-center text-sm text-zinc-400">Crie espaços e notas para visualizar o grafo.</p>
              ) : (
                <svg viewBox="0 0 800 440" className="h-[420px] w-full rounded-xl border border-zinc-900 bg-zinc-950">
                  {(() => {
                    const subs = graphData.subjects;
                    const notes = graphData.notes || [];
                    const pos: Record<string, { x: number; y: number; color: string }> = {};

                    subs.forEach((s, idx) => {
                      const angle = (idx / Math.max(subs.length, 1)) * Math.PI * 2 - Math.PI / 2;
                      const rx = subs.length === 1 ? 0 : 210;
                      const ry = subs.length === 1 ? 0 : 120;
                      pos[`sub:${s.id}`] = {
                        x: 400 + Math.cos(angle) * rx,
                        y: 220 + Math.sin(angle) * ry,
                        color: s.color || '#6366f1',
                      };
                    });

                    notes.forEach((n, idx) => {
                      const parent = pos[`sub:${n.subject_id}`] || { x: 400, y: 220, color: '#6366f1' };
                      const sameSub = notes.filter((x) => x.subject_id === n.subject_id);
                      const localIdx = sameSub.findIndex((x) => x.id === n.id);
                      const angle = (localIdx / Math.max(sameSub.length, 1)) * Math.PI * 2 + idx * 0.2;
                      pos[`note:${n.id}`] = {
                        x: Math.max(40, Math.min(760, parent.x + Math.cos(angle) * 68)),
                        y: Math.max(35, Math.min(405, parent.y + Math.sin(angle) * 58)),
                        color: parent.color,
                      };
                    });

                    return (
                      <>
                        {/* Parent-to-note lines */}
                        {notes.map((n) => {
                          const p1 = pos[`sub:${n.subject_id}`];
                          const p2 = pos[`note:${n.id}`];
                          if (!p1 || !p2) return null;
                          return (
                            <line
                              key={`tree-${n.id}`}
                              x1={p1.x}
                              y1={p1.y}
                              x2={p2.x}
                              y2={p2.y}
                              stroke="#27272a"
                              strokeWidth="1.2"
                            />
                          );
                        })}

                        {/* Wikilink connections */}
                        {graphData.links.map((l) => {
                          const fromKey = l.source_note_id ? `note:${l.source_note_id}` : `sub:${l.source_subject_id}`;
                          const toKey = l.target_note_id
                            ? `note:${l.target_note_id}`
                            : l.target_subject_id
                              ? `sub:${l.target_subject_id}`
                              : null;
                          if (!toKey) return null;
                          const p1 = pos[fromKey];
                          const p2 = pos[toKey];
                          if (!p1 || !p2) return null;
                          return (
                            <line
                              key={l.id}
                              x1={p1.x}
                              y1={p1.y}
                              x2={p2.x}
                              y2={p2.y}
                              stroke="#818cf8"
                              strokeOpacity="0.65"
                              strokeWidth="1.6"
                              strokeDasharray="4 2"
                            />
                          );
                        })}

                        {/* Note nodes */}
                        {notes.map((n) => {
                          const p = pos[`note:${n.id}`];
                          if (!p) return null;
                          return (
                            <g
                              key={`n-${n.id}`}
                              className="cursor-pointer"
                              onClick={() => {
                                setShowGraph(false);
                                openSubjectWorkspace(n.subject_id, n.id);
                              }}
                            >
                              <circle cx={p.x} cy={p.y} r="6.5" fill="#18181b" stroke={p.color} strokeWidth="2" />
                              <text x={p.x} y={p.y + 17} textAnchor="middle" fill="#a1a1aa" fontSize="10">
                                {n.title.slice(0, 18)}
                              </text>
                            </g>
                          );
                        })}

                        {/* Subject nodes */}
                        {subs.map((s) => {
                          const p = pos[`sub:${s.id}`];
                          if (!p) return null;
                          return (
                            <g
                              key={`s-${s.id}`}
                              className="cursor-pointer"
                              onClick={() => {
                                setShowGraph(false);
                                openSubjectWorkspace(s.id);
                              }}
                            >
                              <circle cx={p.x} cy={p.y} r="15" fill={p.color} fillOpacity="0.25" stroke={p.color} strokeWidth="2.5" />
                              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="13">
                                {s.icon || '📚'}
                              </text>
                              <text x={p.x} y={p.y - 21} textAnchor="middle" fill="#f4f4f5" fontSize="11.5" fontWeight="600">
                                {s.name}
                              </text>
                            </g>
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
