import { useEffect, useRef } from 'react';
import { C, P } from '../constants/theme.js';

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const pattern = [880, 660, 880];
    let t = ctx.currentTime;
    pattern.forEach(freq => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'square';
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.18);
      t += 0.22;
    });
  } catch {
    // AudioContext unavailable
  }
}

export default function SlaAlertBanner({ tickets, onAcknowledge, soundEnabled = true, desktopEnabled = true }) {
  const alertTickets = tickets.filter(t =>
    (t.priority === 'P1' || t.priority === 'P2') &&
    (t.status === 'OPEN' || t.status === 'SLA BREACHED')
  );

  const prevCount = useRef(0);

  useEffect(() => {
    if (alertTickets.length > 0 && alertTickets.length !== prevCount.current) {
      if (soundEnabled) beep();

      if (desktopEnabled && window.electronAPI?.isElectron) {
        const newTickets = alertTickets.slice(prevCount.current);
        newTickets.forEach(t => {
          window.electronAPI.showNotification(
            `⚠ ${t.priority} Alert — ${t.ticket_number}`,
            t.title
          );
        });
      }
    }
    prevCount.current = alertTickets.length;
  }, [alertTickets.length, soundEnabled, desktopEnabled]);

  if (alertTickets.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0,
      zIndex: 300,
      background: '#2d0a0a',
      borderBottom: '2px solid #ef4444',
      padding: '10px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
    }}>
      <span style={{
        fontSize: 13, fontWeight: 700, color: '#f87171',
        display: 'flex', alignItems: 'center', gap: 8,
        animation: 'tb-pulse 1.2s ease-in-out infinite',
      }}>
        <span style={{ fontSize: 16 }}>⚠</span>
        {alertTickets.length === 1 ? '1 CRITICAL TICKET REQUIRES IMMEDIATE ATTENTION' : `${alertTickets.length} CRITICAL TICKETS REQUIRE IMMEDIATE ATTENTION`}
      </span>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1 }}>
        {alertTickets.map(t => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#3d1010', border: '1px solid #7f1d1d',
            borderRadius: 6, padding: '4px 10px',
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: P[t.priority].text }}>
              {t.priority}
            </span>
            <span style={{ fontSize: 12, color: '#fca5a5', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.ticket_number} · {t.title}
            </span>
            <button
              onClick={() => onAcknowledge(t)}
              style={{
                padding: '2px 8px',
                background: '#ef4444',
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Acknowledge
            </button>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes tb-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
