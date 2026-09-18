import type { Item, ItemType, PriorityWeights, Settings } from '../types';
import { calendarDaysUntil, daysUntil, horizonEnd, isOverdue } from './dates';
import { parseISO } from 'date-fns';

/**
 * Assumed share of the final grade when an item has no explicit weight yet, so
 * a freshly-added exam still outranks a freshly-added reading.
 */
const TYPE_WEIGHT_FALLBACK: Record<ItemType, number> = {
  exam: 0.5,
  project: 0.35,
  assignment: 0.2,
  quiz: 0.1,
  reading: 0.05,
  other: 0.1,
};

/**
 * Days out at which urgency reaches half its at-deadline value.
 *
 * Tuned against the 4-week horizon. At 3 days the curve was so steep that
 * anything beyond a week scored near nothing, which collapsed the list into
 * plain nearest-deadline-first and defeated the point of scoring at all. At 7
 * days a deadline a week out still carries real weight, so grade impact can
 * win when it deserves to.
 */
const URGENCY_HALF_LIFE_DAYS = 7;

export interface ScoreBreakdown {
  /** Final 0-100 score. */
  score: number;
  urgency: number;
  gradeImpact: number;
  importance: number;
  overdue: boolean;
}

/** Scales the three raw weights to sum to 1 so one slider does not shift the overall range. */
export function normalizeWeights(weights: PriorityWeights): PriorityWeights {
  const total = weights.urgency + weights.gradeImpact + weights.importance;
  if (total <= 0) {
    // All sliders at zero: fall back to equal contribution rather than 0/0.
    return { urgency: 1 / 3, gradeImpact: 1 / 3, importance: 1 / 3 };
  }
  return {
    urgency: weights.urgency / total,
    gradeImpact: weights.gradeImpact / total,
    importance: weights.importance / total,
  };
}

/**
 * Non-linear decay: flat while the deadline is far away, steep as it approaches.
 * 1 at (or past) the due date, 0.5 at 7 days out, ~0.25 at 21 days out.
 */
export function urgencyComponent(item: Item, now: Date): number {
  const days = daysUntil(item.dueAt, now);
  if (days <= 0) return 1;
  return 1 / (1 + days / URGENCY_HALF_LIFE_DAYS);
}

/**
 * Raw share of the final grade at stake, 0-1. This is the honest percentage —
 * the workload chart sums it — so it stays linear. Scoring applies its own
 * curve on top; see `gradeStakesComponent`.
 */
export function gradeImpactComponent(item: Item): number {
  if (typeof item.gradeWeight === 'number') {
    return Math.min(item.gradeWeight, 100) / 100;
  }
  return TYPE_WEIGHT_FALLBACK[item.type];
}

/**
 * Grade impact as the score sees it: the square root of the raw share.
 *
 * Most coursework is small — a term is mostly 2-10% items with a couple of
 * 25-30% ones. On a linear scale those small items all sit squashed near zero
 * and grade impact stops discriminating between them. The square root spreads
 * the crowded low end out (2% -> 0.14, 8% -> 0.28, 30% -> 0.55) while keeping
 * the ordering, which is what lets a heavy exam outrank a trivial quiz without
 * needing the importance flag set by hand.
 */
export function gradeStakesComponent(item: Item): number {
  return Math.sqrt(gradeImpactComponent(item));
}

/** Manual 1/2/3 flag mapped onto 0 / 0.5 / 1. */
export function importanceComponent(item: Item): number {
  return (item.importance - 1) / 2;
}

/**
 * The single scoring function the priority list sorts by. Pure: same inputs
 * always give the same score, which is what makes it testable.
 */
export function scoreItem(item: Item, settings: Settings, now: Date): ScoreBreakdown {
  const overdue = !item.done && isOverdue(item.dueAt, now);

  if (item.done) {
    return { score: 0, urgency: 0, gradeImpact: 0, importance: 0, overdue: false };
  }

  const urgency = urgencyComponent(item, now);
  const gradeImpact = gradeStakesComponent(item);
  const importance = importanceComponent(item);
  const w = normalizeWeights(settings.weights);

  const combined = urgency * w.urgency + gradeImpact * w.gradeImpact + importance * w.importance;

  return { score: combined * 100, urgency, gradeImpact, importance, overdue };
}

export interface ScoredItem {
  item: Item;
  breakdown: ScoreBreakdown;
}

/**
 * Items due inside [now, now + horizonWeeks], highest score first. Overdue
 * items are returned separately so the view can pin them above everything
 * else regardless of how the sliders are set.
 */
export function buildPriorityList(
  items: Item[],
  settings: Settings,
  now: Date,
): { overdue: ScoredItem[]; upcoming: ScoredItem[] } {
  const cutoff = horizonEnd(now, settings.horizonWeeks).getTime();
  const overdue: ScoredItem[] = [];
  const upcoming: ScoredItem[] = [];

  for (const item of items) {
    if (item.done) continue;
    const breakdown = scoreItem(item, settings, now);

    if (breakdown.overdue) {
      overdue.push({ item, breakdown });
      continue;
    }
    if (parseISO(item.dueAt).getTime() <= cutoff) {
      upcoming.push({ item, breakdown });
    }
  }

  // Overdue sorts by how long it has been late — oldest debt first.
  overdue.sort((a, b) => parseISO(a.item.dueAt).getTime() - parseISO(b.item.dueAt).getTime());
  upcoming.sort((a, b) => {
    const diff = b.breakdown.score - a.breakdown.score;
    // Ties (common with identical weights) fall back to the earlier deadline.
    if (Math.abs(diff) > 1e-9) return diff;
    return parseISO(a.item.dueAt).getTime() - parseISO(b.item.dueAt).getTime();
  });

  return { overdue, upcoming };
}

export type UrgencyLevel = 'overdue' | 'today' | 'soon' | 'week' | 'later';

/**
 * Row color bucket. Deliberately derived from days remaining, not from the
 * score, so the color means the same thing no matter how the sliders are set.
 */
export function urgencyLevel(item: Item, now: Date): UrgencyLevel {
  if (!item.done && isOverdue(item.dueAt, now)) return 'overdue';
  const days = calendarDaysUntil(item.dueAt, now);
  if (days <= 0) return 'today';
  if (days <= 2) return 'soon';
  if (days <= 7) return 'week';
  return 'later';
}
