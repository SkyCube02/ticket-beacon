import { useState, useRef, useEffect } from 'react';
import { C, ST, STAFF_ROLES } from '../constants/theme.js';
import { api } from '../utils/api.js';
import { fmtTime, fmtFull } from '../utils/formatters.js';
import { useToast } from '../utils/toast.jsx';
import { getSLADeadlineMs, fmtCountdown, SLA_WINDOWS_S } from '../utils/sla.js';

const PRIORITY_COLOR = { P1: '#ef4444', P2: '#f97316', P3: '#eab308', P4: '#60a5fa', P5: '#6b7280' };

function SLABadge({ ticket }) {
  const deadline = getSLADeadlineMs(ticket);
  if (!deadline) return null;
  const remaining = Math.max(0, deadline - Date.now());
  const breached = ticket.sla_breached || remaining === 0;
  const pct = remaining / (SLA_WINDOWS_S[ticket.priority] * 1000);
  const color = breached ? '#ef4444' : pct < 0.25 ? '#f59e0b' : '#4ade80';
  return (
    <span style={{ fontSize: 12, color, fontWeight: 700, padding: '3px 10px', border: `1px solid ${color}40`, borderRadius: 5 }}>
      {breached ? '⚠ SLA BREACHED' : `⏱ ${fmtCountdown(remaining)}`}
    </span>
  );
}

function CallButton({ icon, label, onClick, color = C.border }) {
  const toast = useToast();
  const [hover, setHover] = useState(false);
  function handle() {
    toast(`${label} — coming in a future update`, 'info');
    onClick?.();
  }
  return (
    <button
      onClick={handle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={`${label} (coming soon)`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '8px 14px', background: hover ? `${color}20` : 'transparent',
        border: `1px solid ${hover ? color : C.border}`, borderRadius: 8,
        color: hover ? color : C.muted, cursor: 'pointer', fontSize: 11, fontWeight: 600,
        transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: 20 }}>{icon}</span>
      {label}
    </button>
  );
}

const TABS = ['Chat', 'Overview', 'Audit Log', 'Specs'];

export default function ActiveTicketView({ ticket, agents, currentUser, onRefresh, onLog, onUnpin }) {
  const toast = useToast();
  const [tab, setTab] = useState('Chat');
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.logs?.length, tab]);

  if (!ticket) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: C.bg, color: C.dim }}>
        <div style={{ fontSize: 40 }}>◉</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: C.muted }}>No active ticket</div>
        <div style={{ fontSize: 13, color: C.dim, textAlign: 'center', maxWidth: 360 }}>
          Pin a ticket from the ticket list to start working on it here.
          The active ticket shows full chat, specs, and remote access tools.
        </div>
      </div>
    );
  }

  const isStaff = STAFF_ROLES.includes(currentUser.role);
  const isTerminal = ['CLOSED', 'CANCELLED', 'RESOLVED'].includes(ticket.status);
  const teamsWebhook = localStorage.getItem('tb_teams_webhook');
  const realvncBase = localStorage.getItem('tb_realvnc_url') || '';
  const logs = ticket.logs || [];
  const chatLogs = logs.filter(l => !l.is_internal || isStaff)
    .filter(l => l.action && !['status →', 'priority →', 'assigned to', 'attached', 'removed attachment', 'opened ticket'].some(p => l.action.startsWith(p)));

  async function handleComment(e) {
    e?.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      const updated = await api.addLog(ticket.id, currentUser.full_name, comment.trim(), {}, isInternal);
      onRefresh(updated);
      setComment('');
      toast(isInternal ? 'Note added' : 'Reply sent', 'success');
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

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
      {/* ── Top toolbar ── */}
      <div style={{ background: C.surface, borderBottom: `2px solid #166534`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#4ade80', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>
            ◉ Active Ticket
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ticket.ticket_number} — {ticket.title}
          </div>
        </div>

        {/* Status + SLA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: PRIORITY_COLOR[ticket.priority] }}>{ticket.priority}</span>
          <SLABadge ticket={ticket} />
          {isStaff && !isTerminal && (
            <select value={ticket.status} onChange={e => handleStatusChange(e.target.value)}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, padding: '4px 8px', color: C.text, fontSize: 12, cursor: 'pointer' }}>
              {Object.keys(ST).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
        </div>

        {/* Call buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <CallButton icon="📞" label="Audio call" color="#4ade80" />
          <CallButton icon="🎥" label="Video call" color="#60a5fa" />
          <CallButton icon="🖥" label="Screen share" color="#a78bfa" />
          {teamsWebhook && ['P1', 'P2'].includes(ticket.priority) && (
            <button onClick={handleNotifyTeams} style={{ padding: '6px 12px', background: '#0d1a3a', border: '1px solid #1e3a7a', borderRadius: 6, color: '#93c5fd', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
              Teams
            </button>
          )}
          {realvncBase && ticket.system_info?.hostname && (
            <a href={`${realvncBase}?host=${ticket.system_info.hostname}`} target="_blank" rel="noopener noreferrer"
              style={{ padding: '6px 12px', background: '#1a0a2e', border: '1px solid #6d28d9', borderRadius: 6, color: '#c4b5fd', fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>
              RealVNC ↗
            </a>
          )}
          <button onClick={onUnpin} style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #166534', borderRadius: 6, color: '#4ade80', fontSize: 11, cursor: 'pointer' }}>
            Unpin
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '10px 20px', background: 'transparent', border: 'none',
            borderBottom: tab === t ? `2px solid ${C.accent}` : '2px solid transparent',
            color: tab === t ? C.accentLight : C.muted,
            fontSize: 12, fontWeight: tab === t ? 700 : 400, cursor: 'pointer',
          }}>{t}</button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Chat */}
        {tab === 'Chat' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {chatLogs.length === 0 && (
                <div style={{ fontSize: 13, color: C.dim, textAlign: 'center', marginTop: 40 }}>No messages yet — start the conversation</div>
              )}
              {chatLogs.map(log => {
                const isMine = log.actor === currentUser.full_name;
                return (
                  <div key={log.id} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
                    {!isMine && (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.accentLight, flexShrink: 0 }}>
                        {log.actor?.charAt(0)}
                      </div>
                    )}
                    <div style={{ maxWidth: '65%' }}>
                      {!isMine && <div style={{ fontSize: 10, color: log.is_internal ? '#fbbf24' : C.muted, marginBottom: 3, fontWeight: 600 }}>{log.actor}</div>}
                      <div style={{
                        padding: '9px 13px', fontSize: 13, lineHeight: 1.5,
                        borderRadius: isMine ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        background: log.is_internal ? '#1a1000' : isMine ? C.accent : C.card,
                        border: log.is_internal ? '1px solid #854d0e' : isMine ? 'none' : `1px solid ${C.border}`,
                        color: log.is_internal ? '#fde68a' : isMine ? C.white : C.text,
                        wordBreak: 'break-word',
                      }}>
                        {log.is_internal && <span style={{ fontSize: 9, fontWeight: 700, color: '#fbbf24', background: '#422006', border: '1px solid #92400e', borderRadius: 3, padding: '1px 4px', marginRight: 6 }}>INTERNAL</span>}
                        {log.action}
                      </div>
                      <div style={{ fontSize: 10, color: C.dim, marginTop: 3, textAlign: isMine ? 'right' : 'left' }}>{fmtTime(log.timestamp)}</div>
                    </div>
                    {isMine && (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.accentLight, flexShrink: 0 }}>
                        {currentUser.full_name?.charAt(0)}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {isStaff && !isTerminal && (
              <div style={{ padding: '12px 24px', borderTop: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button type="button" onClick={() => setIsInternal(false)} style={{ fontSize: 11, padding: '3px 12px', borderRadius: 4, cursor: 'pointer', background: !isInternal ? C.accentDim : 'transparent', border: `1px solid ${!isInternal ? C.accent : C.border}`, color: !isInternal ? C.accentLight : C.muted }}>Reply to client</button>
                  <button type="button" onClick={() => setIsInternal(true)} style={{ fontSize: 11, padding: '3px 12px', borderRadius: 4, cursor: 'pointer', background: isInternal ? '#422006' : 'transparent', border: `1px solid ${isInternal ? '#92400e' : C.border}`, color: isInternal ? '#fbbf24' : C.muted }}>Internal note</button>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <textarea value={comment} onChange={e => setComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleComment(e); }}
                    placeholder={isInternal ? 'Internal note (hidden from client)…' : 'Reply to client…'}
                    rows={2}
                    style={{ flex: 1, background: C.card, border: `1px solid ${isInternal ? '#92400e' : C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 13, resize: 'none', outline: 'none' }}
                  />
                  <button onClick={handleComment} disabled={submitting || !comment.trim()}
                    style={{ padding: '0 18px', background: comment.trim() ? C.accent : C.accentDim, border: 'none', borderRadius: 8, color: C.white, fontSize: 16, fontWeight: 700, cursor: comment.trim() ? 'pointer' : 'default' }}>
                    ↑
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Overview */}
        {tab === 'Overview' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {[
              ['Ticket number', ticket.ticket_number],
              ['Requester', ticket.requester_name],
              ['Email', ticket.requester_email],
              ['Department', ticket.requester_dept],
              ['Company', ticket.company_name],
              ['Assignee', ticket.assignee || 'Unassigned'],
              ['Status', ticket.status],
              ['Priority', ticket.priority],
              ['Created', fmtFull(ticket.createdAt)],
              ['Acknowledged', ticket.acknowledgedAt ? fmtFull(ticket.acknowledgedAt) : '—'],
              ...(ticket.resolvedAt ? [['Resolved', fmtFull(ticket.resolvedAt)]] : []),
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', gap: 16, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 12, color: C.muted, width: 140, flexShrink: 0 }}>{label}</span>
                <span style={{ fontSize: 13, color: value ? C.text : C.dim }}>{value || '—'}</span>
              </div>
            ))}

            {ticket.priority_justification && (
              <div style={{ marginTop: 16, padding: '12px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Priority Justification</div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{ticket.priority_justification}</div>
              </div>
            )}

            {ticket.description && (
              <div style={{ marginTop: 16, padding: '12px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Description</div>
                <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{ticket.description}</div>
              </div>
            )}

            {ticket.tags?.length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ticket.tags.map(tag => (
                  <span key={tag} style={{ fontSize: 11, padding: '2px 10px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.muted }}>{tag}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Audit Log */}
        {tab === 'Audit Log' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
            {logs.map(log => (
              <div key={log.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: log.is_internal ? '#fbbf24' : C.accentLight, flexShrink: 0, marginTop: 5 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: C.text }}>{log.action}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{log.actor} · {fmtTime(log.timestamp)}</div>
                </div>
              </div>
            ))}
            {logs.length === 0 && <div style={{ fontSize: 13, color: C.dim, textAlign: 'center', marginTop: 40 }}>No activity yet</div>}
          </div>
        )}

        {/* Specs */}
        {tab === 'Specs' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
            {ticket.system_info ? (
              <>
                {realvncBase && ticket.system_info.hostname && (
                  <a href={`${realvncBase}?host=${ticket.system_info.hostname}`} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', padding: '12px 16px', background: '#1a0a2e', border: '1px solid #6d28d9', borderRadius: 8, color: '#c4b5fd', fontSize: 13, fontWeight: 600, textDecoration: 'none', textAlign: 'center', marginBottom: 20 }}>
                    ↗ Connect via RealVNC — {ticket.system_info.hostname}
                  </a>
                )}
                {Object.entries(ticket.system_info).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', gap: 16, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontSize: 12, color: C.muted, width: 160, flexShrink: 0, textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: 12, color: C.text, fontFamily: 'monospace', wordBreak: 'break-all' }}>{String(val)}</span>
                  </div>
                ))}
              </>
            ) : (
              <div style={{ fontSize: 13, color: C.dim, textAlign: 'center', marginTop: 60 }}>
                No system specs captured.
                <div style={{ fontSize: 12, marginTop: 8 }}>Specs are collected when clients submit via the desktop app.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
