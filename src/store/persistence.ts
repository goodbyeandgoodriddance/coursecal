import { z } from 'zod';
import { DEFAULT_SETTINGS, type AppData } from '../types';

export const STORAGE_KEY = 'coursecal.v1';
export const SCHEMA_VERSION = 1;

const itemTypeSchema = z.enum(['assignment', 'exam', 'quiz', 'reading', 'project', 'other']);
const meetingKindSchema = z.enum(['lecture', 'lab', 'tutorial', 'seminar']);
const importanceSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in yyyy-MM-dd format')
  .refine((value) => {
    const parts = value.split('-').map(Number);
    const year = parts[0]!;
    const month = parts[1]!;
    const day = parts[2]!;
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'Expected a real calendar date');

const timeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Expected a 24-hour time in HH:mm format');

const isoDateTimeSchema = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)), 'Expected a valid ISO date and time');

const termSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: dateKeySchema,
  endDate: dateKeySchema,
  archived: z.boolean(),
});

const courseSchema = z.object({
  id: z.string(),
  termId: z.string(),
  code: z.string().optional(),
  title: z.string(),
  colorIndex: z.number().int().min(0),
  instructor: z.string().optional(),
  notes: z.string().optional(),
});

const meetingSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  kind: meetingKindSchema,
  weekday: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  location: z.string().optional(),
});

const itemSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  type: itemTypeSchema,
  dueAt: isoDateTimeSchema,
  allDay: z.boolean(),
  importance: importanceSchema,
  gradeWeight: z.number().min(0).max(100).optional(),
  earnedScore: z.number().min(0).max(100).optional(),
  estimatedHours: z.number().min(0).optional(),
  done: z.boolean(),
  completedAt: isoDateTimeSchema.optional(),
  notes: z.string().optional(),
});

const settingsSchema = z.object({
  weights: z.object({
    urgency: z.number().min(0).max(1),
    gradeImpact: z.number().min(0).max(1),
    importance: z.number().min(0).max(1),
  }),
  horizonWeeks: z.number().int().min(1).max(52),
  reminderLeadsHours: z.array(z.number().min(0)),
  notificationsEnabled: z.boolean(),
  soundEnabled: z.boolean().optional(),
});

/**
 * The single source of truth for what valid app data looks like. Exported so
 * that importing a backup file validates against exactly the same rules as
 * loading from localStorage — there must never be two definitions of this that
 * can drift apart. See src/lib/dataFile.ts.
 */
const termBreakSchema = z.object({
  id: z.string(),
  termId: z.string(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});

export const appDataSchema = z
  .object({
    schemaVersion: z.number().int(),
    terms: z.array(termSchema),
    // Optional: backups from v0.1/v0.2 predate reading weeks and must still
    // import rather than being rejected as damaged.
    breaks: z.array(termBreakSchema).optional(),
    courses: z.array(courseSchema),
    meetings: z.array(meetingSchema),
    items: z.array(itemSchema),
    settings: settingsSchema,
    activeTermId: z.string().nullable(),
    firedReminders: z.record(z.literal(true)),
    // Optional on purpose: v0.1.0 backups have no such field and must still
    // import cleanly rather than being rejected as damaged.
    onboardingComplete: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const termIds = new Set(data.terms.map((term) => term.id));
    const courseIds = new Set(data.courses.map((course) => course.id));

    const checkUnique = (
      values: Array<{ id: string }>,
      collection: 'terms' | 'breaks' | 'courses' | 'meetings' | 'items',
    ) => {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [collection, index, 'id'],
            message: `Duplicate ${collection.slice(0, -1)} id`,
          });
        }
        seen.add(value.id);
      });
    };

    checkUnique(data.terms, 'terms');
    if (data.breaks) checkUnique(data.breaks, 'breaks');
    checkUnique(data.courses, 'courses');
    checkUnique(data.meetings, 'meetings');
    checkUnique(data.items, 'items');

    data.courses.forEach((course, index) => {
      if (!termIds.has(course.termId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['courses', index, 'termId'],
          message: 'Course refers to a term that does not exist',
        });
      }
    });

    (data.breaks ?? []).forEach((entry, index) => {
      if (!termIds.has(entry.termId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['breaks', index, 'termId'],
          message: 'Break refers to a term that does not exist',
        });
      }
      if (entry.endDate < entry.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['breaks', index, 'endDate'],
          message: 'Break ends before it starts',
        });
      }
    });

    data.meetings.forEach((meeting, index) => {
      if (!courseIds.has(meeting.courseId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['meetings', index, 'courseId'],
          message: 'Meeting refers to a course that does not exist',
        });
      }
    });

    data.items.forEach((item, index) => {
      if (!courseIds.has(item.courseId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'courseId'],
          message: 'Item refers to a course that does not exist',
        });
      }
    });

    if (data.activeTermId !== null && !termIds.has(data.activeTermId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['activeTermId'],
        message: 'Active term does not exist',
      });
    }
  });

/**
 * Reads persisted state. Anything unparseable or from an unknown schema version
 * is discarded rather than crashing the app; the caller then falls back to an
 * empty state. Returns null when there is nothing usable to load.
 */
export function loadData(): AppData | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = appDataSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('CourseCal: stored data failed validation, ignoring it.', parsed.error.issues);
      return null;
    }
    if (parsed.data.schemaVersion !== SCHEMA_VERSION) {
      console.warn(
        `CourseCal: stored schema v${parsed.data.schemaVersion} != v${SCHEMA_VERSION}, ignoring it.`,
      );
      return null;
    }
    // Merge settings over defaults so a field added in a future build still
    // gets a sane value even within the same schema version.
    return {
      ...parsed.data,
      // Existing installs and v0.1 backups predate onboarding. Treat a
      // missing flag as already onboarded; only a genuinely new empty state
      // created by createEmptyData() explicitly stores false.
      onboardingComplete: parsed.data.onboardingComplete ?? true,
      // Backups predating reading weeks simply have none.
      breaks: parsed.data.breaks ?? [],
      settings: { ...DEFAULT_SETTINGS, ...parsed.data.settings },
    };
  } catch (err) {
    console.warn('CourseCal: could not read stored data.', err);
    return null;
  }
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('CourseCal: could not save data.', err);
  }
}
