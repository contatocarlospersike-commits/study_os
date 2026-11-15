import { Router } from 'express';
import crypto from 'node:crypto';
import { execute, queryAll, queryOne } from '../db.js';

export const notesRouter = Router();

async function syncNoteLinks(
  userId: string,
  sourceSubjectId: string,
  sourceNoteId: string,
  contentMarkdown: string
) {
  await execute(`DELETE FROM note_links WHERE source_note_id = ? AND user_id = ?`, [
    sourceNoteId,
    userId,
  ]);

  const matches = [...contentMarkdown.matchAll(/\[\[([^\]]+)\]\]/g)]
    .map((m) => m[1].trim())
    .filter(Boolean);
  const uniqueLabels = Array.from(new Map(matches.map((l) => [l.toLowerCase(), l])).values());
  if (uniqueLabels.length === 0) return;

  const allSubjects = await queryAll<{ id: string; name: string }>(
    `SELECT id, name FROM subjects WHERE user_id = ?`,
    [userId]
  );
  const allNotes = await queryAll<{ id: string; title: string; subject_id: string }>(
    `SELECT id, title, subject_id FROM notes WHERE user_id = ?`,
    [userId]
  );

  const now = new Date().toISOString();
  for (const label of uniqueLabels) {
    const lower = label.toLowerCase();
    const matchedNote = allNotes.find((n) => n.title.toLowerCase() === lower);
    const matchedSubject = matchedNote
      ? null
      : allSubjects.find((s) => s.name.toLowerCase() === lower);

    const targetNoteId = matchedNote?.id ?? null;
    const targetSubjectId = matchedNote?.subject_id ?? matchedSubject?.id ?? null;

    await execute(
      `INSERT INTO note_links (id, user_id, source_subject_id, source_note_id, target_label, target_subject_id, target_note_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        userId,
        sourceSubjectId,
        sourceNoteId,
        label,
        targetSubjectId,
        targetNoteId,
        now,
      ]
    );
  }
}

notesRouter.get('/', async (req, res) => {
  const subjectId = req.query.subjectId ? String(req.query.subjectId) : null;
  const rows = subjectId
    ? await queryAll(
        `SELECT * FROM notes WHERE user_id = ? AND subject_id = ? ORDER BY page_type DESC, updated_at DESC`,
        [req.userId, subjectId]
      )
    : await queryAll(
        `SELECT n.*, s.name as subject_name, s.color as subject_color
         FROM notes n
         JOIN subjects s ON s.id = n.subject_id
         WHERE n.user_id = ?
         ORDER BY n.updated_at DESC`,
        [req.userId]
      );
  res.json(rows);
});

notesRouter.get('/:id', async (req, res) => {
  const note = await queryOne<Record<string, unknown>>(
    `SELECT * FROM notes WHERE id = ? AND user_id = ?`,
    [req.params.id, req.userId]
  );
  if (!note) {
    res.status(404).json({ error: 'Nota não encontrada.' });
    return;
  }

  const titleLower = String(note.title || '').toLowerCase();
  const backlinks = await queryAll(
    `SELECT nl.id, nl.source_note_id, nl.source_subject_id,
            COALESCE(sn.title, s.name) as source_title,
            s.name as source_subject_name, s.color as source_subject_color,
            nl.target_label, nl.created_at
     FROM note_links nl
     JOIN subjects s ON s.id = nl.source_subject_id
     LEFT JOIN notes sn ON sn.id = nl.source_note_id
     WHERE nl.user_id = ?
       AND (nl.source_note_id IS NULL OR nl.source_note_id != ?)
       AND (nl.target_note_id = ? OR LOWER(nl.target_label) = ?)
     ORDER BY nl.created_at DESC`,
    [req.userId, req.params.id, req.params.id, titleLower]
  );

  res.json({ ...note, backlinks });
});

notesRouter.post('/', async (req, res) => {
  const {
    subject_id,
    parent_id = null,
    title,
    icon = '📄',
    cover_style = '',
    page_type = 'note',
    status = 'active',
    content_markdown = '',
  } = req.body;

  if (!subject_id || !title || typeof title !== 'string') {
    res.status(400).json({ error: 'subject_id e title são obrigatórios.' });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO notes (id, user_id, subject_id, parent_id, title, icon, cover_style, page_type, status, content_markdown, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.userId,
      subject_id,
      parent_id,
      title.trim(),
      icon,
      cover_style,
      page_type,
      status,
      content_markdown,
      now,
      now,
    ]
  );

  if (content_markdown) {
    await syncNoteLinks(req.userId, subject_id, id, content_markdown);
  }

  const created = await queryOne(`SELECT * FROM notes WHERE id = ? AND user_id = ?`, [id, req.userId]);
  res.status(201).json(created);
});

notesRouter.patch('/:id', async (req, res) => {
  const existing = await queryOne<Record<string, unknown>>(
    `SELECT * FROM notes WHERE id = ? AND user_id = ?`,
    [req.params.id, req.userId]
  );
  if (!existing) {
    res.status(404).json({ error: 'Nota não encontrada.' });
    return;
  }

  const { title, icon, cover_style, page_type, status, content_markdown, parent_id } = req.body;
  const now = new Date().toISOString();
  const nextContent = String(content_markdown ?? existing.content_markdown ?? '');

  await execute(
    `UPDATE notes
     SET title = ?, icon = ?, cover_style = ?, page_type = ?, status = ?, content_markdown = ?, parent_id = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
    [
      title !== undefined ? String(title).trim() : existing.title,
      icon ?? existing.icon,
      cover_style ?? existing.cover_style,
      page_type ?? existing.page_type,
      status ?? existing.status,
      nextContent,
      parent_id !== undefined ? parent_id : existing.parent_id,
      now,
      req.params.id,
      req.userId,
    ]
  );

  if (content_markdown !== undefined) {
    await syncNoteLinks(
      req.userId,
      String(existing.subject_id),
      req.params.id,
      nextContent
    );
  }

  const updated = await queryOne(`SELECT * FROM notes WHERE id = ? AND user_id = ?`, [
    req.params.id,
    req.userId,
  ]);
  res.json(updated);
});

notesRouter.delete('/:id', async (req, res) => {
  await execute(`UPDATE notes SET parent_id = NULL WHERE parent_id = ? AND user_id = ?`, [
    req.params.id,
    req.userId,
  ]);
  await execute(`DELETE FROM note_links WHERE source_note_id = ? AND user_id = ?`, [
    req.params.id,
    req.userId,
  ]);
  await execute(`DELETE FROM notes WHERE id = ? AND user_id = ?`, [req.params.id, req.userId]);
  res.json({ ok: true });
});
