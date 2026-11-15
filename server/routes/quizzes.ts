import { Router } from 'express';
import crypto from 'node:crypto';
import { execute, queryAll, queryOne } from '../db.js';
import { generateRecoveryQuiz } from '../engine/recoveryPlan.js';
import { dispatchNotification, getAutomationSettings } from '../services/dispatcher.js';

export const quizzesRouter = Router();

quizzesRouter.get('/', async (_req, res) => {
  const quizzes = await queryAll(
    `SELECT q.*, s.name as subject_name, s.color as subject_color,
      (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) as question_count,
      (SELECT score_pct FROM quiz_attempts qa WHERE qa.quiz_id = q.id ORDER BY qa.completed_at DESC LIMIT 1) as last_score_pct
     FROM quizzes q
     JOIN subjects s ON s.id = q.subject_id
     ORDER BY q.created_at DESC`
  );
  res.json(
    quizzes.map((q) => ({
      ...q,
      question_count: Number(q.question_count ?? 0),
      last_score_pct: q.last_score_pct !== null && q.last_score_pct !== undefined ? Number(q.last_score_pct) : null,
    }))
  );
});

quizzesRouter.get('/recovery-plans', async (_req, res) => {
  const plans = await queryAll<{ weak_subtopics_json: string } & Record<string, unknown>>(
    `SELECT rp.*, s.name as subject_name, s.color as subject_color, q.title as recovery_quiz_title
     FROM recovery_plans rp
     JOIN subjects s ON s.id = rp.subject_id
     LEFT JOIN quizzes q ON q.id = rp.recovery_quiz_id
     ORDER BY rp.created_at DESC`
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
     FROM quizzes q JOIN subjects s ON s.id = q.subject_id WHERE q.id = ?`,
    [req.params.id]
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
    `SELECT q.*, s.name as subject_name FROM quizzes q JOIN subjects s ON s.id = q.subject_id WHERE q.id = ?`,
    [req.params.id]
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

  const settings = await getAutomationSettings();
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
    const generated = await generateRecoveryQuiz(quiz.subject_id, quiz.subject_name, weakSubtopics);
    const planId = crypto.randomUUID();
    const recommendation = `Scored ${scorePct}% (below ${threshold}% target). Flagged weak sub-topic(s): ${weakSubtopics.join(', ')}. Complete the generated ${generated.questionCount}-question Remediation & Recovery Quiz in your next study block and review Feynman explanations.`;

    await execute(
      `INSERT INTO quiz_attempts (id, quiz_id, subject_id, score_pct, correct_count, total_count, weak_subtopics_json, recovery_quiz_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attemptId,
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
      `INSERT INTO recovery_plans (id, subject_id, attempt_id, weak_subtopics_json, recovery_quiz_id, status, recommendation, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [
        planId,
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
      `INSERT INTO quiz_attempts (id, quiz_id, subject_id, score_pct, correct_count, total_count, weak_subtopics_json, recovery_quiz_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        attemptId,
        quiz.id,
        quiz.subject_id,
        scorePct,
        correctCount,
        totalCount,
        JSON.stringify(weakSubtopics),
        now,
      ]
    );

    await execute(`UPDATE recovery_plans SET status = 'completed' WHERE recovery_quiz_id = ?`, [quiz.id]);
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
