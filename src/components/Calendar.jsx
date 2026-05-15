import { useState, useEffect, useCallback } from 'react';
import { C } from '../constants/theme.js';
import { api } from '../utils/api.js';
import { useToast } from '../utils/toast.jsx';
import { atLeast } from '../utils/permissions.js';

const PRIORITY_COLOR = { P1: '#ef4444', P2: '#f97316', P3: '#eab308', P4: '#60a5fa', P5: '#6b7280' };
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function fmtMins(m) {
  if (m == null) return '—';
  const h = Math.floor(m / 60), mins = m % 60;
  return h > 0 ? `${h}h ${mins}m` : `${mins}m`;
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// Timezone-safe: build YYYY-MM-DD from local date parts (not UTC)
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function padMonth(m) { return String(m + 1).padStart(2, '0'); }

// ── Clock widget ──────────────────────────────────────────────────────────────

function ClockWidget({ onUpdate }) {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    api.clockStatus().then(s => setStatus(s)).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function act(fn, label) {
    setLoading(true);
    try { await fn(); refresh(); onUpdate?.(); toast(label, 'success'); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  if (!status) return null;
  const s = status.session;
  const st = status.status;

  const statusColor = st === 'clocked_in' ? '#4ade80' : st === 'on_break' ? '#fbbf24' : st === 'clocked_out' ? '#60a5fa' : C.muted;
  const statusLabel = st === 'clocked_in' ? 'Clocked in' : st === 'on_break' ? 'On break' : st === 'clocked_out' ? 'Clocked out' : 'Not started';

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Today</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: statusColor }}>{statusLabel}</span>
          {s && <span style={{ fontSize: 12, color: C.muted }}>since {fmtTime(s.clock_in)}</span>}
        </div>
      </div>

      {s && (
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 1 }}>Worked</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fmtMins(s.total_minutes ?? calcWorked(s))}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 1 }}>Breaks</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fmtMins(s.break_minutes)}</div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
        {st === 'not_clocked_in' && (
          <Btn onClick={() => act(api.clockIn, 'Clocked in')} color="#4ade80" disabled={loading}>Clock In</Btn>
        )}
        {st === 'clocked_in' && (
          <>
            <Btn onClick={() => act(api.breakStart, 'Break started')} color="#fbbf24" disabled={loading}>Take Break</Btn>
            <Btn onClick={() => act(api.clockOut, 'Clocked out')} color="#ef4444" disabled={loading}>Clock Out</Btn>
          </>
        )}
        {st === 'on_break' && (
          <>
            <Btn onClick={() => act(api.breakEnd, 'Break ended')} color="#4ade80" disabled={loading}>End Break</Btn>
            <Btn onClick={() => act(api.clockOut, 'Clocked out')} color="#ef4444" disabled={loading}>Clock Out</Btn>
          </>
        )}
        {st === 'clocked_out' && (
          <span style={{ fontSize: 12, color: C.muted }}>Done for the day — {fmtMins(s.total_minutes)} worked</span>
        )}
      </div>
    </div>
  );
}

function calcWorked(s) {
  if (!s) return null;
  const now = Date.now();
  const start = new Date(s.clock_in).getTime();
  const breaks = (s.breaks || []).reduce((acc, b) => {
    if (b.start && b.end) return acc + (new Date(b.end) - new Date(b.start));
    if (b.start && !b.end) return acc + (now - new Date(b.start));
    return acc;
  }, 0);
  return Math.floor((now - start - breaks) / 60000);
}

function Btn({ onClick, color, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '6px 14px', background: 'transparent',
      border: `1px solid ${color}`, borderRadius: 6,
      color, fontSize: 12, fontWeight: 600,
      cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
    }}>
      {children}
    </button>
  );
}

// ── New meeting modal ─────────────────────────────────────────────────────────

function MeetingModal({ defaultDate, agents, onSave, onClose }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState(defaultDate || isoDate(new Date()));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [teamsLink, setTeamsLink] = useState('');
  const [attendees, setAttendees] = useState([]);
  const [saving, setSaving] = useState(false);

  const inp = { width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box' };

  async function handleSave() {
    if (!title.trim()) { toast('Title required', 'error'); return; }
    setSaving(true);
    try {
      const start_time = `${date}T${startTime}:00`;
      const end_time = `${date}T${endTime}:00`;
      await api.createMeeting({ title: title.trim(), description: desc.trim() || null, start_time, end_time, attendee_ids: attendees, teams_link: teamsLink.trim() || null });
      toast('Meeting created', 'success');
      onSave();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 480, padding: 28 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 18 }}>New Meeting</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Meeting title *" style={inp} autoFocus />
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description (optional)" rows={2} style={{ ...inp, resize: 'vertical' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div><label style={{ fontSize: 10, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 3 }}>DATE</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} /></div>
            <div><label style={{ fontSize: 10, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 3 }}>START</label><input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inp} /></div>
            <div><label style={{ fontSize: 10, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 3 }}>END</label><input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={inp} /></div>
          </div>
          <input value={teamsLink} onChange={e => setTeamsLink(e.target.value)} placeholder="Teams meeting link (optional)" style={inp} />
          <div>
            <label style={{ fontSize: 10, color: C.muted, fontWeight: 700, display: 'block', marginBottom: 6 }}>ATTENDEES</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {agents.filter(a => a.role !== 'CLIENT_USER' && a.role !== 'CLIENT_MANAGER').map(a => {
                const selected = attendees.includes(a.id);
                return (
                  <button key={a.id} onClick={() => setAttendees(v => selected ? v.filter(x => x !== a.id) : [...v, a.id])}
                    style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, cursor: 'pointer', background: selected ? C.accentDim : 'transparent', border: `1px solid ${selected ? C.accent : C.border}`, color: selected ? C.accentLight : C.muted }}>
                    {a.full_name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Day detail panel ──────────────────────────────────────────────────────────

const TASK_STATUS_COLOR = { DONE: '#4ade80', IN_PROGRESS: '#fbbf24', TODO: '#fb923c' };
const TASK_STATUS_LABEL = { DONE: 'Done', IN_PROGRESS: 'In Progress', TODO: 'To Do' };

function DayPanel({ date, events, bankHoliday, sessions, onClose, onDeleteMeeting, isManager }) {
  const dateObj = new Date(date + 'T12:00:00');
  const dayName = dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const meetings = events.filter(e => e.type === 'meeting');
  const tickets = events.filter(e => e.type === 'ticket');
  const tasks = events.filter(e => e.type === 'task');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{ position: 'relative', width: 420, height: '100%', background: C.surface, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{dayName}</div>
            {bankHoliday && <div style={{ fontSize: 11, color: '#fbbf24', fontWeight: 600, marginTop: 3 }}>🏖 {bankHoliday}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

          {/* Clock entries */}
          {sessions.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Attendance</div>
              {sessions.map(s => (
                <div key={s.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{isManager ? s.user_name : 'You'}</span>
                    <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 600 }}>{fmtMins(s.total_minutes)} worked</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    {fmtTime(s.clock_in)} → {s.clock_out ? fmtTime(s.clock_out) : 'ongoing'}
                    {s.break_minutes > 0 && <span> · {fmtMins(s.break_minutes)} breaks</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Meetings */}
          {meetings.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Meetings</div>
              {meetings.map(m => (
                <div key={m.id} style={{ background: C.card, border: `1px solid #1e3a7a`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#93c5fd' }}>{m.title}</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {m.source === 'outlook' && <span style={{ fontSize: 9, background: '#1e3a7a', color: '#93c5fd', borderRadius: 3, padding: '1px 5px', fontWeight: 700 }}>OUTLOOK</span>}
                      <button onClick={() => onDeleteMeeting(m.id)} style={{ background: 'none', border: 'none', color: C.dim, fontSize: 14, cursor: 'pointer', padding: 0 }}>×</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>{fmtTime(m.start_time)} – {fmtTime(m.end_time)}</div>
                  {m.description && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{m.description}</div>}
                  {m.teams_link && <a href={m.teams_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#60a5fa', display: 'block', marginTop: 4 }}>Join Teams meeting ↗</a>}
                </div>
              ))}
            </div>
          )}

          {/* Ticket completions */}
          {tickets.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Tickets Resolved</div>
              {tickets.map(t => (
                <div key={t.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLOR[t.priority] }}>{t.priority}</span>
                    <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{t.ticket_number}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>{t.title}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>
                    {fmtTime(t.resolved_at)} · {fmtMins(t.duration_minutes)} to resolve
                    {isManager && t.assignee && <span> · {t.assignee}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tasks due */}
          {tasks.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Tasks Due</div>
              {tasks.map(t => (
                <div key={t.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{t.title}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: TASK_STATUS_COLOR[t.status] }}>{TASK_STATUS_LABEL[t.status]}</span>
                  </div>
                  {isManager && t.assignee && <div style={{ fontSize: 11, color: C.muted }}>{t.assignee}</div>}
                  {t.linked_ticket_id && <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Linked to ticket</div>}
                </div>
              ))}
            </div>
          )}

          {sessions.length === 0 && meetings.length === 0 && tickets.length === 0 && tasks.length === 0 && !bankHoliday && (
            <div style={{ fontSize: 12, color: C.dim, textAlign: 'center', marginTop: 40 }}>Nothing scheduled</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Calendar ─────────────────────────────────────────────────────────────

export default function Calendar({ currentUser }) {
  const toast = useToast();
  const isManager = atLeast(currentUser, 'TEAM_MANAGER');

  const [viewYear, setViewYear] = useState(new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(new Date().getMonth());
  const [bankHolidays, setBankHolidays] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [ticketEvents, setTicketEvents] = useState([]);
  const [taskEvents, setTaskEvents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clockKey, setClockKey] = useState(0);

  // Build date strings from local parts — avoids UTC offset flipping the date (e.g. BST)
  const rangeStart = `${viewYear}-${padMonth(viewMonth)}-01`;
  const daysInMonthForRange = new Date(viewYear, viewMonth + 1, 0).getDate();
  const rangeEnd = `${viewYear}-${padMonth(viewMonth)}-${String(daysInMonthForRange).padStart(2, '0')}`;
  const rangeStartISO = `${rangeStart}T00:00:00`;
  const rangeEndISO = `${rangeEnd}T23:59:59`;

  useEffect(() => {
    api.getBankHolidays().then(setBankHolidays).catch(() => {});
    api.listAgents().then(setAgents).catch(() => {});
  }, []);

  const loadData = useCallback(() => {
    Promise.all([
      api.listMeetings(rangeStartISO, rangeEndISO),
      api.calendarTicketEvents(rangeStartISO, rangeEndISO),
      api.calendarTaskEvents(rangeStart, rangeEnd),
      isManager
        ? api.teamClockRange(rangeStart, rangeEnd)
        : api.clockHistory(rangeStart, rangeEnd),
    ]).then(([m, t, tk, s]) => {
      setMeetings(m || []);
      setTicketEvents(t || []);
      setTaskEvents(tk || []);
      setSessions(s || []);
    }).catch(() => {});
  }, [rangeStartISO, rangeEndISO, rangeStart, rangeEnd, isManager]);

  useEffect(() => { loadData(); }, [loadData]);

  // Build lookup maps keyed by date string
  const holidayMap = {};
  bankHolidays.forEach(h => { holidayMap[h.date] = h.name; });

  const meetingsByDate = {};
  meetings.forEach(m => {
    const d = m.start_time.slice(0, 10);
    (meetingsByDate[d] = meetingsByDate[d] || []).push({ ...m, type: 'meeting' });
  });

  const ticketsByDate = {};
  ticketEvents.forEach(t => {
    const d = t.resolved_at.slice(0, 10);
    (ticketsByDate[d] = ticketsByDate[d] || []).push({ ...t, type: 'ticket' });
  });

  const tasksByDate = {};
  taskEvents.forEach(t => {
    (tasksByDate[t.due_date] = tasksByDate[t.due_date] || []).push({ ...t, type: 'task' });
  });

  const sessionsByDate = {};
  sessions.forEach(s => {
    (sessionsByDate[s.date] = sessionsByDate[s.date] || []).push(s);
  });

  // Calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1);
  const firstDow = (firstDay.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayStr = isoDate(new Date());

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  async function handleDeleteMeeting(id) {
    try {
      await api.deleteMeeting(id);
      toast('Meeting removed', 'success');
      loadData();
      setSelectedDate(null);
    } catch (e) { toast(e.message, 'error'); }
  }

  async function handleSyncIcal() {
    const url = localStorage.getItem('tb_ical_url') || '';
    if (!url) { toast('Add your Outlook iCal URL in Settings first', 'error'); return; }
    setSyncing(true);
    try {
      const res = await api.syncIcal(url);
      toast(`Synced: ${res.imported} new, ${res.updated} updated`, 'success');
      loadData();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSyncing(false); }
  }

  const selectedDateStr = selectedDate
    ? `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`
    : null;

  const selectedEvents = selectedDateStr
    ? [
        ...(meetingsByDate[selectedDateStr] || []),
        ...(ticketsByDate[selectedDateStr] || []),
        ...(tasksByDate[selectedDateStr] || []),
      ]
    : [];

  const selectedSessions = selectedDateStr ? (sessionsByDate[selectedDateStr] || []) : [];

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: C.bg }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: -0.3 }}>Calendar</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={handleSyncIcal} disabled={syncing} style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 12, cursor: 'pointer' }}>
            {syncing ? 'Syncing…' : '⟳ Outlook'}
          </button>
          <button onClick={() => setShowMeetingModal(true)} style={{ padding: '6px 14px', background: C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            + Meeting
          </button>
        </div>
      </div>

      {/* Clock widget */}
      <ClockWidget key={clockKey} onUpdate={() => setClockKey(k => k + 1)} />

      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <button onClick={prevMonth} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 14, cursor: 'pointer', padding: '4px 10px' }}>‹</button>
        <span style={{ fontSize: 16, fontWeight: 700, color: C.text, minWidth: 160, textAlign: 'center' }}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 14, cursor: 'pointer', padding: '4px 10px' }}>›</button>
        <button onClick={() => { setViewYear(new Date().getFullYear()); setViewMonth(new Date().getMonth()); }}
          style={{ marginLeft: 8, padding: '4px 12px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, color: C.muted, fontSize: 11, cursor: 'pointer' }}>
          Today
        </button>
      </div>

      {/* Day name headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {DAY_NAMES.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.muted, padding: '4px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = dateStr === todayStr;
          const isSelected = selectedDate === day;
          const holiday = holidayMap[dateStr];
          const dayMeetings = meetingsByDate[dateStr] || [];
          const dayTickets = ticketsByDate[dateStr] || [];
          const dayTasks = tasksByDate[dateStr] || [];
          const daySessions = sessionsByDate[dateStr] || [];
          const hasEvents = holiday || dayMeetings.length || dayTickets.length || dayTasks.length || daySessions.length;
          const isWeekend = (i % 7) >= 5;

          return (
            <div
              key={dateStr}
              onClick={() => setSelectedDate(day === selectedDate ? null : day)}
              style={{
                minHeight: 90, padding: 6, borderRadius: 8, cursor: 'pointer',
                background: isSelected ? C.accentDim : isToday ? '#0d1a2e' : C.card,
                border: `1px solid ${isSelected ? C.accent : isToday ? '#1e3a7a' : C.border}`,
                opacity: isWeekend && !hasEvents ? 0.5 : 1,
                transition: 'border-color 0.1s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{
                  fontSize: 13, fontWeight: isToday ? 700 : 400,
                  color: isToday ? C.accentLight : isSelected ? C.accentLight : C.text,
                  width: 24, height: 24, borderRadius: '50%',
                  background: isToday ? C.accent : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {day}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {holiday && (
                  <div style={{ fontSize: 9, color: '#fbbf24', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    🏖 {holiday}
                  </div>
                )}
                {daySessions.length > 0 && (
                  <div style={{ fontSize: 9, color: '#4ade80', fontWeight: 600 }}>
                    ● {isManager ? `${daySessions.length} in` : fmtMins(daySessions[0]?.total_minutes ?? calcWorked(daySessions[0]))}
                  </div>
                )}
                {dayMeetings.slice(0, 2).map(m => (
                  <div key={m.id} style={{ fontSize: 9, color: '#93c5fd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: '#0d1a2e', borderRadius: 3, padding: '1px 4px' }}>
                    {fmtTime(m.start_time)} {m.title}
                  </div>
                ))}
                {dayTickets.length > 0 && (
                  <div style={{ fontSize: 9, color: '#a78bfa', fontWeight: 500 }}>
                    ✓ {dayTickets.length} ticket{dayTickets.length !== 1 ? 's' : ''}
                  </div>
                )}
                {dayTasks.map(t => (
                  <div key={t.id} style={{
                    fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    background: t.status === 'DONE' ? '#052e16' : t.status === 'IN_PROGRESS' ? '#1a1a0a' : '#1a0a00',
                    color: t.status === 'DONE' ? '#4ade80' : t.status === 'IN_PROGRESS' ? '#fbbf24' : '#fb923c',
                    borderRadius: 3, padding: '1px 4px',
                  }}>
                    {t.status === 'DONE' ? '✓' : t.status === 'IN_PROGRESS' ? '◐' : '○'} {t.title}
                  </div>
                ))}
                {dayMeetings.length > 2 && (
                  <div style={{ fontSize: 9, color: C.dim }}>+{dayMeetings.length - 2} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        {[
          { color: '#fbbf24', label: 'Bank holiday' },
          { color: '#4ade80', label: 'Attendance' },
          { color: '#93c5fd', label: 'Meeting' },
          { color: '#a78bfa', label: 'Ticket resolved' },
          { color: '#fb923c', label: 'Task due' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {label}
          </div>
        ))}
      </div>

      {/* Day panel */}
      {selectedDate && (
        <DayPanel
          date={selectedDateStr}
          events={selectedEvents}
          bankHoliday={holidayMap[selectedDateStr]}
          sessions={selectedSessions}
          onClose={() => setSelectedDate(null)}
          onDeleteMeeting={handleDeleteMeeting}
          isManager={isManager}
        />
      )}

      {showMeetingModal && (
        <MeetingModal
          defaultDate={selectedDateStr}
          agents={agents}
          onSave={() => { setShowMeetingModal(false); loadData(); }}
          onClose={() => setShowMeetingModal(false)}
        />
      )}
    </div>
  );
}
