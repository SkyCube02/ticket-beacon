import { useState, useEffect, useCallback, useRef } from 'react';
import { C, P, ST } from '../constants/theme.js';
import { fmtTime, fmtFull } from '../utils/formatters.js';
import { api } from '../utils/api.js';
import { useToast } from '../utils/toast.jsx';
import { collectSystemInfo } from '../utils/systemInfo.js';
import EmergencyContacts from './EmergencyContacts.jsx';
import SatisfactionModal from './SatisfactionModal.jsx';

// ── Client KB browser ─────────────────────────────────────────────────────────

function SuggestEditModal({ article, onClose }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await api.suggestKBEdit(article.id, text.trim());
      toast('Suggestion submitted — thank you!', 'success');
      onClose();
    } catch (err) {
      toast(err.message, 'error');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 460, padding: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Suggest an edit</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>"{article.title}" — describe what you'd like changed or corrected.</div>
        <textarea
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          rows={5}
          placeholder="What's incorrect or missing? What should it say instead?"
          style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 18 }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={!text.trim() || submitting} style={{ padding: '8px 18px', background: text.trim() ? C.accent : C.accentDim, border: 'none', borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: text.trim() && !submitting ? 'pointer' : 'default', opacity: text.trim() ? 1 : 0.5 }}>
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
  const toast = useToast();

  useEffect(() => {
    api.listArticles({ search }).then(setArticles).catch(() => {}).finally(() => setLoading(false));
  }, [search]);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: selected ? '0 0 44%' : 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: selected ? `1px solid ${C.border}` : 'none' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search knowledge base…" style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 12px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading…</div>}
          {!loading && articles.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>No articles found</div>}
          {articles.map(a => (
            <div key={a.id} onClick={() => setSelected(a.id === selected?.id ? null : a)} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, borderLeft: `3px solid ${selected?.id === a.id ? C.accent : 'transparent'}`, background: selected?.id === a.id ? C.card : 'transparent', cursor: 'pointer' }}>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 500, marginBottom: 3 }}>{a.title}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{a.category}</div>
            </div>
          ))}
        </div>
      </div>
      {selected && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface }}>
          <div style={{ padding: '13px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, color: C.muted, lineHeight: 1.7, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              {selected.content}
            </pre>
          </div>
        </div>
      )}
      {suggestFor && <SuggestEditModal article={suggestFor} onClose={() => setSuggestFor(null)} />}
    </div>
  );
}

const CLIENT_ROLES = ['CLIENT_USER', 'CLIENT_MANAGER'];

// ── Badges ────────────────────────────────────────────────────────────────────

function PriorityBadge({ p }) {
  const s = P[p] || P.P3;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {p}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = ST[status] || { bg: C.card, text: C.muted };
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: s.bg, color: s.text }}>
      {status}
    </span>
  );
}

// ── Submit ticket modal ───────────────────────────────────────────────────────

function SubmitModal({ onClose, onCreate, currentUser }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dept, setDept] = useState('');
  const [onBehalf, setOnBehalf] = useState(false);
  const [affectedName, setAffectedName] = useState('');
  const [affectedEmail, setAffectedEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const inputStyle = {
    width: '100%', background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: '8px 10px', color: C.text,
    fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const ticket = await api.createTicket({
        title: title.trim(),
        description: description.trim(),
        requester_name: onBehalf && affectedName.trim() ? affectedName.trim() : '',
        requester_email: onBehalf && affectedEmail.trim() ? affectedEmail.trim() : '',
        requester_dept: dept.trim(),
        priority: 'P3',
        tags: [],
        system_info: collectSystemInfo(),
      });
      onCreate(ticket);
      toast(`${ticket.ticket_number} submitted`, 'success');
    } catch (err) {
      toast(err.message, 'error');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 500, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '15px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Submit a Support Ticket</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>What's the issue? *</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief summary of the problem" style={{ ...inputStyle }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>More detail</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Steps to reproduce, who's affected, any error messages…" rows={5} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Your department</label>
            <input value={dept} onChange={e => setDept(e.target.value)} placeholder="e.g. Finance, Engineering" style={inputStyle} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: onBehalf ? 10 : 0 }}>
              <input type="checkbox" checked={onBehalf} onChange={e => setOnBehalf(e.target.checked)} />
              <span style={{ fontSize: 12, color: C.muted }}>Submitting on behalf of another person</span>
            </label>
            {onBehalf && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, padding: 10, background: C.card, borderRadius: 6, border: `1px solid ${C.border}` }}>
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Affected person's name</label>
                  <input value={affectedName} onChange={e => setAffectedName(e.target.value)} placeholder="Full name" style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Their email</label>
                  <input type="email" value={affectedEmail} onChange={e => setAffectedEmail(e.target.value)} placeholder="their@email.com" style={inputStyle} />
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 20px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ padding: '8px 20px', background: submitting ? C.accentDim : C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}>
              {submitting ? 'Submitting…' : 'Submit ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Ticket detail panel ───────────────────────────────────────────────────────

function TicketDetail({ ticket, onClose, onLog, currentUser }) {
  const [comment, setComment] = useState('');
  const [queuePos, setQueuePos] = useState(null);
  const toast = useToast();

  useEffect(() => {
    if (['P3','P4','P5'].includes(ticket.priority) && ['OPEN','ACKNOWLEDGED'].includes(ticket.status)) {
      api.getQueuePosition(ticket.id).then(setQueuePos).catch(() => {});
    }
  }, [ticket.id, ticket.status]);

  async function handleAddNote() {
    if (!comment.trim()) return;
    try {
      await onLog(ticket.id, currentUser.full_name, comment.trim());
      setComment('');
    } catch {
      toast('Failed to add note', 'error');
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface, borderLeft: `1px solid ${C.border}` }}>
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace' }}>{ticket.ticket_number}</span>
          <PriorityBadge p={ticket.priority} />
          <StatusBadge status={ticket.status} />
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>{ticket.title}</h2>
        {ticket.description && (
          <p style={{ margin: '0 0 18px', fontSize: 13, color: C.muted, lineHeight: 1.65 }}>{ticket.description}</p>
        )}

        {queuePos?.position && (
          <div style={{
            background: C.accentDim, border: `1px solid ${C.accent}`,
            borderRadius: 8, padding: '10px 14px', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: C.accentLight }}>{queuePos.position}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.accentLight }}>
                Position in support queue
              </div>
              <div style={{ fontSize: 11, color: C.muted }}>
                {queuePos.total} ticket{queuePos.total !== 1 ? 's' : ''} ahead — we'll be with you shortly
              </div>
            </div>
          </div>
        )}

        <div style={{ background: C.card, borderRadius: 8, padding: 14, border: `1px solid ${C.border}`, marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              ['Submitted', fmtFull(ticket.createdAt)],
              ['Last updated', fmtTime(ticket.updatedAt)],
              ['Assigned to', ticket.assignee || 'Being assigned…'],
              ['Company', ticket.company_name || '—'],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 12, color: C.text }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
          Activity · {ticket.logs.length}
        </div>
        {[...ticket.logs].reverse().map(log => (
          <div key={log.id} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
              background: log.actor === 'System' ? C.card : C.accentDim,
              border: `1px solid ${log.actor === 'System' ? C.border : C.accent}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: log.actor === 'System' ? C.dim : C.accentLight, fontWeight: 700,
            }}>
              {log.actor === 'System' ? '⚙' : log.actor.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{log.actor} </span>
              <span style={{ fontSize: 12, color: C.muted }}>{log.action}</span>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{fmtTime(log.timestamp)}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
        <input
          value={comment}
          onChange={e => setComment(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddNote()}
          placeholder="Add a note for the support team…"
          style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 12px', color: C.text, fontSize: 13, outline: 'none' }}
        />
        <button onClick={handleAddNote} style={{ padding: '7px 14px', background: C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Send
        </button>
      </div>
    </div>
  );
}

// ── Main client dashboard ─────────────────────────────────────────────────────

export default function ClientDashboard({ user, onLogout }) {
  const toast = useToast();
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);
  const [search, setSearch] = useState('');
  const [clientView, setClientView] = useState('tickets'); // 'tickets' | 'kb' | 'emergency'
  const [satisfactionTicket, setSatisfactionTicket] = useState(null);

  const satDismissedKey = `tb_sat_dismissed_${user.id}`;
  const dismissed = useRef(new Set(JSON.parse(localStorage.getItem(satDismissedKey) || '[]')));

  function dismissSat(ticketId) {
    dismissed.current.add(ticketId);
    localStorage.setItem(satDismissedKey, JSON.stringify([...dismissed.current]));
  }

  const fetchTickets = useCallback(async () => {
    try {
      const data = await api.listTickets({});
      setTickets(data);
      const needsRating = data.find(
        t => t.status === 'RESOLVED' && t.satisfaction_score === null && !dismissed.current.has(t.id)
      );
      if (needsRating) setSatisfactionTicket(needsRating);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
    const interval = setInterval(fetchTickets, 30000);
    return () => clearInterval(interval);
  }, [fetchTickets]);

  const filtered = tickets.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.ticket_number.toLowerCase().includes(q) || t.title.toLowerCase().includes(q);
  });

  const selectedTicket = tickets.find(t => t.id === selectedId) ?? null;

  const open = tickets.filter(t => !['CLOSED', 'CANCELLED', 'RESOLVED'].includes(t.status)).length;
  const resolved = tickets.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status)).length;

  async function handleLog(ticketId, actorLabel, action) {
    const updated = await api.addLog(ticketId, actorLabel, action);
    setTickets(prev => prev.map(t => t.id === ticketId ? updated : t));
  }

  async function handleSatSubmit(score, note) {
    try {
      const updated = await api.submitSatisfaction(satisfactionTicket.id, score, note);
      setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
      dismissSat(satisfactionTicket.id);
      setSatisfactionTicket(null);
      toast('Thank you for your feedback!', 'success');
    } catch {
      toast('Failed to submit feedback', 'error');
    }
  }

  function handleSatSkip() {
    dismissSat(satisfactionTicket.id);
    setSatisfactionTicket(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Top bar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '0 24px', display: 'flex', alignItems: 'center', gap: 16, height: 54, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, flex: 1 }}>
          <span style={{ color: '#7c3aed' }}>●</span> Ticket Beacon
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 400, marginLeft: 10 }}>Client Portal</span>
        </div>
        <div style={{ fontSize: 12, color: C.muted }}>
          {user.full_name}
          {user.company_name && <span style={{ color: C.dim }}> · {user.company_name}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['tickets','My Tickets'],['kb','Knowledge Base'],['emergency','Emergency']].map(([v, label]) => (
            <button key={v} onClick={() => setClientView(v)} style={{
              padding: '5px 12px', fontSize: 11, fontWeight: 600,
              background: clientView === v ? (v === 'emergency' ? '#2d0a0a' : C.accentDim) : 'transparent',
              border: `1px solid ${clientView === v ? (v === 'emergency' ? '#7f1d1d' : C.accent) : C.border}`,
              borderRadius: 5, cursor: 'pointer',
              color: clientView === v ? (v === 'emergency' ? '#f87171' : C.accentLight) : C.muted,
            }}>{label}</button>
          ))}
          <button onClick={onLogout} style={{ padding: '5px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 11, cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </div>

      {clientView === 'emergency' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Emergency Contacts</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Available offline — cached on your device</div>
          </div>
          <EmergencyContacts />
        </div>
      ) : clientView === 'kb' ? (
        <ClientKB />
      ) : (
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: ticket list */}
        <div style={{ flex: selectedTicket ? '0 0 48%' : 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Stats + submit */}
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 16px', textAlign: 'center', minWidth: 70 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.accentLight }}>{open}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>OPEN</div>
            </div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 16px', textAlign: 'center', minWidth: 70 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.green }}>{resolved}</div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>RESOLVED</div>
            </div>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setShowSubmit(true)}
              style={{ padding: '8px 18px', background: '#7c3aed', color: C.white, border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              + Submit a ticket
            </button>
          </div>

          {/* Search */}
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search your tickets…"
              style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 12px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Ticket rows */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading…</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>
                {tickets.length === 0 ? "You haven't submitted any tickets yet." : "No tickets match your search."}
              </div>
            )}
            {filtered.map(t => (
              <div
                key={t.id}
                onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                style={{
                  padding: '12px 16px',
                  borderBottom: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${t.id === selectedId ? '#7c3aed' : 'transparent'}`,
                  background: t.id === selectedId ? C.card : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace' }}>{t.ticket_number}</span>
                  <PriorityBadge p={t.priority} />
                  <StatusBadge status={t.status} />
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: C.dim }}>{fmtTime(t.createdAt)}</span>
                </div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 500, marginBottom: 3 }}>{t.title}</div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  {t.assignee ? `Assigned to ${t.assignee}` : 'Awaiting assignment'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: ticket detail */}
        {selectedTicket && (
          <TicketDetail
            ticket={selectedTicket}
            currentUser={user}
            onClose={() => setSelectedId(null)}
            onLog={handleLog}
          />
        )}
      </div>
      )}

      {showSubmit && (
        <SubmitModal
          onClose={() => setShowSubmit(false)}
          onCreate={ticket => {
            setTickets(prev => [ticket, ...prev]);
            setSelectedId(ticket.id);
            setShowSubmit(false);
          }}
        />
      )}

      {satisfactionTicket && (
        <SatisfactionModal
          ticketNumber={satisfactionTicket.ticket_number}
          onSubmit={handleSatSubmit}
          onSkip={handleSatSkip}
        />
      )}
    </div>
  );
}
