import { useState, useEffect } from 'react';
import { C } from '../constants/theme.js';
import { fmtTime } from '../utils/formatters.js';
import { api } from '../utils/api.js';
import { atLeast } from '../utils/permissions.js';
import { useToast } from '../utils/toast.jsx';
import KBArticleModal from './KBArticleModal.jsx';

function CategoryBadge({ category }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      padding: '2px 7px', borderRadius: 4,
      background: C.card, color: C.muted,
      border: `1px solid ${C.border}`,
      whiteSpace: 'nowrap',
    }}>
      {category}
    </span>
  );
}

function ArticleList({ articles, selectedId, onSelect, loading }) {
  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading…</div>;
  if (articles.length === 0) return <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>No articles found</div>;

  return articles.map(a => (
    <div
      key={a.id}
      onClick={() => onSelect(a.id === selectedId ? null : a.id)}
      style={{
        padding: '12px 18px',
        borderBottom: `1px solid ${C.border}`,
        borderLeft: `3px solid ${a.id === selectedId ? C.accent : 'transparent'}`,
        background: a.id === selectedId ? C.card : 'transparent',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
        <span style={{ fontSize: 13, color: C.text, fontWeight: 500, lineHeight: 1.35 }}>{a.title}</span>
        <CategoryBadge category={a.category} />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: C.dim }}>{a.author} · {fmtTime(a.updatedAt)}</span>
        {a.tags.slice(0, 3).map(t => (
          <span key={t} style={{ fontSize: 10, color: C.dim, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, padding: '1px 5px' }}>{t}</span>
        ))}
      </div>
    </div>
  ));
}

function ArticleDetail({ article, currentUser, onEdit, onArchive }) {
  const canEdit = atLeast(currentUser, 'SENIOR_AGENT');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.surface }}>
      <div style={{
        padding: '13px 18px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4, lineHeight: 1.35 }}>{article.title}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <CategoryBadge category={article.category} />
            <span style={{ fontSize: 11, color: C.dim }}>{article.author} · updated {fmtTime(article.updatedAt)}</span>
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={onEdit} style={{
              padding: '5px 12px', background: C.accentDim, border: `1px solid ${C.accent}`,
              borderRadius: 5, color: C.accentLight, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>Edit</button>
            <button onClick={onArchive} style={{
              padding: '5px 12px', background: 'transparent', border: `1px solid ${C.border}`,
              borderRadius: 5, color: C.muted, fontSize: 12, cursor: 'pointer',
            }}>Archive</button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {article.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 18 }}>
            {article.tags.map(t => (
              <span key={t} style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4,
                background: C.card, border: `1px solid ${C.border}`, color: C.muted,
              }}>{t}</span>
            ))}
          </div>
        )}
        <pre style={{
          margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontSize: 13, color: C.muted, lineHeight: 1.7,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}>
          {article.content}
        </pre>
      </div>
    </div>
  );
}

const STATUS_COLORS = { PENDING: '#fbbf24', REVIEWED: '#60a5fa', APPLIED: '#4ade80' };

function EditRequestsPanel({ currentUser }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    api.listKBEditRequests().then(data => { setRequests(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function updateStatus(id, status) {
    try {
      const updated = await api.updateKBEditRequest(id, status);
      setRequests(prev => prev.map(r => r.id === id ? updated : r));
      toast(`Marked as ${status.toLowerCase()}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading…</div>;
  if (!requests.length) return <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>No edit suggestions yet</div>;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
      {requests.map(r => (
        <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.accentLight, marginBottom: 2 }}>{r.article_title}</div>
              <div style={{ fontSize: 11, color: C.dim }}>{r.requester_name} · {fmtTime(r.createdAt)}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: C.surface, color: STATUS_COLORS[r.status] || C.muted, border: `1px solid ${STATUS_COLORS[r.status] || C.border}` }}>
              {r.status}
            </span>
          </div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, marginBottom: 10, padding: '8px 10px', background: C.surface, borderRadius: 5 }}>
            {r.suggested_change}
          </div>
          {r.status === 'PENDING' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => updateStatus(r.id, 'REVIEWED')} style={{ padding: '4px 12px', background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 5, color: C.accentLight, fontSize: 11, cursor: 'pointer' }}>Mark Reviewed</button>
              <button onClick={() => updateStatus(r.id, 'APPLIED')} style={{ padding: '4px 12px', background: '#052010', border: '1px solid #166534', borderRadius: 5, color: '#4ade80', fontSize: 11, cursor: 'pointer' }}>Mark Applied</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function KnowledgeBase({ currentUser }) {
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState(null);
  const [kbView, setKbView] = useState('articles'); // 'articles' | 'requests'
  const [pendingCount, setPendingCount] = useState(0);

  const toast = useToast();
  const canEdit = atLeast(currentUser, 'SENIOR_AGENT');

  useEffect(() => {
    api.listCategories().then(setCategories).catch(() => {});
    if (canEdit) {
      api.listKBEditRequests().then(data => setPendingCount(data.filter(r => r.status === 'PENDING').length)).catch(() => {});
    }
  }, [canEdit]);

  useEffect(() => {
    setLoading(true);
    api.listArticles({ search, category }).then(data => {
      setArticles(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [search, category]);

  const selected = articles.find(a => a.id === selectedId) ?? null;

  async function handleArchive(article) {
    try {
      await api.archiveArticle(article.id);
      setArticles(prev => prev.filter(a => a.id !== article.id));
      setSelectedId(null);
      toast('Article archived', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function handleSaved(article) {
    setArticles(prev => {
      const exists = prev.find(a => a.id === article.id);
      return exists ? prev.map(a => a.id === article.id ? article : a) : [article, ...prev];
    });
    setSelectedId(article.id);
    setShowModal(false);
    setEditingArticle(null);
    api.listCategories().then(setCategories).catch(() => {});
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* List panel */}
      <div style={{
        flex: selected ? '0 0 48%' : 1,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRight: selected ? `1px solid ${C.border}` : 'none',
      }}>
        <div style={{
          padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          {canEdit && (
            <>
              <button
                onClick={() => setKbView('articles')}
                style={{ padding: '5px 12px', background: kbView === 'articles' ? C.accentDim : 'transparent', border: `1px solid ${kbView === 'articles' ? C.accent : C.border}`, borderRadius: 5, color: kbView === 'articles' ? C.accentLight : C.muted, fontSize: 12, cursor: 'pointer' }}
              >Articles</button>
              <button
                onClick={() => setKbView('requests')}
                style={{ padding: '5px 12px', background: kbView === 'requests' ? C.accentDim : 'transparent', border: `1px solid ${kbView === 'requests' ? C.accent : C.border}`, borderRadius: 5, color: kbView === 'requests' ? C.accentLight : C.muted, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                Edit Requests
                {pendingCount > 0 && <span style={{ background: '#ef4444', color: C.white, fontSize: 10, fontWeight: 700, borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pendingCount}</span>}
              </button>
            </>
          )}
          {kbView === 'articles' && (
            <>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search articles…"
                style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 12px', color: C.text, fontSize: 13, outline: 'none' }}
              />
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', color: category ? C.text : C.muted, fontSize: 13, outline: 'none', cursor: 'pointer' }}
              >
                <option value="">All categories</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {canEdit && (
                <button
                  onClick={() => { setEditingArticle(null); setShowModal(true); }}
                  style={{ padding: '7px 14px', background: C.accent, color: C.white, border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >+ New</button>
              )}
            </>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {kbView === 'requests'
            ? <EditRequestsPanel currentUser={currentUser} />
            : <ArticleList articles={articles} selectedId={selectedId} onSelect={setSelectedId} loading={loading} />
          }
        </div>

        {kbView === 'articles' && (
          <div style={{ padding: '10px 18px', borderTop: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 11, color: C.dim }}>{articles.length} article{articles.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <ArticleDetail
          article={selected}
          currentUser={currentUser}
          onEdit={() => { setEditingArticle(selected); setShowModal(true); }}
          onArchive={() => handleArchive(selected)}
        />
      )}

      {showModal && (
        <KBArticleModal
          article={editingArticle}
          categories={categories}
          onClose={() => { setShowModal(false); setEditingArticle(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
