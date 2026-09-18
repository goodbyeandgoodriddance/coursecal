import type { Item } from '../types';

export interface CourseGrade {
  /** Weight of graded items, as a percent of the final grade. */
  gradedWeight: number;
  /** Weight of all weighted items, graded or not. */
  totalWeight: number;
  /** Average across graded work only, 0-100. Null when nothing is graded yet. */
  currentGrade: number | null;
  /**
   * Final grade if remaining work scores the same as graded work so far.
   * Null when nothing is graded yet.
   */
  projectedGrade: number | null;
  gradedCount: number;
}

/** Items that count: they have a weight and a recorded score. */
function isGraded(item: Item): boolean {
  return typeof item.gradeWeight === 'number' && typeof item.earnedScore === 'number';
}

/**
 * Running grade for one course. `currentGrade` answers "how am I doing on what
 * has been marked"; `projectedGrade` extends that average over the unmarked
 * remainder, which is the number students actually want to see.
 */
export function computeCourseGrade(items: Item[]): CourseGrade {
  let gradedWeight = 0;
  let weightedScoreSum = 0;
  let totalWeight = 0;
  let gradedCount = 0;

  for (const item of items) {
    if (typeof item.gradeWeight === 'number') {
      totalWeight += item.gradeWeight;
    }
    if (isGraded(item)) {
      const weight = item.gradeWeight as number;
      gradedWeight += weight;
      weightedScoreSum += (item.earnedScore as number) * weight;
      gradedCount += 1;
    }
  }

  if (gradedWeight === 0) {
    return {
      gradedWeight: 0,
      totalWeight,
      currentGrade: null,
      projectedGrade: null,
      gradedCount: 0,
    };
  }

  const currentGrade = weightedScoreSum / gradedWeight;

  return {
    gradedWeight,
    totalWeight,
    currentGrade,
    // Assuming the same performance on the rest, the projection equals the
    // current average — stated explicitly so the intent is obvious.
    projectedGrade: currentGrade,
    gradedCount,
  };
}
