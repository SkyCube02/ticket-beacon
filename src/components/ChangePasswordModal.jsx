import { useState } from 'react';
import { C } from '../constants/theme.js';
import { api } from '../utils/api.js';
import { useToast } from '../utils/toast.jsx';

const inputStyle = {
  width: '100%', background: C.card, border: `1px solid ${C.border}`,
  borderRadius: 6, padding: '8px 10px', color: C.text,
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function getStrength(pw) {
  const checks = [
    { label: '12+ characters', ok: pw.length >= 12 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(pw) },
    { label: 'Number', ok: /\d/.test(pw) },
    { label: 'Special character', ok: /[^a-zA-Z0-9]/.test(pw) },
  ];
  const score = checks.filter(c => c.ok).length;
  const color = score <= 1 ? '#ef4444' : score === 2 ? '#f59e0b' : score === 3 ? '#eab308' : '#22c55e';
  return { checks, score, color };
}

export default function ChangePasswordModal({ onClose }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const strength = getStrength(next);
  const mismatch = confirm && next !== confirm;

  async function handleSubmit(e) {
    e.preventDefault();
    if (next !== confirm) { toast('Passwords do not match', 'error'); return; }
    if (strength.score < 4) { toast('Password does not meet all requirements', 'error'); return; }
    setSubmitting(true);
    try {
      await api.changePassword(current, next);
      toast('Password changed successfully', 'success');
      onClose();
    } catch (err) {
      toast(err.message, 'error');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 400, overflow: 'hidden' }}>
        <div style={{ padding: '15px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Change Password</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          <Field label="Current password">
            <input required type="password" value={current} onChange={e => setCurrent(e.target.value)} placeholder="••••••••" style={inputStyle} />
          </Field>
          <Field label="New password">
            <input required type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="Min 12 characters" style={inputStyle} />
            {next && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= strength.score ? strength.color : C.border, transition: 'background 0.2s' }} />
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {strength.checks.map(c => (
                    <span key={c.label} style={{ fontSize: 11, color: c.ok ? '#4ade80' : C.muted }}>
                      {c.ok ? '✓' : '○'} {c.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Field>
          <Field label="Confirm new password">
            <input
              required type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
              style={{ ...inputStyle, border: `1px solid ${mismatch ? '#ef4444' : C.border}` }}
            />
            {mismatch && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>Passwords do not match</div>}
          </Field>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 18px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting || strength.score < 4 || mismatch} style={{ padding: '8px 18px', background: strength.score === 4 ? C.accent : C.accentDim, border: 'none', borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: strength.score === 4 && !submitting ? 'pointer' : 'default', opacity: strength.score === 4 ? 1 : 0.5 }}>
              {submitting ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
