import { useState, useEffect } from 'react';
import { C } from '../constants/theme.js';
import { api } from '../utils/api.js';
import { atLeast } from '../utils/permissions.js';

const PRIORITY_COLOR = { P1: '#ef4444', P2: '#f97316', P3: '#eab308', P4: '#60a5fa', P5: C.muted };
const STATUS_ACTIVE = ['OPEN', 'ACKNOWLEDGED', 'IN PROGRESS', 'PENDING CLIENT', 'ESCALATED', 'SLA BREACHED'];

function Widget({ title, icon, onNav, nav, children, span = 1 }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
      overflow: 'hidden', gridColumn: `span ${span}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, color: C.accent }}>{icon}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</span>
        </div>
        {nav && (
          <button onClick={() => onNav(nav)} style={{
            background: 'transparent', border: 'none', color: C.accent,
            fontSize: 11, cursor: 'pointer', padding: 0,
          }}>
            View all →
          </button>
        )}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function StatCard({ label, value, sub, color, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: C.card, borderRadius: 8, padding: '14px 16px',
      border: `1px solid ${C.border}`, cursor: onClick ? 'pointer' : 'default',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = C.accent)}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = C.border)}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color: color || C.text }}>{value}</div>
      <div style={{ fontSize: 12, color: C.text, fontWeight: 500, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function TicketRow({ ticket, onNav }) {
  const pc = PRIORITY_COLOR[ticket.priority] || C.muted;
  return (
    <div onClick={() => onNav('tickets', ticket.id)} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer',
    }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <span style={{ fontSize: 10, fontWeight: 700, color: pc, width: 22, flexShrink: 0 }}>{ticket.priority}</span>
      <span style={{ flex: 1, fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.title}</span>
      <span style={{ fontSize: 10, color: ticket.sla_breached ? '#ef4444' : C.muted, flexShrink: 0 }}>
        {ticket.sla_breached ? 'BREACHED' : ticket.status}
      </span>
    </div>
  );
}

// ── Agent Dashboard ───────────────────────────────────────────────────────────

function AgentDashboard({ user, onNav }) {
  const [tickets, setTickets] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const isManager = atLeast(user, 'TEAM_MANAGER');

  useEffect(() => {
    const calls = [
      api.listTickets(),
      api.listTasks(),
      api.listAnnouncements(),
    ];
    if (isManager) calls.push(api.getReportSummary());

    Promise.all(calls).then(([t, tk, a, r]) => {
      setTickets(t || []);
      setTasks(tk || []);
      setAnnouncements(a || []);
      if (r) setReport(r);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: C.muted, fontSize: 13 }}>
      Loading dashboard…
    </div>
  );

  const active = tickets.filter(t => STATUS_ACTIVE.includes(t.status));
  const mine = active.filter(t => t.assignee_id === user.id);
  const breached = active.filter(t => t.sla_breached);
  const critical = active.filter(t => ['P1', 'P2'].includes(t.priority));
  const myTasks = tasks.filter(t => t.assignee_id === user.id && t.status !== 'DONE');
  const latestAnnouncement = announcements[0] || null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

      {/* Ticket health — full width */}
      <Widget title="Ticket Health" icon="◈" nav="tickets" onNav={onNav} span={3}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <StatCard label="Active tickets" value={active.length} onClick={() => onNav('tickets')} />
          <StatCard label="SLA breached" value={breached.length} color={breached.length > 0 ? '#ef4444' : C.text} onClick={() => onNav('tickets')} />
          <StatCard label="P1 / P2 critical" value={critical.length} color={critical.length > 0 ? '#f97316' : C.text} onClick={() => onNav('tickets')} />
          <StatCard label="Assigned to me" value={mine.length} color={C.accentLight} onClick={() => onNav('tickets')} />
        </div>
      </Widget>

      {/* My queue */}
      <Widget title="My Queue" icon="▤" nav="tickets" onNav={onNav} span={2}>
        {mine.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '12px 0' }}>No tickets assigned to you</div>
        ) : (
          <>
            {mine.slice(0, 6).map(t => <TicketRow key={t.id} ticket={t} onNav={onNav} />)}
            {mine.length > 6 && <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>+{mine.length - 6} more</div>}
          </>
        )}
      </Widget>

      {/* My tasks + announcement stacked */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Widget title="My Tasks" icon="▣" nav="tasks" onNav={onNav}>
          {myTasks.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '8px 0' }}>No pending tasks</div>
          ) : (
            myTasks.slice(0, 4).map(t => (
              <div key={t.id} onClick={() => onNav('tasks')} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                <span style={{ fontSize: 10, marginTop: 2, color: t.status === 'IN_PROGRESS' ? C.accent : C.muted }}>■</span>
                <span style={{ fontSize: 12, color: C.text, flex: 1 }}>{t.title}</span>
              </div>
            ))
          )}
        </Widget>

        {latestAnnouncement && (
          <Widget title="Latest Announcement" icon="◎" nav="announcements" onNav={onNav}>
            <div style={{ fontSize: 11, fontWeight: 700, color: latestAnnouncement.category === 'SECURITY' ? '#f87171' : C.accent, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {latestAnnouncement.category}
            </div>
            <div style={{ fontSize: 13, color: C.text, fontWeight: 600, marginBottom: 4 }}>{latestAnnouncement.title}</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {latestAnnouncement.content}
            </div>
          </Widget>
        )}
      </div>

      {/* Manager extras */}
      {isManager && report && (
        <>
          <Widget title="SLA Compliance" icon="▦" nav="reports" onNav={onNav}>
            {(() => {
              const vals = Object.values(report.sla_compliance || {}).filter(v => v != null);
              const rate = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
              const resVals = Object.values(report.avg_resolution_hours || {}).filter(v => v != null);
              const avgRes = resVals.length ? (resVals.reduce((a, b) => a + b, 0) / resVals.length).toFixed(1) : null;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <StatCard label="Compliance rate" value={`${rate}%`} color={rate >= 80 ? '#4ade80' : '#f87171'} onClick={() => onNav('reports')} />
                  <StatCard label="Avg resolution" value={avgRes != null ? `${avgRes}h` : '—'} onClick={() => onNav('reports')} />
                </div>
              );
            })()}
          </Widget>

          <Widget title="Team Load" icon="◉" nav="reports" onNav={onNav} span={2}>
            {(report.agent_stats || []).slice(0, 5).map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.accentLight, flexShrink: 0 }}>
                  {a.name?.[0]?.toUpperCase()}
                </div>
                <span style={{ flex: 1, fontSize: 12, color: C.text }}>{a.name}</span>
                <span style={{ fontSize: 11, color: C.muted }}>{a.assigned ?? 0} assigned</span>
                <span style={{ fontSize: 11, color: C.dim }}>{a.resolved ?? 0} resolved</span>
              </div>
            ))}
          </Widget>
        </>
      )}

      {/* Quick nav */}
      <Widget title="Quick Access" icon="◇" span={3} onNav={onNav}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
          {[
            { label: 'Tickets', icon: '◈', view: 'tickets' },
            { label: 'Knowledge Base', icon: '≡', view: 'kb' },
            { label: 'Announcements', icon: '◎', view: 'announcements' },
            { label: 'Tasks', icon: '▣', view: 'tasks' },
            ...(isManager ? [{ label: 'Reports', icon: '▦', view: 'reports' }] : []),
            { label: 'Settings', icon: '◧', view: 'settings' },
          ].map(({ label, icon, view }) => (
            <button key={view} onClick={() => onNav(view)} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: '12px 8px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 6, color: C.muted, fontSize: 11, fontWeight: 500,
              transition: 'border-color 0.15s, color 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accentLight; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
            >
              <span style={{ fontSize: 18 }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </Widget>
    </div>
  );
}

// ── Client Dashboard ──────────────────────────────────────────────────────────

function ClientDashboardWidgets({ user, onNav }) {
  const [tickets, setTickets] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);

  const isManager = user.role === 'CLIENT_MANAGER';

  useEffect(() => {
    Promise.all([
      api.listTickets(),
      api.listAnnouncements(),
      api.listArticles(),
    ]).then(([t, a, kb]) => {
      setTickets(t || []);
      setAnnouncements(a || []);
      setArticles(kb || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: C.muted, fontSize: 13 }}>
      Loading dashboard…
    </div>
  );

  const active = tickets.filter(t => STATUS_ACTIVE.includes(t.status));
  const resolved = tickets.filter(t => t.status === 'RESOLVED' || t.status === 'CLOSED');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>

      {/* Ticket summary */}
      <Widget title="My Tickets" icon="◈" nav="tickets" onNav={onNav} span={3}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: active.length ? 16 : 0 }}>
          <StatCard label="Open tickets" value={active.length} color={active.length > 0 ? C.accentLight : C.text} onClick={() => onNav('tickets')} />
          <StatCard label="Resolved" value={resolved.length} onClick={() => onNav('tickets')} />
          <StatCard label="Total raised" value={tickets.length} onClick={() => onNav('tickets')} />
        </div>
        {active.slice(0, 4).map(t => <TicketRow key={t.id} ticket={t} onNav={onNav} />)}
      </Widget>

      {/* Announcements */}
      <Widget title="Announcements" icon="◎" nav="announcements" onNav={onNav} span={2}>
        {announcements.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '12px 0' }}>No announcements</div>
        ) : announcements.slice(0, 3).map(a => (
          <div key={a.id} onClick={() => onNav('announcements')} style={{ padding: '10px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: a.category === 'SECURITY' ? '#f87171' : C.accent, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
              {a.category}
            </div>
            <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{a.title}</div>
          </div>
        ))}
      </Widget>

      {/* KB spotlight */}
      <Widget title="Knowledge Base" icon="≡" nav="kb" onNav={onNav}>
        {articles.length === 0 ? (
          <div style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '12px 0' }}>No articles yet</div>
        ) : articles.slice(0, 4).map(a => (
          <div key={a.id} onClick={() => onNav('kb')} style={{ padding: '8px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
            <div style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{a.title}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{a.category}</div>
          </div>
        ))}
      </Widget>

      {/* Quick nav */}
      <Widget title="Quick Access" icon="◇" span={3} onNav={onNav}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { label: 'My Tickets', icon: '◈', view: 'tickets' },
            { label: 'Knowledge Base', icon: '≡', view: 'kb' },
            { label: 'Announcements', icon: '◎', view: 'announcements' },
          ].map(({ label, icon, view }) => (
            <button key={view} onClick={() => onNav(view)} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: '14px 8px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 6, color: C.muted, fontSize: 12, fontWeight: 500,
              transition: 'border-color 0.15s, color 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accentLight; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
            >
              <span style={{ fontSize: 22 }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </Widget>
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

const CLIENT_ROLES = ['CLIENT_USER', 'CLIENT_MANAGER'];

export default function Dashboard({ user, onNav }) {
  const isClient = CLIENT_ROLES.includes(user.role);
  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: C.bg }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: -0.3 }}>
          {greeting()}, {user.full_name.split(' ')[0]}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          {user.company_name && ` · ${user.company_name}`}
        </div>
      </div>

      {isClient
        ? <ClientDashboardWidgets user={user} onNav={onNav} />
        : <AgentDashboard user={user} onNav={onNav} />
      }
    </div>
  );
}
