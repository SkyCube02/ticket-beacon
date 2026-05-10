import { useState } from 'react';
import { C } from '../constants/theme.js';
import { api } from '../utils/api.js';
import { useToast } from '../utils/toast.jsx';

const STEPS = ['Welcome', 'Add Staff', 'Add Companies', 'Configure', 'Done'];

function StepDots({ current }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 28 }}>
      {STEPS.map((label, i) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: i < current ? C.accent : i === current ? C.accent : C.card,
            border: `2px solid ${i <= current ? C.accent : C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700,
            color: i <= current ? C.white : C.dim,
          }}>
            {i < current ? '✓' : i + 1}
          </div>
          <span style={{ fontSize: 9, color: i === current ? C.accentLight : C.dim, fontWeight: i === current ? 700 : 400, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

const inp = {
  width: '100%', background: C.card, border: `1px solid ${C.border}`,
  borderRadius: 6, padding: '8px 10px', color: C.text,
  fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 10,
};

function StepWelcome({ onNext }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>◈</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 10 }}>Welcome to Ticket Beacon</div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 28 }}>
        Let's get your helpdesk set up in a few quick steps.<br />
        You can always change these settings later from the Admin panel.
      </div>
      <button onClick={onNext} style={{ padding: '10px 28px', background: C.accent, border: 'none', borderRadius: 8, color: C.white, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        Get started →
      </button>
    </div>
  );
}

function StepStaff({ onNext, onSkip }) {
  const toast = useToast();
  const [agents, setAgents] = useState([{ name: '', email: '', role: 'AGENT', password: '' }]);
  const [saving, setSaving] = useState(false);

  function addRow() { setAgents(a => [...a, { name: '', email: '', role: 'AGENT', password: '' }]); }
  function update(i, field, val) { setAgents(a => a.map((r, idx) => idx === i ? { ...r, [field]: val } : r)); }
  function remove(i) { setAgents(a => a.filter((_, idx) => idx !== i)); }

  async function handleSave() {
    const valid = agents.filter(a => a.name.trim() && a.email.trim() && a.password.trim());
    if (!valid.length) { onSkip(); return; }
    setSaving(true);
    let created = 0;
    for (const a of valid) {
      try {
        await api.createUser({ full_name: a.name.trim(), email: a.email.trim(), role: a.role, password: a.password.trim() });
        created++;
      } catch (err) {
        toast(`${a.email}: ${err.message}`, 'error');
      }
    }
    if (created) toast(`${created} staff account${created !== 1 ? 's' : ''} created`, 'success');
    setSaving(false);
    onNext();
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>Add your first agents</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>Create staff accounts. You can add more later in Admin → Users.</div>
      {agents.map((a, i) => (
        <div key={i} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input value={a.name} onChange={e => update(i, 'name', e.target.value)} placeholder="Full name" style={{ ...inp, marginBottom: 0 }} />
            <input value={a.email} onChange={e => update(i, 'email', e.target.value)} placeholder="email@company.com" type="email" style={{ ...inp, marginBottom: 0 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
            <input value={a.password} onChange={e => update(i, 'password', e.target.value)} placeholder="Temporary password" type="password" style={{ ...inp, marginBottom: 0 }} />
            <select value={a.role} onChange={e => update(i, 'role', e.target.value)} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', color: C.text, fontSize: 12, outline: 'none' }}>
              <option value="AGENT">Agent</option>
              <option value="SENIOR_AGENT">Senior Agent</option>
              <option value="TEAM_MANAGER">Team Manager</option>
            </select>
            <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: C.dim, fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>×</button>
          </div>
        </div>
      ))}
      <button onClick={addRow} style={{ width: '100%', padding: '8px', background: 'transparent', border: `1px dashed ${C.border}`, borderRadius: 6, color: C.dim, fontSize: 12, cursor: 'pointer', marginBottom: 20 }}>+ Add another</button>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onSkip} style={{ padding: '8px 18px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Skip</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save & continue →'}
        </button>
      </div>
    </div>
  );
}

function StepCompanies({ onNext, onSkip }) {
  const toast = useToast();
  const [companies, setCompanies] = useState([{ name: '' }]);
  const [saving, setSaving] = useState(false);

  function addRow() { setCompanies(c => [...c, { name: '' }]); }
  function update(i, val) { setCompanies(c => c.map((r, idx) => idx === i ? { name: val } : r)); }
  function remove(i) { setCompanies(c => c.filter((_, idx) => idx !== i)); }

  async function handleSave() {
    const valid = companies.filter(c => c.name.trim());
    if (!valid.length) { onSkip(); return; }
    setSaving(true);
    let created = 0;
    for (const c of valid) {
      try {
        await api.createCompany({ name: c.name.trim() });
        created++;
      } catch (err) {
        toast(`${c.name}: ${err.message}`, 'error');
      }
    }
    if (created) toast(`${created} compan${created !== 1 ? 'ies' : 'y'} created`, 'success');
    setSaving(false);
    onNext();
  }

  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>Add client companies</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 18 }}>Add the organisations your team supports. You can add more in Admin → Companies.</div>
      {companies.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <input value={c.name} onChange={e => update(i, e.target.value)} placeholder="Company name" style={{ ...inp, marginBottom: 0, flex: 1 }} />
          <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: C.dim, fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>×</button>
        </div>
      ))}
      <button onClick={addRow} style={{ width: '100%', padding: '8px', background: 'transparent', border: `1px dashed ${C.border}`, borderRadius: 6, color: C.dim, fontSize: 12, cursor: 'pointer', marginBottom: 20 }}>+ Add another</button>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onSkip} style={{ padding: '8px 18px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Skip</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving…' : 'Save & continue →'}
        </button>
      </div>
    </div>
  );
}

function StepConfigure({ onNext }) {
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>Quick configuration</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>These can all be changed in Settings at any time.</div>
      {[
        ['P1 / P2 SLA window', '2 minutes (demo mode — change for production)'],
        ['P3–P5 SLA window', '30 minutes (demo mode — change for production)'],
        ['Auto-refresh', 'Every 30 seconds'],
        ['Session timeout', '30 minutes of inactivity'],
        ['Ticket retention', 'Auto-delete closed tickets after 12 months'],
      ].map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: C.card, borderRadius: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: C.text }}>{label}</span>
          <span style={{ fontSize: 12, color: C.muted }}>{value}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <button onClick={onNext} style={{ padding: '8px 22px', background: C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Continue →
        </button>
      </div>
    </div>
  );
}

function StepDone({ onComplete }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10 }}>Ticket Beacon is ready</div>
      <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 28 }}>
        Your helpdesk is configured. Agents can log in at the Agent Portal,<br />
        and client users at the Client Portal.
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px', marginBottom: 24, textAlign: 'left' }}>
        {[
          ['Admin panel', 'Manage users, companies, and agent assignments'],
          ['Settings', 'Teams webhook, Twilio SMS, session timeout'],
          ['Knowledge Base', 'Create articles for clients to self-serve'],
          ['Announcements', 'Broadcast updates and security alerts'],
        ].map(([title, desc]) => (
          <div key={title} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <span style={{ color: C.accentLight, fontWeight: 700, flexShrink: 0 }}>▸</span>
            <div>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{title}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{desc}</div>
            </div>
          </div>
        ))}
      </div>
      <button onClick={onComplete} style={{ padding: '10px 28px', background: C.accent, border: 'none', borderRadius: 8, color: C.white, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        Go to dashboard →
      </button>
    </div>
  );
}

export default function OnboardingWizard({ currentUser, onComplete }) {
  const [step, setStep] = useState(0);
  const next = () => setStep(s => s + 1);

  const stepComponents = [
    <StepWelcome onNext={next} />,
    <StepStaff onNext={next} onSkip={next} />,
    <StepCompanies onNext={next} onSkip={next} />,
    <StepConfigure onNext={next} />,
    <StepDone onComplete={onComplete} />,
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, width: 540, padding: 36, maxHeight: '90vh', overflowY: 'auto' }}>
        <StepDots current={step} />
        {stepComponents[step]}
      </div>
    </div>
  );
}
