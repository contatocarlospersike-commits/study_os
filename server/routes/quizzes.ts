import { Router } from 'express';
import crypto from 'node:crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { execute, queryAll, queryOne } from '../db.js';
import { generateRecoveryQuiz } from '../engine/recoveryPlan.js';
import { dispatchNotification, getAutomationSettings } from '../services/dispatcher.js';

export const quizzesRouter = Router();

quizzesRouter.post('/generate', async (req, res) => {
  const { subject_id, topic = '' } = req.body as { subject_id?: string; topic?: string };
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

  const notes = await queryAll<{ title: string; content_markdown: string }>(
    `SELECT title, content_markdown FROM notes WHERE subject_id = ? AND user_id = ? AND page_type != 'folder' ORDER BY updated_at DESC LIMIT 8`,
    [subject_id, req.userId]
  );
  const chunks = await queryAll<{ content: string }>(
    `SELECT content FROM document_chunks WHERE subject_id = ? AND user_id = ? LIMIT 8`,
    [subject_id, req.userId]
  );

  const contextText = [
    `Matéria/Projeto: ${subject.name} — ${subject.description}`,
    topic ? `Foco pedido pelo aluno: ${topic}` : '',
    ...notes.map((n) => `Nota "${n.title}": ${n.content_markdown.slice(0, 700)}`),
    ...chunks.map((c) => `Material: ${c.content.slice(0, 500)}`),
  ]
    .filter(Boolean)
    .join('\n\n');

  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY não configurada.' });
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash',
    contents: `Crie um quiz de Active Recall em português (PT-BR) com exatamente 5 questões de múltipla escolha (4 opções cada) baseado no contexto abaixo. Se o contexto for curto, use conhecimento acadêmico sólido do tema.\n\n${contextText}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                subtopic: { type: Type.STRING },
                prompt: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING },
              },
              required: ['subtopic', 'prompt', 'options', 'correctIndex', 'explanation'],
            },
          },
        },
        required: ['title', 'questions'],
      },
    },
  });

  const parsed = JSON.parse(response.text || '{}') as {
    title?: string;
    questions?: Array<{
      subtopic: string;
      prompt: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }>;
  };

  const quizId = crypto.randomUUID();
  const now = new Date().toISOString();
  const quizTitle = parsed.title || `Active Recall: ${topic || subject.name}`;
  await execute(
    `INSERT INTO quizzes (id, user_id, subject_id, title, type, created_at) VALUES (?, ?, ?, ?, 'standard', ?)`,
    [quizId, req.userId, subject_id, quizTitle, now]
  );

  for (const q of (parsed.questions || []).slice(0, 5)) {
    const opts = Array.isArray(q.options) && q.options.length >= 2 ? q.options.slice(0, 4) : ['Opção A', 'Opção B', 'Opção C', 'Opção D'];
    const correctIdx = Math.max(0, Math.min(opts.length - 1, Number(q.correctIndex) || 0));
    await execute(
      `INSERT INTO quiz_questions (id, quiz_id, subtopic, prompt, options_json, correct_index, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), quizId, q.subtopic || subject.name, q.prompt, JSON.stringify(opts), correctIdx, q.explanation || '']
    );
  }

  const created = await queryOne(
    `SELECT q.*, s.name as subject_name, s.color as subject_color,
      (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) as question_count,
      NULL as last_score_pct
     FROM quizzes q JOIN subjects s ON s.id = q.subject_id WHERE q.id = ?`,
    [quizId]
  );
  res.status(201).json(created);
});

quizzesRouter.get('/', async (req, res) => {
  const quizzes = await queryAll(
    `SELECT q.*, s.name as subject_name, s.color as subject_color,
      (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) as question_count,
      (SELECT score_pct FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.user_id = q.user_id ORDER BY qa.completed_at DESC LIMIT 1) as last_score_pct
     FROM quizzes q
     JOIN subjects s ON s.id = q.subject_id
     WHERE q.user_id = ?
     ORDER BY q.created_at DESC`,
    [req.userId]
  );
  res.json(
    quizzes.map((q) => ({
      ...q,
      question_count: Number(q.question_count ?? 0),
      last_score_pct:
        q.last_score_pct !== null && q.last_score_pct !== undefined
          ? Number(q.last_score_pct)
          : null,
    }))
  );
});

quizzesRouter.get('/recovery-plans', async (req, res) => {
  const plans = await queryAll<{ weak_subtopics_json: string } & Record<string, unknown>>(
    `SELECT rp.*, s.name as subject_name, s.color as subject_color, q.title as recovery_quiz_title
     FROM recovery_plans rp
     JOIN subjects s ON s.id = rp.subject_id
     LEFT JOIN quizzes q ON q.id = rp.recovery_quiz_id
     WHERE rp.user_id = ?
     ORDER BY rp.created_at DESC`,
    [req.userId]
  );
  res.json(
    plans.map((p) => ({
      ...p,
      weak_subtopics: JSON.parse(p.weak_subtopics_json),
    }))
  );
});

quizzesRouter.get('/:id', async (req, res) => {
  const quiz = await queryOne(
    `SELECT q.*, s.name as subject_name, s.color as subject_color
     FROM quizzes q JOIN subjects s ON s.id = q.subject_id WHERE q.id = ? AND q.user_id = ?`,
    [req.params.id, req.userId]
  );
  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found' });
    return;
  }
  const questions = await queryAll<{
    id: string;
    quiz_id: string;
    subtopic: string;
    prompt: string;
    options_json: string;
    correct_index: number;
    explanation: string;
  }>(`SELECT * FROM quiz_questions WHERE quiz_id = ?`, [req.params.id]);

  res.json({
    ...quiz,
    questions: questions.map((q) => ({
      id: q.id,
      quiz_id: q.quiz_id,
      subtopic: q.subtopic,
      prompt: q.prompt,
      options: JSON.parse(q.options_json) as string[],
      correct_index: q.correct_index,
      explanation: q.explanation,
    })),
  });
});

quizzesRouter.post('/:id/submit', async (req, res) => {
  const answers = req.body.answers as Record<string, number> | undefined;
  if (!answers || typeof answers !== 'object') {
    res.status(400).json({ error: 'answers map is required' });
    return;
  }

  const quiz = await queryOne<{ id: string; subject_id: string; subject_name: string; title: string }>(
    `SELECT q.*, s.name as subject_name FROM quizzes q JOIN subjects s ON s.id = q.subject_id WHERE q.id = ? AND q.user_id = ?`,
    [req.params.id, req.userId]
  );

  if (!quiz) {
    res.status(404).json({ error: 'Quiz not found' });
    return;
  }

  const questions = await queryAll<{
    id: string;
    subtopic: string;
    correct_index: number;
    explanation: string;
  }>(`SELECT * FROM quiz_questions WHERE quiz_id = ?`, [quiz.id]);

  let correctCount = 0;
  const missedSubtopicCounts = new Map<string, number>();
  const breakdown: Array<{
    questionId: string;
    subtopic: string;
    selectedIndex: number | null;
    correctIndex: number;
    isCorrect: boolean;
    explanation: string;
  }> = [];

  for (const q of questions) {
    const selected = typeof answers[q.id] === 'number' ? answers[q.id] : null;
    const isCorrect = selected === q.correct_index;
    if (isCorrect) {
      correctCount++;
    } else {
      missedSubtopicCounts.set(q.subtopic, (missedSubtopicCounts.get(q.subtopic) || 0) + 1);
    }
    breakdown.push({
      questionId: q.id,
      subtopic: q.subtopic,
      selectedIndex: selected,
      correctIndex: q.correct_index,
      isCorrect,
      explanation: q.explanation,
    });
  }

  const totalCount = questions.length || 1;
  const scorePct = Math.round((correctCount / totalCount) * 100);
  const weakSubtopics = Array.from(missedSubtopicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([sub]) => sub);

  const settings = await getAutomationSettings(req.userId);
  const threshold = settings.recovery_threshold_pct ?? 70;
  const attemptId = crypto.randomUUID();
  const now = new Date().toISOString();

  let recoveryPlan: {
    id: string;
    recoveryQuizId: string;
    weakSubtopics: string[];
    recommendation: string;
  } | null = null;

  if (scorePct < threshold && weakSubtopics.length > 0) {
    const generated = await generateRecoveryQuiz(
      req.userId,
      quiz.subject_id,
      quiz.subject_name,
      weakSubtopics
    );
    const planId = crypto.randomUUID();
    const recommendation = `Scored ${scorePct}% (below ${threshold}% target). Flagged weak sub-topic(s): ${weakSubtopics.join(', ')}. Complete the generated ${generated.questionCount}-question Remediation & Recovery Quiz in your next study block and review Feynman explanations.`;

    await execute(
      `INSERT INTO quiz_attempts (id, user_id, quiz_id, subject_id, score_pct, correct_count, total_count, weak_subtopics_json, recovery_quiz_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attemptId,
        req.userId,
        quiz.id,
        quiz.subject_id,
        scorePct,
        correctCount,
        totalCount,
        JSON.stringify(weakSubtopics),
        generated.quizId,
        now,
      ]
    );

    await execute(
      `INSERT INTO recovery_plans (id, user_id, subject_id, attempt_id, weak_subtopics_json, recovery_quiz_id, status, recommendation, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        planId,
        req.userId,
        quiz.subject_id,
        attemptId,
        JSON.stringify(weakSubtopics),
        generated.quizId,
        recommendation,
        now,
      ]
    );

    recoveryPlan = {
      id: planId,
      recoveryQuizId: generated.quizId,
      weakSubtopics,
      recommendation,
    };

    await dispatchNotification({
      userId: req.userId,
      eventType: 'recovery_plan_generated',
      title: `Recovery Plan Ready: ${quiz.subject_name} (${weakSubtopics[0]})`,
      message: recommendation,
      payload: {
        subjectId: quiz.subject_id,
        subjectName: quiz.subject_name,
        scorePct,
        weakSubtopics,
        recoveryQuizId: generated.quizId,
      },
    });
  } else {
    await execute(
      `INSERT INTO quiz_attempts (id, user_id, quiz_id, subject_id, score_pct, correct_count, total_count, weak_subtopics_json, recovery_quiz_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        attemptId,
        req.userId,
        quiz.id,
        quiz.subject_id,
        scorePct,
        correctCount,
        totalCount,
        JSON.stringify(weakSubtopics),
        now,
      ]
    );

    await execute(
      `UPDATE recovery_plans SET status = 'completed' WHERE recovery_quiz_id = ? AND user_id = ?`,
      [quiz.id, req.userId]
    );
  }

  res.json({
    attemptId,
    quizId: quiz.id,
    scorePct,
    correctCount,
    totalCount,
    threshold,
    weakSubtopics,
    recoveryPlan,
    breakdown,
  });
});
