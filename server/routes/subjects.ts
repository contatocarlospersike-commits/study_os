import { Router } from 'express';
import crypto from 'node:crypto';
import { execute, queryAll, queryOne } from '../db.js';

export const subjectsRouter = Router();

subjectsRouter.get('/', async (_req, res) => {
  const nowIso = new Date().toISOString();
  const subjects = await queryAll(
    `SELECT s.*,
      (SELECT COUNT(*) FROM concepts c WHERE c.subject_id = s.id) as concept_count,
      (SELECT COUNT(*) FROM flashcards f WHERE f.subject_id = s.id) as card_count,
      (SELECT COUNT(*) FROM flashcards f WHERE f.subject_id = s.id AND f.due_at <= ?) as due_count
     FROM subjects s
     ORDER BY s.updated_at DESC`,
    [nowIso]
  );
  res.json(
    subjects.map((s) => ({
      ...s,
      concept_count: Number(s.concept_count ?? 0),
      card_count: Number(s.card_count ?? 0),
      due_count: Number(s.due_count ?? 0),
    }))
  );
});

subjectsRouter.get('/:id', async (req, res) => {
  const subject = await queryOne(`SELECT * FROM subjects WHERE id = ?`, [req.params.id]);
  if (!subject) {
    res.status(404).json({ error: 'Subject not found' });
    return;
  }
  const concepts = await queryAll(
    `SELECT * FROM concepts WHERE subject_id = ? ORDER BY created_at DESC`,
    [req.params.id]
  );
  const flashcards = await queryAll(
    `SELECT * FROM flashcards WHERE subject_id = ? ORDER BY due_at ASC`,
    [req.params.id]
  );
  res.json({ ...subject, concepts, flashcards });
});

subjectsRouter.post('/', async (req, res) => {
  const { name, color = '#22d3ee', description = '', notes_markdown = '', transcript_markdown = '' } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'Subject name is required' });
    return;
  }
  const id = crypto.randomUUID();
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') +
    '-' +
    id.slice(0, 4);
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO subjects (id, name, slug, color, description, notes_markdown, transcript_markdown, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name.trim(), slug, color, description, notes_markdown, transcript_markdown, now, now]
  );

  const created = await queryOne(`SELECT * FROM subjects WHERE id = ?`, [id]);
  res.status(201).json(created);
});

subjectsRouter.patch('/:id', async (req, res) => {
  const existing = await queryOne<Record<string, unknown>>(
    `SELECT * FROM subjects WHERE id = ?`,
    [req.params.id]
  );
  if (!existing) {
    res.status(404).json({ error: 'Subject not found' });
    return;
  }
  const { name, color, description, notes_markdown, transcript_markdown } = req.body;
  const now = new Date().toISOString();

  await execute(
    `UPDATE subjects
     SET name = ?, color = ?, description = ?, notes_markdown = ?, transcript_markdown = ?, updated_at = ?
     WHERE id = ?`,
    [
      name ?? existing.name,
      color ?? existing.color,
      description ?? existing.description,
      notes_markdown ?? existing.notes_markdown,
      transcript_markdown ?? existing.transcript_markdown,
      now,
      req.params.id,
    ]
  );

  const updated = await queryOne(`SELECT * FROM subjects WHERE id = ?`, [req.params.id]);
  res.json(updated);
});

subjectsRouter.post('/:id/concepts', async (req, res) => {
  const subject = await queryOne(`SELECT id FROM subjects WHERE id = ?`, [req.params.id]);
  if (!subject) {
    res.status(404).json({ error: 'Subject not found' });
    return;
  }
  const { subtopic = 'General', title, summary, feynman_explanation = '' } = req.body;
  if (!title || !summary) {
    res.status(400).json({ error: 'title and summary are required' });
    return;
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO concepts (id, subject_id, subtopic, title, summary, feynman_explanation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, subtopic, title, summary, feynman_explanation, now]
  );

  const cardId = crypto.randomUUID();
  await execute(
    `INSERT INTO flashcards (id, subject_id, concept_id, subtopic, front, back, hint, interval_days, ease_factor, repetitions, lapses, step_index, due_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, 2.5, 0, 0, 0, ?, ?)`,
    [
      cardId,
      req.params.id,
      id,
      subtopic,
      `Explain "${title}" (${subtopic})`,
      feynman_explanation ? `${summary}\n\nFeynman Analogy: ${feynman_explanation}` : summary,
      `Sub-topic: ${subtopic}`,
      now,
      now,
    ]
  );

  const concept = await queryOne(`SELECT * FROM concepts WHERE id = ?`, [id]);
  res.status(201).json(concept);
});
