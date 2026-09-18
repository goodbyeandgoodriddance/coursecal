import { describe, expect, it } from 'vitest';
import { addDays, addHours, addWeeks } from 'date-fns';
import { DEFAULT_SETTINGS, type Item, type Settings } from '../types';
import {
  buildPriorityList,
  gradeImpactComponent,
  gradeStakesComponent,
  normalizeWeights,
  scoreItem,
  urgencyComponent,
  urgencyLevel,
} from './priority';

const NOW = new Date('2026-09-17T09:00:00');

function item(overrides: Partial<Item> & { id: string; dueAt: string }): Item {
  return {
    courseId: 'c1',
    title: overrides.id,
    type: 'assignment',
    allDay: false,
    importance: 2,
    done: false,
    ...overrides,
  };
}

function settings(weights: Partial<Settings['weights']> = {}): Settings {
  return { ...DEFAULT_SETTINGS, weights: { ...DEFAULT_SETTINGS.weights, ...weights } };
}

describe('normalizeWeights', () => {
  it('scales weights to sum to 1', () => {
    const result = normalizeWeights({ urgency: 2, gradeImpact: 1, importance: 1 });
    expect(result.urgency + result.gradeImpact + result.importance).toBeCloseTo(1);
    expect(result.urgency).toBeCloseTo(0.5);
  });

  it('falls back to equal weights when every slider is zero', () => {
    const result = normalizeWeights({ urgency: 0, gradeImpact: 0, importance: 0 });
    expect(result.urgency).toBeCloseTo(1 / 3);
    expect(result.gradeImpact).toBeCloseTo(1 / 3);
    expect(result.importance).toBeCloseTo(1 / 3);
  });

  it('keeps the score scale stable as the balance changes', () => {
    const a = normalizeWeights({ urgency: 0.4, gradeImpact: 0.4, importance: 0.2 });
    const b = normalizeWeights({ urgency: 0.8, gradeImpact: 0.8, importance: 0.4 });
    expect(a.urgency).toBeCloseTo(b.urgency);
  });
});

describe('urgencyComponent', () => {
  it('is 1 at the due moment and past it', () => {
    expect(urgencyComponent(item({ id: 'a', dueAt: NOW.toISOString() }), NOW)).toBe(1);
    expect(
      urgencyComponent(item({ id: 'a', dueAt: addDays(NOW, -3).toISOString() }), NOW),
    ).toBe(1);
  });

  it('halves at the 7-day half-life', () => {
    expect(
      urgencyComponent(item({ id: 'a', dueAt: addDays(NOW, 7).toISOString() }), NOW),
    ).toBeCloseTo(0.5, 2);
  });

  it('decays monotonically as the deadline recedes', () => {
    const at = (days: number) =>
      urgencyComponent(item({ id: 'a', dueAt: addDays(NOW, days).toISOString() }), NOW);
    expect(at(1)).toBeGreaterThan(at(5));
    expect(at(5)).toBeGreaterThan(at(20));
  });

  it('stays flat-ish far out, so distant deadlines do not crowd the list', () => {
    const at = (days: number) =>
      urgencyComponent(item({ id: 'a', dueAt: addDays(NOW, days).toISOString() }), NOW);
    // The 20->27 day gap moves urgency far less than the 1->8 day gap.
    expect(at(20) - at(27)).toBeLessThan(at(1) - at(8));
  });
});

describe('gradeImpactComponent', () => {
  it('reports the raw share, which the workload chart sums as a percentage', () => {
    expect(gradeImpactComponent(item({ id: 'a', dueAt: NOW.toISOString(), gradeWeight: 30 }))).toBe(
      0.3,
    );
  });

  it('caps a nonsensical weight above 100 at the full grade', () => {
    expect(
      gradeImpactComponent(item({ id: 'a', dueAt: NOW.toISOString(), gradeWeight: 250 })),
    ).toBe(1);
  });

  it('falls back to a per-type default when no weight is set', () => {
    const exam = gradeImpactComponent(item({ id: 'a', dueAt: NOW.toISOString(), type: 'exam' }));
    const reading = gradeImpactComponent(
      item({ id: 'b', dueAt: NOW.toISOString(), type: 'reading' }),
    );
    expect(exam).toBeGreaterThan(reading);
  });
});

describe('gradeStakesComponent', () => {
  it('spreads out the crowded low end where most coursework lives', () => {
    const at = (weight: number) =>
      gradeStakesComponent(item({ id: 'a', dueAt: NOW.toISOString(), gradeWeight: weight }));
    // A 2% and an 8% item are four times apart in stakes but only 6 points
    // apart linearly; the curve has to keep them distinguishable.
    expect(at(8) - at(2)).toBeGreaterThan(0.08);
    expect(at(2)).toBeCloseTo(Math.sqrt(0.02), 5);
    expect(at(30)).toBeCloseTo(Math.sqrt(0.3), 5);
  });

  it('preserves the ordering of the raw share', () => {
    const at = (weight: number) =>
      gradeStakesComponent(item({ id: 'a', dueAt: NOW.toISOString(), gradeWeight: weight }));
    expect(at(2)).toBeLessThan(at(10));
    expect(at(10)).toBeLessThan(at(30));
    expect(at(30)).toBeLessThan(at(100));
  });
});

describe('scoreItem', () => {
  it('scores completed items at 0 so they drop out of the ranking', () => {
    const result = scoreItem(
      item({ id: 'a', dueAt: addDays(NOW, 1).toISOString(), done: true, gradeWeight: 40 }),
      settings(),
      NOW,
    );
    expect(result.score).toBe(0);
    expect(result.overdue).toBe(false);
  });

  it('flags an incomplete past-due item as overdue', () => {
    const result = scoreItem(
      item({ id: 'a', dueAt: addDays(NOW, -1).toISOString() }),
      settings(),
      NOW,
    );
    expect(result.overdue).toBe(true);
  });

  it('does not flag a completed past-due item as overdue', () => {
    const result = scoreItem(
      item({ id: 'a', dueAt: addDays(NOW, -1).toISOString(), done: true }),
      settings(),
      NOW,
    );
    expect(result.overdue).toBe(false);
  });

  it('stays inside 0-100', () => {
    const result = scoreItem(
      item({ id: 'a', dueAt: NOW.toISOString(), gradeWeight: 100, importance: 3 }),
      settings(),
      NOW,
    );
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe('buildPriorityList', () => {
  // The behavior the whole app is built around.
  const heavyExam = item({
    id: 'exam',
    dueAt: addDays(NOW, 8).toISOString(),
    type: 'exam',
    gradeWeight: 30,
    importance: 3,
  });
  const smallQuiz = item({
    id: 'quiz',
    dueAt: addDays(NOW, 1).toISOString(),
    type: 'quiz',
    gradeWeight: 2,
  });

  it('ranks a heavy exam 8 days out above a trivial quiz due tomorrow', () => {
    const { upcoming } = buildPriorityList([smallQuiz, heavyExam], settings(), NOW);
    expect(upcoming.map((entry) => entry.item.id)).toEqual(['exam', 'quiz']);
  });

  it('flips that order when urgency is turned all the way up', () => {
    const urgencyOnly = settings({ urgency: 1, gradeImpact: 0, importance: 0 });
    const { upcoming } = buildPriorityList([smallQuiz, heavyExam], urgencyOnly, NOW);
    expect(upcoming.map((entry) => entry.item.id)).toEqual(['quiz', 'exam']);
  });

  it('excludes items beyond the horizon', () => {
    const farOff = item({ id: 'far', dueAt: addWeeks(NOW, 5).toISOString() });
    const { upcoming } = buildPriorityList([smallQuiz, farOff], settings(), NOW);
    expect(upcoming.map((entry) => entry.item.id)).toEqual(['quiz']);
  });

  it('includes an item just inside the horizon', () => {
    const justInside = item({ id: 'inside', dueAt: addDays(NOW, 27).toISOString() });
    const { upcoming } = buildPriorityList([justInside], settings(), NOW);
    expect(upcoming).toHaveLength(1);
  });

  it('separates overdue items from the ranked list', () => {
    const late = item({ id: 'late', dueAt: addDays(NOW, -2).toISOString() });
    const { overdue, upcoming } = buildPriorityList([late, smallQuiz], settings(), NOW);
    expect(overdue.map((entry) => entry.item.id)).toEqual(['late']);
    expect(upcoming.map((entry) => entry.item.id)).toEqual(['quiz']);
  });

  it('keeps overdue items separate no matter how the sliders are set', () => {
    const late = item({ id: 'late', dueAt: addDays(NOW, -2).toISOString(), gradeWeight: 1 });
    for (const weights of [
      { urgency: 1, gradeImpact: 0, importance: 0 },
      { urgency: 0, gradeImpact: 1, importance: 0 },
      { urgency: 0, gradeImpact: 0, importance: 1 },
    ]) {
      const { overdue } = buildPriorityList([late, heavyExam], settings(weights), NOW);
      expect(overdue.map((entry) => entry.item.id)).toEqual(['late']);
    }
  });

  it('sorts overdue items oldest-debt-first', () => {
    const older = item({ id: 'older', dueAt: addDays(NOW, -5).toISOString() });
    const newer = item({ id: 'newer', dueAt: addDays(NOW, -1).toISOString() });
    const { overdue } = buildPriorityList([newer, older], settings(), NOW);
    expect(overdue.map((entry) => entry.item.id)).toEqual(['older', 'newer']);
  });

  it('omits completed items entirely', () => {
    const done = item({ id: 'done', dueAt: addDays(NOW, 1).toISOString(), done: true });
    const doneLate = item({ id: 'doneLate', dueAt: addDays(NOW, -1).toISOString(), done: true });
    const { overdue, upcoming } = buildPriorityList([done, doneLate], settings(), NOW);
    expect(overdue).toHaveLength(0);
    expect(upcoming).toHaveLength(0);
  });

  it('breaks score ties by the earlier deadline', () => {
    const later = item({ id: 'later', dueAt: addDays(NOW, 4).toISOString(), gradeWeight: 10 });
    const sooner = item({ id: 'sooner', dueAt: addDays(NOW, 4).toISOString(), gradeWeight: 10 });
    // Identical except for a two-hour difference in due time.
    const soonerShifted = { ...sooner, dueAt: addHours(new Date(sooner.dueAt), -2).toISOString() };
    const { upcoming } = buildPriorityList(
      [later, soonerShifted],
      settings({ urgency: 0, gradeImpact: 1, importance: 0 }),
      NOW,
    );
    expect(upcoming[0]?.item.id).toBe('sooner');
  });
});

describe('urgencyLevel', () => {
  it('buckets by days remaining, independent of the score', () => {
    expect(urgencyLevel(item({ id: 'a', dueAt: addDays(NOW, -1).toISOString() }), NOW)).toBe(
      'overdue',
    );
    expect(urgencyLevel(item({ id: 'b', dueAt: addHours(NOW, 4).toISOString() }), NOW)).toBe(
      'today',
    );
    expect(urgencyLevel(item({ id: 'c', dueAt: addDays(NOW, 2).toISOString() }), NOW)).toBe('soon');
    expect(urgencyLevel(item({ id: 'd', dueAt: addDays(NOW, 5).toISOString() }), NOW)).toBe('week');
    expect(urgencyLevel(item({ id: 'e', dueAt: addDays(NOW, 20).toISOString() }), NOW)).toBe(
      'later',
    );
  });

  it('does not call a completed past-due item overdue', () => {
    expect(
      urgencyLevel(item({ id: 'a', dueAt: addDays(NOW, -4).toISOString(), done: true }), NOW),
    ).not.toBe('overdue');
  });
});
