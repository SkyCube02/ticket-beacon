const DEFAULTS = {
  soundAlerts: true,
  desktopNotifications: true,
  announcementAlerts: true,
  defaultView: 'dashboard',
  density: 'comfortable',     // 'compact' | 'comfortable' | 'spacious'
  refreshInterval: 30,        // seconds — 0 means off
  sessionTimeout: 30,         // minutes — 0 means never
  theme: 'neon',              // 'neon' | 'slate' | 'midnight' | 'light'
  clockFormat: '24h',         // '12h' | '24h'
  confirmClose: true,         // confirm before closing/cancelling tickets
  defaultSort: 'newest',      // 'newest' | 'oldest' | 'priority' | 'updated'
  showResolved: false,        // show resolved tickets in main list
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
