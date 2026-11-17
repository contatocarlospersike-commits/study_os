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
import { runFeynmanWorkflow } from '../services/feynmanPipeline.js';
import {
  checkGeminiFileStatus,
  generateAnimatedLessonInitial,
  generateAnimatedLessonModule,
  generateNeuralSpeechWav,
  startGeminiResumableUpload,
  type AnimatedScene,
  type LessonModule,
} from '../services/animatedLessonAi.js';

export const cognitiveRouter = Router();

// --- Obsidian Graph & Backlinks ---
cognitiveRouter.get('/graph', async (req, res) => {
  const subjects = await queryAll<{ id: string; name: string; color: string; icon?: string; kind?: string }>(
    `SELECT id, name, color, icon, kind FROM subjects WHERE user_id = ?`,
    [req.userId]
  );
  const notes = await queryAll<{ id: string; title: string; subject_id: string; icon: string }>(
    `SELECT id, title, subject_id, icon FROM notes WHERE user_id = ?`,
    [req.userId]
  );
  const links = await queryAll<{
    id: string;
    source_subject_id: string;
    source_note_id: string | null;
    target_label: string;
    target_subject_id: string | null;
    target_note_id: string | null;
  }>(
    `SELECT id, source_subject_id, source_note_id, target_label, target_subject_id, target_note_id
     FROM note_links WHERE user_id = ?`,
    [req.userId]
  );

  res.json({ subjects, notes, links });
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

// --- Multimodal Feynman Pipeline (PDF Slides + Transcript -> Structured Lesson) ---
cognitiveRouter.get('/feynman-lessons', async (req, res) => {
  const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : null;
  const rows = subjectId
    ? await queryAll<Record<string, unknown>>(
        `SELECT fl.*, s.name as subject_name FROM feynman_lessons fl LEFT JOIN subjects s ON s.id = fl.subject_id WHERE fl.user_id = ? AND fl.subject_id = ? ORDER BY fl.created_at DESC LIMIT 30`,
        [req.userId, subjectId]
      )
    : await queryAll<Record<string, unknown>>(
        `SELECT fl.*, s.name as subject_name FROM feynman_lessons fl LEFT JOIN subjects s ON s.id = fl.subject_id WHERE fl.user_id = ? ORDER BY fl.created_at DESC LIMIT 30`,
        [req.userId]
      );

  res.json(
    rows.map((r) => ({
      ...r,
      armadilhas_comuns: JSON.parse(String(r.armadilhas_comuns_json || '[]')),
      perguntas_active_recall: JSON.parse(String(r.perguntas_active_recall_json || '[]')),
    }))
  );
});

cognitiveRouter.post('/feynman-lessons/generate', async (req, res) => {
  const {
    subject_id = null,
    pdf_base64,
    pdf_filename = '',
    transcript_text = '',
    topic_hint = '',
    model,
    save_to_workspace = true,
  } = req.body as {
    subject_id?: string | null;
    pdf_base64?: string;
    pdf_filename?: string;
    transcript_text?: string;
    topic_hint?: string;
    model?: string;
    save_to_workspace?: boolean;
  };

  if (!pdf_base64 && !transcript_text?.trim() && !topic_hint?.trim()) {
    res.status(400).json({ error: 'Envie um PDF de slides, uma transcrição ou o tema da aula.' });
    return;
  }

  const saved = await runFeynmanWorkflow({
    userId: req.userId,
    subjectId: subject_id,
    pdfBase64: pdf_base64,
    pdfFilename: pdf_filename,
    transcriptText: transcript_text,
    topicHint: topic_hint,
    model,
    saveToWorkspace: Boolean(save_to_workspace),
  });

  res.status(201).json(saved);
});

cognitiveRouter.delete('/feynman-lessons/:id', async (req, res) => {
  await execute(`DELETE FROM feynman_lessons WHERE id = ? AND user_id = ?`, [
    req.params.id,
    req.userId,
  ]);
  res.json({ ok: true });
});

// --- Direct Media Upload (MP4/Audio up to 2GB via Google Gemini Files API) ---
cognitiveRouter.post('/media/start-upload', async (req, res) => {
  const { filename, mime_type = 'video/mp4', size_bytes = 0 } = req.body as {
    filename?: string;
    mime_type?: string;
    size_bytes?: number;
  };
  if (!size_bytes || size_bytes <= 0) {
    res.status(400).json({ error: 'size_bytes inválido.' });
    return;
  }
  const result = await startGeminiResumableUpload({
    filename: filename || 'aula.mp4',
    mimeType: mime_type,
    sizeBytes: Number(size_bytes),
  });
  res.json(result);
});

cognitiveRouter.get('/media/status', async (req, res) => {
  const name = typeof req.query.name === 'string' ? req.query.name : '';
  if (!name) {
    res.status(400).json({ error: 'name é obrigatório.' });
    return;
  }
  const status = await checkGeminiFileStatus(name);
  res.json(status);
});

// --- Animated Interactive Video Lessons (30s Demo to 60min Deep Masterclass) ---
cognitiveRouter.get('/animated-lessons', async (req, res) => {
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT al.*, s.name as subject_name
     FROM animated_lessons al
     LEFT JOIN subjects s ON s.id = al.subject_id
     WHERE al.user_id = ?
     ORDER BY al.updated_at DESC LIMIT 25`,
    [req.userId]
  );
  res.json(
    rows.map((r) => ({
      ...r,
      modules: JSON.parse(String(r.modules_json || '[]')),
      scenes: JSON.parse(String(r.scenes_json || '[]')),
    }))
  );
});

cognitiveRouter.post('/animated-lessons/generate', async (req, res) => {
  const {
    subject_id = null,
    topic_hint = '',
    transcript_text = '',
    pdf_base64,
    file_uri,
    file_mime_type,
    target_minutes = 5,
    technique = 'Feynman + Conexões Visuais',
  } = req.body as {
    subject_id?: string | null;
    topic_hint?: string;
    transcript_text?: string;
    pdf_base64?: string;
    file_uri?: string;
    file_mime_type?: string;
    target_minutes?: number;
    technique?: string;
  };

  let subjectName = 'Estudo Livre';
  let extraContext = transcript_text || '';
  if (subject_id) {
    const sub = await queryOne<{ name: string }>(`SELECT name FROM subjects WHERE id = ? AND user_id = ?`, [
      subject_id,
      req.userId,
    ]);
    if (sub) subjectName = sub.name;
    const chunks = await queryAll<{ content: string }>(
      `SELECT content FROM document_chunks WHERE subject_id = ? AND user_id = ? LIMIT 8`,
      [subject_id, req.userId]
    );
    if (chunks.length > 0) {
      extraContext = `${extraContext}\n\n${chunks.map((c) => c.content.slice(0, 500)).join('\n')}`.trim();
    }
  }

  const generated = await generateAnimatedLessonInitial({
    subjectName,
    topicHint: topic_hint || subjectName,
    transcriptText: extraContext,
    pdfBase64: pdf_base64,
    fileUri: file_uri,
    fileMimeType: file_mime_type,
    targetMinutes: Number(target_minutes) || 5,
    technique,
  });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO animated_lessons (id, user_id, subject_id, title, target_minutes, technique, source_summary, modules_json, scenes_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.userId,
      subject_id || null,
      generated.title,
      Number(target_minutes) || 5,
      technique,
      generated.source_summary,
      JSON.stringify(generated.modules),
      JSON.stringify(generated.scenes),
      now,
      now,
    ]
  );

  res.status(201).json({
    id,
    subject_id,
    subject_name: subjectName,
    title: generated.title,
    target_minutes: Number(target_minutes) || 5,
    technique,
    source_summary: generated.source_summary,
    modules: generated.modules,
    scenes: generated.scenes,
    created_at: now,
    updated_at: now,
  });
});

cognitiveRouter.post('/animated-lessons/:id/expand-module', async (req, res) => {
  const { module_index, file_uri, file_mime_type } = req.body as {
    module_index: number;
    file_uri?: string;
    file_mime_type?: string;
  };
  const lesson = await queryOne<Record<string, unknown>>(
    `SELECT * FROM animated_lessons WHERE id = ? AND user_id = ?`,
    [req.params.id, req.userId]
  );
  if (!lesson) {
    res.status(404).json({ error: 'Aula animada não encontrada.' });
    return;
  }

  const modules = JSON.parse(String(lesson.modules_json || '[]')) as LessonModule[];
  const existingScenes = JSON.parse(String(lesson.scenes_json || '[]')) as AnimatedScene[];
  const targetMod = modules.find((m) => m.index === module_index);
  if (!targetMod) {
    res.status(404).json({ error: 'Módulo não encontrado.' });
    return;
  }

  if (targetMod.expanded) {
    res.json({ modules, scenes: existingScenes });
    return;
  }

  let contextText = String(lesson.source_summary || '');
  if (lesson.subject_id) {
    const chunks = await queryAll<{ content: string }>(
      `SELECT content FROM document_chunks WHERE subject_id = ? AND user_id = ? LIMIT 8`,
      [String(lesson.subject_id), req.userId]
    );
    if (chunks.length > 0) {
      contextText += '\n\n' + chunks.map((c) => c.content.slice(0, 500)).join('\n');
    }
  }

  const newScenes = await generateAnimatedLessonModule({
    lessonTitle: String(lesson.title),
    moduleIndex: module_index,
    moduleTitle: targetMod.title,
    moduleGoal: targetMod.goal,
    moduleMinutes: targetMod.minutes,
    technique: String(lesson.technique),
    contextText,
    fileUri: file_uri,
    fileMimeType: file_mime_type,
  });

  const nextModules = modules.map((m) => (m.index === module_index ? { ...m, expanded: true } : m));
  const nextScenes = [...existingScenes, ...newScenes];
  const now = new Date().toISOString();

  await execute(
    `UPDATE animated_lessons SET modules_json = ?, scenes_json = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    [JSON.stringify(nextModules), JSON.stringify(nextScenes), now, req.params.id, req.userId]
  );

  res.json({ modules: nextModules, scenes: nextScenes });
});

cognitiveRouter.post('/animated-lessons/:id/save-workspace', async (req, res) => {
  const { subject_id } = req.body as { subject_id?: string };
  const lesson = await queryOne<Record<string, unknown>>(
    `SELECT * FROM animated_lessons WHERE id = ? AND user_id = ?`,
    [req.params.id, req.userId]
  );
  if (!lesson) {
    res.status(404).json({ error: 'Aula não encontrada.' });
    return;
  }
  const targetSubjectId = subject_id || (lesson.subject_id ? String(lesson.subject_id) : null);
  if (!targetSubjectId) {
    res.status(400).json({ error: 'Selecione uma matéria/projeto para salvar no Workspace.' });
    return;
  }

  const scenes = JSON.parse(String(lesson.scenes_json || '[]')) as AnimatedScene[];
  const md = [
    `> Aula Animada (${lesson.target_minutes} min · ${lesson.technique})`,
    String(lesson.source_summary || ''),
    ...scenes.map(
      (sc, i) =>
        `## ${i + 1}. ${sc.scene_title}\n${sc.narration}\n\n${sc.visual_nodes
          .map((n) => `- **${n.label}:** ${n.detail}`)
          .join('\n')}\n\n> **Ponto-chave:** ${sc.key_takeaway}`
    ),
  ]
    .filter(Boolean)
    .join('\n\n');

  const noteId = crypto.randomUUID();
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO notes (id, user_id, subject_id, parent_id, title, icon, cover_style, page_type, status, content_markdown, created_at, updated_at)
     VALUES (?, ?, ?, NULL, ?, '🎬', '', 'note', 'active', ?, ?, ?)`,
    [noteId, req.userId, targetSubjectId, `Aula: ${String(lesson.title)}`, md, now, now]
  );

  res.status(201).json({ ok: true, noteId });
});

cognitiveRouter.delete('/animated-lessons/:id', async (req, res) => {
  await execute(`DELETE FROM animated_lessons WHERE id = ? AND user_id = ?`, [
    req.params.id,
    req.userId,
  ]);
  res.json({ ok: true });
});

cognitiveRouter.post('/tts', async (req, res) => {
  const { text, voice = 'Puck' } = req.body as { text?: string; voice?: string };
  if (!text || !text.trim()) {
    res.status(400).json({ error: 'text é obrigatório.' });
    return;
  }
  const { wavBase64 } = await generateNeuralSpeechWav({ text: text.trim(), voiceName: voice });
  res.json({ audio_base64: wavBase64, mime_type: 'audio/wav' });
});
