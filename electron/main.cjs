const { app, BrowserWindow, ipcMain, Notification, shell, dialog } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

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
        message: `Ticket Beacon ${info.version} is available. Download now?`,
        buttons: ['Download', 'Later'],
      }).then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate();
      });
    });
    autoUpdater.on('update-downloaded', () => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update ready',
        message: 'Update downloaded. Restart Ticket Beacon to apply it.',
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
    title: 'Ticket Beacon',
    backgroundColor: '#04080f',
    show: false,
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadURL('https://ticket-beacon.vercel.app');
  }

  win.once('ready-to-show', () => {
    win.show();
    const updater = initAutoUpdater();
    if (updater) {
      setTimeout(() => updater.checkForUpdates().catch(() => {}), 5000);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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

ipcMain.handle('show-notification', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, urgency: 'critical' });
    n.show();
  }
});
