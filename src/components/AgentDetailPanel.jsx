import { useState, useEffect } from 'react';
import { C, P, ST } from '../constants/theme.js';
import { fmtTime, fmtFull } from '../utils/formatters.js';
import { api } from '../utils/api.js';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const ROLE_LABEL = {
  AGENT: 'Agent', SENIOR_AGENT: 'Senior Agent',
  TEAM_MANAGER: 'Team Manager', SYSTEM_ADMIN: 'System Admin',
};

const tooltipStyle = {
  contentStyle: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text },
  labelStyle: { color: C.muted },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
};

function StatPill({ label, value, color }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || C.text }}>{value ?? '—'}</div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

function PriorityBadge({ p }) {
  const s = P[p] || P.P3;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>{p}</span>;
}

function StatusBadge({ status }) {
  const s = ST[status] || { bg: C.card, text: C.muted };
  return <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: s.bg, color: s.text }}>{status}</span>;
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

export default function AgentDetailPanel({ agentId, onClose, onSelectTicket }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getAgentDetail(agentId)
      .then(setData)
      .finally(() => setLoading(false));
  }, [agentId]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', justifyContent: 'flex-end',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 560, height: '100%',
          background: C.surface, borderLeft: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{data?.agent.full_name ?? '…'}</div>
            {data && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{ROLE_LABEL[data.agent.role]} · {data.agent.email}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ padding: 20, overflowY: 'auto' }}>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
              <StatPill label="Total assigned" value={data.stats.total_assigned} />
              <StatPill label="Active now" value={data.stats.active} color={data.stats.active > 0 ? C.accentLight : C.green} />
              <StatPill label="Resolved" value={data.stats.resolved} color={C.green} />
              <StatPill label="Avg resolution" value={data.stats.avg_resolution_hours != null ? `${data.stats.avg_resolution_hours}h` : null} />
              <StatPill label="Avg satisfaction" value={data.stats.avg_satisfaction != null ? `${data.stats.avg_satisfaction}/5` : null} color="#facc15" />
              <StatPill label="SLA breaches" value={data.stats.sla_breached} color={data.stats.sla_breached > 0 ? '#f87171' : C.green} />
            </div>

            {/* Activity chart */}
            <Section title="Activity — last 14 days">
              <ResponsiveContainer width="100%" height={100}>
                <AreaChart data={data.daily_activity} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="agGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.accent} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fill: C.dim, fontSize: 9 }} axisLine={false} tickLine={false} interval={1} />
                  <YAxis tick={{ fill: C.dim, fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...tooltipStyle} />
                  <Area type="monotone" dataKey="count" stroke={C.accent} strokeWidth={2} fill="url(#agGrad)" name="Actions" />
                </AreaChart>
              </ResponsiveContainer>
            </Section>

            {/* Active tickets */}
            {data.active_tickets.length > 0 && (
              <Section title={`Current work (${data.active_tickets.length})`}>
                {data.active_tickets.map(t => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px', marginBottom: 6,
                    background: C.card, borderRadius: 6,
                    border: `1px solid ${t.sla_breached ? '#7f1d1d' : C.border}`,
                    cursor: 'pointer',
                  }} onClick={() => onSelectTicket && onSelectTicket(t.id)}>
                    <span style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace', flexShrink: 0 }}>{t.ticket_number}</span>
                    <PriorityBadge p={t.priority} />
                    <span style={{ flex: 1, fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    <StatusBadge status={t.status} />
                    <span style={{ fontSize: 11, color: C.dim, flexShrink: 0 }}>{fmtTime(t.created_at)}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* Recent resolved */}
            {data.recent_resolved.length > 0 && (
              <Section title="Recent resolutions">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Ticket', 'Priority', 'Company', 'Time to resolve', 'Rating'].map(h => (
                        <th key={h} style={{ textAlign: 'left', fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_resolved.map(t => (
                      <tr key={t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '8px 0', color: C.dim, fontFamily: 'monospace', fontSize: 11 }}>{t.ticket_number}</td>
                        <td style={{ padding: '8px 4px' }}><PriorityBadge p={t.priority} /></td>
                        <td style={{ padding: '8px 4px', color: C.muted, fontSize: 11 }}>{t.company_name || '—'}</td>
                        <td style={{ padding: '8px 4px', color: C.muted }}>{t.resolution_hours != null ? `${t.resolution_hours}h` : '—'}</td>
                        <td style={{ padding: '8px 0', color: '#facc15' }}>
                          {t.satisfaction_score ? '★'.repeat(t.satisfaction_score) : <span style={{ color: C.dim }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {/* Recent activity log */}
            {data.recent_activity.length > 0 && (
              <Section title="Recent activity">
                {data.recent_activity.slice(0, 15).map(l => (
                  <div key={l.id} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 12, color: C.muted }}>{l.action}</span>
                      <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>{fmtTime(l.timestamp)}</div>
                    </div>
                  </div>
                ))}
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
