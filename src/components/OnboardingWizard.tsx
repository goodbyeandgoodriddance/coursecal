import { addMonths } from 'date-fns';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { toDateKey } from '../lib/dates';
import { courseLabel, isCodeTaken } from '../lib/courses';
import { courseColorVar } from './CourseBadge';
import {
  Add,
  Bell,
  DatabaseBackup,
  GraduationCap,
  Keyboard,
  NavMonth,
  NavPriority,
  NavSettings,
  NavWeek,
  Sparkles,
  WandSparkles,
} from './Icon';

type TourView = 'dashboard' | 'month' | 'week' | 'courses' | 'settings';

interface Props {
  now: Date;
  currentView: TourView;
  onViewChange: (view: TourView) => void;
  onComplete: () => void;
}

interface TourStep {
  id: string;
  title: string;
  eyebrow: string;
  body: string;
  bullets: string[];
  view?: TourView;
  target?: string;
  icon: typeof Sparkles;
}

const FEATURE_STEPS: TourStep[] = [
  {
    id: 'quick-add',
    title: 'Capture work without breaking focus',
    eyebrow: 'Quick add',
    body: 'Type a course code, task, date, time, grade weight, and optional ! in one line. CourseCal previews exactly how it understood you before anything is created.',
    bullets: ['“CS201 essay fri 5pm 20%” works', 'Press / anywhere to focus this field', 'Ambiguous entries open the full form instead of guessing'],
    view: 'dashboard',
    target: 'quick-add',
    icon: WandSparkles,
  },
  {
    id: 'priority',
    title: 'Work the list, not the calendar',
    eyebrow: 'Priority',
    body: 'This is the home screen: overdue work stays pinned, then upcoming work is ranked from urgency, grade impact, and your manual importance flag.',
    bullets: ['Check an item off from the row', 'Open any row to edit details', 'The score bar explains why work is ordered this way', 'Workload ahead groups explicit grade weight and estimated hours by week'],
    view: 'dashboard',
    target: 'priority-view',
    icon: NavPriority,
  },
  {
    id: 'item-details',
    title: 'Every deadline can carry the details that matter',
    eyebrow: 'Item editor',
    body: 'Press N for the full item form. You can set the due time, type, importance, grade weight, score earned, estimated hours, and notes.',
    bullets: ['Leave time blank for an all-day deadline', 'Grade weight feeds priority and workload', 'Score earned feeds the running course grade'],
    icon: Add,
  },
  {
    id: 'month',
    title: 'Scan the month and add by date',
    eyebrow: 'Month',
    body: 'The Term Calendar keeps deadlines visually anchored to dates. Select empty space on a day to create work there, or select a chip to edit it.',
    bullets: ['Course colors stay consistent across the app', 'Overdue work gets its own urgency treatment', 'Keyboard focus works on both days and deadline chips'],
    view: 'month',
    target: 'month-view',
    icon: NavMonth,
  },
  {
    id: 'week',
    title: 'Put classes and deadlines on one timetable',
    eyebrow: 'Week',
    body: 'Recurring course meetings and timed deadlines share one weekly grid. All-day work lives in the due strip above it.',
    bullets: ['Class meetings come from Courses', 'Deadline markers open the full item editor', 'The visible hours expand when an early or late event needs room'],
    view: 'week',
    target: 'week-view',
    icon: NavWeek,
  },
  {
    id: 'courses',
    title: 'Courses are the source of truth',
    eyebrow: 'Courses',
    body: 'Manage terms, course codes, recurring meeting times, and the work attached to each course. Graded items roll up into a live grade automatically.',
    bullets: ['Course codes power quick add', 'Add lectures, labs, tutorials, or seminars', 'Weighted graded work produces a running grade'],
    view: 'courses',
    target: 'courses-view',
    icon: GraduationCap,
  },
  {
    id: 'settings-priority',
    title: 'Tune what “important” means to you',
    eyebrow: 'Priority settings',
    body: 'The three scoring weights are normalized automatically. Change the balance between deadline urgency, grade impact, and your manual importance flag, then watch the preview reorder live.',
    bullets: ['Horizon controls how far ahead Priority looks', 'Overdue work always stays pinned above scoring', 'Reset returns the scoring balance to defaults'],
    view: 'settings',
    target: 'priority-settings',
    icon: NavSettings,
  },
  {
    id: 'reminders',
    title: 'Choose when CourseCal should nudge you',
    eyebrow: 'Reminders',
    body: 'Desktop reminders fire at the lead times you choose while CourseCal is running. Each threshold fires once, even across restarts.',
    bullets: ['Notifications can be disabled entirely', 'Add or remove custom lead times', 'Default lead times are 24 hours and 1 hour'],
    view: 'settings',
    target: 'reminders-settings',
    icon: Bell,
  },
  {
    id: 'data',
    title: 'Your data stays local — back it up',
    eyebrow: 'Data',
    body: 'CourseCal has no account or cloud backend. Export a readable JSON backup before moving computers or clearing app data; imports are validated before replacing anything.',
    bullets: ['Export includes courses, work, grades, and settings', 'Import asks before replacing current data', 'A pre-import snapshot is saved automatically'],
    view: 'settings',
    target: 'data-settings',
    icon: DatabaseBackup,
  },
  {
    id: 'shortcuts',
    title: 'A few keys make the whole app faster',
    eyebrow: 'Keyboard',
    body: 'You can keep your hands off the mouse for the common navigation loop.',
    bullets: ['/ focuses quick add', 'N opens a new item', '1–5 switch Priority, Month, Week, Courses, and Settings'],
    view: 'dashboard',
    target: 'sidebar-nav',
    icon: Keyboard,
  },
];

function defaultTermName(now: Date): string {
  const month = now.getMonth();
  const season = month >= 7 ? 'Fall' : month >= 4 ? 'Summer' : 'Spring';
  return `${season} ${now.getFullYear()}`;
}

export function OnboardingWizard({ now, currentView, onViewChange, onComplete }: Props) {
  const { data, activeCourses, dispatch } = useStore();
  const [step, setStep] = useState(0);
  const [termForm, setTermForm] = useState(() => ({
    name: defaultTermName(now),
    startDate: toDateKey(now),
    endDate: toDateKey(addMonths(now, 4)),
  }));
  const [courseForm, setCourseForm] = useState(() => ({
    code: '',
    title: '',
    instructor: '',
    colorIndex: 0,
  }));

  const totalSteps = FEATURE_STEPS.length + 3;
  const featureIndex = step - 3;
  const feature = featureIndex >= 0 ? FEATURE_STEPS[featureIndex] : undefined;
  const activeTerm = data.terms.find((term) => term.id === data.activeTermId);
  const hasTerm = Boolean(activeTerm);
  const hasCourse = activeCourses.length > 0;

  const courseCodeTaken = useMemo(
    () => isCodeTaken(activeCourses, courseForm.code),
    [activeCourses, courseForm.code],
  );

  const termValid =
    termForm.name.trim().length > 0 &&
    termForm.startDate.length > 0 &&
    termForm.endDate.length > 0 &&
    termForm.endDate >= termForm.startDate;
  // The title is what identifies a course; the code is optional.
  const courseValid =
    courseForm.title.trim().length > 0 && !courseCodeTaken && Boolean(data.activeTermId);

  useEffect(() => {
    if (!feature?.view || feature.view === currentView) return;
    onViewChange(feature.view);
  }, [feature, currentView, onViewChange]);

  // Contextual feature steps highlight the real interface rather than showing
  // screenshots that can drift out of date. The class is always removed on
  // cleanup, including if the wizard is skipped midway through a step.
  useEffect(() => {
    if (!feature?.target) return;
    let element: HTMLElement | null = null;
    const timer = window.setTimeout(() => {
      element = document.querySelector<HTMLElement>(`[data-tour="${feature.target}"]`);
      if (!element) return;
      element.classList.add('tour-highlight');
      element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }, 60);
    return () => {
      window.clearTimeout(timer);
      element?.classList.remove('tour-highlight');
    };
  }, [feature, currentView]);

  /**
   * Memoized so the keydown effect below has a genuinely stable dependency;
   * as a plain function it changed identity on every render and the effect
   * re-subscribed the window listener each time.
   */
  const advance = useCallback(() => {
    if (step >= totalSteps - 1) {
      onComplete();
      return;
    }
    setStep((value) => value + 1);
  }, [step, totalSteps, onComplete]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (typing) return;
      if (event.key === 'ArrowRight' && step >= 3) {
        event.preventDefault();
        advance();
      } else if (event.key === 'ArrowLeft' && step > 0) {
        event.preventDefault();
        setStep((value) => Math.max(0, value - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `step` and `advance` are the only values the handler closes over. Without
    // this list the effect re-subscribed the window listener on every single
    // render of the wizard.
  }, [step, advance]);


  function saveTermAndContinue() {
    if (!termValid) return;
    dispatch({
      type: 'addTerm',
      term: {
        name: termForm.name.trim(),
        startDate: termForm.startDate,
        endDate: termForm.endDate,
        archived: false,
      },
    });
    advance();
  }

  function saveCourseAndContinue() {
    if (!courseValid || !data.activeTermId) return;
    dispatch({
      type: 'addCourse',
      course: {
        termId: data.activeTermId,
        title: courseForm.title.trim(),
        ...(courseForm.code.trim()
          ? { code: courseForm.code.trim().toLocaleUpperCase() }
          : {}),
        colorIndex: courseForm.colorIndex,
        ...(courseForm.instructor.trim() ? { instructor: courseForm.instructor.trim() } : {}),
      },
    });
    advance();
  }

  if (step === 0) {
    return (
      <div className="onboarding-backdrop">
        <section className="onboarding-welcome" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
          <div className="onboarding-mark"><Sparkles size={25} /></div>
          <div className="onboarding-kicker">Welcome to CourseCal</div>
          <h2 id="onboarding-title">Know what to work on next.</h2>
          <p>
            CourseCal combines your deadlines, grade weight, and personal importance into one focused priority list — while keeping your calendar, class timetable, grades, reminders, and backups close by.
          </p>
          <div className="onboarding-feature-grid">
            <div><NavPriority size={17} /><strong>Prioritize</strong><span>See the work that matters most.</span></div>
            <div><NavWeek size={17} /><strong>Plan</strong><span>Keep classes and deadlines together.</span></div>
            <div><DatabaseBackup size={17} /><strong>Own your data</strong><span>Local-first, exportable, no account.</span></div>
          </div>
          <div className="onboarding-actions">
            <button className="ghost" onClick={onComplete}>Skip tour</button>
            <button className="primary" onClick={advance}>Set up CourseCal</button>
          </div>
        </section>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="onboarding-backdrop">
        <section className="onboarding-setup" role="dialog" aria-modal="true" aria-labelledby="onboarding-term-title">
          <TourProgress step={step} total={totalSteps} />
          <div className="onboarding-kicker">First, your term</div>
          <h2 id="onboarding-term-title">Give your courses a home.</h2>
          {hasTerm ? (
            <div className="setup-existing">
              <span className="setup-check">✓</span>
              <div><strong>{activeTerm?.name}</strong><span>Your active term is already ready.</span></div>
            </div>
          ) : (
            <div className="setup-fields">
              <div className="field">
                <label className="field-label" htmlFor="onboarding-term-name">Term name</label>
                <input id="onboarding-term-name" autoFocus value={termForm.name} onChange={(event) => setTermForm({ ...termForm, name: event.target.value })} placeholder="Fall 2026" />
              </div>
              <div className="field-row">
                <div className="field">
                  <label className="field-label" htmlFor="onboarding-term-start">Starts</label>
                  <input id="onboarding-term-start" type="date" value={termForm.startDate} onChange={(event) => setTermForm({ ...termForm, startDate: event.target.value })} />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="onboarding-term-end">Ends</label>
                  <input id="onboarding-term-end" type="date" value={termForm.endDate} min={termForm.startDate} onChange={(event) => setTermForm({ ...termForm, endDate: event.target.value })} />
                </div>
              </div>
              {termForm.endDate < termForm.startDate && <div className="form-error">End date must be on or after the start date.</div>}
            </div>
          )}
          <div className="onboarding-actions">
            <button className="ghost" onClick={() => setStep(0)}>Back</button>
            <div className="spacer" />
            {hasTerm ? (
              <button className="primary" onClick={advance}>Continue</button>
            ) : (
              <button className="primary" onClick={saveTermAndContinue} disabled={!termValid}>Add term</button>
            )}
          </div>
        </section>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="onboarding-backdrop">
        <section className="onboarding-setup" role="dialog" aria-modal="true" aria-labelledby="onboarding-course-title">
          <TourProgress step={step} total={totalSteps} />
          <div className="onboarding-kicker">Now, a course</div>
          <h2 id="onboarding-course-title">Add the code you actually type.</h2>
          <p className="onboarding-copy">Course codes are more than labels: they are how quick add knows where new work belongs.</p>
          {hasCourse ? (
            <div className="setup-existing">
              <span className="setup-check">✓</span>
              <div><strong>{courseLabel(activeCourses[0])}</strong><span>You already have {activeCourses.length} course{activeCourses.length === 1 ? '' : 's'} in this term.</span></div>
            </div>
          ) : (
            <div className="setup-fields">
              <div className="field-row">
                <div className="field">
                  <label className="field-label" htmlFor="onboarding-course-title-field">Course title</label>
                  <input id="onboarding-course-title-field" autoFocus value={courseForm.title} onChange={(event) => setCourseForm({ ...courseForm, title: event.target.value })} placeholder="Modern Literature" />
                </div>
                <div className="field">
                  <label className="field-label" htmlFor="onboarding-course-code">Course code <span className="optional-label">optional</span></label>
                  <input id="onboarding-course-code" value={courseForm.code} onChange={(event) => setCourseForm({ ...courseForm, code: event.target.value.toLocaleUpperCase() })} placeholder="ENG210" />
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="onboarding-course-instructor">Instructor <span className="optional-label">optional</span></label>
                <input id="onboarding-course-instructor" value={courseForm.instructor} onChange={(event) => setCourseForm({ ...courseForm, instructor: event.target.value })} placeholder="Professor name" />
              </div>
              <div className="field">
                <span className="field-label">Accent color</span>
                <div className="color-swatches onboarding-swatches">
                  {Array.from({ length: 8 }, (_, index) => (
                    <button key={index} type="button" className={`swatch${courseForm.colorIndex === index ? ' selected' : ''}`} style={{ background: courseColorVar(index) }} onClick={() => setCourseForm({ ...courseForm, colorIndex: index })} aria-label={`Accent color ${index + 1}`} />
                  ))}
                </div>
              </div>
              {courseCodeTaken && <div className="form-error">That course code is already used in this term.</div>}
            </div>
          )}
          <div className="onboarding-actions">
            <button className="ghost" onClick={() => setStep(1)}>Back</button>
            {!hasCourse && <button className="ghost" onClick={advance}>Do this later</button>}
            <div className="spacer" />
            {hasCourse ? (
              <button className="primary" onClick={advance}>Continue</button>
            ) : (
              <button className="primary" onClick={saveCourseAndContinue} disabled={!courseValid}>Add course</button>
            )}
          </div>
        </section>
      </div>
    );
  }

  if (!feature) return null;
  const FeatureIcon = feature.icon;
  const isLast = step === totalSteps - 1;

  return (
    <aside className="tour-panel" role="dialog" aria-label={`CourseCal tour: ${feature.title}`}>
      <TourProgress step={step} total={totalSteps} />
      <div className="tour-heading-row">
        <span className="tour-icon"><FeatureIcon size={17} /></span>
        <div>
          <div className="onboarding-kicker">{feature.eyebrow}</div>
          <h2>{feature.title}</h2>
        </div>
      </div>
      <p>{feature.body}</p>
      <ul>
        {feature.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
      </ul>
      <div className="tour-tip">Use ← and → to move through the tour.</div>
      <div className="onboarding-actions compact">
        <button className="ghost" onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</button>
        <button className="ghost" onClick={onComplete}>Skip</button>
        <div className="spacer" />
        <button className="primary" onClick={advance}>{isLast ? 'Finish' : 'Next'}</button>
      </div>
    </aside>
  );
}

function TourProgress({ step, total }: { step: number; total: number }) {
  return (
    <div className="tour-progress" aria-label={`Step ${step + 1} of ${total}`}>
      <span>Step {step + 1} of {total}</span>
      <div className="tour-progress-track"><span style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
    </div>
  );
}
