import { GoogleGenAI, Type } from '@google/genai';

const MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash';

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
  duration_sec: number;
  narration: string;
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
    duration_sec: { type: Type.INTEGER },
    narration: { type: Type.STRING },
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
    'duration_sec',
    'narration',
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
  const targetSec = Math.max(25, Math.round(params.targetMinutes * 60));

  const prompt = isShort
    ? `Você é um Professor Audiovisual de Elite (estilo 3Blue1Brown + Técnica ${params.technique}).
Crie uma VÍDEO-AULA ANIMADA em português (PT-BR) com duração total aproximada de ${targetSec} segundos sobre "${params.topicHint || params.subjectName}".
Use os materiais anexados (se houver) E enriqueça com conhecimento acadêmico profundo e fontes confiáveis (cite livros/documentações reais em "sources_hint").

CONTEÚDO / CONTEXTO ADICIONAL:
${params.transcriptText?.slice(0, 12000) || 'Use o material anexado e referências acadêmicas sólidas.'}

REGRAS:
- Divida em ${params.targetMinutes <= 1 ? '3' : '5 a 6'} cenas sequenciais cuja soma de "duration_sec" dê ~${targetSec}s.
- Em cada cena, "narration" deve ser exatamente o que a voz vai falar (claro, envolvente, zero superficialidade, explicando com analogias + rigor técnico).
- "visual_nodes" são os blocos visuais (3 a 4 por cena) que surgem animados na tela enquanto a voz fala.
- "connections" são as setas que conectam os labels exatos de "visual_nodes" (from -> to).`
    : `Você é um Arquiteto de Aulas Completas (estilo 3Blue1Brown + Técnica ${params.technique}).
O aluno quer uma AULA COMPLETA E PROFUNDA de ${params.targetMinutes} minutos (NÃO seja raso!) sobre "${params.topicHint || params.subjectName}".
Use os materiais anexados + aprofundamento rico de fontes acadêmicas confiáveis.

CONTEÚDO / CONTEXTO ADICIONAL:
${params.transcriptText?.slice(0, 14000) || 'Use o material anexado e referências acadêmicas sólidas.'}

FAÇA DUAS COISAS AGORA:
1. Divida essa aula de ${params.targetMinutes} minutos em 4 a 6 MÓDULOS progressivos ("modules") cuja soma de "minutes" dê ${params.targetMinutes}.
2. Já gere as cenas detalhadas e profundas ("first_module_scenes": 4 a 5 cenas ricas) apenas do MÓDULO 1 para o aluno já começar a assistir imediatamente!
Cada cena deve ter narração rica (120-200 palavras por cena, ~50-75s de fala), "visual_nodes" (3-4 blocos), "connections" ligando os labels exatos dos nós, e "sources_hint" com a referência confiável.`;

  const res = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: buildMultimodalParts({
          prompt,
          pdfBase64: params.pdfBase64,
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
    },
  });

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
