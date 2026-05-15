import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { C, P, ST, THEMES, applyTheme } from '../constants/theme.js';
import { fmtTime, fmtFull } from '../utils/formatters.js';
import { api } from '../utils/api.js';
import { useToast } from '../utils/toast.jsx';
import { collectSystemInfo } from '../utils/systemInfo.js';
import { loadPrefs, savePrefs } from '../utils/preferences.js';
import { canNotify, notifyPermission, requestPermission } from '../utils/notifications.js';
import EmergencyContacts from './EmergencyContacts.jsx';
import SatisfactionModal from './SatisfactionModal.jsx';
import ChangePasswordModal from './ChangePasswordModal.jsx';

// ── Client accent (purple) ────────────────────────────────────────────────────
const CA      = '#7c3aed';
const CA_DIM  = '#1a0f2e';
const CA_LIGHT= '#a78bfa';

const TERMINAL = new Set(['RESOLVED', 'CLOSED', 'CANCELLED']);
const SLA_HOURS = { P1: 1, P2: 4, P3: 8, P4: 24, P5: 72 };

const TEMPLATES = [
  { id: 'pw',       name: 'Password Reset',      icon: '🔑', category: 'Access',   urgency: 'today',    title: 'Password reset required',        description: "I'm unable to log in and need my password reset.",                             steps: ["Try the 'Forgot Password' link on the login page", "Check Caps Lock is off and you're using the right email", "Try a different browser or incognito window"] },
  { id: 'vpn',      name: 'VPN Not Working',      icon: '🌐', category: 'Network',  urgency: 'blocking', title: 'Unable to connect to VPN',        description: 'I cannot connect to the company VPN and cannot access remote resources.',        steps: ['Check your internet connection is working', 'Close and reopen the VPN client', 'Try restarting your computer'] },
  { id: 'printer',  name: 'Printer Offline',       icon: '🖨',  category: 'Hardware', urgency: 'can-wait', title: 'Office printer is offline',       description: 'The printer is showing offline and I cannot print.',                           steps: ['Check the printer is powered on and showing Ready', 'Try restarting the printer', 'Check the USB or network cable is connected'] },
  { id: 'software', name: 'Software Not Opening',  icon: '💻', category: 'Software', urgency: 'today',    title: 'Application will not open',       description: 'An application is not launching or crashes immediately on open.',               steps: ['Close and reopen the application', 'Restart your computer', 'Check if other apps are working normally'] },
  { id: 'email',    name: 'Email Not Working',      icon: '📧', category: 'Email',    urgency: 'blocking', title: 'Unable to send or receive email', description: 'Outlook/email is not working — I cannot send or receive messages.',             steps: ['Check your internet connection', 'Try restarting Outlook', 'Check if the issue affects all emails or just specific senders'] },
];

const URGENCY_MAP = {
  'can-wait': { priority: 'P4', label: 'Can wait',        color: '#4ade80' },
  'today':    { priority: 'P3', label: 'Today please',    color: '#fbbf24' },
  'blocking': { priority: 'P2', label: 'Blocking me now', color: '#ef4444' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRole(r) {
  return (r || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function plainStatus(ticket) {
  const { status, assignee, logs = [], updatedAt } = ticket;
  if (status === 'OPEN')
    return { text: 'Waiting to be assigned to a support agent', color: '#fbbf24' };
  if (status === 'ACKNOWLEDGED')
    return { text: "We've seen your ticket and it's being prioritised", color: '#60a5fa' };
  if (status === 'IN PROGRESS') {
    if (assignee) {
      const workLog = [...logs].reverse().find(l => l.action.toLowerCase().includes('progress'));
      const since = workLog ? new Date(workLog.timestamp) : new Date(updatedAt);
      const mins = Math.floor((Date.now() - since) / 60000);
      if (mins < 5)  return { text: `${assignee} just started working on this`, color: '#4ade80' };
      if (mins < 60) return { text: `${assignee} has been working on this for ${mins} minute${mins !== 1 ? 's' : ''}`, color: '#4ade80' };
      const hrs = Math.floor(mins / 60);
      return { text: `${assignee} has been working on this for ${hrs} hour${hrs !== 1 ? 's' : ''}`, color: '#4ade80' };
    }
    return { text: 'Your ticket is actively being worked on', color: '#4ade80' };
  }
  if (status === 'PENDING CLIENT')
    return { text: "We need more information from you — please add a note below", color: '#f97316' };
  if (status === 'ESCALATED')
    return { text: 'Your ticket has been escalated to a senior engineer', color: '#c084fc' };
  if (status === 'SLA BREACHED')
    return { text: "This is taking longer than expected — we apologise and are on it", color: '#ef4444' };
  if (status === 'RESOLVED')
    return { text: `${assignee || 'The support team'} has resolved this issue`, color: '#4ade80' };
  if (status === 'CLOSED')
    return { text: 'This ticket has been closed', color: C.muted };
  return { text: status, color: C.muted };
}

function estimateResolution(ticket) {
  if (TERMINAL.has(ticket.status)) return null;
  const created = new Date(ticket.createdAt);
  const eta = new Date(created.getTime() + (SLA_HOURS[ticket.priority] || 8) * 3600000);
  const now = new Date();
  if (eta < now) return 'Due now — working to resolve as soon as possible';
  const diffMins = Math.floor((eta - now) / 60000);
  if (diffMins < 60) return `Expected within ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
  if (eta.toDateString() === now.toDateString())
    return `Expected by ${eta.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} today`;
  return `Expected by ${eta.toLocaleDateString('en-GB', { weekday: 'long' })} at ${eta.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function PriorityBadge({ p }) {
  const s = P[p] || P.P3;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: s.bg, color: s.text, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>{p}</span>;
}

function StatusBadge({ status }) {
  const s = ST[status] || { bg: C.card, text: C.muted };
  return <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: s.bg, color: s.text, whiteSpace: 'nowrap' }}>{status}</span>;
}

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{ width: 40, height: 22, borderRadius: 11, background: value ? CA : C.card, border: `1px solid ${value ? CA : C.border}`, cursor: 'pointer', position: 'relative', transition: 'background 0.2s', padding: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: value ? 20 : 2, width: 16, height: 16, borderRadius: '50%', background: C.white, transition: 'left 0.2s' }} />
    </button>
  );
}

function SettingSelect({ value, onChange, options }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function SettingSection({ title, description, children }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '13px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>
        {description && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{description}</div>}
      </div>
      <div style={{ padding: '4px 0' }}>{children}</div>
    </div>
  );
}

function SettingRow({ label, description, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', gap: 16, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: C.text }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

// ── Knowledge base ────────────────────────────────────────────────────────────

function SuggestEditModal({ article, onClose }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!text.trim()) return;
    setSubmitting(true);
    try { await api.suggestKBEdit(article.id, text.trim()); toast('Suggestion submitted', 'success'); onClose(); }
    catch (err) { toast(err.message, 'error'); setSubmitting(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 460, padding: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Suggest an edit</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>"{article.title}"</div>
        <textarea autoFocus value={text} onChange={e => setText(e.target.value)} rows={5}
          placeholder="What's incorrect or missing?"
          style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 18 }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!text.trim() || submitting}
            style={{ padding: '8px 18px', background: text.trim() ? CA : CA_DIM, border: 'none', borderRadius: 6, color: 'white', fontSize: 13, fontWeight: 600, cursor: text.trim() && !submitting ? 'pointer' : 'default', opacity: text.trim() ? 1 : 0.5 }}>
            {submitting ? 'Sending…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClientKB() {
  const [articles, setArticles] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [suggestFor, setSuggestFor] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.listArticles({ search }).then(setArticles).catch(() => {}).finally(() => setLoading(false));
  }, [search]);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: selected ? '0 0 44%' : 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: selected ? `1px solid ${C.border}` : 'none' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 10 }}>Knowledge Base</div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search knowledge base…"
            style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 12px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading…</div>}
          {!loading && articles.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>No articles found</div>}
          {articles.map(a => (
            <div key={a.id} onClick={() => setSelected(a.id === selected?.id ? null : a)}
              style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${selected?.id === a.id ? CA : 'transparent'}`, background: selected?.id === a.id ? C.card : 'transparent', cursor: 'pointer' }}>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 500, marginBottom: 3 }}>{a.title}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{a.category}</div>
            </div>
          ))}
        </div>
      </div>
      {selected && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{selected.title}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{selected.category}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setSuggestFor(selected)} style={{ padding: '5px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 11, cursor: 'pointer' }}>Suggest edit</button>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, color: C.muted, lineHeight: 1.7, fontFamily: 'system-ui, -apple-system, sans-serif' }}>{selected.content}</pre>
          </div>
        </div>
      )}
      {suggestFor && <SuggestEditModal article={suggestFor} onClose={() => setSuggestFor(null)} />}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const SIDEBAR_ITEMS = [
  { id: 'home',      label: 'Dashboard',      icon: '⌂' },
  { id: 'tickets',   label: 'Active Tickets', icon: '◈' },
  { id: 'history',   label: 'History',        icon: '◷' },
  { id: 'agents',    label: 'Support Team',   icon: '◉' },
  { id: 'kb',        label: 'Knowledge Base', icon: '≡' },
  { id: 'emergency', label: 'Emergency',      icon: '⚠', red: true },
  { id: 'settings',  label: 'Settings',       icon: '◧' },
];

function ClientSidebar({ view, onViewChange, user, onLogout, openCount, onNewTicket }) {
  const [collapsed, setCollapsed] = useState(false);
  const w = collapsed ? 52 : 208;

  return (
    <div style={{ width: w, minWidth: w, background: C.surface, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width 0.18s ease, min-width 0.18s ease' }}>
      <div style={{ padding: collapsed ? '16px 0' : '16px 14px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', gap: 8, minHeight: 56 }}>
        {!collapsed && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, letterSpacing: -0.3 }}><span style={{ color: CA }}>●</span> Beacon</div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 2, letterSpacing: 0.5 }}>CLIENT PORTAL</div>
          </div>
        )}
        {collapsed && <span style={{ color: CA, fontSize: 18 }}>●</span>}
        <button onClick={() => setCollapsed(c => !c)}
          style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 11, cursor: 'pointer', padding: '3px 6px', flexShrink: 0, lineHeight: 1 }}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Submit ticket button */}
      <div style={{ padding: collapsed ? '10px 6px 4px' : '10px 10px 4px' }}>
        <button onClick={onNewTicket} title={collapsed ? 'Submit Ticket' : undefined}
          style={{ width: '100%', padding: collapsed ? '9px 0' : '9px 12px', background: CA, color: 'white', border: 'none', borderRadius: 7, fontSize: collapsed ? 16 : 13, fontWeight: 600, cursor: 'pointer' }}>
          {collapsed ? '+' : '+ Submit Ticket'}
        </button>
      </div>

      <nav style={{ flex: 1, padding: collapsed ? '8px 4px' : '8px', overflowY: 'auto' }}>
        {SIDEBAR_ITEMS.map(item => {
          const active = view === item.id;
          return (
            <button key={item.id} onClick={() => onViewChange(item.id)} title={collapsed ? item.label : undefined}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, padding: collapsed ? '9px 0' : '9px 12px', marginBottom: 2, background: active ? CA_DIM : 'transparent', border: 'none', borderRadius: 7, borderLeft: collapsed ? 'none' : (active ? `3px solid ${CA}` : '3px solid transparent'), outline: (collapsed && active) ? `2px solid ${CA}` : 'none', color: active ? CA_LIGHT : item.red ? '#f87171' : C.muted, fontSize: 14, fontWeight: active ? 600 : 400, cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s', position: 'relative' }}>
              <span style={{ fontSize: 15, opacity: 0.85, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && (
                <>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.id === 'tickets' && openCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: active ? CA : C.card, color: active ? 'white' : C.muted, borderRadius: 10, padding: '1px 7px', border: `1px solid ${active ? CA : C.border}` }}>{openCount}</span>
                  )}
                </>
              )}
              {collapsed && item.id === 'tickets' && openCount > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 4, width: 7, height: 7, borderRadius: '50%', background: CA }} />
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: collapsed ? '10px 4px' : '10px 14px', borderTop: `1px solid ${C.border}` }}>
        {collapsed ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div title={user.full_name} style={{ width: 28, height: 28, borderRadius: '50%', background: CA_DIM, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: CA_LIGHT, border: `1px solid ${CA}`, cursor: 'default' }}>
              {user.full_name?.[0]?.toUpperCase() ?? '?'}
            </div>
            <button onClick={onLogout} title="Sign out" style={{ background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 13, cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}>⏻</button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.full_name}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{user.company_name || 'Client'}</div>
            </div>
            <button onClick={onLogout} style={{ width: '100%', padding: '6px 8px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 11, cursor: 'pointer' }}>Sign out</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────────

function ActivityFeed({ tickets }) {
  const events = useMemo(() => {
    const all = [];
    tickets.forEach(t => (t.logs || []).forEach(log => { if (!log.is_internal) all.push({ ...log, ticket_number: t.ticket_number }); }));
    return all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8);
  }, [tickets]);

  if (!events.length) return <div style={{ fontSize: 12, color: C.dim, padding: '12px 0' }}>No recent activity yet.</div>;

  return (
    <div>
      {events.map(ev => (
        <div key={ev.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: ev.actor === 'System' ? C.card : CA_DIM, border: `1px solid ${ev.actor === 'System' ? C.border : CA}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: ev.actor === 'System' ? C.dim : CA_LIGHT, fontWeight: 700, flexShrink: 0 }}>
            {ev.actor === 'System' ? '⚙' : ev.actor.charAt(0)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: C.text }}><span style={{ fontWeight: 600 }}>{ev.actor}</span><span style={{ color: C.muted }}> {ev.action}</span></div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>{ev.ticket_number} · {fmtTime(ev.timestamp)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ServiceStatus({ announcements }) {
  const relevant = announcements.filter(a => a.is_pinned || a.category === 'SECURITY');
  if (!relevant.length) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Service Status</div>
      {relevant.map(a => (
        <div key={a.id} style={{ background: a.category === 'SECURITY' ? '#1a0a00' : C.card, border: `1px solid ${a.category === 'SECURITY' ? '#92400e' : C.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: a.category === 'SECURITY' ? '#fbbf24' : C.accentLight, marginBottom: 3 }}>{a.category === 'SECURITY' ? '⚠ ' : '📢 '}{a.title}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{a.body}</div>
        </div>
      ))}
    </div>
  );
}

// ── Ticket submission ─────────────────────────────────────────────────────────

function TroubleshootingWizard({ steps, onAllTried, onSkip }) {
  const [checked, setChecked] = useState(new Set());
  const allChecked = checked.size >= steps.length;
  return (
    <div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 14 }}>Before raising a ticket, try these quick fixes first:</div>
      <div style={{ marginBottom: 16 }}>
        {steps.map((step, i) => (
          <label key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', alignItems: 'flex-start' }}>
            <input type="checkbox" checked={checked.has(i)} onChange={() => setChecked(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })} style={{ marginTop: 2, accentColor: CA, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: C.text }}>{step}</span>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onSkip} style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 12, cursor: 'pointer' }}>Skip</button>
        <button onClick={allChecked ? onAllTried : undefined} disabled={!allChecked}
          style={{ padding: '8px 16px', background: allChecked ? CA : CA_DIM, border: `1px solid ${allChecked ? CA : 'transparent'}`, borderRadius: 6, color: allChecked ? 'white' : CA_LIGHT, fontSize: 12, fontWeight: 600, cursor: allChecked ? 'pointer' : 'default', opacity: allChecked ? 1 : 0.6 }}>
          {allChecked ? 'Tried everything → Submit ticket' : `Tick all ${steps.length} steps to proceed`}
        </button>
      </div>
    </div>
  );
}

function TemplateConfirm({ template, troubleshootDone, onSubmit, onBack, submitting }) {
  const [urgency, setUrgency] = useState(template.urgency);
  return (
    <div>
      <div style={{ background: C.card, borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Ticket title</div>
        <div style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{template.title}</div>
      </div>
      <div style={{ background: C.card, borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Description</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{template.description}{troubleshootDone && <span style={{ color: C.dim }}> (Troubleshooting steps already attempted.)</span>}</div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>How urgent?</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.entries(URGENCY_MAP).map(([key, val]) => (
            <button key={key} onClick={() => setUrgency(key)}
              style={{ flex: 1, padding: '9px 6px', borderRadius: 8, border: `1px solid ${urgency === key ? val.color : C.border}`, background: urgency === key ? `${val.color}18` : 'transparent', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 16, marginBottom: 3 }}>{key === 'can-wait' ? '🟢' : key === 'today' ? '🟡' : '🔴'}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: urgency === key ? val.color : C.muted }}>{val.label}</div>
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onBack} style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Back</button>
        <button onClick={() => onSubmit(urgency)} disabled={submitting}
          style={{ padding: '8px 18px', background: CA, border: 'none', borderRadius: 6, color: 'white', fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}>
          {submitting ? 'Submitting…' : 'Confirm & submit'}
        </button>
      </div>
    </div>
  );
}

function SmartSubmitModal({ onClose, onCreate }) {
  const toast = useToast();
  const [phase, setPhase] = useState('choose');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [troubleshootDone, setTroubleshootDone] = useState(false);
  const [affected, setAffected] = useState('');
  const [urgency, setUrgency] = useState('today');
  const [whatHappened, setWhatHappened] = useState('');
  const [listening, setListening] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechOk = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = 'en-US';
    r.onresult = e => setWhatHappened(prev => prev + (prev ? ' ' : '') + e.results[0][0].transcript);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start();
    recognitionRef.current = r;
    setListening(true);
  }

  async function submit(ticketData) {
    setSubmitting(true);
    try {
      const ticket = await api.createTicket(ticketData);
      for (const f of attachments) { try { await api.uploadAttachment(ticket.id, f); } catch {} }
      onCreate(ticket);
      toast(`${ticket.ticket_number} submitted`, 'success');
    } catch (err) { toast(err.message, 'error'); setSubmitting(false); }
  }

  function submitSmart() {
    const u = URGENCY_MAP[urgency] || URGENCY_MAP.today;
    const title = affected
      ? `${affected} — ${whatHappened.slice(0, 50).trimEnd()}${whatHappened.length > 50 ? '…' : ''}`
      : whatHappened.slice(0, 60).trimEnd();
    submit({ title, description: whatHappened.trim(), priority: u.priority, tags: [], system_info: collectSystemInfo() });
  }

  function submitTemplate(selectedUrgency) {
    const u = URGENCY_MAP[selectedUrgency] || URGENCY_MAP[selectedTemplate.urgency];
    const desc = selectedTemplate.description + (troubleshootDone ? '\n\nTroubleshooting already attempted: ' + selectedTemplate.steps.join('; ') : '');
    submit({ title: selectedTemplate.title, description: desc, priority: u.priority, tags: [selectedTemplate.category], system_info: collectSystemInfo() });
  }

  const inp = { width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
  const titles = { choose: 'Get Support', smart: 'Tell us what happened', template: 'Quick Templates', troubleshoot: 'Quick Troubleshooting', 'confirm-template': 'Review & Submit' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: 530, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{titles[phase] || 'Get Support'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {phase === 'choose' && (
            <div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>How would you like to raise your request?</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { id: 'smart',    icon: '✦', title: 'Guided submission', desc: 'Answer three quick questions and we build the ticket for you' },
                  { id: 'template', icon: '◈', title: 'Use a template',    desc: 'One-tap for common issues: password reset, VPN, printer, and more' },
                ].map(opt => (
                  <button key={opt.id} onClick={() => setPhase(opt.id)}
                    style={{ display: 'flex', gap: 14, padding: '14px 16px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 22, marginTop: 1, flexShrink: 0 }}>{opt.icon}</span>
                    <div><div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 3 }}>{opt.title}</div><div style={{ fontSize: 12, color: C.muted }}>{opt.desc}</div></div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {phase === 'template' && (
            <div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Select your issue to pre-fill the form:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => { setSelectedTemplate(t); setTroubleshootDone(false); setPhase('troubleshoot'); }}
                    style={{ padding: '12px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 20 }}>{t.icon}</span>
                    <div><div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{t.name}</div><div style={{ fontSize: 10, color: C.muted }}>{t.category}</div></div>
                  </button>
                ))}
              </div>
              <button onClick={() => setPhase('choose')} style={{ fontSize: 12, color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}>← Back</button>
            </div>
          )}
          {phase === 'troubleshoot' && selectedTemplate && (
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, padding: '10px 14px', background: C.card, borderRadius: 8 }}>
                <span style={{ fontSize: 20 }}>{selectedTemplate.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{selectedTemplate.name}</span>
              </div>
              <TroubleshootingWizard steps={selectedTemplate.steps} onAllTried={() => { setTroubleshootDone(true); setPhase('confirm-template'); }} onSkip={() => setPhase('confirm-template')} />
            </div>
          )}
          {phase === 'confirm-template' && selectedTemplate && (
            <TemplateConfirm template={selectedTemplate} troubleshootDone={troubleshootDone} onSubmit={submitTemplate} onBack={() => setPhase('troubleshoot')} submitting={submitting} />
          )}
          {phase === 'smart' && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>1. What's affected?</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {['My email','My computer','A specific application','The printer','VPN / Remote access','My login / password','Network / internet','Something else'].map(opt => (
                    <button key={opt} onClick={() => setAffected(opt === affected ? '' : opt)}
                      style={{ padding: '6px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer', background: affected === opt ? CA_DIM : 'transparent', border: `1px solid ${affected === opt ? CA : C.border}`, color: affected === opt ? CA_LIGHT : C.muted }}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 10 }}>2. How urgent is it?</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {Object.entries(URGENCY_MAP).map(([key, val]) => (
                    <button key={key} onClick={() => setUrgency(key)}
                      style={{ flex: 1, padding: '10px 6px', borderRadius: 8, border: `1px solid ${urgency === key ? val.color : C.border}`, background: urgency === key ? `${val.color}18` : 'transparent', cursor: 'pointer', textAlign: 'center' }}>
                      <div style={{ fontSize: 18, marginBottom: 4 }}>{key === 'can-wait' ? '🟢' : key === 'today' ? '🟡' : '🔴'}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: urgency === key ? val.color : C.muted }}>{val.label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>3. What happened?</div>
                <div style={{ position: 'relative' }}>
                  <textarea value={whatHappened} onChange={e => setWhatHappened(e.target.value)}
                    placeholder={speechOk ? 'Describe the issue, or tap 🎤 to speak…' : 'Describe the issue in your own words…'}
                    rows={4} style={{ ...inp, resize: 'vertical', paddingRight: speechOk ? 46 : 12 }} />
                  {speechOk && (
                    <button onClick={listening ? () => { recognitionRef.current?.stop(); setListening(false); } : startVoice}
                      style={{ position: 'absolute', right: 8, bottom: 10, background: listening ? '#ef4444' : CA, border: 'none', borderRadius: 6, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14 }}>
                      {listening ? '⏹' : '🎤'}
                    </button>
                  )}
                </div>
                {listening && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>Listening…</div>}
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Attach a screenshot or photo (optional)</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={() => fileRef.current?.click()} style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 12, cursor: 'pointer' }}>📎 Add attachment</button>
                  <input ref={fileRef} type="file" accept="image/*,.pdf" multiple style={{ display: 'none' }} onChange={e => setAttachments(prev => [...prev, ...Array.from(e.target.files)])} />
                  {attachments.map((f, i) => (
                    <span key={i} style={{ fontSize: 11, background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: '3px 8px', color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {f.name.length > 22 ? f.name.slice(0, 20) + '…' : f.name}
                      <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setPhase('choose')} style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Back</button>
                <button onClick={submitSmart} disabled={!whatHappened.trim() || submitting}
                  style={{ padding: '8px 18px', background: whatHappened.trim() ? CA : CA_DIM, border: 'none', borderRadius: 6, color: 'white', fontSize: 13, fontWeight: 600, cursor: whatHappened.trim() && !submitting ? 'pointer' : 'default', opacity: whatHappened.trim() ? 1 : 0.5 }}>
                  {submitting ? 'Submitting…' : 'Submit ticket'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickConfirmModal({ template, onConfirm, onClose, submitting }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 360, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>{template.icon}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>{template.name}</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 22 }}>This will raise a ticket: "{template.title}"</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={submitting} style={{ flex: 1, padding: '9px', background: CA, border: 'none', borderRadius: 7, color: 'white', fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}>
            {submitting ? 'Raising…' : 'Raise ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Agent card ────────────────────────────────────────────────────────────────

function AgentCard({ agent, tickets }) {
  const mine = tickets.filter(t => t.assignee === agent.full_name);
  const resolved = mine.filter(t => TERMINAL.has(t.status));
  const rated = resolved.filter(t => t.satisfaction_score != null);
  const avg = rated.length ? (rated.reduce((s, t) => s + t.satisfaction_score, 0) / rated.length) : null;
  const stars = avg ? Math.round(avg) : null;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{ width: 46, height: 46, borderRadius: '50%', background: CA_DIM, border: `2px solid ${CA}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: CA_LIGHT, flexShrink: 0 }}>
        {agent.full_name?.[0]?.toUpperCase() ?? '?'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 2 }}>{agent.full_name}</div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>{fmtRole(agent.role)}</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 18, fontWeight: 700, color: CA_LIGHT }}>{resolved.length}</div><div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.4 }}>Resolved for you</div></div>
          {avg !== null && <div><div style={{ fontSize: 18, fontWeight: 700, color: '#fbbf24' }}>{avg.toFixed(1)}</div><div style={{ fontSize: 9, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.4 }}>Avg rating</div></div>}
        </div>
        {stars && <div style={{ fontSize: 14, color: '#fbbf24', marginTop: 6 }}>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</div>}
      </div>
    </div>
  );
}

function ClientAgentsView({ tickets }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.listAgents().then(d => setAgents(d.filter(a => !['CLIENT_USER','CLIENT_MANAGER'].includes(a.role)))).catch(() => {}).finally(() => setLoading(false));
  }, []);
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>Your Support Team</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>The people at SimBix who handle your tickets.</div>
      {loading && <div style={{ color: C.muted, fontSize: 13 }}>Loading…</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {agents.map(agent => <AgentCard key={agent.id} agent={agent} tickets={tickets} />)}
      </div>
    </div>
  );
}

// ── Full ticket dashboard ─────────────────────────────────────────────────────

function ClientTicketDashboard({ ticket, agents, currentUser, onBack, onRefresh }) {
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [queuePos, setQueuePos] = useState(null);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [tab, setTab] = useState('chat'); // 'chat' | 'audit' | 'attachments'
  const fileRef = useRef(null);
  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);
  const speechOk = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (['P3','P4','P5'].includes(ticket.priority) && ['OPEN','ACKNOWLEDGED'].includes(ticket.status)) {
      api.getQueuePosition(ticket.id).then(setQueuePos).catch(() => {});
    }
  }, [ticket.id, ticket.status]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket.logs?.length]);

  const { text: statusText, color: statusColor } = plainStatus(ticket);
  const etaText = estimateResolution(ticket);
  const assignedAgent = agents.find(a => a.full_name === ticket.assignee);
  const rated = ticket.satisfaction_score != null;
  const publicLogs = (ticket.logs || []).filter(l => !l.is_internal);
  const allLogs = ticket.logs || [];

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = 'en-US';
    r.onresult = e => setComment(prev => prev + (prev ? ' ' : '') + e.results[0][0].transcript);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    r.start();
    recognitionRef.current = r;
    setListening(true);
  }

  async function handleSend() {
    if (!comment.trim()) return;
    setSending(true);
    try {
      const updated = await api.addLog(ticket.id, currentUser.full_name, comment.trim());
      onRefresh(updated);
      setComment('');
    } catch { toast('Failed to send note', 'error'); }
    finally { setSending(false); }
  }

  async function handleAttach(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await api.uploadAttachment(ticket.id, file);
      const updated = await api.getTicket(ticket.id);
      onRefresh(updated);
      toast('Attachment uploaded', 'success');
    } catch { toast('Upload failed', 'error'); }
    e.target.value = '';
  }

  const tabStyle = (t) => ({
    padding: '8px 16px', background: 'none', border: 'none',
    borderBottom: `2px solid ${tab === t ? CA : 'transparent'}`,
    color: tab === t ? CA_LIGHT : C.muted,
    fontSize: 12, fontWeight: tab === t ? 600 : 400, cursor: 'pointer',
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
      {/* Header bar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 20px', height: 50, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, padding: '5px 0' }}>
          ← Back
        </button>
        <div style={{ width: 1, height: 18, background: C.border }} />
        <span style={{ fontSize: 12, color: C.dim, fontFamily: 'monospace' }}>{ticket.ticket_number}</span>
        <PriorityBadge p={ticket.priority} />
        <StatusBadge status={ticket.status} />
        <div style={{ flex: 1 }} />
        {!TERMINAL.has(ticket.status) && (
          <span style={{ fontSize: 11, color: C.dim }}>Updated {fmtTime(ticket.updatedAt)}</span>
        )}
      </div>

      {/* Body: two columns */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left column: context */}
        <div style={{ width: 300, minWidth: 300, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: C.surface }}>
          <div style={{ padding: '18px 18px 0' }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.4 }}>{ticket.title}</h2>

            {/* Plain-English status */}
            <div style={{ background: `${statusColor}18`, border: `1px solid ${statusColor}40`, borderRadius: 8, padding: '10px 12px', marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: statusColor, fontWeight: 500 }}>{statusText}</span>
            </div>

            {/* ETA */}
            {etaText && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: C.muted }}>
                🕐 {etaText}
              </div>
            )}

            {/* Queue position */}
            {queuePos?.position && (
              <div style={{ background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 20, fontWeight: 700, color: C.accentLight }}>{queuePos.position}</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.accentLight }}>Position in queue</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{queuePos.total} ticket{queuePos.total !== 1 ? 's' : ''} ahead</div>
                </div>
              </div>
            )}

            {/* Agent card */}
            {assignedAgent ? (
              <div style={{ background: CA_DIM, border: `1px solid ${CA}40`, borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: CA_LIGHT, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Your assigned agent</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: `${CA}40`, border: `2px solid ${CA}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: CA_LIGHT, flexShrink: 0 }}>
                    {assignedAgent.full_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: CA_LIGHT }}>{assignedAgent.full_name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{fmtRole(assignedAgent.role)}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 12, color: C.muted }}>
                ⏳ Awaiting assignment to an agent
              </div>
            )}

            {/* Details grid */}
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {[
                ['Submitted',    fmtFull(ticket.createdAt)],
                ['Last updated', fmtTime(ticket.updatedAt)],
                ['Priority',     ticket.priority],
                ['Company',      ticket.company_name || '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
                  <span style={{ fontSize: 11, color: C.text, textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>

            {ticket.description && (
              <>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Description</div>
                <p style={{ margin: '0 0 16px', fontSize: 12, color: C.muted, lineHeight: 1.65 }}>{ticket.description}</p>
              </>
            )}
          </div>

          {/* Attachments in left column */}
          {(ticket.attachments || []).length > 0 && (
            <div style={{ padding: '0 18px 18px' }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Attachments · {ticket.attachments.length}</div>
              {ticket.attachments.map(att => (
                <div key={att.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 11, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{att.filename}</span>
                  <button onClick={() => api.downloadAttachment(att.id, att.filename)} style={{ background: 'none', border: 'none', color: CA_LIGHT, cursor: 'pointer', fontSize: 11, padding: '0 0 0 8px', flexShrink: 0 }}>↓</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column: chat + audit */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{ borderBottom: `1px solid ${C.border}`, display: 'flex', background: C.surface, flexShrink: 0 }}>
            <button style={tabStyle('chat')} onClick={() => setTab('chat')}>💬 Chat ({publicLogs.length})</button>
            <button style={tabStyle('audit')} onClick={() => setTab('audit')}>📋 Full Audit ({allLogs.length})</button>
          </div>

          {/* Chat tab */}
          {tab === 'chat' && (
            <>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {publicLogs.length === 0 && (
                  <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, marginTop: 40 }}>No messages yet — add a note below.</div>
                )}
                {publicLogs.map(log => {
                  const isMe = log.actor === currentUser.full_name;
                  return (
                    <div key={log.id} style={{ display: 'flex', gap: 10, marginBottom: 14, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: log.actor === 'System' ? C.card : isMe ? CA_DIM : C.accentDim, border: `1px solid ${log.actor === 'System' ? C.border : isMe ? CA : C.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: log.actor === 'System' ? C.dim : isMe ? CA_LIGHT : C.accentLight, fontWeight: 700 }}>
                        {log.actor === 'System' ? '⚙' : log.actor.charAt(0)}
                      </div>
                      <div style={{ maxWidth: '70%' }}>
                        <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, textAlign: isMe ? 'right' : 'left' }}>
                          {isMe ? 'You' : log.actor} · {fmtTime(log.timestamp)}
                        </div>
                        <div style={{ background: isMe ? CA_DIM : C.card, border: `1px solid ${isMe ? CA + '50' : C.border}`, borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px', padding: '9px 13px', fontSize: 13, color: C.text, lineHeight: 1.5 }}>
                          {log.action}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              {/* Reply bar */}
              <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0, background: C.surface }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <textarea value={comment} onChange={e => setComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Message the support team… (Enter to send)"
                    rows={2}
                    style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', color: C.text, fontSize: 13, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
                  {listening && <div style={{ position: 'absolute', bottom: 6, right: 10, fontSize: 10, color: '#ef4444', pointerEvents: 'none' }}>Listening…</div>}
                </div>
                {speechOk && (
                  <button onClick={listening ? () => { recognitionRef.current?.stop(); setListening(false); } : startVoice}
                    title={listening ? 'Stop' : 'Voice input'}
                    style={{ padding: '9px 10px', background: listening ? '#ef444420' : 'transparent', border: `1px solid ${listening ? '#ef4444' : C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>
                    {listening ? '⏹' : '🎤'}
                  </button>
                )}
                <button onClick={() => fileRef.current?.click()} title="Attach file"
                  style={{ padding: '9px 10px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0 }}>📎</button>
                <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={handleAttach} />
                <button onClick={handleSend} disabled={!comment.trim() || sending}
                  style={{ padding: '9px 18px', background: comment.trim() ? CA : CA_DIM, border: 'none', borderRadius: 8, color: 'white', fontSize: 13, fontWeight: 600, cursor: comment.trim() && !sending ? 'pointer' : 'default', opacity: comment.trim() ? 1 : 0.6, flexShrink: 0 }}>
                  Send
                </button>
              </div>
            </>
          )}

          {/* Audit tab */}
          {tab === 'audit' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>Complete history of all activity on this ticket, including internal notes.</div>
              {allLogs.length === 0 && <div style={{ color: C.dim, fontSize: 13 }}>No activity yet.</div>}
              {[...allLogs].reverse().map(log => (
                <div key={log.id} style={{ display: 'flex', gap: 10, marginBottom: 12, opacity: log.is_internal ? 0.65 : 1 }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: log.actor === 'System' ? C.card : CA_DIM, border: `1px solid ${log.actor === 'System' ? C.border : CA}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: log.actor === 'System' ? C.dim : CA_LIGHT, fontWeight: 700 }}>
                    {log.actor === 'System' ? '⚙' : log.actor.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{log.actor}</span>
                      {log.is_internal && <span style={{ fontSize: 9, background: '#1a1a00', color: '#fbbf24', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>INTERNAL</span>}
                      <span style={{ fontSize: 11, color: C.dim }}>{fmtTime(log.timestamp)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.muted }}>{log.action}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ticket list ───────────────────────────────────────────────────────────────

function TicketRow({ ticket, selected, onClick }) {
  const { text: statusText, color: statusColor } = plainStatus(ticket);
  const eta = estimateResolution(ticket);
  return (
    <div onClick={onClick} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${selected ? CA : 'transparent'}`, background: selected ? C.card : 'transparent', cursor: 'pointer' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace' }}>{ticket.ticket_number}</span>
        <PriorityBadge p={ticket.priority} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.dim }}>{fmtTime(ticket.createdAt)}</span>
      </div>
      <div style={{ fontSize: 13, color: C.text, fontWeight: 500, marginBottom: 4 }}>{ticket.title}</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: C.muted }}>{statusText}</span>
      </div>
      {eta && <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>🕐 {eta}</div>}
    </div>
  );
}

function ClientTicketList({ tickets, showHistory, onNewTicket, onTicketOpen }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const base = tickets.filter(t => showHistory ? TERMINAL.has(t.status) : !TERMINAL.has(t.status));
    if (!search) return base;
    const q = search.toLowerCase();
    return base.filter(t => t.ticket_number.toLowerCase().includes(q) || t.title.toLowerCase().includes(q));
  }, [tickets, search, showHistory]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{showHistory ? 'Ticket History' : 'Active Tickets'}</span>
        <span style={{ background: CA_DIM, color: CA_LIGHT, fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '1px 8px', border: `1px solid ${CA}40` }}>{filtered.length}</span>
        <span style={{ flex: 1 }} />
        {!showHistory && <button onClick={onNewTicket} style={{ padding: '6px 14px', background: CA, border: 'none', borderRadius: 6, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>+ New ticket</button>}
      </div>
      <div style={{ padding: '8px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
          style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>{showHistory ? 'No closed tickets yet.' : 'No active tickets — all clear!'}</div>}
        {filtered.map(t => <TicketRow key={t.id} ticket={t} selected={false} onClick={() => onTicketOpen(t.id)} />)}
      </div>
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

function ClientSettings({ user, prefs, onPrefsChange, onThemeChange }) {
  const toast = useToast();
  const [fullName, setFullName] = useState(user.full_name || '');
  const [phone, setPhone] = useState(user.phone_number || '');
  const [savingName, setSavingName] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [notifPerm, setNotifPerm] = useState(() => notifyPermission());
  const [mfaEnabled, setMfaEnabled] = useState(user.mfa_enabled ?? false);
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  function setPref(key, value) {
    const updated = { ...prefs, [key]: value };
    savePrefs(user.id, updated);
    onPrefsChange(updated);
  }

  const inp = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 13, outline: 'none', width: 200 };

  async function handleSaveName() {
    if (fullName.trim() === user.full_name && phone.trim() === (user.phone_number || '')) return;
    setSavingName(true);
    try { await api.updateProfile(fullName.trim(), phone.trim()); toast('Profile updated', 'success'); }
    catch (err) { toast(err.message, 'error'); }
    finally { setSavingName(false); }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, maxWidth: 680 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 20, letterSpacing: -0.3 }}>Settings</div>

      <SettingSection title="Account" description="Your profile and login details">
        <SettingRow label="Display name" description="Shown on your tickets and notes">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={fullName} onChange={e => setFullName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveName()} style={inp} />
            <button onClick={handleSaveName} disabled={savingName || (fullName.trim() === user.full_name && phone.trim() === (user.phone_number || ''))}
              style={{ padding: '6px 14px', background: fullName.trim() !== user.full_name ? CA : C.card, border: `1px solid ${fullName.trim() !== user.full_name ? CA : C.border}`, borderRadius: 6, color: fullName.trim() !== user.full_name ? 'white' : C.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {savingName ? 'Saving…' : 'Save'}
            </button>
          </div>
        </SettingRow>
        <SettingRow label="Phone number" description="Optional — used for urgent callbacks">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveName()} placeholder="+447700900123" style={inp} />
            <button onClick={handleSaveName} disabled={savingName || phone.trim() === (user.phone_number || '')}
              style={{ padding: '6px 14px', background: phone.trim() !== (user.phone_number || '') ? CA : C.card, border: `1px solid ${phone.trim() !== (user.phone_number || '') ? CA : C.border}`, borderRadius: 6, color: phone.trim() !== (user.phone_number || '') ? 'white' : C.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {savingName ? 'Saving…' : 'Save'}
            </button>
          </div>
        </SettingRow>
        <SettingRow label="Email" description="Your login address">
          <span style={{ fontSize: 13, color: C.muted }}>{user.email}</span>
        </SettingRow>
        <SettingRow label="Company">
          <span style={{ fontSize: 13, color: C.muted }}>{user.company_name || '—'}</span>
        </SettingRow>
        <SettingRow label="Password">
          <button onClick={() => setShowChangePw(true)} style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 12, cursor: 'pointer' }}>Change password</button>
        </SettingRow>
      </SettingSection>

      <SettingSection title="Notifications" description="Control how you're alerted about ticket updates">
        <SettingRow label="Desktop notifications"
          description={notifPerm === 'granted' ? "OS notifications enabled — you'll be alerted when Beacon is minimised" : notifPerm === 'denied' ? 'Blocked in browser — allow Beacon in your browser settings' : 'Get OS pop-ups when your ticket is updated'}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {notifPerm === 'granted' && <Toggle value={prefs.desktopNotifications !== false} onChange={v => setPref('desktopNotifications', v)} />}
            {notifPerm === 'default' && canNotify() && (
              <button onClick={async () => { const ok = await requestPermission(); setNotifPerm(ok ? 'granted' : 'denied'); if (ok) { setPref('desktopNotifications', true); toast('Notifications enabled', 'success'); } }}
                style={{ padding: '6px 14px', background: CA, border: 'none', borderRadius: 6, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Enable notifications
              </button>
            )}
            {notifPerm === 'denied' && <span style={{ fontSize: 11, color: '#f87171', fontWeight: 600 }}>Blocked</span>}
            {notifPerm === 'unsupported' && <span style={{ fontSize: 11, color: C.muted }}>Not supported</span>}
          </div>
        </SettingRow>
        <SettingRow label="Service announcements" description="Show a toast when SimBix posts an update or alert">
          <Toggle value={prefs.announcementAlerts !== false} onChange={v => setPref('announcementAlerts', v)} />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Display" description="Appearance preferences">
        <SettingRow label="Theme" description="Choose a colour scheme">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(THEMES).map(([key, theme]) => {
              const active = (localStorage.getItem('tb_theme') || 'neon') === key;
              return (
                <button key={key} onClick={() => onThemeChange?.(key)} title={theme.description}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', background: active ? CA_DIM : C.card, border: `1px solid ${active ? CA : C.border}`, color: active ? CA_LIGHT : C.muted, fontSize: 11, fontWeight: active ? 600 : 400 }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: theme.bg, border: `1px solid ${theme.border}` }} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: theme.accent }} />
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: theme.text, opacity: 0.6 }} />
                  </div>
                  {theme.name}
                </button>
              );
            })}
          </div>
        </SettingRow>
        <SettingRow label="Default view" description="Which screen opens after login">
          <SettingSelect value={prefs.defaultView || 'home'} onChange={v => setPref('defaultView', v)}
            options={[{ value: 'home', label: 'Dashboard' }, { value: 'tickets', label: 'Active Tickets' }, { value: 'kb', label: 'Knowledge Base' }]} />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Session">
        <SettingRow label="Auto-refresh" description="How often the ticket list silently re-fetches">
          <SettingSelect value={String(prefs.refreshInterval)} onChange={v => setPref('refreshInterval', Number(v))}
            options={[{ value: '15', label: 'Every 15 seconds' }, { value: '30', label: 'Every 30 seconds' }, { value: '60', label: 'Every minute' }, { value: '300', label: 'Every 5 minutes' }, { value: '0', label: 'Off' }]} />
        </SettingRow>
        <SettingRow label="Session timeout" description="Sign out automatically after inactivity">
          <SettingSelect value={String(prefs.sessionTimeout ?? 30)} onChange={v => setPref('sessionTimeout', Number(v))}
            options={[{ value: '15', label: '15 minutes' }, { value: '30', label: '30 minutes' }, { value: '60', label: '1 hour' }, { value: '120', label: '2 hours' }, { value: '0', label: 'Never' }]} />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Calendar" description="Sync your Outlook calendar with Beacon">
        <SettingRow label="Outlook iCal URL" description="Outlook → Settings → Calendar → Shared calendars → Publish a calendar. Paste the ICS link here.">
          <input defaultValue={localStorage.getItem('tb_ical_url') || ''}
            onBlur={e => { localStorage.setItem('tb_ical_url', e.target.value.trim()); toast('iCal URL saved', 'success'); }}
            placeholder="https://outlook.live.com/owa/calendar/…"
            style={{ ...inp, width: 280, fontSize: 11, fontFamily: 'monospace' }} />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Two-Factor Authentication" description="Add a second layer of security using an authenticator app">
        {mfaEnabled ? (
          <>
            <SettingRow label="2FA status" description="Your account is protected by TOTP."><span style={{ fontSize: 12, color: '#4ade80', fontWeight: 600 }}>● Enabled</span></SettingRow>
            {!showDisable ? (
              <SettingRow label="Disable 2FA" description="You'll need your current authenticator code.">
                <button onClick={() => setShowDisable(true)} style={{ padding: '6px 14px', background: 'transparent', border: `1px solid #ef4444`, borderRadius: 6, color: '#f87171', fontSize: 12, cursor: 'pointer' }}>Disable 2FA</button>
              </SettingRow>
            ) : (
              <SettingRow label="Confirm disable" description="Enter the 6-digit code from your authenticator app.">
                <div style={{ display: 'flex', gap: 8 }}>
                  <input maxLength={6} inputMode="numeric" value={mfaDisableCode} onChange={e => setMfaDisableCode(e.target.value.replace(/\D/g, ''))} placeholder="000000"
                    style={{ width: 90, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 14, textAlign: 'center', letterSpacing: 4, outline: 'none' }} />
                  <button disabled={mfaLoading || mfaDisableCode.length !== 6} onClick={async () => { setMfaLoading(true); try { await api.disable2fa(mfaDisableCode); setMfaEnabled(false); setShowDisable(false); toast('2FA disabled', 'success'); } catch (e) { toast(e.message, 'error'); } finally { setMfaLoading(false); setMfaDisableCode(''); } }}
                    style={{ padding: '6px 14px', background: mfaDisableCode.length === 6 ? '#ef4444' : C.card, border: 'none', borderRadius: 6, color: 'white', fontSize: 12, cursor: 'pointer' }}>
                    {mfaLoading ? '…' : 'Confirm'}
                  </button>
                </div>
              </SettingRow>
            )}
          </>
        ) : (
          <>
            <SettingRow label="2FA status" description="Two-factor authentication is currently disabled."><span style={{ fontSize: 12, color: C.muted }}>● Disabled</span></SettingRow>
            {!mfaSetup ? (
              <SettingRow label="Enable 2FA" description="Scan a QR code with Google Authenticator, Authy, etc.">
                <button onClick={async () => { setMfaLoading(true); try { const d = await api.setup2fa(); setMfaSetup(d); } catch (e) { toast(e.message, 'error'); } finally { setMfaLoading(false); } }}
                  style={{ padding: '6px 14px', background: CA, border: 'none', borderRadius: 6, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {mfaLoading ? 'Generating…' : 'Set up 2FA'}
                </button>
              </SettingRow>
            ) : (
              <>
                <SettingRow label="Scan this QR code" description="Open your authenticator app and scan the code below.">
                  <img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(mfaSetup.uri)}`} alt="TOTP QR" width={120} height={120} style={{ borderRadius: 8, border: `1px solid ${C.border}` }} />
                </SettingRow>
                <SettingRow label="Verify and enable" description="Enter the 6-digit code from your app.">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input maxLength={6} inputMode="numeric" autoFocus value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))} placeholder="000000"
                      style={{ width: 90, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 14, textAlign: 'center', letterSpacing: 4, outline: 'none' }} />
                    <button disabled={mfaLoading || mfaCode.length !== 6} onClick={async () => { setMfaLoading(true); try { await api.enable2fa(mfaCode); setMfaEnabled(true); setMfaSetup(null); setMfaCode(''); toast('2FA enabled', 'success'); } catch (e) { toast(e.message, 'error'); } finally { setMfaLoading(false); } }}
                      style={{ padding: '6px 14px', background: mfaCode.length === 6 ? CA : C.card, border: 'none', borderRadius: 6, color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {mfaLoading ? '…' : 'Enable'}
                    </button>
                  </div>
                </SettingRow>
              </>
            )}
          </>
        )}
      </SettingSection>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}

// ── Dashboard home ────────────────────────────────────────────────────────────

function ClientHome({ tickets, announcements, onNewTicket, onCreate, currentUser, onTicketOpen }) {
  const toast = useToast();
  const [quickConfirm, setQuickConfirm] = useState(null);
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  const open       = tickets.filter(t => !TERMINAL.has(t.status)).length;
  const resolved   = tickets.filter(t => TERMINAL.has(t.status)).length;
  const inProgress = tickets.filter(t => t.status === 'IN PROGRESS').length;
  const needsReply = tickets.filter(t => t.status === 'PENDING CLIENT').length;

  const recentActive = useMemo(() =>
    tickets.filter(t => !TERMINAL.has(t.status)).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 4),
    [tickets]
  );

  async function handleQuickSubmit(template) {
    setQuickSubmitting(true);
    try {
      const ticket = await api.createTicket({ title: template.title, description: template.description, priority: URGENCY_MAP[template.urgency]?.priority || 'P3', tags: [template.category], system_info: collectSystemInfo() });
      onCreate(ticket);
      toast(`${ticket.ticket_number} raised`, 'success');
      setQuickConfirm(null);
    } catch (e) { toast(e.message, 'error'); }
    finally { setQuickSubmitting(false); }
  }

  const firstName = currentUser.full_name.split(' ')[0];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: C.bg }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Hi {firstName} 👋</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Here's your support overview from SimBix.</div>
      </div>

      <ServiceStatus announcements={announcements} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
            {[
              { label: 'Open tickets',     value: open,       color: CA_LIGHT },
              { label: 'Resolved',         value: resolved,   color: '#4ade80' },
              { label: 'In progress',      value: inProgress, color: '#60a5fa' },
              { label: 'Needs your reply', value: needsReply, color: needsReply > 0 ? '#f97316' : C.muted },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '13px 15px' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Quick requests</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 22 }}>
            <button onClick={onNewTicket} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: CA_DIM, border: `1px solid ${CA}50`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', alignItems: 'center' }}>
              <span style={{ fontSize: 16 }}>✦</span><span style={{ fontSize: 13, fontWeight: 600, color: CA_LIGHT }}>New request…</span>
            </button>
            {TEMPLATES.slice(0, 4).map(t => (
              <button key={t.id} onClick={() => setQuickConfirm(t)} style={{ display: 'flex', gap: 12, padding: '10px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', alignItems: 'center' }}>
                <span style={{ fontSize: 16 }}>{t.icon}</span><span style={{ fontSize: 12, color: C.text }}>{t.name}</span>
              </button>
            ))}
          </div>

          {recentActive.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Your open tickets</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {recentActive.map(t => {
                  const { color } = plainStatus(t);
                  return (
                    <button key={t.id} onClick={() => onTicketOpen(t.id)} style={{ display: 'flex', gap: 10, padding: '10px 14px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', alignItems: 'center' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                        <div style={{ fontSize: 10, color: C.dim }}>{t.ticket_number} · {t.assignee || 'Unassigned'}</div>
                      </div>
                      <span style={{ fontSize: 11, color: C.dim, flexShrink: 0 }}>›</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Recent activity</div>
          <ActivityFeed tickets={tickets} />
        </div>
      </div>

      {quickConfirm && (
        <QuickConfirmModal template={quickConfirm} onConfirm={() => handleQuickSubmit(quickConfirm)} onClose={() => setQuickConfirm(null)} submitting={quickSubmitting} />
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ClientDashboard({ user, onLogout }) {
  const toast = useToast();
  const [tickets, setTickets] = useState([]);
  const [agents, setAgents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => loadPrefs(user.id).defaultView || 'home');
  const [prefs, setPrefs] = useState(() => loadPrefs(user.id));
  const [openTicketId, setOpenTicketId] = useState(null);
  const [prevView, setPrevView] = useState(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [satisfactionTicket, setSatisfactionTicket] = useState(null);

  const satKey = `tb_sat_dismissed_${user.id}`;
  const dismissed = useRef(new Set(JSON.parse(localStorage.getItem(satKey) || '[]')));

  function dismissSat(id) { dismissed.current.add(id); localStorage.setItem(satKey, JSON.stringify([...dismissed.current])); }

  const fetchTickets = useCallback(async () => {
    try {
      const data = await api.listTickets({});
      setTickets(data);
      const needsRating = data.find(t => t.status === 'RESOLVED' && t.satisfaction_score === null && !dismissed.current.has(t.id));
      if (needsRating) setSatisfactionTicket(needsRating);
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchTickets();
    api.listAgents().then(d => setAgents(d.filter(a => !['CLIENT_USER','CLIENT_MANAGER'].includes(a.role)))).catch(() => {});
    api.listAnnouncements().then(setAnnouncements).catch(() => {});
    const iv = setInterval(fetchTickets, (prefs.refreshInterval || 30) * 1000);
    return () => clearInterval(iv);
  }, [fetchTickets]);

  function handleRefresh(updated) {
    setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
  }

  function handleCreate(ticket) {
    setTickets(prev => [ticket, ...prev]);
    setShowSubmit(false);
    openTicket(ticket.id, 'tickets');
  }

  function openTicket(id, fromView) {
    setPrevView(fromView || view);
    setOpenTicketId(id);
  }

  function closeTicket() {
    setOpenTicketId(null);
    setPrevView(null);
  }

  async function handleSatSubmit(score, note) {
    try {
      const updated = await api.submitSatisfaction(satisfactionTicket.id, score, note);
      setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
      dismissSat(satisfactionTicket.id);
      setSatisfactionTicket(null);
      toast('Thank you for your feedback!', 'success');
    } catch { toast('Failed to submit feedback', 'error'); }
  }

  const openCount = tickets.filter(t => !TERMINAL.has(t.status)).length;
  const openTicket_ = tickets.find(t => t.id === openTicketId) ?? null;

  return (
    <div style={{ display: 'flex', height: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif', overflow: 'hidden' }}>
      <ClientSidebar
        view={openTicketId ? prevView : view}
        onViewChange={v => { setOpenTicketId(null); setView(v); }}
        user={user}
        onLogout={onLogout}
        openCount={openCount}
        onNewTicket={() => setShowSubmit(true)}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Full-page ticket dashboard takes over when a ticket is open */}
        {openTicketId && openTicket_ ? (
          <ClientTicketDashboard
            ticket={openTicket_}
            agents={agents}
            currentUser={user}
            onBack={closeTicket}
            onRefresh={handleRefresh}
          />
        ) : loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: C.muted, fontSize: 14 }}>Loading…</span>
          </div>
        ) : view === 'home' ? (
          <ClientHome tickets={tickets} announcements={announcements} onNewTicket={() => setShowSubmit(true)} onCreate={handleCreate} currentUser={user} onTicketOpen={id => openTicket(id, 'home')} />
        ) : view === 'tickets' ? (
          <ClientTicketList tickets={tickets} showHistory={false} onNewTicket={() => setShowSubmit(true)} onTicketOpen={id => openTicket(id, 'tickets')} />
        ) : view === 'history' ? (
          <ClientTicketList tickets={tickets} showHistory onNewTicket={() => setShowSubmit(true)} onTicketOpen={id => openTicket(id, 'history')} />
        ) : view === 'agents' ? (
          <ClientAgentsView tickets={tickets} />
        ) : view === 'kb' ? (
          <ClientKB />
        ) : view === 'emergency' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Emergency Contacts</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Cached on your device — available offline</div>
            </div>
            <EmergencyContacts />
          </div>
        ) : view === 'settings' ? (
          <ClientSettings
            user={user}
            prefs={prefs}
            onPrefsChange={setPrefs}
            onThemeChange={name => { applyTheme(name); setPrefs(p => ({ ...p, theme: name })); }}
          />
        ) : null}
      </div>

      {showSubmit && <SmartSubmitModal onClose={() => setShowSubmit(false)} onCreate={handleCreate} />}

      {satisfactionTicket && (
        <SatisfactionModal
          ticketNumber={satisfactionTicket.ticket_number}
          onSubmit={handleSatSubmit}
          onSkip={() => { dismissSat(satisfactionTicket.id); setSatisfactionTicket(null); }}
        />
      )}
    </div>
  );
}
