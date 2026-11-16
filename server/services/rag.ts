import { GoogleGenAI, Type } from '@google/genai';
import { isPostgresDb, queryAll } from '../db.js';

const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash';
const EMBED_MODEL = 'gemini-embedding-001';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no ambiente.');
  }
  return new GoogleGenAI({ apiKey });
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      if (attempt < retries && (status === 503 || status === 429 || !status)) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const ai = getAiClient();
  const vectors: number[][] = [];

  // Process in batches of 20 to stay well within payload limits
  for (let i = 0; i < texts.length; i += 20) {
    const batch = texts.slice(i, i + 20);
    const res = await ai.models.embedContent({
      model: EMBED_MODEL,
      contents: batch,
      config: { outputDimensionality: 768 },
    });
    if (res.embeddings) {
      for (const emb of res.embeddings) {
        vectors.push(emb.values || []);
      }
    }
  }
  return vectors;
}

export interface RetrievedChunk {
  id: string;
  materialId: string;
  materialTitle: string;
  pageNumber: number;
  content: string;
  score: number;
}

export async function hybridSearchChunks(
  userId: string,
  query: string,
  subjectId?: string | null,
  topK = 6
): Promise<RetrievedChunk[]> {
  const [queryVec] = await embedTexts([query]);
  if (!queryVec || queryVec.length === 0) return [];

  if (isPostgresDb) {
    const vecLiteral = `[${queryVec.join(',')}]`;
    const subjectFilter = subjectId ? 'AND dc.subject_id = ?' : '';
    const params = subjectId
      ? [vecLiteral, query, userId, subjectId, topK]
      : [vecLiteral, query, userId, topK];

    const rows = await queryAll<{
      id: string;
      material_id: string;
      material_title: string;
      page_number: number;
      content: string;
      rrf_score: number;
    }>(
      `WITH vec AS (
        SELECT dc.id, ROW_NUMBER() OVER (ORDER BY dc.embedding <=> ?::vector) AS r
        FROM document_chunks dc
        WHERE dc.user_id = ? ${subjectFilter}
        LIMIT 25
      ),
      lex AS (
        SELECT dc.id, ROW_NUMBER() OVER (ORDER BY ts_rank_cd(dc.tsv, plainto_tsquery('simple', ?)) DESC) AS r
        FROM document_chunks dc
        WHERE dc.user_id = ? ${subjectFilter}
          AND dc.tsv @@ plainto_tsquery('simple', ?)
        LIMIT 25
      )
      SELECT dc.id, dc.material_id, m.title AS material_title, dc.page_number, dc.content,
        (COALESCE(1.0 / (60 + vec.r), 0) + COALESCE(1.0 / (60 + lex.r), 0)) AS rrf_score
      FROM document_chunks dc
      JOIN materials m ON m.id = dc.material_id
      LEFT JOIN vec ON vec.id = dc.id
      LEFT JOIN lex ON lex.id = dc.id
      WHERE dc.user_id = ? ${subjectFilter}
        AND (vec.id IS NOT NULL OR lex.id IS NOT NULL)
      ORDER BY rrf_score DESC
      LIMIT ?`,
      subjectId
        ? [vecLiteral, userId, subjectId, query, userId, subjectId, query, userId, subjectId, topK]
        : [vecLiteral, userId, query, userId, query, userId, topK]
    );

    void params;
    return rows.map((r) => ({
      id: r.id,
      materialId: r.material_id,
      materialTitle: r.material_title,
      pageNumber: Number(r.page_number),
      content: r.content,
      score: Number(r.rrf_score),
    }));
  }

  // Local SQLite fallback: cosine similarity + keyword overlap in JS
  const sql = subjectId
    ? `SELECT dc.id, dc.material_id, m.title AS material_title, dc.page_number, dc.content, dc.embedding_json
       FROM document_chunks dc
       JOIN materials m ON m.id = dc.material_id
       WHERE dc.user_id = ? AND dc.subject_id = ?`
    : `SELECT dc.id, dc.material_id, m.title AS material_title, dc.page_number, dc.content, dc.embedding_json
       FROM document_chunks dc
       JOIN materials m ON m.id = dc.material_id
       WHERE dc.user_id = ?`;

  const rows = await queryAll<{
    id: string;
    material_id: string;
    material_title: string;
    page_number: number;
    content: string;
    embedding_json: string | null;
  }>(sql, subjectId ? [userId, subjectId] : [userId]);

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  const scored = rows.map((r) => {
    const vec = r.embedding_json ? (JSON.parse(r.embedding_json) as number[]) : [];
    const cos = cosineSimilarity(queryVec, vec);
    const lower = r.content.toLowerCase();
    const hits = terms.reduce((acc, t) => acc + (lower.includes(t) ? 1 : 0), 0);
    const lexScore = terms.length > 0 ? hits / terms.length : 0;
    return {
      id: r.id,
      materialId: r.material_id,
      materialTitle: r.material_title,
      pageNumber: Number(r.page_number),
      content: r.content,
      score: cos * 0.75 + lexScore * 0.25,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface RagCitation {
  materialTitle: string;
  pageNumber: number;
  quote: string;
}

export interface RagAnswer {
  answer: string;
  mermaid_diagram: string;
  citations: RagCitation[];
  grounding_status: 'grounded' | 'partial' | 'not_in_materials';
  follow_up_questions: string[];
  verified_by_critic: boolean;
}

export async function askRagTutor(params: {
  userId: string;
  question: string;
  subjectId?: string | null;
  subjectName?: string;
  englishPracticeMode?: boolean;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<RagAnswer> {
  const ai = getAiClient();
  const chunks = await hybridSearchChunks(params.userId, params.question, params.subjectId, 6);

  // Also fetch subject notes & concepts as supplementary context
  const notesRows = params.subjectId
    ? await queryAll<{ name: string; notes_markdown: string }>(
        `SELECT name, notes_markdown FROM subjects WHERE id = ? AND user_id = ?`,
        [params.subjectId, params.userId]
      )
    : [];

  const contextBlocks = chunks.map(
    (c, idx) =>
      `[TRECHO ${idx + 1} | Arquivo: "${c.materialTitle}" | Página: ${c.pageNumber}]\n${c.content}`
  );

  // Pull Workspace Subjects/Projects + Notes + Library Books so the Tutor knows everything
  const allSubjects = await queryAll<{ id: string; name: string; kind: string; description: string }>(
    `SELECT id, name, kind, description FROM subjects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20`,
    [params.userId]
  );

  const workspaceNotes = params.subjectId
    ? await queryAll<{ title: string; content_markdown: string; subject_name: string }>(
        `SELECT n.title, n.content_markdown, s.name as subject_name
         FROM notes n JOIN subjects s ON s.id = n.subject_id
         WHERE n.user_id = ? AND n.subject_id = ? AND n.page_type != 'folder' AND n.content_markdown != ''
         ORDER BY n.updated_at DESC LIMIT 10`,
        [params.userId, params.subjectId]
      )
    : await queryAll<{ title: string; content_markdown: string; subject_name: string }>(
        `SELECT n.title, n.content_markdown, s.name as subject_name
         FROM notes n JOIN subjects s ON s.id = n.subject_id
         WHERE n.user_id = ? AND n.page_type != 'folder' AND n.content_markdown != ''
         ORDER BY n.updated_at DESC LIMIT 12`,
        [params.userId]
      );

  const queryTerms = params.question
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const rankedNotes = [...workspaceNotes].sort((a, b) => {
    const score = (n: typeof a) =>
      queryTerms.reduce(
        (acc, t) =>
          acc +
          (n.title.toLowerCase().includes(t) ? 3 : 0) +
          (n.content_markdown.toLowerCase().includes(t) ? 1 : 0),
        0
      );
    return score(b) - score(a);
  });

  for (const n of rankedNotes.slice(0, 6)) {
    contextBlocks.push(
      `[NOTA "${n.title}" (${n.subject_name}) | Página: 1]\n${n.content_markdown.slice(0, 1600)}`
    );
  }

  const books = await queryAll<{
    title: string;
    author: string;
    status: string;
    summary_markdown: string;
    insights_markdown: string;
  }>(
    `SELECT title, author, status, summary_markdown, insights_markdown FROM books WHERE user_id = ? ORDER BY updated_at DESC LIMIT 6`,
    [params.userId]
  );

  if (allSubjects.length > 0) {
    contextBlocks.push(
      `[ESPAÇOS DO WORKSPACE (MATÉRIAS E PROJETOS) | Página: 1]\n${allSubjects
        .map((s) => `- ${s.kind === 'project' ? 'Projeto' : 'Matéria'}: ${s.name}${s.description ? ` — ${s.description}` : ''}`)
        .join('\n')}`
    );
  }

  if (books.length > 0) {
    contextBlocks.push(
      `[LIVROS NA BIBLIOTECA | Página: 1]\n${books
        .map(
          (b) =>
            `- "${b.title}" (${b.author || 'Autor N/I'}, status: ${b.status})${
              b.summary_markdown ? `\n  Resumo: ${b.summary_markdown.slice(0, 400)}` : ''
            }`
        )
        .join('\n')}`
    );
  }

  if (notesRows[0]?.notes_markdown) {
    contextBlocks.push(
      `[NOTAS DA MATÉRIA "${notesRows[0].name}" | Página: 1]\n${notesRows[0].notes_markdown.slice(0, 1500)}`
    );
  }

  const contextText =
    contextBlocks.length > 0
      ? contextBlocks.join('\n\n---\n\n')
      : 'NENHUM MATERIAL ENCONTRADO NO BANCO PARA ESTA PERGUNTA.';

  const historyText = (params.history || [])
    .slice(-4)
    .map((m) => `${m.role === 'user' ? 'Aluno' : 'Tutor'}: ${m.content}`)
    .join('\n');

  const languageRule = params.englishPracticeMode
    ? 'Responda em Português (PT-BR) claro, mas inclua um bloco curto ao final chamado "English Technical Drill" com 2 frases técnicas em inglês + tradução para o aluno praticar.'
    : 'Responda integralmente em Português (PT-BR) claro, didático e objetivo.';

  const systemInstruction = `Você é o Tutor Cognitivo do Study OS para um aluno de Ciência da Computação (perfil visual + perguntas).
REGRAS ANTI-ALUCINAÇÃO (ESTRITAS):
1. Baseie sua resposta EXCLUSIVAMENTE nos TRECHOS fornecidos abaixo quando o assunto estiver neles.
2. Nunca invente nomes de arquivos, números de página ou citações. Cada citação em "citations" deve copiar um trecho real e o número de página exato do contexto.
3. Se a resposta estiver 100% nos trechos, use grounding_status = "grounded". Se parte vier do seu conhecimento geral porque os trechos são incompletos, avise explicitamente na resposta e use "partial". Se não houver material relevante nos trechos, use "not_in_materials" e diga claramente: "Não encontrei isso nos seus materiais enviados; pela base geral de Computação/Matemática...".
4. ${languageRule}
5. Quando ajudar a visualizar (fluxos, árvores, lógica, etapas matemáticas), gere um diagrama válido em Mermaid em "mermaid_diagram" (ex: "flowchart TD\\n  A[Entrada] --> B[Saída]"). Caso não precise, retorne "".
6. Sempre inclua 2 ou 3 perguntas curtas de Active Recall em "follow_up_questions" para testar se o aluno realmente entendeu.`;

  const prompt = `HISTÓRICO RECENTE:\n${historyText || '(início da conversa)'}\n\nMATERIAIS RECUPERADOS:\n${contextText}\n\nPERGUNTA DO ALUNO:\n${params.question}`;

  const draftRes = await withRetry(() =>
    ai.models.generateContent({
      model: CHAT_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.15,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            answer: { type: Type.STRING },
            mermaid_diagram: { type: Type.STRING },
            grounding_status: {
              type: Type.STRING,
              enum: ['grounded', 'partial', 'not_in_materials'],
            },
            citations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  materialTitle: { type: Type.STRING },
                  pageNumber: { type: Type.INTEGER },
                  quote: { type: Type.STRING },
                },
                required: ['materialTitle', 'pageNumber', 'quote'],
              },
            },
            follow_up_questions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['answer', 'mermaid_diagram', 'grounding_status', 'citations', 'follow_up_questions'],
        },
      },
    })
  );

  const draft = JSON.parse(draftRes.text || '{}') as Omit<RagAnswer, 'verified_by_critic'>;

  // Step 3: Critic / Self-Verification Pass (only when we have retrieved chunks to verify against)
  if (contextBlocks.length > 0 && draft.answer) {
    try {
      const criticPrompt = `Você é um Auditor Anti-Alucinação rigoroso.
Compare o RASCUNHO DE RESPOSTA com os MATERIAIS RECUPERADOS.
Verifique:
1. Há alguma afirmação técnica, fórmula matemática ou passo lógico errado?
2. Alguma citação inventou página ou texto que não existe nos materiais?
3. Se o rascunho afirmou algo sem lastro nos materiais, ajustou corretamente o grounding_status?

MATERIAIS RECUPERADOS:
${contextText}

RASCUNHO:
${JSON.stringify(draft)}

Retorne o JSON final verificado (corrigido se houver qualquer erro, ou idêntico se estiver perfeito).`;

      const criticRes = await withRetry(() =>
        ai.models.generateContent({
          model: CHAT_MODEL,
          contents: criticPrompt,
          config: {
            temperature: 0.0,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                answer: { type: Type.STRING },
                mermaid_diagram: { type: Type.STRING },
                grounding_status: {
                  type: Type.STRING,
                  enum: ['grounded', 'partial', 'not_in_materials'],
                },
                citations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      materialTitle: { type: Type.STRING },
                      pageNumber: { type: Type.INTEGER },
                      quote: { type: Type.STRING },
                    },
                    required: ['materialTitle', 'pageNumber', 'quote'],
                  },
                },
                follow_up_questions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['answer', 'mermaid_diagram', 'grounding_status', 'citations', 'follow_up_questions'],
            },
          },
        })
      );

      const verified = JSON.parse(criticRes.text || '{}') as Omit<RagAnswer, 'verified_by_critic'>;
      return { ...verified, verified_by_critic: true };
    } catch {
      return { ...draft, verified_by_critic: false };
    }
  }

  return { ...draft, verified_by_critic: false };
}
