import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from 'react';
import type {
  AppData,
  Course,
  CourseMeeting,
  Item,
  Settings,
  Term,
  TermBreak,
} from '../types';
import { loadData, saveData } from './persistence';
import { newId } from '../lib/ids';
import { createEmptyData } from './emptyData';


function withoutItemReminders(fired: AppData['firedReminders'], itemIds: Set<string>) {
  if (itemIds.size === 0) return fired;
  const next: AppData['firedReminders'] = {};
  for (const [key, value] of Object.entries(fired)) {
    const itemId = key.split('@', 1)[0];
    if (itemId && !itemIds.has(itemId)) next[key] = value;
  }
  return next;
}

export type Action =
  | { type: 'addItem'; item: Omit<Item, 'id'> }
  | { type: 'updateItem'; id: string; patch: Partial<Item> }
  | { type: 'deleteItem'; id: string }
  | { type: 'toggleItemDone'; id: string }
  | { type: 'addCourse'; course: Omit<Course, 'id'> }
  | { type: 'updateCourse'; id: string; patch: Partial<Course> }
  | { type: 'deleteCourse'; id: string }
  | { type: 'addMeeting'; meeting: Omit<CourseMeeting, 'id'> }
  | { type: 'updateMeeting'; id: string; patch: Partial<CourseMeeting> }
  | { type: 'deleteMeeting'; id: string }
  | { type: 'addTerm'; term: Omit<Term, 'id'> }
  | { type: 'updateTerm'; id: string; patch: Partial<Term> }
  | { type: 'deleteTerm'; id: string }
  | { type: 'addBreak'; entry: Omit<TermBreak, 'id'> }
  | { type: 'updateBreak'; id: string; patch: Partial<TermBreak> }
  | { type: 'deleteBreak'; id: string }
  | { type: 'setActiveTerm'; id: string | null }
  | { type: 'updateSettings'; patch: Partial<Settings> }
  | { type: 'markRemindersFired'; keys: string[] }
  | { type: 'replaceAll'; data: AppData }
  | { type: 'completeOnboarding' };

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'addItem':
      return { ...state, items: [...state.items, { ...action.item, id: newId('item') }] };

    case 'updateItem': {
      const existing = state.items.find((item) => item.id === action.id);
      const dueChanged =
        existing && action.patch.dueAt !== undefined && action.patch.dueAt !== existing.dueAt;
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, ...action.patch } : item,
        ),
        ...(dueChanged
          ? { firedReminders: withoutItemReminders(state.firedReminders, new Set([action.id])) }
          : {}),
      };
    }

    case 'deleteItem':
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.id),
        firedReminders: withoutItemReminders(state.firedReminders, new Set([action.id])),
      };

    case 'toggleItemDone':
      return {
        ...state,
        items: state.items.map((item) => {
          if (item.id !== action.id) return item;
          const done = !item.done;
          const next: Item = { ...item, done };
          if (done) next.completedAt = new Date().toISOString();
          else delete next.completedAt;
          return next;
        }),
      };

    case 'addCourse':
      return { ...state, courses: [...state.courses, { ...action.course, id: newId('course') }] };

    case 'updateCourse':
      return {
        ...state,
        courses: state.courses.map((course) =>
          course.id === action.id ? { ...course, ...action.patch } : course,
        ),
      };

    // Deleting a course takes its meetings and items with it, so no orphans
    // can survive to break the views.
    case 'deleteCourse': {
      const removedItemIds = new Set(
        state.items.filter((item) => item.courseId === action.id).map((item) => item.id),
      );
      return {
        ...state,
        courses: state.courses.filter((course) => course.id !== action.id),
        meetings: state.meetings.filter((meeting) => meeting.courseId !== action.id),
        items: state.items.filter((item) => item.courseId !== action.id),
        firedReminders: withoutItemReminders(state.firedReminders, removedItemIds),
      };
    }

    case 'addMeeting':
      return { ...state, meetings: [...state.meetings, { ...action.meeting, id: newId('meet') }] };

    case 'updateMeeting':
      return {
        ...state,
        meetings: state.meetings.map((meeting) =>
          meeting.id === action.id ? { ...meeting, ...action.patch } : meeting,
        ),
      };

    case 'deleteMeeting':
      return { ...state, meetings: state.meetings.filter((m) => m.id !== action.id) };

    case 'addTerm': {
      const term: Term = { ...action.term, id: newId('term') };
      return {
        ...state,
        terms: [...state.terms, term],
        // A first term becomes active automatically; otherwise leave the
        // current selection alone.
        activeTermId: state.activeTermId ?? term.id,
      };
    }

    case 'updateTerm':
      return {
        ...state,
        terms: state.terms.map((term) =>
          term.id === action.id ? { ...term, ...action.patch } : term,
        ),
      };

    case 'addBreak':
      return {
        ...state,
        breaks: [...state.breaks, { ...action.entry, id: newId('break') }],
      };

    case 'updateBreak':
      return {
        ...state,
        breaks: state.breaks.map((entry) =>
          entry.id === action.id ? { ...entry, ...action.patch } : entry,
        ),
      };

    case 'deleteBreak':
      return { ...state, breaks: state.breaks.filter((entry) => entry.id !== action.id) };

    case 'deleteTerm': {
      const courseIds = new Set(
        state.courses.filter((course) => course.termId === action.id).map((course) => course.id),
      );
      const remainingTerms = state.terms.filter((term) => term.id !== action.id);
      const removedItemIds = new Set(
        state.items.filter((item) => courseIds.has(item.courseId)).map((item) => item.id),
      );
      return {
        ...state,
        terms: remainingTerms,
        breaks: state.breaks.filter((entry) => entry.termId !== action.id),
        courses: state.courses.filter((course) => course.termId !== action.id),
        meetings: state.meetings.filter((meeting) => !courseIds.has(meeting.courseId)),
        items: state.items.filter((item) => !courseIds.has(item.courseId)),
        firedReminders: withoutItemReminders(state.firedReminders, removedItemIds),
        activeTermId:
          state.activeTermId === action.id ? (remainingTerms[0]?.id ?? null) : state.activeTermId,
      };
    }

    case 'setActiveTerm':
      return { ...state, activeTermId: action.id };

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'markRemindersFired': {
      const fired = { ...state.firedReminders };
      for (const key of action.keys) fired[key] = true;
      return { ...state, firedReminders: fired };
    }

    // Wholesale replacement from an imported backup. The data has already been
    // validated against appDataSchema by parseImportPayload, so it is trusted
    // by the time it reaches here; the persisting effect writes it out.
    case 'replaceAll':
      return action.data;

    // Set once the first-run wizard is finished or skipped, so it never
    // reappears on later launches.
    case 'completeOnboarding':
      return { ...state, onboardingComplete: true };

    default:
      return state;
  }
}

function initialState(): AppData {
  return loadData() ?? createEmptyData();
}

interface StoreValue {
  data: AppData;
  dispatch: Dispatch<Action>;
  /** Courses in the active term, or all courses when no term is selected. */
  activeCourses: Course[];
  /** Items belonging to the active term's courses. */
  activeItems: Item[];
  courseById: (id: string) => Course | undefined;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, initialState);

  useEffect(() => {
    saveData(data);
  }, [data]);

  const value = useMemo<StoreValue>(() => {
    const activeCourses = data.activeTermId
      ? data.courses.filter((course) => course.termId === data.activeTermId)
      : data.courses;
    const activeCourseIds = new Set(activeCourses.map((course) => course.id));
    const activeItems = data.items.filter((item) => activeCourseIds.has(item.courseId));
    const courseMap = new Map(data.courses.map((course) => [course.id, course]));

    return {
      data,
      dispatch,
      activeCourses,
      activeItems,
      courseById: (id: string) => courseMap.get(id),
    };
  }, [data]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside a StoreProvider');
  return value;
}
