import { addDays, setHours, setMinutes, startOfDay } from 'date-fns';
import type { Course, Importance, ItemType } from '../types';
import { ITEM_TYPES } from '../types';
import { findCourseByToken } from './courses';

export interface QuickAddDraft {
  courseId: string | null;
  title: string;
  type: ItemType;
  /** Local Date for the due moment, or null if no date was recognized. */
  due: Date | null;
  allDay: boolean;
  importance: Importance;
  gradeWeight?: number;
  /** True when enough was understood to create an item without opening the form. */
  confident: boolean;
}

const WEEKDAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTH_NAMES: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const TYPE_KEYWORDS: Record<string, ItemType> = {
  exam: 'exam', midterm: 'exam', final: 'exam', test: 'exam',
  quiz: 'quiz',
  reading: 'reading', read: 'reading', chapter: 'reading',
  project: 'project',
  assignment: 'assignment', hw: 'assignment', homework: 'assignment',
  lab: 'assignment', essay: 'assignment', paper: 'assignment',
};

/** Next occurrence of `weekday`; today's weekday is treated as a week away. */
function nextWeekday(from: Date, weekday: number, forceNextWeek: boolean): Date {
  let delta = (weekday - from.getDay() + 7) % 7;
  if (delta === 0) delta = 7;
  if (forceNextWeek && delta < 7) delta += 7;
  return startOfDay(addDays(from, delta));
}

/**
 * Parses a single line like "CS201 essay fri 5pm 20%" into a draft item.
 *
 * Recognized tokens are consumed and removed; whatever survives becomes the
 * title. `confident` is false when no course or no date was found, which the
 * caller uses to open the full form rather than silently guessing.
 */
export function parseQuickAdd(input: string, courses: Course[], now: Date): QuickAddDraft {
  let tokens = input.trim().split(/\s+/).filter(Boolean);

  const consumed = new Set<number>();
  const take = (index: number) => consumed.add(index);
  let invalidStructuredToken = false;

  // --- importance: a trailing "!" marks the item as high priority ---
  let importance: Importance = 2;
  tokens = tokens
    .map((token) => {
      const match = /^(.*?)(!{1,2})$/.exec(token);
      if (!match) return token;
      importance = 3;
      return match[1] ?? '';
    })
    .filter((token) => token.length > 0);

  // --- course: match a token against the known course codes ---
  let courseId: string | null = null;
  tokens.forEach((token, index) => {
    if (courseId) return;
    // Matches a course code when the course has one, and its title otherwise,
    // so a course with no code is still reachable from quick add.
    const match = findCourseByToken(courses, token);
    if (match) {
      courseId = match.id;
      take(index);
    }
  });

  // --- grade weight: "20%" ---
  let gradeWeight: number | undefined;
  tokens.forEach((token, index) => {
    if (gradeWeight !== undefined) return;
    const match = /^(\d{1,3}(?:\.\d+)?)%$/.exec(token);
    if (!match) return;
    const value = Number(match[1]);
    if (value >= 0 && value <= 100) {
      gradeWeight = value;
      take(index);
    } else {
      invalidStructuredToken = true;
    }
  });

  // --- time: "5pm", "5:30pm", "17:00" ---
  let clock: { hours: number; minutes: number } | null = null;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] as string;

    const ampm = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/i.exec(token);
    if (ampm) {
      const rawHour = Number(ampm[1]);
      const parsedMinute = Number(ampm[2] ?? 0);
      if (rawHour >= 1 && rawHour <= 12 && parsedMinute <= 59) {
        let parsedHour = rawHour % 12;
        if (ampm[3]?.toLowerCase() === 'pm') parsedHour += 12;
        clock = { hours: parsedHour, minutes: parsedMinute };
        take(i);
        break;
      }
      invalidStructuredToken = true;
    }

    const military = /^(\d{1,2}):(\d{2})$/.exec(token);
    if (military) {
      const parsedHour = Number(military[1]);
      const parsedMinute = Number(military[2]);
      if (parsedHour <= 23 && parsedMinute <= 59) {
        clock = { hours: parsedHour, minutes: parsedMinute };
        take(i);
        break;
      }
      invalidStructuredToken = true;
    }
  }

  // --- date ---
  const lower = tokens.map((token) => token.toLowerCase().replace(/[.,]$/, ''));
  let dueDay: Date | null = null;

  for (let i = 0; i < lower.length; i += 1) {
    if (consumed.has(i)) continue;
    const token = lower[i] as string;

    if (token === 'today' || token === 'tonight') {
      dueDay = startOfDay(now);
      take(i);
      break;
    }

    if (token === 'tomorrow' || token === 'tmr' || token === 'tmrw') {
      dueDay = startOfDay(addDays(now, 1));
      take(i);
      break;
    }

    // "next mon" / "this fri" / "next week"
    if (token === 'next' || token === 'this') {
      const following = lower[i + 1];
      if (following) {
        const weekday = WEEKDAY_NAMES[following];
        if (weekday !== undefined) {
          dueDay = nextWeekday(now, weekday, token === 'next');
          take(i);
          take(i + 1);
          break;
        }
        if (following === 'week') {
          dueDay = startOfDay(addDays(now, 7));
          take(i);
          take(i + 1);
          break;
        }
      }
    }

    // bare weekday name
    const weekday = WEEKDAY_NAMES[token];
    if (weekday !== undefined) {
      dueDay = nextWeekday(now, weekday, false);
      take(i);
      break;
    }

    // "dec 4" / "dec 4th"
    const month = MONTH_NAMES[token];
    if (month !== undefined) {
      const dayToken = lower[i + 1];
      const day = dayToken ? Number(dayToken.replace(/(st|nd|rd|th)$/, '')) : NaN;
      if (Number.isInteger(day) && day >= 1 && day <= 31) {
        const year = month < now.getMonth() ? now.getFullYear() + 1 : now.getFullYear();
        const candidate = new Date(year, month, day);
        if (candidate.getFullYear() === year && candidate.getMonth() === month && candidate.getDate() === day) {
          dueDay = candidate;
          take(i);
          take(i + 1);
          break;
        }
      }
    }

    // "12/4" or "12/4/26" — month/day, matching US convention
    const numeric = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(token);
    if (numeric) {
      const monthIndex = Number(numeric[1]) - 1;
      const day = Number(numeric[2]);
      const yearRaw = numeric[3];
      if (monthIndex >= 0 && monthIndex <= 11 && day >= 1 && day <= 31) {
        let year = now.getFullYear();
        if (yearRaw) {
          year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
        } else if (monthIndex < now.getMonth()) {
          year += 1;
        }
        const candidate = new Date(year, monthIndex, day);
        if (candidate.getFullYear() === year && candidate.getMonth() === monthIndex && candidate.getDate() === day) {
          dueDay = candidate;
          take(i);
          break;
        }
      }
    }

    // "in 3 days" / "in 2 weeks"
    if (token === 'in') {
      const amount = Number(lower[i + 1]);
      const unit = lower[i + 2];
      if (Number.isFinite(amount) && amount >= 0 && unit) {
        if (unit.startsWith('day')) dueDay = startOfDay(addDays(now, amount));
        else if (unit.startsWith('week')) dueDay = startOfDay(addDays(now, amount * 7));
        if (dueDay) {
          take(i);
          take(i + 1);
          take(i + 2);
          break;
        }
      }
    }
  }

  // --- type keyword (left in the title, where it reads naturally) ---
  let type: ItemType = 'assignment';
  for (let i = 0; i < lower.length; i += 1) {
    if (consumed.has(i)) continue;
    const token = lower[i] as string;
    const mapped = TYPE_KEYWORDS[token] ?? ITEM_TYPES.find((candidate) => candidate === token);
    if (mapped) {
      type = mapped;
      break;
    }
  }

  const title = tokens
    .filter((_, index) => !consumed.has(index))
    .join(' ')
    .trim();

  const allDay = clock === null;
  let due: Date | null = null;
  if (dueDay) {
    due = clock
      ? setMinutes(setHours(dueDay, clock.hours), clock.minutes)
      : setMinutes(setHours(dueDay, 23), 59);
  }

  return {
    courseId,
    title,
    type,
    due,
    allDay,
    importance,
    ...(gradeWeight !== undefined ? { gradeWeight } : {}),
    confident: Boolean(courseId && due && title.length > 0 && !invalidStructuredToken),
  };
}
