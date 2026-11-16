import { app, BrowserWindow, nativeTheme, shell } from 'electron';
import path from 'node:path';
import { Paths } from './core/paths';
import { registerIpc } from './ipc';
import { SessionManager } from './core/launcher';
import { flushStore, getSettings } from './core/store';

/**
 * The main process.
 *
 * One window, one session registry, and a hard rule: the renderer never touches the file
 * system, never spawns anything, and never sees a proxy password. Everything it wants goes
 * through the preload bridge.
 */

let mainWindow: BrowserWindow | null = null;

const sessions = new SessionManager({
  onToast: (message, detail) => {
    mainWindow?.webContents.send('toast', { kind: 'warn', message, detail });
  },
});

function broadcast(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createWindow(): void {
  const settings = getSettings();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    show: false,
    backgroundColor: settings.theme === 'light' ? '#f6f7f9' : '#0d1014',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: settings.theme === 'light' ? '#ffffff' : '#12161c',
      symbolColor: settings.theme === 'light' ? '#20242c' : '#c8cdd6',
      height: 44,
    },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // The preload uses nothing but electron's own modules, so it runs sandboxed.
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  // A link inside the app must never replace the app's own window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const devServer = process.env['JOE_DEV_SERVER'];
  if (devServer) {
    void mainWindow.loadURL(devServer);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  Paths.ensure(Paths.root, Paths.profiles, Paths.kernels, Paths.logs);
  nativeTheme.themeSource = getSettings().theme;

  registerIpc({
    sessions,
    broadcast,
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// A second launch focuses the window that is already open rather than starting a second store
// over the top of the first one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Browsers are children of this process; quitting without closing them leaves orphaned windows
// the user has to find in Task Manager.
app.on('before-quit', () => {
  flushStore();
  void sessions.stopAll();
});

process.on('uncaughtException', (error) => {
  console.error('[joe] uncaught', error);
});
