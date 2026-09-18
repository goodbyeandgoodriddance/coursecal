import { describe, expect, it } from 'vitest';
import type { TermBreak } from '../types';
import {
  breakLengthDays,
  breakOn,
  breaksForTerm,
  isBreakDay,
  overlapsExistingBreak,
} from './breaks';

const reading: TermBreak = {
  id: 'b1',
  termId: 't1',
  name: 'Reading week',
  startDate: '2026-10-12',
  endDate: '2026-10-16',
};

const holiday: TermBreak = {
  id: 'b2',
  termId: 't1',
  name: 'Thanksgiving',
  startDate: '2026-11-26',
  endDate: '2026-11-27',
};

const otherTerm: TermBreak = { ...reading, id: 'b3', termId: 't2' };

/** Local date, avoiding the UTC shift a bare `new Date('...')` would apply. */
const on = (iso: string) => new Date(`${iso}T09:00:00`);

describe('breakOn / isBreakDay', () => {
  const all = [reading, holiday];

  it('matches the first day of a break', () => {
    expect(breakOn(all, on('2026-10-12'))?.id).toBe('b1');
  });

  it('matches the last day, because the range is inclusive', () => {
    expect(breakOn(all, on('2026-10-16'))?.id).toBe('b1');
  });

  it('matches a day in the middle', () => {
    expect(isBreakDay(all, on('2026-10-14'))).toBe(true);
  });

  it('does not match the day before or after', () => {
    expect(isBreakDay(all, on('2026-10-11'))).toBe(false);
    expect(isBreakDay(all, on('2026-10-17'))).toBe(false);
  });

  it('picks the right break when there are several', () => {
    expect(breakOn(all, on('2026-11-26'))?.name).toBe('Thanksgiving');
  });

  it('is unaffected by time of day', () => {
    // A break is a run of calendar days, so 00:00 and 23:59 must agree.
    expect(isBreakDay(all, new Date('2026-10-12T00:00:00'))).toBe(true);
    expect(isBreakDay(all, new Date('2026-10-16T23:59:00'))).toBe(true);
  });

  it('handles a single-day break', () => {
    const oneDay: TermBreak = { ...reading, startDate: '2026-10-12', endDate: '2026-10-12' };
    expect(isBreakDay([oneDay], on('2026-10-12'))).toBe(true);
    expect(isBreakDay([oneDay], on('2026-10-13'))).toBe(false);
  });

  it('returns undefined when there are no breaks at all', () => {
    expect(breakOn([], on('2026-10-14'))).toBeUndefined();
  });
});

describe('breaksForTerm', () => {
  const all = [holiday, reading, otherTerm];

  it('returns only the given term, sorted by start date', () => {
    expect(breaksForTerm(all, 't1').map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('returns nothing when no term is active', () => {
    expect(breaksForTerm(all, null)).toEqual([]);
  });

  it('does not leak another term\'s breaks', () => {
    expect(breaksForTerm(all, 't2').map((b) => b.id)).toEqual(['b3']);
  });
});

describe('breakLengthDays', () => {
  it('counts inclusively', () => {
    expect(breakLengthDays(reading)).toBe(5); // Mon-Fri
    expect(breakLengthDays(holiday)).toBe(2);
  });

  it('counts a single day as one', () => {
    expect(breakLengthDays({ ...reading, endDate: reading.startDate })).toBe(1);
  });

  it('is not tripped up by a month boundary', () => {
    expect(
      breakLengthDays({ ...reading, startDate: '2026-10-29', endDate: '2026-11-02' }),
    ).toBe(5);
  });
});

describe('overlapsExistingBreak', () => {
  const all = [reading, holiday];

  it('detects a range that starts inside an existing break', () => {
    expect(overlapsExistingBreak(all, 't1', '2026-10-14', '2026-10-20')).toBe(true);
  });

  it('detects a range that fully contains an existing break', () => {
    expect(overlapsExistingBreak(all, 't1', '2026-10-01', '2026-10-31')).toBe(true);
  });

  it('allows a range that ends the day before', () => {
    expect(overlapsExistingBreak(all, 't1', '2026-10-05', '2026-10-11')).toBe(false);
  });

  it('allows a range in a different term', () => {
    expect(overlapsExistingBreak(all, 't9', '2026-10-14', '2026-10-15')).toBe(false);
  });

  it('ignores the break being edited, so saving it unchanged is allowed', () => {
    expect(overlapsExistingBreak(all, 't1', '2026-10-12', '2026-10-16', 'b1')).toBe(false);
  });
});
