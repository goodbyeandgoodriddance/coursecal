import { addWeeks, differenceInCalendarWeeks, format, isBefore, startOfWeek } from 'date-fns';
import { WEEK_STARTS_ON } from './dates';
import type { Item } from '../types';
import { parseISO } from 'date-fns';

export interface WeekBucket {
  /** Monday of the week. */
  weekStart: Date;
  label: string;
  itemCount: number;
  /** Summed percent of final grade due that week, across all courses. */
  gradeWeight: number;
  estimatedHours: number;
}

/**
 * Groups upcoming work into calendar weeks so crunch weeks are visible before
 * they arrive. Weeks with nothing due are kept (as zeroes) so the chart shows
 * a continuous timeline rather than collapsing gaps.
 */
export function buildWorkload(items: Item[], now: Date, weeks: number): WeekBucket[] {
  const firstWeekStart = startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });

  const buckets: WeekBucket[] = [];
  for (let i = 0; i < weeks; i += 1) {
    const weekStart = addWeeks(firstWeekStart, i);
    buckets.push({
      weekStart,
      label:
        i === 0 ? 'This week' : i === 1 ? 'Next week' : `Week of ${format(weekStart, 'MMM d')}`,
      itemCount: 0,
      gradeWeight: 0,
      estimatedHours: 0,
    });
  }

  const horizonEndDate = addWeeks(firstWeekStart, weeks);

  for (const item of items) {
    if (item.done) continue;
    const due = parseISO(item.dueAt);
    if (isBefore(due, firstWeekStart) || !isBefore(due, horizonEndDate)) continue;

    const index = differenceInCalendarWeeks(
      startOfWeek(due, { weekStartsOn: WEEK_STARTS_ON }),
      firstWeekStart,
      { weekStartsOn: WEEK_STARTS_ON },
    );
    const bucket = buckets[index];
    if (!bucket) continue;

    bucket.itemCount += 1;
    bucket.gradeWeight += item.gradeWeight ?? 0;
    bucket.estimatedHours += item.estimatedHours ?? 0;
  }

  return buckets;
}
