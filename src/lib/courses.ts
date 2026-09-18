import type { Course } from '../types';

/**
 * Course naming, in one place.
 *
 * A course code is optional — plenty of people know a class as "Modern
 * Literature" and never use its catalogue number — so every place that used to
 * print `course.code` has to fall back to something sensible instead of
 * rendering an empty badge.
 */

/** Short identifier for badges and chips: the code if there is one, else the title. */
export function courseLabel(course: Course | undefined): string {
  if (!course) return '—';
  const code = course.code?.trim();
  return code && code.length > 0 ? code : course.title.trim();
}

/** Full name for dropdowns and dialogs: "CS201 — Data Structures", or just the title. */
export function courseFullName(course: Course | undefined): string {
  if (!course) return '—';
  const code = course.code?.trim();
  const title = course.title.trim();
  return code && code.length > 0 && code !== title ? `${code} — ${title}` : title;
}

/** Comparison key: case- and punctuation-insensitive. */
export function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds the course a quick-add token refers to. Matches a code when the course
 * has one, and otherwise falls back to the title, so a course with no code is
 * still reachable from the quick-add bar.
 */
export function findCourseByToken(courses: Course[], token: string): Course | undefined {
  const needle = normalizeForMatch(token);
  if (!needle) return undefined;

  const byCode = courses.find(
    (course) => course.code && normalizeForMatch(course.code) === needle,
  );
  if (byCode) return byCode;

  return courses.find((course) => normalizeForMatch(course.title) === needle);
}

/** True when `code` is already used by another course in the list. */
export function isCodeTaken(courses: Course[], code: string, exceptId?: string): boolean {
  const needle = normalizeForMatch(code);
  if (!needle) return false;
  return courses.some(
    (course) =>
      course.id !== exceptId && course.code && normalizeForMatch(course.code) === needle,
  );
}
