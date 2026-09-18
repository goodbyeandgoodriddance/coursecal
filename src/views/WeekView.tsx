import { useMemo, useState } from 'react';
import { addWeeks, eachDayOfInterval, endOfWeek, format, isSameDay, parseISO, startOfWeek } from 'date-fns';
import type { Item } from '../types';
import { useStore } from '../store/StoreContext';
import {
  isOverdue,
  minutesToTimeLabel,
  timeToMinutes,
  toDateKey,
  WEEKDAY_LABELS,
  WEEK_STARTS_ON,
} from '../lib/dates';
import { courseColorVar } from '../components/CourseBadge';
import { courseLabel } from '../lib/courses';
import { breakOn, breaksForTerm } from '../lib/breaks';
import { laneStyle, layoutOverlapping } from '../lib/weekLayout';
import { ICON_INLINE, NextArrow, PrevArrow } from '../components/Icon';

/** Pixel height of one hour row; must match .week-hour-line in theme.css. */
const HOUR_H = 44;
/** Familiar default range; the rendered grid expands for earlier/later events. */
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 22;

interface Props {
  now: Date;
  onOpenItem: (item: Item) => void;
}

export function WeekView({ now, onOpenItem }: Props) {
  const { activeItems, courseById, data } = useStore();
  const [cursor, setCursor] = useState(() => startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON }));

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON }),
        end: endOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON }),
      }),
    [cursor],
  );

  // Meetings recur weekly, so they are looked up by weekday, not by date.
  const meetingsByWeekday = useMemo(() => {
    const map = new Map<number, typeof data.meetings>();
    const activeCourseIds = new Set(
      data.activeTermId
        ? data.courses.filter((course) => course.termId === data.activeTermId).map((c) => c.id)
        : data.courses.map((course) => course.id),
    );
    for (const meeting of data.meetings) {
      if (!activeCourseIds.has(meeting.courseId)) continue;
      const bucket = map.get(meeting.weekday);
      if (bucket) bucket.push(meeting);
      else map.set(meeting.weekday, [meeting]);
    }
    return map;
  }, [data.meetings, data.courses, data.activeTermId]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of activeItems) {
      const key = toDateKey(parseISO(item.dueAt));
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return map;
  }, [activeItems]);

  // Keep the familiar 7am–11pm window by default, but expand it when an
  // early or late class/deadline would otherwise be invisible.
  const visibleRange = useMemo(() => {
    let earliest = DAY_START_HOUR * 60;
    let latest = (DAY_END_HOUR + 1) * 60;

    for (const meetings of meetingsByWeekday.values()) {
      for (const meeting of meetings) {
        const start = timeToMinutes(meeting.startTime);
        const end = timeToMinutes(meeting.endTime);
        if (start !== null) earliest = Math.min(earliest, start);
        if (end !== null) latest = Math.max(latest, end);
      }
    }

    for (const day of days) {
      for (const item of itemsByDay.get(toDateKey(day)) ?? []) {
        if (item.allDay) continue;
        const due = parseISO(item.dueAt);
        const minutes = due.getHours() * 60 + due.getMinutes();
        earliest = Math.min(earliest, minutes);
        latest = Math.max(latest, minutes + 1);
      }
    }

    return {
      startHour: Math.max(0, Math.floor(earliest / 60)),
      endHour: Math.min(24, Math.ceil(latest / 60)),
    };
  }, [days, itemsByDay, meetingsByWeekday]);

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let hour = visibleRange.startHour; hour < visibleRange.endHour; hour += 1) list.push(hour);
    return list;
  }, [visibleRange]);

  /** Reading weeks etc. for the active term; classes do not run during these. */
  const termBreaks = useMemo(
    () => breaksForTerm(data.breaks, data.activeTermId),
    [data.breaks, data.activeTermId],
  );

  const topOffset = (minutes: number) =>
    ((minutes - visibleRange.startHour * 60) / 60) * HOUR_H;

  return (
    <>
      <div className="view-header">
        <h1 className="view-title">
          Week of {format(days[0] as Date, 'MMM d')}
        </h1>
        <span className="view-subtitle">Class times and deadlines</span>
        <div className="spacer" />
        <button className="ghost with-icon" onClick={() => setCursor(addWeeks(cursor, -1))}>
          <PrevArrow size={ICON_INLINE} />
          Prev
        </button>
        <button className="ghost" onClick={() => setCursor(startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON }))}>
          This week
        </button>
        <button className="ghost with-icon" onClick={() => setCursor(addWeeks(cursor, 1))}>
          Next
          <NextArrow size={ICON_INLINE} />
        </button>
      </div>

      <div className="week-wrap" data-tour="week-view">
        <div className="week-head">
          <div className="week-head-cell" />
          {days.map((day, index) => (
            <div
              key={day.toISOString()}
              className={`week-head-cell${isSameDay(day, now) ? ' is-today' : ''}${
                breakOn(termBreaks, day) ? ' is-break' : ''
              }`}
              title={breakOn(termBreaks, day)?.name}
            >
              <span className="dow">{WEEKDAY_LABELS[index]}</span>
              {day.getDate()}
            </div>
          ))}
        </div>

        {/* All-day deadlines have no position on the hour grid, so they get
            their own strip rather than being pinned at an arbitrary time. */}
        <div className="week-allday">
          <div className="week-allday-label">Due</div>
          {days.map((day) => {
            const dayItems = (itemsByDay.get(toDateKey(day)) ?? []).filter((item) => item.allDay);
            return (
              <div key={day.toISOString()} className="week-allday-cell">
                {dayItems.map((item) => {
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
                      title={`${courseLabel(course)} ${item.title} (all day)`}
                      onClick={() => onOpenItem(item)}
                    >
                      {courseLabel(course)} {item.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="week-body">
          <div className="week-hours">
            {hours.map((hour) => (
              <div key={hour} className="week-hour-label">
                {minutesToTimeLabel(hour * 60)}
              </div>
            ))}
          </div>

          {days.map((day) => {
            // No classes during a reading week, so the recurring meetings are
            // suppressed for those days. Deadlines still show — work is often
            // due during one.
            const dayBreak = breakOn(termBreaks, day);
            const meetings = dayBreak ? [] : meetingsByWeekday.get(day.getDay()) ?? [];
            const timedItems = (itemsByDay.get(toDateKey(day)) ?? []).filter(
              (item) => !item.allDay,
            );

            return (
              <div
                key={day.toISOString()}
                className={`week-col${dayBreak ? ' is-break' : ''}`}
              >
                {hours.map((hour) => (
                  <div key={hour} className="week-hour-line" />
                ))}

                {dayBreak && (
                  <div className="week-break-label" title={dayBreak.name}>
                    {dayBreak.name}
                  </div>
                )}

                {/* Overlapping classes are laid out in side-by-side lanes;
                    drawn at identical coordinates they would hide each other. */}
                {layoutOverlapping(
                  meetings.flatMap((meeting) => {
                    const start = timeToMinutes(meeting.startTime);
                    const end = timeToMinutes(meeting.endTime);
                    if (start === null || end === null || end <= start) return [];
                    return [{ value: { meeting, start, end }, start, end }];
                  }),
                ).map(({ value: { meeting, start, end }, lane, lanes }) => {
                  const course = courseById(meeting.courseId);
                  return (
                    <div
                      key={meeting.id}
                      className="week-block"
                      style={{
                        top: topOffset(start),
                        height: Math.max(((end - start) / 60) * HOUR_H - 2, 16),
                        ...laneStyle(lane, lanes),
                        ['--course-color' as string]: course
                          ? courseColorVar(course.colorIndex)
                          : undefined,
                      }}
                      title={`${courseLabel(course)} ${meeting.kind} · ${minutesToTimeLabel(
                        start,
                      )}–${minutesToTimeLabel(end)}${
                        meeting.location ? ` · ${meeting.location}` : ''
                      }`}
                    >
                      <div className="block-code">{courseLabel(course)}</div>
                      <div className="block-sub">
                        {meeting.kind}
                        {meeting.location ? ` · ${meeting.location}` : ''}
                      </div>
                    </div>
                  );
                })}

                {timedItems.map((item) => {
                  const due = parseISO(item.dueAt);
                  const minutes = due.getHours() * 60 + due.getMinutes();
                  const course = courseById(item.courseId);
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`week-due-marker${
                        !item.done && isOverdue(item.dueAt, now) ? ' is-overdue' : ''
                      }`}
                      style={{
                        // Keep the marker inside its dynamically expanded grid.
                        top: Math.max(topOffset(minutes) - 9, 0),
                        ['--course-color' as string]: course
                          ? courseColorVar(course.colorIndex)
                          : undefined,
                      }}
                      title={`Due ${format(due, 'h:mm a')} · ${courseLabel(course)} ${item.title}`}
                      onClick={() => onOpenItem(item)}
                    >
                      <span className="due-dot" />
                      {format(due, 'h:mm')} {item.title}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
