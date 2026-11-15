import { Router } from 'express';
import crypto from 'node:crypto';
import { execute, queryAll, queryOne } from '../db.js';

export const subjectsRouter = Router();

subjectsRouter.get('/', async (req, res) => {
  const nowIso = new Date().toISOString();
  const subjects = await queryAll(
    `SELECT s.*,
      (SELECT COUNT(*) FROM concepts c WHERE c.subject_id = s.id AND c.user_id = s.user_id) as concept_count,
      (SELECT COUNT(*) FROM flashcards f WHERE f.subject_id = s.id AND f.user_id = s.user_id) as card_count,
      (SELECT COUNT(*) FROM flashcards f WHERE f.subject_id = s.id AND f.user_id = s.user_id AND f.due_at <= ?) as due_count,
      (SELECT COUNT(*) FROM notes n WHERE n.subject_id = s.id AND n.user_id = s.user_id) as note_count
     FROM subjects s
     WHERE s.user_id = ?
     ORDER BY s.updated_at DESC`,
    [nowIso, req.userId]
  );
  res.json(
    subjects.map((s) => ({
      ...s,
      concept_count: Number(s.concept_count ?? 0),
      card_count: Number(s.card_count ?? 0),
      due_count: Number(s.due_count ?? 0),
      note_count: Number(s.note_count ?? 0),
    }))
  );
});

subjectsRouter.get('/:id', async (req, res) => {
  const subject = await queryOne(
    `SELECT * FROM subjects WHERE id = ? AND user_id = ?`,
    [req.params.id, req.userId]
  );
  if (!subject) {
    res.status(404).json({ error: 'Subject not found' });
    return;
  }
  const concepts = await queryAll(
    `SELECT * FROM concepts WHERE subject_id = ? AND user_id = ? ORDER BY created_at DESC`,
    [req.params.id, req.userId]
  );
  const flashcards = await queryAll(
    `SELECT * FROM flashcards WHERE subject_id = ? AND user_id = ? ORDER BY due_at ASC`,
    [req.params.id, req.userId]
  );
  const subjectNameLower = String((subject as { name?: string }).name ?? '').toLowerCase();
  const backlinks = await queryAll(
    `SELECT nl.id, nl.source_subject_id, s.name as source_subject_name, s.color as source_subject_color, nl.target_label, nl.created_at
     FROM note_links nl
     JOIN subjects s ON s.id = nl.source_subject_id
     WHERE nl.user_id = ?
       AND nl.source_subject_id != ?
       AND (nl.target_subject_id = ? OR LOWER(nl.target_label) = ?)
     ORDER BY nl.created_at DESC`,
    [req.userId, req.params.id, req.params.id, subjectNameLower]
  );
  let notes = await queryAll(
    `SELECT * FROM notes WHERE subject_id = ? AND user_id = ? ORDER BY page_type DESC, updated_at DESC`,
    [req.params.id, req.userId]
  );
  const legacyNotes = String((subject as { notes_markdown?: string }).notes_markdown ?? '').trim();
  if (notes.length === 0 && legacyNotes) {
    const noteId = crypto.randomUUID();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO notes (id, user_id, subject_id, parent_id, title, icon, cover_style, page_type, status, content_markdown, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'Notas Gerais', '📝', '', 'note', 'active', ?, ?, ?)`,
      [noteId, req.userId, req.params.id, legacyNotes, now, now]
    );
    notes = await queryAll(
      `SELECT * FROM notes WHERE subject_id = ? AND user_id = ? ORDER BY page_type DESC, updated_at DESC`,
      [req.params.id, req.userId]
    );
  }
  res.json({ ...subject, concepts, flashcards, backlinks, notes });
});

subjectsRouter.post('/', async (req, res) => {
  const {
    name,
    color = '#22d3ee',
    description = '',
    notes_markdown = '',
    transcript_markdown = '',
    icon = '📘',
    cover_style = 'gradient-ocean',
    kind = 'subject',
  } = req.body;
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
    `INSERT INTO subjects (id, user_id, name, slug, color, description, notes_markdown, transcript_markdown, icon, cover_style, kind, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.userId,
      name.trim(),
      slug,
      color,
      description,
      notes_markdown,
      transcript_markdown,
      icon,
      cover_style,
      kind,
      now,
      now,
    ]
  );

  // Create a starter empty note so the workspace opens cleanly
  await execute(
    `INSERT INTO notes (id, user_id, subject_id, parent_id, title, icon, cover_style, page_type, status, content_markdown, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 'Visão Geral', '📄', '', 'note', 'active', '', ?, ?)`,
    [crypto.randomUUID(), req.userId, id, now, now]
  );

  const created = await queryOne(`SELECT * FROM subjects WHERE id = ? AND user_id = ?`, [id, req.userId]);
  res.status(201).json(created);
});

subjectsRouter.patch('/:id', async (req, res) => {
  const existing = await queryOne<Record<string, unknown>>(
    `SELECT * FROM subjects WHERE id = ? AND user_id = ?`,
    [req.params.id, req.userId]
  );
  if (!existing) {
    res.status(404).json({ error: 'Subject not found' });
    return;
  }
  const { name, color, description, notes_markdown, transcript_markdown, icon, cover_style, kind } = req.body;
  const now = new Date().toISOString();

  const nextNotes = String(notes_markdown ?? existing.notes_markdown ?? '');

  await execute(
    `UPDATE subjects
     SET name = ?, color = ?, description = ?, notes_markdown = ?, transcript_markdown = ?, icon = ?, cover_style = ?, kind = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      name ?? existing.name,
      color ?? existing.color,
      description ?? existing.description,
      nextNotes,
      transcript_markdown ?? existing.transcript_markdown,
      icon ?? existing.icon ?? '📚',
      cover_style ?? existing.cover_style ?? 'aurora',
      kind === 'project' ? 'project' : (kind === 'subject' ? 'subject' : (existing.kind ?? 'subject')),
      now,
      req.params.id,
      req.userId,
    ]
  );

  // Sync Obsidian-style [[wikilinks]] into note_links
  if (notes_markdown !== undefined) {
    await execute(`DELETE FROM note_links WHERE source_subject_id = ? AND user_id = ?`, [
      req.params.id,
      req.userId,
    ]);
    const matches = [...nextNotes.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1].trim()).filter(Boolean);
    const uniqueLabels = Array.from(new Map(matches.map((l) => [l.toLowerCase(), l])).values());
    if (uniqueLabels.length > 0) {
      const allSubjects = await queryAll<{ id: string; name: string }>(
        `SELECT id, name FROM subjects WHERE user_id = ?`,
        [req.userId]
      );
      const allConcepts = await queryAll<{ title: string; subject_id: string }>(
        `SELECT title, subject_id FROM concepts WHERE user_id = ?`,
        [req.userId]
      );
      for (const label of uniqueLabels) {
        const lower = label.toLowerCase();
        const matchedSubject = allSubjects.find((s) => s.name.toLowerCase() === lower);
        const matchedConcept = matchedSubject
          ? null
          : allConcepts.find((c) => c.title.toLowerCase() === lower);
        const targetSubjectId = matchedSubject?.id ?? matchedConcept?.subject_id ?? null;
        await execute(
          `INSERT INTO note_links (id, user_id, source_subject_id, target_label, target_subject_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), req.userId, req.params.id, label, targetSubjectId, now]
        );
      }
    }
  }

  const updated = await queryOne(`SELECT * FROM subjects WHERE id = ? AND user_id = ?`, [
    req.params.id,
    req.userId,
  ]);
  res.json(updated);
});

subjectsRouter.delete('/:id', async (req, res) => {
  await execute(`DELETE FROM subjects WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
  res.json({ ok: true });
});

subjectsRouter.post('/:id/concepts', async (req, res) => {
  const subject = await queryOne(`SELECT id FROM subjects WHERE id = ? AND user_id = ?`, [
    req.params.id,
    req.userId,
  ]);
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
    `INSERT INTO concepts (id, user_id, subject_id, subtopic, title, summary, feynman_explanation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.userId, req.params.id, subtopic, title, summary, feynman_explanation, now]
  );

  const cardId = crypto.randomUUID();
  await execute(
    `INSERT INTO flashcards (id, user_id, subject_id, concept_id, subtopic, front, back, hint, interval_days, ease_factor, repetitions, lapses, step_index, due_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 2.5, 0, 0, 0, ?, ?)`,
    [
      cardId,
      req.userId,
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

  const concept = await queryOne(`SELECT * FROM concepts WHERE id = ? AND user_id = ?`, [id, req.userId]);
  res.status(201).json(concept);
});
