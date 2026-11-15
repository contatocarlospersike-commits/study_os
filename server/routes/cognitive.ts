import { Router } from 'express';
import crypto from 'node:crypto';
import { execute, queryAll, queryOne } from '../db.js';
import {
  evaluateProfessorExplanation,
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
  const { topic, explanation } = req.body;
  if (!topic || !explanation) {
    res.status(400).json({ error: 'topic e explanation são obrigatórios.' });
    return;
  }
  const evaluation = await evaluateProfessorExplanation(topic, explanation);
  res.json(evaluation);
});

// --- Planejador Diário ---
cognitiveRouter.post('/planner/today', async (req, res) => {
  const availableMinutes = Math.max(15, Number(req.body.available_minutes || 60));
  const nowIso = new Date().toISOString();

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

  const profile = await queryOne<{ preferred_block_min: number }>(
    `SELECT preferred_block_min FROM learning_profile WHERE user_id = ?`,
    [req.userId]
  );

  const totalDue = subjects.reduce((acc, s) => acc + Number(s.due_count), 0);

  const plan = await generateDailyStudyPlan({
    availableMinutes,
    dueCards: totalDue,
    pendingRecoveries: Number(pendingRec?.count ?? 0),
    subjects: subjects.map((s) => ({ name: s.name, due_count: Number(s.due_count) })),
    preferredBlockMin: profile?.preferred_block_min ?? 25,
  });

  res.json(plan);
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
