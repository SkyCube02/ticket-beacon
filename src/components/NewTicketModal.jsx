import { useState, useEffect, useRef, useCallback } from 'react';
import { C, P } from '../constants/theme.js';
import { api } from '../utils/api.js';

const PRIORITIES = ['P1', 'P2', 'P3', 'P4', 'P5'];
const PRIORITY_COLOR = { P1: '#ef4444', P2: '#f97316', P3: '#eab308', P4: '#60a5fa', P5: C.muted };

const inputStyle = {
  width: '100%',
  background: C.card,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  padding: '8px 10px',
  color: C.text,
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: 10, color: C.muted, fontWeight: 700,
        marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.6,
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function NewTicketModal({ agents, companies = [], currentUser, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P3');
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [requesterDept, setRequesterDept] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [companyId, setCompanyId] = useState(companies[0]?.id || '');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const [suggestion, setSuggestion] = useState(null); // { suggested, confidence, reasons }
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [kbSuggestions, setKbSuggestions] = useState([]);
  const [expandedKb, setExpandedKb] = useState(null);
  const kbTimer = useRef(null);
  const algoTimer = useRef(null);

  useEffect(() => {
    const query = title.trim();
    if (query.length < 4) { setKbSuggestions([]); return; }
    clearTimeout(kbTimer.current);
    kbTimer.current = setTimeout(() => {
      api.listArticles({ search: query }).then(articles => setKbSuggestions(articles.slice(0, 3))).catch(() => {});
    }, 400);
    return () => clearTimeout(kbTimer.current);
  }, [title]);

  useEffect(() => {
    if (title.trim().length < 4) { setSuggestion(null); return; }
    clearTimeout(algoTimer.current);
    algoTimer.current = setTimeout(() => {
      api.suggestPriority(title.trim(), description.trim(), companyId || null)
        .then(s => setSuggestion(s))
        .catch(() => {});
    }, 600);
    return () => clearTimeout(algoTimer.current);
  }, [title, description, companyId]);

  async function handleAiTriage() {
    if (!title.trim() && !description.trim()) return;
    setAiLoading(true);
    setAiNote('');
    try {
      const agentNames = agents.map(a => a.full_name).join(', ');
      const result = await api.claude(
        `You are a helpdesk triage assistant. Given a ticket title and description, suggest priority and best agent. Priorities: P1=Critical outage, P2=High/time-sensitive, P3=Medium, P4=Low, P5=Trivial. Agents: ${agentNames}. Return JSON: { priority: string, assignee: string, reason: string }`,
        `Title: ${title}\nDescription: ${description}`
      );
      if (result.priority && PRIORITIES.includes(result.priority)) setPriority(result.priority);
      if (result.assignee) {
        const match = agents.find(a => a.full_name === result.assignee);
        if (match) setAssigneeId(match.id);
      }
      if (result.reason) setAiNote(result.reason);
    } catch {
      setAiNote('Could not reach AI service.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    if (['P1', 'P2'].includes(priority) && !justification.trim()) {
      setError(`${priority} tickets require a justification explaining the business impact.`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        priority,
        priority_justification: justification.trim() || null,
        requester_name: requesterName.trim() || currentUser.full_name,
        requester_email: requesterEmail.trim() || currentUser.email || '',
        requester_dept: requesterDept.trim(),
        company_id: companyId || null,
        assignee_id: assigneeId || null,
        tags: [],
      });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100,
    }}>
      <div style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        width: 520,
        maxHeight: '92vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{
          padding: '15px 20px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>New Ticket</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20, overflowY: 'auto' }}>
          <Field label="Title *">
            <input
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Brief description of the issue"
              style={inputStyle}
            />
          </Field>

          {kbSuggestions.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                KB — possible self-service resolutions
              </div>
              {kbSuggestions.map(a => (
                <div key={a.id} style={{ marginBottom: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
                  <button
                    type="button"
                    onClick={() => setExpandedKb(expandedKb === a.id ? null : a.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{a.title}</span>
                    <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>{expandedKb === a.id ? '▲' : '▼'}</span>
                  </button>
                  {expandedKb === a.id && (
                    <div style={{ padding: '0 12px 10px', borderTop: `1px solid ${C.border}` }}>
                      <pre style={{
                        margin: '8px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        fontSize: 11, color: C.muted, lineHeight: 1.6, maxHeight: 160, overflowY: 'auto',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                      }}>
                        {a.content}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
              <div style={{ fontSize: 11, color: C.dim, marginTop: 4 }}>
                If none of the above resolve your issue, continue to submit a ticket below.
              </div>
            </div>
          )}

          <Field label="Description">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Steps to reproduce, impact, affected users…"
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Requester name">
              <input
                value={requesterName}
                onChange={e => setRequesterName(e.target.value)}
                placeholder={currentUser.full_name}
                style={inputStyle}
              />
            </Field>
            <Field label="Requester dept">
              <input
                value={requesterDept}
                onChange={e => setRequesterDept(e.target.value)}
                placeholder="e.g. Finance"
                style={inputStyle}
              />
            </Field>
          </div>

          {companies.length > 0 && (
            <Field label="Company">
              <select value={companyId} onChange={e => setCompanyId(e.target.value)} style={inputStyle}>
                <option value="">No company</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}

          <Field label="Requester email">
            <input
              type="email"
              value={requesterEmail}
              onChange={e => setRequesterEmail(e.target.value)}
              placeholder="requester@company.com"
              style={inputStyle}
            />
          </Field>

          <Field label="Assignee">
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={inputStyle}>
              <option value="">Unassigned</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </Field>

          <Field label="Priority">
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {PRIORITIES.map(p => {
                const s = P[p];
                const isSuggested = suggestion?.suggested === p;
                return (
                  <button
                    key={p} type="button"
                    onClick={() => setPriority(p)}
                    style={{
                      flex: 1, padding: '6px 0',
                      background: priority === p ? s.bg : 'transparent',
                      border: `2px solid ${priority === p ? s.border : isSuggested ? PRIORITY_COLOR[p] : C.border}`,
                      borderRadius: 5,
                      color: priority === p ? s.text : isSuggested ? PRIORITY_COLOR[p] : C.dim,
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', position: 'relative',
                    }}
                  >
                    {p}
                    {isSuggested && (
                      <span style={{ position: 'absolute', top: -6, right: -2, fontSize: 8, background: PRIORITY_COLOR[p], color: '#fff', borderRadius: 3, padding: '1px 3px', fontWeight: 800 }}>
                        ✦
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {suggestion && (
              <div style={{ fontSize: 11, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', marginBottom: 8 }}>
                <span style={{ color: PRIORITY_COLOR[suggestion.suggested], fontWeight: 700 }}>Algorithm suggests {suggestion.suggested}</span>
                <span style={{ color: C.dim }}> ({Math.round(suggestion.confidence * 100)}% confidence)</span>
                {suggestion.reasons.length > 0 && (
                  <div style={{ marginTop: 4, color: C.dim }}>
                    {suggestion.reasons.map((r, i) => <span key={i} style={{ marginRight: 8 }}>· {r}</span>)}
                  </div>
                )}
                {suggestion.suggested !== priority && (
                  <button type="button" onClick={() => setPriority(suggestion.suggested)} style={{ marginTop: 6, padding: '3px 10px', background: 'transparent', border: `1px solid ${PRIORITY_COLOR[suggestion.suggested]}`, borderRadius: 4, color: PRIORITY_COLOR[suggestion.suggested], fontSize: 11, cursor: 'pointer' }}>
                    Use {suggestion.suggested}
                  </button>
                )}
              </div>
            )}

            {['P1', 'P2'].includes(priority) && (
              <div style={{ marginTop: 4 }}>
                <label style={{ display: 'block', fontSize: 10, color: priority === 'P1' ? '#f87171' : '#fbbf24', fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  {priority} Justification required *
                </label>
                <textarea
                  value={justification}
                  onChange={e => setJustification(e.target.value)}
                  placeholder={priority === 'P1' ? 'Describe the full business impact. P1 requires manager approval before taking effect.' : 'Describe why this is high priority and the business impact.'}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', borderColor: justification.trim() ? C.border : (priority === 'P1' ? '#7f1d1d' : '#92400e') }}
                />
                {priority === 'P1' && (
                  <div style={{ fontSize: 11, color: '#f87171', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    ⚠ P1 tickets require manager approval before taking full effect.
                  </div>
                )}
              </div>
            )}
          </Field>

          <button
            type="button"
            onClick={handleAiTriage}
            disabled={aiLoading || (!title.trim() && !description.trim())}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: aiNote ? 6 : 16,
              background: aiLoading ? C.card : C.accentDim,
              border: `1px solid ${aiLoading ? C.border : C.accent}`,
              borderRadius: 6,
              color: aiLoading ? C.muted : C.accentLight,
              fontSize: 13, fontWeight: 600,
              cursor: (aiLoading || (!title.trim() && !description.trim())) ? 'default' : 'pointer',
              opacity: (!title.trim() && !description.trim()) ? 0.5 : 1,
            }}
          >
            {aiLoading ? '⟳ Triaging…' : '✦ AI Triage — Auto-suggest priority & assignee'}
          </button>

          {aiNote && (
            <div style={{
              fontSize: 12, color: C.accentLight,
              background: C.accentDim, border: `1px solid ${C.accent}`,
              borderRadius: 6, padding: '8px 12px', marginBottom: 16,
            }}>
              {aiNote}
            </div>
          )}

          {error && (
            <div style={{
              fontSize: 12, color: '#f87171',
              background: '#2d0a0a', border: '1px solid #7f1d1d',
              borderRadius: 6, padding: '8px 12px', marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '8px 20px',
              background: 'transparent',
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.muted, fontSize: 13,
              cursor: 'pointer',
            }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{
              padding: '8px 20px',
              background: submitting ? C.accentDim : C.accent,
              border: 'none',
              borderRadius: 6,
              color: C.white, fontSize: 13, fontWeight: 600,
              cursor: submitting ? 'default' : 'pointer',
            }}>
              {submitting ? 'Creating…' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
