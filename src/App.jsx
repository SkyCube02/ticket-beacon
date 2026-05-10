import { useState, useMemo, useEffect, useCallback, useRef, useLayoutEffect, Component } from 'react';

class ViewWrap extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  render() {
    if (this.state.err) return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
        <div style={{ fontSize: 13, color: '#f87171', textAlign: 'center' }}>
          {this.state.err.message || String(this.state.err)}
        </div>
        <button onClick={() => this.setState({ err: null })} style={{ padding: '6px 16px', background: '#1e3a7a', border: 'none', borderRadius: 6, color: '#93c5fd', fontSize: 12, cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
    return this.props.children;
  }
}
import { C } from './constants/theme.js';
import { api } from './utils/api.js';
import { useToast } from './utils/toast.jsx';
import Sidebar from './components/Sidebar.jsx';
import TicketList from './components/TicketList.jsx';
import TicketDetail from './components/TicketDetail.jsx';
import NewTicketModal from './components/NewTicketModal.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import SlaAlertBanner from './components/SlaAlertBanner.jsx';
import KnowledgeBase from './components/KnowledgeBase.jsx';
import ReportsDashboard from './components/ReportsDashboard.jsx';
import AccountManagement from './components/AccountManagement.jsx';
import Announcements from './components/Announcements.jsx';
import Settings from './components/Settings.jsx';
import ClientDashboard from './components/ClientDashboard.jsx';
import TaskBoard from './components/TaskBoard.jsx';
import OnboardingWizard from './components/OnboardingWizard.jsx';
import ActivatePage from './components/ActivatePage.jsx';
import { loadPrefs } from './utils/preferences.js';

const CLIENT_ROLES = ['CLIENT_USER', 'CLIENT_MANAGER'];

function useAuth() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tb_token');
    if (!token) { setChecking(false); return; }
    api.me()
      .then(setUser)
      .catch(() => localStorage.removeItem('tb_token'))
      .finally(() => setChecking(false));
  }, []);

  return { user, checking, setUser };
}

const WARN_BEFORE_MS = 2 * 60 * 1000; // show warning 2 min before expiry

function SessionTimeoutWarning({ minutesLeft, onStay, onLogout }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000 }}>
      <div style={{ background: C.surface, border: `1px solid #92400e`, borderRadius: 12, width: 380, padding: 28, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏱</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>Session expiring soon</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 24 }}>
          You'll be signed out in about {minutesLeft} minute{minutesLeft !== 1 ? 's' : ''} due to inactivity.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onLogout} style={{ padding: '8px 20px', background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 13, cursor: 'pointer' }}>Sign out now</button>
          <button onClick={onStay} style={{ padding: '8px 20px', background: C.accent, border: 'none', borderRadius: 6, color: C.white, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Stay logged in</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const toast = useToast();
  const { user, checking, setUser } = useAuth();
  const [prefs, setPrefs] = useState({});
  const [tickets, setTickets] = useState([]);
  const [agents, setAgents] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [companyFilter, setCompanyFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [view, setView] = useState(null); // null until prefs load
  const [hasSecurityAlert, setHasSecurityAlert] = useState(false);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const latestAnnouncementAt = useRef(null);
  const lastActivity = useRef(Date.now());

  const fetchTickets = useCallback(async () => {
    setLoadingTickets(true);
    try {
      const data = await api.listTickets({
        status: statusFilter || undefined,
        search: search || undefined,
        company_id: companyFilter || undefined,
      });
      setTickets(data);
    } catch (e) {
      toast('Failed to load tickets: ' + e.message, 'error');
    } finally {
      setLoadingTickets(false);
    }
  }, [statusFilter, search, companyFilter]);

  useEffect(() => {
    if (!user) return;
    const loaded = loadPrefs(user.id);
    setPrefs(loaded);
    setView(loaded.defaultView || 'tickets');
    fetchTickets();
    api.listAgents().then(setAgents).catch(() => {});
    api.listCompanies().then(setCompanies).catch(() => {});
    api.listAnnouncements().then(data => {
      setHasSecurityAlert(data.some(a => a.category === 'SECURITY' && a.is_pinned));
      if (data.length > 0) latestAnnouncementAt.current = data[0].createdAt;
    }).catch(() => {});
    // Show onboarding for first-time SYSTEM_ADMIN
    if (user.role === 'SYSTEM_ADMIN' && !localStorage.getItem(`tb_onboarded_${user.id}`)) {
      setShowOnboarding(true);
    }
  }, [user, fetchTickets]);

  // Session timeout — track inactivity
  useEffect(() => {
    if (!user) return;
    const timeoutMins = prefs.sessionTimeout ?? 30;
    if (timeoutMins === 0) return;
    const timeoutMs = timeoutMins * 60 * 1000;

    const resetActivity = () => {
      lastActivity.current = Date.now();
      setShowTimeoutWarning(false);
    };
    window.addEventListener('mousemove', resetActivity, { passive: true });
    window.addEventListener('keydown', resetActivity, { passive: true });
    window.addEventListener('click', resetActivity, { passive: true });

    const check = setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= timeoutMs) {
        handleLogout();
      } else if (idle >= timeoutMs - WARN_BEFORE_MS) {
        setShowTimeoutWarning(true);
      }
    }, 30000);

    return () => {
      window.removeEventListener('mousemove', resetActivity);
      window.removeEventListener('keydown', resetActivity);
      window.removeEventListener('click', resetActivity);
      clearInterval(check);
    };
  }, [user, prefs.sessionTimeout]);

  // Silent background refresh — interval from preferences
  useEffect(() => {
    if (!user || !prefs.refreshInterval) return;
    const ms = prefs.refreshInterval * 1000;
    const interval = setInterval(async () => {
      try {
        const data = await api.listTickets({ status: statusFilter || undefined, search: search || undefined });
        setTickets(data);
      } catch {}
    }, ms);
    return () => clearInterval(interval);
  }, [user, statusFilter, search, prefs.refreshInterval]);

  // Announcement polling every 60s
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        const data = await api.listAnnouncements();
        setHasSecurityAlert(data.some(a => a.category === 'SECURITY' && a.is_pinned));
        if (!data.length) return;
        const newest = data[0].createdAt;
        if (latestAnnouncementAt.current && newest > latestAnnouncementAt.current) {
          const newPosts = data.filter(a => a.createdAt > latestAnnouncementAt.current);
          newPosts.forEach(a => {
            const isAlert = a.category === 'SECURITY';
            if (prefs.announcementAlerts !== false) {
              toast(`${isAlert ? '🔒 Security Alert' : '📢 Announcement'}: ${a.title}`, isAlert ? 'error' : 'info', isAlert ? 10000 : 6000);
            }
            if (prefs.desktopNotifications !== false && window.electronAPI?.isElectron && isAlert) {
              window.electronAPI.showNotification(`🔒 Security Alert`, a.title);
            }
          });
        }
        latestAnnouncementAt.current = newest;
      } catch {}
    }, 60000);
    return () => clearInterval(interval);
  }, [user]);

  const selectedTicket = tickets.find(t => t.id === selectedId) ?? null;

  // Client-side search filter (fast, no extra API call while typing)
  const filtered = useMemo(() => {
    if (!search) return tickets;
    const q = search.toLowerCase();
    return tickets.filter(t =>
      t.ticket_number.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.requester.name.toLowerCase().includes(q)
    );
  }, [tickets, search]);

  async function handleUpdateTicket(id, changes) {
    try {
      const updated = await api.updateTicket(id, changes);
      setTickets(prev => prev.map(t => t.id === id ? updated : t));
      if (selectedId === id) setSelectedId(updated.id);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function handleAddLog(ticketId, actorLabel, action, meta = {}, isInternal = false) {
    try {
      const updated = await api.addLog(ticketId, actorLabel, action, meta, isInternal);
      setTickets(prev => prev.map(t => t.id === ticketId ? updated : t));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function handleCreateTicket(data) {
    try {
      const ticket = await api.createTicket(data);
      setTickets(prev => [ticket, ...prev]);
      setSelectedId(ticket.id);
      setShowNew(false);
      toast(`${ticket.ticket_number} created`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function handleLogout() {
    localStorage.removeItem('tb_token');
    setUser(null);
    setTickets([]);
    setSelectedId(null);
  }

  if (checking) {
    return (
      <div style={{ height: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: C.muted, fontSize: 14 }}>Loading…</span>
      </div>
    );
  }

  const activationToken = new URLSearchParams(window.location.search).get('token');
  if (activationToken) {
    return <ActivatePage token={activationToken} onDone={() => { window.history.replaceState({}, '', '/'); }} />;
  }

  if (!user) {
    return <LoginScreen onLogin={u => { setUser(u); }} />;
  }

  if (CLIENT_ROLES.includes(user.role)) {
    return (
      <ClientDashboard
        user={user}
        onLogout={() => {
          localStorage.removeItem('tb_token');
          setUser(null);
        }}
      />
    );
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: C.bg,
      color: C.text,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflow: 'hidden',
      paddingTop: 'env(safe-area-inset-top, 0px)',
      boxSizing: 'border-box',
    }}>
      <SlaAlertBanner
        tickets={tickets}
        onAcknowledge={t => handleUpdateTicket(t.id, { status: 'ACKNOWLEDGED' })}
        soundEnabled={prefs.soundAlerts !== false}
        desktopEnabled={prefs.desktopNotifications !== false}
      />
      <Sidebar
        tickets={tickets}
        onNewTicket={() => setShowNew(true)}
        user={user}
        onLogout={handleLogout}
        view={view}
        onViewChange={setView}
        hasSecurityAlert={hasSecurityAlert}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {view === 'kb' ? (
          <ViewWrap><KnowledgeBase currentUser={user} /></ViewWrap>
        ) : view === 'reports' ? (
          <ViewWrap><ReportsDashboard /></ViewWrap>
        ) : view === 'announcements' ? (
          <ViewWrap><Announcements currentUser={user} /></ViewWrap>
        ) : view === 'tasks' ? (
          <ViewWrap><TaskBoard currentUser={user} /></ViewWrap>
        ) : view === 'settings' ? (
          <ViewWrap><Settings
            user={user}
            prefs={prefs}
            onPrefsChange={setPrefs}
            onUserUpdate={updated => setUser(updated)}
          /></ViewWrap>
        ) : view === 'admin' ? (
          <ViewWrap><AccountManagement currentUser={user} /></ViewWrap>
        ) : (
          <>
            <TicketList
              tickets={filtered}
              selectedId={selectedId}
              onSelect={setSelectedId}
              search={search}
              onSearch={setSearch}
              onNewTicket={() => setShowNew(true)}
              hasDetail={!!selectedTicket}
              loading={loadingTickets}
              companies={companies}
              companyFilter={companyFilter}
              onCompanyFilter={id => { setCompanyFilter(id); setSelectedId(null); }}
              statusFilter={statusFilter}
              onStatusFilter={v => { setStatusFilter(v); setSelectedId(null); }}
              density={prefs.density || 'comfortable'}
              currentUser={user}
              onQuickAction={(id, changes) => handleUpdateTicket(id, changes)}
            />
            {selectedTicket && (
              <TicketDetail
                ticket={selectedTicket}
                agents={agents}
                currentUser={user}
                onClose={() => setSelectedId(null)}
                onUpdate={changes => handleUpdateTicket(selectedTicket.id, changes)}
                onRefresh={updated => setTickets(prev => prev.map(t => t.id === updated.id ? updated : t))}
                onLog={(actor, action, meta, isInternal) => handleAddLog(selectedTicket.id, actor, action, meta, isInternal)}
              />
            )}
          </>
        )}
      </div>

      {showNew && (
        <NewTicketModal
          agents={agents}
          companies={companies}
          currentUser={user}
          onClose={() => setShowNew(false)}
          onCreate={handleCreateTicket}
        />
      )}

      {showTimeoutWarning && (
        <SessionTimeoutWarning
          minutesLeft={Math.ceil(((prefs.sessionTimeout ?? 30) * 60 * 1000 - (Date.now() - lastActivity.current)) / 60000)}
          onStay={() => { lastActivity.current = Date.now(); setShowTimeoutWarning(false); }}
          onLogout={handleLogout}
        />
      )}

      {showOnboarding && (
        <OnboardingWizard
          currentUser={user}
          onComplete={() => {
            localStorage.setItem(`tb_onboarded_${user.id}`, '1');
            setShowOnboarding(false);
            fetchTickets();
            api.listAgents().then(setAgents).catch(() => {});
            api.listCompanies().then(setCompanies).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
