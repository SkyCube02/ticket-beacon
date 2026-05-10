import { useState, useEffect } from 'react';
import { C } from '../constants/theme.js';
import { api } from '../utils/api.js';

function req(pw) {
  const checks = [
    { ok: pw.length >= 12,           label: 'At least 12 characters' },
    { ok: /[A-Z]/.test(pw),          label: 'One uppercase letter' },
    { ok: /[a-z]/.test(pw),          label: 'One lowercase letter' },
    { ok: /\d/.test(pw),             label: 'One number' },
    { ok: /[^a-zA-Z0-9]/.test(pw),   label: 'One special character' },
  ];
  return checks;
}

export default function ActivatePage({ token, onDone }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const checks = req(pw);
  const valid = checks.every(c => c.ok) && pw === pw2;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError('');
    try {
      await api.activateAccount(token, pw);
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%', background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: '10px 14px', color: C.text, fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  };

  if (done) return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 40, width: 380, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 8 }}>Account activated</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>Your password has been set. You can now sign in.</div>
        <button onClick={onDone} style={{ padding: '10px 28px', background: C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          Go to login
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, width: 400, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}>
        <div style={{ background: C.accentDim, borderBottom: `1px solid ${C.accent}44`, padding: '20px 24px' }}>
          <div style={{ fontSize: 11, color: C.accentLight, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>SimBix LLP — Ticket Beacon</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: C.text, marginTop: 4 }}>
            <span style={{ color: C.accent }}>●</span> Activate your account
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Set a password to complete your account setup.</div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>New Password</label>
            <input type="password" required autoFocus value={pw} onChange={e => setPw(e.target.value)} style={inputStyle} placeholder="Choose a strong password" />
          </div>

          {pw && (
            <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {checks.map(c => (
                <div key={c.label} style={{ fontSize: 11, color: c.ok ? C.green : C.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{c.ok ? '✓' : '○'}</span> {c.label}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Confirm Password</label>
            <input type="password" required value={pw2} onChange={e => setPw2(e.target.value)} style={{ ...inputStyle, borderColor: pw2 && pw !== pw2 ? '#ef4444' : C.border }} placeholder="Repeat password" />
            {pw2 && pw !== pw2 && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>Passwords do not match</div>}
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#f87171', background: '#2d0a0a', border: '1px solid #7f1d1d', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={!valid || loading} style={{
            width: '100%', padding: '11px', background: valid && !loading ? C.accent : C.accentDim,
            border: 'none', borderRadius: 6, color: C.white, fontSize: 14, fontWeight: 600,
            cursor: valid && !loading ? 'pointer' : 'default',
          }}>
            {loading ? 'Activating…' : 'Activate account'}
          </button>
        </form>
      </div>
    </div>
  );
}
