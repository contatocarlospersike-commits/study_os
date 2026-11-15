import { Router } from 'express';
import crypto from 'node:crypto';
import { execute, queryAll, queryOne } from '../db.js';
import { computeNextSchedule, type ReviewRating } from '../engine/spacedRepetition.js';

export const reviewsRouter = Router();

reviewsRouter.get('/', async (req, res) => {
  const onlyDue = req.query.due === 'true';
  const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : null;
  const nowIso = new Date().toISOString();

  let sql = `
    SELECT f.*, s.name as subject_name, s.color as subject_color
    FROM flashcards f
    JOIN subjects s ON s.id = f.subject_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (onlyDue) {
    sql += ` AND f.due_at <= ?`;
    params.push(nowIso);
  }
  if (subjectId) {
    sql += ` AND f.subject_id = ?`;
    params.push(subjectId);
  }
  sql += ` ORDER BY f.due_at ASC`;

  const cards = await queryAll(sql, params);
  res.json(cards);
});

reviewsRouter.post('/', async (req, res) => {
  const { subject_id, subtopic = 'General', front, back, hint = '' } = req.body;
  if (!subject_id || !front || !back) {
    res.status(400).json({ error: 'subject_id, front, and back are required' });
    return;
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO flashcards (id, subject_id, subtopic, front, back, hint, interval_days, ease_factor, repetitions, lapses, step_index, due_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 2.5, 0, 0, 0, ?, ?)`,
    [id, subject_id, subtopic, front, back, hint, now, now]
  );

  const created = await queryOne(
    `SELECT f.*, s.name as subject_name, s.color as subject_color
     FROM flashcards f JOIN subjects s ON s.id = f.subject_id WHERE f.id = ?`,
    [id]
  );
  res.status(201).json(created);
});

reviewsRouter.post('/:id/rate', async (req, res) => {
  const rating = req.body.rating as ReviewRating;
  if (!['again', 'hard', 'good', 'easy'].includes(rating)) {
    res.status(400).json({ error: 'rating must be again | hard | good | easy' });
    return;
  }

  const card = await queryOne<{
    id: string;
    interval_days: number;
    ease_factor: number;
    repetitions: number;
    lapses: number;
    step_index: number;
  }>(`SELECT * FROM flashcards WHERE id = ?`, [req.params.id]);

  if (!card) {
    res.status(404).json({ error: 'Flashcard not found' });
    return;
  }

  const next = computeNextSchedule(card, rating);

  await execute(
    `UPDATE flashcards
     SET interval_days = ?, ease_factor = ?, repetitions = ?, lapses = ?, step_index = ?, due_at = ?, last_reviewed_at = ?
     WHERE id = ?`,
    [
      next.interval_days,
      next.ease_factor,
      next.repetitions,
      next.lapses,
      next.step_index,
      next.due_at,
      next.last_reviewed_at,
      card.id,
    ]
  );

  const updated = await queryOne(
    `SELECT f.*, s.name as subject_name, s.color as subject_color
     FROM flashcards f JOIN subjects s ON s.id = f.subject_id WHERE f.id = ?`,
    [card.id]
  );

  res.json(updated);
});
