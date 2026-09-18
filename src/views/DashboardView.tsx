import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { Item } from '../types';
import { useStore } from '../store/StoreContext';
import { buildDashboard, daysRemainingLabel, type DashboardEntry } from '../lib/dashboard';
import { buildPriorityList, urgencyLevel } from '../lib/priority';
import { formatDue } from '../lib/dates';
import { breaksForTerm } from '../lib/breaks';
import { courseLabel } from '../lib/courses';
import { courseColorVar } from '../components/CourseBadge';
import { ItemRow } from '../components/ItemRow';
import { MiniCalendar } from '../components/MiniCalendar';
import { WorkloadChart } from '../components/WorkloadChart';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { playCompletionSound } from '../lib/sound';
import {
  Add,
  AlertTriangle,
  DueToday,
  ICON_INLINE,
  NothingDue,
} from '../components/Icon';

interface Props {
  now: Date;
  onOpenItem: (item: Item) => void;
  onNewItem: () => void;
  /** Jump to the Term Calendar from the mini view. */
  onOpenCalendar: () => void;
}

/**
 * One card per upcoming item, showing the three things that decide whether to
 * start it now: how much of the grade rides on it, when it is due, and how
 * many days are left.
 */
function UpcomingCard({
  entry,
  now,
  onOpen,
}: {
  entry: DashboardEntry;
  now: Date;
  onOpen: (item: Item) => void;
}) {
  const { courseById } = useStore();
  const course = courseById(entry.item.courseId);
  const level = urgencyLevel(entry.item, now);

  return (
    <button
      type="button"
      className={`upcoming-card urgency-${level}`}
      style={{
        ['--course-color' as string]: course ? courseColorVar(course.colorIndex) : undefined,
      }}
      onDoubleClick={() => onOpen(entry.item)}
      title={`${courseLabel(course)} · ${entry.item.title} — double-click to edit`}
    >
      <span className="upcoming-course">{courseLabel(course)}</span>
      <span className="upcoming-title">{entry.item.title}</span>

      <span className="upcoming-meta">
        <span className="upcoming-weight" title={
          entry.weightIsEstimated
            ? `Estimated from the item type — set a grade weight to be exact`
            : 'Percent of your final grade'
        }>
          {entry.weightPercent.toFixed(0)}%
          {entry.weightIsEstimated && <span className="est-marker">est</span>}
        </span>
        <span className="upcoming-date">
          {format(parseISO(entry.item.dueAt), entry.item.allDay ? 'EEE MMM d' : 'EEE MMM d, h:mm a')}
        </span>
        <span className="upcoming-days">{daysRemainingLabel(entry.daysRemaining)}</span>
      </span>
    </button>
  );
}

function ShortList({
  title,
  entries,
  emptyText,
  now,
  onOpen,
}: {
  title: string;
  entries: DashboardEntry[];
  emptyText: string;
  now: Date;
  onOpen: (item: Item) => void;
}) {
  return (
    <div className="card dash-card">
      <div className="section-label" style={{ marginTop: 0 }}>
        {title} <span className="count">({entries.length})</span>
      </div>

      {entries.length === 0 ? (
        <div className="dash-empty">{emptyText}</div>
      ) : (
        <div className="upcoming-list">
          {entries.map((entry) => (
            <UpcomingCard key={entry.item.id} entry={entry} now={now} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The landing view: what is coming, split into work you hand in and
 * assessments you sit, with a month at a glance and the full ranked list below.
 */
export function DashboardView({ now, onOpenItem, onNewItem, onOpenCalendar }: Props) {
  const { data, activeItems, courseById, dispatch } = useStore();
  const { settings } = data;

  const { coursework, assessments, overdue } = useMemo(
    () => buildDashboard(activeItems, settings, now),
    [activeItems, settings, now],
  );

  const { upcoming } = useMemo(
    () => buildPriorityList(activeItems, settings, now),
    [activeItems, settings, now],
  );

  const termBreaks = useMemo(
    () => breaksForTerm(data.breaks, data.activeTermId),
    [data.breaks, data.activeTermId],
  );

  const dueToday = useMemo(
    () => coursework.concat(assessments).filter((entry) => entry.daysRemaining === 0).length,
    [coursework, assessments],
  );

  const [pendingComplete, setPendingComplete] = useState<Item | null>(null);

  /** Marking complete asks first; un-checking is immediate. */
  const toggle = (id: string) => {
    const item = activeItems.find((candidate) => candidate.id === id);
    if (item && !item.done) {
      setPendingComplete(item);
      return;
    }
    dispatch({ type: 'toggleItemDone', id });
  };

  const bannerParts: string[] = [];
  if (overdue.length > 0) bannerParts.push(`${overdue.length} overdue`);
  if (dueToday > 0) bannerParts.push(`${dueToday} due today`);

  const nothingAtAll =
    overdue.length === 0 && coursework.length === 0 && assessments.length === 0;

  return (
    <div className="view-stack" data-tour="priority-view">
      <div className="view-header">
        <h1 className="view-title">Dashboard</h1>
        <span className="view-subtitle">
          {upcoming.length} item{upcoming.length === 1 ? '' : 's'} in the next{' '}
          {settings.horizonWeeks} weeks
        </span>
        <div className="spacer" />
        <button className="primary with-icon" onClick={onNewItem}>
          <Add size={ICON_INLINE} />
          New item
        </button>
      </div>

      {bannerParts.length > 0 && (
        <div className={`today-banner${overdue.length > 0 ? ' has-overdue' : ''}`}>
          {overdue.length > 0 ? <AlertTriangle size={15} /> : <DueToday size={15} />}
          <span>
            <strong>{bannerParts.join(' · ')}</strong>
          </span>
        </div>
      )}

      {nothingAtAll ? (
        <div className="empty">
          <NothingDue size={26} strokeWidth={1.5} className="empty-icon" />
          <div className="empty-title">Nothing due yet</div>
          <div className="empty-text">
            Add your coursework and CourseCal will rank it by what actually matters.
          </div>
          <button className="primary with-icon" onClick={onNewItem}>
            <Add size={ICON_INLINE} />
            New item
          </button>
        </div>
      ) : (
        <>
          <div className="dash-grid">
            <ShortList
              title="Next assignments &amp; projects"
              entries={coursework}
              emptyText="Nothing to hand in soon."
              now={now}
              onOpen={onOpenItem}
            />
            <ShortList
              title="Next quizzes &amp; exams"
              entries={assessments}
              emptyText="No assessments scheduled."
              now={now}
              onOpen={onOpenItem}
            />
            <MiniCalendar
              now={now}
              items={activeItems}
              breaks={termBreaks}
              onOpenCalendar={onOpenCalendar}
            />
          </div>

          {overdue.length > 0 && (
            <>
              <div className="section-label">
                Overdue <span className="count">({overdue.length})</span>
              </div>
              <div className="item-list">
                {overdue.map((entry) => (
                  <ItemRow
                    key={entry.item.id}
                    item={entry.item}
                    course={courseById(entry.item.courseId)}
                    now={now}
                    breakdown={entry.breakdown}
                    onToggle={toggle}
                    onOpen={onOpenItem}
                  />
                ))}
              </div>
            </>
          )}

          <div className="section-label">
            Everything ranked <span className="count">({upcoming.length})</span>
          </div>
          {upcoming.length === 0 ? (
            <div className="dash-empty">Nothing else in the horizon.</div>
          ) : (
            <div className="item-list">
              {upcoming.map((entry, index) => (
                <ItemRow
                  key={entry.item.id}
                  item={entry.item}
                  course={courseById(entry.item.courseId)}
                  now={now}
                  breakdown={entry.breakdown}
                  rank={index + 1}
                  onToggle={toggle}
                  onOpen={onOpenItem}
                />
              ))}
            </div>
          )}

          <div className="section-label">Workload ahead</div>
          <WorkloadChart items={activeItems} now={now} weeks={settings.horizonWeeks} />
        </>
      )}

      {pendingComplete && (
        <ConfirmDialog
          focusConfirm
          title="Mark as complete?"
          body={
            <>
              <p>
                Mark <strong>{pendingComplete.title}</strong>
                {courseById(pendingComplete.courseId)
                  ? ` (${courseLabel(courseById(pendingComplete.courseId))})`
                  : ''}{' '}
                as done?
              </p>
              <p>{formatDue(pendingComplete.dueAt, pendingComplete.allDay, now)}</p>
              <p className="field-hint">
                It will drop out of the list. You can un-check it at any time.
              </p>
            </>
          }
          confirmLabel="Mark complete"
          cancelLabel="Not yet"
          onConfirm={() => {
            dispatch({ type: 'toggleItemDone', id: pendingComplete.id });
            if (settings.soundEnabled !== false) playCompletionSound();
          }}
          onClose={() => setPendingComplete(null)}
        />
      )}
    </div>
  );
}
