import crypto from 'node:crypto';
import { execute, queryAll } from '../db.js';

interface ConceptRow {
  id: string;
  subtopic: string;
  title: string;
  summary: string;
  feynman_explanation: string;
}

interface FlashcardRow {
  id: string;
  subtopic: string;
  front: string;
  back: string;
}

interface QuestionTemplate {
  subtopic: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export async function generateRecoveryQuiz(
  subjectId: string,
  subjectName: string,
  weakSubtopics: string[]
): Promise<{ quizId: string; questionCount: number }> {
  const quizId = crypto.randomUUID();
  const now = new Date().toISOString();
  const label = weakSubtopics.slice(0, 2).join(' & ') || 'Core Concepts';

  await execute(
    `INSERT INTO quizzes (id, subject_id, title, type, created_at) VALUES (?, ?, ?, 'recovery', ?)`,
    [quizId, subjectId, `Recovery Plan: ${subjectName} — ${label}`, now]
  );

  const questions = await synthesizeQuestionsFromSubject(subjectId, subjectName, weakSubtopics, 5);

  for (const q of questions) {
    await execute(
      `INSERT INTO quiz_questions (id, quiz_id, subtopic, prompt, options_json, correct_index, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        quizId,
        q.subtopic,
        q.prompt,
        JSON.stringify(q.options),
        q.correct_index,
        q.explanation,
      ]
    );
  }

  return { quizId, questionCount: questions.length };
}

export async function generateSessionAutoQuiz(
  subjectId: string,
  subjectName: string,
  subtopic: string,
  sessionId: string
): Promise<{ quizId: string; title: string; questions: QuestionTemplate[] }> {
  const quizId = crypto.randomUUID();
  const now = new Date().toISOString();
  const title = `Auto-Recall (5Q): ${subjectName} — ${subtopic}`;

  await execute(
    `INSERT INTO quizzes (id, subject_id, title, type, source_session_id, created_at) VALUES (?, ?, ?, 'auto_session', ?, ?)`,
    [quizId, subjectId, title, sessionId, now]
  );

  const targets = subtopic && subtopic !== 'General' ? [subtopic] : [];
  const questions = await synthesizeQuestionsFromSubject(subjectId, subjectName, targets, 5);

  for (const q of questions) {
    await execute(
      `INSERT INTO quiz_questions (id, quiz_id, subtopic, prompt, options_json, correct_index, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        quizId,
        q.subtopic,
        q.prompt,
        JSON.stringify(q.options),
        q.correct_index,
        q.explanation,
      ]
    );
  }

  return { quizId, title, questions };
}

async function synthesizeQuestionsFromSubject(
  subjectId: string,
  subjectName: string,
  preferredSubtopics: string[],
  count: number
): Promise<QuestionTemplate[]> {
  const concepts = await queryAll<ConceptRow>(
    `SELECT id, subtopic, title, summary, feynman_explanation FROM concepts WHERE subject_id = ?`,
    [subjectId]
  );

  const cards = await queryAll<FlashcardRow>(
    `SELECT id, subtopic, front, back FROM flashcards WHERE subject_id = ?`,
    [subjectId]
  );

  const existingQuestions = await queryAll<{
    subtopic: string;
    prompt: string;
    options_json: string;
    correct_index: number;
    explanation: string;
  }>(
    `SELECT qq.subtopic, qq.prompt, qq.options_json, qq.correct_index, qq.explanation
     FROM quiz_questions qq
     JOIN quizzes q ON q.id = qq.quiz_id
     WHERE q.subject_id = ?`,
    [subjectId]
  );

  const pool: QuestionTemplate[] = [];

  const sortedConcepts = [...concepts].sort((a, b) => {
    const aMatch = preferredSubtopics.includes(a.subtopic) ? 0 : 1;
    const bMatch = preferredSubtopics.includes(b.subtopic) ? 0 : 1;
    return aMatch - bMatch;
  });

  for (const concept of sortedConcepts) {
    const distractors = concepts
      .filter((c) => c.id !== concept.id)
      .map((c) => c.summary)
      .slice(0, 3);

    while (distractors.length < 3) {
      distractors.push(
        `An unrelated heuristic that applies only when ${concept.subtopic} is constant and invariant.`
      );
    }

    const options = [concept.summary, ...distractors];
    const shift = concept.title.length % 4;
    const rotated = rotateOptions(options, shift);

    pool.push({
      subtopic: concept.subtopic,
      prompt: `[Active Recall] Which statement accurately captures "${concept.title}"?`,
      options: rotated.options,
      correct_index: rotated.correctIndex,
      explanation: concept.feynman_explanation
        ? `${concept.summary} Feynman intuition: ${concept.feynman_explanation}`
        : concept.summary,
    });
  }

  const sortedCards = [...cards].sort((a, b) => {
    const aMatch = preferredSubtopics.includes(a.subtopic) ? 0 : 1;
    const bMatch = preferredSubtopics.includes(b.subtopic) ? 0 : 1;
    return aMatch - bMatch;
  });

  for (const card of sortedCards) {
    const distractors = cards
      .filter((c) => c.id !== card.id)
      .map((c) => c.back)
      .slice(0, 3);
    while (distractors.length < 3) {
      distractors.push(`None of the standard ${card.subtopic} conditions are satisfied.`);
    }
    const shift = card.front.length % 4;
    const rotated = rotateOptions([card.back, ...distractors], shift);

    pool.push({
      subtopic: card.subtopic,
      prompt: card.front,
      options: rotated.options,
      correct_index: rotated.correctIndex,
      explanation: `Correct answer: ${card.back}`,
    });
  }

  for (const eq of existingQuestions) {
    if (pool.length >= count * 2) break;
    if (preferredSubtopics.length === 0 || preferredSubtopics.includes(eq.subtopic)) {
      pool.push({
        subtopic: eq.subtopic,
        prompt: eq.prompt,
        options: JSON.parse(eq.options_json) as string[],
        correct_index: eq.correct_index,
        explanation: eq.explanation,
      });
    }
  }

  let fallbackIdx = 1;
  while (pool.length < count) {
    const topic = preferredSubtopics[0] || subjectName;
    pool.push({
      subtopic: topic,
      prompt: `[Feynman Check #${fallbackIdx}] When reviewing "${topic}" in ${subjectName}, what is the strongest indicator of true conceptual mastery?`,
      options: [
        'Re-reading highlighted notes multiple times until they feel familiar',
        'Explaining the mechanism in plain language and predicting edge cases without looking at notes',
        'Memorizing formulas without knowing when they break down',
        'Studying only one problem type in a single long block',
      ],
      correct_index: 1,
      explanation:
        'Active recall combined with the Feynman Technique exposes gaps and builds durable retrieval pathways.',
    });
    fallbackIdx++;
  }

  return pool.slice(0, count);
}

function rotateOptions(items: string[], shift: number): { options: string[]; correctIndex: number } {
  const len = items.length;
  const s = ((shift % len) + len) % len;
  const options = items.map((_, i) => items[(i - s + len) % len]);
  return { options, correctIndex: s };
}
