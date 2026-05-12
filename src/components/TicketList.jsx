import { useState, useEffect, useRef } from 'react';
import { C, P, ST } from '../constants/theme.js';
import { fmtTime } from '../utils/formatters.js';
import { useToast } from '../utils/toast.jsx';
import { getSLADeadlineMs, fmtCountdown, SLA_WINDOWS_S } from '../utils/sla.js';

const STATUSES = [
  { label: 'All statuses', value: null },
  { label: 'Open', value: 'OPEN' },
  { label: 'Acknowledged', value: 'ACKNOWLEDGED' },
  { label: 'In Progress', value: 'IN PROGRESS' },
  { label: 'Pending Client', value: 'PENDING CLIENT' },
  { label: 'Escalated', value: 'ESCALATED' },
  { label: 'SLA Breached', value: 'SLA BREACHED' },
  { label: 'Resolved', value: 'RESOLVED' },
  { label: 'Closed', value: 'CLOSED' },
];

const COMPANY_COLORS = ['#2563eb','#7c3aed','#db2777','#059669','#d97706'];
const TERMINAL = new Set(['RESOLVED', 'CLOSED', 'CANCELLED']);

function PriorityBadge({ p }) {
  const s = P[p] || P.P3;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      padding: '2px 6px', borderRadius: 4,
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
      letterSpacing: 0.3, whiteSpace: 'nowrap',
    }}>
      {p}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = ST[status] || { bg: C.card, text: C.muted };
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      padding: '2px 7px', borderRadius: 4,
      background: s.bg, color: s.text,
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

function SLAChip({ ticket }) {
  const [now, setNow] = useState(Date.now());
  const deadline = getSLADeadlineMs(ticket);

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return <span style={{ color: C.dim, fontSize: 10 }}>—</span>;

  const remaining = Math.max(0, deadline - now);
  const windowMs = (SLA_WINDOWS_S[ticket.priority] || 1800) * 1000;
  const pct = remaining / windowMs;
  const breached = ticket.sla_breached || remaining === 0;
  const urgent = !breached && pct < 0.25;
  const color = breached ? '#ef4444' : urgent ? '#f59e0b' : '#4ade80';

  return (
    <span style={{ fontSize: 10, color, fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {breached ? '⚠ Breached' : fmtCountdown(remaining)}
    </span>
  );
}

const PRIORITY_RANK = { P1: 1, P2: 2, P3: 3, P4: 4, P5: 5 };

function sortTickets(tickets, sort) {
  const copy = [...tickets];
  if (sort === 'priority') return copy.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  if (sort === 'oldest') return copy.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (sort === 'updated') return copy.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return copy.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export default function TicketList({
  tickets, selectedId, onSelect,
  search, onSearch,
  onNewTicket, hasDetail, loading,
  companies = [], companyFilter, onCompanyFilter,
  statusFilter, onStatusFilter,
  density = 'comfortable',
  currentUser, onQuickAction,
}) {
  const toast = useToast();
  const [sort, setSort] = useState('newest');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [menuState, setMenuState] = useState(null); // { id, x, y }
  const menuRef = useRef(null);

  const rowPad = density === 'compact' ? '5px 12px' : '8px 12px';
  const sorted = sortTickets(tickets, sort);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuState) return;
    const handler = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuState(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuState]);

  function toggleSelect(id, e) {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openMenu(ticketId, e) {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuState({ id: ticketId, x: rect.right, y: rect.bottom });
  }

  async function doQuickAction(ticketId, changes) {
    setMenuState(null);
    try {
      await onQuickAction(ticketId, changes);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function doBulkAction(changes) {
    try {
      await Promise.all([...selectedIds].map(id => onQuickAction(id, changes)));
      setSelectedIds(new Set());
      toast(`${selectedIds.size} tickets updated`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const menuTicket = menuState ? sorted.find(t => t.id === menuState.id) : null;
  const isStaff = currentUser && !['CLIENT_USER', 'CLIENT_MANAGER'].includes(currentUser.role);

  // grid: checkbox | ID | Title | Pri | Status | SLA | Assignee | ⋯
  const gridCols = hasDetail
    ? '20px 72px 1fr 50px 1fr 76px 82px 24px'
    : '20px 80px 1fr 52px 1fr 80px 100px 76px 24px';

  return (
    <div style={{
      flex: hasDetail ? '0 0 50%' : 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      borderRight: hasDetail ? `1px solid ${C.border}` : 'none',
    }}>
      {/* Search + filters bar */}
      <div style={{
        padding: '10px 12px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search tickets…"
          style={{
            flex: 1, background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '7px 11px', color: C.text,
            fontSize: 13, outline: 'none', minWidth: 0,
          }}
        />
        <select
          value={statusFilter ?? ''}
          onChange={e => onStatusFilter(e.target.value || null)}
          style={{
            background: C.card, border: `1px solid ${statusFilter ? C.accent : C.border}`,
            borderRadius: 6, padding: '7px 10px',
            color: statusFilter ? C.accentLight : C.muted,
            fontSize: 12, outline: 'none', cursor: 'pointer', flexShrink: 0,
          }}
        >
          {STATUSES.map(s => (
            <option key={s.label} value={s.value ?? ''}>{s.label}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 6, padding: '7px 10px',
            color: C.muted, fontSize: 12, outline: 'none', cursor: 'pointer', flexShrink: 0,
          }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="priority">By priority</option>
          <option value="updated">Last updated</option>
        </select>
        <button
          onClick={onNewTicket}
          style={{
            padding: '7px 14px', background: C.accent, color: C.white,
            border: 'none', borderRadius: 6, fontSize: 13,
            fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >+ New</button>
      </div>

      {/* Company tabs */}
      {companies.length > 0 && (
        <div style={{
          display: 'flex', borderBottom: `1px solid ${C.border}`,
          overflowX: 'auto', flexShrink: 0, background: C.surface,
        }}>
          <button
            onClick={() => onCompanyFilter(null)}
            style={{
              padding: '7px 14px', background: 'none', border: 'none',
              borderBottom: !companyFilter ? `2px solid ${C.accent}` : '2px solid transparent',
              color: !companyFilter ? C.accentLight : C.muted,
              fontSize: 12, fontWeight: !companyFilter ? 600 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >All</button>
          {companies.map((company, i) => {
            const color = COMPANY_COLORS[i % COMPANY_COLORS.length];
            const active = companyFilter === company.id;
            return (
              <button
                key={company.id}
                onClick={() => onCompanyFilter(company.id)}
                style={{
                  padding: '7px 14px', background: 'none', border: 'none',
                  borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
                  color: active ? color : C.muted,
                  fontSize: 12, fontWeight: active ? 600 : 400,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {company.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: gridCols,
        padding: '5px 12px', borderBottom: `1px solid ${C.border}`,
        fontSize: 10, color: C.dim, fontWeight: 700,
        letterSpacing: 0.6, textTransform: 'uppercase', flexShrink: 0, gap: 4,
      }}>
        <span />
        <span>ID</span>
        <span>Title</span>
        <span>Pri</span>
        <span>Status</span>
        <span>SLA</span>
        <span>Assignee</span>
        {!hasDetail && <span>Company</span>}
        <span />
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading…</div>
        )}
        {!loading && tickets.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>No tickets match</div>
        )}
        {!loading && sorted.map(t => (
          <div
            key={t.id}
            onClick={() => onSelect(t.id === selectedId ? null : t.id)}
            style={{
              display: 'grid', gridTemplateColumns: gridCols, gap: 4,
              padding: rowPad,
              borderBottom: `1px solid ${C.border}`,
              borderLeft: `3px solid ${t.id === selectedId ? C.accent : selectedIds.has(t.id) ? '#7c3aed' : 'transparent'}`,
              cursor: 'pointer',
              background: t.id === selectedId ? C.card : selectedIds.has(t.id) ? '#0d0a1f' : 'transparent',
              alignItems: 'center',
            }}
          >
            {/* Checkbox */}
            <span onClick={e => toggleSelect(t.id, e)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <input
                type="checkbox"
                checked={selectedIds.has(t.id)}
                onChange={() => {}}
                onClick={e => { e.stopPropagation(); toggleSelect(t.id, e); }}
                style={{ cursor: 'pointer', accentColor: C.accent }}
              />
            </span>

            <span style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace' }}>{t.ticket_number}</span>

            <span style={{
              fontSize: 13, color: C.text,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              paddingRight: 4,
            }}>
              {t.title}
            </span>

            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <PriorityBadge p={t.priority} />
              {t.priority_pending_approval && (
                <span style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', background: '#422006', border: '1px solid #92400e', borderRadius: 3, padding: '1px 4px' }}>
                  PENDING
                </span>
              )}
            </span>

            <span><StatusBadge status={t.status} /></span>

            <span><SLAChip ticket={t} /></span>

            <span style={{ fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.assignee || <span style={{ color: C.dim, fontStyle: 'italic' }}>Unassigned</span>}
            </span>

            {!hasDetail && (
              <span style={{ fontSize: 11, color: C.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.company_name || '—'}
              </span>
            )}

            {/* ⋯ quick actions */}
            {isStaff ? (
              <span style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={e => openMenu(t.id, e)}
                  style={{
                    background: 'none', border: 'none', color: C.dim,
                    fontSize: 16, cursor: 'pointer', padding: '0 2px',
                    lineHeight: 1, fontWeight: 700,
                  }}
                >⋯</button>
              </span>
            ) : <span />}
          </div>
        ))}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          padding: '10px 14px', borderTop: `1px solid ${C.border}`,
          background: '#0d0a1f', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: C.accentLight, fontWeight: 600, flex: 1 }}>
            {selectedIds.size} ticket{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => doBulkAction({ status: 'ACKNOWLEDGED' })}
            style={{ padding: '5px 12px', background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 5, color: C.accentLight, fontSize: 12, cursor: 'pointer' }}
          >Acknowledge</button>
          <button
            onClick={() => doBulkAction({ status: 'CLOSED' })}
            style={{ padding: '5px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 12, cursor: 'pointer' }}
          >Close all</button>
          {currentUser && (
            <button
              onClick={() => doBulkAction({ assignee_id: currentUser.id })}
              style={{ padding: '5px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 12, cursor: 'pointer' }}
            >Assign to me</button>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ background: 'none', border: 'none', color: C.dim, fontSize: 18, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}
          >×</button>
        </div>
      )}

      {/* Floating ⋯ dropdown */}
      {menuState && menuTicket && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuState.y + 4,
            left: menuState.x - 160,
            width: 160,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 500,
            overflow: 'hidden',
          }}
        >
          {[
            !TERMINAL.has(menuTicket.status) && {
              label: 'Assign to me',
              action: () => doQuickAction(menuTicket.id, { assignee_id: currentUser?.id }),
            },
            menuTicket.status === 'OPEN' && {
              label: 'Mark Acknowledged',
              action: () => doQuickAction(menuTicket.id, { status: 'ACKNOWLEDGED' }),
            },
            !TERMINAL.has(menuTicket.status) && menuTicket.status !== 'IN PROGRESS' && {
              label: 'Mark In Progress',
              action: () => doQuickAction(menuTicket.id, { status: 'IN PROGRESS' }),
            },
            !TERMINAL.has(menuTicket.status) && {
              label: 'Close ticket',
              action: () => doQuickAction(menuTicket.id, { status: 'CLOSED' }),
              red: true,
            },
          ].filter(Boolean).map((item, i) => (
            <button
              key={i}
              onClick={item.action}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '9px 14px', background: 'none', border: 'none',
                color: item.red ? '#f87171' : C.text,
                fontSize: 13, cursor: 'pointer',
                borderBottom: `1px solid ${C.border}`,
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.card}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
