import { Pool } from 'pg';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const databaseUrl = process.env.DATABASE_URL || '';
const isPostgres = Boolean(databaseUrl);

let pgPool: Pool | null = null;
let sqliteDb: DatabaseSync | null = null;

if (isPostgres) {
  pgPool = new Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    max: 5,
  });
} else {
  const dbPath = path.resolve(process.env.STUDY_OS_DB_PATH || './data/study-os.sqlite');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  sqliteDb = new DatabaseSync(dbPath);
}

function toPgSql(sql: string): string {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

export async function queryAll<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  if (pgPool) {
    const res = await pgPool.query(toPgSql(sql), params);
    return res.rows as T[];
  }
  return sqliteDb!.prepare(sql).all(...(params as SQLInputValue[])) as unknown as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | undefined> {
  if (pgPool) {
    const res = await pgPool.query(toPgSql(sql), params);
    return res.rows[0] as T | undefined;
  }
  return sqliteDb!.prepare(sql).get(...(params as SQLInputValue[])) as unknown as T | undefined;
}

export async function execute(sql: string, params: unknown[] = []): Promise<void> {
  if (pgPool) {
    await pgPool.query(toPgSql(sql), params);
    return;
  }
  sqliteDb!.prepare(sql).run(...(params as SQLInputValue[]));
}

async function execDDL(ddl: string): Promise<void> {
  if (pgPool) {
    await pgPool.query(ddl);
    return;
  }
  sqliteDb!.exec(ddl);
}

let initPromise: Promise<void> | null = null;

export function ensureDatabaseReady(): Promise<void> {
  if (!initPromise) {
    initPromise = initDatabase().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export const isPostgresDb = isPostgres;

export async function initDatabase(): Promise<void> {
  if (!isPostgres && sqliteDb) {
    sqliteDb.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  }

  if (isPostgres) {
    try {
      await execDDL('CREATE EXTENSION IF NOT EXISTS vector;');
    } catch (err) {
      console.warn('[Study OS DB] Could not auto-enable pgvector extension:', (err as Error).message);
    }
  }

  const floatType = isPostgres ? 'DOUBLE PRECISION' : 'REAL';
  const vectorCol = isPostgres ? 'embedding vector(768),' : 'embedding_json TEXT,';
  const tsvCol = isPostgres
    ? `tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED,`
    : '';

  await execDDL(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#22d3ee',
      description TEXT NOT NULL DEFAULT '',
      notes_markdown TEXT NOT NULL DEFAULT '',
      transcript_markdown TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (user_id, slug)
    );

    CREATE TABLE IF NOT EXISTS concepts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      subtopic TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      feynman_explanation TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS flashcards (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      concept_id TEXT REFERENCES concepts(id) ON DELETE SET NULL,
      subtopic TEXT NOT NULL,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      hint TEXT NOT NULL DEFAULT '',
      interval_days INTEGER NOT NULL DEFAULT 1,
      ease_factor ${floatType} NOT NULL DEFAULT 2.5,
      repetitions INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      step_index INTEGER NOT NULL DEFAULT 0,
      due_at TEXT NOT NULL,
      last_reviewed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'standard',
      source_session_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      subtopic TEXT NOT NULL,
      prompt TEXT NOT NULL,
      options_json TEXT NOT NULL,
      correct_index INTEGER NOT NULL,
      explanation TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      score_pct ${floatType} NOT NULL,
      correct_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      weak_subtopics_json TEXT NOT NULL DEFAULT '[]',
      recovery_quiz_id TEXT,
      completed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recovery_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      attempt_id TEXT NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      weak_subtopics_json TEXT NOT NULL,
      recovery_quiz_id TEXT REFERENCES quizzes(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      recommendation TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      subtopic TEXT NOT NULL DEFAULT 'General',
      mode TEXT NOT NULL DEFAULT 'deep_work',
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_sec INTEGER NOT NULL DEFAULT 0,
      notes_snapshot TEXT NOT NULL DEFAULT '',
      auto_quiz_id TEXT
    );

    CREATE TABLE IF NOT EXISTS automation_settings (
      user_id TEXT PRIMARY KEY,
      n8n_webhook_url TEXT NOT NULL DEFAULT '',
      webhook_secret TEXT NOT NULL DEFAULT 'study-os-dev-secret',
      whatsapp_enabled INTEGER NOT NULL DEFAULT 0,
      whatsapp_phone_number_id TEXT NOT NULL DEFAULT '',
      whatsapp_recipient_phone TEXT NOT NULL DEFAULT '',
      push_enabled INTEGER NOT NULL DEFAULT 1,
      auto_quiz_on_session_end INTEGER NOT NULL DEFAULT 1,
      recovery_threshold_pct INTEGER NOT NULL DEFAULT 70,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      response_code INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'pdf',
      page_count INTEGER NOT NULL DEFAULT 1,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
      page_number INTEGER NOT NULL DEFAULT 1,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      ${vectorCol}
      ${tsvCol}
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      citations_json TEXT NOT NULL DEFAULT '[]',
      mermaid_diagram TEXT NOT NULL DEFAULT '',
      grounding_status TEXT NOT NULL DEFAULT 'grounded',
      verified_by_critic INTEGER NOT NULL DEFAULT 0,
      follow_up_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'pearson',
      external_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'to_read',
      current_page INTEGER NOT NULL DEFAULT 0,
      total_pages INTEGER NOT NULL DEFAULT 100,
      summary_markdown TEXT NOT NULL DEFAULT '',
      insights_markdown TEXT NOT NULL DEFAULT '',
      selective_plan_markdown TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_links (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      source_subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      target_label TEXT NOT NULL,
      target_subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS learning_profile (
      user_id TEXT PRIMARY KEY,
      preferred_block_min INTEGER NOT NULL DEFAULT 25,
      visual_preference INTEGER NOT NULL DEFAULT 1,
      frequent_questions INTEGER NOT NULL DEFAULT 1,
      english_level TEXT NOT NULL DEFAULT 'intermediate',
      routine_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_checklist_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      subject_name TEXT NOT NULL DEFAULT 'Geral',
      action_type TEXT NOT NULL DEFAULT 'study',
      duration_min INTEGER NOT NULL DEFAULT 25,
      reason TEXT NOT NULL DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      scheduled_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_checkins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT REFERENCES study_sessions(id) ON DELETE SET NULL,
      block_mode TEXT NOT NULL DEFAULT 'deep_work',
      duration_min INTEGER NOT NULL DEFAULT 25,
      energy_level INTEGER NOT NULL DEFAULT 3,
      focus_level INTEGER NOT NULL DEFAULT 3,
      created_at TEXT NOT NULL
    );
  `);

  // Safe migration for existing databases lacking routine_json
  try {
    await execDDL(`ALTER TABLE learning_profile ADD COLUMN routine_json TEXT NOT NULL DEFAULT '{}'`);
  } catch {
    // Column already exists
  }

  if (isPostgres) {
    await execDDL(`
      CREATE INDEX IF NOT EXISTS idx_document_chunks_tsv ON document_chunks USING GIN (tsv);
      CREATE INDEX IF NOT EXISTS idx_document_chunks_user ON document_chunks (user_id, subject_id);
    `);
  }
}

const seededUsers = new Set<string>();

export async function ensureUserInitialized(userId: string): Promise<void> {
  if (seededUsers.has(userId)) return;

  const now = new Date().toISOString();
  await execute(
    `INSERT INTO automation_settings (
      user_id, n8n_webhook_url, webhook_secret, whatsapp_enabled,
      whatsapp_phone_number_id, whatsapp_recipient_phone,
      push_enabled, auto_quiz_on_session_end, recovery_threshold_pct, updated_at
    ) VALUES (?, '', 'study-os-dev-secret', 0, '', '', 1, 1, 70, ?)
    ON CONFLICT (user_id) DO NOTHING`,
    [userId, now]
  );

  await execute(
    `INSERT INTO learning_profile (user_id, preferred_block_min, visual_preference, frequent_questions, english_level, updated_at)
     VALUES (?, 25, 1, 1, 'intermediate', ?)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, now]
  );

  seededUsers.add(userId);
}

async function seedUser(userId: string): Promise<void> {
  const now = new Date();
  const isoNow = now.toISOString();
  const pastDue = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const futureDue = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

  const preCalcId = crypto.randomUUID();
  const progId = crypto.randomUUID();
  const cogSciId = crypto.randomUUID();

  const insertSubjectSql = `
    INSERT INTO subjects (id, user_id, name, slug, color, description, notes_markdown, transcript_markdown, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await execute(insertSubjectSql, [
    preCalcId,
    userId,
    'Pre-Calculus',
    'pre-calculus',
    '#22d3ee',
    'Limits, continuity, trigonometric identities, and asymptotic behavior.',
    `# Pre-Calculus: Limits & Continuity\n\n## Core Intuition\nA limit describes the value a function **approaches** as the input approaches some value — regardless of whether the function is actually defined at that exact point.\n\n### Three Conditions for Continuity at $x = c$\n1. $f(c)$ is defined.\n2. $\\lim_{x \\to c} f(x)$ exists (left-hand limit equals right-hand limit).\n3. $\\lim_{x \\to c} f(x) = f(c)$.\n\n### Common Indeterminate Forms\n- $\\frac{0}{0}$: Factor & cancel, rationalize numerator/denominator, or apply trig identities.`,
    `[00:00] Lecture Transcript: Today we bridge algebra and calculus through limits.\n[04:15] Notice how (x^2 - 1)/(x - 1) has a removable discontinuity (hole) at x = 1, yet the limit as x -> 1 is 2.\n[11:40] Squeeze Theorem: if g(x) <= f(x) <= h(x) and both outer functions approach L, f(x) is trapped at L.`,
    isoNow,
    isoNow,
  ]);

  await execute(insertSubjectSql, [
    progId,
    userId,
    'Programming & Systems',
    'programming-systems',
    '#a78bfa',
    'Data structures, algorithmic complexity, async event loops, and distributed state.',
    `# Programming: Async Concurrency & Complexity\n\n## Event Loop Mechanics\n- **Call Stack**: Synchronous execution frames.\n- **Microtask Queue**: \`Promise.then\`, \`queueMicrotask\` — drained completely after each task before painting or next macrotask.\n- **Macrotask Queue**: \`setTimeout\`, I/O callbacks.\n\n## Big-O Mental Models\n- $O(1)$: Hash table lookup\n- $O(\\log n)$: Binary search (halving search space each step)\n- $O(n \\log n)$: Merge sort / Timsort`,
    `[00:00] Why does Promise.resolve().then() always run before setTimeout(fn, 0)?\n[03:20] Because the microtask queue has higher priority at the end of the current turn of the event loop.`,
    isoNow,
    isoNow,
  ]);

  await execute(insertSubjectSql, [
    cogSciId,
    userId,
    'Cognitive Science',
    'cognitive-science',
    '#34d399',
    'Memory consolidation, desirable difficulties, retrieval practice, and interleaving.',
    `# Evidence-Based Learning Principles\n\n## Desirable Difficulties\n1. **Active Recall**: Retrieving information strengthens synaptic pathways far more than passive re-reading.\n2. **Spaced Repetition**: Reviewing right before the forgetting curve drops maximizes retention per minute.\n3. **Interleaving**: Mixing problem types forces discrimination of *which* strategy applies.\n4. **Feynman Technique**: Exposing illusions of competence by explaining in plain language.`,
    `[00:00] Testing is not merely an assessment tool; retrieval itself is a potent learning event.`,
    isoNow,
    isoNow,
  ]);

  const insertConceptSql = `
    INSERT INTO concepts (id, user_id, subject_id, subtopic, title, summary, feynman_explanation, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const c1 = crypto.randomUUID();
  const c2 = crypto.randomUUID();
  const c3 = crypto.randomUUID();
  const c4 = crypto.randomUUID();

  await execute(insertConceptSql, [
    c1,
    userId,
    preCalcId,
    'Limits',
    'Removable Discontinuity vs. Jump Discontinuity',
    'A removable discontinuity occurs when the two-sided limit exists but differs from f(c) or f(c) is undefined.',
    'Imagine a smooth road with a single missing manhole cover. You can see exactly where the road is leading from both sides, even though stepping directly on that spot has a hole.',
    isoNow,
  ]);
  await execute(insertConceptSql, [
    c2,
    userId,
    preCalcId,
    'Trigonometric Limits',
    'Fundamental Trig Limit: sin(x)/x',
    'As x approaches 0 (in radians), sin(x)/x approaches 1, proved geometrically via the Squeeze Theorem.',
    'For tiny angles, the curved arc of a circle and the straight vertical height of the triangle are practically identical, so their ratio becomes 1.',
    isoNow,
  ]);
  await execute(insertConceptSql, [
    c3,
    userId,
    progId,
    'Event Loop',
    'Microtasks vs. Macrotasks Priority',
    'JavaScript drains the entire microtask queue after every call stack clearance before dequeuing the next macrotask.',
    'Microtasks are like urgent sticky notes you must finish before leaving your desk; macrotasks are appointments waiting in the lobby.',
    isoNow,
  ]);
  await execute(insertConceptSql, [
    c4,
    userId,
    progId,
    'Algorithms',
    'Amortized O(1) Dynamic Array Append',
    'Doubling capacity on overflow spreads the O(n) copy cost across n insertions, yielding O(1) amortized time.',
    'Moving to a house twice as big is expensive on moving day, but if you do it rarely enough, the daily cost per item stays tiny.',
    isoNow,
  ]);

  const insertCardSql = `
    INSERT INTO flashcards (id, user_id, subject_id, concept_id, subtopic, front, back, hint, interval_days, ease_factor, repetitions, lapses, step_index, due_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  await execute(insertCardSql, [
    crypto.randomUUID(),
    userId,
    preCalcId,
    c1,
    'Limits',
    'What are the 3 conditions required for f(x) to be continuous at x = c?',
    '1) f(c) is defined, 2) lim(x->c) f(x) exists, and 3) lim(x->c) f(x) = f(c).',
    'Defined, Limit Exists, Equal.',
    1,
    2.5,
    0,
    0,
    0,
    pastDue,
    isoNow,
  ]);
  await execute(insertCardSql, [
    crypto.randomUUID(),
    userId,
    preCalcId,
    c2,
    'Trigonometric Limits',
    'What is lim(x -> 0) of sin(x) / x (with x in radians)?',
    '1 (proved using the Squeeze Theorem with cos(x) <= sin(x)/x <= 1).',
    'Small angle approximation.',
    3,
    2.5,
    1,
    0,
    1,
    pastDue,
    isoNow,
  ]);
  await execute(insertCardSql, [
    crypto.randomUUID(),
    userId,
    progId,
    c3,
    'Event Loop',
    'In JS, which runs first after synchronous code finishes: Promise.then() or setTimeout(fn, 0)?',
    'Promise.then() runs first because the microtask queue is drained completely before the next macrotask.',
    'Microtask vs Macrotask.',
    1,
    2.5,
    0,
    0,
    0,
    pastDue,
    isoNow,
  ]);
  await execute(insertCardSql, [
    crypto.randomUUID(),
    userId,
    progId,
    c4,
    'Algorithms',
    'Why is appending to a dynamic array (e.g., JS Array / Python list) O(1) amortized?',
    'Capacity doubles on resize, so the O(n) copy happens exponentially less often, averaging O(1) work per push.',
    'Geometric resizing.',
    7,
    2.6,
    2,
    0,
    2,
    futureDue,
    isoNow,
  ]);

  const quiz1Id = crypto.randomUUID();
  const quiz2Id = crypto.randomUUID();

  await execute(
    `INSERT INTO quizzes (id, user_id, subject_id, title, type, created_at) VALUES (?, ?, ?, ?, 'standard', ?)`,
    [quiz1Id, userId, preCalcId, 'Pre-Calculus: Limits & Continuity Diagnostic', isoNow]
  );
  await execute(
    `INSERT INTO quizzes (id, user_id, subject_id, title, type, created_at) VALUES (?, ?, ?, ?, 'standard', ?)`,
    [quiz2Id, userId, progId, 'Programming: Event Loop & Complexity Check', isoNow]
  );

  const insertQSql = `
    INSERT INTO quiz_questions (id, quiz_id, subtopic, prompt, options_json, correct_index, explanation)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  await execute(insertQSql, [
    crypto.randomUUID(),
    quiz1Id,
    'Limits',
    'If lim(x->2-) f(x) = 5 and lim(x->2+) f(x) = 5, but f(2) = 9, what is lim(x->2) f(x)?',
    JSON.stringify(['9', '5', 'Does not exist', '0']),
    1,
    'The limit depends only on values approached from both sides, not the value of f(2) itself. Since both one-sided limits equal 5, the limit is 5.',
  ]);
  await execute(insertQSql, [
    crypto.randomUUID(),
    quiz1Id,
    'Limits',
    'What type of discontinuity occurs when lim(x->c) f(x) exists, but f(c) is undefined?',
    JSON.stringify([
      'Infinite discontinuity',
      'Jump discontinuity',
      'Removable discontinuity',
      'Essential oscillation',
    ]),
    2,
    'A removable discontinuity (a "hole") occurs when the two-sided limit exists and is finite, even if f(c) is missing or defined elsewhere.',
  ]);
  await execute(insertQSql, [
    crypto.randomUUID(),
    quiz1Id,
    'Trigonometric Limits',
    'Evaluate lim(x->0) sin(5x) / x.',
    JSON.stringify(['1', '0', '5', '1/5']),
    2,
    'Rewrite as 5 * [sin(5x)/(5x)]. As x->0, 5x->0, so sin(5x)/(5x) -> 1, giving 5 * 1 = 5.',
  ]);
  await execute(insertQSql, [
    crypto.randomUUID(),
    quiz1Id,
    'Asymptotes',
    'For a rational function P(x)/Q(x) where deg(P) = deg(Q), what is the horizontal asymptote?',
    JSON.stringify(['y = 0', 'No horizontal asymptote', 'Ratio of leading coefficients', 'y = 1']),
    2,
    'When numerator and denominator have equal degree, the end behavior approaches the ratio of their leading coefficients.',
  ]);

  await execute(insertQSql, [
    crypto.randomUUID(),
    quiz2Id,
    'Event Loop',
    'Which queue is drained completely after each call stack execution before rendering or starting the next timer?',
    JSON.stringify(['Macrotask Queue', 'Microtask Queue', 'Thread Pool Queue', 'DNS Lookup Queue']),
    1,
    'Microtasks (Promises, queueMicrotask) are flushed completely at the end of every turn before the event loop moves to the next macrotask.',
  ]);
  await execute(insertQSql, [
    crypto.randomUUID(),
    quiz2Id,
    'Algorithms',
    'What is the worst-case time complexity of searching for a key in a balanced Binary Search Tree (e.g., AVL)?',
    JSON.stringify(['O(1)', 'O(log n)', 'O(n)', 'O(n log n)']),
    1,
    'A balanced BST maintains height O(log n), so each comparison halves the remaining subtree.',
  ]);
  await execute(insertQSql, [
    crypto.randomUUID(),
    quiz2Id,
    'Algorithms',
    'Which sorting algorithm guarantees O(n log n) worst-case time without randomized pivots?',
    JSON.stringify(['Quicksort', 'Insertion Sort', 'Merge Sort', 'Bubble Sort']),
    2,
    'Merge Sort always splits the array in half and merges in linear time, guaranteeing O(n log n) in all cases.',
  ]);
}
