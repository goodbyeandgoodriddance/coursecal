import { describe, expect, it } from 'vitest';
import type { Course, Item, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { collectDueReminders, reminderKey } from './notifications';

const course: Course = {
  id: 'course_1',
  termId: 'term_1',
  code: 'CS201',
  title: 'Data Structures',
  colorIndex: 0,
};

function itemDueAt(iso: string): Item {
  return {
    id: 'item_1',
    courseId: course.id,
    title: 'Midterm',
    type: 'exam',
    dueAt: iso,
    allDay: false,
    importance: 3,
    gradeWeight: 30,
    done: false,
  };
}

function settings(leads: number[]): Settings {
  return { ...DEFAULT_SETTINGS, reminderLeadsHours: leads, notificationsEnabled: true };
}

describe('collectDueReminders', () => {
  it('fires the nearest crossed threshold instead of replaying stale reminders', () => {
    const due = '2026-09-17T15:00:00.000Z';
    const now = new Date('2026-09-17T14:30:00.000Z');
    const reminders = collectDueReminders(
      [itemDueAt(due)],
      [course],
      settings([24, 1]),
      {},
      now,
    );

    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.key).toBe(reminderKey('item_1', 1));
  });

  it('does not fall back to an older threshold after the nearest one has fired', () => {
    const due = '2026-09-17T15:00:00.000Z';
    const now = new Date('2026-09-17T14:30:00.000Z');
    const reminders = collectDueReminders(
      [itemDueAt(due)],
      [course],
      settings([24, 1]),
      { [reminderKey('item_1', 1)]: true },
      now,
    );

    expect(reminders).toHaveLength(0);
  });

  it('still fires a farther reminder when the nearer threshold has not been crossed yet', () => {
    const due = '2026-09-18T12:00:00.000Z';
    const now = new Date('2026-09-17T13:00:00.000Z');
    const reminders = collectDueReminders(
      [itemDueAt(due)],
      [course],
      settings([24, 1]),
      {},
      now,
    );

    expect(reminders[0]?.key).toBe(reminderKey('item_1', 24));
  });
});
