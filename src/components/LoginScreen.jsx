import { useState, useEffect, useRef } from 'react';
import { C } from '../constants/theme.js';
import { api } from '../utils/api.js';
import heroImg from '../assets/hero.png';

const AZURE_CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID || '';
const AZURE_TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID || 'common';

let _msalApp = null;
async function getMsal() {
  if (_msalApp) return _msalApp;
  const { PublicClientApplication } = await import('@azure/msal-browser');
  _msalApp = new PublicClientApplication({
    auth: {
      clientId: AZURE_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${AZURE_TENANT_ID}`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'localStorage' },
  });
  await _msalApp.initialize();
  return _msalApp;
}

const CLIENT_ROLES = ['CLIENT_USER', 'CLIENT_MANAGER'];

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 700);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 700);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return mobile;
}

// ── Animated background canvas ────────────────────────────────────────────────

function ParticleCanvas() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let raf;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const N = 55;
    const particles = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 2 + 1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      });

      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 140) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(37,99,235,${0.15 * (1 - d / 140)})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(37,99,235,0.35)';
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
  );
}

// ── Login form ────────────────────────────────────────────────────────────────

function LoginForm({ portal, onLogin, onBack }) {
  const isMobile = useIsMobile();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  useEffect(() => { setTimeout(() => setVisible(true), 30); }, []);

  const isAgent = portal === 'agent';
  const accentColor = isAgent ? C.accent : '#7c3aed';
  const accentDim   = isAgent ? C.accentDim : '#2e1065';
  const accentLight = isAgent ? C.accentLight : '#c084fc';
  const azureClientId = AZURE_CLIENT_ID;

  function finishLogin(data) {
    const isClient = CLIENT_ROLES.includes(data.user.role);
    if (isAgent && isClient) { setError('This account belongs to the Client Portal. Please use Client Login.'); setLoading(false); return; }
    if (!isAgent && !isClient) { setError('This account belongs to the Agent Portal. Please use Agent Login.'); setLoading(false); return; }
    localStorage.setItem('tb_token', data.access_token);
    onLogin(data.user);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login(email, password);
      if (data.requires_mfa) {
        setMfaToken(data.mfa_token);
        setMfaStep(true);
        setLoading(false);
        return;
      }
      finishLogin(data);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleMfaSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.verifyMfa(mfaToken, totpCode);
      finishLogin(data);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  // Handle redirect result on mount (after Microsoft redirects back)
  useEffect(() => {
    if (!azureClientId) return;
    getMsal().then(msalApp => {
      msalApp.handleRedirectPromise().then(result => {
        if (!result) return;
        api.azureLogin(result.accessToken).then(data => finishLogin(data)).catch(err => setError(err.message));
      }).catch(err => setError(err.message));
    }).catch(() => {});
  }, []);

  async function handleAzureLogin() {
    if (!azureClientId) return;
    setError('');
    setLoading(true);
    try {
      const msalApp = await getMsal();
      await msalApp.loginRedirect({ scopes: ['User.Read'] });
      // Page will redirect — execution stops here
    } catch (err) {
      setError(err.message || 'Microsoft login failed');
      setLoading(false);
    }
  }

  const inputStyle = {
    width: '100%', background: C.card,
    border: `1px solid ${C.border}`, borderRadius: 6,
    padding: '10px 14px', color: C.text, fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  };

  const cardStyle = {
    width: isMobile ? '92vw' : 380, maxWidth: 420,
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 14, overflow: 'hidden',
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(24px)',
    transition: 'opacity 0.4s ease, transform 0.4s ease',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  };

  const header = (
    <div style={{ background: accentDim, borderBottom: `1px solid ${accentColor}44`, padding: '18px 24px' }}>
      <button onClick={mfaStep ? () => { setMfaStep(false); setError(''); } : onBack}
        style={{ background: 'none', border: 'none', color: accentLight, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
        ← {mfaStep ? 'Back to password' : 'Back'}
      </button>
      <div style={{ fontSize: 11, color: accentLight, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>
        {isAgent ? 'Agent Portal' : 'Client Portal'}
      </div>
      <div style={{ fontSize: 19, fontWeight: 700, color: C.text, marginTop: 3 }}>
        <span style={{ color: accentColor }}>●</span> Ticket Beacon
      </div>
    </div>
  );

  const errorBox = error && (
    <div style={{
      fontSize: 12,
      color: error.includes('locked') ? '#fbbf24' : '#f87171',
      background: error.includes('locked') ? '#2d1a00' : '#2d0a0a',
      border: `1px solid ${error.includes('locked') ? '#92400e' : '#7f1d1d'}`,
      borderRadius: 6, padding: '8px 12px', marginBottom: 14,
    }}>
      {error}
    </div>
  );

  // MFA step
  if (mfaStep) return (
    <div style={cardStyle}>
      {header}
      <form onSubmit={handleMfaSubmit} style={{ padding: '20px 24px' }}>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 18, lineHeight: 1.5 }}>
          Enter the 6-digit code from your authenticator app.
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Authenticator Code</label>
          <input type="text" required autoFocus maxLength={6} inputMode="numeric" value={totpCode}
            onChange={e => setTotpCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000" style={{ ...inputStyle, fontSize: 22, letterSpacing: 6, textAlign: 'center' }} />
        </div>
        {errorBox}
        <button type="submit" disabled={loading || totpCode.length !== 6} style={{
          width: '100%', padding: '11px', background: totpCode.length === 6 && !loading ? accentColor : accentDim,
          border: 'none', borderRadius: 6, color: C.white, fontSize: 15, fontWeight: 600,
          cursor: totpCode.length === 6 && !loading ? 'pointer' : 'default',
        }}>
          {loading ? 'Verifying…' : 'Verify'}
        </button>
      </form>
    </div>
  );

  return (
    <div style={cardStyle}>
      {header}
      <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Email</label>
          <input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)}
            placeholder={isAgent ? 'you@simbix.com' : 'you@yourcompany.com'} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>Password</label>
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" style={inputStyle} />
        </div>
        {errorBox}
        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '11px',
          background: loading ? accentDim : accentColor,
          border: 'none', borderRadius: 6,
          color: C.white, fontSize: 15, fontWeight: 600,
          cursor: loading ? 'default' : 'pointer',
        }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        {/* Azure AD */}
        <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          <button type="button" onClick={handleAzureLogin} disabled={loading}
            title={azureClientId ? 'Sign in with your Microsoft account' : 'Azure AD SSO — contact SimBix LLP to enable'}
            style={{
              width: '100%', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: 'transparent', border: `1px solid ${C.border}`,
              borderRadius: 6, color: azureClientId ? C.text : C.muted, fontSize: 13,
              cursor: azureClientId ? 'pointer' : 'not-allowed', opacity: azureClientId ? 1 : 0.5,
            }}>
            <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
            Sign in with Microsoft
          </button>
          {!azureClientId && (
            <div style={{ fontSize: 10, color: C.muted, textAlign: 'center', marginTop: 5 }}>
              Azure AD SSO — contact SimBix LLP to enable
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Portal selection screen ───────────────────────────────────────────────────

function PortalCard({ title, subtitle, icon, accentColor, delay, onClick, fullWidth }) {
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => { setTimeout(() => setVisible(true), delay); }, [delay]);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setHovered(false)}
      style={{
        flex: fullWidth ? 1 : undefined,
        width: fullWidth ? undefined : 200,
        padding: '24px 20px',
        background: hovered ? `${accentColor}10` : C.surface,
        border: `1px solid ${hovered ? accentColor : C.border}`,
        borderRadius: 12, cursor: 'pointer', textAlign: 'left',
        opacity: visible ? 1 : 0,
        transform: visible
          ? hovered ? 'translateY(-3px)' : 'translateY(0)'
          : 'translateY(32px)',
        transition: 'opacity 0.5s ease, transform 0.3s ease, border-color 0.2s, background 0.2s',
        boxShadow: hovered ? `0 8px 32px ${accentColor}30` : '0 4px 16px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ fontSize: 26, marginBottom: 12, color: accentColor }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{subtitle}</div>
      <div style={{ marginTop: 14, fontSize: 12, fontWeight: 600, color: accentColor }}>
        Sign in →
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LoginScreen({ onLogin }) {
  const isMobile = useIsMobile();
  const [portal, setPortal] = useState(null);
  const [brandVisible, setBrandVisible] = useState(false);

  useEffect(() => { setTimeout(() => setBrandVisible(true), 100); }, []);

  if (portal) {
    return (
      <div style={{ height: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        <ParticleCanvas />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <LoginForm portal={portal} onLogin={onLogin} onBack={() => setPortal(null)} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
      <ParticleCanvas />

      <div style={{ position: 'absolute', top: '15%', left: '10%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(37,99,235,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '20%', right: '8%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.07) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{
        position: 'relative', zIndex: 1,
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: 'center',
        gap: isMobile ? 32 : 72,
        padding: isMobile ? '0 20px' : 0,
        width: isMobile ? '100%' : undefined,
      }}>
        {/* Brand + cards */}
        <div style={{ width: isMobile ? '100%' : undefined }}>
          <div style={{
            marginBottom: 28,
            textAlign: 'center',
            opacity: brandVisible ? 1 : 0,
            transform: brandVisible ? 'translateY(0)' : 'translateY(-16px)',
            transition: 'opacity 0.5s ease, transform 0.5s ease',
          }}>
            <div style={{ fontSize: isMobile ? 24 : 28, fontWeight: 700, color: C.text, letterSpacing: -0.5 }}>
              <span style={{ color: C.accent, display: 'inline-block', animation: 'tb-pulse 2.4s ease-in-out infinite' }}>●</span> Ticket Beacon
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6, letterSpacing: 0.6 }}>
              SELECT YOUR PORTAL
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, width: isMobile ? '100%' : undefined }}>
            <PortalCard
              title="Agent Portal"
              subtitle="For support staff and team members"
              icon="◈"
              accentColor={C.accent}
              delay={250}
              onClick={() => setPortal('agent')}
              fullWidth={isMobile}
            />
            <PortalCard
              title="Client Portal"
              subtitle="Submit and track your IT support tickets"
              icon="◎"
              accentColor="#7c3aed"
              delay={380}
              onClick={() => setPortal('client')}
              fullWidth={isMobile}
            />
          </div>
        </div>

        {/* Hero image — desktop only */}
        {!isMobile && (
          <div style={{
            opacity: brandVisible ? 1 : 0,
            transform: brandVisible ? 'translateY(0) rotate(-2deg)' : 'translateY(24px) rotate(-2deg)',
            transition: 'opacity 0.7s ease 0.3s, transform 0.7s ease 0.3s',
            filter: 'drop-shadow(0 20px 40px rgba(124,58,237,0.25))',
          }}>
            <img src={heroImg} alt="" style={{ width: 220, opacity: 0.9 }} />
          </div>
        )}
      </div>

      <style>{`
        @keyframes tb-pulse {
          0%, 100% { opacity: 1; text-shadow: 0 0 8px rgba(37,99,235,0.8); }
          50%       { opacity: 0.6; text-shadow: 0 0 24px rgba(37,99,235,0.4); }
        }
      `}</style>
    </div>
  );
}
