const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  showNotification: (title, body) =>
    ipcRenderer.invoke('show-notification', { title, body }),
  // Emergency contacts cached in localStorage (renderer-side)
  cacheContacts: contacts => {
    try { localStorage.setItem('tb_emergency_cache', JSON.stringify(contacts)); } catch {}
  },
  getCachedContacts: () => {
    try { return JSON.parse(localStorage.getItem('tb_emergency_cache') || '[]'); } catch { return []; }
  },
});
