import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import './recorder-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chromium Anti-Throttling: 100% 60 FPS even when minimized, hidden, or occluded
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// Determine execution environment
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;

function createWindow() {
  const iconPath = path.join(__dirname, '../build/icon.ico');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    useContentSize: true, // Ensures web viewport matches 1280x720 16:9 exactly
    minWidth: 800,
    minHeight: 600,
    resizable: true,
    backgroundColor: '#0c0e17', // Matching dark theme to prevent white flash
    title: 'Stickman Flag Chaos',
    icon: iconPath,
    autoHideMenuBar: true,
    show: false, // Will show gracefully on 'ready-to-show'
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false, // Prevents requestAnimationFrame and timers from dropping to 1 FPS
      preload: path.join(__dirname, 'preload.cjs'),
      devTools: isDev,
      spellcheck: false,
    },
  });

  // Graceful show when DOM and initial canvas are ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Entry point: Load the unmodified HTML5 game
  const indexPath = path.join(__dirname, '../game/index.html');
  mainWindow.loadFile(indexPath).catch((err) => {
    console.error('[Electron] Failed to load game entry point:', err);
  });

  // External link security: Never navigate main window to external websites
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Only allow navigating to our own local game file
    const fileScheme = 'file://';
    if (!url.startsWith(fileScheme)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Desktop Fullscreen & Hotkey management
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F11: Toggle Fullscreen
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      const current = mainWindow.isFullScreen();
      mainWindow.setFullScreen(!current);
    }
    // Esc: Exit fullscreen if active (Renderer can also handle Esc for in-game modals)
    else if (input.type === 'keyDown' && input.key === 'Escape') {
      if (mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false);
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Second instance focus
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// App Lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.exit(0);
  }
});
