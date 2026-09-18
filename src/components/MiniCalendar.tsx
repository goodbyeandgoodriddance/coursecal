import { useMemo } from 'react';
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { Item, TermBreak } from '../types';
import { toDateKey, WEEKDAY_LABELS, WEEK_STARTS_ON } from '../lib/dates';
import { breakOn } from '../lib/breaks';
import { isOverdue } from '../lib/dates';

interface Props {
  now: Date;
  items: Item[];
  breaks: TermBreak[];
  /** Opens the full calendar, so the mini view is a way in rather than a dead end. */
  onOpenCalendar: () => void;
}

/**
 * A month at a glance for the dashboard.
 *
 * Deliberately not a second calendar implementation with its own behaviour —
 * it shows only density (how much is due on each day) and defers to the School
 * Calendar for anything more. Dots rather than chips, because at this size a
 * title is unreadable anyway and the shortlists beside it already name things.
 */
export function MiniCalendar({ now, items, breaks, onOpenCalendar }: Props) {
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(now), { weekStartsOn: WEEK_STARTS_ON }),
        end: endOfWeek(endOfMonth(now), { weekStartsOn: WEEK_STARTS_ON }),
      }),
    [now],
  );

  const countsByDay = useMemo(() => {
    const map = new Map<string, { total: number; overdue: boolean }>();
    for (const item of items) {
      if (item.done) continue;
      const key = toDateKey(parseISO(item.dueAt));
      const entry = map.get(key) ?? { total: 0, overdue: false };
      entry.total += 1;
      if (isOverdue(item.dueAt, now)) entry.overdue = true;
      map.set(key, entry);
    }
    return map;
  }, [items, now]);

  return (
    <div className="mini-cal">
      <div className="mini-cal-head">
        <span className="mini-cal-month">{format(now, 'MMMM yyyy')}</span>
        <div className="spacer" />
        <button className="ghost small" onClick={onOpenCalendar}>
          Open calendar
        </button>
      </div>

      <div className="mini-cal-grid">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="mini-cal-dow">
            {label.charAt(0)}
          </div>
        ))}

        {days.map((day) => {
          const key = toDateKey(day);
          const counts = countsByDay.get(key);
          const outside = !isSameMonth(day, now);
          const dayBreak = breakOn(breaks, day);

          return (
            <div
              key={key}
              className={
                'mini-cal-day' +
                (outside ? ' outside' : '') +
                (isSameDay(day, now) ? ' is-today' : '') +
                (dayBreak ? ' is-break' : '')
              }
              title={
                [
                  format(day, 'EEE MMM d'),
                  dayBreak?.name,
                  counts ? `${counts.total} due` : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')
              }
            >
              <span className="mini-cal-num">{day.getDate()}</span>
              {counts && (
                <span
                  className={`mini-cal-dots${counts.overdue ? ' is-overdue' : ''}`}
                  aria-label={`${counts.total} due`}
                >
                  {/* Up to three dots, then a count — past three, the exact
                      number matters more than the shape. */}
                  {counts.total <= 3
                    ? Array.from({ length: counts.total }, (_, i) => (
                        <span key={i} className="mini-cal-dot" />
                      ))
                    : `${counts.total}`}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
