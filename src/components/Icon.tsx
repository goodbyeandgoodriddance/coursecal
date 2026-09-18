/**
 * Every icon the app uses, in one place.
 *
 * Re-exported under app-meaning names rather than imported directly at each
 * call site, so swapping the icon for a concept is a one-line change here
 * instead of a hunt through the views. Lucide is ISC licensed and
 * tree-shakeable: only the icons named below end up in the bundle.
 *
 * Icons inherit `currentColor`, so the existing text colors in theme.css keep
 * working with no extra styling.
 */
export {
  // Sidebar navigation
  ListOrdered as NavPriority,
  CalendarDays as NavMonth,
  CalendarRange as NavWeek,
  GraduationCap as NavCourses,
  SlidersHorizontal as NavSettings,

  // Actions
  X as Close,
  Plus as Add,
  Trash2 as Delete,
  SquarePen as Edit,
  CalendarOff as Break,
  Download as Export,
  Upload as Import,
  RotateCcw as Reset,
  WandSparkles,
  Sparkles,
  Keyboard,
  Bell,
  DatabaseBackup,
  GraduationCap,

  // Calendar navigation
  ChevronLeft as PrevArrow,
  ChevronRight as NextArrow,

  // Status and states
  TriangleAlert as AlertTriangle,
  CalendarClock as DueToday,
  Info,
  CircleCheck as ItemDone,
  Circle as ItemPending,

  // Empty states
  ClipboardCheck as NothingDue,
  BookPlus as NoCourses,
  CalendarPlus as NothingScheduled,
} from 'lucide-react';

/** Inline icons sit alongside 11-13px text; nav icons alongside 13.5px. */
export const ICON_INLINE = 13;
export const ICON_NAV = 16;
