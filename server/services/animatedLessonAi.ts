import { GoogleGenAI, Type } from '@google/genai';

const MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash';
const DEEP_MODEL = process.env.GEMINI_DEEP_MODEL || 'gemini-2.5-pro';

function getApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no ambiente.');
  return apiKey;
}

function getAi(): GoogleGenAI {
  return new GoogleGenAI({ apiKey: getApiKey() });
}

export interface VisualNode {
  label: string;
  detail: string;
  kind: 'core' | 'analogy' | 'example' | 'warning' | 'connection';
}

export interface AnimatedScene {
  id: string;
  module_index: number;
  scene_title: string;
  slide_layout?: 'hero' | 'concept_cards' | 'diagram_flow' | 'comparison' | 'example_code' | 'trap_alert' | 'recap';
  duration_sec: number;
  narration: string;
  example_or_code?: string;
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

function buildMultimodalParts(params: {
  prompt: string;
  pdfBase64?: string;
  fileUri?: string;
  fileMimeType?: string;
}) {
  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
    | { fileData: { mimeType: string; fileUri: string } }
  > = [];

  if (params.fileUri) {
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
    scene_title: { type: Type.STRING },
    slide_layout: {
      type: Type.STRING,
      enum: ['hero', 'concept_cards', 'diagram_flow', 'comparison', 'example_code', 'trap_alert', 'recap'],
    },
    duration_sec: { type: Type.INTEGER },
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
  },
  required: [
    'scene_title',
    'slide_layout',
    'duration_sec',
    'narration',
    'example_or_code',
    'visual_nodes',
    'connections',
    'key_takeaway',
    'sources_hint',
  ],
};

export async function generateAnimatedLessonInitial(params: {
  subjectName: string;
  topicHint: string;
  transcriptText?: string;
  pdfBase64?: string;
  fileUri?: string;
  fileMimeType?: string;
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

  const hasMediaOrPdf = Boolean(params.pdfBase64 || params.fileUri || (params.transcriptText && params.transcriptText.trim().length > 30));
  const effectiveTopic = params.topicHint?.trim() || (hasMediaOrPdf ? 'Conteúdo fiel dos arquivos/materiais enviados' : params.subjectName);

  const prompt = isShort
    ? `Você é um Professor Especialista criando uma apresentação de SLIDES DIDÁTICOS E ILUSTRADOS em português (PT-BR).
Tema / Foco: "${effectiveTopic}".
Abordagem: ${params.technique}.

REGRA CRÍTICA DE FIDELIDADE:
- Baseie-se FIELMENTE nos arquivos enviados (PDF/vídeo/áudio/texto abaixo).
- NUNCA fale sobre "estudo livre", "autodidatismo" ou "técnicas de estudo", a menos que o material enviado seja explicitamente sobre isso. Se o material for Matemática, Cálculo, Programação ou qualquer outra disciplina, ensine EXCLUSIVAMENTE essa disciplina em profundidade, com exemplos resolvidos do dia a dia, passo a passo, analogias claras e armadilhas de prova.

CONTEÚDO / ANOTAÇÕES ENVIADAS PELO ALUNO:
${params.transcriptText?.slice(0, 14000) || 'Analise integralmente o PDF ou vídeo/áudio anexado.'}

REGRAS DOS SLIDES:
- Gere ${params.targetMinutes <= 1 ? '4' : '6 a 7'} slides sequenciais muito bem explicados.
- Em "narration", escreva uma explicação didática rica, clara e profunda (não rasa!), usando exemplos práticos e do dia a dia.
- Use "example_or_code" para mostrar contas passo a passo, fórmulas ou código quando fizer sentido (ou "" se não precisar).
- "visual_nodes" são 3 blocos visuais ilustrativos do slide e "connections" ligam os labels exatos quando houver diagrama.`
    : `Você é um Professor Especialista criando uma APRESENTAÇÃO DE SLIDES COMPLETA E PROFUNDA (estilo Gamma/Keynote, equivalente a ${params.targetMinutes} minutos de aula) em português (PT-BR).
Tema / Foco: "${effectiveTopic}".
Abordagem: ${params.technique}.

REGRA CRÍTICA DE FIDELIDADE:
- Extraia os tópicos REAIS dos arquivos enviados (PDF/vídeo/áudio/texto abaixo) e aprofunde com fontes acadêmicas confiáveis.
- NUNCA invente aulas genéricas sobre "estudo livre" ou "autodidatismo". Ensine EXCLUSIVAMENTE a matéria/tema real do material enviado (ex: Matemática, Cálculo, Algoritmos, etc.), com exemplos resolvidos passo a passo, aplicações do dia a dia e armadilhas de prova.

CONTEÚDO / ANOTAÇÕES ENVIADAS PELO ALUNO:
${params.transcriptText?.slice(0, 14000) || 'Analise integralmente o PDF ou vídeo/áudio anexado.'}

FAÇA DUAS COISAS AGORA:
1. Divida o conteúdo real em 4 a 6 MÓDULOS progressivos ("modules").
2. Já gere os 5 primeiros SLIDES profundos e ilustrados ("scenes") do MÓDULO 1 com explicação detalhada, "example_or_code" (contas/exemplos/código quando aplicável), "visual_nodes" e "connections".`;

  const contentsPayload = [
    {
      role: 'user',
      parts: buildMultimodalParts({
        prompt,
        pdfBase64: params.pdfBase64,
        fileUri: params.fileUri,
        fileMimeType: params.fileMimeType,
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

  let res;
  try {
    res = await ai.models.generateContent({
      model: DEEP_MODEL,
      contents: contentsPayload,
      config: configPayload,
    });
  } catch {
    res = await ai.models.generateContent({
      model: MODEL,
      contents: contentsPayload,
      config: configPayload,
    });
  }

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
}): Promise<AnimatedScene[]> {
  const ai = getAi();
  const prompt = `Você continua a aula completa "${params.lessonTitle}" (Técnica: ${params.technique}).
Agora gere as cenas PROFUNDAS e NÃO RASAS do Módulo ${params.moduleIndex + 1}: "${params.moduleTitle}" (${params.moduleMinutes} minutos).
Objetivo do módulo: ${params.moduleGoal}

CONTEXTO / MATERIAIS:
${params.contextText.slice(0, 10000)}

Gere 4 a 5 cenas sequenciais ricas (~${Math.round((params.moduleMinutes * 60) / 4)}s cada cena):
- Narração detalhada (130-220 palavras por cena) explicando o porquê, exemplos concretos, analogias e rigor técnico, citando fontes confiáveis em "sources_hint".
- 3 a 4 "visual_nodes" + "connections" conectando os labels exatos dos nós.`;

  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: buildMultimodalParts({
          prompt,
          fileUri: params.fileUri,
          fileMimeType: params.fileMimeType,
        }),
      },
    ],
    config: {
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
    },
  });

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
