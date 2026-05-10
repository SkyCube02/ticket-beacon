// Demo mode — all data is local, no server needed.

const now = () => new Date().toISOString();
const ago = (h = 0, d = 0, m = 0) =>
  new Date(Date.now() - (d * 86400 + h * 3600 + m * 60) * 1000).toISOString();
let _nextId = 100;
const uid = () => `demo-${_nextId++}`;

// ── Users ─────────────────────────────────────────────────────────────────────

const USERS = [
  { id: 'u-admin',  email: 'admin@ticketbeacon.com',  full_name: 'Ben Corton',   role: 'SYSTEM_ADMIN',  password: 'DemoAdmin1!xx', company_name: null,           company_id: null },
  { id: 'u-marcus', email: 'marcus@ticketbeacon.com', full_name: 'Marcus Webb',  role: 'TEAM_MANAGER',  password: 'DemoAgent1!xx', company_name: null,           company_id: null },
  { id: 'u-priya',  email: 'priya@ticketbeacon.com',  full_name: 'Priya Patel',  role: 'SENIOR_AGENT',  password: 'DemoAgent1!xx', company_name: null,           company_id: null },
  { id: 'u-sam',    email: 'sam@ticketbeacon.com',    full_name: 'Sam Riley',    role: 'AGENT',         password: 'DemoAgent1!xx', company_name: null,           company_id: null },
  { id: 'u-jamie',  email: 'jamie@ticketbeacon.com',  full_name: 'Jamie Lee',    role: 'AGENT',         password: 'DemoAgent1!xx', company_name: null,           company_id: null },
  { id: 'u-alice',  email: 'alice@acmecorp.com',      full_name: 'Alice Chen',   role: 'CLIENT_USER',   password: 'ClientDemo1!x', company_name: 'Acme Corp',    company_id: 'c-acme' },
  { id: 'u-raj',    email: 'raj@acmecorp.com',        full_name: 'Raj Patel',    role: 'CLIENT_MANAGER',password: 'ClientDemo1!x', company_name: 'Acme Corp',    company_id: 'c-acme' },
  { id: 'u-tom',    email: 'tom@techstart.com',       full_name: 'Tom Walsh',    role: 'CLIENT_MANAGER',password: 'ClientDemo1!x', company_name: 'TechStart Ltd',company_id: 'c-tech' },
  { id: 'u-sarah',  email: 'sarah@meridian.com',      full_name: 'Sarah Kim',    role: 'CLIENT_USER',   password: 'ClientDemo1!x', company_name: 'Meridian Group',company_id: 'c-mer' },
];

// ── Companies ─────────────────────────────────────────────────────────────────

const COMPANIES = [
  { id: 'c-acme', name: 'Acme Corp',      is_active: true },
  { id: 'c-tech', name: 'TechStart Ltd',  is_active: true },
  { id: 'c-mer',  name: 'Meridian Group', is_active: true },
];

// ── Tickets ───────────────────────────────────────────────────────────────────

function mkTicket(num, title, desc, status, priority, reqName, reqEmail, reqDept,
                  companyId, assigneeName, assigneeId, tags, hoursAgo, daysAgo = 0,
                  extraLogs = [], satScore = null) {
  const companyName = COMPANIES.find(c => c.id === companyId)?.name ?? null;
  const logs = [
    { id: uid(), actor: reqName, action: 'opened ticket', timestamp: ago(hoursAgo, daysAgo), meta: {}, is_internal: false },
    ...extraLogs.map(([actor, action, h, d, internal]) => ({
      id: uid(), actor, action, timestamp: ago(h, d ?? 0), meta: {}, is_internal: internal ?? false,
    })),
  ];
  return {
    id: `t-${num}`,
    ticket_number: `TKT-${String(num).padStart(3, '0')}`,
    title, description: desc, status, priority,
    requester: { name: reqName, email: reqEmail, dept: reqDept },
    assignee: assigneeName, assignee_id: assigneeId,
    company_id: companyId, company_name: companyName,
    tags, sla_breached: status === 'SLA BREACHED',
    satisfaction_score: satScore, satisfaction_note: null,
    system_info: null,
    createdAt: ago(hoursAgo, daysAgo),
    updatedAt: ago(Math.max(0, hoursAgo - 1), daysAgo),
    acknowledgedAt: ['ACKNOWLEDGED','IN PROGRESS','ESCALATED','PENDING CLIENT','RESOLVED','CLOSED','SLA BREACHED'].includes(status)
      ? ago(Math.max(1, hoursAgo - 1), daysAgo) : null,
    resolvedAt: ['RESOLVED','CLOSED'].includes(status) ? ago(1, daysAgo) : null,
    closedAt: status === 'CLOSED' ? ago(0, daysAgo, 30) : null,
    attachments: [], logs,
  };
}

let _tickets = [
  mkTicket(1, 'Cannot access email client after Windows update',
    'After the latest Windows security update pushed last night, several users in Finance are unable to open Outlook. The app crashes immediately on launch with error code 0xc000007b. Affects at least 4 workstations on the 2nd floor.',
    'IN PROGRESS', 'P2', 'David Park', 'david@acmecorp.com', 'Finance',
    'c-acme', 'Sam Riley', 'u-sam', ['email','windows','outlook'], 5, 0, [
      ['Sam Riley', 'acknowledged — scheduling remote session', 4],
      ['Sam Riley', 'status → IN PROGRESS', 3],
      ['Sam Riley', 'Checked 2 machines — missing VC++ runtime. Deploying fix via SCCM.', 2, 0, true],
    ]),
  mkTicket(2, 'Database server unresponsive — production impact',
    'The primary SQL Server instance (db-prod-01) is not responding to connections. Multiple production services are degraded. DBA on-call has been notified.',
    'ESCALATED', 'P1', 'Raj Patel', 'raj@acmecorp.com', 'IT',
    'c-acme', 'Marcus Webb', 'u-marcus', ['database','production','critical'], 2, 0, [
      ['Marcus Webb', 'acknowledged — investigating with DBA', 1],
      ['Marcus Webb', 'status → ESCALATED — engaging vendor support (case #MS-449821)', 0, 0],
    ]),
  mkTicket(3, 'Printer on 3rd floor HR area offline',
    'The HP LaserJet on the 3rd floor HR area (HP-3F-02) shows offline in the print queue. Physical check shows it is powered on. Restarting the print spooler did not help.',
    'ACKNOWLEDGED', 'P3', 'Sarah Kim', 'sarah@meridian.com', 'HR',
    'c-mer', 'Jamie Lee', 'u-jamie', ['printer','hardware','hr'], 8, 0, [
      ['Jamie Lee', 'status → ACKNOWLEDGED — will visit 3rd floor today', 5],
    ]),
  mkTicket(4, 'Second monitor not detected on new workstation',
    'New engineering workstation (ENG-WS-042) does not detect the second monitor via DisplayPort. Single monitor works fine. Driver reinstall did not resolve.',
    'RESOLVED', 'P4', 'Alice Chen', 'alice@acmecorp.com', 'Engineering',
    'c-acme', 'Jamie Lee', 'u-jamie', ['hardware','monitors','workstation'], 0, 3, [
      ['Jamie Lee', 'acknowledged', 0, 3],
      ['Jamie Lee', 'status → IN PROGRESS — checking cable and port', 20, 2],
      ['Jamie Lee', 'resolved — faulty DisplayPort cable replaced', 2, 1],
      ['Jamie Lee', 'status → RESOLVED', 1, 1],
    ], 5),
  mkTicket(5, 'CI/CD pipeline failing — all deployments blocked',
    'The GitHub Actions pipeline has been failing since 09:00 with exit code 137 (OOM). All deployments to staging and production are blocked. Engineers cannot ship any fixes.',
    'SLA BREACHED', 'P1', 'Alice Chen', 'alice@acmecorp.com', 'Engineering',
    'c-acme', 'Sam Riley', 'u-sam', ['ci-cd','github-actions','deployment'], 4, 0, [
      ['Sam Riley', 'acknowledged', 3],
      ['System', 'SLA threshold exceeded — P1 2hr limit reached', 2],
    ]),
  mkTicket(6, 'VPN drops connection every 15–20 minutes',
    'Remote workers in the Marketing team are experiencing VPN disconnections roughly every 15–20 minutes. The issue began Monday and affects users on the Cisco AnyConnect profile.',
    'OPEN', 'P3', 'Tom Walsh', 'tom@techstart.com', 'Marketing',
    'c-tech', null, null, ['vpn','network','remote'], 0, 1),
  mkTicket(7, 'Microsoft Teams video calls dropping mid-meeting',
    'Engineering team members are experiencing dropped video calls in Teams. Audio continues but video cuts out after ~10 minutes. Affects multiple machines on the wired network.',
    'OPEN', 'P2', 'Alice Chen', 'alice@acmecorp.com', 'Engineering',
    'c-acme', null, null, ['teams','video','network'], 3),
  mkTicket(8, 'Payroll system login failing for Finance team',
    "Three Finance users cannot log into the payroll portal. Error: 'Invalid credentials' even after password reset. Payroll run is due Friday — time-sensitive.",
    'PENDING CLIENT', 'P2', 'David Park', 'david@acmecorp.com', 'Finance',
    'c-acme', 'Priya Patel', 'u-priya', ['payroll','auth','finance'], 6, 0, [
      ['Priya Patel', 'acknowledged', 5],
      ['Priya Patel', 'status → PENDING CLIENT — awaiting list of affected user IDs', 2],
    ]),
  mkTicket(9, 'Adobe Creative Cloud license request',
    'Marketing team needs one additional Adobe Creative Cloud license for a new designer starting next week.',
    'CLOSED', 'P5', 'Tom Walsh', 'tom@techstart.com', 'Marketing',
    'c-tech', 'Priya Patel', 'u-priya', ['software','license','adobe'], 0, 5, [
      ['Priya Patel', 'acknowledged — checking license inventory', 20, 5],
      ['Priya Patel', 'license provisioned and sent to requester', 0, 3],
      ['Priya Patel', 'status → CLOSED', 0, 2],
    ], 4),
  mkTicket(10, 'Self-service password reset portal returning 500 error',
    'The internal password reset portal (reset.internal) is returning HTTP 500 for all users. This is blocking locked-out users from self-service recovery.',
    'OPEN', 'P3', 'Sarah Kim', 'sarah@meridian.com', 'HR',
    'c-mer', null, null, ['auth','portal','hr'], 1),
  mkTicket(11, 'Laptop battery draining to 0% overnight',
    'Several MacBook Pros assigned to the sales team are draining to 0% overnight even when plugged in. Apple Diagnostics shows no battery fault. Began after macOS 14.4 update.',
    'OPEN', 'P4', 'Tom Walsh', 'tom@techstart.com', 'Sales',
    'c-tech', null, null, ['hardware','battery','macos'], 12),
  mkTicket(12, 'SSL certificate expiry warning — client portal',
    "Monitoring alert: SSL cert for client-portal.acmecorp.com expires in 11 days. Auto-renewal failed — Let's Encrypt challenge returning 404.",
    'IN PROGRESS', 'P2', 'Alice Chen', 'alice@acmecorp.com', 'Engineering',
    'c-acme', 'Sam Riley', 'u-sam', ['ssl','security','portal'], 6, 0, [
      ['Sam Riley', 'acknowledged — investigating ACME challenge failure', 5],
      ['Sam Riley', 'status → IN PROGRESS — nginx config misconfigured', 3],
      ['Sam Riley', 'Cert renewed. Nginx reloaded. Expiry now 90 days.', 1, 0, true],
    ]),
];

// ── KB Articles ───────────────────────────────────────────────────────────────

let _kb = [
  { id: 'kb-1', title: 'Outlook crashes on launch after Windows update (error 0xc000007b)', category: 'Email', tags: ['outlook','windows','crash'], is_archived: false, author: { full_name: 'Admin' }, createdAt: ago(0, 14), updatedAt: ago(0, 14),
    content: `SYMPTOMS\nOutlook crashes immediately on launch with error code 0xc000007b following a Windows update.\n\nCAUSE\n32/64-bit DLL mismatch introduced by the update, or a corrupted Visual C++ Redistributable.\n\nRESOLUTION STEPS\n1. Control Panel → Programs → uninstall all Microsoft Visual C++ Redistributables.\n2. Download and install latest VC++ Redistributables (x86 and x64) from Microsoft.\n3. Restart the machine and relaunch Outlook.\n4. If still failing, run as Administrator: sfc /scannow\n\nAFFECTED SYSTEMS\nWindows 10 / Windows 11 with Office 365 or Office 2019+.` },
  { id: 'kb-2', title: 'VPN disconnecting repeatedly — Cisco AnyConnect', category: 'Network', tags: ['vpn','cisco','anyconnect'], is_archived: false, author: { full_name: 'Priya Patel' }, createdAt: ago(0, 10), updatedAt: ago(0, 10),
    content: `SYMPTOMS\nCisco AnyConnect VPN drops every 15–30 minutes. Affects remote workers.\n\nRESOLUTION STEPS\n1. Check local internet stability: ping 8.8.8.8 -t\n2. AnyConnect Preferences → uncheck "Allow local LAN access when using VPN"\n3. Set vpn-idle-timeout to 60 on the VPN appliance\n4. Fix MTU: netsh interface ipv4 set subinterface "Cisco AnyConnect" mtu=1300\n5. Reinstall AnyConnect if the above fails.\n\nESCALATION\nIf all remote users drop simultaneously, escalate to network team — server-side issue.` },
  { id: 'kb-3', title: 'Printer showing offline in Windows print queue', category: 'Hardware', tags: ['printer','offline','spooler'], is_archived: false, author: { full_name: 'Admin' }, createdAt: ago(0, 8), updatedAt: ago(0, 8),
    content: `SYMPTOMS\nPrinter shows "Offline" in Windows print queue despite being powered on.\n\nRESOLUTION STEPS\n1. Restart Print Spooler: services.msc → Print Spooler → Restart\n2. Clear stuck jobs: stop spooler, delete all files in C:\\Windows\\System32\\spool\\PRINTERS, restart spooler\n3. Verify printer IP in Devices and Printers → Printer Properties → Ports\n4. Remove and re-add the printer if steps above fail.\n\nNOTES\nAssign a static IP to the printer to prevent recurrence.` },
  { id: 'kb-4', title: 'GitHub Actions pipeline failing with exit code 137 (OOM)', category: 'DevOps', tags: ['github-actions','ci-cd','oom'], is_archived: false, author: { full_name: 'Priya Patel' }, createdAt: ago(0, 5), updatedAt: ago(0, 5),
    content: `SYMPTOMS\nGitHub Actions workflow fails with exit code 137 (Linux OOM kill).\n\nRESOLUTION STEPS\n1. Identify the failing step — which job step shows exit code 137.\n2. For Node.js builds, increase heap: NODE_OPTIONS=--max-old-space-size=4096\n3. For Docker builds, check daemon memory usage.\n4. Self-hosted runners: check available RAM on the host.\n5. GitHub-hosted runners: split into smaller parallel jobs or upgrade runner size.` },
  { id: 'kb-5', title: 'SSL certificate renewal — Let\'s Encrypt', category: 'Infrastructure', tags: ['ssl','certificate','nginx'], is_archived: false, author: { full_name: 'Sam Riley' }, createdAt: ago(0, 3), updatedAt: ago(0, 3),
    content: `CHECK STATUS\ncertbot certificates\n\nFORCE RENEWAL\ncertbot renew --force-renewal\nnginx -s reload\n\nCOMMON FAILURE: HTTP-01 challenge 404\nEnsure this nginx block appears BEFORE any redirect rules:\nlocation /.well-known/acme-challenge/ {\n    root /var/www/html;\n}\n\nMONITORING\nCerts expiring within 14 days trigger an alert. Assign to SENIOR_AGENT+ immediately.` },
  { id: 'kb-6', title: 'New starter IT checklist', category: 'HR & Onboarding', tags: ['onboarding','new-starter'], is_archived: false, author: { full_name: 'Jamie Lee' }, createdAt: ago(0, 7), updatedAt: ago(0, 7),
    content: `Raise a ticket at least 5 working days before the start date.\n\nIT WILL PROVISION\n- Laptop or desktop\n- Microsoft 365 account (email, Teams, SharePoint)\n- VPN credentials\n- Software per role\n- Slack workspace invite\n\nINFORMATION REQUIRED\n- Full name and preferred email format\n- Start date and office location\n- Manager name and team\n- Role (determines access group)\n- Any specific software requirements` },
];

// ── Announcements ─────────────────────────────────────────────────────────────

let _announcements = [
  { id: 'ann-1', title: 'SECURITY ALERT: Active Phishing Campaign — Office 365', category: 'SECURITY', is_pinned: true,
    author: { full_name: 'Marcus Webb' }, createdAt: ago(4), updatedAt: ago(4),
    content: `A phishing campaign is targeting Office 365 users. Attackers send convincing emails impersonating Microsoft, directing users to fake login pages.\n\nINDICATORS\n• Sender domain doesn't exactly match @microsoft.com\n• Subject: "Your account will be suspended — action required"\n• Urgency language: "within 24 hours"\n\nWHAT TO DO\n1. Do not click any links\n2. Report using "Report Phishing" in Outlook\n3. If credentials were entered, change your password immediately and contact IT` },
  { id: 'ann-2', title: 'Planned Maintenance — VPN Gateway — Saturday 02:00–04:00', category: 'MAINTENANCE', is_pinned: false,
    author: { full_name: 'Admin' }, createdAt: ago(0, 1), updatedAt: ago(0, 1),
    content: `The VPN gateway will be offline this Saturday between 02:00 and 04:00 BST.\n\nRemote workers should not expect to connect during this window. Active sessions will be dropped at 02:00.\n\nComplete any overnight VPN work before 01:45 or arrange to work on-site.` },
  { id: 'ann-3', title: 'Ticket Beacon is now live — FreshService retired', category: 'GENERAL', is_pinned: false,
    author: { full_name: 'Admin' }, createdAt: ago(0, 3), updatedAt: ago(0, 3),
    content: `Ticket Beacon is now the official support portal. FreshService has been decommissioned.\n\nAll new tickets go through Ticket Beacon. Training guides are in the Knowledge Base.` },
];

// ── Tasks ─────────────────────────────────────────────────────────────────────

const futureDate = (d) => {
  const dt = new Date(Date.now() + d * 86400000);
  return dt.toISOString().slice(0, 10);
};

let _tasks = [
  { id: 'task-1', title: 'Renew SSL cert for client-portal.acmecorp.com', notes: "Fix nginx ACME challenge path. See TKT-012.", status: 'IN_PROGRESS', assignee: { id: 'u-sam', full_name: 'Sam Riley' }, created_by: { full_name: 'Admin' }, linked_ticket_id: 't-12', due_date: futureDate(11), createdAt: ago(6), updatedAt: ago(3) },
  { id: 'task-2', title: 'Provision Emily Tran laptop and M365 account', notes: 'New starter Monday. MacBook Pro 14" requested.', status: 'TODO', assignee: { id: 'u-jamie', full_name: 'Jamie Lee' }, created_by: { full_name: 'Admin' }, linked_ticket_id: null, due_date: futureDate(3), createdAt: ago(9), updatedAt: ago(9) },
  { id: 'task-3', title: 'Expand Veeam backup repository — 2TB volume', notes: 'Repo at 97%. Archive pre-2023 snapshots first.', status: 'IN_PROGRESS', assignee: { id: 'u-marcus', full_name: 'Marcus Webb' }, created_by: { full_name: 'Marcus Webb' }, linked_ticket_id: null, due_date: futureDate(0), createdAt: ago(18), updatedAt: ago(5) },
  { id: 'task-4', title: 'Update Cisco AnyConnect VPN server to 4.10.x', notes: 'Test with 3 pilot users before Saturday maintenance.', status: 'TODO', assignee: { id: 'u-sam', full_name: 'Sam Riley' }, created_by: { full_name: 'Marcus Webb' }, linked_ticket_id: null, due_date: futureDate(4), createdAt: ago(2), updatedAt: ago(2) },
  { id: 'task-5', title: 'Q2 software license audit', notes: 'Cross-check M365 assigned vs active users.', status: 'DONE', assignee: { id: 'u-priya', full_name: 'Priya Patel' }, created_by: { full_name: 'Admin' }, linked_ticket_id: null, due_date: null, createdAt: ago(0, 7), updatedAt: ago(0, 2) },
];

// ── Emergency contacts ────────────────────────────────────────────────────────

let _emergency = [
  { id: 'em-1', name: 'Marcus Webb', role: 'Team Manager', phone: '+44 7700 900123', email: 'marcus@ticketbeacon.com', priority: 1 },
  { id: 'em-2', name: 'IT On-Call',  role: 'On-Call Engineer', phone: '+44 7700 900456', email: 'oncall@ticketbeacon.com', priority: 2 },
  { id: 'em-3', name: 'Priya Patel', role: 'Senior Agent', phone: '+44 7700 900789', email: 'priya@ticketbeacon.com', priority: 3 },
];

// ── Auth state ────────────────────────────────────────────────────────────────

let _currentUser = null;

function getUserFromToken(token) {
  if (!token || !token.startsWith('demo:')) return null;
  const id = token.slice(5);
  return USERS.find(u => u.id === id) ?? null;
}

function userOut(u) {
  return { id: u.id, email: u.email, full_name: u.full_name, role: u.role, company_name: u.company_name, company_id: u.company_id };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function filterTickets(params = {}) {
  let list = [..._tickets];
  if (params.status) list = list.filter(t => t.status === params.status);
  if (params.company_id) list = list.filter(t => t.company_id === params.company_id);
  if (params.search) {
    const q = params.search.toLowerCase();
    list = list.filter(t =>
      t.ticket_number.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      t.requester.name.toLowerCase().includes(q)
    );
  }
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ── Mock API ──────────────────────────────────────────────────────────────────

export const mockApi = {
  // Auth
  async login(email, password) {
    const u = USERS.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!u) throw new Error('Incorrect email or password.');
    _currentUser = u;
    return { access_token: `demo:${u.id}`, token_type: 'bearer', user: userOut(u) };
  },

  async me() {
    const token = localStorage.getItem('tb_token');
    const u = _currentUser ?? getUserFromToken(token);
    if (!u) throw new Error('Not authenticated');
    _currentUser = u;
    return userOut(u);
  },

  async updateProfile({ full_name }) {
    if (!_currentUser) throw new Error('Not authenticated');
    _currentUser = { ..._currentUser, full_name };
    return userOut(_currentUser);
  },

  async changePassword({ current_password, new_password }) {
    if (!_currentUser) throw new Error('Not authenticated');
    if (_currentUser.password !== current_password) throw new Error('Current password is incorrect');
    if (new_password.length < 12) throw new Error('Password must contain: at least 12 characters');
    _currentUser = { ..._currentUser, password: new_password };
    return { ok: true };
  },

  // Tickets
  async listTickets(params) { return filterTickets(params); },
  async getTicket(id) { return _tickets.find(t => t.id === id) ?? null; },

  async createTicket(data) {
    const n = _tickets.length + 1;
    const companyName = COMPANIES.find(c => c.id === data.company_id)?.name ?? null;
    const agentName = USERS.find(u => u.id === data.assignee_id)?.full_name ?? null;
    const t = {
      id: uid(), ticket_number: `TKT-${String(n).padStart(3,'0')}`,
      title: data.title, description: data.description ?? '',
      status: 'OPEN', priority: data.priority,
      requester: { name: data.requester_name, email: data.requester_email ?? '', dept: data.requester_dept ?? '' },
      assignee: agentName, assignee_id: data.assignee_id ?? null,
      company_id: data.company_id ?? null, company_name: companyName,
      tags: data.tags ?? [], sla_breached: false,
      satisfaction_score: null, satisfaction_note: null, system_info: null,
      createdAt: now(), updatedAt: now(),
      acknowledgedAt: null, resolvedAt: null, closedAt: null,
      attachments: [],
      logs: [{ id: uid(), actor: _currentUser?.full_name ?? 'Agent', action: 'opened ticket', timestamp: now(), meta: {}, is_internal: false }],
    };
    _tickets.unshift(t);
    return t;
  },

  async updateTicket(id, changes) {
    const idx = _tickets.findIndex(t => t.id === id);
    if (idx === -1) throw new Error('Ticket not found');
    const t = { ..._tickets[idx], ...changes, updatedAt: now() };
    if (changes.assignee_id !== undefined) {
      t.assignee = USERS.find(u => u.id === changes.assignee_id)?.full_name ?? null;
    }
    if (changes.status === 'RESOLVED' && !t.resolvedAt) t.resolvedAt = now();
    if (changes.status === 'CLOSED' && !t.closedAt) t.closedAt = now();
    if (changes.status && !t.acknowledgedAt &&
        ['ACKNOWLEDGED','IN PROGRESS','ESCALATED','PENDING CLIENT','RESOLVED','CLOSED'].includes(changes.status)) {
      t.acknowledgedAt = now();
    }
    _tickets[idx] = t;
    return t;
  },

  async addLog(ticketId, actorLabel, action, meta = {}, isInternal = false) {
    const idx = _tickets.findIndex(t => t.id === ticketId);
    if (idx === -1) throw new Error('Ticket not found');
    _tickets[idx].logs.push({ id: uid(), actor: actorLabel, action, timestamp: now(), meta, is_internal: isInternal });
    _tickets[idx].updatedAt = now();
    return _tickets[idx];
  },

  async addSatisfaction(ticketId, score, note) {
    return this.updateTicket(ticketId, { satisfaction_score: score, satisfaction_note: note });
  },

  async splitTicket(id, { title2, description2 }) {
    const orig = _tickets.find(t => t.id === id);
    if (!orig) throw new Error('Not found');
    const child = await this.createTicket({ ...orig, title: title2, description: description2 });
    await this.addLog(id, _currentUser?.full_name ?? 'Agent', `split → ${child.ticket_number}`);
    return [orig, child];
  },

  async mergeTicket(id, { merge_into_id, reason }) {
    const target = _tickets.find(t => t.id === merge_into_id);
    if (!target) throw new Error('Target not found');
    await this.updateTicket(id, { status: 'CLOSED' });
    await this.addLog(merge_into_id, _currentUser?.full_name ?? 'Agent', `merged from TKT-${id} — ${reason}`);
    return target;
  },

  // Agents & companies
  async listAgents() {
    return USERS.filter(u => ['AGENT','SENIOR_AGENT','TEAM_MANAGER','SYSTEM_ADMIN'].includes(u.role))
      .map(u => ({ id: u.id, full_name: u.full_name, email: u.email, role: u.role }));
  },

  async listCompanies() { return [...COMPANIES]; },
  async createCompany({ name }) {
    const c = { id: uid(), name, is_active: true };
    COMPANIES.push(c);
    return c;
  },
  async updateCompany(id, data) {
    const idx = COMPANIES.findIndex(c => c.id === id);
    if (idx !== -1) COMPANIES[idx] = { ...COMPANIES[idx], ...data };
    return COMPANIES[idx];
  },

  // Users (admin panel)
  async listUsers() { return USERS.map(userOut); },
  async createUser(data) {
    const u = { id: uid(), password: 'DemoAgent1!xx', company_name: null, company_id: null, ...data };
    USERS.push(u);
    return userOut(u);
  },
  async updateUser(id, data) {
    const idx = USERS.findIndex(u => u.id === id);
    if (idx !== -1) Object.assign(USERS[idx], data);
    return userOut(USERS[idx]);
  },
  async deleteUser(id) { return { ok: true }; },
  async resetUserPassword(id) { return { ok: true }; },
  async assignUserToCompany(userId, companyId) { return { ok: true }; },
  async removeUserFromCompany(userId, companyId) { return { ok: true }; },
  async getUserCompanies(userId) {
    const u = USERS.find(u => u.id === userId);
    return u?.company_id ? COMPANIES.filter(c => c.id === u.company_id) : [];
  },

  // KB
  async listKBArticles(params = {}) {
    let list = _kb.filter(a => !a.is_archived);
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(a => a.title.toLowerCase().includes(q) || (a.tags || []).some(t => t.includes(q)));
    }
    if (params.category) list = list.filter(a => a.category === params.category);
    return list;
  },
  async getKBArticle(id) { return _kb.find(a => a.id === id) ?? null; },
  async createKBArticle(data) {
    const a = { id: uid(), is_archived: false, author: { full_name: _currentUser?.full_name ?? 'Agent' }, createdAt: now(), updatedAt: now(), ...data };
    _kb.push(a);
    return a;
  },
  async updateKBArticle(id, data) {
    const idx = _kb.findIndex(a => a.id === id);
    if (idx !== -1) _kb[idx] = { ..._kb[idx], ...data, updatedAt: now() };
    return _kb[idx];
  },
  async suggestKBEdit(articleId, data) { return { id: uid(), status: 'PENDING', ...data }; },
  async listKBEditRequests() { return []; },
  async updateKBEditRequest(id, data) { return { id, ...data }; },

  // Announcements
  async listAnnouncements() {
    return [..._announcements].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },
  async createAnnouncement(data) {
    const a = { id: uid(), author: { full_name: _currentUser?.full_name ?? 'Agent' }, createdAt: now(), updatedAt: now(), ...data };
    _announcements.unshift(a);
    return a;
  },
  async updateAnnouncement(id, data) {
    const idx = _announcements.findIndex(a => a.id === id);
    if (idx !== -1) _announcements[idx] = { ..._announcements[idx], ...data, updatedAt: now() };
    return _announcements[idx];
  },
  async deleteAnnouncement(id) {
    _announcements = _announcements.filter(a => a.id !== id);
    return { ok: true };
  },

  // Tasks
  async listTasks() { return [..._tasks]; },
  async createTask(data) {
    const assignee = USERS.find(u => u.id === data.assignee_id);
    const t = { id: uid(), assignee: assignee ? { id: assignee.id, full_name: assignee.full_name } : null, created_by: { full_name: _currentUser?.full_name ?? 'Agent' }, createdAt: now(), updatedAt: now(), ...data };
    _tasks.push(t);
    return t;
  },
  async updateTask(id, data) {
    const idx = _tasks.findIndex(t => t.id === id);
    if (idx !== -1) _tasks[idx] = { ..._tasks[idx], ...data, updatedAt: now() };
    return _tasks[idx];
  },
  async deleteTask(id) {
    _tasks = _tasks.filter(t => t.id !== id);
    return { ok: true };
  },

  async getReports() {
    const open = _tickets.filter(t => !['CLOSED','CANCELLED','RESOLVED'].includes(t.status)).length;
    const breached = _tickets.filter(t => t.sla_breached).length;
    const ratings = _tickets.filter(t => t.satisfaction_score != null).map(t => t.satisfaction_score);
    const avg_satisfaction = ratings.length ? Math.round(ratings.reduce((a,b) => a+b,0) / ratings.length * 10) / 10 : null;
    const by_priority = { P1: 2, P2: 4, P3: 3, P4: 2, P5: 1 };
    const by_status = {};
    _tickets.forEach(t => { by_status[t.status] = (by_status[t.status] || 0) + 1; });
    const daily_volume = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - (13 - i) * 86400000);
      return { date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), count: Math.floor(Math.random() * 4) + 1 };
    });
    const dist = { '1': 0, '2': 0, '3': 0, '4': 1, '5': 2 };
    return {
      total: _tickets.length, open, breached, avg_satisfaction,
      daily_volume,
      sla_compliance: { P1: 60, P2: 75, P3: 90, P4: 95, P5: 98 },
      by_status, by_priority,
      avg_resolution_hours: { P1: 3.2, P2: 5.1, P3: 12.4, P4: 24.0, P5: null },
      satisfaction_dist: dist,
      agent_stats: [
        { id: 'u-sam',    name: 'Sam Riley',   role: 'AGENT',        assigned: 4, resolved: 1, avg_resolution: 4.2, avg_satisfaction: 5 },
        { id: 'u-jamie',  name: 'Jamie Lee',   role: 'AGENT',        assigned: 2, resolved: 1, avg_resolution: 8.1, avg_satisfaction: 5 },
        { id: 'u-priya',  name: 'Priya Patel', role: 'SENIOR_AGENT', assigned: 3, resolved: 1, avg_resolution: 6.0, avg_satisfaction: 4 },
        { id: 'u-marcus', name: 'Marcus Webb', role: 'TEAM_MANAGER', assigned: 2, resolved: 0, avg_resolution: null, avg_satisfaction: null },
      ],
    };
  },

  async getReportSummary() { return this.getReports(); },

  // Emergency contacts
  async listEmergencyContacts() { return [..._emergency]; },
  async createEmergencyContact(data) {
    const c = { id: uid(), ...data };
    _emergency.push(c);
    return c;
  },
  async updateEmergencyContact(id, data) {
    const idx = _emergency.findIndex(c => c.id === id);
    if (idx !== -1) _emergency[idx] = { ..._emergency[idx], ...data };
    return _emergency[idx];
  },
  async deleteEmergencyContact(id) {
    _emergency = _emergency.filter(c => c.id !== id);
    return { ok: true };
  },

  // KB — names matching real api.js
  async listArticles(params) { return this.listKBArticles(params); },
  async getArticle(id) { return this.getKBArticle(id); },
  async createArticle(data) { return this.createKBArticle(data); },
  async updateArticle(id, data) { return this.updateKBArticle(id, data); },
  async archiveArticle(id) { return this.updateKBArticle(id, { is_archived: true }); },
  async listCategories() { return [...new Set(_kb.map(a => a.category))]; },

  async getAgentDetail(id) {
    const agent = USERS.find(u => u.id === id);
    const myTickets = _tickets.filter(t => t.assignee_id === id);
    return { agent: agent ? { full_name: agent.full_name, role: agent.role } : null, tickets: myTickets, resolved: myTickets.filter(t => t.status === 'RESOLVED').length };
  },

  // Emergency — name matching real api.js
  async getEmergencyContacts() { return this.listEmergencyContacts(); },

  // Satisfaction — name matching real api.js
  async submitSatisfaction(id, score, note) { return this.addSatisfaction(id, score, note); },

  // Companies extras
  async listAllCompanies() { return [...COMPANIES]; },
  async setCompanyAgents() { return { ok: true }; },

  // Queue position
  async getQueuePosition(id) {
    const t = _tickets.find(t => t.id === id);
    return { position: t ? _tickets.filter(x => x.status === 'OPEN' && x.createdAt < t.createdAt).length + 1 : 1 };
  },

  // Stubs
  async sendSMS() { return { ok: true }; },
  async twilioStatus() { return { configured: false }; },
  async teamsNotify() { return { ok: true }; },
  async claude() { return { suggestion: 'Demo mode — AI suggestions not available.' }; },
  async uploadAttachment() { return { ok: true }; },
  async downloadAttachment() { return { ok: true }; },
  async deleteAttachment() { return { ok: true }; },
};
