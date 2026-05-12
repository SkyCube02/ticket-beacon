import { useState, useEffect } from 'react';
import { C } from '../constants/theme.js';
import { api } from '../utils/api.js';
import { useToast } from '../utils/toast.jsx';

const TIER_LABEL = { 1: 'Standard', 2: 'Premium', 3: 'Critical' };
const TIER_COLOR = { 1: C.muted, 2: '#60a5fa', 3: '#f87171' };

const inp = {
  width: '100%', background: C.card, border: `1px solid ${C.border}`,
  borderRadius: 6, padding: '7px 10px', color: C.text,
  fontSize: 12, outline: 'none', boxSizing: 'border-box',
};

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${C.border}` }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 10, color: C.muted, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  );
}

function ReadField({ label, value, href }) {
  return (
    <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
      <span style={{ fontSize: 11, color: C.muted, width: 120, flexShrink: 0 }}>{label}</span>
      {href
        ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.accent, textDecoration: 'none' }}>{value || '—'}</a>
        : <span style={{ fontSize: 12, color: value ? C.text : C.dim }}>{value || '—'}</span>
      }
    </div>
  );
}

export default function CompanyProfile({ companyId, currentUser, onClose }) {
  const toast = useToast();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const canEdit = ['SYSTEM_ADMIN', 'TEAM_MANAGER'].includes(currentUser?.role);

  useEffect(() => {
    api.getCompany(companyId)
      .then(c => { setCompany(c); setForm(c); setLoading(false); })
      .catch(e => { toast(e.message, 'error'); onClose(); });
  }, [companyId]);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.updateCompany(companyId, {
        name: form.name,
        is_active: form.is_active,
        priority_tier: form.priority_tier,
        phone: form.phone || null,
        website: form.website || null,
        address: form.address || null,
        contract_start: form.contract_start || null,
        contract_end: form.contract_end || null,
        sla_notes: form.sla_notes || null,
        escalation_contact: form.escalation_contact || null,
        escalation_phone: form.escalation_phone || null,
        escalation_email: form.escalation_email || null,
        notes: form.notes || null,
      });
      setCompany(updated);
      setForm(updated);
      setEditing(false);
      toast('Company profile saved', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }}
      />

      {/* Panel */}
      <div style={{
        position: 'relative', width: 480, height: '100%',
        background: C.surface, borderLeft: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column', overflowY: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            {loading ? (
              <div style={{ fontSize: 16, color: C.muted }}>Loading…</div>
            ) : (
              <>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{company.name}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: TIER_COLOR[company.priority_tier] }}>
                    {TIER_LABEL[company.priority_tier]} tier
                  </span>
                  <span style={{ fontSize: 11, color: company.is_active ? '#4ade80' : C.muted }}>
                    ● {company.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </>
            )}
          </div>
          {!loading && canEdit && !editing && (
            <button onClick={() => setEditing(true)} style={{ padding: '6px 14px', background: C.accentDim, border: `1px solid ${C.accent}`, borderRadius: 6, color: C.accentLight, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Edit
            </button>
          )}
          {editing && (
            <>
              <button onClick={handleSave} disabled={saving} style={{ padding: '6px 14px', background: C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => { setForm(company); setEditing(false); }} style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
            </>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>×</button>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
              {[
                { label: 'Open tickets', value: company.open_tickets ?? 0, color: company.open_tickets > 0 ? C.accentLight : C.text },
                { label: 'SLA breached', value: company.breached_tickets ?? 0, color: company.breached_tickets > 0 ? '#f87171' : C.text },
                { label: 'Total tickets', value: company.ticket_count ?? 0 },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ background: C.card, borderRadius: 8, padding: '12px 14px', border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: color || C.text }}>{value}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Contact */}
            <Section title="Contact">
              {editing ? (
                <>
                  <Field label="Phone"><input value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+44 1302 000000" style={inp} /></Field>
                  <Field label="Website"><input value={form.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://example.com" style={inp} /></Field>
                  <Field label="Address"><textarea value={form.address || ''} onChange={e => set('address', e.target.value)} placeholder="123 Business Park, Sheffield, S1 1AA" rows={2} style={{ ...inp, resize: 'vertical' }} /></Field>
                </>
              ) : (
                <>
                  <ReadField label="Phone" value={company.phone} href={company.phone ? `tel:${company.phone}` : null} />
                  <ReadField label="Website" value={company.website} href={company.website} />
                  <ReadField label="Address" value={company.address} />
                </>
              )}
            </Section>

            {/* Contract & SLA */}
            <Section title="Contract & SLA">
              {editing ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Contract start"><input type="date" value={form.contract_start || ''} onChange={e => set('contract_start', e.target.value)} style={inp} /></Field>
                    <Field label="Contract end"><input type="date" value={form.contract_end || ''} onChange={e => set('contract_end', e.target.value)} style={inp} /></Field>
                  </div>
                  <Field label="Priority tier">
                    <select value={form.priority_tier || 1} onChange={e => set('priority_tier', parseInt(e.target.value))} style={inp}>
                      <option value={1}>Standard</option>
                      <option value={2}>Premium</option>
                      <option value={3}>Critical</option>
                    </select>
                  </Field>
                  <Field label="SLA notes"><textarea value={form.sla_notes || ''} onChange={e => set('sla_notes', e.target.value)} placeholder="Custom SLA terms, response windows, exceptions…" rows={3} style={{ ...inp, resize: 'vertical' }} /></Field>
                </>
              ) : (
                <>
                  <ReadField label="Contract start" value={company.contract_start} />
                  <ReadField label="Contract end" value={company.contract_end} />
                  <ReadField label="Priority tier" value={TIER_LABEL[company.priority_tier]} />
                  {company.sla_notes && (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px', fontSize: 12, color: C.text, lineHeight: 1.6, marginTop: 4 }}>
                      {company.sla_notes}
                    </div>
                  )}
                </>
              )}
            </Section>

            {/* Escalation */}
            <Section title="Escalation Contact">
              {editing ? (
                <>
                  <Field label="Contact name"><input value={form.escalation_contact || ''} onChange={e => set('escalation_contact', e.target.value)} placeholder="Jane Smith" style={inp} /></Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Field label="Phone"><input value={form.escalation_phone || ''} onChange={e => set('escalation_phone', e.target.value)} placeholder="+44 7700 000000" style={inp} /></Field>
                    <Field label="Email"><input type="email" value={form.escalation_email || ''} onChange={e => set('escalation_email', e.target.value)} placeholder="jane@example.com" style={inp} /></Field>
                  </div>
                </>
              ) : (
                <>
                  <ReadField label="Name" value={company.escalation_contact} />
                  <ReadField label="Phone" value={company.escalation_phone} href={company.escalation_phone ? `tel:${company.escalation_phone}` : null} />
                  <ReadField label="Email" value={company.escalation_email} href={company.escalation_email ? `mailto:${company.escalation_email}` : null} />
                </>
              )}
            </Section>

            {/* Assigned agents */}
            <Section title={`Assigned Agents (${(company.agents || []).length})`}>
              {(company.agents || []).length === 0 ? (
                <div style={{ fontSize: 12, color: C.dim }}>No agents assigned</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {company.agents.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: '4px 12px' }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: C.accentLight }}>
                        {a.full_name?.[0]?.toUpperCase()}
                      </div>
                      <span style={{ fontSize: 12, color: C.text }}>{a.full_name}</span>
                      <span style={{ fontSize: 10, color: C.muted }}>{a.role.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Internal notes — agents+ only */}
            <Section title="Internal Notes">
              {editing ? (
                <textarea
                  value={form.notes || ''}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="Internal notes visible to agents only. Client cannot see this."
                  rows={4}
                  style={{ ...inp, resize: 'vertical' }}
                />
              ) : company.notes ? (
                <div style={{ background: '#1a1000', border: `1px solid #854d0e`, borderRadius: 6, padding: '10px 12px', fontSize: 12, color: '#fde68a', lineHeight: 1.6 }}>
                  {company.notes}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: C.dim }}>No internal notes</div>
              )}
            </Section>

          </div>
        )}
      </div>
    </div>
  );
}
