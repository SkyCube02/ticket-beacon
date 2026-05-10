import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { C, P, ST } from '../constants/theme.js';
import { api } from '../utils/api.js';
import AgentDetailPanel from './AgentDetailPanel.jsx';

// ── Shared primitives ─────────────────────────────────────────────────────────

function Card({ title, children, span = 1 }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: 18,
      gridColumn: `span ${span}`,
    }}>
      {title && (
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 14 }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: 18,
    }}>
      <div style={{ fontSize: 11, color: C.muted, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: color || C.text, lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: C.dim, marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

function CssBar({ value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ flex: 1, height: 6, background: C.card, borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
  );
}

const tooltipStyle = {
  contentStyle: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, color: C.text },
  labelStyle: { color: C.muted },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
};

// ── Sub-sections ──────────────────────────────────────────────────────────────

function SlaCompliance({ data }) {
  const priorities = ['P1', 'P2', 'P3', 'P4', 'P5'];
  return (
    <Card title="SLA Compliance — % acknowledged within window" span={2}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {priorities.map(p => {
          const val = data[p];
          const color = val == null ? C.dim : val >= 90 ? C.green : val >= 60 ? C.yellow : C.red;
          return (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, width: 24, textAlign: 'center',
                padding: '2px 0', borderRadius: 3,
                background: P[p].bg, color: P[p].text,
              }}>{p}</span>
              <CssBar value={val ?? 0} max={100} color={color} />
              <span style={{ fontSize: 12, fontWeight: 600, color, width: 42, textAlign: 'right' }}>
                {val != null ? `${val}%` : 'N/A'}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TicketsByStatus({ data }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(e => e[1]), 1);
  return (
    <Card title="Tickets by status">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(([status, count]) => {
          const color = ST[status]?.text || C.muted;
          return (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: C.muted, width: 110, flexShrink: 0 }}>{status}</span>
              <CssBar value={count} max={max} color={color} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text, width: 24, textAlign: 'right' }}>{count}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function DailyVolume({ data }) {
  return (
    <Card title="Ticket volume — last 14 days" span={3}>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={C.accent} stopOpacity={0.3} />
              <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
          <YAxis tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip {...tooltipStyle} />
          <Area type="monotone" dataKey="count" stroke={C.accent} strokeWidth={2} fill="url(#volGrad)" name="Tickets" />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

function SatisfactionDist({ dist, avg }) {
  const data = Object.entries(dist).map(([star, count]) => ({ star: `★${star}`, count }));
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const starColors = { '★1': '#ef4444', '★2': '#f97316', '★3': '#eab308', '★4': '#84cc16', '★5': '#22c55e' };
  return (
    <Card title={`Satisfaction ratings${avg ? ` — avg ${avg}/5` : ''}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.reverse().map(({ star, count }) => (
          <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: starColors[star], width: 28, flexShrink: 0 }}>{star}</span>
            <CssBar value={count} max={maxCount} color={starColors[star]} />
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text, width: 20, textAlign: 'right' }}>{count}</span>
          </div>
        ))}
      </div>
      {avg && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
          <span style={{ fontSize: 24, color: '#facc15', letterSpacing: 4 }}>
            {'★'.repeat(Math.round(avg))}{'☆'.repeat(5 - Math.round(avg))}
          </span>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Average: {avg} / 5</div>
        </div>
      )}
    </Card>
  );
}

function AgentTable({ agents, onSelectAgent }) {
  return (
    <Card title="Agent performance — click an agent for full detail" span={3}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {['Agent', 'Role', 'Assigned', 'Resolved', 'Avg resolution', 'Satisfaction'].map(h => (
              <th key={h} style={{ textAlign: 'left', color: C.muted, fontWeight: 700, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {agents.map((a, i) => (
            <tr
              key={a.id}
              onClick={() => onSelectAgent(a.id)}
              style={{ borderBottom: i < agents.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = C.card}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <td style={{ padding: '10px 0', color: C.accentLight, fontWeight: 600 }}>{a.name}</td>
              <td style={{ padding: '10px 0', color: C.muted }}>{a.role.replace('_', ' ')}</td>
              <td style={{ padding: '10px 0', color: C.text }}>{a.assigned}</td>
              <td style={{ padding: '10px 0', color: a.resolved > 0 ? C.green : C.dim }}>{a.resolved}</td>
              <td style={{ padding: '10px 0', color: C.muted }}>
                {a.avg_resolution_hours != null ? `${a.avg_resolution_hours}h` : '—'}
              </td>
              <td style={{ padding: '10px 0' }}>
                {a.avg_satisfaction != null ? (
                  <span style={{ color: '#facc15' }}>
                    {'★'.repeat(Math.round(a.avg_satisfaction))} <span style={{ color: C.muted }}>{a.avg_satisfaction}/5</span>
                  </span>
                ) : <span style={{ color: C.dim }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ByPriorityBar({ data, avgRes }) {
  const chartData = ['P1','P2','P3','P4','P5'].map(p => ({
    priority: p,
    tickets: data[p] || 0,
    avg_h: avgRes[p],
    color: P[p].text,
  }));
  return (
    <Card title="Tickets by priority" span={2}>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <XAxis dataKey="priority" tick={{ fill: C.dim, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            {...tooltipStyle}
            formatter={(value, name, props) => {
              const avgH = props.payload.avg_h;
              return [value, `Tickets${avgH != null ? ` · avg ${avgH}h to resolve` : ''}`];
            }}
          />
          <Bar dataKey="tickets" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportsDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [exporting, setExporting] = useState(null);

  async function handleExport(format) {
    setExporting(format);
    try { await api.downloadReport(format); }
    catch (e) { alert('Export failed: ' + e.message); }
    finally { setExporting(null); }
  }

  useEffect(() => {
    api.getReportSummary()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>
      Loading report…
    </div>
  );

  if (error) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', fontSize: 13 }}>
      {error}
    </div>
  );

  const breachRate = data.total > 0 ? `${Math.round(data.breached / data.total * 100)}% breach rate` : null;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: -0.3 }}>
          Reporting &amp; Analytics
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['csv', 'pdf'].map(fmt => (
            <button key={fmt} onClick={() => handleExport(fmt)} disabled={!!exporting}
              style={{ padding: '7px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 12, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {exporting === fmt ? '…' : `Export ${fmt.toUpperCase()}`}
            </button>
          ))}
        </div>
      </div>

      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        <StatCard label="Total tickets" value={data.total} />
        <StatCard label="Open tickets" value={data.open} color={data.open > 0 ? C.accentLight : C.green} />
        <StatCard label="SLA breaches" value={data.breached} sub={breachRate} color={data.breached > 0 ? '#f87171' : C.green} />
        <StatCard
          label="Avg satisfaction"
          value={data.avg_satisfaction != null ? `${data.avg_satisfaction}/5` : '—'}
          sub={data.avg_satisfaction != null ? '★'.repeat(Math.round(data.avg_satisfaction)) : 'No ratings yet'}
          color={data.avg_satisfaction >= 4 ? C.green : data.avg_satisfaction >= 3 ? C.yellow : data.avg_satisfaction ? C.red : C.dim}
        />
      </div>

      {/* Charts row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
        <DailyVolume data={data.daily_volume} />
      </div>

      {/* Charts row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
        <SlaCompliance data={data.sla_compliance} />
        <TicketsByStatus data={data.by_status} />
      </div>

      {/* Charts row 3 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
        <ByPriorityBar data={data.by_priority} avgRes={data.avg_resolution_hours} />
        <SatisfactionDist dist={data.satisfaction_dist} avg={data.avg_satisfaction} />
      </div>

      {/* Agent table */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
        <AgentTable agents={data.agent_stats} onSelectAgent={setSelectedAgentId} />
      </div>

      {selectedAgentId && (
        <AgentDetailPanel
          agentId={selectedAgentId}
          onClose={() => setSelectedAgentId(null)}
        />
      )}
    </div>
  );
}
