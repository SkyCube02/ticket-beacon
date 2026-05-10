import electron from 'electron';
const { app, BrowserWindow, ipcMain, Notification, shell, dialog } = electron;
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const isDev = process.env.NODE_ENV !== 'production';

// ── Emergency contact cache (SQLite) ─────────────────────────────────────────
let db;

function initCache() {
  const userDataPath = app.getPath('userData');
  db = new Database(path.join(userDataPath, 'emergency-cache.sqlite'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS emergency_contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      hours TEXT,
      notes TEXT,
      cached_at TEXT
    )
  `);
}

function cacheContacts(contacts) {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO emergency_contacts (id, name, phone, email, hours, notes, cached_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  const insertMany = db.transaction(items => {
    for (const c of items) insert.run(c.id, c.name, c.phone ?? null, c.email ?? null, c.hours ?? null, c.notes ?? null, now);
  });
  insertMany(contacts);
}

function getCachedContacts() {
  return db.prepare('SELECT * FROM emergency_contacts').all();
}

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
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  initCache();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('cache-contacts', (_event, contacts) => { cacheContacts(contacts); });
ipcMain.handle('get-cached-contacts', () => getCachedContacts());

ipcMain.handle('show-notification', (_event, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, urgency: 'critical' });
    n.show();
  }
});
