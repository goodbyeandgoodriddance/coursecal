import type { TermBreak } from '../types';
import { toDateKey } from './dates';

/**
 * Reading weeks, study breaks and holidays.
 *
 * A break is an inclusive range of yyyy-MM-dd strings. Comparing the strings
 * directly is both correct and cheaper than parsing to Date, because ISO dates
 * sort lexicographically — and it sidesteps timezone drift entirely, which
 * matters since a break is a run of calendar days, not an instant in time.
 */

/** The break covering `date`, or undefined. First match wins if they overlap. */
export function breakOn(breaks: TermBreak[], date: Date): TermBreak | undefined {
  const key = toDateKey(date);
  return breaks.find((entry) => key >= entry.startDate && key <= entry.endDate);
}

/** True when classes should be suppressed on `date`. */
export function isBreakDay(breaks: TermBreak[], date: Date): boolean {
  return breakOn(breaks, date) !== undefined;
}

/** Breaks belonging to one term, earliest first. */
export function breaksForTerm(breaks: TermBreak[], termId: string | null): TermBreak[] {
  if (!termId) return [];
  return breaks
    .filter((entry) => entry.termId === termId)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Inclusive length in days, for display ("5 days"). */
export function breakLengthDays(entry: TermBreak): number {
  const start = new Date(`${entry.startDate}T00:00:00`);
  const end = new Date(`${entry.endDate}T00:00:00`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return days > 0 ? days : 0;
}

/**
 * Whether a proposed range clashes with an existing break, so the UI can warn
 * instead of silently creating overlapping bands.
 */
export function overlapsExistingBreak(
  breaks: TermBreak[],
  termId: string,
  startDate: string,
  endDate: string,
  exceptId?: string,
): boolean {
  return breaks.some(
    (entry) =>
      entry.termId === termId &&
      entry.id !== exceptId &&
      // Two inclusive ranges overlap unless one ends before the other begins.
      startDate <= entry.endDate &&
      endDate >= entry.startDate,
  );
}
