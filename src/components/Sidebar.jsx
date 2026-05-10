import { useState } from 'react';
import { C } from '../constants/theme.js';
import { atLeast } from '../utils/permissions.js';
import ChangePasswordModal from './ChangePasswordModal.jsx';

const SIDEBAR_W = 220;
const RAIL_W = 52;

const NAV = [
  { label: 'Tickets',        view: 'tickets',       icon: '◈', minRole: null },
  { label: 'Knowledge Base', view: 'kb',             icon: '≡', minRole: null },
  { label: 'Announcements',  view: 'announcements',  icon: '◎', minRole: null },
  { label: 'Tasks',          view: 'tasks',          icon: '▣', minRole: null },
  { label: 'Reports',        view: 'reports',        icon: '▦', minRole: 'TEAM_MANAGER' },
  { label: 'Admin',          view: 'admin',          icon: '⚙', minRole: 'SYSTEM_ADMIN' },
  { label: 'Settings',       view: 'settings',       icon: '◧', minRole: null },
];

export default function Sidebar({ tickets, onNewTicket, user, onLogout, view, onViewChange, hasSecurityAlert }) {
  const [showChangePw, setShowChangePw] = useState(false);
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('tb_sidebar_collapsed') === '1'
  );

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('tb_sidebar_collapsed', next ? '1' : '0');
  }

  const openCount = tickets.filter(t =>
    !['CLOSED', 'CANCELLED', 'RESOLVED'].includes(t.status)
  ).length;

  const visibleNav = NAV.filter(n => !n.minRole || atLeast(user, n.minRole));
  const w = collapsed ? RAIL_W : SIDEBAR_W;

  return (
    <div style={{
      width: w,
      minWidth: w,
      background: C.surface,
      borderRight: `1px solid ${C.border}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      transition: 'width 0.18s ease, min-width 0.18s ease',
    }}>
      {/* Brand + toggle */}
      <div style={{
        padding: collapsed ? '16px 0' : '16px 14px 12px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        gap: 8,
        minHeight: 56,
      }}>
        {!collapsed && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: -0.3, whiteSpace: 'nowrap' }}>
              <span style={{ color: C.accent }}>●</span> Ticket Beacon
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2, letterSpacing: 0.5 }}>SUPPORT PORTAL</div>
          </div>
        )}
        {collapsed && (
          <span style={{ color: C.accent, fontSize: 18 }}>●</span>
        )}
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'transparent',
            border: `1px solid ${C.border}`,
            borderRadius: 5,
            color: C.muted,
            fontSize: 11,
            cursor: 'pointer',
            padding: '3px 6px',
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* New ticket */}
      <div style={{ padding: collapsed ? '10px 6px 4px' : '10px 10px 4px' }}>
        <button
          onClick={onNewTicket}
          title={collapsed ? 'New Ticket' : undefined}
          style={{
            width: '100%',
            padding: collapsed ? '9px 0' : '9px 12px',
            background: C.accent,
            color: C.white,
            border: 'none',
            borderRadius: 7,
            fontSize: collapsed ? 16 : 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {collapsed ? '+' : '+ New Ticket'}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '8px 6px' : '8px 8px' }}>
        {visibleNav.map(({ label, view: v, icon }) => {
          const active = view === v;
          const isAlert = v === 'announcements' && hasSecurityAlert && !active;

          return (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              title={collapsed ? label : undefined}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 10,
                padding: collapsed ? '9px 0' : '9px 12px',
                marginBottom: 2,
                background: active ? C.accentDim : 'transparent',
                border: 'none',
                borderRadius: 7,
                borderLeft: collapsed ? 'none' : (active ? `3px solid ${C.accent}` : '3px solid transparent'),
                outline: (collapsed && active) ? `2px solid ${C.accent}` : 'none',
                color: active ? C.accentLight : isAlert ? '#f87171' : C.muted,
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
                position: 'relative',
              }}
            >
              <span style={{ fontSize: 15, opacity: 0.85, flexShrink: 0 }}>{icon}</span>

              {!collapsed && (
                <>
                  <span style={{ flex: 1 }}>{label}</span>

                  {v === 'tickets' && openCount > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      background: active ? C.accent : C.card,
                      color: active ? C.white : C.muted,
                      borderRadius: 10, padding: '1px 7px',
                      border: `1px solid ${active ? C.accent : C.border}`,
                    }}>
                      {openCount}
                    </span>
                  )}

                  {isAlert && (
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                  )}
                </>
              )}

              {/* Collapsed badge dot */}
              {collapsed && v === 'tickets' && openCount > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 7, height: 7, borderRadius: '50%',
                  background: C.accent,
                }} />
              )}
              {collapsed && isAlert && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#ef4444',
                }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* User footer */}
      <div style={{
        padding: collapsed ? '10px 6px' : '10px 14px',
        borderTop: `1px solid ${C.border}`,
      }}>
        {collapsed ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {user && (
              <div
                title={`${user.full_name} — ${user.role.replace(/_/g, ' ')}`}
                style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: C.accentDim,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, color: C.accentLight,
                  border: `1px solid ${C.border}`,
                  cursor: 'default',
                }}
              >
                {user.full_name?.[0]?.toUpperCase() ?? '?'}
              </div>
            )}
            <button
              onClick={handleLogoutClick}
              title="Sign out"
              style={{
                background: 'transparent', border: `1px solid ${C.border}`,
                borderRadius: 5, color: C.muted, fontSize: 13,
                cursor: 'pointer', padding: '4px 8px', lineHeight: 1,
              }}
            >
              ⏻
            </button>
          </div>
        ) : (
          <>
            {user && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.full_name}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
                  {user.role.replace(/_/g, ' ')}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setShowChangePw(true)}
                style={{
                  flex: 1, padding: '6px 8px',
                  background: 'transparent', border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.muted, fontSize: 11, cursor: 'pointer',
                }}
              >
                Password
              </button>
              <button
                onClick={handleLogoutClick}
                style={{
                  flex: 1, padding: '6px 8px',
                  background: 'transparent', border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.muted, fontSize: 11, cursor: 'pointer',
                }}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </div>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );

  function handleLogoutClick() {
    onLogout();
  }
}
