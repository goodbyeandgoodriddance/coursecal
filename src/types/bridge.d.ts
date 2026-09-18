/**
 * The complete surface electron/preload.ts exposes to the renderer.
 *
 * Kept in one declaration file because both the preload script and several
 * renderer modules depend on it; if they drift, the app breaks silently at
 * runtime rather than at compile time.
 *
 * `window.coursecal` is optional on purpose: the renderer also runs in a plain
 * browser during `vite` development, where there is no preload at all, so every
 * call site must handle its absence.
 */

/** Result of a main-process file operation. Never throws across the bridge. */
export type FileResult<T> =
  | ({ ok: true } & T)
  | { ok: false; canceled?: boolean; error?: string };

export interface CourseCalBridge {
  /** Fire-and-forget desktop notification. */
  notify: (payload: { title: string; body: string }) => void;

  /** Native save dialog, then writes `json`. Resolves with the path written. */
  exportData: (json: string, suggestedName: string) => Promise<FileResult<{ path: string }>>;

  /** Native open dialog, then reads the chosen file. Resolves with its contents. */
  importData: () => Promise<FileResult<{ json: string; path: string }>>;

  /**
   * Writes a copy of the current data into the app's own data folder before a
   * destructive import, so a bad import is recoverable.
   */
  preImportSnapshot: (json: string) => Promise<FileResult<{ path: string }>>;

  /** True when running inside Electron rather than a plain browser tab. */
  isDesktop: boolean;
}

declare global {
  interface Window {
    coursecal?: CourseCalBridge;
  }

  /**
   * The app version, injected by Vite from package.json at build time — see
   * `define` in vite.config.ts. Declared inside `declare global` because this
   * file is a module; a bare `declare const` here would be module-scoped.
   */
  const __APP_VERSION__: string;
}
