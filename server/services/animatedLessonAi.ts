import { GoogleGenAI, Type } from '@google/genai';

const MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.8-flash';

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no ambiente.');
  return apiKey;
}

function getAi(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: getApiKey(), apiVersion: 'v1beta' });
}

let cachedModels: { ts: number; names: string[] } | null = null;

async function listAvailableGenerateModels(): Promise<string[]> {
  if (cachedModels && Date.now() - cachedModels.ts < 10 * 60_000) {
    return cachedModels.names;
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(getApiKey())}`
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    const names = (data.models || [])
      .filter(
        (m) =>
          m.name &&
          m.supportedGenerationMethods?.includes('generateContent') &&
          !m.name.includes('tts') &&
          !m.name.includes('embedding') &&
          !m.name.includes('imagen') &&
          !m.name.includes('veo')
      )
      .map((m) => m.name!.replace(/^models\//, ''));
    const score = (n: string) => {
      if (n === 'gemini-3.8-flash') return 0;
      if (n.includes('3.8') && n.includes('flash')) return 1;
      if (n.includes('3.8') && n.includes('pro')) return 2;
      if (n.includes('flash') && !n.includes('2.5')) return 3;
      if (n.includes('2.5-pro')) return 4;
      if (n.includes('flash')) return 5;
      if (n.includes('pro')) return 6;
      return 10;
    };
    names.sort((a, b) => score(a) - score(b));
    cachedModels = { ts: Date.now(), names };
    return names;
  } catch {
    return [];
  }
}

async function generateContentWithFallback(
  ai: GoogleGenAI,
  contents: unknown,
  config: Record<string, unknown>
) {
  const dynamicModels = await listAvailableGenerateModels();
  const candidates = Array.from(
    new Set([MODEL, 'gemini-3.8-flash', ...dynamicModels])
  ).slice(0, 3);

  const deadline = Date.now() + 50_000; // Fica abaixo do limite de 60s da Vercel
  const errors: string[] = [];

  for (const model of candidates) {
    const remaining = deadline - Date.now();
    if (remaining < 6_000) break;

    try {
      return await ai.models.generateContent({
        model,
        contents: contents as never,
        config: {
          ...config,
          abortSignal: AbortSignal.timeout(Math.min(42_000, remaining)),
        } as never,
      });
    } catch (err) {
      const msg = String((err as Error)?.message || err);
      errors.push(`${model}: ${msg.slice(0, 140)}`);
      const isTimeout =
        (err as Error)?.name === 'TimeoutError' ||
        (err as Error)?.name === 'AbortError' ||
        msg.includes('aborted') ||
        msg.includes('timeout');
      const isNotFound = msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('no longer available');
      const isBusy =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand') ||
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED');
      if (isNotFound || isBusy || isTimeout) continue;
      throw err;
    }
  }
  throw new Error(`Gemini indisponível/lento (${errors.join(' | ')})`);
}

export interface VisualNode {
  label: string;
  detail: string;
  kind: 'core' | 'analogy' | 'example' | 'warning' | 'connection';
}

export interface AnimatedScene {
  id: string;
  module_index: number;
  category?: string;
  scene_title: string;
  slide_layout?: 'hero' | 'concept_cards' | 'diagram_flow' | 'comparison' | 'example_code' | 'trap_alert' | 'recap';
  duration_sec: number;
  narration: string;
  simple_words?: string;
  formal_definition?: string;
  example?: string;
  common_error?: string;
  feynman_test?: string;
  feynman_answer_hint?: string;
  diagram_svg?: string;
  example_or_code?: string;
  quiz_questions?: Array<{
    question: string;
    options: string[];
    correct_index: number;
    explanation: string;
  }>;
  visual_nodes: VisualNode[];
  connections: Array<{ from: string; to: string; label: string }>;
  key_takeaway: string;
  sources_hint: string;
}

export interface LessonModule {
  index: number;
  title: string;
  goal: string;
  minutes: number;
  expanded: boolean;
}

/**
 * Initiates a Resumable Upload session directly with Google Gemini Files API
 * so large MP4/MP3 files (up to 2GB) upload straight from browser -> Google without hitting Vercel's 4.5MB body limit.
 */
export async function startGeminiResumableUpload(params: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<{ uploadUrl: string }> {
  const apiKey = getApiKey();
  const res = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(params.sizeBytes),
        'X-Goog-Upload-Header-Content-Type': params.mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        file: { display_name: params.filename || 'study-os-media' },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Falha ao iniciar upload no Google Gemini: ${errText}`);
  }

  const uploadUrl = res.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('Google Gemini não retornou x-goog-upload-url.');
  }

  return { uploadUrl };
}

export async function forwardGeminiUploadChunk(params: {
  uploadUrl: string;
  offset: number;
  command: string;
  chunk: Buffer;
}): Promise<{ file?: { name?: string; uri?: string } }> {
  if (!params.uploadUrl.startsWith('https://generativelanguage.googleapis.com/upload/')) {
    throw new Error('uploadUrl inválida.');
  }

  const res = await fetch(params.uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Offset': String(params.offset),
      'X-Goog-Upload-Command': params.command,
      'Content-Length': String(params.chunk.length),
    },
    body: new Uint8Array(params.chunk),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Falha no upload para o Gemini (${res.status}): ${errText}`);
  }

  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as { file?: { name?: string; uri?: string } };
  } catch {
    return {};
  }
}

export async function uploadBufferToGemini(params: {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<{ file?: { name?: string; uri?: string } }> {
  const { uploadUrl } = await startGeminiResumableUpload({
    filename: params.filename,
    mimeType: params.mimeType,
    sizeBytes: params.buffer.length,
  });
  return forwardGeminiUploadChunk({
    uploadUrl,
    offset: 0,
    command: 'upload, finalize',
    chunk: params.buffer,
  });
}

export async function checkGeminiFileStatus(fileName: string): Promise<{
  state: string;
  uri: string;
  mimeType: string;
}> {
  const apiKey = getApiKey();
  const cleanName = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${encodeURIComponent(apiKey)}`
  );
  if (!res.ok) {
    throw new Error('Não foi possível verificar o status do arquivo no Gemini.');
  }
  const data = (await res.json()) as { state?: string; uri?: string; mimeType?: string };
  return {
    state: data.state || 'PROCESSING',
    uri: data.uri || '',
    mimeType: data.mimeType || 'video/mp4',
  };
}

export interface MediaFileRef {
  uri: string;
  mimeType: string;
  name?: string;
}

function buildMultimodalParts(params: {
  prompt: string;
  pdfBase64?: string;
  fileUri?: string;
  fileMimeType?: string;
  mediaFiles?: MediaFileRef[];
}) {
  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
    | { fileData: { mimeType: string; fileUri: string } }
  > = [];

  if (params.mediaFiles && params.mediaFiles.length > 0) {
    for (const f of params.mediaFiles) {
      if (f.uri) {
        parts.push({
          fileData: {
            mimeType: f.mimeType || 'application/octet-stream',
            fileUri: f.uri,
          },
        });
      }
    }
  } else if (params.fileUri) {
    parts.push({
      fileData: {
        mimeType: params.fileMimeType || 'video/mp4',
        fileUri: params.fileUri,
      },
    });
  }

  if (params.pdfBase64 && params.pdfBase64.trim().length > 0) {
    const clean = params.pdfBase64.includes(',') ? params.pdfBase64.split(',')[1] : params.pdfBase64;
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: clean,
      },
    });
  }

  parts.push({ text: params.prompt });
  return parts;
}

const SCENE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING },
    scene_title: { type: Type.STRING },
    slide_layout: {
      type: Type.STRING,
      enum: ['hero', 'concept_cards', 'diagram_flow', 'comparison', 'example_code', 'trap_alert', 'recap'],
    },
    duration_sec: { type: Type.INTEGER },
    simple_words: { type: Type.STRING },
    formal_definition: { type: Type.STRING },
    example: { type: Type.STRING },
    common_error: { type: Type.STRING },
    feynman_test: { type: Type.STRING },
    feynman_answer_hint: { type: Type.STRING },
    diagram_svg: { type: Type.STRING },
    narration: { type: Type.STRING },
    example_or_code: { type: Type.STRING },
    visual_nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          detail: { type: Type.STRING },
          kind: {
            type: Type.STRING,
            enum: ['core', 'analogy', 'example', 'warning', 'connection'],
          },
        },
        required: ['label', 'detail', 'kind'],
      },
    },
    connections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          from: { type: Type.STRING },
          to: { type: Type.STRING },
          label: { type: Type.STRING },
        },
        required: ['from', 'to', 'label'],
      },
    },
    key_takeaway: { type: Type.STRING },
    sources_hint: { type: Type.STRING },
    quiz_questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          options: { type: Type.ARRAY, items: { type: Type.STRING } },
          correct_index: { type: Type.INTEGER },
          explanation: { type: Type.STRING },
        },
        required: ['question', 'options', 'correct_index', 'explanation'],
      },
    },
  },
  required: [
    'category',
    'scene_title',
    'slide_layout',
    'duration_sec',
    'simple_words',
    'formal_definition',
    'example',
    'common_error',
    'feynman_test',
    'feynman_answer_hint',
    'diagram_svg',
    'narration',
    'example_or_code',
    'visual_nodes',
    'connections',
    'key_takeaway',
    'sources_hint',
  ],
};

export async function extractMaterialKnowledge(params: {
  name: string;
  mimeType: string;
  fileUri: string;
}): Promise<string> {
  const ai = getAi();
  const res = await generateContentWithFallback(
    ai,
    [
      {
        role: 'user',
        parts: [
          {
            fileData: {
              mimeType: params.mimeType || 'application/octet-stream',
              fileUri: params.fileUri,
            },
          },
          {
            text: `Analise integralmente o arquivo "${params.name}" e extraia um DOSSIÊ COMPLETO E FIEL do conteúdo técnico para servir de base a uma aula interativa profunda em PT-BR.
Inclua:
1. Todos os tópicos e subtópicos reais abordados.
2. Definições formais, regras, teoremas e fórmulas exatas.
3. Todos os exemplos numéricos/práticos resolvidos presentes no material.
4. Eventuais erros, deslizes ou pegadinhas mencionados ou presentes no material.
Seja completo, preciso e fiel ao conteúdo real (NUNCA fale sobre autodidatismo).`,
          },
        ],
      },
    ],
    {}
  );
  return (res.text || '').trim();
}

export async function generateAnimatedLessonInitial(params: {
  subjectName: string;
  topicHint: string;
  transcriptText?: string;
  pdfBase64?: string;
  fileUri?: string;
  fileMimeType?: string;
  mediaFiles?: MediaFileRef[];
  targetMinutes: number;
  technique: string;
}): Promise<{
  title: string;
  source_summary: string;
  modules: LessonModule[];
  scenes: AnimatedScene[];
}> {
  const ai = getAi();
  const isShort = params.targetMinutes <= 5;

  const hasMultiFiles = Boolean(params.mediaFiles && params.mediaFiles.length > 0);
  const hasMediaOrPdf = Boolean(
    hasMultiFiles ||
      params.pdfBase64 ||
      params.fileUri ||
      (params.transcriptText && params.transcriptText.trim().length > 30)
  );
  const effectiveTopic =
    params.topicHint?.trim() || (hasMediaOrPdf ? 'Conteúdo fiel dos arquivos/materiais enviados' : params.subjectName);
  const attachedFilesHint = hasMultiFiles
    ? `\nARQUIVOS ANEXADOS (${params.mediaFiles!.length}): ${params.mediaFiles!
        .map((f, i) => `${i + 1}. ${f.name || f.mimeType}`)
        .join(' | ')}\nIntegre TODOS os áudios, vídeos e PDFs em uma sequência didática unificada e completa.\n`
    : '';

  const feynmanSlideSpec = `ESTRUTURA OBRIGATÓRIA DE CADA SLIDE (PADRÃO FEYNMAN PROFUNDO):
- "category": Categoria curta em MAIÚSCULAS (ex: "FUNDAMENTOS", "OPERAÇÕES", "APLICAÇÃO").
- "scene_title": Título claro do conceito do slide.
- "simple_words": Explicação em palavras simples + analogia concreta do dia a dia (ex: sacola, receita, trânsito) sem jargão.
- "formal_definition": Definição formal completa + aprofundamento técnico rigoroso (não seja raso!).
- "example": Exemplo prático resolvido passo a passo à mão ou aplicação real detalhada.
- "example_or_code": Fórmula matemática destacada, tabela ou trecho de código quando ajudar (ou "" se não precisar).
- "common_error": Atenção / Erro comum ou pegadinha clássica de prova.
- "feynman_test": Pergunta direta de Active Recall para o aluno responder sem consultar.
- "feynman_answer_hint": Gabarito claro e completo para o aluno conferir depois de tentar responder.
- "diagram_svg": Um código SVG VÁLIDO e LIMPO (<svg viewBox="0 0 460 280" xmlns="http://www.w3.org/2000/svg">...</svg>) desenhando um diagrama ilustrativo específico para ESTE slide (ex: conjuntos de Venn com elementos dentro, fluxos, gráficos, matrizes, caixas conectadas). Use fundo transparente, traços nítidos (#38bdf8, #818cf8, #34d399, #f59e0b, #fb7185) e textos legíveis em #f4f4f5 / #cbd5e1 (font-family="sans-serif").
- "narration": Síntese falada conectando a analogia, a definição e o exemplo.
- "key_takeaway": Frase-âncora de resumo do slide.
- "quiz_questions": No ÚLTIMO slide deste módulo (com "slide_layout": "recap"), inclua 3 a 4 questões de múltipla escolha (4 opções A-D, "correct_index" 0..3 e "explanation" comentada) para fixação imediata! Nos slides de conteúdo normal, deixe "quiz_questions" vazio [].`;

  const prompt = isShort
    ? `Você é um Professor Especialista criando uma aula interativa profunda em português (PT-BR).
Tema / Foco: "${effectiveTopic}".
Abordagem: ${params.technique}.

REGRA CRÍTICA DE FIDELIDADE:
- Baseie-se FIELMENTE nos arquivos enviados (PDF/vídeo/áudio/texto abaixo).
- NUNCA fale sobre "estudo livre", "autodidatismo" ou "técnicas de estudo", a menos que o material enviado seja explicitamente sobre isso.

CONTEÚDO / ANOTAÇÕES ENVIADAS PELO ALUNO:
${attachedFilesHint}${params.transcriptText?.slice(0, 45000) || 'Analise integralmente todos os PDFs, áudios ou vídeos anexados.'}

Gere ${params.targetMinutes <= 1 ? '4' : '6'} slides profundos seguindo:
${feynmanSlideSpec}`
    : `Você é um Professor Especialista criando uma AULA INTERATIVA COMPLETA E PROFUNDA (equivalente a ${params.targetMinutes} minutos) em português (PT-BR).
Tema / Foco: "${effectiveTopic}".
Abordagem: ${params.technique}.

REGRA CRÍTICA DE FIDELIDADE:
- Extraia os tópicos REAIS de todos os arquivos enviados e aprofunde com fontes acadêmicas confiáveis.
- NUNCA invente aulas sobre "estudo livre" ou "autodidatismo". Ensine EXCLUSIVAMENTE a matéria real do material enviado.

CONTEÚDO / ANOTAÇÕES ENVIADAS PELO ALUNO:
${attachedFilesHint}${params.transcriptText?.slice(0, 45000) || 'Analise integralmente todos os PDFs, áudios ou vídeos anexados.'}

FAÇA DUAS COISAS AGORA (RESPOSTA RÁPIDA E OBJETIVA):
1. Divida o conteúdo real em 4 a 6 MÓDULOS progressivos ("modules") cobrindo TODOS os arquivos enviados.
2. Já gere os 2 primeiros SLIDES profundos ("scenes") do MÓDULO 1 (os demais módulos serão expandidos logo em seguida) seguindo:
${feynmanSlideSpec}`;

  const contentsPayload = [
    {
      role: 'user',
      parts: buildMultimodalParts({
        prompt,
        pdfBase64: params.pdfBase64,
        fileUri: params.fileUri,
        fileMimeType: params.fileMimeType,
        mediaFiles: params.mediaFiles,
      }),
    },
  ];
  const configPayload = {
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        source_summary: { type: Type.STRING },
        modules: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              index: { type: Type.INTEGER },
              title: { type: Type.STRING },
              goal: { type: Type.STRING },
              minutes: { type: Type.INTEGER },
            },
            required: ['index', 'title', 'goal', 'minutes'],
          },
        },
        scenes: {
          type: Type.ARRAY,
          items: SCENE_SCHEMA,
        },
      },
      required: ['title', 'source_summary', 'modules', 'scenes'],
    },
  };

  const res = await generateContentWithFallback(ai, contentsPayload, configPayload);

  const parsed = JSON.parse(res.text || '{}') as {
    title?: string;
    source_summary?: string;
    modules?: Array<{ index: number; title: string; goal: string; minutes: number }>;
    scenes?: Array<Omit<AnimatedScene, 'id' | 'module_index'>>;
  };

  const modules: LessonModule[] = isShort
    ? [
        {
          index: 0,
          title: parsed.title || params.topicHint || params.subjectName,
          goal: 'Aula completa',
          minutes: params.targetMinutes,
          expanded: true,
        },
      ]
    : (parsed.modules || []).map((m, idx) => ({
        index: idx,
        title: m.title,
        goal: m.goal,
        minutes: Number(m.minutes) || Math.round(params.targetMinutes / 4),
        expanded: idx === 0,
      }));

  const scenes: AnimatedScene[] = (parsed.scenes || []).map((s, idx) => ({
    ...s,
    id: `scene-0-${idx}-${Date.now()}`,
    module_index: 0,
  }));

  return {
    title: parsed.title || params.topicHint || params.subjectName,
    source_summary: parsed.source_summary || '',
    modules,
    scenes,
  };
}

export async function generateAnimatedLessonModule(params: {
  lessonTitle: string;
  moduleIndex: number;
  moduleTitle: string;
  moduleGoal: string;
  moduleMinutes: number;
  technique: string;
  contextText: string;
  fileUri?: string;
  fileMimeType?: string;
  mediaFiles?: MediaFileRef[];
}): Promise<AnimatedScene[]> {
  const ai = getAi();
  const prompt = `Você continua a aula completa "${params.lessonTitle}" (Técnica: ${params.technique}).
Agora gere 3 a 4 slides PROFUNDOS do Módulo ${params.moduleIndex + 1}: "${params.moduleTitle}" (${params.moduleMinutes} min).
Objetivo: ${params.moduleGoal}

CONTEXTO / MATERIAIS:
${params.contextText.slice(0, 25000)}

Para cada slide preencha rigorosamente:
- "category", "scene_title", "simple_words" (analogia do dia a dia), "formal_definition" (aprofundamento técnico), "example" (passo a passo), "common_error" (pegadinha ou deslize nos slides originais), "feynman_test" (pergunta Active Recall), "feynman_answer_hint" (gabarito), "diagram_svg" (<svg viewBox="0 0 460 280" xmlns="http://www.w3.org/2000/svg">...</svg> ilustrativo específico deste conceito com fundo transparente e textos claros #f4f4f5), "narration", "key_takeaway" e "sources_hint".
- No ÚLTIMO slide deste módulo ("slide_layout": "recap"), preencha "quiz_questions" com 3 a 4 questões A-D (correct_index 0..3 + explanation comentada). Nos demais, deixe "quiz_questions": [].`;

  const res = await generateContentWithFallback(
    ai,
    [
      {
        role: 'user',
        parts: buildMultimodalParts({
          prompt,
          fileUri: params.fileUri,
          fileMimeType: params.fileMimeType,
          mediaFiles: params.mediaFiles,
        }),
      },
    ],
    {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          scenes: {
            type: Type.ARRAY,
            items: SCENE_SCHEMA,
          },
        },
        required: ['scenes'],
      },
    }
  );

  const parsed = JSON.parse(res.text || '{}') as {
    scenes?: Array<Omit<AnimatedScene, 'id' | 'module_index'>>;
  };

  return (parsed.scenes || []).map((s, idx) => ({
    ...s,
    id: `scene-${params.moduleIndex}-${idx}-${Date.now()}`,
    module_index: params.moduleIndex,
  }));
}

function pcm16ToWavBase64(pcmBase64: string, sampleRate = 24000): string {
  const pcmBuf = Buffer.from(pcmBase64, 'base64');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuf.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(pcmBuf.length, 40);
  return Buffer.concat([header, pcmBuf]).toString('base64');
}

export async function generateNeuralSpeechWav(params: {
  text: string;
  voiceName?: string;
}): Promise<{ wavBase64: string }> {
  const ai = getAi();
  const ttsModel = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
  const voice = params.voiceName || 'Puck';

  const res = await ai.models.generateContent({
    model: ttsModel,
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Leia em Português do Brasil com entonação natural, dinâmica, envolvente e didática de professor/apresentador:\n\n${params.text.slice(0, 2500)}`,
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const part = res.candidates?.[0]?.content?.parts?.find(
    (p) => (p as { inlineData?: { data?: string } })?.inlineData?.data
  ) as { inlineData?: { data: string; mimeType?: string } } | undefined;

  if (!part?.inlineData?.data) {
    throw new Error('Modelo TTS não retornou áudio.');
  }

  const mime = part.inlineData.mimeType || '';
  if (mime.includes('wav')) {
    return { wavBase64: part.inlineData.data };
  }
  return { wavBase64: pcm16ToWavBase64(part.inlineData.data, 24000) };
}
