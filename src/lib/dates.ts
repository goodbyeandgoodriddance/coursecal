import {
  addWeeks,
  differenceInCalendarDays,
  differenceInMinutes,
  endOfDay,
  format,
  isSameDay,
  parseISO,
  startOfDay,
} from 'date-fns';

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * The first day of the week, app-wide. Must match WEEKDAY_LABELS above.
 *
 * Every caller of date-fns' startOfWeek/endOfWeek passes this rather than its
 * own literal: the Week view and the workload chart previously disagreed
 * (Sunday vs Monday), so the chart's "This week" covered a different range
 * than the week you were looking at.
 */
export const WEEK_STARTS_ON = 0 as const;

/** Fractional days from `now` until `iso`. Negative when already past. */
export function daysUntil(iso: string, now: Date): number {
  return differenceInMinutes(parseISO(iso), now) / (60 * 24);
}

/** Whole calendar days between today and the due date, ignoring time of day. */
export function calendarDaysUntil(iso: string, now: Date): number {
  return differenceInCalendarDays(parseISO(iso), now);
}

export function isOverdue(iso: string, now: Date): boolean {
  return parseISO(iso).getTime() < now.getTime();
}

export function isDueToday(iso: string, now: Date): boolean {
  return isSameDay(parseISO(iso), now);
}

/** Inclusive [now, now + weeks] window used by the priority list. */
export function horizonEnd(now: Date, weeks: number): Date {
  return endOfDay(addWeeks(now, weeks));
}

/**
 * Human-readable due text, e.g. "in 3 days · Fri 5:00 PM" or "2 days overdue".
 * All-day items omit the time.
 */
export function formatDue(iso: string, allDay: boolean, now: Date): string {
  const due = parseISO(iso);
  const days = differenceInCalendarDays(due, startOfDay(now));
  const stamp = allDay ? format(due, 'EEE MMM d') : format(due, 'EEE MMM d, h:mm a');

  let relative: string;
  if (days < 0) {
    const overdueBy = Math.abs(days);
    relative = overdueBy === 1 ? '1 day overdue' : `${overdueBy} days overdue`;
  } else if (days === 0) {
    relative = 'today';
  } else if (days === 1) {
    relative = 'tomorrow';
  } else if (days < 7) {
    relative = `in ${days} days`;
  } else {
    const weeks = Math.round(days / 7);
    relative = weeks === 1 ? 'in about a week' : `in ${weeks} weeks`;
  }

  return `${relative} · ${stamp}`;
}

/** "HH:mm" -> minutes since midnight. Returns null for malformed input. */
export function timeToMinutes(time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesToTimeLabel(minutes: number): string {
  const hours24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const suffix = hours24 < 12 ? 'AM' : 'PM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return mins === 0 ? `${hours12} ${suffix}` : `${hours12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

/** yyyy-MM-dd for a Date, in local time (never UTC-shifted). */
export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

/** Combines a yyyy-MM-dd date with an HH:mm time into a local ISO datetime. */
export function combineDateAndTime(dateKey: string, time: string | null): string {
  const effective = time && timeToMinutes(time) !== null ? time : '23:59';
  return new Date(`${dateKey}T${effective}:00`).toISOString();
}
