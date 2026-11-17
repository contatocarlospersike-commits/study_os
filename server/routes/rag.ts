import { Router } from 'express';
import crypto from 'node:crypto';
import { extractText, getDocumentProxy } from 'unpdf';
import { execute, isPostgresDb, queryAll, queryOne } from '../db.js';
import { askRagTutor, embedTexts } from '../services/rag.js';

export const materialsRouter = Router();
export const chatRouter = Router();

function chunkPageText(text: string, maxChars = 1400, overlap = 200): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChars) return [cleaned];

  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(cleaned.length, start + maxChars);
    chunks.push(cleaned.slice(start, end));
    if (end >= cleaned.length) break;
    start = end - overlap;
  }
  return chunks;
}

materialsRouter.get('/', async (req, res) => {
  const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : null;
  const rows = subjectId
    ? await queryAll(
        `SELECT m.*, s.name as subject_name FROM materials m LEFT JOIN subjects s ON s.id = m.subject_id WHERE m.user_id = ? AND m.subject_id = ? ORDER BY m.created_at DESC`,
        [req.userId, subjectId]
      )
    : await queryAll(
        `SELECT m.*, s.name as subject_name FROM materials m LEFT JOIN subjects s ON s.id = m.subject_id WHERE m.user_id = ? ORDER BY m.created_at DESC`,
        [req.userId]
      );
  res.json(rows);
});

/**
 * Accepts JSON with { title, subject_id, file_type: 'pdf' | 'text', content_base64?, text_content? }
 */
materialsRouter.post('/ingest', async (req, res) => {
  const { title, subject_id = null, file_type = 'pdf', content_base64, text_content } = req.body;
  if (!title || (!content_base64 && !text_content)) {
    res.status(400).json({ error: 'title e content_base64 ou text_content são obrigatórios.' });
    return;
  }

  let pages: string[] = [];
  if (file_type === 'pdf' && content_base64) {
    const buffer = Buffer.from(content_base64, 'base64');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const extracted = await extractText(pdf, { mergePages: false });
    pages = Array.isArray(extracted.text) ? extracted.text : [String(extracted.text || '')];
  } else {
    pages = [String(text_content || '')];
  }

  const chunkRecords: Array<{ pageNumber: number; chunkIndex: number; content: string }> = [];
  let globalIdx = 0;
  pages.forEach((pageText, pageIdx) => {
    const subChunks = chunkPageText(pageText);
    for (const c of subChunks) {
      chunkRecords.push({
        pageNumber: pageIdx + 1,
        chunkIndex: globalIdx++,
        content: c,
      });
    }
  });

  if (chunkRecords.length === 0) {
    res.status(400).json({ error: 'Não foi possível extrair texto legível deste material.' });
    return;
  }

  // Cap at 120 chunks per synchronous upload to stay fast on serverless
  const limitedChunks = chunkRecords.slice(0, 120);
  const embeddings = await embedTexts(limitedChunks.map((c) => c.content));

  const materialId = crypto.randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO materials (id, user_id, subject_id, title, file_type, page_count, chunk_count, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?)`,
    [materialId, req.userId, subject_id || null, title, file_type, pages.length, limitedChunks.length, now]
  );

  for (let i = 0; i < limitedChunks.length; i++) {
    const ch = limitedChunks[i];
    const vec = embeddings[i] || [];
    if (isPostgresDb) {
      const vecLiteral = `[${vec.join(',')}]`;
      await execute(
        `INSERT INTO document_chunks (id, user_id, material_id, subject_id, page_number, chunk_index, content, embedding, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?::vector, ?)`,
        [
          crypto.randomUUID(),
          req.userId,
          materialId,
          subject_id || null,
          ch.pageNumber,
          ch.chunkIndex,
          ch.content,
          vecLiteral,
          now,
        ]
      );
    } else {
      await execute(
        `INSERT INTO document_chunks (id, user_id, material_id, subject_id, page_number, chunk_index, content, embedding_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          req.userId,
          materialId,
          subject_id || null,
          ch.pageNumber,
          ch.chunkIndex,
          ch.content,
          JSON.stringify(vec),
          now,
        ]
      );
    }
  }

  const created = await queryOne(`SELECT * FROM materials WHERE id = ? AND user_id = ?`, [
    materialId,
    req.userId,
  ]);
  res.status(201).json(created);
});

materialsRouter.delete('/:id', async (req, res) => {
  await execute(`DELETE FROM materials WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
  res.json({ ok: true });
});

chatRouter.get('/threads', async (req, res) => {
  const threads = await queryAll(
    `SELECT ct.*, s.name as subject_name FROM chat_threads ct LEFT JOIN subjects s ON s.id = ct.subject_id WHERE ct.user_id = ? ORDER BY ct.updated_at DESC LIMIT 20`,
    [req.userId]
  );
  res.json(threads);
});

chatRouter.get('/threads/:id/messages', async (req, res) => {
  const messages = await queryAll(
    `SELECT * FROM chat_messages WHERE thread_id = ? AND user_id = ? ORDER BY created_at ASC`,
    [req.params.id, req.userId]
  );
  res.json(
    messages.map((m) => ({
      ...m,
      citations: JSON.parse(String(m.citations_json || '[]')),
      follow_up_questions: JSON.parse(String(m.follow_up_json || '[]')),
      verified_by_critic: Boolean(m.verified_by_critic),
    }))
  );
});

chatRouter.post('/', async (req, res) => {
  const {
    thread_id,
    subject_id = null,
    message,
    english_practice_mode = false,
    model_mode = 'fast',
  } = req.body;
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'message é obrigatório.' });
    return;
  }

  const now = new Date().toISOString();
  let activeThreadId = thread_id as string | undefined;

  if (!activeThreadId) {
    activeThreadId = crypto.randomUUID();
    await execute(
      `INSERT INTO chat_threads (id, user_id, subject_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [activeThreadId, req.userId, subject_id, message.slice(0, 60), now, now]
    );
  } else {
    await execute(`UPDATE chat_threads SET updated_at = ? WHERE id = ? AND user_id = ?`, [
      now,
      activeThreadId,
      req.userId,
    ]);
  }

  const historyRows = await queryAll<{ role: 'user' | 'assistant'; content: string }>(
    `SELECT role, content FROM chat_messages WHERE thread_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 6`,
    [activeThreadId, req.userId]
  );

  await execute(
    `INSERT INTO chat_messages (id, user_id, thread_id, role, content, created_at)
     VALUES (?, ?, ?, 'user', ?, ?)`,
    [crypto.randomUUID(), req.userId, activeThreadId, message, now]
  );

  const ragResult = await askRagTutor({
    userId: req.userId,
    question: message,
    subjectId: subject_id,
    englishPracticeMode: Boolean(english_practice_mode),
    modelMode: model_mode === 'deep' ? 'deep' : 'fast',
    history: [...historyRows].reverse(),
  });

  const assistantMsgId = crypto.randomUUID();
  const assistantNow = new Date().toISOString();

  await execute(
    `INSERT INTO chat_messages (id, user_id, thread_id, role, content, citations_json, mermaid_diagram, grounding_status, verified_by_critic, follow_up_json, created_at)
     VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?)`,
    [
      assistantMsgId,
      req.userId,
      activeThreadId,
      ragResult.answer,
      JSON.stringify(ragResult.citations),
      ragResult.mermaid_diagram || '',
      ragResult.grounding_status,
      ragResult.verified_by_critic ? 1 : 0,
      JSON.stringify(ragResult.follow_up_questions),
      assistantNow,
    ]
  );

  res.json({
    threadId: activeThreadId,
    message: {
      id: assistantMsgId,
      role: 'assistant',
      content: ragResult.answer,
      citations: ragResult.citations,
      mermaid_diagram: ragResult.mermaid_diagram,
      grounding_status: ragResult.grounding_status,
      verified_by_critic: ragResult.verified_by_critic,
      follow_up_questions: ragResult.follow_up_questions,
      created_at: assistantNow,
    },
  });
});
