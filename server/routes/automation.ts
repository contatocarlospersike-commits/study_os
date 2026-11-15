import { Router } from 'express';
import { execute, queryAll, queryOne } from '../db.js';
import { dispatchNotification, getAutomationSettings } from '../services/dispatcher.js';
import { checkAndDispatchDueReviews } from '../services/scheduler.js';

export const automationRouter = Router();

automationRouter.get('/settings', async (_req, res) => {
  res.json(await getAutomationSettings());
});

automationRouter.patch('/settings', async (req, res) => {
  const current = await getAutomationSettings();
  const {
    n8n_webhook_url,
    webhook_secret,
    whatsapp_enabled,
    whatsapp_phone_number_id,
    whatsapp_recipient_phone,
    push_enabled,
    auto_quiz_on_session_end,
    recovery_threshold_pct,
  } = req.body;

  const now = new Date().toISOString();
  await execute(
    `UPDATE automation_settings
     SET n8n_webhook_url = ?, webhook_secret = ?, whatsapp_enabled = ?,
         whatsapp_phone_number_id = ?, whatsapp_recipient_phone = ?,
         push_enabled = ?, auto_quiz_on_session_end = ?, recovery_threshold_pct = ?, updated_at = ?
     WHERE id = 1`,
    [
      n8n_webhook_url ?? current.n8n_webhook_url,
      webhook_secret ?? current.webhook_secret,
      typeof whatsapp_enabled === 'boolean' ? (whatsapp_enabled ? 1 : 0) : current.whatsapp_enabled,
      whatsapp_phone_number_id ?? current.whatsapp_phone_number_id,
      whatsapp_recipient_phone ?? current.whatsapp_recipient_phone,
      typeof push_enabled === 'boolean' ? (push_enabled ? 1 : 0) : current.push_enabled,
      typeof auto_quiz_on_session_end === 'boolean'
        ? auto_quiz_on_session_end
          ? 1
          : 0
        : current.auto_quiz_on_session_end,
      typeof recovery_threshold_pct === 'number' ? recovery_threshold_pct : current.recovery_threshold_pct,
      now,
    ]
  );

  res.json(await getAutomationSettings());
});

automationRouter.get('/logs', async (_req, res) => {
  const logs = await queryAll(
    `SELECT * FROM notification_logs ORDER BY created_at DESC LIMIT 40`
  );
  res.json(logs);
});

automationRouter.post('/test-dispatch', async (req, res) => {
  const {
    title = 'Time for your Spaced Repetition review on Pre-Calculus: Limits',
    message = 'Study OS Automation Check: 3 due cards + 5-question Active Recall ready.',
  } = req.body || {};

  const result = await dispatchNotification({
    eventType: 'manual_test',
    title,
    message,
    payload: {
      triggeredBy: 'user_test',
      deepLink: '/?view=reviews',
    },
  });

  res.json(result);
});

automationRouter.all('/run-scheduler', async (_req, res) => {
  const result = await checkAndDispatchDueReviews();
  res.json(result);
});

automationRouter.post('/inbound', async (req, res) => {
  const { action } = req.body || {};
  if (action === 'check_due_reviews') {
    const result = await checkAndDispatchDueReviews();
    res.json({ ok: true, action, ...result });
    return;
  }
  res.json({ ok: true, received: req.body });
});

export const analyticsRouter = Router();

analyticsRouter.get('/', async (_req, res) => {
  const nowIso = new Date().toISOString();

  const totalsRaw = await queryOne<Record<string, unknown>>(
    `SELECT
      (SELECT COUNT(*) FROM subjects) as total_subjects,
      (SELECT COUNT(*) FROM flashcards) as total_cards,
      (SELECT COUNT(*) FROM flashcards WHERE due_at <= ?) as due_cards,
      (SELECT COUNT(*) FROM quiz_attempts) as total_attempts,
      (SELECT ROUND(AVG(score_pct)) FROM quiz_attempts) as avg_score_pct,
      (SELECT COUNT(*) FROM recovery_plans WHERE status = 'pending') as pending_recoveries,
      (SELECT COALESCE(SUM(duration_sec), 0) FROM study_sessions) as total_study_sec`,
    [nowIso]
  );

  const totals = {
    total_subjects: Number(totalsRaw?.total_subjects ?? 0),
    total_cards: Number(totalsRaw?.total_cards ?? 0),
    due_cards: Number(totalsRaw?.due_cards ?? 0),
    total_attempts: Number(totalsRaw?.total_attempts ?? 0),
    avg_score_pct:
      totalsRaw?.avg_score_pct !== null && totalsRaw?.avg_score_pct !== undefined
        ? Number(totalsRaw.avg_score_pct)
        : null,
    pending_recoveries: Number(totalsRaw?.pending_recoveries ?? 0),
    total_study_sec: Number(totalsRaw?.total_study_sec ?? 0),
  };

  const bySubjectRaw = await queryAll<Record<string, unknown>>(
    `SELECT s.id, s.name, s.color,
      (SELECT COUNT(*) FROM flashcards f WHERE f.subject_id = s.id) as card_count,
      (SELECT COUNT(*) FROM flashcards f WHERE f.subject_id = s.id AND f.due_at <= ?) as due_count,
      (SELECT ROUND(AVG(f.interval_days)) FROM flashcards f WHERE f.subject_id = s.id) as avg_interval_days,
      (SELECT ROUND(AVG(qa.score_pct)) FROM quiz_attempts qa WHERE qa.subject_id = s.id) as avg_quiz_score
     FROM subjects s
     ORDER BY s.name ASC`,
    [nowIso]
  );

  const bySubject = bySubjectRaw.map((s) => ({
    ...s,
    card_count: Number(s.card_count ?? 0),
    due_count: Number(s.due_count ?? 0),
    avg_interval_days:
      s.avg_interval_days !== null && s.avg_interval_days !== undefined
        ? Number(s.avg_interval_days)
        : null,
    avg_quiz_score:
      s.avg_quiz_score !== null && s.avg_quiz_score !== undefined ? Number(s.avg_quiz_score) : null,
  }));

  const recentAttempts = await queryAll(
    `SELECT qa.*, q.title as quiz_title, s.name as subject_name, s.color as subject_color
     FROM quiz_attempts qa
     JOIN quizzes q ON q.id = qa.quiz_id
     JOIN subjects s ON s.id = qa.subject_id
     ORDER BY qa.completed_at DESC
     LIMIT 12`
  );

  const bucketsRaw = await queryOne<Record<string, unknown>>(
    `SELECT
      SUM(CASE WHEN interval_days <= 1 THEN 1 ELSE 0 END) as d1,
      SUM(CASE WHEN interval_days > 1 AND interval_days <= 3 THEN 1 ELSE 0 END) as d3,
      SUM(CASE WHEN interval_days > 3 AND interval_days <= 7 THEN 1 ELSE 0 END) as d7,
      SUM(CASE WHEN interval_days > 7 AND interval_days <= 15 THEN 1 ELSE 0 END) as d15,
      SUM(CASE WHEN interval_days > 15 THEN 1 ELSE 0 END) as d30_plus
     FROM flashcards`
  );

  const intervalBuckets = {
    d1: Number(bucketsRaw?.d1 ?? 0),
    d3: Number(bucketsRaw?.d3 ?? 0),
    d7: Number(bucketsRaw?.d7 ?? 0),
    d15: Number(bucketsRaw?.d15 ?? 0),
    d30_plus: Number(bucketsRaw?.d30_plus ?? 0),
  };

  res.json({
    totals,
    bySubject,
    recentAttempts,
    intervalBuckets,
  });
});
