const { app, BrowserWindow, ipcMain, Notification, Menu, globalShortcut, shell, dialog } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

// Required on Windows so notifications appear under the correct app name in the Action Centre
if (process.platform === 'win32') {
  app.setAppUserModelId('com.simbix.ticketbeacon');
}

// ── Emergency contact cache (in-memory, persisted via renderer localStorage) ──
// Removed better-sqlite3 dependency — localStorage handles persistence in renderer

// Auto-updater — only active in packaged builds
function initAutoUpdater() {
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.on('update-available', info => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update available',
        message: `Beacon ${info.version} is available. Download now?`,
        buttons: ['Download', 'Later'],
      }).then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate();
      });
    });
    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update ready',
        message: 'Update downloaded. Restart Beacon to apply it.',
        buttons: ['Restart now', 'Later'],
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
    });
    return autoUpdater;
  } catch {
    return null;
  }
}

const WIN_ICON = path.join(__dirname, '../public/icons/icon-192.png');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Beacon',
    icon: WIN_ICON,
    backgroundColor: '#04080f',
    show: false,
  });

  // Remove the default Electron menu entirely
  Menu.setApplicationMenu(null);

  if (isDev) {
    win.loadURL('http://localhost:5173');
    // F12 opens DevTools in dev mode
    globalShortcut.register('F12', () => {
      if (win.webContents.isDevToolsOpened()) {
        win.webContents.closeDevTools();
      } else {
        win.webContents.openDevTools();
      }
    });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => {
    win.show();
    const updater = initAutoUpdater();
    if (updater) {
      setTimeout(() => updater.checkForUpdates().catch(() => {}), 5000);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url.startsWith('https://login.microsoftonline.com') || url.startsWith('https://login.live.com')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => {
    globalShortcut.unregisterAll();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// public/ is available in dev; Vite copies it into dist/ for production builds
const ICON_PATH = isDev
  ? path.join(__dirname, '../public/icons/icon-192.png')
  : path.join(__dirname, '../dist/icons/icon-192.png');

ipcMain.handle('show-notification', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({
      title,
      body,
      icon: ICON_PATH,
      urgency: 'critical',   // Linux only — ignored on Windows/macOS
      timeoutType: 'never',  // Keep visible until dismissed (Windows/macOS)
    });
    n.show();
  }
});
