import { useState, useRef, useEffect } from 'react';
import { C, P, ST, STAFF_ROLES } from '../constants/theme.js';
import { fmtTime, fmtFull } from '../utils/formatters.js';
import { api } from '../utils/api.js';
import { atLeast } from '../utils/permissions.js';
import { useToast } from '../utils/toast.jsx';
import SatisfactionModal from './SatisfactionModal.jsx';
import CompanyProfile from './CompanyProfile.jsx';
import { getSLADeadlineMs, fmtCountdown, SLA_WINDOWS_S } from '../utils/sla.js';

const FILE_ICONS = { PNG: '🖼', JPG: '🖼', PDF: '📄', DOCX: '📝' };

function fmt(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
}

function PriorityBadge({ p }) {
  const s = P[p] || P.P3;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700,
      padding: '2px 7px', borderRadius: 4,
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
    }}>{p}</span>
  );
}

function StatusBadge({ status }) {
  const s = ST[status] || { bg: C.card, text: C.muted };
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      padding: '2px 8px', borderRadius: 4,
      background: s.bg, color: s.text,
    }}>{status}</span>
  );
}

function MetaField({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 12, color: C.text }}>{children}</div>
    </div>
  );
}

const selectStyle = {
  background: C.card,
  border: `1px solid ${C.border}`,
  color: C.text,
  fontSize: 12,
  borderRadius: 4,
  padding: '4px 8px',
  cursor: 'pointer',
  width: '100%',
  outline: 'none',
};

const TERMINAL_STATUSES = ['CLOSED', 'CANCELLED', 'RESOLVED'];

function SLABar({ ticket }) {
  const [now, setNow] = useState(Date.now());
  const deadline = getSLADeadlineMs(ticket);

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;

  const remaining = Math.max(0, deadline - now);
  const windowMs = (SLA_WINDOWS_S[ticket.priority] || 1800) * 1000;
  const pct = Math.max(0, Math.min(1, remaining / windowMs));
  const breached = ticket.sla_breached || remaining === 0;
  const urgent = !breached && pct < 0.25;
  const barColor = breached ? '#ef4444' : urgent ? '#f59e0b' : '#4ade80';

  return (
    <div style={{
      padding: '7px 18px', borderBottom: `1px solid ${C.border}`,
      background: breached ? '#0f0000' : 'transparent',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>SLA</span>
        <span style={{ fontSize: 11, color: barColor, fontFamily: 'monospace', fontWeight: 700 }}>
          {breached ? '⚠ SLA Breached' : fmtCountdown(remaining)}
        </span>
      </div>
      <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct * 100}%`,
          background: barColor, borderRadius: 2,
          transition: 'width 1s linear, background 0.5s',
        }} />
      </div>
    </div>
  );
}

function SplitModal({ ticket, onClose, onSplit }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function handleSplit() {
    if (!title.trim()) return;
    setLoading(true);
    try {
      await onSplit(title.trim(), desc.trim());
    } catch (err) {
      toast(err.message, 'error');
      setLoading(false);
    }
  }

  const inp = {
    width: '100%', background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: '8px 10px', color: C.text,
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 460, padding: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Split ticket</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
          Creates a new ticket from {ticket.ticket_number}. The original is unchanged.
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>New ticket title *</label>
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="What does this split-off issue cover?" style={inp} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Description</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSplit} disabled={!title.trim() || loading} style={{ padding: '8px 18px', background: title.trim() ? C.accent : C.accentDim, border: 'none', borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: title.trim() && !loading ? 'pointer' : 'default', opacity: title.trim() ? 1 : 0.5 }}>
            {loading ? 'Splitting…' : 'Split'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MergeModal({ ticket, onClose, onMerge }) {
  const [target, setTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  async function handleMerge() {
    if (!target.trim()) return;
    setLoading(true);
    try {
      await onMerge(target.trim().toUpperCase());
    } catch (err) {
      toast(err.message, 'error');
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 420, padding: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Merge ticket</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
          {ticket.ticket_number} will be closed and merged into the target ticket. Both activity logs will be updated.
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Target ticket number *</label>
          <input
            autoFocus
            value={target}
            onChange={e => setTarget(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleMerge()}
            placeholder="e.g. TKT-007"
            style={{
              width: '100%', background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '8px 10px', color: C.text,
              fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace',
            }}
          />
        </div>
        <div style={{ padding: '10px 14px', background: '#2d1a0633', border: '1px solid #92400e44', borderRadius: 6, marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600 }}>⚠ This cannot be undone</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{ticket.ticket_number} will be permanently closed.</div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleMerge} disabled={!target.trim() || loading} style={{ padding: '8px 18px', background: '#7f1d1d', border: '1px solid #b91c1c', borderRadius: 6, color: '#fca5a5', fontSize: 13, fontWeight: 600, cursor: target.trim() && !loading ? 'pointer' : 'default', opacity: target.trim() ? 1 : 0.6 }}>
            {loading ? 'Merging…' : 'Merge & close'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TicketDetail({ ticket, agents, currentUser, onClose, onUpdate, onRefresh, onLog, isActive, onSetActive }) {
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showSatisfaction, setShowSatisfaction] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(ticket.description || '');
  const [uploading, setUploading] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [priorityPrompt, setPriorityPrompt] = useState(null);
  const [isInternal, setIsInternal] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [showCompanyProfile, setShowCompanyProfile] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['png', 'jpg', 'jpeg', 'pdf', 'docx'].includes(ext)) {
      toast('Only PNG, JPG, PDF and DOCX files are allowed', 'error'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('File must be under 5MB', 'error'); return;
    }

    setUploading(true);
    try {
      const attachment = await api.uploadAttachment(ticket.id, file);
      onRefresh({ ...ticket, attachments: [...(ticket.attachments || []), attachment], logs: ticket.logs });
      toast(`${file.name} uploaded`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteAttachment(attachment) {
    if (!window.confirm(`Remove ${attachment.file_name}?`)) return;
    try {
      await api.deleteAttachment(attachment.id);
      onRefresh({ ...ticket, attachments: ticket.attachments.filter(a => a.id !== attachment.id), logs: ticket.logs });
      toast('Attachment removed', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleAiSuggest() {
    setAiLoading(true);
    try {
      const result = await api.claude(
        'You are a helpdesk triage assistant. Analyze the ticket and suggest the single best next action for the support agent. Be specific and brief. Return JSON: { suggestion: string }',
        `Title: ${ticket.title}\nDescription: ${ticket.description}\nStatus: ${ticket.status}\nPriority: ${ticket.priority}\nAssignee: ${ticket.assignee || 'Unassigned'}`
      );
      onLog('AI Assistant', result.suggestion || 'Unable to generate suggestion.');
    } catch {
      onLog('AI Assistant', 'Unable to generate suggestion at this time.');
    } finally {
      setAiLoading(false);
    }
  }

  function handleStatusChange(e) {
    const s = e.target.value;
    onUpdate({ status: s });
    if (s === 'RESOLVED' && !ticket.satisfaction_score) setShowSatisfaction(true);
  }

  function handleAssigneeChange(e) {
    onUpdate({ assignee_id: e.target.value || null });
  }

  function handleAssignToMe() {
    const me = agents.find(a => a.full_name === currentUser.full_name);
    if (me) onUpdate({ assignee_id: me.id });
  }

  function handleSaveDesc() {
    if (descDraft.trim() === ticket.description) { setEditingDesc(false); return; }
    onUpdate({ description: descDraft.trim() });
    setEditingDesc(false);
  }

  function handleCancel() {
    if (!window.confirm('Cancel this ticket? This cannot be undone.')) return;
    onUpdate({ status: 'CANCELLED' });
  }

  async function handleSplit(title, description) {
    const result = await api.splitTicket(ticket.id, { title, description });
    onRefresh(result.original);
    toast(`Split → ${result.new_ticket.ticket_number}`, 'success');
    setShowSplit(false);
  }

  async function handleMerge(targetNumber) {
    const updated = await api.mergeTicket(ticket.id, targetNumber);
    onRefresh(updated);
    toast(`Merged into ${targetNumber}`, 'success');
    setShowMerge(false);
  }

  function handleNotifyTeams() {
    const webhookUrl = localStorage.getItem('tb_teams_webhook');
    if (!webhookUrl) {
      toast('Configure Teams webhook in Settings → Integrations', 'info', 6000);
      return;
    }
    const payload = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: ticket.priority === 'P1' ? 'FF0000' : 'FF8C00',
      summary: `${ticket.priority}: ${ticket.title}`,
      sections: [{
        activityTitle: `🚨 ${ticket.priority} Alert: ${ticket.title}`,
        activitySubtitle: `${ticket.ticket_number} · ${ticket.status}`,
        facts: [
          { name: 'Priority', value: ticket.priority },
          { name: 'Requester', value: ticket.requester?.name || 'Unknown' },
          { name: 'Assigned to', value: ticket.assignee || 'Unassigned' },
          { name: 'Company', value: ticket.company_name || '—' },
        ],
      }],
    };
    api.teamsNotify(webhookUrl, payload)
      .then(() => toast('Teams channel notified', 'success'))
      .catch(() => toast('Failed to notify Teams — check webhook URL', 'error'));
  }

  function handleAddComment() {
    if (!comment.trim()) return;
    onLog(currentUser.full_name, comment.trim(), {}, isInternal);
    setComment('');
  }

  const isStaff = STAFF_ROLES.includes(currentUser.role);
  const isTerminal = TERMINAL_STATUSES.includes(ticket.status);
  const isManager = atLeast(currentUser, 'TEAM_MANAGER');

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: C.surface,
    }}>
      <div style={{
        padding: '13px 18px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace', flexShrink: 0 }}>{ticket.ticket_number}</span>
          <PriorityBadge p={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {onSetActive && isStaff && (
            <button
              onClick={onSetActive}
              title={isActive ? 'Unpin active ticket' : 'Pin as active ticket'}
              style={{
                padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 5, fontWeight: 600,
                background: isActive ? C.accentDim : 'transparent',
                border: `1px solid ${isActive ? C.accent : C.border}`,
                color: isActive ? C.accentLight : C.muted,
              }}
            >
              {isActive ? '◉ Active' : '◎ Set Active'}
            </button>
          )}
          {isManager && !isTerminal && (
            <>
              <button onClick={() => setShowSplit(true)} style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 11, cursor: 'pointer' }}>
                Split
              </button>
              <button onClick={() => setShowMerge(true)} style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 11, cursor: 'pointer' }}>
                Merge
              </button>
            </>
          )}
          {isStaff && ['P1','P2'].includes(ticket.priority) && !isTerminal && (
            <button
              onClick={handleNotifyTeams}
              style={{ padding: '4px 10px', background: '#1a1f3a', border: '1px solid #3b4a8a', borderRadius: 5, color: '#93c5fd', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
            >
              Teams
            </button>
          )}
          {isStaff && !isTerminal && (
            <button
              onClick={handleCancel}
              style={{
                padding: '4px 10px', background: 'transparent',
                border: '1px solid #7f1d1d', borderRadius: 5,
                color: '#f87171', fontSize: 11, cursor: 'pointer',
              }}
            >
              Cancel ticket
            </button>
          )}
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
          >×</button>
        </div>
      </div>

      <SLABar ticket={ticket} />

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 18px 0' }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>
          {ticket.title}
        </h2>

        {editingDesc ? (
          <div style={{ marginBottom: 18 }}>
            <textarea
              value={descDraft}
              onChange={e => setDescDraft(e.target.value)}
              autoFocus
              rows={5}
              style={{
                width: '100%', background: C.card, border: `1px solid ${C.accent}`,
                borderRadius: 6, padding: '8px 10px', color: C.text,
                fontSize: 13, outline: 'none', resize: 'vertical',
                lineHeight: 1.65, boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button onClick={handleSaveDesc} style={{ padding: '5px 14px', background: C.accent, border: 'none', borderRadius: 5, color: C.white, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Save</button>
              <button onClick={() => { setEditingDesc(false); setDescDraft(ticket.description || ''); }} style={{ padding: '5px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 18, position: 'relative' }}>
            <p style={{ margin: 0, fontSize: 13, color: C.muted, lineHeight: 1.65 }}>
              {ticket.description || <span style={{ fontStyle: 'italic', color: C.dim }}>No description.</span>}
            </p>
            {isStaff && !isTerminal && (
              <button
                onClick={() => { setDescDraft(ticket.description || ''); setEditingDesc(true); }}
                style={{ marginTop: 4, background: 'none', border: 'none', color: C.dim, fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
              >
                Edit description
              </button>
            )}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 16,
          background: C.card,
          borderRadius: 8,
          padding: 14,
          border: `1px solid ${C.border}`,
        }}>
          <MetaField label="Requester">
            {ticket.requester.name}
            <span style={{ color: C.dim }}> · {ticket.requester.dept}</span>
          </MetaField>
          {ticket.company_name && (
            <MetaField label="Company">
              <span
                onClick={() => ticket.company_id && setShowCompanyProfile(true)}
                style={{ color: C.accentLight, cursor: ticket.company_id ? 'pointer' : 'default', textDecoration: ticket.company_id ? 'underline' : 'none' }}
              >
                {ticket.company_name}
              </span>
            </MetaField>
          )}
          <MetaField label="Created">{fmtFull(ticket.createdAt)}</MetaField>
          <MetaField label="Last updated">{fmtTime(ticket.updatedAt)}</MetaField>
          <MetaField label="Status">
            <select value={ticket.status} onChange={handleStatusChange} style={selectStyle}>
              {Object.keys(ST).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </MetaField>
          <MetaField label="Priority">
            {ticket.priority_pending_approval && (
              <div style={{ marginBottom: 8, padding: '6px 10px', background: '#422006', border: '1px solid #92400e', borderRadius: 6, fontSize: 11, color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span>⚠ P1 pending manager approval</span>
                {['TEAM_MANAGER', 'SYSTEM_ADMIN'].includes(currentUser.role) && (
                  <button
                    onClick={async () => {
                      try {
                        const updated = await api.approvePriority(ticket.id);
                        onUpdate({ priority_pending_approval: false });
                      } catch (e) {}
                    }}
                    style={{ padding: '3px 10px', background: '#4ade80', border: 'none', borderRadius: 4, color: '#052e16', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Approve P1
                  </button>
                )}
              </div>
            )}
            {ticket.priority_justification && (
              <div style={{ marginBottom: 8, fontSize: 11, color: C.muted, fontStyle: 'italic' }}>
                "{ticket.priority_justification}"
              </div>
            )}
            {STAFF_ROLES.includes(currentUser.role) ? (
              <div>
                <select
                  value={ticket.priority}
                  onChange={e => setPriorityPrompt({ value: e.target.value, reason: '' })}
                  style={selectStyle}
                >
                  {['P1','P2','P3','P4','P5'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {priorityPrompt && priorityPrompt.value !== ticket.priority && (
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      autoFocus
                      value={priorityPrompt.reason}
                      onChange={e => setPriorityPrompt(p => ({ ...p, reason: e.target.value }))}
                      placeholder="Reason for change…"
                      onKeyDown={e => {
                        if (e.key === 'Escape') setPriorityPrompt(null);
                        if (e.key === 'Enter' && priorityPrompt.reason.trim()) {
                          onUpdate({ priority: priorityPrompt.value });
                          onLog(currentUser.full_name, `priority → ${priorityPrompt.value} — ${priorityPrompt.reason.trim()}`);
                          setPriorityPrompt(null);
                        }
                      }}
                      style={{ flex: 1, background: C.card, border: `1px solid ${C.accent}`, borderRadius: 4, padding: '4px 8px', color: C.text, fontSize: 11, outline: 'none' }}
                    />
                    <button
                      onClick={() => {
                        if (!priorityPrompt.reason.trim()) return;
                        onUpdate({ priority: priorityPrompt.value });
                        onLog(currentUser.full_name, `priority → ${priorityPrompt.value} — ${priorityPrompt.reason.trim()}`);
                        setPriorityPrompt(null);
                      }}
                      style={{ padding: '4px 8px', background: C.accent, border: 'none', borderRadius: 4, color: C.white, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setPriorityPrompt(null)}
                      style={{ padding: '4px 8px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 4, color: C.muted, fontSize: 11, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <PriorityBadge p={ticket.priority} />
            )}
          </MetaField>
          <MetaField label="Assignee">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {atLeast(currentUser, 'SENIOR_AGENT') ? (
                <select value={ticket.assignee_id || ''} onChange={handleAssigneeChange} style={{ ...selectStyle, flex: 1 }}>
                  <option value="">Unassigned</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                </select>
              ) : (
                <span style={{ flex: 1 }}>{ticket.assignee || <span style={{ color: C.dim, fontStyle: 'italic' }}>Unassigned</span>}</span>
              )}
              {isStaff && !isTerminal && ticket.assignee !== currentUser.full_name && (
                <button
                  onClick={handleAssignToMe}
                  style={{ padding: '3px 8px', background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 4, color: C.accentLight, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Assign to me
                </button>
              )}
            </div>
          </MetaField>
          {ticket.system_info && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Client System</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  ['OS', ticket.system_info.os],
                  ['Browser', ticket.system_info.browser],
                  ['Screen', ticket.system_info.screen],
                  ['Platform', ticket.system_info.platform],
                  ['Language', ticket.system_info.language],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <span key={label} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    background: C.surface, border: `1px solid ${C.border}`, color: C.muted,
                  }}>
                    <span style={{ color: C.dim }}>{label}: </span>{value}
                  </span>
                ))}
              </div>
            </div>
          )}
          {ticket.satisfaction_score && (
            <MetaField label="Satisfaction">
              <span style={{ color: '#facc15', letterSpacing: 2 }}>
                {'★'.repeat(ticket.satisfaction_score)}{'☆'.repeat(5 - ticket.satisfaction_score)}
              </span>
              <span style={{ color: C.muted, fontSize: 11, marginLeft: 6 }}>{ticket.satisfaction_score}/5</span>
              {ticket.satisfaction_note && (
                <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>{ticket.satisfaction_note}</div>
              )}
            </MetaField>
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
              {(ticket.tags || []).map(tag => (
                <span key={tag} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4,
                  background: C.surface, border: `1px solid ${C.border}`, color: C.muted,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {tag}
                  {isStaff && !isTerminal && (
                    <button
                      onClick={() => onUpdate({ tags: ticket.tags.filter(t => t !== tag) })}
                      style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}
                    >×</button>
                  )}
                </span>
              ))}
              {isStaff && !isTerminal && (
                <input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                      e.preventDefault();
                      const newTag = tagInput.trim().toLowerCase().replace(/,/g, '');
                      if (newTag && !(ticket.tags || []).includes(newTag)) {
                        onUpdate({ tags: [...(ticket.tags || []), newTag] });
                      }
                      setTagInput('');
                    }
                  }}
                  placeholder="Add tag…"
                  style={{
                    background: 'transparent', border: 'none',
                    borderBottom: `1px solid ${C.border}`,
                    color: C.muted, fontSize: 11, outline: 'none',
                    padding: '2px 4px', width: 80,
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* Attachments */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Attachments {ticket.attachments?.length > 0 && `· ${ticket.attachments.length}`}
            </div>
            {!isTerminal && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    padding: '3px 10px', background: 'transparent',
                    border: `1px solid ${C.border}`, borderRadius: 5,
                    color: uploading ? C.dim : C.muted, fontSize: 11,
                    cursor: uploading ? 'default' : 'pointer',
                  }}
                >
                  {uploading ? 'Uploading…' : '+ Attach file'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf,.docx"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </>
            )}
          </div>

          {ticket.attachments?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ticket.attachments.map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: C.card, border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: '7px 10px',
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{FILE_ICONS[a.file_type] || '📎'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.file_name}</div>
                    <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>{fmt(a.file_size_bytes)} · {a.uploaded_by} · {fmtTime(a.uploaded_at)}</div>
                  </div>
                  <button
                    onClick={() => api.downloadAttachment(a.id, a.file_name)}
                    style={{ padding: '3px 8px', background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 4, color: C.accentLight, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}
                  >
                    Download
                  </button>
                  {isStaff && !isTerminal && (
                    <button
                      onClick={() => handleDeleteAttachment(a)}
                      style={{ background: 'none', border: 'none', color: C.dim, fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '0 2px', flexShrink: 0 }}
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.dim, fontStyle: 'italic' }}>No attachments</div>
          )}
        </div>

        <button
          onClick={handleAiSuggest}
          disabled={aiLoading}
          style={{
            width: '100%',
            padding: '8px 12px',
            marginBottom: 18,
            background: aiLoading ? C.card : C.accentDim,
            border: `1px solid ${aiLoading ? C.border : C.accent}`,
            borderRadius: 6,
            color: aiLoading ? C.muted : C.accentLight,
            fontSize: 13,
            fontWeight: 600,
            cursor: aiLoading ? 'default' : 'pointer',
          }}
        >
          {aiLoading ? '⟳ Thinking…' : '✦ AI: Suggest Next Action'}
        </button>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Activity · {ticket.logs.length}
          </div>
          {[...ticket.logs].reverse().map(log => {
            const isAI = log.actor === 'AI Assistant';
            const internal = log.is_internal;
            const avatarBg = internal ? '#451a03' : isAI ? C.accentDim : C.card;
            const avatarBorder = internal ? '#92400e' : isAI ? C.accent : C.border;
            const avatarColor = internal ? '#fbbf24' : isAI ? C.accentLight : C.muted;
            return (
              <div key={log.id} style={{
                display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start',
                background: internal ? '#1a120033' : 'transparent',
                borderRadius: internal ? 6 : 0,
                padding: internal ? '6px 8px' : 0,
                border: internal ? '1px solid #92400e33' : 'none',
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: avatarBg, border: `1px solid ${avatarBorder}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: avatarColor, flexShrink: 0, fontWeight: 700,
                }}>
                  {isAI ? '✦' : internal ? '🔒' : log.actor.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{log.actor} </span>
                  <span style={{ fontSize: 12, color: C.muted }}>{log.action}</span>
                  {internal && <span style={{ fontSize: 10, color: '#fbbf24', marginLeft: 6, fontWeight: 600 }}>INTERNAL</span>}
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{fmtTime(log.timestamp)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        padding: '10px 14px',
        borderTop: `1px solid ${C.border}`,
        background: isInternal ? '#1a1200' : 'transparent',
        transition: 'background 0.15s',
      }}>
        {isStaff && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 7 }}>
            {[false, true].map(internal => (
              <button
                key={String(internal)}
                onClick={() => setIsInternal(internal)}
                style={{
                  padding: '3px 10px', fontSize: 11, fontWeight: 600,
                  border: `1px solid ${isInternal === internal ? (internal ? '#b45309' : C.accent) : C.border}`,
                  borderRadius: 4, cursor: 'pointer',
                  background: isInternal === internal ? (internal ? '#451a03' : C.accentDim) : 'transparent',
                  color: isInternal === internal ? (internal ? '#fbbf24' : C.accentLight) : C.dim,
                }}
              >
                {internal ? '🔒 Internal note' : '💬 Reply to client'}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddComment()}
            placeholder={isInternal ? 'Internal note — not visible to client…' : 'Reply visible to client…'}
            style={{
              flex: 1, background: C.card,
              border: `1px solid ${isInternal ? '#92400e' : C.border}`,
              borderRadius: 6, padding: '7px 12px',
              color: C.text, fontSize: 13, outline: 'none',
            }}
          />
          <button
            onClick={handleAddComment}
            style={{
              padding: '7px 14px',
              background: isInternal ? '#b45309' : C.accent,
              border: 'none', borderRadius: 6,
              color: C.white, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {isInternal ? 'Note' : 'Send'}
          </button>
        </div>
      </div>

      {showSatisfaction && (
        <SatisfactionModal
          ticketNumber={ticket.ticket_number}
          onSubmit={async (score, note) => {
            const updated = await api.submitSatisfaction(ticket.id, score, note);
            onRefresh(updated);
            setShowSatisfaction(false);
          }}
          onSkip={() => setShowSatisfaction(false)}
        />
      )}

      {showSplit && (
        <SplitModal
          ticket={ticket}
          onClose={() => setShowSplit(false)}
          onSplit={handleSplit}
        />
      )}

      {showMerge && (
        <MergeModal
          ticket={ticket}
          onClose={() => setShowMerge(false)}
          onMerge={handleMerge}
        />
      )}

      {showCompanyProfile && ticket.company_id && (
        <CompanyProfile
          companyId={ticket.company_id}
          currentUser={currentUser}
          onClose={() => setShowCompanyProfile(false)}
        />
      )}
    </div>
  );
}
