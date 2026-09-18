/** Kinds of graded or scheduled work a course can hand out. */
export type ItemType = 'assignment' | 'exam' | 'quiz' | 'reading' | 'project' | 'other';

export const ITEM_TYPES: ItemType[] = [
  'assignment',
  'exam',
  'quiz',
  'reading',
  'project',
  'other',
];

/** Kinds of recurring weekly class meeting. */
export type MeetingKind = 'lecture' | 'lab' | 'tutorial' | 'seminar';

export const MEETING_KINDS: MeetingKind[] = ['lecture', 'lab', 'tutorial', 'seminar'];

/** The manual priority lever: 1 = low, 2 = normal, 3 = high. */
export type Importance = 1 | 2 | 3;

export interface Term {
  id: string;
  name: string;
  /** ISO date, yyyy-MM-dd. */
  startDate: string;
  /** ISO date, yyyy-MM-dd. */
  endDate: string;
  archived: boolean;
}

/**
 * A stretch of term with no classes — a reading week, study break or holiday.
 * Dates are user-defined rather than fixed, since every institution schedules
 * them differently. Deadlines still apply during a break; only recurring class
 * meetings are suppressed.
 */
export interface TermBreak {
  id: string;
  termId: string;
  name: string;
  /** ISO date, yyyy-MM-dd; inclusive. */
  startDate: string;
  /** ISO date, yyyy-MM-dd; inclusive. */
  endDate: string;
}

export interface Course {
  id: string;
  termId: string;
  /**
   * Optional short code, e.g. "CS201". Quick-add matches it when present and
   * falls back to the title when it is not — see src/lib/courses.ts.
   */
  code?: string;
  title: string;
  /** Index into COURSE_COLORS in styles/theme.css. */
  colorIndex: number;
  instructor?: string;
  notes?: string;
}

export interface CourseMeeting {
  id: string;
  courseId: string;
  kind: MeetingKind;
  /** 0 = Sunday .. 6 = Saturday, matching Date#getDay. */
  weekday: number;
  /** "HH:mm", 24-hour. */
  startTime: string;
  /** "HH:mm", 24-hour. */
  endTime: string;
  location?: string;
}

export interface Item {
  id: string;
  courseId: string;
  title: string;
  type: ItemType;
  /** ISO datetime. For all-day items the time component is 23:59 local. */
  dueAt: string;
  allDay: boolean;
  importance: Importance;
  /** Percent of the course's final grade, 0-100. */
  gradeWeight?: number;
  /** Percent achieved once graded, 0-100. */
  earnedScore?: number;
  /** Self-reported hours of work; display only, not part of the priority score. */
  estimatedHours?: number;
  done: boolean;
  completedAt?: string;
  notes?: string;
}

export interface PriorityWeights {
  urgency: number;
  gradeImpact: number;
  importance: number;
}

export interface Settings {
  weights: PriorityWeights;
  /** How far ahead the priority list looks. */
  horizonWeeks: number;
  /** Hours before an item is due at which to fire a reminder. */
  reminderLeadsHours: number[];
  notificationsEnabled: boolean;
  /**
   * Play a short chime when work is ticked off. Optional so backups from
   * earlier versions still validate; treated as on when absent.
   */
  soundEnabled?: boolean;
}

/** Keys of reminders already fired, so a restart does not re-fire them. */
export type FiredReminders = Record<string, true>;

export interface AppData {
  schemaVersion: number;
  terms: Term[];
  breaks: TermBreak[];
  courses: Course[];
  meetings: CourseMeeting[];
  items: Item[];
  settings: Settings;
  activeTermId: string | null;
  firedReminders: FiredReminders;
  /**
   * Whether the first-run wizard has been completed or dismissed. Optional so
   * that a backup exported by v0.1.0, which predates this field, still
   * validates on import.
   */
  onboardingComplete?: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  weights: { urgency: 0.45, gradeImpact: 0.35, importance: 0.2 },
  horizonWeeks: 4,
  reminderLeadsHours: [24, 1],
  notificationsEnabled: true,
  soundEnabled: true,
};
