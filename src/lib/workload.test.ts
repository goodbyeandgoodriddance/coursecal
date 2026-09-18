import { describe, expect, it } from 'vitest';
import type { Item } from '../types';
import { buildWorkload } from './workload';

function makeItem(patch: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    courseId: 'c1',
    title: 'Work',
    type: 'assignment',
    dueAt: '2026-09-18T17:00:00.000Z',
    allDay: false,
    importance: 2,
    done: false,
    ...patch,
  };
}

describe('buildWorkload', () => {
  it('uses only explicit grade weights rather than priority-score fallbacks', () => {
    const now = new Date('2026-09-17T12:00:00.000Z');
    const buckets = buildWorkload([makeItem()], now, 2);
    expect(buckets[0]?.itemCount).toBe(1);
    expect(buckets[0]?.gradeWeight).toBe(0);
  });

  it('sums explicit grade weight and estimated hours in the due week', () => {
    const now = new Date('2026-09-17T12:00:00.000Z');
    const buckets = buildWorkload(
      [makeItem({ gradeWeight: 12, estimatedHours: 4 })],
      now,
      2,
    );
    expect(buckets[0]?.gradeWeight).toBe(12);
    expect(buckets[0]?.estimatedHours).toBe(4);
  });
});
