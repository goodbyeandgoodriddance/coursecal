import type { Course, Item } from '../types';
import { formatDue } from '../lib/dates';
import { urgencyLevel, type ScoreBreakdown } from '../lib/priority';
import { CourseBadge, courseColorVar } from './CourseBadge';

interface Props {
  item: Item;
  course: Course | undefined;
  now: Date;
  /** Present in the priority list; omitted elsewhere. */
  breakdown?: ScoreBreakdown;
  rank?: number;
  onToggle: (id: string) => void;
  onOpen: (item: Item) => void;
}

export function ItemRow({ item, course, now, breakdown, rank, onToggle, onOpen }: Props) {
  const level = urgencyLevel(item, now);

  return (
    <div
      className={`item-row urgency-${level}${item.done ? ' is-done' : ''}`}
      style={{
        ['--course-color' as string]: course ? courseColorVar(course.colorIndex) : undefined,
      }}
    >
      <div className="item-stripe" />

      <input
        className="item-check"
        type="checkbox"
        checked={item.done}
        onChange={() => onToggle(item.id)}
        aria-label={`Mark "${item.title}" ${item.done ? 'not done' : 'done'}`}
      />

      {/* Double-click, not single: a single click on a dense list is too easy
          to fire by accident while scanning. Enter still opens it for keyboard
          users, where there is no ambiguity. */}
      <div
        className="item-main"
        onDoubleClick={() => onOpen(item)}
        role="button"
        tabIndex={0}
        title={`${item.title} — double-click to edit`}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(item);
          }
        }}
      >
        {rank !== undefined && <span className="rank">{rank}</span>}
        <CourseBadge course={course} />
        <span className="item-title">{item.title}</span>
        {level === 'overdue' && <span className="pill overdue">Overdue</span>}
        {item.importance === 3 && level !== 'overdue' && <span className="pill high">High</span>}
        <span className="pill type">{item.type}</span>
      </div>

      <div className="item-meta">
        {typeof item.gradeWeight === 'number' && (
          <span className="weight-tag" title="Percent of final grade">
            {item.gradeWeight}%
          </span>
        )}
        <span className="item-due">{formatDue(item.dueAt, item.allDay, now)}</span>
        {breakdown && (
          <>
            <span
              className="score-bar"
              title={
                `Priority ${breakdown.score.toFixed(0)}/100 — ` +
                `urgency ${(breakdown.urgency * 100).toFixed(0)}%, ` +
                `grade impact ${(breakdown.gradeImpact * 100).toFixed(0)}%, ` +
                `importance ${(breakdown.importance * 100).toFixed(0)}%`
              }
            >
              <span className="score-fill" style={{ width: `${breakdown.score}%` }} />
            </span>
            <span className="score-number">{breakdown.score.toFixed(0)}</span>
          </>
        )}
      </div>
    </div>
  );
}
