import { useState } from 'react';
import { C } from '../constants/theme.js';

const STARS = [1, 2, 3, 4, 5];
const LABELS = { 1: 'Very poor', 2: 'Poor', 3: 'Acceptable', 4: 'Good', 5: 'Excellent' };

export default function SatisfactionModal({ ticketNumber, onSubmit, onSkip }) {
  const [score, setScore] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!score) return;
    setSubmitting(true);
    await onSubmit(score, note);
  }

  const active = hovered || score;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 200,
    }}>
      <div style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        width: 420,
        padding: 32,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>
          Rate this resolution
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 24 }}>
          {ticketNumber} has been marked as resolved. How would you rate the support experience?
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 10 }}>
          {STARS.map(s => (
            <button
              key={s}
              onClick={() => setScore(s)}
              onMouseEnter={() => setHovered(s)}
              onMouseLeave={() => setHovered(0)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 32, lineHeight: 1,
                color: s <= active ? '#facc15' : C.border,
                transition: 'color 0.1s',
              }}
            >★</button>
          ))}
        </div>

        <div style={{ textAlign: 'center', fontSize: 12, color: C.muted, marginBottom: 18, minHeight: 16 }}>
          {active ? LABELS[active] : ''}
        </div>

        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Any additional feedback? (optional)"
          rows={3}
          style={{
            width: '100%',
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '8px 10px',
            color: C.text,
            fontSize: 13,
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
            marginBottom: 18,
          }}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onSkip}
            style={{
              padding: '8px 18px',
              background: 'transparent',
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: C.muted, fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={!score || submitting}
            style={{
              padding: '8px 18px',
              background: score ? C.accent : C.accentDim,
              border: 'none',
              borderRadius: 6,
              color: C.white, fontSize: 13, fontWeight: 600,
              cursor: score && !submitting ? 'pointer' : 'default',
              opacity: score ? 1 : 0.5,
            }}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
