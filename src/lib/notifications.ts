import { parseISO } from 'date-fns';
import type { Course, FiredReminders, Item, Settings } from '../types';
import { courseLabel } from './courses';

// The `window.coursecal` bridge is declared once in src/types/bridge.d.ts.

export interface DueReminder {
  key: string;
  title: string;
  body: string;
}

/** Stable identity for one (item, lead time) pair — the dedupe key. */
export function reminderKey(itemId: string, leadHours: number): string {
  return `${itemId}@${leadHours}`;
}

function leadLabel(leadHours: number): string {
  if (leadHours >= 24 && leadHours % 24 === 0) {
    const days = leadHours / 24;
    return days === 1 ? 'tomorrow' : `in ${days} days`;
  }
  if (leadHours === 1) return 'in 1 hour';
  if (leadHours < 1) return `in ${Math.round(leadHours * 60)} minutes`;
  return `in ${leadHours} hours`;
}

/**
 * Reminders that have crossed their threshold and not yet fired.
 *
 * A reminder is due when `now` is at or past `dueAt - leadHours`. Already-fired
 * keys are skipped, which is what keeps a restart from replaying old reminders.
 * Overdue items are skipped too — the in-app overdue section already says so,
 * and a toast for something three days late is just noise.
 */
export function collectDueReminders(
  items: Item[],
  courses: Course[],
  settings: Settings,
  fired: FiredReminders,
  now: Date,
): DueReminder[] {
  if (!settings.notificationsEnabled) return [];

  const codeById = new Map(courses.map((course) => [course.id, courseLabel(course)]));
  const results: DueReminder[] = [];

  for (const item of items) {
    if (item.done) continue;
    const dueMs = parseISO(item.dueAt).getTime();
    if (dueMs <= now.getTime()) continue;

    // If several thresholds have already been crossed (for example the app
    // was closed at 24h and reopened 30 minutes before the deadline), only the
    // nearest crossed threshold is still relevant. Older missed reminders are
    // stale and must not burst out on successive store updates.
    const crossedLeads = settings.reminderLeadsHours
      .filter((leadHours) => now.getTime() >= dueMs - leadHours * 60 * 60 * 1000)
      .sort((a, b) => a - b);
    const leadHours = crossedLeads[0];
    if (leadHours === undefined) continue;

    const key = reminderKey(item.id, leadHours);
    if (fired[key]) continue;

    const code = codeById.get(item.courseId);
    results.push({
      key,
      title: `${code ? `${code} · ` : ''}${item.title}`,
      body:
        `Due ${leadLabel(leadHours)}` +
        (typeof item.gradeWeight === 'number' ? ` · ${item.gradeWeight}% of your grade` : ''),
    });
  }

  return results;
}

/** Sends a toast through the Electron bridge. No-ops in a plain browser. */
export function sendNotification(reminder: DueReminder): void {
  window.coursecal?.notify({ title: reminder.title, body: reminder.body });
}
