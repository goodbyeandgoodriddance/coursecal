import { describe, expect, it } from 'vitest';
import type { Course } from '../types';
import { courseFullName, courseLabel, findCourseByToken, isCodeTaken } from './courses';

function course(overrides: Partial<Course> & { id: string; title: string }): Course {
  return { termId: 't1', colorIndex: 0, ...overrides };
}

const withCode = course({ id: 'c1', title: 'Data Structures', code: 'CS201' });
const noCode = course({ id: 'c2', title: 'Modern Literature' });

describe('courseLabel', () => {
  it('prefers the code when there is one', () => {
    expect(courseLabel(withCode)).toBe('CS201');
  });

  it('falls back to the title when the code is absent — the whole point', () => {
    expect(courseLabel(noCode)).toBe('Modern Literature');
  });

  it('treats a blank or whitespace-only code as absent', () => {
    expect(courseLabel(course({ id: 'c3', title: 'Statistics', code: '' }))).toBe('Statistics');
    expect(courseLabel(course({ id: 'c4', title: 'Statistics', code: '   ' }))).toBe('Statistics');
  });

  it('never renders an empty badge for a missing course', () => {
    expect(courseLabel(undefined)).toBe('—');
  });
});

describe('courseFullName', () => {
  it('joins code and title when both exist', () => {
    expect(courseFullName(withCode)).toBe('CS201 — Data Structures');
  });

  it('is just the title when there is no code', () => {
    expect(courseFullName(noCode)).toBe('Modern Literature');
  });

  it('does not repeat itself when code and title are identical', () => {
    expect(courseFullName(course({ id: 'c5', title: 'CHEM101', code: 'CHEM101' }))).toBe('CHEM101');
  });
});

describe('findCourseByToken', () => {
  const courses = [withCode, noCode];

  it('matches a code case- and punctuation-insensitively', () => {
    expect(findCourseByToken(courses, 'cs201')?.id).toBe('c1');
    expect(findCourseByToken(courses, 'CS-201')?.id).toBe('c1');
  });

  it('matches a codeless course by its title, so quick add still reaches it', () => {
    expect(findCourseByToken(courses, 'modern literature')?.id).toBe('c2');
    expect(findCourseByToken(courses, 'ModernLiterature')?.id).toBe('c2');
  });

  it('prefers a code match over a title match', () => {
    // A course whose title happens to equal another's code must not win.
    const confusing = [course({ id: 'c9', title: 'CS201' }), withCode];
    expect(findCourseByToken(confusing, 'CS201')?.id).toBe('c1');
  });

  it('returns undefined for an unknown token', () => {
    expect(findCourseByToken(courses, 'BIO999')).toBeUndefined();
  });

  it('returns undefined for a token with no alphanumerics', () => {
    expect(findCourseByToken(courses, '---')).toBeUndefined();
  });
});

describe('isCodeTaken', () => {
  const courses = [withCode, noCode];

  it('detects a duplicate regardless of case', () => {
    expect(isCodeTaken(courses, 'cs201')).toBe(true);
  });

  it('allows a free code', () => {
    expect(isCodeTaken(courses, 'MATH140')).toBe(false);
  });

  it('never reports a blank code as taken, since blank is allowed', () => {
    expect(isCodeTaken(courses, '')).toBe(false);
    expect(isCodeTaken(courses, '  ')).toBe(false);
  });

  it('ignores the course being edited, so saving without changes is allowed', () => {
    expect(isCodeTaken(courses, 'CS201', 'c1')).toBe(false);
    expect(isCodeTaken(courses, 'CS201', 'c2')).toBe(true);
  });

  it('does not trip over codeless courses', () => {
    expect(isCodeTaken([noCode], 'ANYTHING')).toBe(false);
  });
});
