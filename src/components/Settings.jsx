import { useState } from 'react';
import { C } from '../constants/theme.js';
import { api } from '../utils/api.js';
import { savePrefs } from '../utils/preferences.js';
import { useToast } from '../utils/toast.jsx';
import ChangePasswordModal from './ChangePasswordModal.jsx';

function Section({ title, description, children }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 10, marginBottom: 16, overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>
        {description && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{description}</div>}
      </div>
      <div style={{ padding: '4px 0' }}>{children}</div>
    </div>
  );
}

function Row({ label, description, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 20px', gap: 16,
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: C.text }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: value ? C.accent : C.card,
        border: `1px solid ${value ? C.accent : C.border}`,
        cursor: 'pointer', position: 'relative',
        transition: 'background 0.2s',
        padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2,
        left: value ? 20 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: C.white,
        transition: 'left 0.2s',
      }} />
    </button>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 6, padding: '6px 10px',
        color: C.text, fontSize: 12, outline: 'none', cursor: 'pointer',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export default function Settings({ user, prefs, onPrefsChange, onUserUpdate }) {
  const toast = useToast();
  const [fullName, setFullName] = useState(user.full_name);
  const [phoneNumber, setPhoneNumber] = useState(user.phone_number || '');
  const [savingName, setSavingName] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [teamsWebhook, setTeamsWebhook] = useState(localStorage.getItem('tb_teams_webhook') || '');
  const [testingTeams, setTestingTeams] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(user.mfa_enabled ?? false);
  const [mfaSetup, setMfaSetup] = useState(null); // {uri, secret}
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaDisableCode, setMfaDisableCode] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  function setPref(key, value) {
    const updated = { ...prefs, [key]: value };
    savePrefs(user.id, updated);
    onPrefsChange(updated);
  }

  function saveTeamsWebhook() {
    localStorage.setItem('tb_teams_webhook', teamsWebhook.trim());
    toast('Teams webhook saved', 'success');
  }

  async function testTeamsWebhook() {
    const url = teamsWebhook.trim();
    if (!url) { toast('Enter a webhook URL first', 'error'); return; }
    setTestingTeams(true);
    try {
      await api.teamsNotify(url, {
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor: '2563eb',
        summary: 'Beacon — Teams test',
        sections: [{ activityTitle: '✓ Beacon Teams integration is working!' }],
      });
      toast('Test message sent successfully', 'success');
    } catch {
      toast('Failed — verify the webhook URL is correct', 'error');
    } finally {
      setTestingTeams(false);
    }
  }

  async function handleSaveName() {
    if (fullName.trim() === user.full_name && phoneNumber.trim() === (user.phone_number || '')) return;
    setSavingName(true);
    try {
      const updated = await api.updateProfile(fullName.trim(), phoneNumber.trim());
      onUserUpdate(updated);
      toast('Profile updated', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingName(false);
    }
  }

  const inputStyle = {
    background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 6, padding: '6px 10px',
    color: C.text, fontSize: 13, outline: 'none',
    width: 200,
  };

  const isElectron = !!window.electronAPI?.isElectron;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, maxWidth: 680 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 20, letterSpacing: -0.3 }}>
        Settings
      </div>

      {/* Account */}
      <Section title="Account" description="Your profile and login details">
        <Row label="Display name" description="Shown to other agents in the portal">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveName()}
              style={inputStyle}
            />
            <button
              onClick={handleSaveName}
              disabled={savingName || fullName.trim() === user.full_name}
              style={{
                padding: '6px 14px', background: fullName.trim() !== user.full_name ? C.accent : C.card,
                border: `1px solid ${fullName.trim() !== user.full_name ? C.accent : C.border}`,
                borderRadius: 6, color: fullName.trim() !== user.full_name ? C.white : C.dim,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {savingName ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Row>
        <Row label="Phone number" description="Used for P1/P2 SLA breach SMS alerts (E.164 format, e.g. +447700900123)">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveName()}
              placeholder="+447700900123"
              style={inputStyle}
            />
            <button
              onClick={handleSaveName}
              disabled={savingName || (fullName.trim() === user.full_name && phoneNumber.trim() === (user.phone_number || ''))}
              style={{
                padding: '6px 14px',
                background: phoneNumber.trim() !== (user.phone_number || '') ? C.accent : C.card,
                border: `1px solid ${phoneNumber.trim() !== (user.phone_number || '') ? C.accent : C.border}`,
                borderRadius: 6,
                color: phoneNumber.trim() !== (user.phone_number || '') ? C.white : C.dim,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {savingName ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Row>
        <Row label="Email" description="Your login email address">
          <span style={{ fontSize: 13, color: C.muted }}>{user.email}</span>
        </Row>
        <Row label="Role" description="Assigned by a System Admin">
          <span style={{ fontSize: 13, color: C.muted }}>{user.role.replace(/_/g, ' ')}</span>
        </Row>
        <Row label="Password">
          <button
            onClick={() => setShowChangePw(true)}
            style={{
              padding: '6px 14px', background: 'transparent',
              border: `1px solid ${C.border}`, borderRadius: 6,
              color: C.muted, fontSize: 12, cursor: 'pointer',
            }}
          >
            Change password
          </button>
        </Row>
      </Section>

      {/* Notifications */}
      <Section title="Notifications" description="Control how and when you're alerted">
        <Row label="P1/P2 sound alerts" description="Play an audio alert when a critical ticket comes in">
          <Toggle value={prefs.soundAlerts} onChange={v => setPref('soundAlerts', v)} />
        </Row>
        {isElectron && (
          <Row label="Desktop notifications" description="Show OS-level notifications when the window is minimised">
            <Toggle value={prefs.desktopNotifications} onChange={v => setPref('desktopNotifications', v)} />
          </Row>
        )}
        <Row label="Announcement alerts" description="Toast notification when a new announcement is posted">
          <Toggle value={prefs.announcementAlerts} onChange={v => setPref('announcementAlerts', v)} />
        </Row>
      </Section>

      {/* Display */}
      <Section title="Display" description="Appearance and layout preferences">
        <Row label="Default view" description="Which screen to open on login">
          <Select
            value={prefs.defaultView}
            onChange={v => setPref('defaultView', v)}
            options={[
              { value: 'tickets', label: 'Tickets' },
              { value: 'kb', label: 'Knowledge Base' },
              { value: 'announcements', label: 'Announcements' },
            ]}
          />
        </Row>
        <Row label="Ticket list density" description="How much space each ticket row takes up">
          <Select
            value={prefs.density}
            onChange={v => setPref('density', v)}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
        </Row>
      </Section>

      {/* Session */}
      <Section title="Session">
        <Row label="Auto-refresh interval" description="How often the ticket list silently re-fetches in the background">
          <Select
            value={String(prefs.refreshInterval)}
            onChange={v => setPref('refreshInterval', Number(v))}
            options={[
              { value: '15',  label: 'Every 15 seconds' },
              { value: '30',  label: 'Every 30 seconds' },
              { value: '60',  label: 'Every minute' },
              { value: '300', label: 'Every 5 minutes' },
              { value: '0',   label: 'Off' },
            ]}
          />
        </Row>
        <Row label="Session timeout" description="Automatically sign out after a period of inactivity">
          <Select
            value={String(prefs.sessionTimeout ?? 30)}
            onChange={v => setPref('sessionTimeout', Number(v))}
            options={[
              { value: '15',  label: '15 minutes' },
              { value: '30',  label: '30 minutes' },
              { value: '60',  label: '1 hour' },
              { value: '120', label: '2 hours' },
              { value: '0',   label: 'Never' },
            ]}
          />
        </Row>
      </Section>

      {/* Twilio / SMS */}
      <Section title="SMS Alerts (Twilio)" description="Send SMS notifications on P1/P2 SLA breaches. Requires a Twilio account.">
        <Row label="Account SID" description="From your Twilio console dashboard">
          <input
            value={localStorage.getItem('tb_twilio_sid') || ''}
            onChange={e => localStorage.setItem('tb_twilio_sid', e.target.value)}
            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            style={{ ...inputStyle, width: 240, fontFamily: 'monospace', fontSize: 11 }}
          />
        </Row>
        <Row label="Auth token">
          <input
            type="password"
            defaultValue={localStorage.getItem('tb_twilio_token') || ''}
            onBlur={e => localStorage.setItem('tb_twilio_token', e.target.value)}
            placeholder="••••••••••••••••••••••••••••••••"
            style={{ ...inputStyle, width: 240 }}
          />
        </Row>
        <Row label="From number" description="Your Twilio number in E.164 format">
          <input
            defaultValue={localStorage.getItem('tb_twilio_from') || ''}
            onBlur={e => localStorage.setItem('tb_twilio_from', e.target.value)}
            placeholder="+441302000000"
            style={{ ...inputStyle, width: 160, fontFamily: 'monospace', fontSize: 11 }}
          />
        </Row>
        <Row label="Alert phone number" description="Fallback number for P1/P2 SMS + voice call when ticket has no assignee. Set TWILIO_ALERT_TO in .env for automated scheduler use.">
          <input
            defaultValue={localStorage.getItem('tb_twilio_alert_to') || ''}
            onBlur={e => localStorage.setItem('tb_twilio_alert_to', e.target.value)}
            placeholder="+447700000000"
            style={{ ...inputStyle, width: 160, fontFamily: 'monospace', fontSize: 11 }}
          />
        </Row>
      </Section>

      {/* Integrations */}
      <Section title="Integrations" description="Connect Beacon to external services">
        <Row label="Microsoft Teams webhook" description="Paste an Incoming Webhook URL from your Teams channel connector. Enables 'Teams' button on P1/P2 tickets.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <input
              value={teamsWebhook}
              onChange={e => setTeamsWebhook(e.target.value)}
              placeholder="https://outlook.office.com/webhook/…"
              style={{ ...inputStyle, width: 280, fontSize: 11, fontFamily: 'monospace' }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={testTeamsWebhook}
                disabled={testingTeams || !teamsWebhook.trim()}
                style={{
                  padding: '6px 14px', background: 'transparent',
                  border: `1px solid ${C.border}`, borderRadius: 6,
                  color: C.muted, fontSize: 12, cursor: 'pointer',
                }}
              >{testingTeams ? 'Testing…' : 'Send test'}</button>
              <button
                onClick={saveTeamsWebhook}
                disabled={!teamsWebhook.trim()}
                style={{
                  padding: '6px 14px',
                  background: teamsWebhook.trim() ? C.accent : C.card,
                  border: `1px solid ${teamsWebhook.trim() ? C.accent : C.border}`,
                  borderRadius: 6, color: teamsWebhook.trim() ? C.white : C.dim,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >Save</button>
            </div>
          </div>
        </Row>
        <Row label="RealVNC Connect URL" description="Base URL for RealVNC Connect. Enables one-click remote access from the Active Ticket panel when a hostname is available.">
          <input
            defaultValue={localStorage.getItem('tb_realvnc_url') || ''}
            onBlur={e => {
              localStorage.setItem('tb_realvnc_url', e.target.value.trim());
              toast('RealVNC URL saved', 'success');
            }}
            placeholder="https://app.realvnc.com/connect"
            style={{ ...inputStyle, width: 280, fontSize: 11, fontFamily: 'monospace' }}
          />
        </Row>
      </Section>

      {/* Two-Factor Authentication */}
      <Section title="Two-Factor Authentication" description="Add a second layer of security using an authenticator app (Google Authenticator, Authy, etc.)">
        {mfaEnabled ? (
          <>
            <Row label="2FA status" description="Your account is protected by TOTP two-factor authentication.">
              <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>● Enabled</span>
            </Row>
            {!showDisable ? (
              <Row label="Disable 2FA" description="You will need your current authenticator code to disable.">
                <button onClick={() => setShowDisable(true)} style={{ padding: '6px 14px', background: 'transparent', border: `1px solid #ef4444`, borderRadius: 6, color: '#f87171', fontSize: 12, cursor: 'pointer' }}>
                  Disable 2FA
                </button>
              </Row>
            ) : (
              <Row label="Confirm disable" description="Enter the current 6-digit code from your authenticator app.">
                <div style={{ display: 'flex', gap: 8 }}>
                  <input maxLength={6} inputMode="numeric" value={mfaDisableCode} onChange={e => setMfaDisableCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000" style={{ width: 90, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 14, textAlign: 'center', letterSpacing: 4, outline: 'none' }} />
                  <button disabled={mfaLoading || mfaDisableCode.length !== 6} onClick={async () => {
                    setMfaLoading(true);
                    try { await api.disable2fa(mfaDisableCode); setMfaEnabled(false); setShowDisable(false); toast('2FA disabled', 'success'); }
                    catch (e) { toast(e.message, 'error'); }
                    finally { setMfaLoading(false); setMfaDisableCode(''); }
                  }} style={{ padding: '6px 14px', background: mfaDisableCode.length === 6 ? '#ef4444' : C.card, border: 'none', borderRadius: 6, color: C.white, fontSize: 12, cursor: 'pointer' }}>
                    {mfaLoading ? '…' : 'Confirm'}
                  </button>
                </div>
              </Row>
            )}
          </>
        ) : (
          <>
            <Row label="2FA status" description="Two-factor authentication is currently disabled.">
              <span style={{ fontSize: 12, color: C.muted }}>● Disabled</span>
            </Row>
            {!mfaSetup ? (
              <Row label="Enable 2FA" description="Scan a QR code with your authenticator app.">
                <button onClick={async () => {
                  setMfaLoading(true);
                  try { const d = await api.setup2fa(); setMfaSetup(d); }
                  catch (e) { toast(e.message, 'error'); }
                  finally { setMfaLoading(false); }
                }} style={{ padding: '6px 14px', background: C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {mfaLoading ? 'Generating…' : 'Set up 2FA'}
                </button>
              </Row>
            ) : (
              <>
                <Row label="Scan this QR code" description="Open your authenticator app and scan the code below.">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(mfaSetup.uri)}`}
                    alt="TOTP QR code" width={120} height={120}
                    style={{ borderRadius: 8, border: `1px solid ${C.border}` }}
                  />
                </Row>
                <Row label="Verify and enable" description="Enter the 6-digit code from your app to confirm setup.">
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input maxLength={6} inputMode="numeric" autoFocus value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000" style={{ width: 90, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 14, textAlign: 'center', letterSpacing: 4, outline: 'none' }} />
                    <button disabled={mfaLoading || mfaCode.length !== 6} onClick={async () => {
                      setMfaLoading(true);
                      try { await api.enable2fa(mfaCode); setMfaEnabled(true); setMfaSetup(null); setMfaCode(''); toast('2FA enabled — your account is now protected', 'success'); }
                      catch (e) { toast(e.message, 'error'); }
                      finally { setMfaLoading(false); }
                    }} style={{ padding: '6px 14px', background: mfaCode.length === 6 ? C.accent : C.card, border: 'none', borderRadius: 6, color: C.white, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {mfaLoading ? '…' : 'Enable'}
                    </button>
                  </div>
                </Row>
              </>
            )}
          </>
        )}
      </Section>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}
    </div>
  );
}
