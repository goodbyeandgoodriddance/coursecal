import type { ZodIssue } from 'zod';
import type { AppData } from '../types';
import { appDataSchema, SCHEMA_VERSION } from '../store/persistence';

/** Marks a file as ours, so we can reject someone else's JSON with a clear message. */
export const EXPORT_MAGIC = 'coursecal';

export interface ExportPayload {
  app: typeof EXPORT_MAGIC;
  schemaVersion: number;
  exportedAt: string;
  data: AppData;
}

/**
 * Serializes the whole app state for a backup file.
 *
 * Pretty-printed on purpose: a backup you can open, read and hand-fix in a text
 * editor is worth more to a user than a few saved kilobytes.
 */
export function buildExportPayload(data: AppData, now = new Date()): string {
  const payload: ExportPayload = {
    app: EXPORT_MAGIC,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** Suggested filename for the save dialog, e.g. coursecal-backup-2026-09-17.json */
export function suggestedFileName(now = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `coursecal-backup-${yyyy}-${mm}-${dd}.json`;
}

export type ImportResult =
  | { ok: true; data: AppData; exportedAt: string | null }
  | { ok: false; error: string };

/** Turns a zod issue into something a student can actually act on. */
function describeIssue(issue: ZodIssue): string {
  const path = issue.path.join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
}

/**
 * Validates a backup file before it is allowed anywhere near the live store.
 *
 * Every failure path returns a readable reason rather than throwing, because
 * the caller shows this string directly to the user. Importing replaces
 * everything, so the bar for accepting a file is: it parses, it says it is
 * ours, its version is one we understand, and every field passes the same
 * schema the app uses internally.
 */
export function parseImportPayload(raw: string): ImportResult {
  if (raw.trim() === '') {
    return { ok: false, error: 'That file is empty.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: "That file isn't valid JSON, so it can't be a CourseCal backup.",
    };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "That file isn't a CourseCal backup." };
  }

  const envelope = parsed as Partial<ExportPayload>;

  if (envelope.app !== EXPORT_MAGIC) {
    return {
      ok: false,
      error: "That file isn't a CourseCal backup — it's missing the CourseCal marker.",
    };
  }

  if (typeof envelope.schemaVersion !== 'number') {
    return { ok: false, error: 'That backup has no schema version, so it cannot be read safely.' };
  }

  if (envelope.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      error:
        `That backup was saved by a newer version of CourseCal ` +
        `(format ${envelope.schemaVersion}; this app reads ${SCHEMA_VERSION}). ` +
        `Update CourseCal and try again.`,
    };
  }

  if (envelope.schemaVersion < SCHEMA_VERSION) {
    // No older formats exist yet. When one does, migrate here rather than
    // rejecting — but never silently accept data we have not converted.
    return {
      ok: false,
      error:
        `That backup uses an older format (${envelope.schemaVersion}) ` +
        `that this version cannot convert.`,
    };
  }

  const result = appDataSchema.safeParse(envelope.data);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 3).map(describeIssue).join('; ');
    const more = result.error.issues.length > 3 ? ` (+${result.error.issues.length - 3} more)` : '';
    return { ok: false, error: `That backup is damaged — ${issues}${more}.` };
  }

  return {
    ok: true,
    // A backup written before reading weeks existed simply has none.
    data: { ...result.data, breaks: result.data.breaks ?? [] },
    exportedAt: typeof envelope.exportedAt === 'string' ? envelope.exportedAt : null,
  };
}

/** One-line summary of what a file holds, shown before it overwrites anything. */
export function describeData(data: AppData): string {
  const courses = data.courses.length;
  const items = data.items.length;
  const terms = data.terms.length;
  return (
    `${terms} term${terms === 1 ? '' : 's'}, ` +
    `${courses} course${courses === 1 ? '' : 's'}, ` +
    `${items} item${items === 1 ? '' : 's'}`
  );
}
