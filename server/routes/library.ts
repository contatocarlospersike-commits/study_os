import { Router } from 'express';
import crypto from 'node:crypto';
import { extractText, getDocumentProxy } from 'unpdf';
import { execute, isPostgresDb, queryAll, queryOne } from '../db.js';
import { embedTexts } from '../services/rag.js';
import { generateSelectiveReadingPlan, suggestBooksForSubject, triageInboxMaterial } from '../services/cognitiveAi.js';

export const libraryRouter = Router();

const OPEN_ACCESS_CATALOG = [
  {
    title: 'Precalculus 2e',
    author: 'OpenStax (Rice University)',
    subject_hint: 'Pré-Cálculo / Matemática',
    total_pages: 1080,
    external_url: 'https://openstax.org/details/books/precalculus-2e',
    source_type: 'open_pdf',
  },
  {
    title: 'Mathematics for Computer Science (6.042J)',
    author: 'Eric Lehman, F Thomson Leighton, Albert R Meyer (MIT)',
    subject_hint: 'Lógica, Conjuntos, Grafos & Algoritmos',
    total_pages: 993,
    external_url: 'https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-fall-2010/pages/readings/',
    source_type: 'open_pdf',
  },
  {
    title: 'Think Python (2nd/3rd Ed.)',
    author: 'Allen B. Downey (Green Tea Press)',
    subject_hint: 'Introdução à Computação / Programação',
    total_pages: 290,
    external_url: 'https://greenteapress.com/wp/think-python-2e/',
    source_type: 'open_pdf',
  },
  {
    title: 'SciELO Livros — Acesso Aberto Brasil',
    author: 'Acervo Acadêmico Brasileiro (PT-BR)',
    subject_hint: 'Formação Cidadã / Educação a Distância / Humanas',
    total_pages: 250,
    external_url: 'https://books.scielo.org/',
    source_type: 'open_pdf',
  },
  {
    title: 'eduCAPES — Portal de Objetos Educacionais',
    author: 'CAPES / Universidades Públicas BR',
    subject_hint: 'Ciência da Computação & Matemática em PT-BR',
    total_pages: 200,
    external_url: 'https://educapes.capes.gov.br/',
    source_type: 'open_pdf',
  },
];

libraryRouter.get('/open-catalog', (_req, res) => {
  res.json(OPEN_ACCESS_CATALOG);
});

libraryRouter.post('/suggest-books', async (req, res) => {
  const { subject_id } = req.body;
  if (!subject_id) {
    res.status(400).json({ error: 'subject_id é obrigatório.' });
    return;
  }

  const subject = await queryOne<{ id: string; name: string; description: string; notes_markdown: string }>(
    `SELECT id, name, description, notes_markdown FROM subjects WHERE id = ? AND user_id = ?`,
    [subject_id, req.userId]
  );
  if (!subject) {
    res.status(404).json({ error: 'Matéria não encontrada.' });
    return;
  }

  const concepts = await queryAll<{ title: string; summary: string }>(
    `SELECT title, summary FROM concepts WHERE subject_id = ? AND user_id = ? LIMIT 15`,
    [subject_id, req.userId]
  );
  const materials = await queryAll<{ title: string }>(
    `SELECT title FROM materials WHERE subject_id = ? AND user_id = ? LIMIT 15`,
    [subject_id, req.userId]
  );

  const context = [
    `Descrição: ${subject.description}`,
    `Materiais enviados: ${materials.map((m) => m.title).join(', ') || 'nenhum ainda'}`,
    `Conceitos: ${concepts.map((c) => `${c.title}: ${c.summary}`).join('\n')}`,
    `Notas: ${subject.notes_markdown}`,
  ].join('\n\n');

  const books = await suggestBooksForSubject(subject.name, context);

  // Enrich with real open PDF lookup on Internet Archive when open_pdf_url is empty
  const enriched = await Promise.all(
    books.slice(0, 3).map(async (b) => {
      if (b.open_pdf_url && b.open_pdf_url.startsWith('http')) return b;
      try {
        const q = encodeURIComponent(`title:(${b.title}) AND mediatype:texts AND format:(Text PDF)`);
        const resp = await fetch(
          `https://archive.org/advancedsearch.php?q=${q}&fl[]=identifier&rows=1&output=json`,
          { signal: AbortSignal.timeout(2500) }
        );
        if (resp.ok) {
          const json = (await resp.json()) as { response?: { docs?: Array<{ identifier?: string }> } };
          const id = json.response?.docs?.[0]?.identifier;
          if (id) {
            return {
              ...b,
              open_pdf_url: `https://archive.org/embed/${id}`,
              availability_hint: 'PDF gratuito encontrado no Internet Archive',
            };
          }
        }
      } catch {
        // ignore network timeout
      }
      return b;
    })
  );

  res.json({ subjectName: subject.name, books: enriched });
});

libraryRouter.get('/books', async (req, res) => {
  const books = await queryAll(
    `SELECT b.*, s.name as subject_name, s.color as subject_color
     FROM books b
     LEFT JOIN subjects s ON s.id = b.subject_id
     WHERE b.user_id = ?
     ORDER BY b.updated_at DESC`,
    [req.userId]
  );
  res.json(books);
});

libraryRouter.post('/books', async (req, res) => {
  const {
    title,
    author = '',
    subject_id = null,
    source_type = 'pearson',
    external_url = '',
    status = 'to_read',
    current_page = 0,
    total_pages = 100,
    summary_markdown = '',
    insights_markdown = '',
    cover_style = 'aurora',
  } = req.body;

  if (!title) {
    res.status(400).json({ error: 'Título do livro é obrigatório.' });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO books (id, user_id, subject_id, title, author, source_type, external_url, status, current_page, total_pages, summary_markdown, insights_markdown, selective_plan_markdown, cover_style, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?)`,
    [
      id,
      req.userId,
      subject_id || null,
      title,
      author,
      source_type,
      external_url,
      status,
      Number(current_page) || 0,
      Math.max(1, Number(total_pages) || 100),
      summary_markdown,
      insights_markdown,
      cover_style || 'aurora',
      now,
      now,
    ]
  );

  const created = await queryOne(
    `SELECT b.*, s.name as subject_name, s.color as subject_color
     FROM books b LEFT JOIN subjects s ON s.id = b.subject_id WHERE b.id = ? AND b.user_id = ?`,
    [id, req.userId]
  );
  res.status(201).json(created);
});

libraryRouter.patch('/books/:id', async (req, res) => {
  const existing = await queryOne<Record<string, unknown>>(
    `SELECT * FROM books WHERE id = ? AND user_id = ?`,
    [req.params.id, req.userId]
  );
  if (!existing) {
    res.status(404).json({ error: 'Livro não encontrado.' });
    return;
  }

  const {
    status,
    current_page,
    total_pages,
    summary_markdown,
    insights_markdown,
    external_url,
    subject_id,
    cover_style,
  } = req.body;
  const now = new Date().toISOString();

  await execute(
    `UPDATE books
     SET status = ?, current_page = ?, total_pages = ?, summary_markdown = ?, insights_markdown = ?, external_url = ?, subject_id = ?, cover_style = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      status ?? existing.status,
      typeof current_page === 'number' ? current_page : existing.current_page,
      typeof total_pages === 'number' ? Math.max(1, total_pages) : existing.total_pages,
      summary_markdown ?? existing.summary_markdown,
      insights_markdown ?? existing.insights_markdown,
      external_url ?? existing.external_url,
      subject_id !== undefined ? subject_id : existing.subject_id,
      cover_style ?? existing.cover_style ?? 'aurora',
      now,
      req.params.id,
      req.userId,
    ]
  );

  const updated = await queryOne(
    `SELECT b.*, s.name as subject_name, s.color as subject_color
     FROM books b LEFT JOIN subjects s ON s.id = b.subject_id WHERE b.id = ? AND b.user_id = ?`,
    [req.params.id, req.userId]
  );
  res.json(updated);
});

libraryRouter.delete('/books/:id', async (req, res) => {
  await execute(`DELETE FROM books WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
  res.json({ ok: true });
});

libraryRouter.post('/books/:id/selective-plan', async (req, res) => {
  const book = await queryOne<{ id: string; title: string; author: string; total_pages: number }>(
    `SELECT id, title, author, total_pages FROM books WHERE id = ? AND user_id = ?`,
    [req.params.id, req.userId]
  );
  if (!book) {
    res.status(404).json({ error: 'Livro não encontrado.' });
    return;
  }
  const syllabus = String(req.body.syllabus_or_toc || '');
  if (!syllabus.trim()) {
    res.status(400).json({ error: 'Cole o sumário ou a ementa da matéria.' });
    return;
  }

  const plan = await generateSelectiveReadingPlan(
    book.title,
    book.author,
    syllabus,
    book.total_pages
  );
  const now = new Date().toISOString();
  await execute(
    `UPDATE books SET selective_plan_markdown = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    [plan, now, book.id, req.userId]
  );
  res.json({ selective_plan_markdown: plan });
});

/**
 * Inbox "Jogar o Grosso" -> Triagem Automática + Criação de Matéria/Conceitos/Cards/Quiz + Indexação RAG
 */
libraryRouter.post('/inbox/triage', async (req, res) => {
  const { title, file_type = 'pdf', content_base64, text_content } = req.body;
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

  const combinedText = pages.join('\n\n').trim();
  if (!combinedText) {
    res.status(400).json({ error: 'Não foi possível extrair texto deste material.' });
    return;
  }

  const existingSubjects = await queryAll<{ id: string; name: string }>(
    `SELECT id, name FROM subjects WHERE user_id = ?`,
    [req.userId]
  );

  const triage = await triageInboxMaterial(
    title,
    combinedText,
    existingSubjects.map((s) => s.name)
  );

  const now = new Date().toISOString();
  let subject = existingSubjects.find(
    (s) => s.name.toLowerCase() === triage.detected_subject_name.toLowerCase()
  );

  if (!subject) {
    const subId = crypto.randomUUID();
    const slug =
      triage.detected_subject_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') +
      '-' +
      subId.slice(0, 4);
    await execute(
      `INSERT INTO subjects (id, user_id, name, slug, color, description, notes_markdown, transcript_markdown, created_at, updated_at)
       VALUES (?, ?, ?, ?, '#38bdf8', ?, ?, '', ?, ?)`,
      [
        subId,
        req.userId,
        triage.detected_subject_name,
        slug,
        `Criada automaticamente pela Inbox (${title})`,
        triage.summary_markdown,
        now,
        now,
      ]
    );
    subject = { id: subId, name: triage.detected_subject_name };
  }

  for (const c of triage.concepts) {
    await execute(
      `INSERT INTO concepts (id, user_id, subject_id, subtopic, title, summary, feynman_explanation, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        req.userId,
        subject.id,
        c.subtopic,
        c.title,
        c.summary,
        c.feynman_explanation,
        now,
      ]
    );
  }

  for (const f of triage.flashcards) {
    await execute(
      `INSERT INTO flashcards (id, user_id, subject_id, subtopic, front, back, hint, interval_days, ease_factor, repetitions, lapses, step_index, due_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 2.5, 0, 0, 0, ?, ?)`,
      [crypto.randomUUID(), req.userId, subject.id, f.subtopic, f.front, f.back, f.hint, now, now]
    );
  }

  let createdQuizId: string | null = null;
  if (triage.quiz_questions.length > 0) {
    createdQuizId = crypto.randomUUID();
    await execute(
      `INSERT INTO quizzes (id, user_id, subject_id, title, type, created_at)
       VALUES (?, ?, ?, ?, 'standard', ?)`,
      [createdQuizId, req.userId, subject.id, `Inbox Active Recall: ${title}`, now]
    );
    for (const q of triage.quiz_questions) {
      await execute(
        `INSERT INTO quiz_questions (id, quiz_id, subtopic, prompt, options_json, correct_index, explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          createdQuizId,
          q.subtopic,
          q.prompt,
          JSON.stringify(q.options),
          q.correct_index,
          q.explanation,
        ]
      );
    }
  }

  // Also index chunks into RAG automatically
  const chunksToIndex: Array<{ page: number; idx: number; content: string }> = [];
  let idx = 0;
  pages.forEach((p, pIdx) => {
    const clean = p.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    for (let s = 0; s < clean.length && chunksToIndex.length < 80; s += 1200) {
      chunksToIndex.push({ page: pIdx + 1, idx: idx++, content: clean.slice(s, s + 1400) });
    }
  });

  if (chunksToIndex.length > 0) {
    const vectors = await embedTexts(chunksToIndex.map((c) => c.content));
    const matId = crypto.randomUUID();
    await execute(
      `INSERT INTO materials (id, user_id, subject_id, title, file_type, page_count, chunk_count, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?)`,
      [matId, req.userId, subject.id, title, file_type, pages.length, chunksToIndex.length, now]
    );
    for (let i = 0; i < chunksToIndex.length; i++) {
      const c = chunksToIndex[i];
      const vec = vectors[i] || [];
      if (isPostgresDb) {
        await execute(
          `INSERT INTO document_chunks (id, user_id, material_id, subject_id, page_number, chunk_index, content, embedding, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?::vector, ?)`,
          [crypto.randomUUID(), req.userId, matId, subject.id, c.page, c.idx, c.content, `[${vec.join(',')}]`, now]
        );
      } else {
        await execute(
          `INSERT INTO document_chunks (id, user_id, material_id, subject_id, page_number, chunk_index, content, embedding_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), req.userId, matId, subject.id, c.page, c.idx, c.content, JSON.stringify(vec), now]
        );
      }
    }
  }

  res.status(201).json({
    subjectName: subject.name,
    subjectId: subject.id,
    subtopic: triage.detected_subtopic,
    conceptsCreated: triage.concepts.length,
    flashcardsCreated: triage.flashcards.length,
    quizQuestionsCreated: triage.quiz_questions.length,
    quizId: createdQuizId,
    ragChunksIndexed: chunksToIndex.length,
  });
});
