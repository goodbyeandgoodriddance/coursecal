import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Item } from './types';
import { StoreProvider, useStore } from './store/StoreContext';
import { DashboardView } from './views/DashboardView';
import { MonthView } from './views/MonthView';
import { WeekView } from './views/WeekView';
import { CoursesView } from './views/CoursesView';
import { SettingsView } from './views/SettingsView';
import { QuickAddBar } from './components/QuickAddBar';
import { ItemModal, draftFromItem, emptyDraft, type ItemDraft } from './components/ItemModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { OnboardingWizard } from './components/OnboardingWizard';
import {
  ICON_NAV,
  NavCourses,
  NavMonth,
  NavPriority,
  NavSettings,
  NavWeek,
} from './components/Icon';
import { collectDueReminders, sendNotification } from './lib/notifications';

type ViewId = 'dashboard' | 'month' | 'week' | 'courses' | 'settings';

type IconComponent = typeof NavPriority;

const NAV: { id: ViewId; label: string; Icon: IconComponent; key: string }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: NavPriority, key: '1' },
  { id: 'month', label: 'Term Calendar', Icon: NavMonth, key: '2' },
  { id: 'week', label: 'Weekly Schedule', Icon: NavWeek, key: '3' },
  { id: 'courses', label: 'Courses', Icon: NavCourses, key: '4' },
  { id: 'settings', label: 'Settings', Icon: NavSettings, key: '5' },
];

/** How often to re-check reminders and refresh relative due text. */
const TICK_MS = 60_000;

function Shell() {
  const { data, activeCourses, dispatch } = useStore();
  const [view, setView] = useState<ViewId>('dashboard');
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [needsCourse, setNeedsCourse] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(() => data.onboardingComplete === false);
  // A single clock for the whole app, so every view agrees on "now" and the
  // relative due text refreshes without each component holding its own timer.
  const [now, setNow] = useState(() => new Date());
  const quickAddRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  // Reminder scheduler. Runs on every tick and on data changes, sends any
  // reminder whose threshold has passed, then records it as fired so it never
  // repeats — including across restarts, since firedReminders is persisted.
  useEffect(() => {
    const due = collectDueReminders(
      data.items,
      data.courses,
      data.settings,
      data.firedReminders,
      now,
    );
    if (due.length === 0) return;

    for (const reminder of due) sendNotification(reminder);
    dispatch({ type: 'markRemindersFired', keys: due.map((reminder) => reminder.key) });
  }, [now, data.items, data.courses, data.settings, data.firedReminders, dispatch]);

  const openNewItem = useCallback(
    (dateKey?: string) => {
      const courseId = activeCourses[0]?.id;
      if (!courseId) {
        // Every item must belong to a course, so say so and send them there.
        setNeedsCourse(true);
        return;
      }
      const base = emptyDraft(courseId, dateKey ? new Date(`${dateKey}T12:00:00`) : new Date());
      setDraft(dateKey ? { ...base, dateKey } : base);
    },
    [activeCourses],
  );

  // Global shortcuts. Suppressed while typing so they never eat input.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (draft || onboardingOpen) return;

      if (event.key === '/') {
        event.preventDefault();
        quickAddRef.current?.focus();
        return;
      }
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        openNewItem();
        return;
      }
      const nav = NAV.find((entry) => entry.key === event.key);
      if (nav) {
        event.preventDefault();
        setView(nav.id);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, onboardingOpen, openNewItem]);

  const openItem = useCallback((item: Item) => setDraft(draftFromItem(item)), []);

  const activeTermName = useMemo(
    () => data.terms.find((term) => term.id === data.activeTermId)?.name ?? 'No term',
    [data.terms, data.activeTermId],
  );

  function saveItem(values: Omit<Item, 'id'>, id?: string) {
    if (id) {
      // Editing must not silently un-complete an item, so `done` and
      // `completedAt` are preserved rather than taken from the form.
      const existing = data.items.find((item) => item.id === id);
      dispatch({
        type: 'updateItem',
        id,
        patch: {
          ...values,
          done: existing?.done ?? false,
          ...(existing?.completedAt ? { completedAt: existing.completedAt } : {}),
        },
      });
    } else {
      dispatch({ type: 'addItem', item: values });
    }
  }

  return (
    <>
      {/* Frameless window: this bar is the app's own title bar and the only
          draggable region. The three window controls are drawn by Windows into
          the reserved overlay area on the right. */}
      <div className="titlebar">
        <span className="titlebar-title">CourseCal</span>
      </div>

      <div className="app">
      <nav className="sidebar" data-tour="sidebar-nav" aria-label="Main navigation">
        <div className="brand">
          <span className="brand-name">CourseCal</span>
          <span className="brand-version">v{__APP_VERSION__}</span>
        </div>

        {NAV.map((entry) => (
          <button
            key={entry.id}
            className={`nav-button${view === entry.id ? ' active' : ''}`}
            onClick={() => setView(entry.id)}
            aria-current={view === entry.id ? 'page' : undefined}
          >
            <span className="nav-icon">
              <entry.Icon size={ICON_NAV} strokeWidth={2} />
            </span>
            {entry.label}
            <span className="nav-key">{entry.key}</span>
          </button>
        ))}

        <div className="sidebar-spacer" />

        <div className="sidebar-footer">
          <div className="term-label">Active term</div>
          <select
            className="term-select"
            data-tour="term-switcher"
            value={data.activeTermId ?? ''}
            onChange={(event) =>
              dispatch({ type: 'setActiveTerm', id: event.target.value || null })
            }
            aria-label="Active term"
          >
            {data.terms.length === 0 && <option value="">No terms</option>}
            {data.terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name}
                {term.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 9, lineHeight: 1.7 }}>
            <span className="kbd">/</span> quick add · <span className="kbd">n</span> new
          </div>
        </div>
      </nav>

      <main className="main">
        {(view === 'dashboard' || view === 'month' || view === 'week') && (
          <QuickAddBar
            ref={quickAddRef}
            courses={activeCourses}
            now={now}
            onAdd={(values) => dispatch({ type: 'addItem', item: values })}
            onEscalate={(nextDraft) => {
              if (activeCourses.length === 0) {
                setNeedsCourse(true);
                return;
              }
              setDraft(nextDraft);
            }}
          />
        )}

        <div className="main-scroll">
          {view === 'dashboard' && (
            <DashboardView
              now={now}
              onOpenItem={openItem}
              onNewItem={() => openNewItem()}
              onOpenCalendar={() => setView('month')}
            />
          )}
          {view === 'month' && (
            <MonthView now={now} onOpenItem={openItem} onCreateOnDate={openNewItem} />
          )}
          {view === 'week' && <WeekView now={now} onOpenItem={openItem} />}
          {view === 'courses' && <CoursesView onOpenItem={openItem} />}
          {view === 'settings' && (
            <SettingsView now={now} onStartOnboarding={() => setOnboardingOpen(true)} />
          )}
        </div>
      </main>

      {draft && (
        <ItemModal
          draft={draft}
          courses={activeCourses}
          onSave={saveItem}
          onDelete={(id) => dispatch({ type: 'deleteItem', id })}
          onClose={() => setDraft(null)}
        />
      )}

      {needsCourse && (
        <ConfirmDialog
          info
          title="Add a course first"
          body="Every item belongs to a course, so there has to be at least one before you can add work. Taking you to Courses."
          confirmLabel="Go to Courses"
          onClose={() => {
            setNeedsCourse(false);
            setView('courses');
          }}
        />
      )}

      {onboardingOpen && (
        <OnboardingWizard
          now={now}
          currentView={view}
          onViewChange={setView}
          onComplete={() => {
            dispatch({ type: 'completeOnboarding' });
            setOnboardingOpen(false);
          }}
        />
      )}

      {/* Term name is in the footer select; this keeps it reachable to
          screen readers when the select is collapsed. */}
      <span className="sr-only">{activeTermName}</span>
      </div>
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
