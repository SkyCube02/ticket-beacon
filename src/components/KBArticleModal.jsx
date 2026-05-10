import { useState } from 'react';
import { C } from '../constants/theme.js';
import { api } from '../utils/api.js';

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

export default function KBArticleModal({ article, categories, onClose, onSaved }) {
  const isEdit = !!article;
  const [title, setTitle] = useState(article?.title ?? '');
  const [content, setContent] = useState(article?.content ?? '');
  const [category, setCategory] = useState(article?.category ?? 'General');
  const [customCategory, setCustomCategory] = useState('');
  const [tagsInput, setTagsInput] = useState(article?.tags?.join(', ') ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const allCategories = categories.includes(category) ? categories : [...categories, category];

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    setError('');
    const effectiveCategory = category === '__new__' ? customCategory.trim() : category;
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
    try {
      const body = { title: title.trim(), content: content.trim(), category: effectiveCategory || 'General', tags };
      const saved = isEdit ? await api.updateArticle(article.id, body) : await api.createArticle(body);
      onSaved(saved);
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
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 12, width: 620, maxHeight: '92vh',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '15px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
            {isEdit ? 'Edit Article' : 'New KB Article'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          <Field label="Title *">
            <input
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Descriptive title for this issue or topic"
              style={inputStyle}
            />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Category">
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                style={inputStyle}
              >
                {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__new__">+ New category…</option>
              </select>
            </Field>
            {category === '__new__' && (
              <Field label="New category name">
                <input
                  value={customCategory}
                  onChange={e => setCustomCategory(e.target.value)}
                  placeholder="e.g. Security"
                  style={inputStyle}
                />
              </Field>
            )}
            <Field label="Tags (comma-separated)">
              <input
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="e.g. outlook, windows, crash"
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Content *">
            <textarea
              required
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Describe the symptoms, cause, and resolution steps…"
              rows={16}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            />
          </Field>

          {error && (
            <div style={{
              fontSize: 12, color: '#f87171', background: '#2d0a0a',
              border: '1px solid #7f1d1d', borderRadius: 6, padding: '8px 12px', marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '8px 20px', background: 'transparent',
              border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.muted, fontSize: 13, cursor: 'pointer',
            }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{
              padding: '8px 20px', background: submitting ? C.accentDim : C.accent,
              border: 'none', borderRadius: 6, color: C.white,
              fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer',
            }}>
              {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create article'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
