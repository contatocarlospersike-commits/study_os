import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock,
  FileUp,
  Library,
  Loader2,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api, getCachedSync } from '../api/client';
import type { Book, Subject, TriageResult } from '../types';

interface LibraryInboxProps {
  subjects: Subject[];
  onDataChanged: () => void;
  onNotify: (title: string, msg: string) => void;
}

const STATUS_LABELS: Record<Book['status'], string> = {
  to_read: 'Tenho que ler',
  reading: 'Estou lendo',
  read: 'Lido',
};

const SOURCE_LABELS: Record<Book['source_type'], string> = {
  pearson: 'Pearson / Faculdade',
  open_access: 'Acesso Aberto',
  pdf: 'PDF Pessoal',
  physical: 'Livro Físico',
};

const BOOK_COVERS = [
  { id: 'aurora', gradient: 'from-indigo-600/80 via-violet-600/70 to-fuchsia-600/70' },
  { id: 'ocean', gradient: 'from-cyan-600/80 via-sky-600/70 to-blue-700/80' },
  { id: 'emerald', gradient: 'from-emerald-600/80 via-teal-600/70 to-cyan-700/80' },
  { id: 'sunset', gradient: 'from-amber-500/80 via-orange-600/75 to-rose-600/80' },
  { id: 'slate', gradient: 'from-zinc-700/90 via-zinc-800/90 to-zinc-900' },
  { id: 'crimson', gradient: 'from-rose-600/80 via-pink-600/70 to-purple-700/80' },
];

function isCustomImage(val?: string) {
  return Boolean(val && (val.startsWith('data:image/') || val.startsWith('http')));
}

function getCoverGrad(val?: string) {
  return BOOK_COVERS.find((c) => c.id === val)?.gradient || BOOK_COVERS[0].gradient;
}

async function compressBookCover(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler imagem'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagem inválida'));
      img.onload = () => {
        const maxW = 900;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(String(reader.result));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const LibraryInbox: React.FC<LibraryInboxProps> = ({ subjects, onDataChanged, onNotify }) => {
  const [subTab, setSubTab] = useState<'books' | 'inbox'>('books');
  const [books, setBooks] = useState<Book[]>(() => getCachedSync<Book[]>('/api/library/books') || []);
  const [loading, setLoading] = useState(() => !getCachedSync<Book[]>('/api/library/books'));
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);

  // Add book form
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newSource, setNewSource] = useState<Book['source_type']>('pearson');
  const [newTotalPages, setNewTotalPages] = useState(300);
  const [newSubjectId, setNewSubjectId] = useState<string>('');
  const [newCover, setNewCover] = useState<string>('aurora');

  // Book study actions
  const [showSelective, setShowSelective] = useState(false);
  const [examGoal, setExamGoal] = useState('');
  const [tocText, setTocText] = useState('');
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [savingToWorkspace, setSavingToWorkspace] = useState(false);
  const [generatingBookCards, setGeneratingBookCards] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);

  // Inbox "Jogar o Grosso"
  const [inboxTitle, setInboxTitle] = useState('');
  const [inboxSubjectId, setInboxSubjectId] = useState<string>('');
  const [inboxText, setInboxText] = useState('');
  const [inboxFileBase64, setInboxFileBase64] = useState<string | undefined>();
  const [inboxFileName, setInboxFileName] = useState('');
  const [triaging, setTriaging] = useState(false);
  const [triageResult, setTriageResult] = useState<TriageResult | null>(null);

  useEffect(() => {
    api
      .getBooks()
      .then(setBooks)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const selectedBook = books.find((b) => b.id === selectedBookId) ?? null;

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const created = await api.createBook({
        title: newTitle.trim(),
        author: newAuthor.trim(),
        source_type: newSource,
        total_pages: Number(newTotalPages) || 100,
        subject_id: newSubjectId || null,
        cover_style: newCover,
        status: 'to_read',
      });
      setBooks((prev) => [created, ...prev]);
      setSelectedBookId(created.id);
      setShowAddModal(false);
      setNewTitle('');
      setNewAuthor('');
      setNewCover('aurora');
      onNotify('Livro adicionado', `"${created.title}" entrou na sua estante.`);
    } catch (err) {
      onNotify('Erro', (err as Error).message);
    }
  };

  const handleUpdateBook = async (bookId: string, patch: Partial<Book>) => {
    try {
      const updated = await api.updateBook(bookId, patch);
      setBooks((prev) => prev.map((b) => (b.id === bookId ? updated : b)));
    } catch (err) {
      onNotify('Erro ao atualizar livro', (err as Error).message);
    }
  };

  const handleDeleteBook = async (bookId: string) => {
    if (!confirm('Remover este livro da sua biblioteca?')) return;
    try {
      await api.deleteBook(bookId);
      setBooks((prev) => prev.filter((b) => b.id !== bookId));
      if (selectedBookId === bookId) setSelectedBookId(null);
      onNotify('Livro removido', 'Registro removido da biblioteca.');
    } catch (err) {
      onNotify('Erro', (err as Error).message);
    }
  };

  const handleSendBookToWorkspace = async () => {
    if (!selectedBook) return;
    const targetSubjectId = selectedBook.subject_id || subjects[0]?.id;
    if (!targetSubjectId) {
      onNotify('Crie um espaço primeiro', 'Crie uma Matéria ou Projeto no Workspace antes de exportar.');
      return;
    }
    setSavingToWorkspace(true);
    try {
      const content = [
        `## Fichamento & Resumo\n${selectedBook.summary_markdown || '_Sem resumo ainda._'}`,
        `## Notas Livres & Conexões\n${selectedBook.insights_markdown || '_Sem notas ainda._'}`,
        selectedBook.selective_plan_markdown
          ? `## Roteiro de Leitura Seletiva\n${selectedBook.selective_plan_markdown}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      await api.createNote({
        subject_id: targetSubjectId,
        title: `Fichamento: ${selectedBook.title}`,
        icon: '📖',
        page_type: 'note',
        content_markdown: content,
      });
      onDataChanged();
      onNotify('Nota criada no Workspace!', `Fichamento de "${selectedBook.title}" salvo.`);
    } catch (err) {
      onNotify('Erro ao criar nota', (err as Error).message);
    } finally {
      setSavingToWorkspace(false);
    }
  };

  const handleGenerateCardsFromBook = async () => {
    if (!selectedBook) return;
    const combined = [
      selectedBook.summary_markdown,
      selectedBook.insights_markdown,
      selectedBook.selective_plan_markdown,
    ]
      .filter(Boolean)
      .join('\n\n');
    if (!combined.trim()) {
      onNotify('Escreva notas primeiro', 'Adicione resumo ou notas livres do livro para gerar flashcards e quiz.');
      return;
    }
    setGeneratingBookCards(true);
    try {
      const res = await api.triageInbox({
        title: `Livro: ${selectedBook.title}`,
        file_type: 'text',
        text_content: combined,
        subject_id: selectedBook.subject_id || subjects[0]?.id || null,
      });
      onDataChanged();
      onNotify('Estudo ativo criado!', `${res.createdFlashcards} flashcards e 1 quiz gerados.`);
    } catch (err) {
      onNotify('Erro ao gerar flashcards', (err as Error).message);
    } finally {
      setGeneratingBookCards(false);
    }
  };

  const handleSelectivePlan = async () => {
    if (!selectedBook || !examGoal.trim()) return;
    setGeneratingPlan(true);
    try {
      const res = await api.generateSelectivePlan(selectedBook.id, {
        exam_goal: examGoal.trim(),
        toc_text: tocText.trim() || undefined,
      });
      setBooks((prev) =>
        prev.map((b) => (b.id === selectedBook.id ? { ...b, selective_plan_markdown: res.plan } : b))
      );
      onNotify('Roteiro pronto', 'Plano de leitura seletiva gerado.');
    } catch (err) {
      onNotify('Erro na Leitura Seletiva', (err as Error).message);
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setInboxFileName(file.name);
    if (!inboxTitle) setInboxTitle(file.name.replace(/\.pdf$/i, ''));
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      setInboxFileBase64(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.readAsDataURL(file);
  };

  const handleTriage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inboxTitle.trim() || (!inboxText.trim() && !inboxFileBase64)) return;
    setTriaging(true);
    setTriageResult(null);
    try {
      const res = await api.triageInbox({
        title: inboxTitle.trim(),
        file_type: inboxFileBase64 ? 'pdf' : 'text',
        content_base64: inboxFileBase64,
        text_content: inboxText.trim() || undefined,
        subject_id: inboxSubjectId || null,
      });
      setTriageResult(res);
      setInboxText('');
      setInboxFileBase64(undefined);
      setInboxFileName('');
      onDataChanged();
      onNotify(
        'Triagem concluída!',
        `${res.createdConcepts} conceitos, ${res.createdFlashcards} flashcards e quiz gerados.`
      );
    } catch (err) {
      onNotify('Erro na triagem', (err as Error).message);
    } finally {
      setTriaging(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            <Library className="h-5 w-5 text-indigo-400" />
            Biblioteca de Livros
          </h1>
          <p className="text-sm text-zinc-400">
            Organize livros com capas estilo projetos, estruture seus estudos e crie notas livres conectadas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {subTab === 'books' && selectedBook && (
            <button
              type="button"
              onClick={() => {
                setSelectedBookId(null);
                setShowCoverPicker(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Estante
            </button>
          )}
          <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900/80 p-1">
            <button
              type="button"
              onClick={() => setSubTab('books')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                subTab === 'books' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
              Meus Livros ({books.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('inbox')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                subTab === 'inbox' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <FileUp className="h-3.5 w-3.5 text-cyan-400" />
              Inbox (IA)
            </button>
          </div>
          {subTab === 'books' && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar Livro
            </button>
          )}
        </div>
      </div>

      {/* SUBTAB 1: MEUS LIVROS — GALERIA OU ESTÚDIO DO LIVRO */}
      {subTab === 'books' && !selectedBook && (
        <>
          {loading ? (
            <div className="p-10 text-center text-xs text-zinc-400">Carregando estante...</div>
          ) : books.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 p-10 text-center">
              <p className="text-base font-medium text-zinc-200">Sua biblioteca está limpa</p>
              <p className="mt-1 text-xs text-zinc-400">
                Adicione livros da faculdade ou estudos extras com capa personalizada e monte seu fichamento.
              </p>
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar primeiro livro
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {books.map((book) => {
                const pct = Math.min(
                  100,
                  Math.round((book.current_page / Math.max(1, book.total_pages)) * 100)
                );
                return (
                  <div
                    key={book.id}
                    onClick={() => setSelectedBookId(book.id)}
                    className="group cursor-pointer overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/60 transition hover:-translate-y-0.5 hover:border-zinc-700 hover:bg-zinc-900/90"
                  >
                    <div
                      style={
                        isCustomImage(book.cover_style)
                          ? {
                              backgroundImage: `linear-gradient(to top, rgba(9,9,11,0.6), rgba(9,9,11,0.15)), url(${book.cover_style})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                            }
                          : undefined
                      }
                      className={`relative h-28 w-full ${
                        isCustomImage(book.cover_style)
                          ? 'bg-zinc-900'
                          : `bg-gradient-to-r ${getCoverGrad(book.cover_style)}`
                      }`}
                    >
                      <div className="absolute right-3 top-3 flex items-center gap-1.5">
                        <span className="rounded-full bg-black/45 px-2.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                          {STATUS_LABELS[book.status]}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteBook(book.id);
                          }}
                          className="rounded-full bg-black/45 p-1.5 text-zinc-200 opacity-0 transition hover:bg-rose-600 group-hover:opacity-100"
                          title="Excluir livro"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2.5 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-white">{book.title}</h3>
                          <p className="truncate text-xs text-zinc-400">
                            {book.author || 'Autor N/I'} · {SOURCE_LABELS[book.source_type]}
                          </p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-500 group-hover:text-indigo-400" />
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                          <div className="h-full bg-indigo-400 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] tabular-nums text-zinc-400">
                          {book.current_page}/{book.total_pages} p.
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* SUBTAB 1: ESTÚDIO DO LIVRO SELECIONADO */}
      {subTab === 'books' && selectedBook && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/80 shadow-xl">
          {/* Book Cover Banner */}
          <div
            style={
              isCustomImage(selectedBook.cover_style)
                ? {
                    backgroundImage: `linear-gradient(to top, rgba(9,9,11,0.78), rgba(9,9,11,0.2)), url(${selectedBook.cover_style})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
            className={`relative h-32 w-full ${
              isCustomImage(selectedBook.cover_style)
                ? 'bg-zinc-900'
                : `bg-gradient-to-r ${getCoverGrad(selectedBook.cover_style)}`
            }`}
          >
            <div className="absolute right-4 top-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCoverPicker((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-black/45 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm hover:bg-black/65"
              >
                <Palette className="h-3.5 w-3.5" />
                Capa
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBook(selectedBook.id)}
                className="rounded-lg bg-black/45 p-1.5 text-zinc-200 hover:bg-rose-600/80"
                title="Excluir livro"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="absolute bottom-3 left-5">
              <h2 className="text-xl font-bold text-white drop-shadow">{selectedBook.title}</h2>
              <p className="text-xs text-zinc-200/90">
                {selectedBook.author || 'Autor N/I'} · {SOURCE_LABELS[selectedBook.source_type]}
              </p>
            </div>
          </div>

          {showCoverPicker && (
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-900/90 px-5 py-3">
              <span className="text-xs font-medium text-zinc-400">Capa:</span>
              {BOOK_COVERS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleUpdateBook(selectedBook.id, { cover_style: c.id })}
                  className={`h-6 w-12 rounded-md bg-gradient-to-r ${c.gradient} ring-2 ${
                    selectedBook.cover_style === c.id ? 'ring-white' : 'ring-transparent'
                  }`}
                />
              ))}
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-[11px] text-zinc-200 hover:border-indigo-400">
                <Upload className="h-3 w-3" />
                Subir Capa
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const dataUrl = await compressBookCover(f);
                    await handleUpdateBook(selectedBook.id, { cover_style: dataUrl });
                  }}
                />
              </label>
            </div>
          )}

          <div className="space-y-5 p-5 md:p-6">
            {/* Properties Grid */}
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] text-zinc-400">Matéria / Projeto</label>
                <select
                  value={selectedBook.subject_id || ''}
                  onChange={(e) =>
                    handleUpdateBook(selectedBook.id, { subject_id: e.target.value || null })
                  }
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="">Sem vínculo</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.icon || '📚'} {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-zinc-400">Status</label>
                <select
                  value={selectedBook.status}
                  onChange={(e) =>
                    handleUpdateBook(selectedBook.id, { status: e.target.value as Book['status'] })
                  }
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="to_read">Tenho que ler</option>
                  <option value="reading">Estou lendo</option>
                  <option value="read">Lido</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-zinc-400">Página Atual</label>
                <input
                  type="number"
                  min={0}
                  max={selectedBook.total_pages}
                  value={selectedBook.current_page}
                  onChange={(e) =>
                    handleUpdateBook(selectedBook.id, { current_page: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-zinc-400">Total de Páginas</label>
                <input
                  type="number"
                  min={1}
                  value={selectedBook.total_pages}
                  onChange={(e) =>
                    handleUpdateBook(selectedBook.id, { total_pages: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            {/* Structured Study + Free Notes */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-200">
                  Fichamento Estruturado (Capítulos & Síntese)
                </label>
                <textarea
                  rows={8}
                  placeholder="Capítulos-chave, definições e sua síntese do livro..."
                  value={selectedBook.summary_markdown}
                  onChange={(e) =>
                    setBooks((prev) =>
                      prev.map((b) =>
                        b.id === selectedBook.id ? { ...b, summary_markdown: e.target.value } : b
                      )
                    )
                  }
                  onBlur={(e) => handleUpdateBook(selectedBook.id, { summary_markdown: e.target.value })}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 text-xs leading-relaxed text-zinc-200 focus:border-indigo-500/60 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-200">
                    Notas Livres & Conexões <code className="text-indigo-300">[[...]]</code>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowLinkPicker((v) => !v)}
                    className="rounded-md border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5 text-[11px] text-indigo-300 hover:bg-indigo-500/25"
                  >
                    + Conectar [[Matéria]]
                  </button>
                </div>
                {showLinkPicker && subjects.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
                    {subjects.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          const next = `${selectedBook.insights_markdown ? `${selectedBook.insights_markdown}\n` : ''}- Conectado a [[${s.name}]]: `;
                          setBooks((prev) =>
                            prev.map((b) =>
                              b.id === selectedBook.id ? { ...b, insights_markdown: next } : b
                            )
                          );
                          void handleUpdateBook(selectedBook.id, { insights_markdown: next });
                          setShowLinkPicker(false);
                        }}
                        className="rounded bg-zinc-900 px-2 py-1 text-[11px] text-indigo-300 hover:bg-indigo-500/20"
                      >
                        {s.icon || '📚'} [[{s.name}]]
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  rows={8}
                  placeholder="Escreva notas livres, ideias e conexões com [[Matérias]] ou [[Notas]]..."
                  value={selectedBook.insights_markdown}
                  onChange={(e) =>
                    setBooks((prev) =>
                      prev.map((b) =>
                        b.id === selectedBook.id ? { ...b, insights_markdown: e.target.value } : b
                      )
                    )
                  }
                  onBlur={(e) => handleUpdateBook(selectedBook.id, { insights_markdown: e.target.value })}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 text-xs leading-relaxed text-zinc-200 focus:border-indigo-500/60 focus:outline-none"
                />
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSendBookToWorkspace}
                  disabled={savingToWorkspace}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {savingToWorkspace ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
                  Criar Nota no Workspace
                </button>
                <button
                  type="button"
                  onClick={handleGenerateCardsFromBook}
                  disabled={generatingBookCards}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-50"
                >
                  {generatingBookCards ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Gerar Flashcards & Quiz
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowSelective((v) => !v)}
                className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
              >
                {showSelective ? 'Ocultar Leitura Seletiva IA' : 'Roteiro de Leitura Seletiva IA →'}
              </button>
            </div>

            {showSelective && (
              <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <input
                  type="text"
                  placeholder="Objetivo com este livro (ex: Prova de Grafos)"
                  value={examGoal}
                  onChange={(e) => setExamGoal(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                />
                <textarea
                  rows={2}
                  placeholder="Opcional: cole o sumário do livro..."
                  value={tocText}
                  onChange={(e) => setTocText(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleSelectivePlan}
                  disabled={generatingPlan || !examGoal.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-cyan-400 disabled:opacity-50"
                >
                  {generatingPlan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Gerar Roteiro Seletivo
                </button>
                {selectedBook.selective_plan_markdown && (
                  <div className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-200">
                    {selectedBook.selective_plan_markdown}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 2: INBOX JOGAR O GROSSO */}
      {subTab === 'inbox' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form
            onSubmit={handleTriage}
            className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 lg:col-span-7"
          >
            <div>
              <h3 className="text-base font-semibold text-white">Inbox "Jogar o Grosso"</h3>
              <p className="mt-0.5 text-xs text-zinc-400">
                Suba um PDF bruto ou cole texto de aula. A IA classifica na matéria, indexa no Tutor IA e gera conceitos, flashcards e quiz.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Título do material"
                value={inboxTitle}
                onChange={(e) => setInboxTitle(e.target.value)}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                required
              />
              <select
                value={inboxSubjectId}
                onChange={(e) => setInboxSubjectId(e.target.value)}
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
              >
                <option value="">Deixar a IA classificar / criar matéria</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    Forçar em: {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-950 p-3">
              <span className="text-xs text-zinc-400">
                {inboxFileName ? (
                  <span className="font-medium text-cyan-300">PDF pronto: {inboxFileName}</span>
                ) : (
                  'Opcional: envie um PDF de slides ou apostila'
                )}
              </span>
              <label className="cursor-pointer rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700">
                Escolher PDF
                <input type="file" accept="application/pdf" onChange={handlePdfSelect} className="hidden" />
              </label>
            </div>

            <textarea
              rows={6}
              placeholder="Ou cole aqui o texto bruto..."
              value={inboxText}
              onChange={(e) => setInboxText(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-white"
            />

            <button
              type="submit"
              disabled={triaging || !inboxTitle.trim() || (!inboxText.trim() && !inboxFileBase64)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {triaging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {triaging ? 'Processando...' : 'Organizar, Indexar e Gerar Quiz'}
            </button>
          </form>

          <div className="lg:col-span-5">
            {triageResult ? (
              <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Triagem concluída em "{triageResult.classification.subjectName}"
                </div>
                <p className="text-xs leading-relaxed text-zinc-300">
                  Subtópico detectado: <strong>{triageResult.classification.subtopic}</strong>
                </p>
                <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                  <div className="rounded-xl bg-zinc-950/80 p-2.5">
                    <div className="text-lg font-bold text-white">{triageResult.createdConcepts}</div>
                    <div className="text-[11px] text-zinc-400">Conceitos</div>
                  </div>
                  <div className="rounded-xl bg-zinc-950/80 p-2.5">
                    <div className="text-lg font-bold text-cyan-300">{triageResult.createdFlashcards}</div>
                    <div className="text-[11px] text-zinc-400">Flashcards</div>
                  </div>
                  <div className="rounded-xl bg-zinc-950/80 p-2.5">
                    <div className="text-lg font-bold text-emerald-300">
                      {triageResult.createdQuizId ? '1' : '0'}
                    </div>
                    <div className="text-[11px] text-zinc-400">Quiz</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-xs text-zinc-400">
                <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                  <Clock className="h-4 w-4 text-indigo-400" />
                  Como funciona o Inbox
                </div>
                <p>1. Você joga o material bruto sem perder tempo organizando pastas.</p>
                <p>2. A IA extrai conceitos, gera flashcards SM-2 e cria um quiz de fixação.</p>
                <p>3. O conteúdo fica indexado no Tutor IA para consultas rápidas.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ADD BOOK MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateBook}
            className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Novo Livro na Estante</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="text-zinc-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              <input
                required
                placeholder="Título do livro"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Autor"
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white"
                />
                <input
                  type="number"
                  min={1}
                  placeholder="Total páginas"
                  value={newTotalPages}
                  onChange={(e) => setNewTotalPages(Number(e.target.value))}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value as Book['source_type'])}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white"
                >
                  <option value="pearson">Pearson / Faculdade</option>
                  <option value="pdf">PDF Pessoal</option>
                  <option value="physical">Livro Físico</option>
                  <option value="open_access">Acesso Aberto</option>
                </select>
                <select
                  value={newSubjectId}
                  onChange={(e) => setNewSubjectId(e.target.value)}
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white"
                >
                  <option value="">Sem matéria vinculada</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400">Capa do Livro</label>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-200 hover:border-indigo-400">
                  <Upload className="h-3 w-3" />
                  Subir Imagem
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setNewCover(await compressBookCover(f));
                    }}
                  />
                </label>
              </div>
              {isCustomImage(newCover) && (
                <div
                  className="mt-2 h-16 w-full rounded-lg border border-zinc-700 bg-cover bg-center"
                  style={{ backgroundImage: `url(${newCover})` }}
                />
              )}
              <div className="mt-2 grid grid-cols-6 gap-2">
                {BOOK_COVERS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setNewCover(c.id)}
                    className={`h-7 rounded-md bg-gradient-to-r ${c.gradient} ring-2 ${
                      newCover === c.id ? 'ring-white' : 'ring-transparent'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-xl px-4 py-2 text-xs text-zinc-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Salvar Livro
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
