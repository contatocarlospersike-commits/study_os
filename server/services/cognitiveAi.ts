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

export interface SuggestedBook {
  title: string;
  author: string;
  reason: string;
  availability_hint: string;
  open_pdf_url: string;
  pearson_likely: boolean;
  estimated_pages: number;
}

export async function suggestBooksForSubject(
  subjectName: string,
  subjectContext: string
): Promise<SuggestedBook[]> {
  const ai = getAi();
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Matéria: ${subjectName}\n\nMateriais, conceitos e notas do aluno:\n${subjectContext.slice(0, 5000)}`,
      config: {
        systemInstruction:
          'Você é um curador bibliográfico universitário. Com base nos materiais da matéria, recomende NO MÁXIMO 3 livros essenciais (clássicos de referência da faculdade ou acesso aberto). Nunca retorne mais de 3 livros. Para open_pdf_url, gere uma URL válida de busca legal em repositórios abertos (ex: https://openstax.org/subjects, https://books.scielo.org/, https://doabooks.org/ ou https://arxiv.org/search/?query=...) ou deixe uma busca do Google Acadêmico/DOAB codificada. Responda em Português PT-BR.',
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            books: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  author: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  availability_hint: { type: Type.STRING },
                  open_pdf_url: { type: Type.STRING },
                  pearson_likely: { type: Type.BOOLEAN },
                  estimated_pages: { type: Type.INTEGER },
                },
                required: [
                  'title',
                  'author',
                  'reason',
                  'availability_hint',
                  'open_pdf_url',
                  'pearson_likely',
                  'estimated_pages',
                ],
              },
            },
          },
          required: ['books'],
        },
      },
    })
  );
  const parsed = JSON.parse(res.text || '{"books":[]}') as { books: SuggestedBook[] };
  return (parsed.books || []).slice(0, 3);
}

export interface ProfessorLesson {
  title: string;
  hook30s: string;
  structureBlocks: string[];
  analogy: string;
  coreExplanation: string;
  mermaidDiagram: string;
  checkpointQuestion: string;
  audienceQuestion: string;
  englishTermTip: string;
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
          'Você é o co-piloto do "Modo Carlos Professor & Creator" (Técnica Feynman + YouTube Storytelling). NÃO entregue um texto pronto para ler no teleprompter — entregue um ESQUELETO estratégico em Português PT-BR para o aluno estruturar a aula com suas próprias palavras (máxima fixação) e gravar para o YouTube: título forte, gancho de 30s, 3-4 blocos lógicos de estrutura, analogia visual, resumo-guia, diagrama Mermaid válido, pergunta de checkpoint Feynman e pergunta de engajamento para comentários.',
        temperature: 0.25,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            hook30s: { type: Type.STRING },
            structureBlocks: { type: Type.ARRAY, items: { type: Type.STRING } },
            analogy: { type: Type.STRING },
            coreExplanation: { type: Type.STRING },
            mermaidDiagram: { type: Type.STRING },
            checkpointQuestion: { type: Type.STRING },
            audienceQuestion: { type: Type.STRING },
            englishTermTip: { type: Type.STRING },
          },
          required: [
            'title',
            'hook30s',
            'structureBlocks',
            'analogy',
            'coreExplanation',
            'mermaidDiagram',
            'checkpointQuestion',
            'audienceQuestion',
            'englishTermTip',
          ],
        },
      },
    })
  );
  return JSON.parse(res.text || '{}') as ProfessorLesson;
}

export async function evaluateProfessorExplanation(
  topic: string,
  userExplanation: string
): Promise<{
  score: number;
  strengths: string[];
  gaps: string[];
  correctedExplanation: string;
  nextStep: string;
}> {
  const ai = getAi();
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: `Tema: ${topic}\nExplicação do aluno (Técnica Feynman):\n${userExplanation}`,
      config: {
        systemInstruction:
          'Avalie a explicação do aluno aplicando a Técnica Feynman. Dê uma nota de 0 a 100 em clareza/precisão, liste pontos fortes, aponte lacunas técnicas (gaps), dê uma explicação lapidada e o próximo passo prático em Português PT-BR.',
        temperature: 0.15,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctedExplanation: { type: Type.STRING },
            nextStep: { type: Type.STRING },
          },
          required: ['score', 'strengths', 'gaps', 'correctedExplanation', 'nextStep'],
        },
      },
    })
  );
  return JSON.parse(res.text || '{}') as {
    score: number;
    strengths: string[];
    gaps: string[];
    correctedExplanation: string;
    nextStep: string;
  };
}

export interface YoutubeEvaluationResult {
  technicalScore: number;
  creatorScore: number;
  strengths: string[];
  gaps: string[];
  correctedExplanation: string;
  hookFeedback: string;
  communicationFeedback: string;
  nextStep: string;
}

export async function evaluateYoutubeLesson(input: {
  subjectName: string;
  topic: string;
  youtubeUrl?: string;
  transcriptFallback?: string;
}): Promise<YoutubeEvaluationResult> {
  const ai = getAi();
  const promptText = `Matéria: ${input.subjectName}\nTema da aula: ${input.topic}\n${
    input.transcriptFallback
      ? `Transcrição / Notas do vídeo:\n${input.transcriptFallback.slice(0, 8000)}`
      : 'Analise diretamente o vídeo do YouTube enviado.'
  }`;

  const parts: Array<Record<string, unknown>> = [];
  if (input.youtubeUrl && input.youtubeUrl.trim()) {
    parts.push({ fileData: { fileUri: input.youtubeUrl.trim() } });
  }
  parts.push({ text: promptText });

  const runEval = async (useVideoFile: boolean) => {
    const contentParts = useVideoFile
      ? parts
      : [
          {
            text: `${promptText}\nURL informada: ${input.youtubeUrl || 'N/A'}\n(Avalie com base na transcrição/resumo fornecido pelo aluno.)`,
          },
        ];

    return ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: contentParts as never }],
      config: {
        systemInstruction:
          'Você é mentor duplo do Carlos: (1) Professor Universitário rigoroso em retenção e precisão técnica; (2) Diretor de Canal Educacional no YouTube. Avalie a aula em Português PT-BR dando technicalScore (0-100), creatorScore (0-100), pontos fortes, lacunas técnicas, explicação corrigida, análise do gancho inicial (hookFeedback), análise de comunicação/ritmo/didática (communicationFeedback) e próximo passo.',
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            technicalScore: { type: Type.INTEGER },
            creatorScore: { type: Type.INTEGER },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctedExplanation: { type: Type.STRING },
            hookFeedback: { type: Type.STRING },
            communicationFeedback: { type: Type.STRING },
            nextStep: { type: Type.STRING },
          },
          required: [
            'technicalScore',
            'creatorScore',
            'strengths',
            'gaps',
            'correctedExplanation',
            'hookFeedback',
            'communicationFeedback',
            'nextStep',
          ],
        },
      },
    });
  };

  try {
    const res = await withRetry(() => runEval(Boolean(input.youtubeUrl?.trim())));
    return JSON.parse(res.text || '{}') as YoutubeEvaluationResult;
  } catch (err) {
    if (input.transcriptFallback?.trim()) {
      const res = await withRetry(() => runEval(false));
      return JSON.parse(res.text || '{}') as YoutubeEvaluationResult;
    }
    throw new Error(
      `Não foi possível acessar esse vídeo do YouTube diretamente (${(err as Error).message}). Se o vídeo for privado/não-listado, cole a transcrição no campo opcional abaixo.`
    );
  }
}

export async function generateDailyStudyPlan(input: {
  availableMinutes: number;
  dueCards: number;
  pendingRecoveries: number;
  subjects: Array<{ name: string; due_count: number }>;
  preferredBlockMin: number;
  routine?: {
    examGoal?: string;
    preferredTime?: string;
    focusBalance?: 'balanced' | 'catchup' | 'advance';
  };
}): Promise<{
  availableMinutes: number;
  recommendedBlockMin: number;
  summary: string;
  blocks: Array<{
    order: number;
    durationMin: number;
    actionType: 'review' | 'quiz' | 'feynman' | 'reading' | 'rag_chat';
    subjectName: string;
    title: string;
    reason: string;
  }>;
}> {
  const ai = getAi();
  const res = await withRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: JSON.stringify(input),
      config: {
        systemInstruction:
          'Monte um Plano de Estudo Diário equilibrado em Português PT-BR respeitando availableMinutes. Regra de equilíbrio: se focusBalance for "balanced" (padrão), dedique cerca de 30% do tempo para revisões SM-2/recuperações e 70% para AVANÇO PLANEJADO de matéria nova (leitura seletiva, aula Feynman/YouTube ou conceitos novos), considerando examGoal e preferredTime. Retorne actionType entre: review, quiz, feynman, reading, rag_chat.',
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            availableMinutes: { type: Type.INTEGER },
            recommendedBlockMin: { type: Type.INTEGER },
            summary: { type: Type.STRING },
            blocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  order: { type: Type.INTEGER },
                  durationMin: { type: Type.INTEGER },
                  actionType: {
                    type: Type.STRING,
                    enum: ['review', 'quiz', 'feynman', 'reading', 'rag_chat'],
                  },
                  subjectName: { type: Type.STRING },
                  title: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['order', 'durationMin', 'actionType', 'subjectName', 'title', 'reason'],
              },
            },
          },
          required: ['availableMinutes', 'recommendedBlockMin', 'summary', 'blocks'],
        },
      },
    })
  );
  return JSON.parse(res.text || '{"availableMinutes":60,"recommendedBlockMin":25,"summary":"","blocks":[]}');
}
