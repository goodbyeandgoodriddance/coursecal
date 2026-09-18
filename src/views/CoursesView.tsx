import { useMemo, useState } from 'react';
import { addMonths, format, parseISO } from 'date-fns';
import type { Course, CourseMeeting, Item, MeetingKind } from '../types';
import { MEETING_KINDS } from '../types';
import { useStore } from '../store/StoreContext';
import { computeCourseGrade } from '../lib/grades';
import { minutesToTimeLabel, timeToMinutes, toDateKey, WEEKDAY_LABELS } from '../lib/dates';
import { courseColorVar } from '../components/CourseBadge';
import { courseFullName, courseLabel, isCodeTaken } from '../lib/courses';
import { breakLengthDays, breaksForTerm, overlapsExistingBreak } from '../lib/breaks';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  Add,
  Break,
  Close,
  Delete,
  Edit,
  ICON_INLINE,
  ItemDone,
  ItemPending,
  NoCourses,
} from '../components/Icon';

interface Props {
  onOpenItem: (item: Item) => void;
}

/** Blank course form state. */
function emptyCourseForm(termId: string) {
  return { termId, code: '', title: '', instructor: '', colorIndex: 0 };
}

function emptyMeetingForm() {
  return { kind: 'lecture' as MeetingKind, weekday: 1, startTime: '10:00', endTime: '11:30', location: '' };
}

export function CoursesView({ onOpenItem }: Props) {
  const { data, activeCourses, dispatch } = useStore();
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [courseForm, setCourseForm] = useState(() => emptyCourseForm(data.activeTermId ?? ''));
  const [meetingFormFor, setMeetingFormFor] = useState<string | null>(null);
  const [meetingForm, setMeetingForm] = useState(emptyMeetingForm);
  const [showTermForm, setShowTermForm] = useState(false);
  /** Course awaiting delete confirmation, or null. */
  const [pendingDelete, setPendingDelete] = useState<Course | null>(null);
  /** Course being edited, or null when the form is creating a new one. */
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  /** Meeting being edited, or null when the meeting form is creating one. */
  const [editingMeetingId, setEditingMeetingId] = useState<string | null>(null);
  const [showBreakForm, setShowBreakForm] = useState(false);
  const [editingBreakId, setEditingBreakId] = useState<string | null>(null);
  const [breakForm, setBreakForm] = useState(() => ({
    name: 'Reading week',
    startDate: toDateKey(new Date()),
    endDate: toDateKey(new Date()),
  }));
  const [termForm, setTermForm] = useState(() => ({
    name: '',
    startDate: toDateKey(new Date()),
    endDate: toDateKey(addMonths(new Date(), 4)),
  }));

  const itemsByCourse = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of data.items) {
      const bucket = map.get(item.courseId);
      if (bucket) bucket.push(item);
      else map.set(item.courseId, [item]);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => parseISO(a.dueAt).getTime() - parseISO(b.dueAt).getTime());
    }
    return map;
  }, [data.items]);

  const meetingsByCourse = useMemo(() => {
    const map = new Map<string, CourseMeeting[]>();
    for (const meeting of data.meetings) {
      const bucket = map.get(meeting.courseId);
      if (bucket) bucket.push(meeting);
      else map.set(meeting.courseId, [meeting]);
    }
    // Chronological within the week: by weekday, then start time.
    for (const bucket of map.values()) {
      bucket.sort(
        (a, b) =>
          a.weekday - b.weekday ||
          (timeToMinutes(a.startTime) ?? 0) - (timeToMinutes(b.startTime) ?? 0),
      );
    }
    return map;
  }, [data.meetings]);

  const activeTerm = data.terms.find((term) => term.id === data.activeTermId);
  const normalizedCourseCode = courseForm.code.trim().toLocaleUpperCase();
  const duplicateCourseCode = isCodeTaken(
    activeCourses,
    courseForm.code,
    editingCourseId ?? undefined,
  );
  /** The title identifies a course; the code is an optional shorthand. */
  const courseFormValid =
    courseForm.title.trim().length > 0 && Boolean(courseForm.termId) && !duplicateCourseCode;
  const termBreaks = breaksForTerm(data.breaks, data.activeTermId);
  const breakDatesValid = Boolean(
    breakForm.startDate && breakForm.endDate && breakForm.endDate >= breakForm.startDate,
  );
  const breakOverlaps =
    data.activeTermId !== null &&
    breakDatesValid &&
    overlapsExistingBreak(
      data.breaks,
      data.activeTermId,
      breakForm.startDate,
      breakForm.endDate,
      editingBreakId ?? undefined,
    );
  const breakFormValid =
    breakForm.name.trim().length > 0 && breakDatesValid && !breakOverlaps && Boolean(data.activeTermId);

  const termDatesValid = Boolean(
    termForm.startDate && termForm.endDate && termForm.endDate >= termForm.startDate,
  );

  function saveCourse() {
    if (!courseFormValid) return;

    if (editingCourseId) {
      // Clearing the code field removes it rather than storing "".
      dispatch({
        type: 'updateCourse',
        id: editingCourseId,
        patch: {
          title: courseForm.title.trim(),
          code: normalizedCourseCode || undefined,
          colorIndex: courseForm.colorIndex,
          instructor: courseForm.instructor.trim() || undefined,
        },
      });
      setEditingCourseId(null);
      setCourseForm(emptyCourseForm(data.activeTermId ?? ''));
      setShowCourseForm(false);
      return;
    }

    dispatch({
      type: 'addCourse',
      course: {
        termId: courseForm.termId,
        title: courseForm.title.trim(),
        // Omitted entirely when blank, rather than stored as an empty string.
        ...(normalizedCourseCode ? { code: normalizedCourseCode } : {}),
        colorIndex: courseForm.colorIndex,
        ...(courseForm.instructor.trim() ? { instructor: courseForm.instructor.trim() } : {}),
      },
    });
    setCourseForm(emptyCourseForm(data.activeTermId ?? ''));
    setShowCourseForm(false);
  }

  /** Opens the shared course form prefilled with an existing course. */
  function beginEditCourse(course: Course) {
    setEditingCourseId(course.id);
    setCourseForm({
      termId: course.termId,
      code: course.code ?? '',
      title: course.title,
      instructor: course.instructor ?? '',
      colorIndex: course.colorIndex,
    });
    setShowCourseForm(true);
  }

  function cancelCourseForm() {
    setEditingCourseId(null);
    setCourseForm(emptyCourseForm(data.activeTermId ?? ''));
    setShowCourseForm(false);
  }

  function saveMeeting(courseId: string) {
    const start = timeToMinutes(meetingForm.startTime);
    const end = timeToMinutes(meetingForm.endTime);
    if (start === null || end === null || end <= start) return;

    if (editingMeetingId) {
      dispatch({
        type: 'updateMeeting',
        id: editingMeetingId,
        patch: {
          kind: meetingForm.kind,
          weekday: meetingForm.weekday,
          startTime: meetingForm.startTime,
          endTime: meetingForm.endTime,
          location: meetingForm.location.trim() || undefined,
        },
      });
      setEditingMeetingId(null);
      setMeetingForm(emptyMeetingForm());
      setMeetingFormFor(null);
      return;
    }

    dispatch({
      type: 'addMeeting',
      meeting: {
        courseId,
        kind: meetingForm.kind,
        weekday: meetingForm.weekday,
        startTime: meetingForm.startTime,
        endTime: meetingForm.endTime,
        ...(meetingForm.location.trim() ? { location: meetingForm.location.trim() } : {}),
      },
    });
    setMeetingForm(emptyMeetingForm());
    setMeetingFormFor(null);
  }

  function saveBreak() {
    if (!breakFormValid || !data.activeTermId) return;
    const values = {
      termId: data.activeTermId,
      name: breakForm.name.trim(),
      startDate: breakForm.startDate,
      endDate: breakForm.endDate,
    };

    if (editingBreakId) {
      dispatch({ type: 'updateBreak', id: editingBreakId, patch: values });
    } else {
      dispatch({ type: 'addBreak', entry: values });
    }
    closeBreakForm();
  }

  function closeBreakForm() {
    setEditingBreakId(null);
    setShowBreakForm(false);
    setBreakForm({
      name: 'Reading week',
      startDate: toDateKey(new Date()),
      endDate: toDateKey(new Date()),
    });
  }

  function saveTerm() {
    if (!termForm.name.trim() || !termDatesValid) return;
    dispatch({
      type: 'addTerm',
      term: {
        name: termForm.name.trim(),
        startDate: termForm.startDate,
        endDate: termForm.endDate,
        archived: false,
      },
    });
    setTermForm({ name: '', startDate: toDateKey(new Date()), endDate: toDateKey(addMonths(new Date(), 4)) });
    setShowTermForm(false);
  }

  return (
    <div className="view-stack" data-tour="courses-view">
      <div className="view-header">
        <h1 className="view-title">Courses</h1>
        <span className="view-subtitle">
          {activeTerm
            ? `${activeTerm.name} · ${format(parseISO(activeTerm.startDate), 'MMM d')} – ${format(
                parseISO(activeTerm.endDate),
                'MMM d, yyyy',
              )}`
            : 'No term selected'}
        </span>
        <div className="spacer" />
        <button className="ghost with-icon" onClick={() => setShowTermForm((open) => !open)}>
          <Add size={ICON_INLINE} />
          Term
        </button>
        <button
          className="ghost with-icon"
          onClick={() => {
            closeBreakForm();
            setShowBreakForm(true);
          }}
          disabled={!data.activeTermId}
          title="Add a reading week, study break or holiday"
        >
          <Break size={ICON_INLINE} />
          Reading week
        </button>
        <button
          className="primary with-icon"
          onClick={() => {
            setCourseForm(emptyCourseForm(data.activeTermId ?? ''));
            setShowCourseForm((open) => !open);
          }}
          disabled={!data.activeTermId}
        >
          <Add size={ICON_INLINE} />
          Course
        </button>
      </div>

      {showTermForm && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="field-row thirds">
            <div className="field">
              <label className="field-label">Term name</label>
              <input
                autoFocus
                placeholder="Spring 2027"
                value={termForm.name}
                onChange={(event) => setTermForm({ ...termForm, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label className="field-label">Starts</label>
              <input
                type="date"
                value={termForm.startDate}
                onChange={(event) => setTermForm({ ...termForm, startDate: event.target.value })}
              />
            </div>
            <div className="field">
              <label className="field-label">Ends</label>
              <input
                type="date"
                min={termForm.startDate}
                value={termForm.endDate}
                onChange={(event) => setTermForm({ ...termForm, endDate: event.target.value })}
              />
            </div>
          </div>
          {!termDatesValid && termForm.endDate && (
            <div className="form-error">The term end date must be on or after its start date.</div>
          )}
          <div className="form-actions">
            <button className="primary" onClick={saveTerm} disabled={!termForm.name.trim() || !termDatesValid}>
              Add term
            </button>
            <button className="ghost" onClick={() => setShowTermForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {(showBreakForm || termBreaks.length > 0) && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="section-label" style={{ marginTop: 0 }}>
            Reading weeks &amp; breaks
            <span className="count">({termBreaks.length})</span>
            <div className="spacer" />
            {!showBreakForm && (
              <button
                className="ghost with-icon small"
                onClick={() => {
                  closeBreakForm();
                  setShowBreakForm(true);
                }}
                disabled={!data.activeTermId}
              >
                <Add size={12} />
                Add
              </button>
            )}
          </div>

          <div className="field-hint">
            Classes do not run during a break, so they are hidden from the Weekly Schedule
            and the dates are banded in the Term Calendar. Deadlines still show — work is
            often due during one.
          </div>

          {termBreaks.length > 0 && (
            <div className="break-list">
              {termBreaks.map((entry) => (
                <div key={entry.id} className="break-row">
                  <span className="break-name">{entry.name}</span>
                  <span className="break-dates">
                    {format(parseISO(entry.startDate), 'MMM d')} –{' '}
                    {format(parseISO(entry.endDate), 'MMM d')}
                  </span>
                  <span className="break-length">
                    {breakLengthDays(entry)} day{breakLengthDays(entry) === 1 ? '' : 's'}
                  </span>
                  <div className="spacer" />
                  <button
                    className="ghost with-icon small"
                    onClick={() => {
                      setEditingBreakId(entry.id);
                      setBreakForm({
                        name: entry.name,
                        startDate: entry.startDate,
                        endDate: entry.endDate,
                      });
                      setShowBreakForm(true);
                    }}
                  >
                    <Edit size={11} />
                    Edit
                  </button>
                  <button
                    className="ghost icon-only"
                    onClick={() => dispatch({ type: 'deleteBreak', id: entry.id })}
                    aria-label={`Remove ${entry.name}`}
                  >
                    <Close size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showBreakForm && (
            <div className="subcard">
              <div className="field-row thirds">
                <div className="field">
                  <label className="field-label" htmlFor="break-name">
                    Name
                  </label>
                  <input
                    id="break-name"
                    autoFocus
                    placeholder="Reading week"
                    value={breakForm.name}
                    onChange={(event) => setBreakForm({ ...breakForm, name: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="break-start">
                    Starts
                  </label>
                  <input
                    id="break-start"
                    type="date"
                    value={breakForm.startDate}
                    onChange={(event) =>
                      setBreakForm({ ...breakForm, startDate: event.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="break-end">
                    Ends
                  </label>
                  <input
                    id="break-end"
                    type="date"
                    min={breakForm.startDate}
                    value={breakForm.endDate}
                    onChange={(event) =>
                      setBreakForm({ ...breakForm, endDate: event.target.value })
                    }
                  />
                  <span className="field-hint">Inclusive — both days are part of the break.</span>
                </div>
              </div>

              {!breakDatesValid && breakForm.endDate && (
                <div className="form-error">The end date must be on or after the start date.</div>
              )}
              {breakOverlaps && (
                <div className="form-error">That range overlaps a break you already have.</div>
              )}

              <div className="form-actions">
                <button className="primary" onClick={saveBreak} disabled={!breakFormValid}>
                  {editingBreakId ? 'Save changes' : 'Add break'}
                </button>
                <button className="ghost" onClick={closeBreakForm}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showCourseForm && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="field-row thirds">
            <div className="field">
              <label className="field-label">Course title</label>
              <input
                autoFocus
                placeholder="Modern Literature"
                value={courseForm.title}
                onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })}
              />
            </div>
            <div className="field">
              <label className="field-label">
                Course code <span className="optional-label">optional</span>
              </label>
              <input
                placeholder="ENG210"
                value={courseForm.code}
                onChange={(event) => setCourseForm({ ...courseForm, code: event.target.value.toLocaleUpperCase() })}
              />
              <span className="field-hint">A shorthand for quick add. Leave blank to use the title.</span>
              {duplicateCourseCode && <span className="form-error">That code is already used in this term.</span>}
            </div>
            <div className="field">
              <label className="field-label">Instructor</label>
              <input
                placeholder="Optional"
                value={courseForm.instructor}
                onChange={(event) =>
                  setCourseForm({ ...courseForm, instructor: event.target.value })
                }
              />
            </div>
          </div>

          <div className="field" style={{ marginTop: 10 }}>
            <span className="field-label">Accent color</span>
            <div className="color-swatches">
              {Array.from({ length: 8 }, (_, index) => (
                <button
                  key={index}
                  className={`swatch${courseForm.colorIndex === index ? ' selected' : ''}`}
                  style={{ background: courseColorVar(index) }}
                  onClick={() => setCourseForm({ ...courseForm, colorIndex: index })}
                  aria-label={`Accent color ${index + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="form-actions">
            <button className="primary" onClick={saveCourse} disabled={!courseFormValid}>
              {editingCourseId ? 'Save changes' : 'Add course'}
            </button>
            <button className="ghost" onClick={cancelCourseForm}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {activeCourses.length === 0 ? (
        <div className="empty">
          <NoCourses size={26} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">{activeTerm ? 'No courses in this term yet' : 'Start with a term'}</div>
          <div className="empty-text">
            {activeTerm
              ? 'Add a course and its code becomes usable in the quick-add bar.'
              : 'Terms keep each semester or session separate. Add one before creating courses.'}
          </div>
          <button
            className="primary with-icon"
            onClick={() => {
              if (!activeTerm) {
                setShowTermForm(true);
                return;
              }
              setCourseForm(emptyCourseForm(data.activeTermId ?? ''));
              setShowCourseForm(true);
            }}
          >
            <Add size={ICON_INLINE} />
            {activeTerm ? 'Add your first course' : 'Add your first term'}
          </button>
        </div>
      ) : (
        activeCourses.map((course) => (
          <CourseCard
            key={course.id}
            course={course}
            items={itemsByCourse.get(course.id) ?? []}
            meetings={meetingsByCourse.get(course.id) ?? []}
            meetingFormOpen={meetingFormFor === course.id}
            meetingForm={meetingForm}
            onMeetingFormChange={setMeetingForm}
            onToggleMeetingForm={() =>
              setMeetingFormFor((current) => (current === course.id ? null : course.id))
            }
            onSaveMeeting={() => saveMeeting(course.id)}
            onDeleteMeeting={(id) => dispatch({ type: 'deleteMeeting', id })}
            onRequestDelete={() => setPendingDelete(course)}
            onRequestEdit={() => beginEditCourse(course)}
            onRequestEditMeeting={(meeting) => {
              setEditingMeetingId(meeting.id);
              setMeetingForm({
                kind: meeting.kind,
                weekday: meeting.weekday,
                startTime: meeting.startTime,
                endTime: meeting.endTime,
                location: meeting.location ?? '',
              });
              setMeetingFormFor(course.id);
            }}
            editingMeetingId={editingMeetingId}
            onOpenItem={onOpenItem}
          />
        ))
      )}

      {pendingDelete && (
        <ConfirmDialog
          destructive
          title={`Delete ${courseLabel(pendingDelete)}?`}
          body={
            <>
              This removes <strong>{courseFullName(pendingDelete)}</strong>, its class
              times, and{' '}
              <strong>
                {(itemsByCourse.get(pendingDelete.id) ?? []).length} item
                {(itemsByCourse.get(pendingDelete.id) ?? []).length === 1 ? '' : 's'}
              </strong>{' '}
              of work, including any recorded grades. This cannot be undone.
            </>
          }
          confirmLabel="Delete course"
          onConfirm={() => dispatch({ type: 'deleteCourse', id: pendingDelete.id })}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

interface CourseCardProps {
  course: Course;
  items: Item[];
  meetings: CourseMeeting[];
  meetingFormOpen: boolean;
  meetingForm: ReturnType<typeof emptyMeetingForm>;
  onMeetingFormChange: (form: ReturnType<typeof emptyMeetingForm>) => void;
  onToggleMeetingForm: () => void;
  onSaveMeeting: () => void;
  onDeleteMeeting: (id: string) => void;
  onRequestDelete: () => void;
  onRequestEdit: () => void;
  onRequestEditMeeting: (meeting: CourseMeeting) => void;
  editingMeetingId: string | null;
  onOpenItem: (item: Item) => void;
}

function CourseCard({
  course,
  items,
  meetings,
  meetingFormOpen,
  meetingForm,
  onMeetingFormChange,
  onToggleMeetingForm,
  onSaveMeeting,
  onDeleteMeeting,
  onRequestDelete,
  onRequestEdit,
  onRequestEditMeeting,
  editingMeetingId,
  onOpenItem,
}: CourseCardProps) {
  const grade = computeCourseGrade(items);
  const color = courseColorVar(course.colorIndex);
  const gradedBarWidth = Math.min(grade.gradedWeight, 100);
  const pendingBarWidth = Math.min(
    Math.max(grade.totalWeight - grade.gradedWeight, 0),
    Math.max(100 - gradedBarWidth, 0),
  );

  return (
    <div className="course-card" style={{ ['--course-color' as string]: color }}>
      <div className="course-card-head">
        {course.code && <span className="course-code">{course.code}</span>}
        <span className="course-title">{course.title}</span>
        {course.instructor && <span className="course-instructor">{course.instructor}</span>}

        <div className="grade-readout">
          {grade.currentGrade === null ? (
            <span className="grade-caption">nothing graded yet</span>
          ) : (
            <>
              <span className="grade-value">{grade.currentGrade.toFixed(1)}%</span>
              <span className="grade-caption">
                on {grade.gradedWeight.toFixed(0)}% of the grade ({grade.gradedCount} item
                {grade.gradedCount === 1 ? '' : 's'})
              </span>
            </>
          )}
        </div>
      </div>

      {/* Filled portion = graded so far; faint portion = weighted but ungraded. */}
      {grade.totalWeight > 0 && (
        <div
          className="grade-bar"
          title={`${grade.gradedWeight.toFixed(0)}% graded of ${grade.totalWeight.toFixed(
            0,
          )}% accounted for`}
        >
          <div className="grade-bar-graded" style={{ width: `${gradedBarWidth}%` }} />
          <div
            className="grade-bar-pending"
            style={{ width: `${pendingBarWidth}%` }}
          />
        </div>
      )}
      {grade.totalWeight > 100 && (
        <div className="form-warning">Weighted work totals {grade.totalWeight.toFixed(0)}%. Check grade weights if that was not intentional.</div>
      )}

      <div className="section-label" style={{ marginTop: 12, marginBottom: 4 }}>
        Class times <span className="count">({meetings.length})</span>
        <div className="spacer" />
        <button
          className="ghost with-icon small"
          onClick={onToggleMeetingForm}
        >
          <Add size={12} />
          Add
        </button>
      </div>

      {meetings.length === 0 && !meetingFormOpen && (
        <div className="field-hint">No recurring meetings recorded.</div>
      )}

      <div className="meeting-list">
        {meetings.map((meeting) => {
          const start = timeToMinutes(meeting.startTime);
          const end = timeToMinutes(meeting.endTime);
          return (
            <div key={meeting.id} className="meeting-row">
              <span className="meeting-day">{WEEKDAY_LABELS[meeting.weekday]}</span>
              <span className="meeting-time">
                {start !== null ? minutesToTimeLabel(start) : meeting.startTime} –{' '}
                {end !== null ? minutesToTimeLabel(end) : meeting.endTime}
              </span>
              <span className="meeting-kind">{meeting.kind}</span>
              {meeting.location && <span className="meeting-location">{meeting.location}</span>}
              <button
                className="ghost with-icon small"
                onClick={() => onRequestEditMeeting(meeting)}
                aria-label={`Edit ${meeting.kind} on ${WEEKDAY_LABELS[meeting.weekday]}`}
              >
                <Edit size={11} />
                Edit
              </button>
              <button
                className="ghost icon-only"
                onClick={() => onDeleteMeeting(meeting.id)}
                aria-label="Remove meeting"
              >
                <Close size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {meetingFormOpen && (
        <div className="subcard">
          <div className="field-row thirds">
            <div className="field">
              <label className="field-label">Day</label>
              <select
                value={meetingForm.weekday}
                onChange={(event) =>
                  onMeetingFormChange({ ...meetingForm, weekday: Number(event.target.value) })
                }
              >
                {WEEKDAY_LABELS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Start</label>
              <input
                type="time"
                value={meetingForm.startTime}
                onChange={(event) =>
                  onMeetingFormChange({ ...meetingForm, startTime: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label className="field-label">End</label>
              <input
                type="time"
                value={meetingForm.endTime}
                onChange={(event) =>
                  onMeetingFormChange({ ...meetingForm, endTime: event.target.value })
                }
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field-label">Kind</label>
              <select
                value={meetingForm.kind}
                onChange={(event) =>
                  onMeetingFormChange({ ...meetingForm, kind: event.target.value as MeetingKind })
                }
              >
                {MEETING_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Location</label>
              <input
                placeholder="Turing 204"
                value={meetingForm.location}
                onChange={(event) =>
                  onMeetingFormChange({ ...meetingForm, location: event.target.value })
                }
              />
            </div>
          </div>

          {(() => {
            const start = timeToMinutes(meetingForm.startTime);
            const end = timeToMinutes(meetingForm.endTime);
            const valid = start !== null && end !== null && end > start;
            return (
              <>
                {!valid && <div className="form-error">End time must be after start time.</div>}
                <div className="form-actions">
                  <button className="primary" onClick={onSaveMeeting} disabled={!valid}>
                    {editingMeetingId ? 'Save changes' : 'Add meeting'}
                  </button>
                  <button className="ghost" onClick={onToggleMeetingForm}>
                    Cancel
                  </button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      <div className="section-label" style={{ marginTop: 12, marginBottom: 4 }}>
        Work <span className="count">({items.length})</span>
        <div className="spacer" />
        <button className="ghost with-icon small" onClick={onRequestEdit}>
          <Edit size={12} />
          Edit course
        </button>
        <button className="danger with-icon small" onClick={onRequestDelete}>
          <Delete size={12} />
          Delete course
        </button>
      </div>

      {items.length === 0 ? (
        <div className="field-hint">Nothing added for this course yet.</div>
      ) : (
        <div className="course-item-list">
          {items.map((item) => (
            <div
              key={item.id}
              className="course-item-row"
              onClick={() => onOpenItem(item)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onOpenItem(item);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <span className="course-item-title" style={{ opacity: item.done ? 0.5 : 1 }}>
                {item.done ? (
                  <ItemDone size={12} className="course-item-state is-done" />
                ) : (
                  <ItemPending size={12} className="course-item-state" />
                )}
                {item.title}
              </span>
              <span className="pill type">{item.type}</span>
              <div className="spacer" />
              {typeof item.gradeWeight === 'number' && (
                <span className="weight-tag">{item.gradeWeight}%</span>
              )}
              {typeof item.earnedScore === 'number' && (
                <span className="weight-tag" style={{ color: 'var(--ok)' }}>
                  scored {item.earnedScore}%
                </span>
              )}
              <span className="meeting-location">
                {format(parseISO(item.dueAt), item.allDay ? 'MMM d' : 'MMM d, h:mm a')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
