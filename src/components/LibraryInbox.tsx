import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  ExternalLink,
  FileUp,
  Library,
  Plus,
  Sparkles,
  Trash2,
  CheckCircle2,
  Clock,
  Loader2,
} from 'lucide-react';
import { api } from '../api/client';
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

export const LibraryInbox: React.FC<LibraryInboxProps> = ({ subjects, onDataChanged, onNotify }) => {
  const [subTab, setSubTab] = useState<'books' | 'inbox'>('books');
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add book form
  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newSource, setNewSource] = useState<Book['source_type']>('pearson');
  const [newUrl, setNewUrl] = useState('');
  const [newTotalPages, setNewTotalPages] = useState(300);
  const [newSubjectId, setNewSubjectId] = useState<string>('');

  // Selective reading AI
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

  const loadData = async () => {
    setLoading(true);
    try {
      const b = await api.getBooks();
      setBooks(b);
      if (b.length > 0 && !selectedBookId) {
        setSelectedBookId(b[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
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
        external_url: newUrl.trim(),
        total_pages: Number(newTotalPages) || 100,
        subject_id: newSubjectId || null,
        status: 'to_read',
      });
      setBooks((prev) => [created, ...prev]);
      setSelectedBookId(created.id);
      setShowAddForm(false);
      setNewTitle('');
      setNewAuthor('');
      setNewUrl('');
      onNotify('Livro adicionado', `"${created.title}" entrou na sua biblioteca.`);
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
      onNotify('Crie um espaço primeiro', 'Crie uma Matéria ou Projeto no Workspace antes de exportar o fichamento.');
      return;
    }
    setSavingToWorkspace(true);
    try {
      const content = [
        `## Resumo Pessoal\n${selectedBook.summary_markdown || '_Sem resumo ainda._'}`,
        `## Insights & Conexões\n${selectedBook.insights_markdown || '_Sem insights ainda._'}`,
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
      onNotify('Nota criada no Workspace!', `Fichamento de "${selectedBook.title}" salvo com suas conexões.`);
    } catch (err) {
      onNotify('Erro ao criar nota', (err as Error).message);
    } finally {
      setSavingToWorkspace(false);
    }
  };

  const handleGenerateCardsFromBook = async () => {
    if (!selectedBook) return;
    const combined = [selectedBook.summary_markdown, selectedBook.insights_markdown, selectedBook.selective_plan_markdown]
      .filter(Boolean)
      .join('\n\n');
    if (!combined.trim()) {
      onNotify('Escreva notas primeiro', 'Adicione seu resumo ou insights do livro para gerar flashcards e quiz.');
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
      onNotify(
        'Estudo ativo criado!',
        `${res.createdFlashcards} flashcards e 1 quiz gerados a partir das suas notas do livro.`
      );
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
      onNotify('Plano Seletivo pronto', 'A IA gerou os capítulos de maior retorno.');
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
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      setInboxFileBase64(base64);
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
    <div className="space-y-6">
      {/* Header & Sub-tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
            <Library className="w-5 h-5 text-cyan-400" />
            Biblioteca & Insights
          </h2>
          <p className="text-sm text-slate-400">
            Organize seus livros, acompanhe páginas lidas, registre insights e gere planos de leitura seletiva.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
          {[
            { id: 'books', label: 'Meus Livros', icon: BookOpen },
            { id: 'inbox', label: 'Jogar o Grosso (IA)', icon: FileUp },
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

      {/* SUBTAB 1: MEUS LIVROS */}
      {subTab === 'books' && (
        <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Book List */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">
                Estante ({books.length})
              </span>
              <button
                onClick={() => setShowAddForm((v) => !v)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Livro
              </button>
            </div>

            {showAddForm && (
              <form
                onSubmit={handleCreateBook}
                className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3"
              >
                <input
                  type="text"
                  placeholder="Título do livro (ex: Arquitetura Limpa)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100"
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Autor"
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100"
                  />
                  <input
                    type="number"
                    min={1}
                    placeholder="Total pág."
                    value={newTotalPages}
                    onChange={(e) => setNewTotalPages(Number(e.target.value))}
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value as Book['source_type'])}
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100"
                  >
                    <option value="pearson">Pearson / Faculdade</option>
                    <option value="open_access">Acesso Aberto</option>
                    <option value="pdf">PDF Pessoal</option>
                    <option value="physical">Livro Físico</option>
                  </select>
                  <select
                    value={newSubjectId}
                    onChange={(e) => setNewSubjectId(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100"
                  >
                    <option value="">Sem matéria vinculada</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="url"
                  placeholder="Link da Biblioteca Pearson ou PDF (opcional)"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-100"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                  >
                    Salvar Livro
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="p-8 text-center text-sm text-slate-400">Carregando biblioteca...</div>
            ) : books.length === 0 ? (
              <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800 text-center space-y-2">
                <p className="text-sm text-slate-300">Sua estante está vazia.</p>
                <p className="text-xs text-slate-400">
                  Adicione um livro da Pearson ou explore o Catálogo Aberto com 1 clique.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {books.map((book) => {
                  const pct = Math.min(100, Math.round((book.current_page / Math.max(1, book.total_pages)) * 100));
                  const active = book.id === selectedBookId;
                  return (
                    <button
                      key={book.id}
                      onClick={() => setSelectedBookId(book.id)}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                        active
                          ? 'bg-slate-900 border-cyan-500/40 shadow-sm'
                          : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-slate-100">{book.title}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {book.author || 'Autor não informado'} · {SOURCE_LABELS[book.source_type]}
                          </div>
                        </div>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full border shrink-0 ${
                            book.status === 'read'
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : book.status === 'reading'
                              ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {STATUS_LABELS[book.status]}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-cyan-400 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums">
                          {book.current_page}/{book.total_pages} p. ({pct}%)
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Book Detail & Selective Reading */}
          <div className="lg:col-span-7">
            {selectedBook ? (
              <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-100">{selectedBook.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {selectedBook.author} · {SOURCE_LABELS[selectedBook.source_type]}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedBook.external_url && (
                      <a
                        href={selectedBook.external_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-slate-800 text-slate-300 border border-slate-700 hover:text-white"
                      >
                        Abrir Link
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => handleDeleteBook(selectedBook.id)}
                      title="Remover livro"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Status, Subject Link & Page Progress */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Matéria / Projeto</label>
                    <select
                      value={selectedBook.subject_id || ''}
                      onChange={(e) =>
                        handleUpdateBook(selectedBook.id, { subject_id: e.target.value || null })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100"
                    >
                      <option value="">Sem vínculo</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Status de Leitura</label>
                    <select
                      value={selectedBook.status}
                      onChange={(e) =>
                        handleUpdateBook(selectedBook.id, { status: e.target.value as Book['status'] })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100"
                    >
                      <option value="to_read">Tenho que ler</option>
                      <option value="reading">Estou lendo</option>
                      <option value="read">Lido</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Página Atual</label>
                    <input
                      type="number"
                      min={0}
                      max={selectedBook.total_pages}
                      value={selectedBook.current_page}
                      onChange={(e) =>
                        handleUpdateBook(selectedBook.id, { current_page: Number(e.target.value) })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">Total de Páginas</label>
                    <input
                      type="number"
                      min={1}
                      value={selectedBook.total_pages}
                      onChange={(e) =>
                        handleUpdateBook(selectedBook.id, { total_pages: Number(e.target.value) })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100"
                    />
                  </div>
                </div>

                {/* Summary & Insights / Connections */}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300 block mb-1.5">
                      Fichamento & Resumo do Livro
                    </label>
                    <textarea
                      rows={5}
                      placeholder="Anote aqui os conceitos-chave, citações e sua síntese dos capítulos..."
                      value={selectedBook.summary_markdown}
                      onChange={(e) =>
                        setBooks((prev) =>
                          prev.map((b) =>
                            b.id === selectedBook.id ? { ...b, summary_markdown: e.target.value } : b
                          )
                        )
                      }
                      onBlur={(e) => handleUpdateBook(selectedBook.id, { summary_markdown: e.target.value })}
                      className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs leading-relaxed text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        Insights & Conexões <code className="text-indigo-300">[[Matéria ou Nota]]</code>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowLinkPicker((v) => !v)}
                        className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25"
                      >
                        + Conectar [[Matéria]]
                      </button>
                    </div>
                    {showLinkPicker && subjects.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5 p-2 rounded-lg bg-slate-950 border border-slate-800">
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
                            className="text-[11px] px-2 py-1 rounded bg-slate-900 text-indigo-300 hover:bg-indigo-500/20"
                          >
                            {s.icon || '📚'} [[{s.name}]]
                          </button>
                        ))}
                      </div>
                    )}
                    <textarea
                      rows={5}
                      placeholder="Como isso se conecta com suas matérias, projetos ou outras notas? Use [[Nome]]..."
                      value={selectedBook.insights_markdown}
                      onChange={(e) =>
                        setBooks((prev) =>
                          prev.map((b) =>
                            b.id === selectedBook.id ? { ...b, insights_markdown: e.target.value } : b
                          )
                        )
                      }
                      onBlur={(e) => handleUpdateBook(selectedBook.id, { insights_markdown: e.target.value })}
                      className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs leading-relaxed text-slate-200 focus:border-cyan-500/50 focus:outline-none"
                    />
                  </div>

                  {/* Action Bar: Save to Workspace + Generate Flashcards/Quiz */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSendBookToWorkspace}
                      disabled={savingToWorkspace}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {savingToWorkspace ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookOpen className="w-3.5 h-3.5" />}
                      Criar Nota no Workspace
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateCardsFromBook}
                      disabled={generatingBookCards}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      {generatingBookCards ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      Gerar Flashcards & Quiz do Livro
                    </button>
                  </div>
                </div>

                {/* Leitura Seletiva (IA) */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-cyan-300">
                    <Sparkles className="w-4 h-4" />
                    Leitura Seletiva IA (Não leia o livro inteiro sem precisão)
                  </div>
                  <input
                    type="text"
                    placeholder="Qual seu objetivo/prova com este livro? (ex: Prova de Grafos e Árvores B)"
                    value={examGoal}
                    onChange={(e) => setExamGoal(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100"
                  />
                  <textarea
                    rows={2}
                    placeholder="Opcional: cole o sumário/índice do livro da Pearson para a IA escolher exatamente quais capítulos ler..."
                    value={tocText}
                    onChange={(e) => setTocText(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-100"
                  />
                  <button
                    onClick={handleSelectivePlan}
                    disabled={generatingPlan || !examGoal.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {generatingPlan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    Gerar Roteiro de Leitura Seletiva
                  </button>

                  {selectedBook.selective_plan_markdown && (
                    <div className="mt-2 p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {selectedBook.selective_plan_markdown}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-10 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-sm text-slate-400">
                Selecione um livro na estante para acompanhar páginas, resumo e gerar leitura seletiva.
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {/* SUBTAB 2: INBOX JOGAR O GROSSO */}
      {subTab === 'inbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <form
            onSubmit={handleTriage}
            className="lg:col-span-7 p-5 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4"
          >
            <div>
              <h3 className="text-base font-semibold text-slate-100">Inbox "Jogar o Grosso"</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Suba um PDF bruto, cole transcrição de aula ou texto bagunçado. A IA identifica a matéria, indexa no RAG, cria conceitos, flashcards e um quiz automático.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Título do material (ex: Aula 04 - Árvores AVL)"
                value={inboxTitle}
                onChange={(e) => setInboxTitle(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100"
                required
              />
              <select
                value={inboxSubjectId}
                onChange={(e) => setInboxSubjectId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100"
              >
                <option value="">Deixar a IA classificar / criar matéria</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    Forçar em: {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-dashed border-slate-700 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                {inboxFileName ? (
                  <span className="text-cyan-300 font-medium">PDF pronto: {inboxFileName}</span>
                ) : (
                  'Opcional: envie um PDF de slides, apostila ou artigo'
                )}
              </div>
              <label className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 cursor-pointer">
                Escolher PDF
                <input type="file" accept="application/pdf" onChange={handlePdfSelect} className="hidden" />
              </label>
            </div>

            <textarea
              rows={7}
              placeholder="Ou cole aqui o texto bruto (anotações da aula, resumo, transcrição)..."
              value={inboxText}
              onChange={(e) => setInboxText(e.target.value)}
              className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100"
            />

            <button
              type="submit"
              disabled={triaging || !inboxTitle.trim() || (!inboxText.trim() && !inboxFileBase64)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-cyan-500 text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
            >
              {triaging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {triaging ? 'Processando com Gemini + RAG...' : 'Organizar, Indexar e Gerar Quiz'}
            </button>
          </form>

          <div className="lg:col-span-5">
            {triageResult ? (
              <div className="p-5 rounded-2xl bg-slate-900/70 border border-emerald-500/30 space-y-3">
                <div className="flex items-center gap-2 text-emerald-300 font-medium text-sm">
                  <CheckCircle2 className="w-4 h-4" />
                  Material Organizado!
                </div>
                <div className="text-xs text-slate-300 space-y-1">
                  <div>
                    <strong>Matéria:</strong> {triageResult.classification.subjectName}{' '}
                    {triageResult.classification.isNewSubject && '(nova)'}
                  </div>
                  <div>
                    <strong>Subtópico:</strong> {triageResult.classification.subtopic}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2">
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                    <div className="text-lg font-bold text-cyan-300">{triageResult.createdConcepts}</div>
                    <div className="text-[11px] text-slate-400">Conceitos</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                    <div className="text-lg font-bold text-cyan-300">{triageResult.createdFlashcards}</div>
                    <div className="text-[11px] text-slate-400">Flashcards</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                    <div className="text-lg font-bold text-emerald-300">
                      {triageResult.createdQuizId ? '1' : '0'}
                    </div>
                    <div className="text-[11px] text-slate-400">Quiz</div>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  O conteúdo também foi indexado no Tutor IA para consultas sem alucinação.
                </p>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 space-y-2 text-xs text-slate-400">
                <div className="flex items-center gap-2 text-slate-300 font-medium text-sm">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  Como funciona o Inbox
                </div>
                <p>1. Você joga o material bruto sem perder tempo organizando pastas.</p>
                <p>2. A IA extrai os conceitos-chave, gera flashcards SM-2 e cria um quiz de fixação.</p>
                <p>3. O texto é fatiado com embeddings (`gemini-embedding-001`) para o Tutor IA.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
