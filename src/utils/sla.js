// Acknowledgement windows in seconds: P1=2min, P2=10min, P3/4/5=30min
export const SLA_WINDOWS_S = { P1: 120, P2: 600, P3: 1800, P4: 1800, P5: 1800 };
const TERMINAL = new Set(['RESOLVED', 'CLOSED', 'CANCELLED']);

export function getSLADeadlineMs(ticket) {
  if (TERMINAL.has(ticket.status)) return null;
  const w = SLA_WINDOWS_S[ticket.priority];
  if (!w) return null;
  return new Date(ticket.createdAt).getTime() + w * 1000;
}

export function fmtCountdown(ms) {
  if (ms <= 0) return 'Breached';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
