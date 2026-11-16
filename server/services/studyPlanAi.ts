import { GoogleGenAI, Type } from '@google/genai';

const MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash';

function getAi(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada no ambiente.');
  return new GoogleGenAI({ apiKey });
}

export interface StudySlots {
  morning: number;
  afternoon: number;
  night: number;
}

export interface GeneratedBlock {
  week_number: number;
  day_label: string;
  shift_label: string;
  duration_min: number;
  topic: string;
  technique: string;
  objective: string;
}

export async function generateSubjectStudyPlan(params: {
  subjectName: string;
  subjectDescription: string;
  materialsContext: string;
  days: string[];
  slots: StudySlots;
  examDate?: string;
  preferredBlockMin?: number;
}): Promise<{ strategy_summary: string; blocks: GeneratedBlock[] }> {
  const ai = getAi();
  const activeShifts = [
    params.slots.morning > 0 ? `Manhã: ${params.slots.morning} min` : null,
    params.slots.afternoon > 0 ? `Tarde: ${params.slots.afternoon} min` : null,
    params.slots.night > 0 ? `Noite: ${params.slots.night} min` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const prompt = `Você é um Arquiteto de Estudos Cognitivos de alta performance.
Monte um Plano Semanal de Estudo Ativo em português (PT-BR) para a matéria/projeto "${params.subjectName}".
Descrição: ${params.subjectDescription || 'N/A'}
Data da prova / prazo: ${params.examDate || 'Não informada (focar em domínio progressivo)'}
Dias disponíveis na semana: ${params.days.join(', ')}
Tempo disponível por turno: ${activeShifts || 'Noite: 45 min'}
Duração de bloco preferida do aluno: ${params.preferredBlockMin || 25} min

MATERIAIS E NOTAS DO ALUNO:
${params.materialsContext.slice(0, 6000) || 'Nenhum material detalhado ainda — organize pelos fundamentos essenciais do tema.'}

REGRAS:
1. Crie entre 4 e 12 blocos distribuídos EXCLUSIVAMENTE nos dias e turnos informados pelo aluno, respeitando os minutos de cada turno.
2. Se o turno for curto (ex: 15-25 min), foque em micro-aula Feynman + revisão ou flashcards. Se for longo (40-90 min), combine Aula Pronta + Quiz Active Recall / Exercícios.
3. Se houver cronograma ou datas no material, respeite a ordem das semanas/tópicos.
4. No campo "strategy_summary", explique diretamente para o Carlos (em 2-4 frases claras) por que essa alocação gera mais retenção.`;

  const res = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          strategy_summary: { type: Type.STRING },
          blocks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                week_number: { type: Type.INTEGER },
                day_label: { type: Type.STRING },
                shift_label: { type: Type.STRING },
                duration_min: { type: Type.INTEGER },
                topic: { type: Type.STRING },
                technique: { type: Type.STRING },
                objective: { type: Type.STRING },
              },
              required: [
                'week_number',
                'day_label',
                'shift_label',
                'duration_min',
                'topic',
                'technique',
                'objective',
              ],
            },
          },
        },
        required: ['strategy_summary', 'blocks'],
      },
    },
  });

  const parsed = JSON.parse(res.text || '{}') as {
    strategy_summary?: string;
    blocks?: GeneratedBlock[];
  };

  return {
    strategy_summary: parsed.strategy_summary || 'Plano semanal calibrado para sua rotina.',
    blocks: (parsed.blocks || []).slice(0, 12),
  };
}

export async function generateBlockLessonAndPractice(params: {
  subjectName: string;
  topic: string;
  objective: string;
  technique: string;
  durationMin: number;
  materialsContext: string;
}): Promise<{
  lesson_markdown: string;
  flashcards: Array<{ front: string; back: string; hint: string }>;
  quiz_questions: Array<{
    subtopic: string;
    prompt: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }>;
}> {
  const ai = getAi();
  const prompt = `Você é um Professor Particular de Elite usando Técnica Feynman + Active Recall.
Prepare uma AULA PRONTA completa em português (PT-BR) para o bloco de estudo abaixo, para que o aluno possa apenas sentar e estudar sem precisar procurar em vários PDFs.

Matéria/Projeto: ${params.subjectName}
Tópico do Bloco: ${params.topic}
Objetivo: ${params.objective}
Técnica: ${params.technique}
Tempo do Bloco: ${params.durationMin} minutos

TRECHOS DOS MATERIAIS DO ALUNO:
${params.materialsContext.slice(0, 6000) || 'Use conhecimento acadêmico confiável e sólido sobre o tópico.'}

ENTREGUE:
1. "lesson_markdown": Uma aula clara e envolvente em Markdown contendo:
   - ## Intuição Simples (Feynman)
   - ## Conceitos Essenciais (baseado nos materiais + explicação clara)
   - ## Exemplo Prático Passo a Passo
   - ## Checklist de Fixação (3 pontos para saber se dominou)
2. "flashcards": 3 flashcards de alta qualidade para revisão espaçada SM-2.
3. "quiz_questions": 4 questões de múltipla escolha (4 opções cada) para o aluno testar logo após estudar a aula.`;

  const res = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          lesson_markdown: { type: Type.STRING },
          flashcards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                front: { type: Type.STRING },
                back: { type: Type.STRING },
                hint: { type: Type.STRING },
              },
              required: ['front', 'back', 'hint'],
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
                correctIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING },
              },
              required: ['subtopic', 'prompt', 'options', 'correctIndex', 'explanation'],
            },
          },
        },
        required: ['lesson_markdown', 'flashcards', 'quiz_questions'],
      },
    },
  });

  const parsed = JSON.parse(res.text || '{}') as {
    lesson_markdown?: string;
    flashcards?: Array<{ front: string; back: string; hint: string }>;
    quiz_questions?: Array<{
      subtopic: string;
      prompt: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }>;
  };

  return {
    lesson_markdown: parsed.lesson_markdown || `## ${params.topic}\n\nConteúdo em preparação.`,
    flashcards: (parsed.flashcards || []).slice(0, 4),
    quiz_questions: (parsed.quiz_questions || []).slice(0, 5),
  };
}
