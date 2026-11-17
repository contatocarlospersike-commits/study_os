import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Layers,
  LayoutTemplate,
  Loader2,
  Maximize2,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type { AnimatedLesson, AnimatedScene, Subject } from '../types';

interface AnimatedLessonStudioProps {
  subjects: Subject[];
  onNotify: (title: string, msg: string) => void;
}

interface UploadedAttachment {
  id: string;
  name: string;
  mimeType: string;
  progress: number;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  uri?: string;
  error?: string;
}

function sanitizeSvg(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('<svg')) return null;
  return trimmed
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
}

const EXAMPLE_DECK: AnimatedLesson = {
  id: 'example-deck',
  subject_id: null,
  subject_name: 'Exemplo Study OS',
  title: 'Teoria dos Conjuntos — Guia Feynman Interativo',
  target_minutes: 15,
  technique: 'Feynman + Diagramas + Active Recall',
  source_summary: 'Exemplo completo no padrão Feynman com diagramas SVG customizados e teste ativo.',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  modules: [
    {
      index: 0,
      title: 'Fundamentos e Operações',
      goal: 'Dominar conjuntos, pertinência, subconjuntos e operações.',
      minutes: 15,
      expanded: true,
    },
  ],
  scenes: [
    {
      id: 'ex-1',
      module_index: 0,
      category: 'FUNDAMENTOS',
      slide_layout: 'diagram_flow',
      scene_title: 'O que é um conjunto?',
      duration_sec: 120,
      simple_words:
        'Pense numa sacola. Tudo o que está dentro tem algo em comum (ex.: todas são vogais). A sacola é o conjunto; cada coisa dentro dela é um elemento.',
      formal_definition:
        'Conjunto é todo agrupamento de objetos bem definidos cujos componentes compartilham uma característica em comum. Conceito primitivo: a ideia usual de coleção.',
      example:
        'A = {a, e, i, o, u} é o conjunto das vogais do alfabeto. Conjuntos usam letras MAIÚSCULAS (A, B); elementos usam minúsculas ou algarismos.',
      common_error:
        'Não confunda conjunto (A, maiúscula = a sacola) com elemento (a, minúscula = o item dentro).',
      feynman_test:
        'Explique em uma frase, sem olhar: o que é conjunto e o que é elemento? Dê um exemplo seu.',
      feynman_answer_hint:
        'Conjunto é a coleção/sacola (letra maiúscula) e elemento é cada item que pertence a ela (ex: Dias = {seg, ter, qua...}).',
      diagram_svg: `<svg viewBox="0 0 460 280" xmlns="http://www.w3.org/2000/svg">
        <text x="230" y="28" text-anchor="middle" fill="#60a5fa" font-size="16" font-weight="700" font-family="sans-serif">Conjunto A (Vogais)</text>
        <ellipse cx="230" cy="145" rx="165" ry="95" fill="rgba(59,130,246,0.14)" stroke="#3b82f6" stroke-width="2.5"/>
        <circle cx="155" cy="135" r="20" fill="#2563eb"/><text x="155" y="140" text-anchor="middle" fill="#fff" font-size="15" font-weight="700" font-family="sans-serif">a</text>
        <circle cx="230" cy="100" r="20" fill="#2563eb"/><text x="230" y="105" text-anchor="middle" fill="#fff" font-size="15" font-weight="700" font-family="sans-serif">e</text>
        <circle cx="305" cy="135" r="20" fill="#2563eb"/><text x="305" y="140" text-anchor="middle" fill="#fff" font-size="15" font-weight="700" font-family="sans-serif">i</text>
        <circle cx="190" cy="188" r="20" fill="#2563eb"/><text x="190" y="193" text-anchor="middle" fill="#fff" font-size="15" font-weight="700" font-family="sans-serif">o</text>
        <circle cx="275" cy="188" r="20" fill="#2563eb"/><text x="275" y="193" text-anchor="middle" fill="#fff" font-size="15" font-weight="700" font-family="sans-serif">u</text>
        <circle cx="120" cy="262" r="14" fill="#3f3f46"/><text x="120" y="266" text-anchor="middle" fill="#e4e4e7" font-size="12" font-weight="700" font-family="sans-serif">b</text>
        <circle cx="160" cy="262" r="14" fill="#3f3f46"/><text x="160" y="266" text-anchor="middle" fill="#e4e4e7" font-size="12" font-weight="700" font-family="sans-serif">k</text>
        <text x="275" y="266" fill="#fb7185" font-size="12" font-weight="600" font-family="sans-serif">✗ não são vogais → ficam de fora</text>
      </svg>`,
      narration: 'Conjunto é a coleção (a sacola) e elementos são os itens dentro dela.',
      visual_nodes: [],
      connections: [],
      key_takeaway: 'Conjuntos (maiúscula) agrupam elementos (minúscula) com uma regra clara.',
      sources_hint: 'Matemática Elementar · Aula 1',
    },
    {
      id: 'ex-2',
      module_index: 0,
      category: 'OPERAÇÕES COM CONJUNTOS',
      slide_layout: 'diagram_flow',
      scene_title: 'União (A ∪ B) vs Interseção (A ∩ B)',
      duration_sec: 120,
      simple_words:
        'União (∪) é juntar as duas sacolas numa só (repetido entra uma vez). Interseção (∩) é ficar só com o que está nas duas ao mesmo tempo.',
      formal_definition:
        'A ∪ B = { x | x ∈ A ou x ∈ B } (conectivo lógico OU). A ∩ B = { x | x ∈ A e x ∈ B } (conectivo lógico E).',
      example:
        'Se A = {1, 2, 3} e B = {3, 4, 5}, então A ∪ B = {1, 2, 3, 4, 5} e A ∩ B = {3}.',
      common_error:
        'Macete: ∪ parece um copo que recebe tudo (OU). ∩ parece uma ponte que só deixa passar quem está nos dois (E). Nunca repita elementos na união.',
      feynman_test:
        'Para A = {a, e, i} e B = {i, o, u}, qual é A ∪ B e qual é A ∩ B?',
      feynman_answer_hint:
        'A ∪ B = {a, e, i, o, u} (o "i" aparece só 1x) e A ∩ B = {i} (único em comum).',
      diagram_svg: `<svg viewBox="0 0 460 280" xmlns="http://www.w3.org/2000/svg">
        <text x="145" y="34" text-anchor="middle" fill="#60a5fa" font-size="15" font-weight="700" font-family="sans-serif">A</text>
        <text x="315" y="34" text-anchor="middle" fill="#fbbf24" font-size="15" font-weight="700" font-family="sans-serif">B</text>
        <circle cx="175" cy="130" r="82" fill="rgba(59,130,246,0.22)" stroke="#3b82f6" stroke-width="2.5"/>
        <circle cx="285" cy="130" r="82" fill="rgba(245,158,11,0.22)" stroke="#f59e0b" stroke-width="2.5"/>
        <text x="135" y="125" text-anchor="middle" fill="#e4e4e7" font-size="15" font-weight="700" font-family="sans-serif">1  2</text>
        <text x="230" y="135" text-anchor="middle" fill="#34d399" font-size="20" font-weight="800" font-family="sans-serif">3</text>
        <text x="325" y="125" text-anchor="middle" fill="#e4e4e7" font-size="15" font-weight="700" font-family="sans-serif">4  5</text>
        <rect x="45" y="232" width="175" height="34" rx="10" fill="rgba(52,211,153,0.14)" stroke="#34d399"/>
        <text x="132" y="253" text-anchor="middle" fill="#6ee7b7" font-size="12" font-weight="700" font-family="sans-serif">A ∪ B = {1, 2, 3, 4, 5}</text>
        <rect x="240" y="232" width="175" height="34" rx="10" fill="rgba(56,189,248,0.14)" stroke="#38bdf8"/>
        <text x="327" y="253" text-anchor="middle" fill="#7dd3fc" font-size="12" font-weight="700" font-family="sans-serif">A ∩ B = {3}</text>
      </svg>`,
      narration: 'União junta tudo (OU) e Interseção pega apenas a sobreposição (E).',
      visual_nodes: [],
      connections: [],
      key_takeaway: '∪ = OU (tudo junto, sem repetir) · ∩ = E (só o que é comum).',
      sources_hint: 'Operações com Conjuntos',
    },
  ],
};

function SlideIllustration({ scene }: { scene: AnimatedScene }) {
  const nodes = scene.visual_nodes.slice(0, 3);
  const coords =
    nodes.length === 1
      ? [{ x: 260, y: 120 }]
      : nodes.length === 2
        ? [
            { x: 140, y: 120 },
            { x: 380, y: 120 },
          ]
        : [
            { x: 260, y: 58 },
            { x: 125, y: 175 },
            { x: 395, y: 175 },
          ];
  const mapByLabel = new Map<string, { x: number; y: number }>();
  nodes.forEach((n, i) => mapByLabel.set(n.label.toLowerCase().trim(), coords[i]));

  return (
    <svg viewBox="0 0 520 240" className="w-full rounded-xl border border-zinc-800/80 bg-[#080c17]">
      <defs>
        <marker id="slide-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
        </marker>
      </defs>
      {(scene.connections || []).map((c, idx) => {
        const from = mapByLabel.get(c.from.toLowerCase().trim()) || coords[0];
        const to = mapByLabel.get(c.to.toLowerCase().trim()) || coords[Math.min(idx + 1, coords.length - 1)];
        if (!from || !to) return null;
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2 - 12;
        return (
          <g key={idx}>
            <line
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke="#38bdf8"
              strokeWidth="2"
              strokeOpacity="0.7"
              markerEnd="url(#slide-arrow)"
            />
            <rect x={mx - 42} y={my - 9} width="84" height="18" rx="9" fill="#0f172a" stroke="#1e293b" />
            <text x={mx} y={my + 3} textAnchor="middle" fill="#7dd3fc" fontSize="9.5" fontWeight="600">
              {c.label.slice(0, 16)}
            </text>
          </g>
        );
      })}
      {nodes.map((n, i) => {
        const p = coords[i];
        const stroke =
          n.kind === 'warning'
            ? '#fb7185'
            : n.kind === 'analogy'
              ? '#22d3ee'
              : n.kind === 'example'
                ? '#34d399'
                : '#818cf8';
        return (
          <g key={i} transform={`translate(${p.x}, ${p.y})`}>
            <rect x="-86" y="-28" width="172" height="56" rx="12" fill="#0f172a" stroke={stroke} strokeWidth="1.6" />
            <text x="0" y="-4" textAnchor="middle" fill="#ffffff" fontSize="11.5" fontWeight="700">
              {n.label.slice(0, 22)}
            </text>
            <text x="0" y="14" textAnchor="middle" fill="#a1a1aa" fontSize="9.5">
              {n.detail.slice(0, 28)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export const AnimatedLessonStudio: React.FC<AnimatedLessonStudioProps> = ({
  subjects,
  onNotify,
}) => {
  const [decks, setDecks] = useState<AnimatedLesson[]>([]);
  const [activeDeck, setActiveDeck] = useState<AnimatedLesson | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);

  // Form
  const [subjectId, setSubjectId] = useState<string>(subjects[0]?.id || '');
  const [topicHint, setTopicHint] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [targetMinutes, setTargetMinutes] = useState<number>(30);
  const [technique, setTechnique] = useState('Feynman + Diagramas + Exemplos');

  // Direct Multi-File Upload (PDFs, Audios, Videos) to Gemini Files API
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);

  const [generating, setGenerating] = useState(false);
  const [genSeconds, setGenSeconds] = useState(0);
  const [genError, setGenError] = useState('');
  const [expandingModuleIdx, setExpandingModuleIdx] = useState<number | null>(null);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [speakingSlide, setSpeakingSlide] = useState(false);
  const [feynmanInputs, setFeynmanInputs] = useState<Record<string, string>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});

  const deckContainerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!generating) {
      setGenSeconds(0);
      return;
    }
    const id = setInterval(() => setGenSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [generating]);

  useEffect(() => {
    if (!subjectId && subjects[0]?.id) setSubjectId(subjects[0].id);
  }, [subjects, subjectId]);

  useEffect(() => {
    api
      .getAnimatedLessons()
      .then((list) => {
        setDecks(list);
        if (list[0]) setActiveDeck(list[0]);
      })
      .catch(() => {});
  }, []);

  const slides = activeDeck?.scenes || [];
  const currentSlide: AnimatedScene | undefined = slides[slideIdx];

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!activeDeck) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'ArrowRight') setSlideIdx((i) => Math.min(slides.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setSlideIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeDeck, slides.length]);

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if ('speechSynthesis' in globalThis) globalThis.speechSynthesis.cancel();
    setSpeakingSlide(false);
  };

  useEffect(() => {
    stopAudio();
  }, [slideIdx, activeDeck?.id]);

  const handleToggleReadSlide = async () => {
    if (!currentSlide) return;
    if (speakingSlide) {
      stopAudio();
      return;
    }
    setSpeakingSlide(true);
    try {
      const res = await api.generateTts({ text: currentSlide.narration, voice: 'Kore' });
      const bin = atob(res.audio_base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: res.mime_type || 'audio/wav' }));
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setSpeakingSlide(false);
      await audio.play();
    } catch {
      setSpeakingSlide(false);
    }
  };

  const updateAttachment = (id: string, patch: Partial<UploadedAttachment>) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const uploadDirectToGoogle = (
    file: File,
    uploadUrl: string,
    onProgress: (pct: number) => void
  ): Promise<{ file?: { name?: string; uri?: string } }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);
      xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
      xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) onProgress(Math.round((evt.loaded / evt.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText || '{}'));
          } catch {
            resolve({});
          }
        } else {
          reject(new Error(`Falha no upload (${xhr.status}): ${xhr.responseText || xhr.statusText}`));
        }
      };
      xhr.onerror = () => reject(new Error('Erro de rede ao enviar direto para o Google Gemini.'));
      xhr.send(file);
    });

  const uploadSingleFileToGemini = async (file: File, id: string, fallbackMime: string) => {
    const mimeType = file.type || fallbackMime;
    const PROXY_LIMIT = 3.5 * 1024 * 1024; // <= 3.5 MB vai em 1 unico request pelo backend (sem CORS)
    try {
      const { uploadUrl } = await api.startMediaUpload({
        filename: file.name,
        mime_type: mimeType,
        size_bytes: file.size,
      });

      let uploadedData: { file?: { name?: string; uri?: string } } = {};
      if (file.size <= PROXY_LIMIT) {
        uploadedData = await api.uploadMediaChunk({
          uploadUrl,
          offset: 0,
          command: 'upload, finalize',
          chunk: file,
        });
        updateAttachment(id, { progress: 100 });
      } else {
        try {
          uploadedData = await uploadDirectToGoogle(file, uploadUrl, (pct) =>
            updateAttachment(id, { progress: pct })
          );
        } catch {
          // 1 retry automático caso a conexão oscile
          uploadedData = await uploadDirectToGoogle(file, uploadUrl, (pct) =>
            updateAttachment(id, { progress: pct })
          );
        }
      }

      const fileName = uploadedData.file?.name;
      let uri = uploadedData.file?.uri;
      if (fileName) {
        updateAttachment(id, { status: 'processing', progress: 100 });
        for (let i = 0; i < 20; i++) {
          const st = await api.checkMediaStatus(fileName);
          if (st.state === 'ACTIVE') {
            uri = st.uri;
            break;
          }
          if (st.state === 'FAILED') {
            throw new Error('Falha ao processar arquivo no Gemini.');
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      if (!uri) throw new Error('URI de mídia indisponível.');
      updateAttachment(id, { status: 'ready', progress: 100, uri });
    } catch (err) {
      const msg = (err as Error).message || 'Erro no upload';
      updateAttachment(id, { status: 'error', error: msg });
      onNotify(`Erro em ${file.name}`, msg);
    }
  };

  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>, fallbackMime: string) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setGenError('');

    const newItems: UploadedAttachment[] = files.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      mimeType: file.type || fallbackMime,
      progress: 0,
      status: 'uploading',
    }));

    setAttachments((prev) => [...prev, ...newItems]);
    void (async () => {
      for (let idx = 0; idx < files.length; idx++) {
        await uploadSingleFileToGemini(files[idx], newItems[idx].id, fallbackMime);
      }
    })();
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const expandRemainingModules = async (
    deck: AnimatedLesson,
    mediaFiles?: Array<{ uri: string; mime_type: string; name?: string }>
  ) => {
    for (const mod of deck.modules) {
      if (mod.expanded) continue;
      setExpandingModuleIdx(mod.index);
      try {
        const res = await api.expandAnimatedLessonModule(deck.id, {
          module_index: mod.index,
          media_files: mediaFiles,
        });
        setActiveDeck((prev) =>
          prev && prev.id === deck.id ? { ...prev, modules: res.modules, scenes: res.scenes } : prev
        );
        setDecks((prev) =>
          prev.map((d) => (d.id === deck.id ? { ...d, modules: res.modules, scenes: res.scenes } : d))
        );
      } catch {
        break;
      }
    }
    setExpandingModuleIdx(null);
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (generating) return;
    setGenError('');
    if (attachments.some((a) => a.status === 'uploading' || a.status === 'processing')) {
      setGenError('Espere todos os arquivos terminarem de enviar/processar antes de gerar os slides.');
      return;
    }
    const readyFiles = attachments
      .filter((a) => a.status === 'ready' && a.uri)
      .map((a) => ({ uri: a.uri!, mime_type: a.mimeType, name: a.name }));

    if (!topicHint.trim() && !transcriptText.trim() && readyFiles.length === 0 && !subjectId) {
      setGenError('Escolha uma matéria, digite o tema ou suba pelo menos um arquivo.');
      return;
    }
    setGenerating(true);
    try {
      const created = await api.generateAnimatedLesson({
        subject_id: subjectId || null,
        topic_hint: topicHint.trim(),
        transcript_text: transcriptText.trim(),
        media_files: readyFiles.length > 0 ? readyFiles : undefined,
        target_minutes: targetMinutes,
        technique,
      });
      setDecks((prev) => [created, ...prev]);
      setActiveDeck(created);
      setSlideIdx(0);
      onNotify('Slides gerados!', 'Os primeiros slides já estão prontos — demais módulos carregam em segundo plano.');
      if (created.modules.some((m) => !m.expanded)) {
        void expandRemainingModules(created, readyFiles.length > 0 ? readyFiles : undefined);
      }
    } catch (err) {
      const msg = (err as Error).message || 'Erro ao gerar slides';
      setGenError(msg);
      onNotify('Erro ao gerar slides', msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveToWorkspace = async () => {
    if (!activeDeck || activeDeck.id === 'example-deck') {
      onNotify('Exemplo', 'Gere um deck real com seus conteúdos para salvar no Workspace.');
      return;
    }
    const targetSub = activeDeck.subject_id || subjectId || subjects[0]?.id;
    if (!targetSub) {
      onNotify('Selecione uma matéria', 'Crie uma matéria no Workspace primeiro.');
      return;
    }
    setSavingWorkspace(true);
    try {
      await api.saveAnimatedLessonToWorkspace(activeDeck.id, targetSub);
      onNotify('Salvo no Workspace!', 'Apresentação salva como nota organizada na matéria.');
    } catch (err) {
      onNotify('Erro ao salvar', (err as Error).message);
    } finally {
      setSavingWorkspace(false);
    }
  };

  const layout = currentSlide?.slide_layout || (currentSlide?.connections?.length ? 'diagram_flow' : 'concept_cards');

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-indigo-200">
            Gerador de Slides Didáticos & Ilustrados (estilo Gamma / Keynote)
          </p>
          <p className="text-[11px] text-indigo-200/75">
            Transforma PDFs, MP4 de aulas ou temas em decks profundos com diagramas, exemplos, código e armadilhas de prova.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setActiveDeck(EXAMPLE_DECK);
            setSlideIdx(0);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          Ver Deck de Exemplo
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Deck Generator Form */}
        <form
          onSubmit={handleGenerate}
          className="space-y-3.5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-4"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Layers className="h-4 w-4 text-indigo-400" />
            Gerar Apresentação Completa
          </h3>

          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
          >
            <option value="">Tema livre (sem matéria)</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon || '📚'} {s.name}
              </option>
            ))}
          </select>

          <input
            value={topicHint}
            onChange={(e) => setTopicHint(e.target.value)}
            placeholder="Tema da apresentação (ex: Árvores AVL, Limites...)"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder:text-zinc-500"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-zinc-400">Profundidade</label>
              <select
                value={targetMinutes}
                onChange={(e) => setTargetMinutes(Number(e.target.value))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-white"
              >
                <option value={5}>Rápida (~6 slides)</option>
                <option value={15}>Objetiva (~12 slides)</option>
                <option value={30}>Completa (~18 slides)</option>
                <option value={60}>Masterclass (~25 slides)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-zinc-400">Abordagem</label>
              <select
                value={technique}
                onChange={(e) => setTechnique(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-white"
              >
                <option value="Feynman + Diagramas + Exemplos">Feynman + Diagramas</option>
                <option value="Mapas Mentais & Conexões">Mapas Mentais</option>
                <option value="Foco em Prova & Armadilhas">Foco em Prova</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/70 px-2.5 py-2 text-[11px] text-zinc-300 hover:border-cyan-400">
              <Upload className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
              <span className="truncate">+ Áudios / Vídeos</span>
              <input
                type="file"
                multiple
                accept="video/mp4,video/webm,video/quicktime,audio/*"
                onChange={(e) => handleFilesSelect(e, 'audio/mpeg')}
                className="hidden"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/70 px-2.5 py-2 text-[11px] text-zinc-300 hover:border-indigo-400">
              <Upload className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
              <span className="truncate">+ PDFs / Slides</span>
              <input
                type="file"
                multiple
                accept="application/pdf"
                onChange={(e) => handleFilesSelect(e, 'application/pdf')}
                className="hidden"
              />
            </label>
          </div>

          {attachments.length > 0 && (
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/60 p-2">
              <div className="flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                <span>Arquivos na fila ({attachments.length})</span>
                <span>{attachments.filter((a) => a.status === 'ready').length} prontos</span>
              </div>
              {attachments.map((att) => {
                const isPdf = att.mimeType.includes('pdf');
                return (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/70 px-2 py-1.5 text-[11px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
                            isPdf ? 'bg-indigo-500/20 text-indigo-300' : 'bg-cyan-500/20 text-cyan-300'
                          }`}
                        >
                          {isPdf ? 'PDF' : 'Mídia'}
                        </span>
                        <span className="truncate text-zinc-200">{att.name}</span>
                      </div>
                      {att.status === 'uploading' && (
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                          <div className="h-full bg-cyan-400 transition-all" style={{ width: `${att.progress}%` }} />
                        </div>
                      )}
                      {att.status === 'processing' && (
                        <span className="text-[10px] text-amber-300">Processando no Gemini...</span>
                      )}
                      {att.status === 'error' && (
                        <span className="text-[10px] text-rose-300">{att.error || 'Erro'}</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {att.status === 'ready' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                      {(att.status === 'uploading' || att.status === 'processing') && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        className="rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
                        title="Remover arquivo"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <textarea
            rows={3}
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            placeholder="Ou cole anotações / objetivos..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-white placeholder:text-zinc-500"
          />

          <button
            type="submit"
            disabled={generating}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? `Gerando slides... (${genSeconds}s)` : 'Gerar Slides Completos'}
          </button>

          {genError && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-200">
              {genError}
            </div>
          )}

          {decks.length > 0 && (
            <div className="space-y-1.5 border-t border-zinc-800 pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Decks Salvos ({decks.length})
              </span>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {decks.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => {
                      setActiveDeck(d);
                      setSlideIdx(0);
                    }}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs ${
                      activeDeck?.id === d.id
                        ? 'border-indigo-500/60 bg-indigo-500/15 text-white'
                        : 'border-zinc-800 bg-zinc-950/60 text-zinc-300'
                    }`}
                  >
                    <span className="truncate">{d.title}</span>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await api.deleteAnimatedLesson(d.id);
                        setDecks((p) => p.filter((x) => x.id !== d.id));
                        if (activeDeck?.id === d.id) setActiveDeck(null);
                      }}
                      className="ml-2 text-zinc-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Right: Keynote / Gamma Style Slide Presenter */}
        <div className="lg:col-span-8">
          {activeDeck && currentSlide ? (
            <div
              ref={deckContainerRef}
              className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
            >
              {/* Deck Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/70 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] text-indigo-300">
                    <span>{activeDeck.technique}</span>
                    <span>•</span>
                    <span>
                      Slide {slideIdx + 1} de {slides.length}
                    </span>
                    {expandingModuleIdx !== null && (
                      <span className="inline-flex items-center gap-1 text-cyan-300">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Expandindo módulo {expandingModuleIdx + 1}...
                      </span>
                    )}
                  </div>
                  <h3 className="truncate text-sm font-bold text-white">{activeDeck.title}</h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleReadSlide}
                    className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs ${
                      speakingSlide
                        ? 'border-cyan-500 bg-cyan-500/20 text-cyan-300'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white'
                    }`}
                    title="Ouvir explicação deste slide"
                  >
                    {speakingSlide ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    Ouvir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const el = deckContainerRef.current;
                      if (!el) return;
                      if (document.fullscreenElement) void document.exitFullscreen();
                      else void el.requestFullscreen?.();
                    }}
                    className="rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 text-zinc-300 hover:text-white"
                    title="Tela cheia"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveToWorkspace}
                    disabled={savingWorkspace}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:border-indigo-400 hover:text-white"
                  >
                    {savingWorkspace ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5 text-indigo-400" />}
                    Salvar no Workspace
                  </button>
                </div>
              </div>

              {/* Feynman 2-Column Interactive Slide Canvas */}
              <div className="relative space-y-4 bg-gradient-to-br from-[#0b0f1d] via-zinc-950 to-[#0d111e] p-5 md:p-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                    {currentSlide.category || `SLIDE ${slideIdx + 1}`}
                  </span>
                  {currentSlide.sources_hint && (
                    <span className="text-[11px] text-zinc-500">Fonte: {currentSlide.sources_hint}</span>
                  )}
                </div>

                <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {currentSlide.scene_title}
                </h2>

                {currentSlide.simple_words || currentSlide.formal_definition || currentSlide.example ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                      {/* Left Column: Simple Words + Formal Definition + Example */}
                      <div className="space-y-3 lg:col-span-6">
                        {currentSlide.simple_words && (
                          <div className="rounded-xl border border-zinc-800 border-l-4 border-l-blue-500 bg-zinc-900/60 p-3.5">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                              Em Palavras Simples (Feynman)
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-200 sm:text-sm">
                              {currentSlide.simple_words}
                            </p>
                          </div>
                        )}

                        {currentSlide.formal_definition && (
                          <div className="rounded-xl border border-zinc-800 border-l-4 border-l-zinc-400 bg-zinc-900/60 p-3.5">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                              Definição Formal & Aprofundamento
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-zinc-200 sm:text-sm">
                              {currentSlide.formal_definition}
                            </p>
                          </div>
                        )}

                        {currentSlide.example && (
                          <div className="rounded-xl border border-zinc-800 border-l-4 border-l-emerald-500 bg-zinc-900/60 p-3.5">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                              Exemplo Passo a Passo
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-zinc-200 sm:text-sm">
                              {currentSlide.example}
                            </p>
                          </div>
                        )}

                        {currentSlide.example_or_code && (
                          <pre className="overflow-x-auto rounded-xl border border-emerald-500/30 bg-[#070b14] p-3.5 font-mono text-xs leading-relaxed text-emerald-200">
                            {currentSlide.example_or_code}
                          </pre>
                        )}
                      </div>

                      {/* Right Column: Custom Diagram SVG */}
                      <div className="flex flex-col justify-between rounded-2xl border border-zinc-800 bg-[#080c17] p-4 lg:col-span-6">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                          Diagrama Ilustrativo
                        </div>
                        {sanitizeSvg(currentSlide.diagram_svg) ? (
                          <div
                            className="my-auto flex w-full items-center justify-center py-2 [&>svg]:max-h-[290px] [&>svg]:w-full"
                            dangerouslySetInnerHTML={{
                              __html: sanitizeSvg(currentSlide.diagram_svg)!,
                            }}
                          />
                        ) : (
                          <div className="my-auto py-2">
                            <SlideIllustration scene={currentSlide} />
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] font-medium text-emerald-200">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          <span>{currentSlide.key_takeaway}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Common Error + Interactive Feynman Test */}
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {currentSlide.common_error && (
                        <div className="rounded-xl border border-zinc-800 border-l-4 border-l-rose-500 bg-rose-500/5 p-3.5">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Atenção · Erro Comum
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-zinc-200">
                            {currentSlide.common_error}
                          </p>
                        </div>
                      )}

                      {currentSlide.feynman_test && (
                        <div className="space-y-2 rounded-xl border border-zinc-800 border-l-4 border-l-violet-500 bg-violet-500/5 p-3.5">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-violet-300">
                            Teste Feynman · Active Recall
                          </div>
                          <p className="text-xs leading-relaxed text-zinc-100">
                            {currentSlide.feynman_test}
                          </p>
                          <div className="flex gap-2">
                            <input
                              value={feynmanInputs[currentSlide.id] || ''}
                              onChange={(e) =>
                                setFeynmanInputs((p) => ({ ...p, [currentSlide.id]: e.target.value }))
                              }
                              placeholder="Escreva sua resposta sem olhar..."
                              className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:border-violet-500 focus:outline-none"
                            />
                            {currentSlide.feynman_answer_hint && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRevealedAnswers((p) => ({
                                    ...p,
                                    [currentSlide.id]: !p[currentSlide.id],
                                  }))
                                }
                                className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500"
                              >
                                {revealedAnswers[currentSlide.id] ? 'Ocultar' : 'Ver Gabarito'}
                              </button>
                            )}
                          </div>
                          {revealedAnswers[currentSlide.id] && currentSlide.feynman_answer_hint && (
                            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[11px] text-emerald-200">
                              <strong>Gabarito:</strong> {currentSlide.feynman_answer_hint}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="max-w-3xl text-[15px] leading-relaxed text-zinc-200">
                      {currentSlide.narration}
                    </p>
                    {currentSlide.example_or_code && (
                      <pre className="overflow-x-auto rounded-xl border border-emerald-500/30 bg-[#070b14] p-4 font-mono text-xs leading-relaxed text-emerald-200">
                        {currentSlide.example_or_code}
                      </pre>
                    )}
                    {layout === 'diagram_flow' && currentSlide.connections?.length > 0 && (
                      <SlideIllustration scene={currentSlide} />
                    )}
                    <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-medium text-emerald-200">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      <span>{currentSlide.key_takeaway}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Slide Thumbnails & Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-900/80 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
                  disabled={slideIdx === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-200 hover:text-white disabled:opacity-40"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Anterior
                </button>

                <div className="flex max-w-md flex-wrap justify-center gap-1.5">
                  {slides.map((sc, i) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setSlideIdx(i)}
                      title={sc.scene_title}
                      className={`h-7 min-w-[28px] rounded-lg px-2 text-xs font-semibold transition ${
                        i === slideIdx
                          ? 'bg-indigo-600 text-white'
                          : 'border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setSlideIdx((i) => Math.min(slides.length - 1, i + 1))}
                  disabled={slideIdx >= slides.length - 1}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
                >
                  Próximo
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center">
              <LayoutTemplate className="h-10 w-10 text-indigo-400/70" />
              <p className="mt-3 text-base font-semibold text-white">
                Crie apresentações de slides completas e didáticas
              </p>
              <p className="mt-1 max-w-md text-xs text-zinc-400">
                Clique em <strong>Ver Deck de Exemplo</strong> acima ou envie seus PDFs/MP4/tema ao lado para gerar slides ilustrados com diagramas, código e armadilhas de prova.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
