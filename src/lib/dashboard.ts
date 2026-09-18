import { differenceInCalendarDays, parseISO, startOfDay } from 'date-fns';
import type { Item, ItemType, Settings } from '../types';
import { gradeImpactComponent, scoreItem, type ScoreBreakdown } from './priority';

/**
 * The dashboard's two shortlists.
 *
 * Coursework splits into two kinds that compete for different time: things you
 * produce over days or weeks (assignments, projects, essays, readings) and
 * things you sit down and are tested on (exams, quizzes). Ranking them in one
 * list buries whichever kind is currently less urgent, so they get separate
 * top-fives.
 */

/** Item types that are assessments you sit, rather than work you hand in. */
const ASSESSMENT_TYPES: ReadonlySet<ItemType> = new Set<ItemType>(['exam', 'quiz']);

export function isAssessment(item: Item): boolean {
  return ASSESSMENT_TYPES.has(item.type);
}

export interface DashboardEntry {
  item: Item;
  breakdown: ScoreBreakdown;
  /** Whole calendar days from today; negative when overdue. */
  daysRemaining: number;
  /** Percent of the final grade at stake, 0-100. */
  weightPercent: number;
  /** True when the weight is inferred from the item type rather than entered. */
  weightIsEstimated: boolean;
}

function toEntry(item: Item, settings: Settings, now: Date): DashboardEntry {
  return {
    item,
    breakdown: scoreItem(item, settings, now),
    daysRemaining: differenceInCalendarDays(parseISO(item.dueAt), startOfDay(now)),
    weightPercent: gradeImpactComponent(item) * 100,
    weightIsEstimated: typeof item.gradeWeight !== 'number',
  };
}

export interface DashboardLists {
  /** Assignments, projects, readings and other deliverables. */
  coursework: DashboardEntry[];
  /** Exams and quizzes. */
  assessments: DashboardEntry[];
  /** Everything unfinished and past due, oldest first. */
  overdue: DashboardEntry[];
}

/**
 * Builds the dashboard shortlists.
 *
 * Both lists are ranked by the same priority score the full list uses, so the
 * dashboard never disagrees with the detailed view about what matters. Overdue
 * work is pulled out separately rather than being allowed to occupy the
 * shortlists, which are about what is *coming*.
 */
export function buildDashboard(
  items: Item[],
  settings: Settings,
  now: Date,
  limit = 5,
): DashboardLists {
  const coursework: DashboardEntry[] = [];
  const assessments: DashboardEntry[] = [];
  const overdue: DashboardEntry[] = [];

  for (const item of items) {
    if (item.done) continue;
    const entry = toEntry(item, settings, now);

    if (entry.breakdown.overdue) {
      overdue.push(entry);
      continue;
    }
    (isAssessment(item) ? assessments : coursework).push(entry);
  }

  const byScore = (a: DashboardEntry, b: DashboardEntry) => {
    const diff = b.breakdown.score - a.breakdown.score;
    if (Math.abs(diff) > 1e-9) return diff;
    // Ties break to the nearer deadline, matching the full priority list.
    return parseISO(a.item.dueAt).getTime() - parseISO(b.item.dueAt).getTime();
  };

  coursework.sort(byScore);
  assessments.sort(byScore);
  overdue.sort(
    (a, b) => parseISO(a.item.dueAt).getTime() - parseISO(b.item.dueAt).getTime(),
  );

  return {
    coursework: coursework.slice(0, limit),
    assessments: assessments.slice(0, limit),
    overdue,
  };
}

/** "3 days left", "due today", "2 days overdue" — the phrasing the cards use. */
export function daysRemainingLabel(daysRemaining: number): string {
  if (daysRemaining === 0) return 'due today';
  if (daysRemaining === 1) return '1 day left';
  if (daysRemaining > 1) return `${daysRemaining} days left`;
  const late = Math.abs(daysRemaining);
  return late === 1 ? '1 day overdue' : `${late} days overdue`;
}
