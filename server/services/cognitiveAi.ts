import { GoogleGenAI, Type } from '@google/genai';

const MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.8-flash';

function getAi(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no ambiente.');
  }
  return new GoogleGenAI({ apiKey });
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (i < retries && (status === 503 || status === 429 || !status)) {
        await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function suggestObsidianLinks(
  currentSubjectName: string,
  notesMarkdown: string,
  existingTargets: Array<{ subjectName: string; title: string }>
): Promise<Array<{ target: string; reason: string }>> {
  const ai = getAi();
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Matéria atual: ${currentSubjectName}\n\nNotas atuais:\n${notesMarkdown.slice(0, 3500)}\n\nConceitos/Matérias existentes do aluno:\n${JSON.stringify(existingTargets)}`,
      config: {
        systemInstruction:
          'Você ajuda a conectar conhecimentos estilo Obsidian. Sugira de 2 a 4 conexões [[conceito]] relevantes entre a nota atual e os outros assuntos/conceitos do aluno (ou novos conceitos-ponte). Responda em Português PT-BR.',
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  target: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['target', 'reason'],
              },
            },
          },
          required: ['suggestions'],
        },
      },
    })
  );
  const parsed = JSON.parse(res.text || '{"suggestions":[]}') as {
    suggestions: Array<{ target: string; reason: string }>;
  };
  return parsed.suggestions || [];
}

export interface InboxTriageResult {
  detected_subject_name: string;
  detected_subtopic: string;
  summary_markdown: string;
  concepts: Array<{
    subtopic: string;
    title: string;
    summary: string;
    feynman_explanation: string;
  }>;
  flashcards: Array<{
    subtopic: string;
    front: string;
    back: string;
    hint: string;
  }>;
  quiz_questions: Array<{
    subtopic: string;
    prompt: string;
    options: string[];
    correct_index: number;
    explanation: string;
  }>;
}

export async function triageInboxMaterial(
  title: string,
  contentPreview: string,
  existingSubjects: string[]
): Promise<InboxTriageResult> {
  const ai = getAi();
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Arquivo: ${title}\nMatérias já cadastradas pelo aluno: ${existingSubjects.join(', ') || 'Nenhuma'}\n\nConteúdo extraído:\n${contentPreview.slice(0, 14000)}`,
      config: {
        systemInstruction:
          'Você é o motor de triagem do Study OS. Leia o material bruto enviado (slide, plano de ensino, transcrição ou livro) e organize-o em Português (PT-BR): identifique a matéria mais próxima (use exatamente o nome de uma matéria existente se combinar, ou sugira uma nova), o subtópico principal, um resumo estruturado, 2 a 3 conceitos com analogia Feynman, 3 flashcards de Active Recall e 4 perguntas de múltipla escolha com explicação.',
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            detected_subject_name: { type: Type.STRING },
            detected_subtopic: { type: Type.STRING },
            summary_markdown: { type: Type.STRING },
            concepts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  subtopic: { type: Type.STRING },
                  title: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  feynman_explanation: { type: Type.STRING },
                },
                required: ['subtopic', 'title', 'summary', 'feynman_explanation'],
              },
            },
            flashcards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  subtopic: { type: Type.STRING },
                  front: { type: Type.STRING },
                  back: { type: Type.STRING },
                  hint: { type: Type.STRING },
                },
                required: ['subtopic', 'front', 'back', 'hint'],
              },
            },
            quiz_questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  subtopic: { type: Type.STRING },
                  prompt: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correct_index: { type: Type.INTEGER },
                  explanation: { type: Type.STRING },
                },
                required: ['subtopic', 'prompt', 'options', 'correct_index', 'explanation'],
              },
            },
          },
          required: [
            'detected_subject_name',
            'detected_subtopic',
            'summary_markdown',
            'concepts',
            'flashcards',
            'quiz_questions',
          ],
        },
      },
    })
  );

  return JSON.parse(res.text || '{}') as InboxTriageResult;
}

export async function generateSelectiveReadingPlan(
  bookTitle: string,
  author: string,
  syllabusOrToc: string,
  totalPages: number
): Promise<string> {
  const ai = getAi();
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Livro: ${bookTitle} (${author || 'Autor não informado'}) — ${totalPages} páginas.\nSumário / Ementa da Faculdade:\n${syllabusOrToc.slice(0, 6000)}`,
      config: {
        systemInstruction:
          'Crie um Plano de Leitura Seletiva em Markdown (Português PT-BR) para o aluno não precisar ler o livro inteiro capa a capa. Indique: 1) Blocos/capítulos prioritários, 2) O que pode pular, 3) 2 perguntas de Pré-Teste para responder antes de abrir o livro.',
        temperature: 0.2,
      },
    })
  );
  return res.text || '';
}

export interface ProfessorLesson {
  topic: string;
  hook: string;
  visual_analogy: string;
  mermaid_diagram: string;
  practical_example: string;
  exam_trap: string;
}

export async function generateProfessorLesson(
  subjectName: string,
  topic: string,
  notesContext: string
): Promise<ProfessorLesson> {
  const ai = getAi();
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Matéria: ${subjectName}\nTema da aula: ${topic}\nContexto/Notas do aluno:\n${notesContext.slice(0, 4000)}`,
      config: {
        systemInstruction:
          'Você é o arquiteto do "Modo Carlos Professor" (Técnica Feynman + Dual Coding). Transforme o tema técnico em um roteiro de mini-aula em Português PT-BR para o aluno ensinar em voz alta ou gravar conteúdo: gancho real, analogia visual, diagrama Mermaid válido, exemplo prático e pegadinha clássica de prova.',
        temperature: 0.25,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            hook: { type: Type.STRING },
            visual_analogy: { type: Type.STRING },
            mermaid_diagram: { type: Type.STRING },
            practical_example: { type: Type.STRING },
            exam_trap: { type: Type.STRING },
          },
          required: ['topic', 'hook', 'visual_analogy', 'mermaid_diagram', 'practical_example', 'exam_trap'],
        },
      },
    })
  );
  return JSON.parse(res.text || '{}') as ProfessorLesson;
}

export async function evaluateProfessorExplanation(
  topic: string,
  userExplanation: string
): Promise<{ clarity_score: number; strengths: string[]; gaps_to_fix: string[]; refined_summary: string }> {
  const ai = getAi();
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Tema: ${topic}\nExplicação do aluno (Técnica Feynman):\n${userExplanation}`,
      config: {
        systemInstruction:
          'Avalie a explicação do aluno aplicando a Técnica Feynman. Dê uma nota de 0 a 100 em clareza/precisão, liste pontos fortes, aponte exatamente onde ele "enrolou" ou deixou lacuna técnica (gaps_to_fix) e dê uma síntese refinada em Português PT-BR.',
        temperature: 0.15,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            clarity_score: { type: Type.INTEGER },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            gaps_to_fix: { type: Type.ARRAY, items: { type: Type.STRING } },
            refined_summary: { type: Type.STRING },
          },
          required: ['clarity_score', 'strengths', 'gaps_to_fix', 'refined_summary'],
        },
      },
    })
  );
  return JSON.parse(res.text || '{}') as {
    clarity_score: number;
    strengths: string[];
    gaps_to_fix: string[];
    refined_summary: string;
  };
}

export async function generateDailyStudyPlan(input: {
  availableMinutes: number;
  dueCards: number;
  pendingRecoveries: number;
  subjects: Array<{ name: string; due_count: number }>;
  preferredBlockMin: number;
}): Promise<{
  strategy_note: string;
  blocks: Array<{
    order: number;
    duration_min: number;
    device: 'mobile' | 'desktop';
    technique: string;
    subject: string;
    action: string;
  }>;
}> {
  const ai = getAi();
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: JSON.stringify(input),
      config: {
        systemInstruction:
          'Monte um Plano de Estudo Diário realista em Português PT-BR usando ciência cognitiva (Spaced Repetition nos blocos curtos/mobile, Recuperação de pontos fracos, Interleaving e Modo Professor nos blocos longos/desktop) respeitando exatamente availableMinutes.',
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            strategy_note: { type: Type.STRING },
            blocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  order: { type: Type.INTEGER },
                  duration_min: { type: Type.INTEGER },
                  device: { type: Type.STRING, enum: ['mobile', 'desktop'] },
                  technique: { type: Type.STRING },
                  subject: { type: Type.STRING },
                  action: { type: Type.STRING },
                },
                required: ['order', 'duration_min', 'device', 'technique', 'subject', 'action'],
              },
            },
          },
          required: ['strategy_note', 'blocks'],
        },
      },
    })
  );
  return JSON.parse(res.text || '{"strategy_note":"","blocks":[]}') as {
    strategy_note: string;
    blocks: Array<{
      order: number;
      duration_min: number;
      device: 'mobile' | 'desktop';
      technique: string;
      subject: string;
      action: string;
    }>;
  };
}
