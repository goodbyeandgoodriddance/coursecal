import { describe, expect, it } from 'vitest';
import { laneStyle, layoutOverlapping, type Interval, type Placed } from './weekLayout';

/** Builds an interval from "HH:mm"-ish minute values for readability. */
const at = (name: string, start: number, end: number): Interval<string> => ({
  value: name,
  start,
  end,
});

const H = (hour: number, minute = 0) => hour * 60 + minute;

/**
 * Looks up a placement by name, asserting it exists. Returning a plain object
 * would be `| undefined` under noUncheckedIndexedAccess and bury every
 * assertion in optional chaining.
 */
function placementOf(placed: Placed<string>[], name: string): { lane: number; lanes: number } {
  const found = placed.find((entry) => entry.value === name);
  if (!found) throw new Error(`no placement produced for "${name}"`);
  return { lane: found.lane, lanes: found.lanes };
}

function byName(placed: Placed<string>[]) {
  return (name: string) => placementOf(placed, name);
}

describe('layoutOverlapping', () => {
  it('gives a single item the full width', () => {
    const result = byName(layoutOverlapping([at('only', H(10), H(11))]));
    expect(result('only')).toEqual({ lane: 0, lanes: 1 });
  });

  it('places two identical slots side by side — the bug this exists to fix', () => {
    const result = byName(
      layoutOverlapping([at('lecture', H(10), H(11, 30)), at('lab', H(10), H(11, 30))]),
    );
    expect(result('lecture')).toEqual({ lane: 0, lanes: 2 });
    expect(result('lab')).toEqual({ lane: 1, lanes: 2 });
  });

  it('places partially overlapping slots side by side', () => {
    const result = byName(
      layoutOverlapping([at('a', H(9), H(11)), at('b', H(10), H(12))]),
    );
    expect(result('a').lanes).toBe(2);
    expect(result('b').lanes).toBe(2);
    expect(result('a').lane).not.toBe(result('b').lane);
  });

  it('keeps non-overlapping slots at full width', () => {
    const result = byName(
      layoutOverlapping([at('morning', H(9), H(10)), at('evening', H(17), H(18))]),
    );
    expect(result('morning')).toEqual({ lane: 0, lanes: 1 });
    expect(result('evening')).toEqual({ lane: 0, lanes: 1 });
  });

  it('treats touching slots as non-overlapping', () => {
    // A class ending exactly as the next begins is back-to-back, not a clash.
    const result = byName(
      layoutOverlapping([at('first', H(9), H(10)), at('second', H(10), H(11))]),
    );
    expect(result('first').lanes).toBe(1);
    expect(result('second').lanes).toBe(1);
  });

  it('does not let one clash shrink an unrelated later slot', () => {
    // The whole reason lanes are counted per cluster rather than per day.
    const result = byName(
      layoutOverlapping([
        at('clashA', H(9), H(10)),
        at('clashB', H(9), H(10)),
        at('alone', H(15), H(16)),
      ]),
    );
    expect(result('clashA').lanes).toBe(2);
    expect(result('clashB').lanes).toBe(2);
    expect(result('alone')).toEqual({ lane: 0, lanes: 1 });
  });

  it('handles three-way overlaps', () => {
    const result = byName(
      layoutOverlapping([
        at('a', H(10), H(12)),
        at('b', H(10), H(12)),
        at('c', H(10), H(12)),
      ]),
    );
    expect(new Set([result('a').lane, result('b').lane, result('c').lane])).toEqual(new Set([0, 1, 2]));
    expect(result('a').lanes).toBe(3);
  });

  it('reuses a freed lane later in the same cluster', () => {
    // a: 9-10, b: 9-12 (so the cluster spans 9-12), c: 10-11 can reuse a's lane.
    const result = byName(
      layoutOverlapping([at('a', H(9), H(10)), at('b', H(9), H(12)), at('c', H(10), H(11))]),
    );
    expect(result('a').lanes).toBe(2);
    expect(result('c').lane).toBe(result('a').lane);
    expect(result('b').lane).not.toBe(result('a').lane);
  });

  it('returns every input exactly once', () => {
    const input = [at('a', H(9), H(10)), at('b', H(9), H(11)), at('c', H(14), H(15))];
    const result = layoutOverlapping(input);
    expect(result).toHaveLength(3);
    expect(result.map((entry) => entry.value).sort()).toEqual(['a', 'b', 'c']);
  });

  it('is order-independent', () => {
    const forward = byName(
      layoutOverlapping([at('a', H(10), H(12)), at('b', H(10), H(12))]),
    );
    const reversed = byName(
      layoutOverlapping([at('b', H(10), H(12)), at('a', H(10), H(12))]),
    );
    expect(forward('a').lanes).toBe(reversed('a').lanes);
    expect(forward('b').lanes).toBe(reversed('b').lanes);
  });

  it('handles an empty list', () => {
    expect(layoutOverlapping([])).toEqual([]);
  });
});

describe('laneStyle', () => {
  it('spans the full column for a lone item', () => {
    const style = laneStyle(0, 1);
    expect(style.left).toBe('calc(0% + 2px)');
    expect(style.width).toBe('calc(100% - 4px)');
    expect(style.right).toBe('auto');
  });

  it('splits the column evenly and offsets each lane', () => {
    expect(laneStyle(0, 2).left).toBe('calc(0% + 2px)');
    expect(laneStyle(1, 2).left).toBe('calc(50% + 2px)');
    expect(laneStyle(0, 2).width).toBe('calc(50% - 4px)');
  });

  it('releases the stylesheet\'s right edge so width applies', () => {
    // .week-block pins left AND right in CSS; without this the width is ignored.
    expect(laneStyle(1, 3).right).toBe('auto');
  });
});
