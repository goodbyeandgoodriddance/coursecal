import { describe, expect, it } from 'vitest';
import type { AppData } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import { SCHEMA_VERSION } from '../store/persistence';
import {
  buildExportPayload,
  describeData,
  parseImportPayload,
  suggestedFileName,
} from './dataFile';

function sampleData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    breaks: [],
    terms: [
      { id: 't1', name: 'Fall 2026', startDate: '2026-08-18', endDate: '2026-12-01', archived: false },
    ],
    courses: [
      { id: 'c1', termId: 't1', code: 'CS201', title: 'Data Structures', colorIndex: 0 },
    ],
    meetings: [
      {
        id: 'm1',
        courseId: 'c1',
        kind: 'lecture',
        weekday: 1,
        startTime: '10:00',
        endTime: '11:30',
        location: 'Turing 204',
      },
    ],
    items: [
      {
        id: 'i1',
        courseId: 'c1',
        title: 'Midterm exam',
        type: 'exam',
        dueAt: '2026-09-25T09:00:00.000Z',
        allDay: false,
        importance: 3,
        gradeWeight: 30,
        done: false,
      },
    ],
    settings: DEFAULT_SETTINGS,
    activeTermId: 't1',
    firedReminders: { 'i1@24': true },
  };
}

describe('buildExportPayload', () => {
  it('round-trips through parseImportPayload without losing anything', () => {
    const original = sampleData();
    const result = parseImportPayload(buildExportPayload(original));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Deep equality is the whole promise of a backup file.
    expect(result.data).toEqual(original);
  });

  it('stamps the file with the app marker, schema version and a timestamp', () => {
    const at = new Date('2026-09-17T12:34:56.000Z');
    const parsed = JSON.parse(buildExportPayload(sampleData(), at));

    expect(parsed.app).toBe('coursecal');
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.exportedAt).toBe('2026-09-17T12:34:56.000Z');
  });

  it('is pretty-printed, so a user can read and hand-fix the file', () => {
    const text = buildExportPayload(sampleData());
    expect(text).toContain('\n  "app": "coursecal"');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('preserves items whose optional fields are absent', () => {
    const data = sampleData();
    // An item with no weight, score, hours or notes must survive untouched
    // rather than gaining `undefined` keys that break deep equality.
    data.items = [
      {
        id: 'i2',
        courseId: 'c1',
        title: 'Reading',
        type: 'reading',
        dueAt: '2026-09-20T23:59:00.000Z',
        allDay: true,
        importance: 2,
        done: false,
      },
    ];
    const result = parseImportPayload(buildExportPayload(data));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items[0]).toEqual(data.items[0]);
    expect('gradeWeight' in (result.data.items[0] as object)).toBe(false);
  });
});

describe('suggestedFileName', () => {
  it('is dated and ends in .json', () => {
    expect(suggestedFileName(new Date(2026, 8, 17))).toBe('coursecal-backup-2026-09-17.json');
  });

  it('zero-pads single-digit months and days', () => {
    expect(suggestedFileName(new Date(2027, 0, 5))).toBe('coursecal-backup-2027-01-05.json');
  });
});

describe('parseImportPayload rejections', () => {
  /** Every rejection must be a readable sentence, not a raw validator dump. */
  function expectReadableRejection(raw: string) {
    const result = parseImportPayload(raw);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a rejection');
    expect(result.error.length).toBeGreaterThan(10);
    expect(result.error).not.toMatch(/ZodError|invalid_type|\[object/i);
    return result.error;
  }

  it('rejects an empty file', () => {
    expect(expectReadableRejection('')).toMatch(/empty/i);
  });

  it('rejects text that is not JSON', () => {
    expect(expectReadableRejection('this is not json at all')).toMatch(/JSON/i);
  });

  it('rejects JSON that is not an object', () => {
    expectReadableRejection('[1, 2, 3]');
    expectReadableRejection('"a string"');
  });

  it("rejects someone else's JSON that lacks the CourseCal marker", () => {
    const error = expectReadableRejection(JSON.stringify({ some: 'other tool', data: {} }));
    expect(error).toMatch(/CourseCal/);
  });

  it('rejects a backup from a newer version, and says so', () => {
    const payload = JSON.parse(buildExportPayload(sampleData()));
    payload.schemaVersion = SCHEMA_VERSION + 1;
    const error = expectReadableRejection(JSON.stringify(payload));
    expect(error).toMatch(/newer version/i);
  });

  it('rejects a backup from an older version rather than guessing at it', () => {
    const payload = JSON.parse(buildExportPayload(sampleData()));
    payload.schemaVersion = SCHEMA_VERSION - 1;
    expect(expectReadableRejection(JSON.stringify(payload))).toMatch(/older format/i);
  });

  it('rejects a payload with no schema version', () => {
    const payload = JSON.parse(buildExportPayload(sampleData()));
    delete payload.schemaVersion;
    expectReadableRejection(JSON.stringify(payload));
  });

  it('rejects a structurally damaged item and names the bad field', () => {
    const payload = JSON.parse(buildExportPayload(sampleData()));
    payload.data.items[0].importance = 7; // only 1, 2, 3 are valid
    const error = expectReadableRejection(JSON.stringify(payload));
    expect(error).toMatch(/damaged/i);
    expect(error).toMatch(/importance/);
  });

  it('rejects orphaned references instead of importing data that breaks views', () => {
    const payload = JSON.parse(buildExportPayload(sampleData()));
    payload.data.items[0].courseId = 'missing-course';
    const error = expectReadableRejection(JSON.stringify(payload));
    expect(error).toMatch(/course that does not exist/i);
  });

  it('rejects impossible calendar dates before they reach date formatting code', () => {
    const payload = JSON.parse(buildExportPayload(sampleData()));
    payload.data.terms[0].startDate = '2026-02-31';
    expect(expectReadableRejection(JSON.stringify(payload))).toMatch(/calendar date/i);
  });

  it('rejects duplicate ids so reducer updates cannot target multiple records', () => {
    const payload = JSON.parse(buildExportPayload(sampleData()));
    payload.data.items.push({ ...payload.data.items[0] });
    expect(expectReadableRejection(JSON.stringify(payload))).toMatch(/duplicate item id/i);
  });

  it('rejects data whose collections are the wrong shape', () => {
    const payload = JSON.parse(buildExportPayload(sampleData()));
    payload.data.items = 'not-an-array';
    expectReadableRejection(JSON.stringify(payload));
  });

  it('rejects a missing data block', () => {
    expectReadableRejection(
      JSON.stringify({ app: 'coursecal', schemaVersion: SCHEMA_VERSION, exportedAt: 'x' }),
    );
  });

  it('caps how many field errors it lists, so the message stays readable', () => {
    const payload = JSON.parse(buildExportPayload(sampleData()));
    payload.data.terms = [{}, {}, {}, {}, {}];
    const error = expectReadableRejection(JSON.stringify(payload));
    expect(error).toMatch(/\+\d+ more/);
    expect(error.length).toBeLessThan(400);
  });
});

describe('describeData', () => {
  it('summarizes the contents for the overwrite confirmation', () => {
    expect(describeData(sampleData())).toBe('1 term, 1 course, 1 item');
  });

  it('pluralizes correctly', () => {
    const data = sampleData();
    data.items = [];
    data.courses = [];
    data.terms = [];
    expect(describeData(data)).toBe('0 terms, 0 courses, 0 items');
  });
});
