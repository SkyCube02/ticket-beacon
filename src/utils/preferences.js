const DEFAULTS = {
  soundAlerts: true,
  desktopNotifications: true,
  announcementAlerts: true,
  defaultView: 'tickets',
  density: 'comfortable',   // 'comfortable' | 'compact'
  refreshInterval: 30,       // seconds — 0 means off
  sessionTimeout: 30,        // minutes — 0 means never
};

function key(userId) {
  return `tb_prefs_${userId}`;
}

export function loadPrefs(userId) {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(userId, prefs) {
  localStorage.setItem(key(userId), JSON.stringify(prefs));
}
