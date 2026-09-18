import { describe, expect, it } from 'vitest';
import type { Item } from '../types';
import { computeCourseGrade } from './grades';

function item(overrides: Partial<Item> & { id: string }): Item {
  return {
    courseId: 'c1',
    title: overrides.id,
    type: 'assignment',
    dueAt: '2026-09-10T17:00:00.000Z',
    allDay: false,
    importance: 2,
    done: false,
    ...overrides,
  };
}

describe('computeCourseGrade', () => {
  it('returns nulls when nothing is graded yet', () => {
    const grade = computeCourseGrade([item({ id: 'a', gradeWeight: 20 })]);
    expect(grade.currentGrade).toBeNull();
    expect(grade.projectedGrade).toBeNull();
    expect(grade.gradedWeight).toBe(0);
    expect(grade.totalWeight).toBe(20);
    expect(grade.gradedCount).toBe(0);
  });

  it('handles an empty course', () => {
    const grade = computeCourseGrade([]);
    expect(grade.currentGrade).toBeNull();
    expect(grade.totalWeight).toBe(0);
  });

  it('weights graded items by their share of the grade, not equally', () => {
    // 90 on a 30% item and 50 on a 10% item: the big item must dominate.
    const grade = computeCourseGrade([
      item({ id: 'big', gradeWeight: 30, earnedScore: 90 }),
      item({ id: 'small', gradeWeight: 10, earnedScore: 50 }),
    ]);
    expect(grade.gradedWeight).toBe(40);
    expect(grade.currentGrade).toBeCloseTo((90 * 30 + 50 * 10) / 40); // 80
    expect(grade.gradedCount).toBe(2);
  });

  it('counts only graded items toward the current grade, but all weighted items toward the total', () => {
    const grade = computeCourseGrade([
      item({ id: 'graded', gradeWeight: 10, earnedScore: 80 }),
      item({ id: 'pending', gradeWeight: 40 }),
    ]);
    expect(grade.currentGrade).toBeCloseTo(80);
    expect(grade.gradedWeight).toBe(10);
    expect(grade.totalWeight).toBe(50);
  });

  it('ignores items with a score but no weight', () => {
    // A score with no weight cannot be placed in the total, so it must not
    // silently skew the average either.
    const grade = computeCourseGrade([
      item({ id: 'weighted', gradeWeight: 20, earnedScore: 60 }),
      item({ id: 'unweighted', earnedScore: 100 }),
    ]);
    expect(grade.currentGrade).toBeCloseTo(60);
    expect(grade.gradedCount).toBe(1);
  });

  it('ignores items with a weight but no score', () => {
    const grade = computeCourseGrade([
      item({ id: 'scored', gradeWeight: 20, earnedScore: 70 }),
      item({ id: 'unscored', gradeWeight: 80 }),
    ]);
    expect(grade.currentGrade).toBeCloseTo(70);
    expect(grade.totalWeight).toBe(100);
  });

  it('counts a zero score rather than treating it as missing', () => {
    const grade = computeCourseGrade([
      item({ id: 'zero', gradeWeight: 50, earnedScore: 0 }),
      item({ id: 'full', gradeWeight: 50, earnedScore: 100 }),
    ]);
    expect(grade.currentGrade).toBeCloseTo(50);
    expect(grade.gradedCount).toBe(2);
  });

  it('projects the final grade as the current average over the remainder', () => {
    const grade = computeCourseGrade([
      item({ id: 'a', gradeWeight: 25, earnedScore: 84 }),
      item({ id: 'b', gradeWeight: 75 }),
    ]);
    expect(grade.projectedGrade).toBeCloseTo(84);
  });
});
