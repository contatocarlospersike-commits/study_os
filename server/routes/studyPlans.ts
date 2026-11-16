import { Router } from 'express';
import crypto from 'node:crypto';
import { execute, queryAll, queryOne } from '../db.js';
import { generateBlockLessonAndPractice, generateSubjectStudyPlan } from '../services/studyPlanAi.js';

export const studyPlansRouter = Router();

studyPlansRouter.get('/subject/:subjectId', async (req, res) => {
  const plan = await queryOne<Record<string, unknown>>(
    `SELECT * FROM study_plans WHERE subject_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT 1`,
    [req.params.subjectId, req.userId]
  );

  if (!plan) {
    res.json({ plan: null, blocks: [] });
    return;
  }

  const blocks = await queryAll(
    `SELECT * FROM study_blocks WHERE plan_id = ? AND user_id = ? ORDER BY sort_order ASC, week_number ASC`,
    [String(plan.id), req.userId]
  );

  res.json({
    plan: {
      ...plan,
      days: JSON.parse(String(plan.days_json || '[]')),
      slots: JSON.parse(String(plan.slots_json || '{}')),
    },
    blocks,
  });
});

studyPlansRouter.post('/generate', async (req, res) => {
  const {
    subject_id,
    days = ['Seg', 'Qua', 'Sex'],
    slots = { morning: 20, afternoon: 0, night: 45 },
    exam_date = '',
  } = req.body as {
    subject_id?: string;
    days?: string[];
    slots?: { morning?: number; afternoon?: number; night?: number };
    exam_date?: string;
  };

  if (!subject_id) {
    res.status(400).json({ error: 'subject_id é obrigatório.' });
    return;
  }

  const subject = await queryOne<{ id: string; name: string; description: string }>(
    `SELECT id, name, description FROM subjects WHERE id = ? AND user_id = ?`,
    [subject_id, req.userId]
  );
  if (!subject) {
    res.status(404).json({ error: 'Matéria/Projeto não encontrado.' });
    return;
  }

  const materials = await queryAll<{ title: string }>(
    `SELECT title FROM materials WHERE subject_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 20`,
    [subject_id, req.userId]
  );
  const chunks = await queryAll<{ content: string }>(
    `SELECT content FROM document_chunks WHERE subject_id = ? AND user_id = ? LIMIT 12`,
    [subject_id, req.userId]
  );
  const notes = await queryAll<{ title: string; content_markdown: string }>(
    `SELECT title, content_markdown FROM notes WHERE subject_id = ? AND user_id = ? AND page_type != 'folder' ORDER BY updated_at DESC LIMIT 8`,
    [subject_id, req.userId]
  );
  const profile = await queryOne<{ preferred_block_min: number }>(
    `SELECT preferred_block_min FROM learning_profile WHERE user_id = ?`,
    [req.userId]
  );

  const materialsContext = [
    materials.length > 0 ? `Materiais enviados: ${materials.map((m) => m.title).join(', ')}` : '',
    ...notes.map((n) => `Nota "${n.title}": ${n.content_markdown.slice(0, 500)}`),
    ...chunks.map((c) => c.content.slice(0, 450)),
  ]
    .filter(Boolean)
    .join('\n\n');

  const normalizedSlots = {
    morning: Math.max(0, Number(slots?.morning) || 0),
    afternoon: Math.max(0, Number(slots?.afternoon) || 0),
    night: Math.max(0, Number(slots?.night) || 0),
  };
  const safeDays = Array.isArray(days) && days.length > 0 ? days : ['Seg', 'Qua', 'Sex'];

  const generated = await generateSubjectStudyPlan({
    subjectName: subject.name,
    subjectDescription: subject.description || '',
    materialsContext,
    days: safeDays,
    slots: normalizedSlots,
    examDate: exam_date,
    preferredBlockMin: profile?.preferred_block_min || 25,
  });

  // Replace previous plan for this subject so workspace stays clean
  await execute(`DELETE FROM study_plans WHERE subject_id = ? AND user_id = ?`, [
    subject_id,
    req.userId,
  ]);

  const planId = crypto.randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO study_plans (id, user_id, subject_id, exam_date, days_json, slots_json, strategy_summary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      planId,
      req.userId,
      subject_id,
      exam_date,
      JSON.stringify(safeDays),
      JSON.stringify(normalizedSlots),
      generated.strategy_summary,
      now,
      now,
    ]
  );

  for (let i = 0; i < generated.blocks.length; i++) {
    const b = generated.blocks[i];
    await execute(
      `INSERT INTO study_blocks (
        id, user_id, plan_id, subject_id, week_number, day_label, shift_label,
        duration_min, topic, technique, objective, lesson_markdown, quiz_id,
        status, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', NULL, 'pending', ?, ?, ?)`,
      [
        crypto.randomUUID(),
        req.userId,
        planId,
        subject_id,
        Number(b.week_number) || 1,
        b.day_label || safeDays[i % safeDays.length],
        b.shift_label || 'Noite',
        Number(b.duration_min) || 30,
        b.topic,
        b.technique || 'Feynman + Active Recall',
        b.objective || '',
        i,
        now,
        now,
      ]
    );
  }

  const blocks = await queryAll(
    `SELECT * FROM study_blocks WHERE plan_id = ? AND user_id = ? ORDER BY sort_order ASC`,
    [planId, req.userId]
  );

  res.status(201).json({
    plan: {
      id: planId,
      subject_id,
      exam_date,
      days: safeDays,
      slots: normalizedSlots,
      strategy_summary: generated.strategy_summary,
      created_at: now,
      updated_at: now,
    },
    blocks,
  });
});

studyPlansRouter.post('/blocks/:blockId/prepare', async (req, res) => {
  const block = await queryOne<Record<string, unknown>>(
    `SELECT * FROM study_blocks WHERE id = ? AND user_id = ?`,
    [req.params.blockId, req.userId]
  );
  if (!block) {
    res.status(404).json({ error: 'Bloco não encontrado.' });
    return;
  }

  // Return immediately if already prepared unless force=true
  if (block.lesson_markdown && !req.body?.force) {
    res.json({ block, createdFlashcards: 0, quizId: block.quiz_id || null });
    return;
  }

  const subjectId = String(block.subject_id);
  const subject = await queryOne<{ name: string }>(
    `SELECT name FROM subjects WHERE id = ? AND user_id = ?`,
    [subjectId, req.userId]
  );

  const chunks = await queryAll<{ content: string }>(
    `SELECT content FROM document_chunks WHERE subject_id = ? AND user_id = ? LIMIT 12`,
    [subjectId, req.userId]
  );
  const notes = await queryAll<{ title: string; content_markdown: string }>(
    `SELECT title, content_markdown FROM notes WHERE subject_id = ? AND user_id = ? AND page_type != 'folder' LIMIT 6`,
    [subjectId, req.userId]
  );

  const materialsContext = [
    ...notes.map((n) => `Nota "${n.title}": ${n.content_markdown.slice(0, 600)}`),
    ...chunks.map((c) => c.content.slice(0, 600)),
  ]
    .filter(Boolean)
    .join('\n\n');

  const generated = await generateBlockLessonAndPractice({
    subjectName: subject?.name || 'Estudo',
    topic: String(block.topic),
    objective: String(block.objective || ''),
    technique: String(block.technique || 'Feynman + Active Recall'),
    durationMin: Number(block.duration_min) || 30,
    materialsContext,
  });

  const now = new Date().toISOString();

  // Save flashcards
  let createdFlashcards = 0;
  for (const fc of generated.flashcards) {
    await execute(
      `INSERT INTO flashcards (id, user_id, subject_id, concept_id, subtopic, front, back, hint, due_at, created_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        req.userId,
        subjectId,
        String(block.topic),
        fc.front,
        fc.back,
        fc.hint || '',
        now,
        now,
      ]
    );
    createdFlashcards++;
  }

  // Save quiz
  let quizId: string | null = null;
  if (generated.quiz_questions.length > 0) {
    quizId = crypto.randomUUID();
    await execute(
      `INSERT INTO quizzes (id, user_id, subject_id, title, type, created_at)
       VALUES (?, ?, ?, ?, 'standard', ?)`,
      [quizId, req.userId, subjectId, `Bloco: ${String(block.topic)}`, now]
    );
    for (const q of generated.quiz_questions) {
      const opts = Array.isArray(q.options) && q.options.length >= 2 ? q.options.slice(0, 4) : ['A', 'B', 'C', 'D'];
      const correctIdx = Math.max(0, Math.min(opts.length - 1, Number(q.correctIndex) || 0));
      await execute(
        `INSERT INTO quiz_questions (id, quiz_id, subtopic, prompt, options_json, correct_index, explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          quizId,
          q.subtopic || String(block.topic),
          q.prompt,
          JSON.stringify(opts),
          correctIdx,
          q.explanation || '',
        ]
      );
    }
  }

  await execute(
    `UPDATE study_blocks SET lesson_markdown = ?, quiz_id = ?, status = 'ready', updated_at = ? WHERE id = ? AND user_id = ?`,
    [generated.lesson_markdown, quizId, now, req.params.blockId, req.userId]
  );

  const updated = await queryOne(`SELECT * FROM study_blocks WHERE id = ? AND user_id = ?`, [
    req.params.blockId,
    req.userId,
  ]);
  res.json({ block: updated, createdFlashcards, quizId });
});

studyPlansRouter.post('/blocks/:blockId/complete', async (req, res) => {
  const block = await queryOne<Record<string, unknown>>(
    `SELECT * FROM study_blocks WHERE id = ? AND user_id = ?`,
    [req.params.blockId, req.userId]
  );
  if (!block) {
    res.status(404).json({ error: 'Bloco não encontrado.' });
    return;
  }
  const nextStatus =
    block.status === 'completed' ? (block.lesson_markdown ? 'ready' : 'pending') : 'completed';
  const now = new Date().toISOString();
  await execute(
    `UPDATE study_blocks SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    [nextStatus, now, req.params.blockId, req.userId]
  );
  const updated = await queryOne(`SELECT * FROM study_blocks WHERE id = ? AND user_id = ?`, [
    req.params.blockId,
    req.userId,
  ]);
  res.json(updated);
});
