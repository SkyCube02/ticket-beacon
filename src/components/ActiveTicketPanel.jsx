import { useState } from 'react';
import { C, P, ST, STAFF_ROLES } from '../constants/theme.js';
import { api } from '../utils/api.js';
import { fmtTime, fmtFull } from '../utils/formatters.js';
import { useToast } from '../utils/toast.jsx';
import { getSLADeadlineMs, fmtCountdown, SLA_WINDOWS_S } from '../utils/sla.js';

const TABS = ['Overview', 'Chat', 'Audit Log', 'Specs'];
const PRIORITY_COLOR = { P1: '#ef4444', P2: '#f97316', P3: '#eab308', P4: '#60a5fa', P5: C.muted };

function SLABadge({ ticket }) {
  const deadline = getSLADeadlineMs(ticket);
  const now = Date.now();
  const remaining = Math.max(0, deadline - now);
  const breached = ticket.sla_breached || remaining === 0;
  const color = breached ? '#ef4444' : remaining < (SLA_WINDOWS_S[ticket.priority] || 1800) * 250 ? '#f59e0b' : '#4ade80';
  return (
    <span style={{ fontSize: 11, color, fontWeight: 600 }}>
      {breached ? 'SLA BREACHED' : fmtCountdown(remaining)}
    </span>
  );
}

export default function ActiveTicketPanel({ ticket, agents, currentUser, onClose, onUnpin, onUpdate, onRefresh, onLog, onOpenFull }) {
  const toast = useToast();
  const [tab, setTab] = useState('Overview');
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!ticket) return null;

  const isStaff = STAFF_ROLES.includes(currentUser.role);
  const isTerminal = ['CLOSED', 'CANCELLED', 'RESOLVED'].includes(ticket.status);
  const teamsWebhook = localStorage.getItem('tb_teams_webhook');
  const realvncBase = localStorage.getItem('tb_realvnc_url') || '';

  async function handleComment(e) {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      const updated = await api.addLog(ticket.id, currentUser.full_name, comment.trim(), {}, isInternal);
      onRefresh(updated);
      setComment('');
      toast(isInternal ? 'Internal note added' : 'Reply sent', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(status) {
    try {
      const updated = await api.updateTicket(ticket.id, { status });
      onRefresh(updated);
      onLog(currentUser.full_name, `status → ${status}`);
      toast(`Status → ${status}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleNotifyTeams() {
    if (!teamsWebhook) { toast('No Teams webhook configured in Settings', 'error'); return; }
    try {
      await api.teamsNotify(teamsWebhook, {
        type: 'MessageCard',
        summary: `${ticket.priority}: ${ticket.title}`,
        sections: [{ activityTitle: `🚨 ${ticket.priority} — ${ticket.ticket_number}`, facts: [{ name: 'Status', value: ticket.status }, { name: 'Assignee', value: ticket.assignee || 'Unassigned' }] }],
      });
      toast('Teams notified', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const logs = ticket.logs || [];
  const publicLogs = logs.filter(l => !l.is_internal || isStaff);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />

      <div style={{
        position: 'relative', width: 500, height: '100%',
        background: C.surface, borderLeft: `2px solid #166534`,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 3 }}>
                ◉ Active Ticket
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>
                {ticket.ticket_number} — {ticket.title}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={onOpenFull} title="Open full detail" style={{ padding: '4px 10px', background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 5, color: C.accentLight, fontSize: 11, cursor: 'pointer' }}>
                Open ↗
              </button>
              <button onClick={onUnpin} title="Unpin" style={{ padding: '4px 10px', background: 'transparent', border: `1px solid #166534`, borderRadius: 5, color: '#4ade80', fontSize: 11, cursor: 'pointer' }}>
                Unpin
              </button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', padding: '0 2px' }}>×</button>
            </div>
          </div>

          {/* Quick actions row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: PRIORITY_COLOR[ticket.priority] }}>{ticket.priority}</span>
            <SLABadge ticket={ticket} />
            {isStaff && !isTerminal && (
              <select
                value={ticket.status}
                onChange={e => handleStatusChange(e.target.value)}
                style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: '3px 6px', color: C.text, fontSize: 11, cursor: 'pointer' }}
              >
                {Object.keys(ST).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {teamsWebhook && ['P1', 'P2'].includes(ticket.priority) && (
              <button onClick={handleNotifyTeams} style={{ padding: '3px 10px', background: '#1a1f3a', border: '1px solid #3b4a8a', borderRadius: 4, color: '#93c5fd', fontSize: 11, cursor: 'pointer' }}>
                Teams
              </button>
            )}
            {realvncBase && ticket.system_info?.hostname && (
              <a
                href={`${realvncBase}?host=${ticket.system_info.hostname}`}
                target="_blank" rel="noopener noreferrer"
                style={{ padding: '3px 10px', background: '#1a0a2e', border: '1px solid #6d28d9', borderRadius: 4, color: '#c4b5fd', fontSize: 11, textDecoration: 'none' }}
              >
                RealVNC ↗
              </a>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '9px 4px', background: 'transparent', border: 'none',
                borderBottom: tab === t ? `2px solid ${C.accent}` : '2px solid transparent',
                color: tab === t ? C.accentLight : C.muted,
                fontSize: 11, fontWeight: tab === t ? 700 : 400, cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

          {tab === 'Overview' && (
            <div>
              {[
                ['Requester', ticket.requester?.name],
                ['Company', ticket.company_name],
                ['Assignee', ticket.assignee || 'Unassigned'],
                ['Department', ticket.requester?.dept],
                ['Status', ticket.status],
                ['Created', fmtFull(ticket.createdAt)],
                ...(ticket.acknowledgedAt ? [['Acknowledged', fmtFull(ticket.acknowledgedAt)]] : []),
                ...(ticket.resolvedAt ? [['Resolved', fmtFull(ticket.resolvedAt)]] : []),
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 11, color: C.muted, width: 110, flexShrink: 0 }}>{label}</span>
                  <span style={{ fontSize: 12, color: value ? C.text : C.dim }}>{value || '—'}</span>
                </div>
              ))}

              {ticket.priority_justification && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>Priority Justification</div>
                  <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{ticket.priority_justification}</div>
                </div>
              )}

              {ticket.tags?.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {ticket.tags.map(tag => (
                    <span key={tag} style={{ fontSize: 10, padding: '2px 8px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, color: C.muted }}>{tag}</span>
                  ))}
                </div>
              )}

              {ticket.description && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {ticket.description}
                </div>
              )}
            </div>
          )}

          {tab === 'Chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: 12 }}>
                {publicLogs.filter(l => l.action && !l.action.startsWith('status →') && !l.action.startsWith('priority →') && !l.action.startsWith('assigned to')).map(log => (
                  <div key={log.id} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 3 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: log.is_internal ? '#fbbf24' : C.accentLight }}>{log.actor}</span>
                      {log.is_internal && <span style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', background: '#422006', border: '1px solid #92400e', borderRadius: 3, padding: '1px 4px' }}>INTERNAL</span>}
                      <span style={{ fontSize: 10, color: C.dim }}>{fmtTime(log.timestamp)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, padding: '8px 10px', background: log.is_internal ? '#1a1000' : C.card, border: `1px solid ${log.is_internal ? '#854d0e' : C.border}`, borderRadius: 6 }}>
                      {log.action}
                    </div>
                  </div>
                ))}
                {publicLogs.length === 0 && <div style={{ fontSize: 12, color: C.dim, textAlign: 'center', padding: 20 }}>No messages yet</div>}
              </div>
              {isStaff && !isTerminal && (
                <form onSubmit={handleComment}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <button type="button" onClick={() => setIsInternal(false)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', background: !isInternal ? C.accentDim : 'transparent', border: `1px solid ${!isInternal ? C.accent : C.border}`, color: !isInternal ? C.accentLight : C.muted }}>Reply</button>
                    <button type="button" onClick={() => setIsInternal(true)} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', background: isInternal ? '#422006' : 'transparent', border: `1px solid ${isInternal ? '#92400e' : C.border}`, color: isInternal ? '#fbbf24' : C.muted }}>Internal note</button>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleComment(e); }}
                      placeholder={isInternal ? 'Internal note (agents only)…' : 'Reply to client…'}
                      rows={2}
                      style={{ flex: 1, background: C.card, border: `1px solid ${isInternal ? '#92400e' : C.border}`, borderRadius: 6, padding: '7px 10px', color: C.text, fontSize: 12, resize: 'none', outline: 'none' }}
                    />
                    <button type="submit" disabled={submitting || !comment.trim()} style={{ padding: '0 14px', background: comment.trim() ? C.accent : C.accentDim, border: 'none', borderRadius: 6, color: C.white, fontSize: 12, fontWeight: 600, cursor: comment.trim() ? 'pointer' : 'default' }}>
                      {submitting ? '…' : '↑'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {tab === 'Audit Log' && (
            <div>
              {logs.map(log => (
                <div key={log.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: log.is_internal ? '#fbbf24' : C.accentLight, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: C.text }}>{log.action}</div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{log.actor} · {fmtTime(log.timestamp)}</div>
                  </div>
                </div>
              ))}
              {logs.length === 0 && <div style={{ fontSize: 12, color: C.dim, textAlign: 'center', padding: 20 }}>No activity yet</div>}
            </div>
          )}

          {tab === 'Specs' && (
            <div>
              {ticket.system_info ? (
                <>
                  {realvncBase && ticket.system_info.hostname && (
                    <a
                      href={`${realvncBase}?host=${ticket.system_info.hostname}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ display: 'block', padding: '10px 14px', background: '#1a0a2e', border: '1px solid #6d28d9', borderRadius: 8, color: '#c4b5fd', fontSize: 13, fontWeight: 600, textDecoration: 'none', textAlign: 'center', marginBottom: 16 }}
                    >
                      ↗ Connect via RealVNC — {ticket.system_info.hostname}
                    </a>
                  )}
                  {Object.entries(ticket.system_info).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: 11, color: C.muted, width: 130, flexShrink: 0, textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                      <span style={{ fontSize: 11, color: C.text, fontFamily: 'monospace', wordBreak: 'break-all' }}>{String(val)}</span>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ fontSize: 12, color: C.dim, textAlign: 'center', padding: 40 }}>
                  No system specs captured for this ticket.
                  <div style={{ marginTop: 8, fontSize: 11 }}>Specs are collected automatically when clients submit tickets via the desktop app.</div>
                </div>
              )}

              {!realvncBase && (
                <div style={{ marginTop: 16, padding: '10px 12px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, color: C.muted }}>
                  Set your RealVNC Connect URL in Settings to enable one-click remote access.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
