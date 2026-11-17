import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Film,
  Loader2,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { api } from '../api/client';
import type { AnimatedLesson, AnimatedScene, Subject } from '../types';

interface AnimatedLessonStudioProps {
  subjects: Subject[];
  onNotify: (title: string, msg: string) => void;
}

const DEMO_30S_LESSON: AnimatedLesson = {
  id: 'demo-30s',
  subject_id: null,
  subject_name: 'Demonstração Study OS',
  title: 'Demo 30s: Como Fixar 3x Mais Rápido (Feynman + Conexões)',
  target_minutes: 0.5,
  technique: 'Feynman + Conexões Visuais',
  source_summary: 'Demonstração interativa de 30 segundos com narração sincronizada e conexões animadas.',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  modules: [
    {
      index: 0,
      title: 'Ciclo de Retenção Acelerada',
      goal: 'Entender por que ouvir + visualizar conexões + testar supera leitura passiva.',
      minutes: 1,
      expanded: true,
    },
  ],
  scenes: [
    {
      id: 'demo-1',
      module_index: 0,
      scene_title: '1. O Erro da Leitura Passiva',
      duration_sec: 10,
      narration:
        'Quando você só lê slides sem parar, seu cérebro cria uma ilusão de fluência. Você reconhece o texto na hora, mas esquece tudo na prova.',
      visual_nodes: [
        { label: 'Leitura Passiva', detail: 'Olhar slides sem testar', kind: 'warning' },
        { label: 'Ilusão de Fluência', detail: 'Parece fácil na hora', kind: 'core' },
        { label: 'Esquecimento Rápido', detail: 'Curva de Ebbinghaus cai em 24h', kind: 'warning' },
      ],
      connections: [
        { from: 'Leitura Passiva', to: 'Ilusão de Fluência', label: 'gera' },
        { from: 'Ilusão de Fluência', to: 'Esquecimento Rápido', label: 'leva a' },
      ],
      key_takeaway: 'Reconhecer não é saber explicar.',
      sources_hint: 'Dunlosky et al. (2013) — Effective Learning Techniques',
    },
    {
      id: 'demo-2',
      module_index: 0,
      scene_title: '2. A Ponte Feynman + Visual',
      duration_sec: 10,
      narration:
        'A Técnica de Feynman força você a traduzir um conceito difícil para uma analogia simples do mundo real e desenhar as conexões entre as ideias.',
      visual_nodes: [
        { label: 'Conceito Técnico', detail: 'Fórmula ou definição formal', kind: 'core' },
        { label: 'Analogia Real', detail: 'Explicar como para um amigo', kind: 'analogy' },
        { label: 'Mapa Visual', detail: 'Ligar causa e efeito', kind: 'connection' },
      ],
      connections: [
        { from: 'Conceito Técnico', to: 'Analogia Real', label: 'traduz para' },
        { from: 'Analogia Real', to: 'Mapa Visual', label: 'conecta em' },
      ],
      key_takeaway: 'Se você simplifica sem perder o rigor, você dominou.',
      sources_hint: 'Richard Feynman · Dual Coding Theory (Allan Paivio)',
    },
    {
      id: 'demo-3',
      module_index: 0,
      scene_title: '3. Active Recall Fecha o Ciclo',
      duration_sec: 10,
      narration:
        'Por fim, responder perguntas logo após a aula ativa os neurônios de recuperação e multiplica a retenção de longo prazo.',
      visual_nodes: [
        { label: 'Aula Animada', detail: 'Compreensão visual + voz', kind: 'core' },
        { label: 'Active Recall', detail: 'Perguntas sem consulta', kind: 'example' },
        { label: 'Memória Sólida', detail: 'Pronto para a prova', kind: 'connection' },
      ],
      connections: [
        { from: 'Aula Animada', to: 'Active Recall', label: 'valida com' },
        { from: 'Active Recall', to: 'Memória Sólida', label: 'consolida' },
      ],
      key_takeaway: 'Estude ativo em blocos curtos e consistentes.',
      sources_hint: 'Roediger & Karpicke — Testing Effect',
    },
  ],
};

const NODE_BADGES: Record<string, string> = {
  core: 'Conceito',
  analogy: 'Analogia',
  example: 'Exemplo',
  warning: 'Armadilha',
  connection: 'Conexão',
};

const NODE_COLORS: Record<string, { stroke: string; fill: string; text: string; glow: string }> = {
  core: { stroke: '#818cf8', fill: 'rgba(99, 102, 241, 0.16)', text: '#e0e7ff', glow: 'rgba(99, 102, 241, 0.45)' },
  analogy: { stroke: '#22d3ee', fill: 'rgba(6, 182, 212, 0.16)', text: '#cffafe', glow: 'rgba(34, 211, 238, 0.45)' },
  example: { stroke: '#34d399', fill: 'rgba(16, 185, 129, 0.16)', text: '#d1fae5', glow: 'rgba(52, 211, 153, 0.45)' },
  warning: { stroke: '#fb7185', fill: 'rgba(244, 63, 94, 0.16)', text: '#ffe4e6', glow: 'rgba(251, 113, 133, 0.45)' },
  connection: { stroke: '#fbbf24', fill: 'rgba(245, 158, 11, 0.16)', text: '#fef3c7', glow: 'rgba(251, 191, 36, 0.45)' },
};

function getNodeCoords(count: number): Array<{ x: number; y: number }> {
  if (count <= 1) return [{ x: 480, y: 230 }];
  if (count === 2) {
    return [
      { x: 280, y: 235 },
      { x: 680, y: 235 },
    ];
  }
  if (count === 3) {
    return [
      { x: 205, y: 245 },
      { x: 480, y: 155 },
      { x: 755, y: 245 },
    ];
  }
  return [
    { x: 210, y: 155 },
    { x: 750, y: 155 },
    { x: 250, y: 315 },
    { x: 710, y: 315 },
  ];
}

function CinematicSceneStage({
  scene,
  playing,
  visibleNodesCount,
  sceneElapsedSec,
}: {
  scene: AnimatedScene;
  playing: boolean;
  visibleNodesCount: number;
  sceneElapsedSec: number;
}) {
  const nodes = scene.visual_nodes.slice(0, 4);
  const coords = getNodeCoords(nodes.length);
  const coordByLabel = new Map<string, { x: number; y: number; idx: number }>();
  nodes.forEach((n, idx) => {
    coordByLabel.set(n.label.toLowerCase().trim(), { ...coords[idx], idx });
  });

  const sentences = scene.narration
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const progress = Math.min(0.99, sceneElapsedSec / Math.max(4, scene.duration_sec || 10));
  const activeSentence =
    sentences[Math.min(sentences.length - 1, Math.floor(progress * sentences.length))] ||
    scene.narration;

  const activeNodeIdx = playing
    ? Math.min(nodes.length - 1, Math.max(0, visibleNodesCount - 1))
    : nodes.length - 1;

  return (
    <div className="relative aspect-video w-full overflow-hidden bg-[#060913] select-none">
      {/* Blueprint grid + ambient glow */}
      <div
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(99,102,241,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(99,102,241,0.14) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(79,70,229,0.22) 0%, rgba(6,9,19,0.88) 72%)',
        }}
      />

      {/* Top HUD */}
      <div className="relative z-10 flex items-center justify-between px-5 pt-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-black/50 px-3 py-1 backdrop-blur-md">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          <span className="text-xs font-semibold tracking-wide text-indigo-200">
            {scene.scene_title}
          </span>
        </div>
        {scene.sources_hint && (
          <span className="hidden rounded-full bg-black/45 px-2.5 py-1 text-[10px] text-zinc-400 backdrop-blur-sm sm:inline">
            {scene.sources_hint}
          </span>
        )}
      </div>

      {/* Animated SVG Vector Stage (3Blue1Brown-inspired) */}
      <svg viewBox="0 0 960 440" className="relative z-10 h-[66%] w-full">
        <defs>
          <marker id="arrow-cyan" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
          </marker>
        </defs>

        {/* Animated Bezier Connections */}
        {(scene.connections || []).map((c, idx) => {
          const from = coordByLabel.get(c.from.toLowerCase().trim()) || (coords[idx] ? { ...coords[idx], idx } : null);
          const to =
            coordByLabel.get(c.to.toLowerCase().trim()) ||
            (coords[idx + 1] ? { ...coords[idx + 1], idx: idx + 1 } : null);
          if (!from || !to) return null;

          const mx = (from.x + to.x) / 2;
          const my = (from.y + to.y) / 2 - 36;
          const pathD = `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
          const isDrawn = !playing || Math.max(from.idx, to.idx) < visibleNodesCount;

          return (
            <g key={`conn-${idx}`}>
              <path
                d={pathD}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeLinecap="round"
                markerEnd="url(#arrow-cyan)"
                style={{
                  strokeDasharray: 600,
                  strokeDashoffset: isDrawn ? 0 : 600,
                  opacity: isDrawn ? 0.85 : 0.1,
                  transition: 'stroke-dashoffset 0.9s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.4s ease',
                }}
              />
              {isDrawn && (
                <g transform={`translate(${mx}, ${my + 12})`}>
                  <rect x="-46" y="-11" width="92" height="20" rx="10" fill="#0b1224" stroke="#1e293b" strokeWidth="1" />
                  <text x="0" y="3" textAnchor="middle" fill="#7dd3fc" fontSize="11" fontWeight="600">
                    {c.label.slice(0, 16)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Animated Nodes */}
        {nodes.map((node, i) => {
          const pos = coords[i];
          const palette = NODE_COLORS[node.kind] || NODE_COLORS.core;
          const visible = !playing || i < visibleNodesCount;
          const isSpotlight = playing && i === activeNodeIdx;

          return (
            <g
              key={`node-${i}`}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px) scale(${
                  !visible ? 0.78 : isSpotlight ? 1.07 : 1
                })`,
                transformOrigin: '0 0',
                opacity: visible ? 1 : 0.08,
                transition: 'all 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            >
              {isSpotlight && (
                <rect
                  x="-118"
                  y="-58"
                  width="236"
                  height="116"
                  rx="22"
                  fill="none"
                  stroke={palette.stroke}
                  strokeOpacity="0.45"
                  strokeWidth="3"
                />
              )}
              <rect
                x="-110"
                y="-50"
                width="220"
                height="100"
                rx="18"
                fill="#0b1020"
                stroke={palette.stroke}
                strokeWidth={isSpotlight ? '2.5' : '1.6'}
              />
              <rect
                x="-110"
                y="-50"
                width="220"
                height="100"
                rx="18"
                fill={palette.fill}
              />
              <text
                x="0"
                y="-24"
                textAnchor="middle"
                fill={palette.stroke}
                fontSize="10"
                fontWeight="700"
                letterSpacing="1.2"
              >
                {(NODE_BADGES[node.kind] || 'IDEIA').toUpperCase()}
              </text>
              <text x="0" y="0" textAnchor="middle" fill="#ffffff" fontSize="14.5" fontWeight="700">
                {node.label.slice(0, 24)}
              </text>
              <text x="0" y="23" textAnchor="middle" fill={palette.text} fontSize="11" opacity="0.88">
                {node.detail.slice(0, 34)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Bottom Cinema Subtitle + Key Takeaway */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black via-black/85 to-transparent px-6 pb-4 pt-8 text-center">
        <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-3 py-0.5 text-[11px] font-semibold text-emerald-300">
          <CheckCircle2 className="h-3 w-3" />
          {scene.key_takeaway}
        </div>
        <p className="mx-auto max-w-2xl text-sm font-medium leading-snug text-white drop-shadow sm:text-base">
          {activeSentence}
        </p>
      </div>
    </div>
  );
}

export const AnimatedLessonStudio: React.FC<AnimatedLessonStudioProps> = ({
  subjects,
  onNotify,
}) => {
  const [lessons, setLessons] = useState<AnimatedLesson[]>([]);
  const [activeLesson, setActiveLesson] = useState<AnimatedLesson | null>(null);

  // Form state
  const [subjectId, setSubjectId] = useState<string>(subjects[0]?.id || '');
  const [topicHint, setTopicHint] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [targetMinutes, setTargetMinutes] = useState<number>(30);
  const [technique, setTechnique] = useState('Feynman + Conexões Visuais');
  const [pdfBase64, setPdfBase64] = useState<string | undefined>();
  const [pdfName, setPdfName] = useState('');

  // Direct MP4 / Audio Upload to Gemini Files API
  const [mediaFileName, setMediaFileName] = useState('');
  const [mediaProgress, setMediaProgress] = useState<number | null>(null);
  const [mediaStatusText, setMediaStatusText] = useState('');
  const [uploadedFileUri, setUploadedFileUri] = useState<string | undefined>();
  const [uploadedMimeType, setUploadedMimeType] = useState<string | undefined>();

  const [generating, setGenerating] = useState(false);
  const [expandingModuleIdx, setExpandingModuleIdx] = useState<number | null>(null);
  const [savingWorkspace, setSavingWorkspace] = useState(false);

  // Player state
  const [sceneIdx, setSceneIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1.1);
  const [voiceName, setVoiceName] = useState<'Puck' | 'Kore' | 'Aoede'>('Puck');
  const [visibleNodesCount, setVisibleNodesCount] = useState(1);
  const [sceneElapsedSec, setSceneElapsedSec] = useState(0);
  const timerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCacheRef = useRef<Map<string, string>>(new Map());
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!subjectId && subjects[0]?.id) setSubjectId(subjects[0].id);
  }, [subjects, subjectId]);

  useEffect(() => {
    api
      .getAnimatedLessons()
      .then((list) => {
        setLessons(list);
        if (list[0]) setActiveLesson(list[0]);
      })
      .catch(() => {});
  }, []);

  const stopSpeech = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopSpeech();
  }, []);

  const scenes = activeLesson?.scenes || [];
  const currentScene: AnimatedScene | undefined = scenes[sceneIdx];

  // Helper: fetch or return cached Neural TTS WAV URL
  const getNeuralAudioUrl = async (scene: AnimatedScene, voice: string): Promise<string> => {
    const key = `${scene.id}:${voice}`;
    const existing = ttsCacheRef.current.get(key);
    if (existing) return existing;
    const res = await api.generateTts({ text: scene.narration, voice });
    const bin = atob(res.audio_base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: res.mime_type || 'audio/wav' }));
    ttsCacheRef.current.set(key, url);
    return url;
  };

  // Synchronized animation + Neural Gemini TTS (with natural browser voice fallback)
  useEffect(() => {
    stopSpeech();
    if (!playing || !currentScene) return;

    let cancelled = false;
    setSceneElapsedSec(0);
    setVisibleNodesCount(1);

    const totalNodes = Math.max(1, currentScene.visual_nodes.length);
    const totalSec = Math.max(6, currentScene.duration_sec || 10);
    const stepMs = Math.max(1200, Math.floor((totalSec * 1000) / (totalNodes + 0.5) / rate));

    const nodeTimer = window.setInterval(() => {
      setVisibleNodesCount((c) => (c < totalNodes ? c + 1 : c));
    }, stepMs);

    const secTimer = window.setInterval(() => {
      setSceneElapsedSec((s) => s + 1);
    }, 1000);
    timerRef.current = secTimer;

    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;

    const advanceNext = () => {
      if (cancelled) return;
      if (sceneIdx + 1 < scenes.length) {
        setSceneIdx((i) => i + 1);
      } else {
        setPlaying(false);
      }
    };

    const speakBrowserNatural = () => {
      if (cancelled) return;
      if ('speechSynthesis' in globalThis) {
        const voices = globalThis.speechSynthesis.getVoices();
        const ptVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('pt'));
        const preferred =
          ptVoices.find((v) => /google|natural|neural|luciana|francisca|thalita|antonio/i.test(v.name)) ||
          ptVoices[0];
        const utter = new SpeechSynthesisUtterance(currentScene.narration);
        utter.lang = 'pt-BR';
        if (preferred) utter.voice = preferred;
        utter.rate = rate;
        utter.pitch = 1.04;
        utter.onend = () => advanceNext();
        utter.onerror = () => {
          fallbackTimeout = setTimeout(advanceNext, Math.round((totalSec * 1000) / rate));
        };
        globalThis.speechSynthesis.speak(utter);
      } else {
        fallbackTimeout = setTimeout(advanceNext, Math.round((totalSec * 1000) / rate));
      }
    };

    if (!muted) {
      getNeuralAudioUrl(currentScene, voiceName)
        .then((url) => {
          if (cancelled) return;
          const audio = new Audio(url);
          audio.playbackRate = rate;
          audioRef.current = audio;
          audio.onended = () => advanceNext();
          audio.onerror = () => speakBrowserNatural();
          void audio.play().catch(() => speakBrowserNatural());

          // Pre-warm next scene TTS in background for zero gap
          const nextSc = scenes[sceneIdx + 1];
          if (nextSc) void getNeuralAudioUrl(nextSc, voiceName).catch(() => {});
        })
        .catch(() => {
          speakBrowserNatural();
        });
    } else {
      fallbackTimeout = setTimeout(advanceNext, Math.round((totalSec * 1000) / rate));
    }

    return () => {
      cancelled = true;
      window.clearInterval(nodeTimer);
      window.clearInterval(secTimer);
      if (fallbackTimeout) window.clearTimeout(fallbackTimeout);
      stopSpeech();
    };
  }, [playing, sceneIdx, currentScene?.id, muted, rate, voiceName, scenes.length]);

  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFileName(file.name);
    setMediaProgress(0);
    setMediaStatusText('Iniciando upload direto para o Google Gemini...');
    setUploadedFileUri(undefined);

    try {
      const mimeType = file.type || 'video/mp4';
      const { uploadUrl } = await api.startMediaUpload({
        filename: file.name,
        mime_type: mimeType,
        size_bytes: file.size,
      });

      const uploadedData = await new Promise<{ file?: { name?: string; uri?: string; mimeType?: string } }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('X-Goog-Upload-Offset', '0');
          xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize');
          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              setMediaProgress(Math.round((evt.loaded / evt.total) * 100));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText || '{}'));
              } catch {
                resolve({});
              }
            } else {
              reject(new Error(`Falha no upload direto (${xhr.status})`));
            }
          };
          xhr.onerror = () => reject(new Error('Erro de rede ao enviar vídeo/áudio.'));
          xhr.send(file);
        }
      );

      const fileName = uploadedData.file?.name;
      let uri = uploadedData.file?.uri;
      if (fileName) {
        setMediaStatusText('Processando áudio/vídeo no Gemini...');
        for (let i = 0; i < 15; i++) {
          const st = await api.checkMediaStatus(fileName);
          if (st.state === 'ACTIVE') {
            uri = st.uri;
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      if (!uri) throw new Error('Arquivo enviado, mas URI não retornada.');
      setUploadedFileUri(uri);
      setUploadedMimeType(mimeType);
      setMediaStatusText('Mídia pronta para análise pela IA!');
    } catch (err) {
      setMediaStatusText('');
      setMediaProgress(null);
      onNotify('Erro no upload de mídia', (err as Error).message);
    }
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const r = String(reader.result || '');
      setPdfBase64(r.includes(',') ? r.split(',')[1] : r);
    };
    reader.readAsDataURL(file);
  };

  const expandRemainingModules = async (lesson: AnimatedLesson, fileUri?: string, mime?: string) => {
    for (const mod of lesson.modules) {
      if (mod.expanded) continue;
      setExpandingModuleIdx(mod.index);
      try {
        const res = await api.expandAnimatedLessonModule(lesson.id, {
          module_index: mod.index,
          file_uri: fileUri,
          file_mime_type: mime,
        });
        setActiveLesson((prev) =>
          prev && prev.id === lesson.id
            ? { ...prev, modules: res.modules, scenes: res.scenes }
            : prev
        );
        setLessons((prev) =>
          prev.map((l) =>
            l.id === lesson.id ? { ...l, modules: res.modules, scenes: res.scenes } : l
          )
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
    if (!topicHint.trim() && !transcriptText.trim() && !pdfBase64 && !uploadedFileUri && !subjectId) {
      onNotify('Informe um conteúdo', 'Escolha a matéria, tema ou suba um arquivo.');
      return;
    }
    setGenerating(true);
    stopSpeech();
    setPlaying(false);
    try {
      const created = await api.generateAnimatedLesson({
        subject_id: subjectId || null,
        topic_hint: topicHint.trim(),
        transcript_text: transcriptText.trim(),
        pdf_base64: pdfBase64,
        file_uri: uploadedFileUri,
        file_mime_type: uploadedMimeType,
        target_minutes: targetMinutes,
        technique,
      });
      setLessons((prev) => [created, ...prev]);
      setActiveLesson(created);
      setSceneIdx(0);
      setPlaying(true);
      onNotify('Aula animada iniciada!', 'O Módulo 1 já está pronto — os demais carregam em segundo plano.');
      if (created.modules.some((m) => !m.expanded)) {
        void expandRemainingModules(created, uploadedFileUri, uploadedMimeType);
      }
    } catch (err) {
      onNotify('Erro ao gerar aula animada', (err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  const handlePlayDemo30s = () => {
    stopSpeech();
    setActiveLesson(DEMO_30S_LESSON);
    setSceneIdx(0);
    setVisibleNodesCount(1);
    setPlaying(true);
  };

  const handleSaveToWorkspace = async () => {
    if (!activeLesson || activeLesson.id === 'demo-30s') {
      onNotify('Demo', 'Gere uma aula real com seus conteúdos para salvar no Workspace.');
      return;
    }
    const targetSub = activeLesson.subject_id || subjectId || subjects[0]?.id;
    if (!targetSub) {
      onNotify('Selecione uma matéria', 'Crie uma matéria no Workspace primeiro.');
      return;
    }
    setSavingWorkspace(true);
    try {
      await api.saveAnimatedLessonToWorkspace(activeLesson.id, targetSub);
      onNotify('Salvo no Workspace!', 'A aula animada foi adicionada como nota na matéria.');
    } catch (err) {
      onNotify('Erro ao salvar', (err as Error).message);
    } finally {
      setSavingWorkspace(false);
    }
  };

  const totalSec = scenes.reduce((acc, s) => acc + (s.duration_sec || 10), 0);
  const elapsedBeforeScene = scenes
    .slice(0, sceneIdx)
    .reduce((acc, s) => acc + (s.duration_sec || 10), 0);
  const currentTotalElapsed = Math.min(totalSec, elapsedBeforeScene + sceneElapsedSec);
  const fmt = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-5">
      {/* Top Demo Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-indigo-200">
            Estúdio de Vídeo-Aula Animada (Voz + Conexões Visuais + Fontes Confiáveis)
          </p>
          <p className="text-[11px] text-indigo-200/75">
            Aceita MP4/Áudio até 2 GB direto para o Google Gemini, PDF de slides ou transcrição.
          </p>
        </div>
        <button
          type="button"
          onClick={handlePlayDemo30s}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
        >
          <Play className="h-3.5 w-3.5" />
          Assistir Demo 30s Agora
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Generator Form + Saved Lessons */}
        <form
          onSubmit={handleGenerate}
          className="space-y-3.5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 lg:col-span-4"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Film className="h-4 w-4 text-indigo-400" />
            Criar Aula Completa
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
            placeholder="Tema da aula (ex: Grafos, Limites, n8n Webhooks)"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder:text-zinc-500"
          />

          {/* Duration + Technique */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-zinc-400">Duração da Aula</label>
              <select
                value={targetMinutes}
                onChange={(e) => setTargetMinutes(Number(e.target.value))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-white"
              >
                <option value={0.5}>30s (Demo IA)</option>
                <option value={5}>5 min (Resumo)</option>
                <option value={15}>15 min (Objetiva)</option>
                <option value={30}>30 min (Completa)</option>
                <option value={45}>45 min (Aprofundada)</option>
                <option value={60}>60 min (Masterclass)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-zinc-400">Técnica</label>
              <select
                value={technique}
                onChange={(e) => setTechnique(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs text-white"
              >
                <option value="Feynman + Conexões Visuais">Feynman + Visual</option>
                <option value="Mapas Mentais + Exemplos">Mapas Mentais</option>
                <option value="Active Recall Guiado">Active Recall</option>
              </select>
            </div>
          </div>

          {/* Direct MP4 / Audio upload */}
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-zinc-700 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-300 hover:border-indigo-400">
            <span className="flex items-center gap-2 truncate">
              <Upload className="h-3.5 w-3.5 text-cyan-400" />
              {mediaFileName || 'Subir MP4 / Áudio (até 2 GB)'}
            </span>
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime,audio/*"
              onChange={handleMediaSelect}
              className="hidden"
            />
          </label>
          {mediaProgress !== null && (
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full bg-cyan-400 transition-all" style={{ width: `${mediaProgress}%` }} />
              </div>
              <p className="text-[10px] text-cyan-300">
                {mediaProgress}% · {mediaStatusText}
              </p>
            </div>
          )}

          {/* PDF slides upload */}
          <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-zinc-700 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-300 hover:border-indigo-400">
            <span className="flex items-center gap-2 truncate">
              <Upload className="h-3.5 w-3.5 text-indigo-400" />
              {pdfName || 'Subir PDF de slides (opcional)'}
            </span>
            <input type="file" accept="application/pdf" onChange={handlePdfSelect} className="hidden" />
          </label>

          <textarea
            rows={3}
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            placeholder="Ou cole anotações / objetivos extras..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-white placeholder:text-zinc-500"
          />

          <button
            type="submit"
            disabled={generating}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? 'Montando plano e Módulo 1...' : `Gerar Aula (${targetMinutes < 1 ? '30s' : `${targetMinutes} min`})`}
          </button>

          {lessons.length > 0 && (
            <div className="space-y-1.5 border-t border-zinc-800 pt-3">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Suas Aulas ({lessons.length})
              </span>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {lessons.map((l) => (
                  <div
                    key={l.id}
                    onClick={() => {
                      stopSpeech();
                      setPlaying(false);
                      setActiveLesson(l);
                      setSceneIdx(0);
                    }}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs ${
                      activeLesson?.id === l.id
                        ? 'border-indigo-500/60 bg-indigo-500/15 text-white'
                        : 'border-zinc-800 bg-zinc-950/60 text-zinc-300'
                    }`}
                  >
                    <span className="truncate">{l.title}</span>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await api.deleteAnimatedLesson(l.id);
                        setLessons((p) => p.filter((x) => x.id !== l.id));
                        if (activeLesson?.id === l.id) setActiveLesson(null);
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

        {/* Right: Interactive Animated Lesson Player */}
        <div className="lg:col-span-8">
          {activeLesson && currentScene ? (
            <div
              ref={playerContainerRef}
              className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
            >
              {/* Player Top Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/70 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] text-indigo-300">
                    <span>{activeLesson.technique}</span>
                    <span>•</span>
                    <span>
                      Cena {sceneIdx + 1}/{scenes.length}
                    </span>
                    {expandingModuleIdx !== null && (
                      <span className="inline-flex items-center gap-1 text-cyan-300">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Gerando Módulo {expandingModuleIdx + 1}...
                      </span>
                    )}
                  </div>
                  <h3 className="truncate text-sm font-bold text-white">{activeLesson.title}</h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const el = playerContainerRef.current;
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
                    Enviar para Workspace
                  </button>
                </div>
              </div>

              {/* Cinematic 16:9 Vector Animated Video Stage */}
              <CinematicSceneStage
                scene={currentScene}
                playing={playing}
                visibleNodesCount={visibleNodesCount}
                sceneElapsedSec={sceneElapsedSec}
              />

              {/* Video Controls */}
              <div className="space-y-3 border-t border-zinc-800 bg-zinc-900/80 px-5 py-3.5">
                {/* Timeline bar */}
                <div className="flex items-center gap-3 text-[11px] tabular-nums text-zinc-400">
                  <span>{fmt(currentTotalElapsed)}</span>
                  <div className="flex flex-1 gap-1">
                    {scenes.map((sc, idx) => (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => setSceneIdx(idx)}
                        title={sc.scene_title}
                        className={`h-2 flex-1 rounded-full transition ${
                          idx < sceneIdx
                            ? 'bg-indigo-500'
                            : idx === sceneIdx
                              ? 'bg-cyan-400'
                              : 'bg-zinc-800 hover:bg-zinc-700'
                        }`}
                      />
                    ))}
                  </div>
                  <span>{fmt(totalSec)}</span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSceneIdx((i) => Math.max(0, i - 1))}
                      disabled={sceneIdx === 0}
                      className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-zinc-300 hover:text-white disabled:opacity-40"
                    >
                      <SkipBack className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlaying((p) => !p)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                    >
                      {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {playing ? 'Pausar' : 'Assistir'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSceneIdx((i) => Math.min(scenes.length - 1, i + 1))}
                      disabled={sceneIdx >= scenes.length - 1}
                      className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-zinc-300 hover:text-white disabled:opacity-40"
                    >
                      <SkipForward className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={voiceName}
                      onChange={(e) => setVoiceName(e.target.value as 'Puck' | 'Kore' | 'Aoede')}
                      className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
                      title="Estilo de voz neural"
                    >
                      <option value="Puck">Voz: Dinâmica (Puck)</option>
                      <option value="Kore">Voz: Professor (Kore)</option>
                      <option value="Aoede">Voz: Didática (Aoede)</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setMuted((m) => !m)}
                      className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-zinc-300 hover:text-white"
                      title={muted ? 'Ativar voz' : 'Silenciar voz'}
                    >
                      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                    <select
                      value={rate}
                      onChange={(e) => setRate(Number(e.target.value))}
                      className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200"
                    >
                      <option value={1}>1.0x</option>
                      <option value={1.1}>1.1x</option>
                      <option value={1.25}>1.25x</option>
                      <option value={1.5}>1.5x</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/20 p-8 text-center">
              <Film className="h-10 w-10 text-indigo-400/70" />
              <p className="mt-3 text-base font-semibold text-white">
                Pronto para gerar sua Vídeo-Aula Animada
              </p>
              <p className="mt-1 max-w-md text-xs text-zinc-400">
                Clique em <strong>Assistir Demo 30s Agora</strong> acima para testar a experiência animada com voz na hora, ou suba seu MP4/PDF ao lado para gerar uma aula de 30 a 60 minutos!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
