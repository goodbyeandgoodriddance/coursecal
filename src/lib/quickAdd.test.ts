import { describe, expect, it } from 'vitest';
import { format } from 'date-fns';
import type { Course } from '../types';
import { parseQuickAdd } from './quickAdd';

/** A Thursday, so weekday arithmetic is unambiguous in the expectations. */
const NOW = new Date('2026-09-17T09:00:00');

const courses: Course[] = [
  { id: 'cs', termId: 't', code: 'CS201', title: 'Data Structures', colorIndex: 0 },
  { id: 'math', termId: 't', code: 'MATH140', title: 'Linear Algebra', colorIndex: 1 },
];

const parse = (input: string) => parseQuickAdd(input, courses, NOW);

describe('parseQuickAdd', () => {
  it('parses the documented example end to end', () => {
    const result = parse('CS201 essay fri 5pm 20%');
    expect(result.courseId).toBe('cs');
    expect(result.title).toBe('essay');
    expect(result.type).toBe('assignment');
    expect(result.gradeWeight).toBe(20);
    expect(result.allDay).toBe(false);
    expect(format(result.due as Date, 'yyyy-MM-dd HH:mm')).toBe('2026-09-18 17:00');
    expect(result.confident).toBe(true);
  });

  it('matches course codes case- and punctuation-insensitively', () => {
    expect(parse('cs201 hw tomorrow').courseId).toBe('cs');
    expect(parse('cs-201 hw tomorrow').courseId).toBe('cs');
    expect(parse('MATH140 hw tomorrow').courseId).toBe('math');
  });

  it('handles today and tomorrow', () => {
    expect(format(parse('CS201 hw today').due as Date, 'yyyy-MM-dd')).toBe('2026-09-17');
    expect(format(parse('CS201 hw tomorrow').due as Date, 'yyyy-MM-dd')).toBe('2026-09-18');
  });

  it('treats a bare weekday as the next such day, never today', () => {
    // NOW is a Thursday; "thu" must mean next Thursday, not today.
    expect(format(parse('CS201 hw thu').due as Date, 'yyyy-MM-dd')).toBe('2026-09-24');
    expect(format(parse('CS201 hw fri').due as Date, 'yyyy-MM-dd')).toBe('2026-09-18');
    expect(format(parse('CS201 hw mon').due as Date, 'yyyy-MM-dd')).toBe('2026-09-21');
  });

  it('pushes "next <weekday>" a further week out', () => {
    expect(format(parse('CS201 hw next fri').due as Date, 'yyyy-MM-dd')).toBe('2026-09-25');
  });

  it('parses "in N days" and "in N weeks"', () => {
    expect(format(parse('CS201 hw in 3 days').due as Date, 'yyyy-MM-dd')).toBe('2026-09-20');
    expect(format(parse('CS201 hw in 2 weeks').due as Date, 'yyyy-MM-dd')).toBe('2026-10-01');
  });

  it('parses month-name dates and rolls over the year when already past', () => {
    expect(format(parse('CS201 exam dec 4').due as Date, 'yyyy-MM-dd')).toBe('2026-12-04');
    // March has passed in September, so it must mean next year.
    expect(format(parse('CS201 exam mar 3').due as Date, 'yyyy-MM-dd')).toBe('2027-03-03');
  });

  it('parses ordinal day suffixes', () => {
    expect(format(parse('CS201 exam oct 21st').due as Date, 'yyyy-MM-dd')).toBe('2026-10-21');
  });

  it('parses numeric dates, with and without a year', () => {
    expect(format(parse('CS201 hw 10/4').due as Date, 'yyyy-MM-dd')).toBe('2026-10-04');
    expect(format(parse('CS201 hw 10/4/27').due as Date, 'yyyy-MM-dd')).toBe('2027-10-04');
  });

  it('parses 12-hour, 24-hour, and minute-bearing times', () => {
    expect(format(parse('CS201 hw tomorrow 5pm').due as Date, 'HH:mm')).toBe('17:00');
    expect(format(parse('CS201 hw tomorrow 5:30pm').due as Date, 'HH:mm')).toBe('17:30');
    expect(format(parse('CS201 hw tomorrow 17:00').due as Date, 'HH:mm')).toBe('17:00');
    expect(format(parse('CS201 hw tomorrow 9am').due as Date, 'HH:mm')).toBe('09:00');
    expect(format(parse('CS201 hw tomorrow 12am').due as Date, 'HH:mm')).toBe('00:00');
    expect(format(parse('CS201 hw tomorrow 12pm').due as Date, 'HH:mm')).toBe('12:00');
  });

  it('treats a missing time as all-day, due at end of day', () => {
    const result = parse('CS201 reading tomorrow');
    expect(result.allDay).toBe(true);
    expect(format(result.due as Date, 'HH:mm')).toBe('23:59');
  });

  it('infers the type from a keyword while leaving it in the title', () => {
    expect(parse('CS201 midterm exam fri').type).toBe('exam');
    expect(parse('CS201 weekly quiz mon').type).toBe('quiz');
    expect(parse('CS201 chapter 7 reading tomorrow').type).toBe('reading');
    expect(parse('CS201 group project fri').type).toBe('project');
    expect(parse('CS201 write something fri').type).toBe('assignment');
    // The keyword stays in the title — it reads naturally there.
    expect(parse('CS201 midterm exam fri').title).toContain('midterm');
  });

  it('reads a trailing bang as high importance', () => {
    expect(parse('CS201 hw fri').importance).toBe(2);
    expect(parse('CS201 hw fri!').importance).toBe(3);
    expect(parse('CS201 hw! fri').importance).toBe(3);
    expect(parse('CS201 hw fri!!').importance).toBe(3);
    // The bang must not survive into the title.
    expect(parse('CS201 hw! fri').title).toBe('hw');
  });

  it('accepts a grade weight anywhere in the line', () => {
    expect(parse('CS201 20% hw fri').gradeWeight).toBe(20);
    expect(parse('CS201 hw fri 7.5%').gradeWeight).toBe(7.5);
    expect(parse('CS201 hw fri').gradeWeight).toBeUndefined();
  });

  it('strips every recognized token out of the title', () => {
    expect(parse('CS201 problem set 4 fri 5pm 20%').title).toBe('problem set 4');
  });

  it('is not confident when the course is unknown', () => {
    const result = parse('BIO999 lab report tomorrow');
    expect(result.courseId).toBeNull();
    expect(result.confident).toBe(false);
    // The unmatched code stays in the title rather than vanishing.
    expect(result.title).toContain('BIO999');
  });

  it('is not confident when no date is recognized', () => {
    const result = parse('CS201 some assignment');
    expect(result.due).toBeNull();
    expect(result.confident).toBe(false);
  });

  it('is not confident when nothing is left for a title', () => {
    expect(parse('CS201 tomorrow').confident).toBe(false);
  });

  it('does not mistake a grade weight for a time or date', () => {
    const result = parse('CS201 hw fri 20%');
    expect(format(result.due as Date, 'yyyy-MM-dd')).toBe('2026-09-18');
    expect(result.gradeWeight).toBe(20);
    expect(result.allDay).toBe(true);
  });

  it('does not treat a number in the title as a date', () => {
    const result = parse('CS201 problem set 4 tomorrow');
    expect(result.title).toBe('problem set 4');
    expect(format(result.due as Date, 'yyyy-MM-dd')).toBe('2026-09-18');
  });
});

describe('quick add malformed date/time safety', () => {
  const now = new Date(2026, 8, 17, 12, 0);
  const courses = [
    { id: 'c1', termId: 't1', code: 'CS201', title: 'Data Structures', colorIndex: 0 },
  ];

  it('does not wrap an invalid 12-hour clock value into a different hour', () => {
    const parsed = parseQuickAdd('CS201 exam tomorrow 99pm', courses, now);
    expect(parsed.confident).toBe(false);
    expect(parsed.allDay).toBe(true);
    expect(parsed.title).toContain('99pm');
  });

  it('rejects impossible named-month dates instead of rolling into the next month', () => {
    const parsed = parseQuickAdd('CS201 paper feb 31', courses, now);
    expect(parsed.due).toBeNull();
    expect(parsed.confident).toBe(false);
  });

  it('rejects impossible numeric dates instead of rolling into the next month', () => {
    const parsed = parseQuickAdd('CS201 paper 2/31/27', courses, now);
    expect(parsed.due).toBeNull();
    expect(parsed.confident).toBe(false);
  });
});
