import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { Course, Importance, Item, ItemType } from '../types';
import { ITEM_TYPES } from '../types';
import { combineDateAndTime, toDateKey } from '../lib/dates';
import { courseFullName } from '../lib/courses';
import { Close, Delete, ICON_INLINE } from './Icon';

/** Everything the modal needs to open, whether creating or editing. */
export interface ItemDraft {
  id?: string;
  courseId: string;
  title: string;
  type: ItemType;
  dateKey: string;
  /** "HH:mm", or empty for an all-day item. */
  time: string;
  importance: Importance;
  gradeWeight: string;
  earnedScore: string;
  estimatedHours: string;
  notes: string;
}

export function draftFromItem(item: Item): ItemDraft {
  const due = parseISO(item.dueAt);
  return {
    id: item.id,
    courseId: item.courseId,
    title: item.title,
    type: item.type,
    dateKey: format(due, 'yyyy-MM-dd'),
    time: item.allDay ? '' : format(due, 'HH:mm'),
    importance: item.importance,
    gradeWeight: item.gradeWeight?.toString() ?? '',
    earnedScore: item.earnedScore?.toString() ?? '',
    estimatedHours: item.estimatedHours?.toString() ?? '',
    notes: item.notes ?? '',
  };
}

export function emptyDraft(courseId: string, date = new Date()): ItemDraft {
  return {
    courseId,
    title: '',
    type: 'assignment',
    dateKey: toDateKey(date),
    time: '',
    importance: 2,
    gradeWeight: '',
    earnedScore: '',
    estimatedHours: '',
    notes: '',
  };
}

/** Empty or malformed numeric fields become `undefined`, never NaN. */
function optionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

const IMPORTANCE_LABELS: Record<Importance, string> = { 1: 'Low', 2: 'Normal', 3: 'High' };

interface Props {
  draft: ItemDraft;
  courses: Course[];
  onSave: (values: Omit<Item, 'id'>, id?: string) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function ItemModal({ draft: initial, courses, onSave, onDelete, onClose }: Props) {
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const isEdit = Boolean(initial.id);

  // Reopening for a different item must reset the form, not keep stale values.
  useEffect(() => {
    setDraft(initial);
    setDeleteArmed(false);
  }, [initial]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const gradeWeight = optionalNumber(draft.gradeWeight);
  const earnedScore = optionalNumber(draft.earnedScore);
  const estimatedHours = optionalNumber(draft.estimatedHours);
  const gradeWeightValid = draft.gradeWeight.trim() === '' || (gradeWeight !== undefined && gradeWeight >= 0 && gradeWeight <= 100);
  const earnedScoreValid = draft.earnedScore.trim() === '' || (earnedScore !== undefined && earnedScore >= 0 && earnedScore <= 100);
  const estimatedHoursValid = draft.estimatedHours.trim() === '' || (estimatedHours !== undefined && estimatedHours >= 0);
  const canSave =
    draft.title.trim().length > 0 &&
    draft.courseId !== '' &&
    draft.dateKey !== '' &&
    gradeWeightValid &&
    earnedScoreValid &&
    estimatedHoursValid;

  function handleSubmit() {
    if (!canSave) return;
    const allDay = draft.time.trim() === '';

    const values: Omit<Item, 'id'> = {
      courseId: draft.courseId,
      title: draft.title.trim(),
      type: draft.type,
      dueAt: combineDateAndTime(draft.dateKey, allDay ? null : draft.time),
      allDay,
      importance: draft.importance,
      done: false,
      ...(gradeWeight !== undefined ? { gradeWeight } : {}),
      ...(earnedScore !== undefined ? { earnedScore } : {}),
      ...(estimatedHours !== undefined ? { estimatedHours } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    };

    onSave(values, initial.id);
    onClose();
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit item' : 'New item'}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? 'Edit item' : 'New item'}</h2>
          <div className="spacer" />
          <button className="ghost icon-only" onClick={onClose} aria-label="Close">
            <Close size={ICON_INLINE + 1} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label" htmlFor="item-title">
              Title
            </label>
            <input
              id="item-title"
              autoFocus
              value={draft.title}
              placeholder="Problem set 4"
              onChange={(event) => set('title', event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSubmit();
              }}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="item-course">
                Course
              </label>
              <select
                id="item-course"
                value={draft.courseId}
                onChange={(event) => set('courseId', event.target.value)}
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {courseFullName(course)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="item-type">
                Type
              </label>
              <select
                id="item-type"
                value={draft.type}
                onChange={(event) => set('type', event.target.value as ItemType)}
              >
                {ITEM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="item-date">
                Due date
              </label>
              <input
                id="item-date"
                type="date"
                value={draft.dateKey}
                onChange={(event) => set('dateKey', event.target.value)}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="item-time">
                Due time
              </label>
              <input
                id="item-time"
                type="time"
                value={draft.time}
                onChange={(event) => set('time', event.target.value)}
              />
              <span className="field-hint">Leave blank for an all-day item.</span>
            </div>
          </div>

          <div className="field">
            <span className="field-label">Importance</span>
            <div className="segmented">
              {([1, 2, 3] as Importance[]).map((level) => (
                <button
                  key={level}
                  className={draft.importance === level ? 'active' : ''}
                  onClick={() => set('importance', level)}
                >
                  {IMPORTANCE_LABELS[level]}
                </button>
              ))}
            </div>
          </div>

          <div className="field-row thirds">
            <div className="field">
              <label className="field-label" htmlFor="item-weight">
                Grade weight
              </label>
              <input
                id="item-weight"
                type="number"
                min={0}
                max={100}
                placeholder="%"
                value={draft.gradeWeight}
                aria-invalid={!gradeWeightValid}
                onChange={(event) => set('gradeWeight', event.target.value)}
              />
              {!gradeWeightValid && <span className="form-error">Use a percentage from 0 to 100.</span>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="item-score">
                Score earned
              </label>
              <input
                id="item-score"
                type="number"
                min={0}
                max={100}
                placeholder="%"
                value={draft.earnedScore}
                aria-invalid={!earnedScoreValid}
                onChange={(event) => set('earnedScore', event.target.value)}
              />
              {!earnedScoreValid && <span className="form-error">Use a percentage from 0 to 100.</span>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="item-hours">
                Est. hours
              </label>
              <input
                id="item-hours"
                type="number"
                min={0}
                step={0.5}
                placeholder="hrs"
                value={draft.estimatedHours}
                aria-invalid={!estimatedHoursValid}
                onChange={(event) => set('estimatedHours', event.target.value)}
              />
              {!estimatedHoursValid && <span className="form-error">Estimated hours cannot be negative.</span>}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="item-notes">
              Notes
            </label>
            <textarea
              id="item-notes"
              value={draft.notes}
              placeholder="Anything worth remembering."
              onChange={(event) => set('notes', event.target.value)}
            />
          </div>
        </div>

        <div className="modal-footer">
          {isEdit && onDelete && (
            <button
              className={`danger with-icon${deleteArmed ? ' armed' : ''}`}
              onClick={() => {
                if (!deleteArmed) {
                  setDeleteArmed(true);
                  return;
                }
                onDelete(initial.id as string);
                onClose();
              }}
              onBlur={() => setDeleteArmed(false)}
            >
              <Delete size={ICON_INLINE} />
              {deleteArmed ? 'Click again to delete' : 'Delete'}
            </button>
          )}
          <div className="spacer" />
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" onClick={handleSubmit} disabled={!canSave}>
            {isEdit ? 'Save' : 'Add item'}
          </button>
        </div>
      </div>
    </div>
  );
}
