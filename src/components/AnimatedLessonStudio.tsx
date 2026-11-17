import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Film,
  Loader2,
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

const NODE_STYLES: Record<string, string> = {
  core: 'border-indigo-500/50 bg-indigo-500/15 text-indigo-100',
  analogy: 'border-cyan-500/50 bg-cyan-500/15 text-cyan-100',
  example: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-100',
  warning: 'border-rose-500/50 bg-rose-500/15 text-rose-100',
  connection: 'border-amber-500/50 bg-amber-500/15 text-amber-100',
};

const NODE_BADGES: Record<string, string> = {
  core: 'Conceito',
  analogy: 'Analogia',
  example: 'Exemplo',
  warning: 'Armadilha',
  connection: 'Conexão',
};

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
            <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
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

              {/* Animated Visual Stage */}
              <div className="relative min-h-[340px] space-y-5 bg-gradient-to-b from-zinc-950 via-zinc-900/60 to-zinc-950 p-6">
                <div className="flex items-center justify-between">
                  <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
                    {currentScene.scene_title}
                  </span>
                  {currentScene.sources_hint && (
                    <span className="text-[11px] text-zinc-500">Fonte: {currentScene.sources_hint}</span>
                  )}
                </div>

                {/* Animated Visual Nodes appearing progressively */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {currentScene.visual_nodes.map((node, i) => {
                    const visible = !playing || i < visibleNodesCount;
                    return (
                      <div
                        key={i}
                        className={`rounded-2xl border p-4 transition-all duration-500 ${
                          NODE_STYLES[node.kind] || NODE_STYLES.core
                        } ${
                          visible
                            ? 'translate-y-0 scale-100 opacity-100'
                            : 'translate-y-3 scale-95 opacity-15'
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                          {NODE_BADGES[node.kind] || 'Ideia'}
                        </span>
                        <h4 className="mt-1 text-sm font-bold">{node.label}</h4>
                        <p className="mt-1 text-xs opacity-90">{node.detail}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Animated Connections Pill Flow */}
                {currentScene.connections && currentScene.connections.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    {currentScene.connections.map((c, idx) => (
                      <div
                        key={idx}
                        className={`inline-flex items-center gap-1.5 rounded-full border border-zinc-700/80 bg-zinc-900/90 px-3 py-1 text-[11px] transition-all duration-500 ${
                          !playing || idx < visibleNodesCount
                            ? 'opacity-100 scale-100'
                            : 'opacity-20 scale-95'
                        }`}
                      >
                        <span className="font-semibold text-zinc-200">{c.from}</span>
                        <span className="text-indigo-400">── {c.label} →</span>
                        <span className="font-semibold text-cyan-300">{c.to}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Key Takeaway + Synced Narration Subtitle */}
                <div className="space-y-2 rounded-xl border border-zinc-800/80 bg-zinc-950/90 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {currentScene.key_takeaway}
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-200">{currentScene.narration}</p>
                </div>
              </div>

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
