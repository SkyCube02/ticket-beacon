import { useState, useEffect } from 'react';
import { C } from '../constants/theme.js';
import { api } from '../utils/api.js';
import { useToast } from '../utils/toast.jsx';
import CompanyProfile from './CompanyProfile.jsx';

const COMPANY_COLORS = ['#2563eb','#7c3aed','#db2777','#059669','#d97706'];

const ROLES = ['AGENT', 'SENIOR_AGENT', 'TEAM_MANAGER', 'SYSTEM_ADMIN'];
const ROLE_LABEL = {
  AGENT: 'Agent',
  SENIOR_AGENT: 'Senior Agent',
  TEAM_MANAGER: 'Team Manager',
  SYSTEM_ADMIN: 'System Admin',
};
const ROLE_COLOR = {
  AGENT: C.muted,
  SENIOR_AGENT: '#60a5fa',
  TEAM_MANAGER: '#c084fc',
  SYSTEM_ADMIN: '#f87171',
};

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

function NewUserModal({ onClose, onCreated }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('AGENT');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const user = await api.createUser({ email, full_name: fullName, role, password });
      onCreated(user);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, width: 420, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '15px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>New Staff Account</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          <Field label="Full name *">
            <input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="e.g. Alex Morgan" style={inputStyle} />
          </Field>
          <Field label="Email *">
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="alex@ticketbeacon.com" style={inputStyle} />
          </Field>
          <Field label="Role">
            <select value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
              {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </Field>
          <Field label="Temporary password *">
            <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" style={inputStyle} minLength={8} />
          </Field>
          {error && (
            <div style={{ fontSize: 12, color: '#f87171', background: '#2d0a0a', border: '1px solid #7f1d1d', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 20px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ padding: '8px 20px', background: submitting ? C.accentDim : C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}>
              {submitting ? 'Creating…' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CompanyManagement({ allUsers, toast, currentUser }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [profileId, setProfileId] = useState(null);

  useEffect(() => {
    api.listAllCompanies()
      .then(data => { setCompanies(data); setLoading(false); })
      .catch(e => { toast(e.message, 'error'); setLoading(false); });
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const company = await api.createCompany({ name: newName.trim() });
      setCompanies(prev => [...prev, company]);
      setNewName('');
      toast(`${company.name} created`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleAgent(company, agentId) {
    const current = company.agent_ids || [];
    const updated = current.includes(agentId)
      ? current.filter(id => id !== agentId)
      : [...current, agentId];
    try {
      const result = await api.setCompanyAgents(company.id, updated);
      setCompanies(prev => prev.map(c => c.id === result.id ? result : c));
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function handleToggleActive(company) {
    try {
      const result = await api.updateCompany(company.id, { name: company.name, is_active: !company.is_active });
      setCompanies(prev => prev.map(c => c.id === result.id ? result : c));
      toast(`${result.name} ${result.is_active ? 'activated' : 'deactivated'}`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const inputStyle = {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
    padding: '7px 10px', color: C.text, fontSize: 13, outline: 'none',
  };

  return (
    <>
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <form onSubmit={handleCreate} style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New company name…"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button type="submit" disabled={creating || !newName.trim()} style={{
          padding: '7px 16px', background: C.accent, border: 'none', borderRadius: 6,
          color: C.white, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          {creating ? 'Adding…' : '+ Add Company'}
        </button>
      </form>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading…</div>
      ) : companies.map((company, i) => {
        const color = COMPANY_COLORS[i % COMPANY_COLORS.length];
        const isExpanded = expandedId === company.id;
        return (
          <div key={company.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: company.is_active ? 1 : 0.5 }}>
            <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span
                onClick={() => setProfileId(company.id)}
                style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.text, cursor: 'pointer', textDecoration: 'underline', textDecorationColor: C.border }}
                onMouseEnter={e => e.target.style.color = C.accentLight}
                onMouseLeave={e => e.target.style.color = C.text}
              >{company.name}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{company.agent_ids?.length || 0} agents · {company.ticket_count} tickets</span>
              <select
                value={company.priority_tier || 1}
                onChange={async e => {
                  const tier = parseInt(e.target.value);
                  try {
                    const result = await api.updateCompany(company.id, { name: company.name, priority_tier: tier });
                    setCompanies(prev => prev.map(c => c.id === result.id ? result : c));
                    toast(`${company.name} tier updated`, 'success');
                  } catch (err) { toast(err.message, 'error'); }
                }}
                style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: '3px 6px', color: C.text, fontSize: 11, cursor: 'pointer' }}
                title="Priority tier affects auto-priority suggestions"
              >
                <option value={1}>Standard</option>
                <option value={2}>Premium</option>
                <option value={3}>Critical</option>
              </select>
              <button
                onClick={() => setExpandedId(isExpanded ? null : company.id)}
                style={{ padding: '4px 12px', background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 4, color: C.accentLight, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                {isExpanded ? 'Done' : 'Manage agents'}
              </button>
              <button
                onClick={() => handleToggleActive(company)}
                style={{ padding: '4px 12px', background: 'transparent', border: `1px solid ${company.is_active ? '#7f1d1d' : C.border}`, borderRadius: 4, color: company.is_active ? '#f87171' : C.muted, fontSize: 11, cursor: 'pointer' }}
              >
                {company.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
            {isExpanded && (
              <div style={{ padding: '0 20px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {allUsers.map(agent => {
                  const assigned = company.agent_ids?.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      onClick={() => handleToggleAgent(company, agent.id)}
                      style={{
                        padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        background: assigned ? color + '22' : C.card,
                        border: `1px solid ${assigned ? color : C.border}`,
                        color: assigned ? color : C.muted,
                      }}
                    >
                      {assigned ? '✓ ' : ''}{agent.full_name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
    {profileId && (
      <CompanyProfile
        companyId={profileId}
        currentUser={currentUser}
        onClose={() => setProfileId(null)}
      />
    )}
    </>
  );
}

export default function AccountManagement({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [adminTab, setAdminTab] = useState('users');
  const toast = useToast();

  useEffect(() => {
    api.listUsers()
      .then(data => { setUsers(data); setLoading(false); })
      .catch(e => { toast(e.message, 'error'); setLoading(false); });
  }, []);

  async function handleToggleActive(user) {
    try {
      const updated = await api.updateUser(user.id, { is_active: !user.is_active });
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      toast(`${updated.full_name} ${updated.is_active ? 'reactivated' : 'deactivated'}`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function handleGenerateOverride(user) {
    try {
      const result = await api.generateMfaOverride(user.id);
      toast(`Override code generated — give this to ${user.full_name} (expires in 30 min)`, 'success');
      alert(`2FA Override Code for ${user.full_name}:\n\n${result.override_code}\n\nExpires in 30 minutes. Share this securely.`);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function handleUnlockMfa(user) {
    if (!window.confirm(`Unlock ${user.full_name}'s account and reset their 2FA? They will need to re-enrol on next login.`)) return;
    try {
      await api.unlockMfaRestriction(user.id);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: true } : u));
      toast(`${user.full_name} unlocked — 2FA reset`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function handleRoleChange(user, role) {
    try {
      const updated = await api.updateUser(user.id, { role });
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      toast(`${updated.full_name} → ${role.replace('_', ' ')}`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const selectStyle = {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 4,
    padding: '3px 6px', color: C.text, fontSize: 12, outline: 'none', cursor: 'pointer',
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 0 }}>
          {['users', 'companies'].map(tab => (
            <button key={tab} onClick={() => setAdminTab(tab)} style={{
              padding: '6px 16px', background: 'none',
              border: 'none', borderBottom: adminTab === tab ? `2px solid ${C.accent}` : '2px solid transparent',
              color: adminTab === tab ? C.accentLight : C.muted,
              fontSize: 13, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
            }}>{tab}</button>
          ))}
        </div>
        {adminTab === 'users' && (
          <button
            onClick={() => setShowNew(true)}
            style={{ padding: '7px 16px', background: C.accent, color: C.white, border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            + New account
          </button>
        )}
      </div>

      {adminTab === 'companies' ? (
        <CompanyManagement allUsers={users} toast={toast} currentUser={currentUser} />
      ) : (
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: 13 }}>Loading…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Name', 'Email', 'Role', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 20px', fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const isSelf = u.id === currentUser.id;
                return (
                  <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}`, opacity: u.is_active ? 1 : 0.45 }}>
                    <td style={{ padding: '12px 20px', color: C.text, fontWeight: 500 }}>{u.full_name}</td>
                    <td style={{ padding: '12px 20px', color: C.muted }}>{u.email}</td>
                    <td style={{ padding: '12px 20px' }}>
                      {isSelf ? (
                        <span style={{ fontSize: 12, color: ROLE_COLOR[u.role] }}>{ROLE_LABEL[u.role]}</span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={e => handleRoleChange(u, e.target.value)}
                          style={{ ...selectStyle, color: ROLE_COLOR[u.role] }}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                        background: u.is_active ? '#052010' : C.card,
                        color: u.is_active ? '#4ade80' : C.dim,
                      }}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 20px' }}>
                      {!isSelf && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => handleToggleActive(u)}
                            style={{
                              padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              background: 'transparent', borderRadius: 4,
                              border: `1px solid ${u.is_active ? '#7f1d1d' : C.border}`,
                              color: u.is_active ? '#f87171' : C.muted,
                            }}
                          >
                            {u.is_active ? 'Deactivate' : 'Reactivate'}
                          </button>
                          {u.mfa_enabled && (
                            <button
                              onClick={() => handleGenerateOverride(u)}
                              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'transparent', borderRadius: 4, border: `1px solid #854d0e`, color: '#fbbf24' }}
                            >
                              2FA override
                            </button>
                          )}
                          {u.mfa_restricted && (
                            <button
                              onClick={() => handleUnlockMfa(u)}
                              style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'transparent', borderRadius: 4, border: `1px solid #166534`, color: '#4ade80' }}
                            >
                              Unlock 2FA
                            </button>
                          )}
                        </div>
                      )}
                      {isSelf && <span style={{ fontSize: 11, color: C.dim }}>Current user</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      )}

      {showNew && (
        <NewUserModal
          onClose={() => setShowNew(false)}
          onCreated={user => { setUsers(prev => [...prev, user]); setShowNew(false); }}
        />
      )}
    </div>
  );
}
