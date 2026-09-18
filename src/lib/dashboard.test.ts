import { describe, expect, it } from 'vitest';
import { addDays } from 'date-fns';
import { DEFAULT_SETTINGS, type Item, type Settings } from '../types';
import { buildDashboard, daysRemainingLabel, isAssessment } from './dashboard';
import { buildPriorityList } from './priority';

const NOW = new Date('2026-09-17T09:00:00');

function item(overrides: Partial<Item> & { id: string }): Item {
  return {
    courseId: 'c1',
    title: overrides.id,
    type: 'assignment',
    dueAt: addDays(NOW, 3).toISOString(),
    allDay: false,
    importance: 2,
    done: false,
    ...overrides,
  };
}

const settings: Settings = DEFAULT_SETTINGS;

describe('isAssessment', () => {
  it('counts exams and quizzes', () => {
    expect(isAssessment(item({ id: 'a', type: 'exam' }))).toBe(true);
    expect(isAssessment(item({ id: 'b', type: 'quiz' }))).toBe(true);
  });

  it('does not count deliverables', () => {
    for (const type of ['assignment', 'project', 'reading', 'other'] as const) {
      expect(isAssessment(item({ id: type, type }))).toBe(false);
    }
  });
});

describe('buildDashboard', () => {
  it('separates coursework from assessments — the reason for two lists', () => {
    const { coursework, assessments } = buildDashboard(
      [
        item({ id: 'essay', type: 'assignment' }),
        item({ id: 'midterm', type: 'exam' }),
        item({ id: 'proj', type: 'project' }),
        item({ id: 'pop', type: 'quiz' }),
      ],
      settings,
      NOW,
    );
    expect(coursework.map((e) => e.item.id).sort()).toEqual(['essay', 'proj']);
    expect(assessments.map((e) => e.item.id).sort()).toEqual(['midterm', 'pop']);
  });

  it('keeps overdue work out of both shortlists', () => {
    const { coursework, assessments, overdue } = buildDashboard(
      [
        item({ id: 'late', dueAt: addDays(NOW, -2).toISOString() }),
        item({ id: 'lateExam', type: 'exam', dueAt: addDays(NOW, -1).toISOString() }),
        item({ id: 'soon' }),
      ],
      settings,
      NOW,
    );
    expect(overdue.map((e) => e.item.id)).toEqual(['late', 'lateExam']);
    expect(coursework.map((e) => e.item.id)).toEqual(['soon']);
    expect(assessments).toEqual([]);
  });

  it('sorts overdue oldest-first', () => {
    const { overdue } = buildDashboard(
      [
        item({ id: 'recent', dueAt: addDays(NOW, -1).toISOString() }),
        item({ id: 'ancient', dueAt: addDays(NOW, -9).toISOString() }),
      ],
      settings,
      NOW,
    );
    expect(overdue.map((e) => e.item.id)).toEqual(['ancient', 'recent']);
  });

  it('caps each shortlist at the limit', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      item({ id: `a${i}`, dueAt: addDays(NOW, i + 1).toISOString() }),
    );
    const exams = Array.from({ length: 8 }, (_, i) =>
      item({ id: `e${i}`, type: 'exam', dueAt: addDays(NOW, i + 1).toISOString() }),
    );
    const { coursework, assessments } = buildDashboard([...many, ...exams], settings, NOW);
    expect(coursework).toHaveLength(5);
    expect(assessments).toHaveLength(5);
  });

  it('honours a custom limit', () => {
    const many = Array.from({ length: 6 }, (_, i) => item({ id: `a${i}` }));
    expect(buildDashboard(many, settings, NOW, 2).coursework).toHaveLength(2);
  });

  it('orders identically to the full priority list', () => {
    // The dashboard must never disagree with the detailed view about what
    // matters, so assert agreement with buildPriorityList rather than a
    // hand-computed winner.
    const items = [
      item({ id: 'quiz-soon', type: 'quiz', gradeWeight: 2, dueAt: addDays(NOW, 1).toISOString() }),
      item({ id: 'exam-heavy', type: 'exam', gradeWeight: 35, dueAt: addDays(NOW, 8).toISOString() }),
      item({ id: 'exam-huge', type: 'exam', gradeWeight: 40, importance: 3, dueAt: addDays(NOW, 6).toISOString() }),
    ];

    const dashboardOrder = buildDashboard(items, settings, NOW).assessments.map((e) => e.item.id);
    const fullOrder = buildPriorityList(items, settings, NOW)
      .upcoming.filter((entry) => isAssessment(entry.item))
      .map((entry) => entry.item.id);

    expect(dashboardOrder).toEqual(fullOrder);
  });

  it('lets grade impact outrank nearness when the stakes are flagged high', () => {
    const { assessments } = buildDashboard(
      [
        item({ id: 'trivial', type: 'quiz', gradeWeight: 2, dueAt: addDays(NOW, 1).toISOString() }),
        item({ id: 'heavy', type: 'exam', gradeWeight: 35, importance: 3, dueAt: addDays(NOW, 8).toISOString() }),
      ],
      settings,
      NOW,
    );
    expect(assessments[0]?.item.id).toBe('heavy');
  });

  it('excludes completed work entirely', () => {
    const { coursework, assessments, overdue } = buildDashboard(
      [
        item({ id: 'done', done: true }),
        item({ id: 'doneLate', done: true, dueAt: addDays(NOW, -3).toISOString() }),
        item({ id: 'doneExam', type: 'exam', done: true }),
      ],
      settings,
      NOW,
    );
    expect(coursework).toEqual([]);
    expect(assessments).toEqual([]);
    expect(overdue).toEqual([]);
  });

  it('reports days remaining, weight, and whether the weight was estimated', () => {
    const { coursework } = buildDashboard(
      [
        item({ id: 'known', gradeWeight: 20, dueAt: addDays(NOW, 4).toISOString() }),
        item({ id: 'guessed', type: 'project', dueAt: addDays(NOW, 5).toISOString() }),
      ],
      settings,
      NOW,
    );
    const known = coursework.find((e) => e.item.id === 'known');
    const guessed = coursework.find((e) => e.item.id === 'guessed');

    expect(known?.daysRemaining).toBe(4);
    expect(known?.weightPercent).toBeCloseTo(20);
    expect(known?.weightIsEstimated).toBe(false);

    // A project with no weight falls back to the per-type default (35%).
    expect(guessed?.weightPercent).toBeCloseTo(35);
    expect(guessed?.weightIsEstimated).toBe(true);
  });

  it('counts days by calendar day, not by elapsed hours', () => {
    // Due late tonight is still "0 days", not "-1" or "1".
    const tonight = new Date('2026-09-17T23:30:00');
    const { coursework } = buildDashboard(
      [item({ id: 'tonight', dueAt: tonight.toISOString() })],
      settings,
      NOW,
    );
    expect(coursework[0]?.daysRemaining).toBe(0);
  });

  it('handles an empty list', () => {
    const result = buildDashboard([], settings, NOW);
    expect(result).toEqual({ coursework: [], assessments: [], overdue: [] });
  });
});

describe('daysRemainingLabel', () => {
  it('reads naturally across the range', () => {
    expect(daysRemainingLabel(0)).toBe('due today');
    expect(daysRemainingLabel(1)).toBe('1 day left');
    expect(daysRemainingLabel(6)).toBe('6 days left');
    expect(daysRemainingLabel(-1)).toBe('1 day overdue');
    expect(daysRemainingLabel(-4)).toBe('4 days overdue');
  });
});
