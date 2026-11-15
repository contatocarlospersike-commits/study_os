import { Router } from 'express';
import crypto from 'node:crypto';
import { execute, queryAll, queryOne } from '../db.js';
import { generateSessionAutoQuiz } from '../engine/recoveryPlan.js';
import { dispatchNotification, getAutomationSettings } from '../services/dispatcher.js';

export const sessionsRouter = Router();

sessionsRouter.get('/', async (req, res) => {
  const sessions = await queryAll(
    `SELECT ss.*, s.name as subject_name, s.color as subject_color
     FROM study_sessions ss
     JOIN subjects s ON s.id = ss.subject_id
     WHERE ss.user_id = ?
     ORDER BY ss.started_at DESC
     LIMIT 20`,
    [req.userId]
  );
  res.json(sessions);
});

sessionsRouter.post('/start', async (req, res) => {
  const { subject_id, subtopic = 'General', mode = 'deep_work' } = req.body;
  if (!subject_id) {
    res.status(400).json({ error: 'subject_id is required' });
    return;
  }
  const owned = await queryOne(`SELECT id FROM subjects WHERE id = ? AND user_id = ?`, [
    subject_id,
    req.userId,
  ]);
  if (!owned) {
    res.status(404).json({ error: 'Subject not found' });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO study_sessions (id, user_id, subject_id, subtopic, mode, started_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, req.userId, subject_id, subtopic, mode, now]
  );

  const session = await queryOne(`SELECT * FROM study_sessions WHERE id = ? AND user_id = ?`, [
    id,
    req.userId,
  ]);
  res.status(201).json(session);
});

sessionsRouter.post('/:id/end', async (req, res) => {
  const session = await queryOne<{
    id: string;
    subject_id: string;
    subject_name: string;
    subtopic: string;
    mode: string;
    started_at: string;
  }>(
    `SELECT ss.*, s.name as subject_name
     FROM study_sessions ss
     JOIN subjects s ON s.id = ss.subject_id
     WHERE ss.id = ? AND ss.user_id = ?`,
    [req.params.id, req.userId]
  );

  if (!session) {
    res.status(404).json({ error: 'Study session not found' });
    return;
  }

  const endedAt = new Date();
  const startedAt = new Date(session.started_at);
  const durationSec =
    typeof req.body.duration_sec === 'number'
      ? req.body.duration_sec
      : Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  const notesSnapshot = typeof req.body.notes_snapshot === 'string' ? req.body.notes_snapshot : '';

  const settings = await getAutomationSettings(req.userId);
  let autoQuiz: { quizId: string; title: string; questionCount: number } | null = null;

  if (settings.auto_quiz_on_session_end) {
    const generated = await generateSessionAutoQuiz(
      req.userId,
      session.subject_id,
      session.subject_name,
      session.subtopic,
      session.id
    );
    autoQuiz = {
      quizId: generated.quizId,
      title: generated.title,
      questionCount: generated.questions.length,
    };

    await dispatchNotification({
      userId: req.userId,
      eventType: 'session_auto_quiz',
      title: `Session Complete — 5-Question Auto-Quiz Ready`,
      message: `Finished ${session.mode.replace('_', ' ')} on ${session.subject_name}: ${session.subtopic}. Tap to launch your 5-question Active Recall check.`,
      payload: {
        sessionId: session.id,
        subjectId: session.subject_id,
        subjectName: session.subject_name,
        subtopic: session.subtopic,
        durationSec,
        quizId: generated.quizId,
        quizTitle: generated.title,
        questionsPreview: generated.questions.map((q) => q.prompt),
        deepLink: `/?view=quizzes&quizId=${generated.quizId}`,
      },
    });
  }

  await execute(
    `UPDATE study_sessions
     SET ended_at = ?, duration_sec = ?, notes_snapshot = ?, auto_quiz_id = ?
     WHERE id = ? AND user_id = ?`,
    [endedAt.toISOString(), durationSec, notesSnapshot, autoQuiz?.quizId ?? null, session.id, req.userId]
  );

  res.json({
    sessionId: session.id,
    durationSec,
    autoQuiz,
  });
});
