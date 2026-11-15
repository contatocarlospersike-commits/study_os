/**
 * Modified SM-2 + Fixed Evidence-Based Interval Ladder (1, 3, 7, 15, 30 days)
 * Ratings:
 *  - 'again' (1): Reset to 1 day, increment lapses, decrease ease
 *  - 'hard'  (2): Hold or step cautiously, slight ease penalty
 *  - 'good'  (3): Advance along [1, 3, 7, 15, 30] ladder (or SM-2 beyond 30d)
 *  - 'easy'  (4): Skip a step on the ladder + boost ease factor
 */
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export const INTERVAL_LADDER = [1, 3, 7, 15, 30] as const;

export interface CardScheduleInput {
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  lapses: number;
  step_index: number;
}

export interface CardScheduleOutput extends CardScheduleInput {
  due_at: string;
  last_reviewed_at: string;
}

export function computeNextSchedule(
  card: CardScheduleInput,
  rating: ReviewRating,
  now = new Date()
): CardScheduleOutput {
  let ease = card.ease_factor;
  let reps = card.repetitions;
  let lapses = card.lapses;
  let stepIndex = card.step_index;
  let intervalDays = card.interval_days;

  if (rating === 'again') {
    reps = 0;
    lapses += 1;
    stepIndex = 0;
    intervalDays = INTERVAL_LADDER[0]; // 1 day recovery
    ease = Math.max(1.3, Number((ease - 0.2).toFixed(2)));
  } else if (rating === 'hard') {
    reps += 1;
    stepIndex = Math.max(0, stepIndex);
    intervalDays =
      stepIndex < INTERVAL_LADDER.length
        ? INTERVAL_LADDER[stepIndex]
        : Math.max(1, Math.round(intervalDays * 1.2));
    ease = Math.max(1.3, Number((ease - 0.1).toFixed(2)));
  } else if (rating === 'good') {
    reps += 1;
    if (reps === 1) {
      stepIndex = 0;
      intervalDays = INTERVAL_LADDER[0]; // 1 day
    } else {
      stepIndex = stepIndex + 1;
      if (stepIndex < INTERVAL_LADDER.length) {
        intervalDays = INTERVAL_LADDER[stepIndex]; // 3, 7, 15, 30
      } else {
        intervalDays = Math.round(intervalDays * ease);
      }
    }
  } else if (rating === 'easy') {
    reps += 1;
    stepIndex = stepIndex + 2;
    if (stepIndex < INTERVAL_LADDER.length) {
      intervalDays = INTERVAL_LADDER[stepIndex];
    } else {
      intervalDays = Math.round(Math.max(30, intervalDays) * ease * 1.15);
    }
    ease = Math.min(3.0, Number((ease + 0.15).toFixed(2)));
  }

  const dueDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    interval_days: intervalDays,
    ease_factor: ease,
    repetitions: reps,
    lapses,
    step_index: stepIndex,
    due_at: dueDate.toISOString(),
    last_reviewed_at: now.toISOString(),
  };
}
