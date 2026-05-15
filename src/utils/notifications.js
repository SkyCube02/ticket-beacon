const ICON = '/icons/icon-192.png';

export function canNotify() {
  return 'Notification' in window;
}

export function notifyPermission() {
  if (!canNotify()) return 'unsupported';
  return Notification.permission; // 'granted' | 'denied' | 'default'
}

export async function requestPermission() {
  if (!canNotify()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function notify(title, body) {
  // Web Notifications API (browser + Electron both support it)
  if (canNotify() && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: ICON, silent: false });
      return;
    } catch {
      // some Electron builds block new Notification() — fall through
    }
  }
  // Electron preload fallback
  if (window.electronAPI?.showNotification) {
    window.electronAPI.showNotification(title, body);
  }
}
