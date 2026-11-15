import { queryAll, queryOne } from '../db.js';
import { dispatchNotification } from './dispatcher.js';

interface DueSummaryRow {
  subject_id: string;
  subject_name: string;
  subtopic: string;
  due_count: number | string;
}

let timer: NodeJS.Timeout | null = null;

export async function checkAndDispatchDueReviews(): Promise<{ triggered: number }> {
  const nowIso = new Date().toISOString();
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  const dueGroups = await queryAll<DueSummaryRow>(
    `SELECT f.subject_id, s.name as subject_name, f.subtopic, COUNT(*) as due_count
     FROM flashcards f
     JOIN subjects s ON s.id = f.subject_id
     WHERE f.due_at <= ?
     GROUP BY f.subject_id, s.name, f.subtopic
     ORDER BY due_count DESC`,
    [nowIso]
  );

  let triggered = 0;

  for (const group of dueGroups) {
    const dueCount = Number(group.due_count);
    const promptTitle = `Time for your Spaced Repetition review on ${group.subject_name}: ${group.subtopic}`;
    const existingRecent = await queryOne(
      `SELECT id FROM notification_logs
       WHERE event_type = 'spaced_repetition_due'
         AND title = ?
         AND created_at >= ?
       LIMIT 1`,
      [promptTitle, sixHoursAgo]
    );

    if (existingRecent) continue;

    await dispatchNotification({
      eventType: 'spaced_repetition_due',
      title: promptTitle,
      message: `You have ${dueCount} card${dueCount > 1 ? 's' : ''} ready for retrieval practice in ${group.subject_name} (${group.subtopic}).`,
      payload: {
        subjectId: group.subject_id,
        subjectName: group.subject_name,
        subtopic: group.subtopic,
        dueCount,
        deepLink: '/?view=reviews',
      },
    });
    triggered++;
  }

  return { triggered };
}

export function startScheduler(): void {
  if (timer) return;
  const intervalMs = Number(process.env.SCHEDULER_INTERVAL_MS || 60000);
  setTimeout(() => {
    void checkAndDispatchDueReviews();
  }, 4000);
  timer = setInterval(() => {
    void checkAndDispatchDueReviews();
  }, intervalMs);
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
