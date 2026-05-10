import { useState, useEffect } from 'react';
import { C } from '../constants/theme.js';
import { api } from '../utils/api.js';
import { useToast } from '../utils/toast.jsx';
import { fmtTime } from '../utils/formatters.js';

const COLS = [
  { key: 'TODO',        label: 'To Do',      color: C.muted },
  { key: 'IN_PROGRESS', label: 'In Progress', color: '#38bdf8' },
  { key: 'DONE',        label: 'Done',        color: '#4ade80' },
];

const inputStyle = {
  width: '100%', background: C.card, border: `1px solid ${C.border}`,
  borderRadius: 6, padding: '7px 10px', color: C.text,
  fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

function TaskModal({ task, agents, onClose, onSaved }) {
  const toast = useToast();
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [status, setStatus] = useState(task?.status ?? 'TODO');
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ?? '');
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = { title, notes, status, assignee_id: assigneeId || null, due_date: dueDate || null };
      const saved = task ? await api.updateTask(task.id, body) : await api.createTask(body);
      onSaved(saved);
      toast(task ? 'Task updated' : 'Task created', 'success');
    } catch (err) {
      toast(err.message, 'error');
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 460, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{task ? 'Edit Task' : 'New Task'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Title *</label>
            <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to be done?" style={inputStyle} autoFocus />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any additional details…" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
                {COLS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Assign to</label>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={inputStyle}>
                <option value="">Anyone</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10, color: C.muted, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '7px 18px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ padding: '7px 18px', background: submitting ? C.accentDim : C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}>
              {submitting ? 'Saving…' : task ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskCard({ task, onEdit, onDelete, onStatusChange }) {
  const isOverdue = task.due_date && task.status !== 'DONE' && new Date(task.due_date) < new Date();

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: '10px 12px', marginBottom: 8,
      borderLeft: isOverdue ? '3px solid #ef4444' : '3px solid transparent',
    }}>
      <div style={{ fontSize: 13, color: C.text, fontWeight: 500, marginBottom: task.notes ? 4 : 6, lineHeight: 1.35 }}>
        {task.title}
      </div>
      {task.notes && (
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>{task.notes}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {task.assignee && (
          <span style={{ fontSize: 10, color: C.dim, background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: '1px 6px' }}>
            {task.assignee}
          </span>
        )}
        {task.due_date && (
          <span style={{ fontSize: 10, color: isOverdue ? '#f87171' : C.dim }}>
            Due {task.due_date}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => onEdit(task)} style={{ background: 'none', border: 'none', color: C.dim, fontSize: 11, cursor: 'pointer', padding: '2px 4px' }}>Edit</button>
        <button onClick={() => onDelete(task)} style={{ background: 'none', border: 'none', color: C.dim, fontSize: 16, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>×</button>
      </div>
    </div>
  );
}

export default function TaskBoard({ currentUser }) {
  const toast = useToast();
  const [tasks, setTasks] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | task | 'new'
  const [defaultCol, setDefaultCol] = useState('TODO');

  useEffect(() => {
    Promise.all([api.listTasks(), api.listAgents()])
      .then(([t, a]) => { setTasks(t); setAgents(a); setLoading(false); })
      .catch(e => { toast(e.message, 'error'); setLoading(false); });
  }, []);

  function handleSaved(saved) {
    setTasks(prev => {
      const exists = prev.find(t => t.id === saved.id);
      return exists ? prev.map(t => t.id === saved.id ? saved : t) : [saved, ...prev];
    });
    setModal(null);
  }

  async function handleDelete(task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    try {
      await api.deleteTask(task.id);
      setTasks(prev => prev.filter(t => t.id !== task.id));
      toast('Task deleted', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleStatusChange(task, newStatus) {
    try {
      const updated = await api.updateTask(task.id, { ...task, status: newStatus, assignee_id: task.assignee_id, due_date: task.due_date });
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const done = tasks.filter(t => t.status === 'DONE').length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Task Board</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            {tasks.length} tasks · {done} done
          </div>
        </div>
        <button
          onClick={() => { setDefaultCol('TODO'); setModal('new'); }}
          style={{ padding: '7px 16px', background: C.accent, color: C.white, border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + New Task
        </button>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, overflow: 'hidden' }}>
          {COLS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.key);
            return (
              <div key={col.key} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: col.key !== 'DONE' ? `1px solid ${C.border}` : 'none' }}>
                {/* Column header */}
                <div style={{
                  padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: col.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{col.label}</span>
                  <span style={{ fontSize: 11, color: C.dim, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '0 6px', marginLeft: 2 }}>{colTasks.length}</span>
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => { setDefaultCol(col.key); setModal('new'); }}
                    style={{ background: 'none', border: 'none', color: C.dim, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
                  >+</button>
                </div>

                {/* Tasks */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 10px' }}>
                  {colTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onEdit={t => setModal(t)}
                      onDelete={handleDelete}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                  {colTasks.length === 0 && (
                    <div style={{ fontSize: 12, color: C.dim, textAlign: 'center', paddingTop: 24, fontStyle: 'italic' }}>
                      No tasks
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <TaskModal
          task={modal === 'new' ? null : modal}
          agents={agents}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
