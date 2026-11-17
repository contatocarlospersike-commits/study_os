import { GoogleGenAI, Type } from '@google/genai';
import crypto from 'node:crypto';
import { execute, queryOne } from '../db.js';

export interface FeynmanLessonSchema {
  titulo_aula: string;
  conceito_central: string;
  analogia_mundo_real: string;
  traducao_tecnica: string;
  armadilhas_comuns: string[];
  perguntas_active_recall: string[];
}

export interface FeynmanPipelineInput {
  userId: string;
  subjectId?: string | null;
  pdfBase64?: string;
  pdfFilename?: string;
  transcriptText?: string;
  topicHint?: string;
  model?: string;
  saveToWorkspace?: boolean;
}

const DEFAULT_FEYNMAN_MODEL =
  process.env.GEMINI_FEYNMAN_MODEL || process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no ambiente.');
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Node 1: Multimodal call to Google Gemini (PDF slides + transcript/text)
 * enforcing the strict FeynmanLessonSchema via Structured Outputs.
 */
export async function nodeGenerateFeynmanLesson(input: {
  pdfBase64?: string;
  transcriptText?: string;
  topicHint?: string;
  model?: string;
}): Promise<{ lesson: FeynmanLessonSchema; modelUsed: string }> {
  const ai = getAiClient();
  const modelUsed = input.model || DEFAULT_FEYNMAN_MODEL;

  const systemPrompt = `Você é um Especialista em Pedagogia Cognitiva aplicando rigorosamente a Técnica de Feynman.
Receba os slides em PDF e/ou a transcrição da aula e gere uma aula estruturada em português (PT-BR) com clareza máxima:
1. titulo_aula: título direto e memorável.
2. conceito_central: a essência do tema em 2-4 frases simples, sem jargões desnecessários.
3. analogia_mundo_real: uma analogia vívida e concreta do dia a dia (ex: restaurante, trânsito, caixa de ferramentas) que um adolescente entenda na hora — ideal para estudar ouvindo ou revisando rápido.
4. traducao_tecnica: ponte exata ligando a analogia aos termos técnicos, fórmulas ou definições formais cobradas na prova/prática.
5. armadilhas_comuns: lista de 3 a 5 erros clássicos, pegadinhas de prova ou confusões conceituais que os alunos cometem.
6. perguntas_active_recall: lista de 4 a 6 perguntas abertas de recuperação ativa para o aluno responder sem consultar o material.`;

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (input.pdfBase64 && input.pdfBase64.trim().length > 0) {
    const cleanBase64 = input.pdfBase64.includes(',')
      ? input.pdfBase64.split(',')[1]
      : input.pdfBase64;
    parts.push({
      inlineData: {
        mimeType: 'application/pdf',
        data: cleanBase64,
      },
    });
  }

  const textContext = [
    input.topicHint ? `Foco / Tema indicado pelo aluno: ${input.topicHint}` : '',
    input.transcriptText?.trim()
      ? `Transcrição / Anotações da Aula:\n${input.transcriptText.trim().slice(0, 18000)}`
      : 'Sem transcrição textual adicional — analise integralmente o PDF dos slides anexado.',
  ]
    .filter(Boolean)
    .join('\n\n');

  parts.push({ text: `${systemPrompt}\n\n${textContext}` });

  const response = await ai.models.generateContent({
    model: modelUsed,
    contents: [{ role: 'user', parts }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          titulo_aula: { type: Type.STRING },
          conceito_central: { type: Type.STRING },
          analogia_mundo_real: { type: Type.STRING },
          traducao_tecnica: { type: Type.STRING },
          armadilhas_comuns: { type: Type.ARRAY, items: { type: Type.STRING } },
          perguntas_active_recall: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: [
          'titulo_aula',
          'conceito_central',
          'analogia_mundo_real',
          'traducao_tecnica',
          'armadilhas_comuns',
          'perguntas_active_recall',
        ],
      },
    },
  });

  const raw = JSON.parse(response.text || '{}') as Partial<FeynmanLessonSchema>;
  const lesson: FeynmanLessonSchema = {
    titulo_aula: String(raw.titulo_aula || input.topicHint || 'Aula Feynman'),
    conceito_central: String(raw.conceito_central || ''),
    analogia_mundo_real: String(raw.analogia_mundo_real || ''),
    traducao_tecnica: String(raw.traducao_tecnica || ''),
    armadilhas_comuns: Array.isArray(raw.armadilhas_comuns) ? raw.armadilhas_comuns.map(String) : [],
    perguntas_active_recall: Array.isArray(raw.perguntas_active_recall)
      ? raw.perguntas_active_recall.map(String)
      : [],
  };

  return { lesson, modelUsed };
}

/**
 * Node 2: Persists the structured Feynman lesson into PostgreSQL/SQLite,
 * and optionally creates a linked Workspace note.
 */
export async function nodeSaveFeynmanLesson(params: {
  userId: string;
  subjectId?: string | null;
  lesson: FeynmanLessonSchema;
  sourceFilename?: string;
  modelUsed: string;
  saveToWorkspace?: boolean;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO feynman_lessons (
      id, user_id, subject_id, titulo_aula, conceito_central, analogia_mundo_real,
      traducao_tecnica, armadilhas_comuns_json, perguntas_active_recall_json,
      source_filename, model_used, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.userId,
      params.subjectId || null,
      params.lesson.titulo_aula,
      params.lesson.conceito_central,
      params.lesson.analogia_mundo_real,
      params.lesson.traducao_tecnica,
      JSON.stringify(params.lesson.armadilhas_comuns),
      JSON.stringify(params.lesson.perguntas_active_recall),
      params.sourceFilename || '',
      params.modelUsed,
      now,
    ]
  );

  let workspaceNoteId: string | null = null;
  if (params.saveToWorkspace && params.subjectId) {
    workspaceNoteId = crypto.randomUUID();
    const md = [
      `## Conceito Central\n${params.lesson.conceito_central}`,
      `## Analogia do Mundo Real\n${params.lesson.analogia_mundo_real}`,
      `## Tradução Técnica\n${params.lesson.traducao_tecnica}`,
      `## Armadilhas Comuns\n${params.lesson.armadilhas_comuns.map((a) => `- ${a}`).join('\n')}`,
      `## Perguntas de Active Recall\n${params.lesson.perguntas_active_recall.map((p) => `- [ ] ${p}`).join('\n')}`,
    ].join('\n\n');

    await execute(
      `INSERT INTO notes (id, user_id, subject_id, parent_id, title, icon, cover_style, page_type, status, content_markdown, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, '🧠', '', 'note', 'active', ?, ?, ?)`,
      [workspaceNoteId, params.userId, params.subjectId, `Feynman: ${params.lesson.titulo_aula}`, md, now, now]
    );
  }

  const saved = await queryOne(`SELECT * FROM feynman_lessons WHERE id = ? AND user_id = ?`, [
    id,
    params.userId,
  ]);

  return {
    ...(saved || { id }),
    armadilhas_comuns: params.lesson.armadilhas_comuns,
    perguntas_active_recall: params.lesson.perguntas_active_recall,
    workspace_note_id: workspaceNoteId,
  };
}

export async function runFeynmanWorkflow(input: FeynmanPipelineInput) {
  const { lesson, modelUsed } = await nodeGenerateFeynmanLesson({
    pdfBase64: input.pdfBase64,
    transcriptText: input.transcriptText,
    topicHint: input.topicHint,
    model: input.model,
  });

  return nodeSaveFeynmanLesson({
    userId: input.userId,
    subjectId: input.subjectId,
    lesson,
    sourceFilename: input.pdfFilename,
    modelUsed,
    saveToWorkspace: input.saveToWorkspace,
  });
}
