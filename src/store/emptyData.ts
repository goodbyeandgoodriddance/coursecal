import { DEFAULT_SETTINGS, type AppData } from '../types';
import { SCHEMA_VERSION } from './persistence';

/**
 * The state a brand-new install starts in: genuinely empty.
 *
 * CourseCal used to seed a demo term with invented courses and instructors,
 * which meant anyone installing it had to delete someone else's fake data
 * before they could use the app. A new user now sees the onboarding wizard
 * instead, and every course and deadline in the app is their own.
 */
export function createEmptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    terms: [],
    breaks: [],
    courses: [],
    meetings: [],
    items: [],
    settings: DEFAULT_SETTINGS,
    activeTermId: null,
    firedReminders: {},
    onboardingComplete: false,
  };
}
