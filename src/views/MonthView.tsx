import { useMemo, useState } from 'react';
import {
  addMonths,
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
import type { Item } from '../types';
import { useStore } from '../store/StoreContext';
import { isOverdue, toDateKey, WEEKDAY_LABELS, WEEK_STARTS_ON } from '../lib/dates';
import { courseColorVar } from '../components/CourseBadge';
import { courseLabel } from '../lib/courses';
import { breakOn, breaksForTerm } from '../lib/breaks';
import { ICON_INLINE, NextArrow, PrevArrow } from '../components/Icon';

const MAX_CHIPS = 3;

interface Props {
  now: Date;
  onOpenItem: (item: Item) => void;
  /** Clicking empty space in a day creates an item pre-filled with that date. */
  onCreateOnDate: (dateKey: string) => void;
}

export function MonthView({ now, onOpenItem, onCreateOnDate }: Props) {
  const { activeItems, courseById, data } = useStore();
  const [cursor, setCursor] = useState(() => startOfMonth(now));

  const days = useMemo(() => {
    // Pad to whole weeks so the grid is always rectangular.
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: WEEK_STARTS_ON });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: WEEK_STARTS_ON });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  /** Reading weeks etc. for the active term, banded across the grid. */
  const termBreaks = useMemo(
    () => breaksForTerm(data.breaks, data.activeTermId),
    [data.breaks, data.activeTermId],
  );

  const itemsByDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of activeItems) {
      const key = toDateKey(parseISO(item.dueAt));
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    // Earliest due time first inside each day.
    for (const bucket of map.values()) {
      bucket.sort((a, b) => parseISO(a.dueAt).getTime() - parseISO(b.dueAt).getTime());
    }
    return map;
  }, [activeItems]);

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">{format(cursor, 'MMMM yyyy')}</h1>
        <div className="spacer" />
        <button className="ghost with-icon" onClick={() => setCursor(addMonths(cursor, -1))}>
          <PrevArrow size={ICON_INLINE} />
          Prev
        </button>
        <button className="ghost" onClick={() => setCursor(startOfMonth(now))}>
          Today
        </button>
        <button className="ghost with-icon" onClick={() => setCursor(addMonths(cursor, 1))}>
          Next
          <NextArrow size={ICON_INLINE} />
        </button>
      </div>

      <div className="month-grid" data-tour="month-view">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="month-dow">
            {label}
          </div>
        ))}

        {days.map((day, index) => {
          const key = toDateKey(day);
          const dayItems = itemsByDay.get(key) ?? [];
          const outside = !isSameMonth(day, cursor);
          const dayBreak = breakOn(termBreaks, day);
          // Label the band only on its first visible day, so a five-day
          // reading week reads as one block rather than five repeats.
          const isBreakStart =
            dayBreak !== undefined && (key === dayBreak.startDate || index === 0);

          return (
            <div
              key={key}
              className={`month-cell${outside ? ' outside' : ''}${
                isSameDay(day, now) ? ' is-today' : ''
              }${dayBreak ? ' is-break' : ''}`}
              onClick={() => onCreateOnDate(key)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onCreateOnDate(key);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Add an item on ${format(day, 'EEEE MMMM d')}`}
              title={
                dayBreak
                  ? `${dayBreak.name} — ${format(day, 'EEE MMM d')}. Click to add an item.`
                  : `Add an item on ${format(day, 'EEE MMM d')}`
              }
            >
              <span className="month-daynum">{day.getDate()}</span>

              {isBreakStart && dayBreak && (
                <span className="month-break-label" title={dayBreak.name}>
                  {dayBreak.name}
                </span>
              )}

              {dayItems.slice(0, MAX_CHIPS).map((item) => {
                const course = courseById(item.courseId);
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`month-chip${item.done ? ' is-done' : ''}${
                      !item.done && isOverdue(item.dueAt, now) ? ' is-overdue' : ''
                    }`}
                    style={{
                      ['--course-color' as string]: course
                        ? courseColorVar(course.colorIndex)
                        : undefined,
                    }}
                    title={`${courseLabel(course)} ${item.title}`}
                    onClick={(event) => {
                      // Don't also trigger the cell's create handler.
                      event.stopPropagation();
                      onOpenItem(item);
                    }}
                  >
                    {courseLabel(course)} {item.title}
                  </button>
                );
              })}

              {dayItems.length > MAX_CHIPS && (
                <span className="month-more">+{dayItems.length - MAX_CHIPS} more</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="quickadd-hint" style={{ marginTop: 10 }}>
        Click any day to add an item on it; click a chip to edit.
      </div>
    </>
  );
}
