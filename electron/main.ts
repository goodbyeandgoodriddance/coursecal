import { app, BrowserWindow, Notification, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

// vite-plugin-electron sets these: VITE_DEV_SERVER_URL is only present in dev.
const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

let mainWindow: BrowserWindow | null = null;

/** Matches --surface / --text-faint in styles/theme.css. */
const TITLEBAR_BG = '#161922';
const TITLEBAR_SYMBOL = '#9aa3b5';
/** Must match the .titlebar height in styles/theme.css. */
const TITLEBAR_HEIGHT = 32;

/**
 * The app icon. In dev this is read from the repo; once packaged,
 * electron-builder has already baked the icon into the executable, so the
 * lookup failing there is harmless.
 */
function iconPath(): string {
  return path.join(__dirname, '../build/icon.png');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 620,
    // Matches --bg in styles/theme.css so there is no white flash on launch.
    backgroundColor: '#0f1115',
    title: 'CourseCal',
    show: false,
    icon: iconPath(),
    /*
     * Frameless, but not hand-rolled: the app draws its own title bar (see
     * .titlebar in theme.css) while Windows keeps drawing the three window
     * controls into the overlay area on the right. That preserves Snap
     * Layouts on maximize-hover, correct hit targets and accessibility, none
     * of which custom buttons would get for free.
     */
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: TITLEBAR_BG,
      symbolColor: TITLEBAR_SYMBOL,
      height: TITLEBAR_HEIGHT,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // Keep external links out of the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (DEV_SERVER_URL) {
    void mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Renderer asks for a reminder toast. Fire-and-forget: the renderer owns
// scheduling and dedupe (see src/lib/notifications.ts).
ipcMain.on('coursecal:notify', (_event, payload: unknown) => {
  if (!Notification.isSupported()) return;
  const { title, body } = (payload ?? {}) as { title?: unknown; body?: unknown };
  if (typeof title !== 'string' || typeof body !== 'string') return;

  const notification = new Notification({ title, body });
  notification.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  notification.show();
});

// --- Backup file I/O ------------------------------------------------------
// All filesystem access lives here; the renderer never touches `fs`. Every
// handler resolves with a result object and never rejects, so a failed or
// cancelled dialog can't surface as an unhandled rejection in the UI.

/** Save dialog, then write. */
ipcMain.handle(
  'coursecal:export',
  async (_event, json: unknown, suggestedName: unknown) => {
    if (typeof json !== 'string') return { ok: false as const, error: 'Nothing to export.' };

    try {
      const options = {
        title: 'Export CourseCal backup',
        defaultPath: typeof suggestedName === 'string' ? suggestedName : 'coursecal-backup.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      };
      // Parent the dialog to the window when there is one, so it is modal to
      // the app rather than floating free.
      const result = mainWindow
        ? await dialog.showSaveDialog(mainWindow, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { ok: false as const, canceled: true };

      await fs.writeFile(result.filePath, json, 'utf8');
      return { ok: true as const, path: result.filePath };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  },
);

/** Open dialog, then read. Validation happens in the renderer, not here. */
ipcMain.handle('coursecal:import', async () => {
  try {
    const options = {
      title: 'Import CourseCal backup',
      properties: ['openFile' as const],
      filters: [
        { name: 'JSON', extensions: ['json'] },
        { name: 'All files', extensions: ['*'] },
      ],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) return { ok: false as const, canceled: true };

    const json = await fs.readFile(filePath, 'utf8');
    return { ok: true as const, json, path: filePath };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
});

/**
 * Snapshot of the data an import is about to replace, written into the app's
 * own data folder. Silent and automatic: the point is that a user who imports
 * the wrong file has not lost their term.
 */
ipcMain.handle('coursecal:preImportSnapshot', async (_event, json: unknown) => {
  if (typeof json !== 'string') return { ok: false as const, error: 'Nothing to snapshot.' };

  try {
    const dir = path.join(app.getPath('userData'), 'pre-import-snapshots');
    await fs.mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(dir, `before-import-${stamp}.json`);
    await fs.writeFile(filePath, json, 'utf8');
    return { ok: true as const, path: filePath };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
});

// Windows needs an explicit AppUserModelID for notifications to be attributed
// to the app rather than to electron.exe.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.coursecal.app');
}

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
