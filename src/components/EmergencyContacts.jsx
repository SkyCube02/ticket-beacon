import { useState, useEffect } from 'react';
import { C } from '../constants/theme.js';
import { api } from '../utils/api.js';

export default function EmergencyContacts({ compact = false }) {
  const [contacts, setContacts] = useState([]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getEmergencyContacts();
        setContacts(data);
        setOffline(false);
        // Cache in Electron SQLite
        if (window.electronAPI?.cacheContacts) {
          window.electronAPI.cacheContacts(data);
        }
      } catch {
        // Offline — try cache
        setOffline(true);
        if (window.electronAPI?.getCachedContacts) {
          const cached = await window.electronAPI.getCachedContacts();
          if (cached?.length) setContacts(cached);
        }
      }
    };
    load();
  }, []);

  if (contacts.length === 0) return null;

  if (compact) {
    return (
      <div style={{
        background: '#2d0a0a', border: '1px solid #7f1d1d',
        borderRadius: 8, padding: '10px 14px', marginTop: 12,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          {offline ? '⚠ Offline — Emergency Contacts (cached)' : 'Emergency Contacts'}
        </div>
        {contacts.map(c => (
          <div key={c.id} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 600 }}>{c.name}</div>
            {c.phone && <div style={{ fontSize: 11, color: '#f87171' }}>{c.phone}</div>}
            {c.email && <div style={{ fontSize: 11, color: '#f87171' }}>{c.email}</div>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      {offline && (
        <div style={{
          background: '#2d1a06', border: '1px solid #92400e',
          borderRadius: 6, padding: '8px 12px', marginBottom: 14,
          fontSize: 12, color: '#fbbf24',
        }}>
          ⚠ You appear to be offline. Showing cached emergency contacts.
        </div>
      )}
      {contacts.map(c => (
        <div key={c.id} style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 16, marginBottom: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>{c.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {c.phone && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: C.muted, width: 50 }}>Phone</span>
                <a href={`tel:${c.phone}`} style={{ fontSize: 13, color: C.accentLight, textDecoration: 'none', fontWeight: 600 }}>{c.phone}</a>
              </div>
            )}
            {c.email && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: C.muted, width: 50 }}>Email</span>
                <a href={`mailto:${c.email}`} style={{ fontSize: 13, color: C.accentLight, textDecoration: 'none' }}>{c.email}</a>
              </div>
            )}
            {c.hours && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, color: C.muted, width: 50, flexShrink: 0 }}>Hours</span>
                <span style={{ fontSize: 12, color: C.muted }}>{c.hours}</span>
              </div>
            )}
            {c.notes && (
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4, borderTop: `1px solid ${C.border}`, paddingTop: 6 }}>
                {c.notes}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
