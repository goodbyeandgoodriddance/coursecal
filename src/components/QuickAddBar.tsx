import { forwardRef, useMemo, useState } from 'react';
import { format } from 'date-fns';
import type { Course, Item } from '../types';
import { parseQuickAdd } from '../lib/quickAdd';
import type { ItemDraft } from './ItemModal';
import { emptyDraft } from './ItemModal';
import { toDateKey } from '../lib/dates';
import { courseLabel } from '../lib/courses';

interface Props {
  courses: Course[];
  now: Date;
  onAdd: (values: Omit<Item, 'id'>) => void;
  /** Called when the input can't be parsed confidently, to open the full form. */
  onEscalate: (draft: ItemDraft) => void;
}

/**
 * One-line entry. Shows a live interpretation chip so a misparse is visible
 * before Enter, and hands anything ambiguous to the full form rather than
 * guessing.
 */
export const QuickAddBar = forwardRef<HTMLInputElement, Props>(function QuickAddBar(
  { courses, now, onAdd, onEscalate },
  ref,
) {
  const [text, setText] = useState('');

  const parsed = useMemo(
    () => (text.trim() ? parseQuickAdd(text, courses, now) : null),
    [text, courses, now],
  );

  const course = parsed?.courseId
    ? courses.find((candidate) => candidate.id === parsed.courseId)
    : undefined;

  function escalate() {
    const fallback = emptyDraft(parsed?.courseId ?? courses[0]?.id ?? '', parsed?.due ?? now);
    onEscalate({
      ...fallback,
      title: parsed?.title || text.trim(),
      type: parsed?.type ?? 'assignment',
      importance: parsed?.importance ?? 2,
      ...(parsed?.due ? { dateKey: toDateKey(parsed.due) } : {}),
      time: parsed?.due && !parsed.allDay ? format(parsed.due, 'HH:mm') : '',
      gradeWeight: parsed?.gradeWeight?.toString() ?? '',
    });
    setText('');
  }

  function submit() {
    if (!parsed) return;

    // Not enough understood to create silently — open the form pre-filled.
    if (!parsed.confident || !parsed.due || !parsed.courseId) {
      escalate();
      return;
    }

    onAdd({
      courseId: parsed.courseId,
      title: parsed.title,
      type: parsed.type,
      dueAt: parsed.due.toISOString(),
      allDay: parsed.allDay,
      importance: parsed.importance,
      done: false,
      ...(parsed.gradeWeight !== undefined ? { gradeWeight: parsed.gradeWeight } : {}),
    });
    setText('');
  }

  const missing: string[] = [];
  if (parsed) {
    if (!parsed.courseId) missing.push('course');
    if (!parsed.due) missing.push('date');
    if (!parsed.title) missing.push('title');
  }

  const hasCourses = courses.length > 0;

  return (
    <div className="quickadd" data-tour="quick-add">
      <div className="quickadd-row">
        <input
          ref={ref}
          className="quickadd-input"
          value={text}
          placeholder={hasCourses ? "Quick add —  CS201 essay fri 5pm 20%" : "Add a course to start using quick add"}
          disabled={!hasCourses}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') setText('');
          }}
          aria-label="Quick add an item"
        />
        <button className="primary" onClick={submit} disabled={!hasCourses || !text.trim()}>
          Add
        </button>
      </div>

      <div className="quickadd-hint">
        {!hasCourses && (
          <span>Add a term and course in Courses first — every deadline needs somewhere to belong.</span>
        )}

        {hasCourses && !parsed && (
          <span>
            Course code, then anything: <span className="kbd">tomorrow</span>{' '}
            <span className="kbd">fri 5pm</span> <span className="kbd">dec 4</span>{' '}
            <span className="kbd">in 3 days</span> <span className="kbd">20%</span>{' '}
            <span className="kbd">!</span> for high priority.
          </span>
        )}

        {parsed && (
          <>
            <span className={`parse-chip${missing.length ? ' incomplete' : ''}`}>
              <strong>{course ? courseLabel(course) : 'no course'}</strong>
              <span className="sep">·</span>
              <span>{parsed.title || 'no title'}</span>
              <span className="sep">·</span>
              <span>
                {parsed.due
                  ? parsed.allDay
                    ? format(parsed.due, 'EEE MMM d')
                    : format(parsed.due, 'EEE MMM d, h:mm a')
                  : 'no date'}
              </span>
              <span className="sep">·</span>
              <span>{parsed.type}</span>
              {parsed.gradeWeight !== undefined && (
                <>
                  <span className="sep">·</span>
                  <span>{parsed.gradeWeight}%</span>
                </>
              )}
              {parsed.importance === 3 && (
                <>
                  <span className="sep">·</span>
                  <span>high</span>
                </>
              )}
            </span>
            <span>
              {missing.length
                ? `Enter opens the form (missing ${missing.join(', ')}).`
                : 'Press Enter to add.'}
            </span>
          </>
        )}
      </div>
    </div>
  );
});
