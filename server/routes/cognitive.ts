import { Router } from 'express';
import crypto from 'node:crypto';
import { execute, queryAll, queryOne } from '../db.js';
import {
  evaluateProfessorExplanation,
  evaluateYoutubeLesson,
  generateDailyStudyPlan,
  generateProfessorLesson,
  suggestObsidianLinks,
} from '../services/cognitiveAi.js';

export const cognitiveRouter = Router();

// --- Obsidian Graph & Backlinks ---
cognitiveRouter.get('/graph', async (req, res) => {
  const subjects = await queryAll<{ id: string; name: string; color: string }>(
    `SELECT id, name, color FROM subjects WHERE user_id = ?`,
    [req.userId]
  );
  const links = await queryAll<{
    id: string;
    source_subject_id: string;
    target_label: string;
    target_subject_id: string | null;
  }>(`SELECT id, source_subject_id, target_label, target_subject_id FROM note_links WHERE user_id = ?`, [
    req.userId,
  ]);

  res.json({ subjects, links });
});

cognitiveRouter.post('/subjects/:id/suggest-links', async (req, res) => {
  const subject = await queryOne<{ id: string; name: string; notes_markdown: string }>(
    `SELECT id, name, notes_markdown FROM subjects WHERE id = ? AND user_id = ?`,
    [req.params.id, req.userId]
  );
  if (!subject) {
    res.status(404).json({ error: 'Matéria não encontrada.' });
    return;
  }

  const concepts = await queryAll<{ title: string; subject_name: string }>(
    `SELECT c.title, s.name as subject_name FROM concepts c JOIN subjects s ON s.id = c.subject_id WHERE c.user_id = ?`,
    [req.userId]
  );

  const suggestions = await suggestObsidianLinks(
    subject.name,
    subject.notes_markdown,
    concepts.map((c) => ({ subjectName: c.subject_name, title: c.title }))
  );

  res.json({ suggestions });
});

// --- Modo Carlos Professor (Feynman) ---
cognitiveRouter.post('/professor/lesson', async (req, res) => {
  const { subject_id, topic } = req.body;
  if (!subject_id || !topic) {
    res.status(400).json({ error: 'subject_id e topic são obrigatórios.' });
    return;
  }

  const subject = await queryOne<{ id: string; name: string; notes_markdown: string }>(
    `SELECT id, name, notes_markdown FROM subjects WHERE id = ? AND user_id = ?`,
    [subject_id, req.userId]
  );
  if (!subject) {
    res.status(404).json({ error: 'Matéria não encontrada.' });
    return;
  }

  const lesson = await generateProfessorLesson(subject.name, topic, subject.notes_markdown);
  res.json(lesson);
});

cognitiveRouter.post('/professor/evaluate', async (req, res) => {
  const topic = req.body.topic;
  const userExplanation = req.body.user_explanation || req.body.explanation;
  if (!topic || !userExplanation) {
    res.status(400).json({ error: 'topic e user_explanation são obrigatórios.' });
    return;
  }
  const evaluation = await evaluateProfessorExplanation(topic, userExplanation);
  res.json(evaluation);
});

cognitiveRouter.post('/professor/evaluate-video', async (req, res) => {
  const { subject_id, topic, youtube_url, transcript_fallback } = req.body;
  if (!topic || (!youtube_url && !transcript_fallback)) {
    res.status(400).json({ error: 'Informe o tópico e o link do YouTube ou transcrição.' });
    return;
  }
  const subject = subject_id
    ? await queryOne<{ name: string }>(`SELECT name FROM subjects WHERE id = ? AND user_id = ?`, [
        subject_id,
        req.userId,
      ])
    : null;

  const evaluation = await evaluateYoutubeLesson({
    subjectName: subject?.name || 'Geral',
    topic,
    youtubeUrl: youtube_url,
    transcriptFallback: transcript_fallback,
  });
  res.json(evaluation);
});

// --- Planejador Diário + Rotina + Checklist ---
cognitiveRouter.get('/checklist', async (req, res) => {
  const items = await queryAll(
    `SELECT * FROM study_checklist_items WHERE user_id = ? ORDER BY completed ASC, created_at DESC LIMIT 40`,
    [req.userId]
  );
  res.json(items);
});

cognitiveRouter.post('/checklist/:id/toggle', async (req, res) => {
  const item = await queryOne<{ id: string; completed: number }>(
    `SELECT id, completed FROM study_checklist_items WHERE id = ? AND user_id = ?`,
    [req.params.id, req.userId]
  );
  if (!item) {
    res.status(404).json({ error: 'Item não encontrado.' });
    return;
  }
  const next = item.completed ? 0 : 1;
  await execute(`UPDATE study_checklist_items SET completed = ? WHERE id = ? AND user_id = ?`, [
    next,
    req.params.id,
    req.userId,
  ]);
  const updated = await queryOne(`SELECT * FROM study_checklist_items WHERE id = ? AND user_id = ?`, [
    req.params.id,
    req.userId,
  ]);
  res.json(updated);
});

cognitiveRouter.delete('/checklist/:id', async (req, res) => {
  await execute(`DELETE FROM study_checklist_items WHERE id = ? AND user_id = ?`, [
    req.params.id,
    req.userId,
  ]);
  res.json({ ok: true });
});

cognitiveRouter.post('/planner/today', async (req, res) => {
  const availableMinutes = Math.max(15, Number(req.body.available_minutes || 60));
  const routine = req.body.routine || undefined;
  const nowIso = new Date().toISOString();
  const todayDate = nowIso.slice(0, 10);

  if (routine) {
    await execute(
      `UPDATE learning_profile SET routine_json = ?, updated_at = ? WHERE user_id = ?`,
      [JSON.stringify(routine), nowIso, req.userId]
    );
  }

  const subjects = await queryAll<{ name: string; due_count: number | string }>(
    `SELECT s.name,
      (SELECT COUNT(*) FROM flashcards f WHERE f.subject_id = s.id AND f.user_id = s.user_id AND f.due_at <= ?) as due_count
     FROM subjects s WHERE s.user_id = ?`,
    [nowIso, req.userId]
  );

  const pendingRec = await queryOne<{ count: number | string }>(
    `SELECT COUNT(*) as count FROM recovery_plans WHERE user_id = ? AND status = 'pending'`,
    [req.userId]
  );

  const profile = await queryOne<{ preferred_block_min: number; routine_json?: string }>(
    `SELECT preferred_block_min, routine_json FROM learning_profile WHERE user_id = ?`,
    [req.userId]
  );

  const totalDue = subjects.reduce((acc, s) => acc + Number(s.due_count), 0);
  let effectiveRoutine = routine;
  if (!effectiveRoutine && profile?.routine_json) {
    try {
      effectiveRoutine = JSON.parse(profile.routine_json);
    } catch {
      effectiveRoutine = undefined;
    }
  }

  const plan = await generateDailyStudyPlan({
    availableMinutes,
    dueCards: totalDue,
    pendingRecoveries: Number(pendingRec?.count ?? 0),
    subjects: subjects.map((s) => ({ name: s.name, due_count: Number(s.due_count) })),
    preferredBlockMin: profile?.preferred_block_min ?? 25,
    routine: effectiveRoutine,
  });

  // Save today's blocks into persistent checklist (replacing uncompleted items from today)
  await execute(
    `DELETE FROM study_checklist_items WHERE user_id = ? AND scheduled_date = ? AND completed = 0`,
    [req.userId, todayDate]
  );
  for (const b of plan.blocks || []) {
    await execute(
      `INSERT INTO study_checklist_items (id, user_id, title, subject_name, action_type, duration_min, reason, completed, scheduled_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        crypto.randomUUID(),
        req.userId,
        b.title,
        b.subjectName,
        b.actionType,
        b.durationMin,
        b.reason,
        todayDate,
        nowIso,
      ]
    );
  }

  const checklist = await queryAll(
    `SELECT * FROM study_checklist_items WHERE user_id = ? ORDER BY completed ASC, created_at DESC LIMIT 40`,
    [req.userId]
  );

  res.json({ ...plan, checklist });
});

// --- Calibração do Perfil Cognitivo ---
cognitiveRouter.get('/profile', async (req, res) => {
  const profile = await queryOne(`SELECT * FROM learning_profile WHERE user_id = ?`, [req.userId]);
  const checkins = await queryAll(
    `SELECT * FROM study_checkins WHERE user_id = ? ORDER BY created_at DESC LIMIT 15`,
    [req.userId]
  );
  res.json({ profile, checkins });
});

cognitiveRouter.patch('/profile', async (req, res) => {
  const existing = await queryOne<Record<string, unknown>>(
    `SELECT * FROM learning_profile WHERE user_id = ?`,
    [req.userId]
  );
  const now = new Date().toISOString();
  const preferred_block_min = Number(req.body.preferred_block_min ?? existing?.preferred_block_min ?? 25);
  const visual_preference = Number(req.body.visual_preference ?? existing?.visual_preference ?? 1);
  const frequent_questions = Number(req.body.frequent_questions ?? existing?.frequent_questions ?? 1);
  const english_level = String(req.body.english_level ?? existing?.english_level ?? 'intermediate');

  if (!existing) {
    await execute(
      `INSERT INTO learning_profile (user_id, preferred_block_min, visual_preference, frequent_questions, english_level, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.userId, preferred_block_min, visual_preference, frequent_questions, english_level, now]
    );
  } else {
    await execute(
      `UPDATE learning_profile
       SET preferred_block_min = ?, visual_preference = ?, frequent_questions = ?, english_level = ?, updated_at = ?
       WHERE user_id = ?`,
      [preferred_block_min, visual_preference, frequent_questions, english_level, now, req.userId]
    );
  }
  const updated = await queryOne(`SELECT * FROM learning_profile WHERE user_id = ?`, [req.userId]);
  res.json(updated);
});

cognitiveRouter.post('/checkins', async (req, res) => {
  const { session_id = null, block_mode = 'deep_work', duration_min = 25, energy_level = 3, focus_level = 3 } =
    req.body;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO study_checkins (id, user_id, session_id, block_mode, duration_min, energy_level, focus_level, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.userId, session_id, block_mode, Number(duration_min), Number(energy_level), Number(focus_level), now]
  );

  // Adaptive recommendation: if high focus/energy on shorter blocks vs longer blocks
  const stats = await queryAll<{ block_mode: string; avg_focus: number; avg_duration: number }>(
    `SELECT block_mode, AVG(focus_level) as avg_focus, AVG(duration_min) as avg_duration
     FROM study_checkins WHERE user_id = ? GROUP BY block_mode`,
    [req.userId]
  );

  if (stats.length > 0) {
    const best = [...stats].sort((a, b) => Number(b.avg_focus) - Number(a.avg_focus))[0];
    await execute(
      `UPDATE learning_profile SET preferred_block_min = ?, updated_at = ? WHERE user_id = ?`,
      [Math.max(15, Math.round(Number(best.avg_duration || 25))), now, req.userId]
    );
  }

  res.status(201).json({ ok: true, id });
});
