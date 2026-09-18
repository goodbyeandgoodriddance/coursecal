/**
 * Side-by-side placement for overlapping items in the week timetable.
 *
 * Without this, two classes at the same hour render at identical coordinates
 * and one completely hides the other — so a clashing lab or a double-booked
 * slot silently disappears from the schedule.
 */

export interface Interval<T> {
  value: T;
  /** Minutes from midnight. */
  start: number;
  /** Minutes from midnight; must be greater than `start`. */
  end: number;
}

export interface Placed<T> {
  value: T;
  /** Zero-based column within this item's overlap cluster. */
  lane: number;
  /** How many columns that cluster needs, i.e. the divisor for width. */
  lanes: number;
}

/**
 * Assigns each interval a lane so that overlapping intervals sit beside each
 * other rather than on top of each other.
 *
 * Lanes are counted per *cluster* of transitively-overlapping intervals, not
 * per day: a clash at 9am must not squeeze an unrelated 5pm class into half
 * width. Within a cluster the assignment is the usual greedy sweep — reuse the
 * first lane that has already ended, otherwise open a new one.
 */
export function layoutOverlapping<T>(intervals: Interval<T>[]): Placed<T>[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);

  const placed: Placed<T>[] = [];
  let cluster: Interval<T>[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const flushCluster = () => {
    if (cluster.length === 0) return;

    /** Per lane, the end time of the last interval placed in it. */
    const laneEnds: number[] = [];
    const assignments: { value: T; lane: number }[] = [];

    for (const interval of cluster) {
      let lane = laneEnds.findIndex((end) => end <= interval.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = interval.end;
      assignments.push({ value: interval.value, lane });
    }

    for (const assignment of assignments) {
      placed.push({ ...assignment, lanes: laneEnds.length });
    }

    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const interval of sorted) {
    // A gap with everything so far ends the cluster; note `>=`, so touching
    // intervals (one ends exactly as the next begins) do not count as a clash.
    if (cluster.length > 0 && interval.start >= clusterEnd) flushCluster();
    cluster.push(interval);
    clusterEnd = Math.max(clusterEnd, interval.end);
  }
  flushCluster();

  return placed;
}

/** Inline geometry for a placed block, as CSS values. */
export function laneStyle(lane: number, lanes: number): {
  left: string;
  width: string;
  right: string;
} {
  return {
    left: `calc(${(lane / lanes) * 100}% + 2px)`,
    width: `calc(${100 / lanes}% - 4px)`,
    // The stylesheet pins both edges; setting a width needs `right` released.
    right: 'auto',
  };
}
