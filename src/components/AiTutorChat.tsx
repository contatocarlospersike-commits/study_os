import { useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';
import {
  AlertCircle,
  BookMarked,
  CheckCircle2,
  FileUp,
  Languages,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { api } from '../api/client';
import type { ChatMessage, Material, Subject } from '../types';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'strict',
});

function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('');
  const id = useId().replace(/:/g, '');

  useEffect(() => {
    if (!chart.trim()) return;
    let cancelled = false;
    mermaid
      .render(`mmd-${id}`, chart)
      .then((res) => {
        if (!cancelled) setSvg(res.svg);
      })
      .catch(() => {
        if (!cancelled) setSvg('');
      });
    return () => {
      cancelled = true;
    };
  }, [chart, id]);

  if (!svg) return null;
  return (
    <div
      className="my-3 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

interface AiTutorChatProps {
  subjects: Subject[];
}

export function AiTutorChat({ subjects }: AiTutorChatProps) {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(subjects[0]?.id || '');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [threadId, setThreadId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [thinkingSec, setThinkingSec] = useState(0);
  const [lastQuestion, setLastQuestion] = useState('');
  const [englishMode, setEnglishMode] = useState(false);
  const [modelMode, setModelMode] = useState<'fast' | 'deep'>('fast');
  const [chatError, setChatError] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!sending) {
      setThinkingSec(0);
      return;
    }
    const id = setInterval(() => setThinkingSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [sending]);

  const loadMaterials = async () => {
    const list = await api.getMaterials();
    setMaterials(list);
  };

  useEffect(() => {
    void loadMaterials();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        const buffer = await file.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        await api.ingestMaterial({
          title: file.name,
          subject_id: selectedSubjectId || null,
          file_type: 'pdf',
          content_base64: base64,
        });
      } else {
        const text = await file.text();
        await api.ingestMaterial({
          title: file.name,
          subject_id: selectedSubjectId || null,
          file_type: 'text',
          text_content: text,
        });
      }
      await loadMaterials();
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSend = async (customText?: string) => {
    const question = (customText ?? input).trim();
    if (!question || sending) return;
    setChatError('');
    setLastQuestion(question);
    if (!customText) setInput('');

    const optimisticUser: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: question,
      citations: [],
      mermaid_diagram: '',
      grounding_status: 'grounded',
      verified_by_critic: false,
      follow_up_questions: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);
    setSending(true);

    try {
      const res = await api.sendChatMessage({
        thread_id: threadId,
        subject_id: selectedSubjectId || null,
        message: question,
        english_practice_mode: englishMode,
        model_mode: modelMode,
      });
      setThreadId(res.threadId);
      setMessages((prev) => [...prev, res.message]);
    } catch (err) {
      setChatError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">
            RAG Híbrido · Notas + Livros + Feynman · Critic Pass
          </p>
          <h1 className="heading-fluid font-bold text-zinc-50">Tutor IA Anti-Alucinação</h1>
        </div>

        <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900/70 p-1">
          <button
            type="button"
            onClick={() => setModelMode('fast')}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
              modelMode === 'fast' ? 'bg-cyan-500/20 text-cyan-300' : 'text-zinc-400 hover:text-white'
            }`}
          >
            ⚡ Rápido (3.5 Flash)
          </button>
          <button
            type="button"
            onClick={() => setModelMode('deep')}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
              modelMode === 'deep' ? 'bg-indigo-500/25 text-indigo-200' : 'text-zinc-400 hover:text-white'
            }`}
          >
            🧠 Profundo (2.5 Pro)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filtrar por matéria"
            value={selectedSubjectId}
            onChange={(e) => setSelectedSubjectId(e.target.value)}
            className="min-h-[42px] rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-100"
          >
            <option value="">Todas as matérias</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setEnglishMode((v) => !v)}
            className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${
              englishMode
                ? 'border-violet-400 bg-violet-950/40 text-violet-200'
                : 'border-zinc-700 bg-zinc-900 text-zinc-300'
            }`}
          >
            <Languages className="h-4 w-4" />
            Inglês Técnico: {englishMode ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        {/* Materiais Indexados (RAG) */}
        <aside className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 lg:col-span-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-100">Materiais Indexados (RAG)</h2>
            <span className="text-xs text-zinc-400">{materials.length} arquivo(s)</span>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,.md"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-cyan-500/50 bg-cyan-950/20 px-3 text-xs font-semibold text-cyan-300 hover:bg-cyan-950/40 disabled:opacity-50"
          >
            <FileUp className="h-4 w-4" />
            {uploading ? 'Processando & Vetorizando...' : 'Subir PDF / Slide / TXT'}
          </button>

          {uploadError && (
            <p className="rounded-xl border border-rose-500/40 bg-rose-950/40 p-2.5 text-xs text-rose-200">
              {uploadError}
            </p>
          )}

          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {materials.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Suba um PDF (ex.: Plano de Ensino ou aula) para o Tutor responder com citações exatas de página.
              </p>
            ) : (
              materials.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-zinc-100">{m.title}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      {m.page_count} pág. · {m.chunk_count} trechos
                      {m.subject_name ? ` · ${m.subject_name}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Remover material"
                    onClick={async () => {
                      await api.deleteMaterial(m.id);
                      await loadMaterials();
                    }}
                    className="shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* Chat Tutor */}
        <section className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 lg:col-span-8">
          <div className="max-h-[520px] min-h-[340px] space-y-4 overflow-y-auto pr-1">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Sparkles className="h-8 w-8 text-cyan-400" />
                <p className="mt-3 text-sm font-semibold text-zinc-100">
                  Pergunte sobre seus PDFs, slides ou notas
                </p>
                <p className="mt-1 max-w-md text-xs text-zinc-400">
                  Cada resposta passa por Busca Híbrida + Citação de Página + Verificação Anti-Alucinação (Critic Pass).
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {[
                    'Resuma os conceitos centrais com um diagrama visual',
                    'Me faça 3 perguntas difíceis de Active Recall',
                    'Transforme este tema em um roteiro de mini-aula (Feynman)',
                  ].map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void handleSend(q)}
                      className="rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 hover:border-cyan-500"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-2xl p-4 ${
                  msg.role === 'user'
                    ? 'ml-auto max-w-[85%] bg-cyan-500/15 text-cyan-50'
                    : 'border border-zinc-800 bg-zinc-950/90 text-zinc-100'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        msg.grounding_status === 'grounded'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : msg.grounding_status === 'partial'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-zinc-800 text-zinc-300'
                      }`}
                    >
                      {msg.grounding_status === 'grounded' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <AlertCircle className="h-3 w-3" />
                      )}
                      {msg.grounding_status === 'grounded'
                        ? '100% Ancorado nos Materiais'
                        : msg.grounding_status === 'partial'
                          ? 'Parcialmente nos Materiais'
                          : 'Fora dos Materiais Enviados'}
                    </span>

                    {msg.verified_by_critic && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-cyan-300">
                        <ShieldCheck className="h-3 w-3" />
                        Verificado (Critic)
                      </span>
                    )}
                  </div>
                )}

                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>

                {msg.mermaid_diagram && <MermaidBlock chart={msg.mermaid_diagram} />}

                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-3 space-y-1.5 border-t border-zinc-800 pt-2.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400">
                      <BookMarked className="h-3.5 w-3.5 text-cyan-400" />
                      Fontes Citadas
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {msg.citations.map((c, idx) => (
                        <details
                          key={idx}
                          className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300"
                        >
                          <summary className="cursor-pointer font-medium text-cyan-300">
                            {c.materialTitle} · pág. {c.pageNumber}
                          </summary>
                          <p className="mt-1 text-zinc-400">"{c.quote}"</p>
                        </details>
                      ))}
                    </div>
                  </div>
                )}

                {msg.follow_up_questions && msg.follow_up_questions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-800 pt-2.5">
                    {msg.follow_up_questions.map((fq, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => void handleSend(fq)}
                        className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-left text-[11px] text-amber-200 hover:border-amber-500/50"
                      >
                        ? {fq}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="mr-auto max-w-[85%] rounded-2xl border border-cyan-500/30 bg-zinc-950/90 px-4 py-3 text-zinc-200">
                <div className="flex items-center gap-2.5 text-xs font-medium text-cyan-300">
                  <span className="h-2.5 w-2.5 animate-ping rounded-full bg-cyan-400" />
                  <span>
                    {thinkingSec < 2
                      ? 'Buscando trechos nos seus materiais (RAG)...'
                      : thinkingSec < 5
                        ? 'Elaborando resposta com citações...'
                        : 'Auditando resposta contra alucinações (Crítico)...'}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-zinc-400">{thinkingSec}s</span>
                </div>
              </div>
            )}
          </div>

          {chatError && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/40 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>Erro ao gerar resposta: {chatError}</span>
              </div>
              {lastQuestion && (
                <button
                  type="button"
                  onClick={() => void handleSend(lastQuestion)}
                  className="rounded-lg bg-rose-500/20 px-2.5 py-1 font-semibold text-rose-100 hover:bg-rose-500/30"
                >
                  Tentar novamente
                </button>
              )}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="mt-4 flex gap-2 border-t border-zinc-800 pt-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte algo sobre suas aulas, PDFs ou peça um diagrama..."
              className="min-h-[46px] flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-500"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-zinc-950 hover:bg-cyan-400 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Verificando...' : 'Enviar'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
