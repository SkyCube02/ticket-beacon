import { useState, useEffect } from 'react';
import { C } from '../constants/theme.js';
import { fmtTime, fmtFull } from '../utils/formatters.js';
import { api } from '../utils/api.js';
import { atLeast } from '../utils/permissions.js';
import { useToast } from '../utils/toast.jsx';

const CATEGORY_STYLE = {
  SECURITY:    { bg: '#2d0a0a', border: '#7f1d1d', text: '#f87171', label: '🔒 Security Alert' },
  PSA:         { bg: '#1a0a2e', border: '#5b21b6', text: '#c084fc', label: '📢 PSA' },
  MAINTENANCE: { bg: '#1f1d06', border: '#713f12', text: '#facc15', label: '🔧 Maintenance' },
  GENERAL:     { bg: C.card,   border: C.border,   text: C.muted,   label: '📋 General' },
};

const CATEGORIES = ['SECURITY', 'PSA', 'MAINTENANCE', 'GENERAL'];

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

function PostModal({ existing, onClose, onSaved }) {
  const toast = useToast();
  const [title, setTitle] = useState(existing?.title ?? '');
  const [content, setContent] = useState(existing?.content ?? '');
  const [category, setCategory] = useState(existing?.category ?? 'GENERAL');
  const [isPinned, setIsPinned] = useState(existing?.is_pinned ?? false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = { title, content, category, is_pinned: isPinned };
      const saved = existing
        ? await api.updateAnnouncement(existing.id, body)
        : await api.createAnnouncement(body);
      onSaved(saved);
      toast(existing ? 'Announcement updated' : 'Announcement posted', 'success');
    } catch (err) {
      toast(err.message, 'error');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '15px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{existing ? 'Edit Announcement' : 'New Announcement'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 20, overflowY: 'auto' }}>
          <Field label="Title *">
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Clear, descriptive title" style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end', marginBottom: 14 }}>
            <Field label="Category">
              <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_STYLE[c].label}</option>)}
              </select>
            </Field>
            <div style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
              <input type="checkbox" id="pinned" checked={isPinned} onChange={e => setIsPinned(e.target.checked)} style={{ cursor: 'pointer' }} />
              <label htmlFor="pinned" style={{ fontSize: 12, color: C.muted, cursor: 'pointer' }}>Pin to top</label>
            </div>
          </div>
          <Field label="Content *">
            <textarea required value={content} onChange={e => setContent(e.target.value)} rows={10} placeholder="Full announcement content…" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} />
          </Field>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 20px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ padding: '8px 20px', background: submitting ? C.accentDim : C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}>
              {submitting ? 'Posting…' : existing ? 'Save changes' : 'Post'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Announcements({ currentUser }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const toast = useToast();

  const canPost = atLeast(currentUser, 'TEAM_MANAGER');

  useEffect(() => {
    api.listAnnouncements()
      .then(data => { setPosts(data); setLoading(false); })
      .catch(e => { toast(e.message, 'error'); setLoading(false); });
  }, []);

  async function handleDelete(post) {
    try {
      await api.deleteAnnouncement(post.id);
      setPosts(prev => prev.filter(p => p.id !== post.id));
      if (expanded === post.id) setExpanded(null);
      toast('Announcement removed', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function handleSaved(saved) {
    setPosts(prev => {
      const exists = prev.find(p => p.id === saved.id);
      const updated = exists ? prev.map(p => p.id === saved.id ? saved : p) : [saved, ...prev];
      return updated.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0) || new Date(b.createdAt) - new Date(a.createdAt));
    });
    setShowModal(false);
    setEditing(null);
    setExpanded(saved.id);
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Announcements</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Security alerts, PSAs, and maintenance notices</div>
        </div>
        {canPost && (
          <button onClick={() => { setEditing(null); setShowModal(true); }} style={{
            padding: '7px 16px', background: C.accent, color: C.white,
            border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>
            + Post
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {loading && <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, paddingTop: 48 }}>Loading…</div>}
        {!loading && posts.length === 0 && (
          <div style={{ textAlign: 'center', color: C.muted, fontSize: 13, paddingTop: 48 }}>No announcements yet.</div>
        )}
        {posts.map(post => {
          const style = CATEGORY_STYLE[post.category] || CATEGORY_STYLE.GENERAL;
          const isExpanded = expanded === post.id;
          return (
            <div key={post.id} style={{
              background: style.bg, border: `1px solid ${style.border}`,
              borderRadius: 10, marginBottom: 12, overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpanded(isExpanded ? null : post.id)}
                style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: style.text, background: style.border + '44', padding: '2px 8px', borderRadius: 4 }}>
                      {style.label}
                    </span>
                    {post.is_pinned && (
                      <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>📌 Pinned</span>
                    )}
                    <span style={{ fontSize: 11, color: C.dim }}>{post.author} · {fmtTime(post.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: style.text, lineHeight: 1.35 }}>{post.title}</div>
                </div>
                <span style={{ color: C.dim, fontSize: 14, flexShrink: 0, marginTop: 2 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ padding: '0 18px 16px', borderTop: `1px solid ${style.border}` }}>
                  <pre style={{
                    margin: '14px 0 14px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    fontSize: 13, color: C.muted, lineHeight: 1.7,
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                  }}>
                    {post.content}
                  </pre>
                  <div style={{ fontSize: 11, color: C.dim }}>Posted {fmtFull(post.createdAt)}</div>
                  {canPost && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={() => { setEditing(post); setShowModal(true); }} style={{
                        padding: '4px 14px', background: C.accentDim, border: `1px solid ${C.accent}`,
                        borderRadius: 4, color: C.accentLight, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}>Edit</button>
                      <button onClick={() => handleDelete(post)} style={{
                        padding: '4px 14px', background: 'transparent', border: '1px solid #7f1d1d',
                        borderRadius: 4, color: '#f87171', fontSize: 11, cursor: 'pointer',
                      }}>Delete</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <PostModal
          existing={editing}
          onClose={() => { setShowModal(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
