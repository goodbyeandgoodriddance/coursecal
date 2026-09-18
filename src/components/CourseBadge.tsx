import type { Course } from '../types';
import { courseLabel } from '../lib/courses';

/** CSS var reference for a course's accent, for use in inline styles. */
export function courseColorVar(colorIndex: number): string {
  return `var(--course-${colorIndex % 8})`;
}

export function CourseBadge({ course }: { course: Course | undefined }) {
  if (!course) return <span className="course-badge">—</span>;
  return (
    <span
      className="course-badge"
      style={{ ['--course-color' as string]: courseColorVar(course.colorIndex) }}
      title={course.title}
    >
      {courseLabel(course)}
    </span>
  );
}
