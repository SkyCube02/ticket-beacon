export function mkLog(actor, action, ticketId = null, meta = {}) {
  return {
    id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ticketId,
    actor,
    action,
    timestamp: new Date().toISOString(),
    meta,
  };
}

export const fmtTime = ts => {
  if (!ts) return '—';
  const d = Date.now() - new Date(ts).getTime();
  const s = Math.floor(d / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), dy = Math.floor(h / 24);
  if (s < 60) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${dy}d ago`;
};

export const fmtFull = ts => {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};
