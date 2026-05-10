import { mockApi } from './mockApi.js';
const DEMO = import.meta.env.VITE_DEMO_MODE === 'true';
const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

function getToken() {
  return localStorage.getItem('tb_token');
}

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem('tb_token');
    window.location.reload();
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }

  return res.json();
}

const _realApi = {
  // Auth
  login: (email, password) => {
    const form = new URLSearchParams({ username: email, password });
    return fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    }).then(async r => {
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.detail || 'Login failed');
      }
      return r.json();
    });
  },
  me: () => req('GET', '/auth/me'),
  changePassword: (current_password, new_password) =>
    req('POST', '/auth/change-password', { current_password, new_password }),
  updateProfile: full_name => req('PATCH', '/auth/profile', { full_name }),

  // Tickets
  listTickets: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.search) qs.set('search', params.search);
    if (params.company_id) qs.set('company_id', params.company_id);
    return req('GET', `/tickets?${qs}`);
  },
  getTicket: id => req('GET', `/tickets/${id}`),
  createTicket: body => req('POST', '/tickets', body),
  updateTicket: (id, changes) => req('PATCH', `/tickets/${id}`, changes),
  addLog: (id, actor_label, action, meta = {}, is_internal = false) =>
    req('POST', `/tickets/${id}/logs`, { actor_label, action, meta, is_internal }),
  listAgents: () => req('GET', '/tickets/meta/agents'),
  getQueuePosition: id => req('GET', `/tickets/meta/queue-position/${id}`),

  // Emergency contacts
  getEmergencyContacts: () => req('GET', '/emergency-contacts'),

  // Tasks
  listTasks: () => req('GET', '/tasks'),
  createTask: body => req('POST', '/tasks', body),
  updateTask: (id, body) => req('PATCH', `/tasks/${id}`, body),
  deleteTask: id => req('DELETE', `/tasks/${id}`),

  // Announcements
  listAnnouncements: () => req('GET', '/announcements'),
  createAnnouncement: body => req('POST', '/announcements', body),
  updateAnnouncement: (id, body) => req('PATCH', `/announcements/${id}`, body),
  deleteAnnouncement: id => req('DELETE', `/announcements/${id}`),

  // Companies
  listCompanies: () => req('GET', '/companies'),
  listAllCompanies: () => req('GET', '/companies/all'),
  createCompany: body => req('POST', '/companies', body),
  updateCompany: (id, body) => req('PATCH', `/companies/${id}`, body),
  setCompanyAgents: (id, agent_ids) => req('PUT', `/companies/${id}/agents`, { agent_ids }),

  // Users (System Admin)
  listUsers: () => req('GET', '/users'),
  createUser: body => req('POST', '/users', body),
  updateUser: (id, body) => req('PATCH', `/users/${id}`, body),

  // Reports
  getReportSummary: () => req('GET', '/reports/summary'),
  getAgentDetail: id => req('GET', `/reports/agents/${id}`),

  // KB edit requests
  suggestKBEdit: (articleId, suggestion) => req('POST', `/kb/${articleId}/suggest-edit`, { suggestion }),
  listKBEditRequests: () => req('GET', '/kb/edit-requests'),
  updateKBEditRequest: (id, status) => req('PATCH', `/kb/edit-requests/${id}`, { status }),

  // Notifications
  sendSMS: body => req('POST', '/notifications/sms', body),
  twilioStatus: () => req('GET', '/notifications/twilio-status'),

  // Knowledge base
  listArticles: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category) qs.set('category', params.category);
    if (params.include_archived) qs.set('include_archived', 'true');
    return req('GET', `/kb?${qs}`);
  },
  getArticle: id => req('GET', `/kb/${id}`),
  listCategories: () => req('GET', '/kb/categories'),
  createArticle: body => req('POST', '/kb', body),
  updateArticle: (id, body) => req('PATCH', `/kb/${id}`, body),
  archiveArticle: id => req('DELETE', `/kb/${id}`),

  // Attachments
  uploadAttachment: (ticketId, file) => {
    const form = new FormData();
    form.append('file', file);
    const token = localStorage.getItem('tb_token');
    return fetch(`${BASE}/attachments/tickets/${ticketId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: form,
    }).then(async r => {
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.detail || 'Upload failed');
      }
      return r.json();
    });
  },
  downloadAttachment: async (attachmentId, fileName) => {
    const token = localStorage.getItem('tb_token');
    const res = await fetch(`${BASE}/attachments/${attachmentId}/download`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  },
  deleteAttachment: id => req('DELETE', `/attachments/${id}`),

  // Auth extras
  activateAccount: (token, new_password) => req('POST', '/auth/activate', { token, new_password }),
  setup2fa: () => req('GET', '/auth/2fa/setup'),
  enable2fa: (totp_code) => req('POST', '/auth/2fa/enable', { totp_code }),
  disable2fa: (totp_code) => req('POST', '/auth/2fa/disable', { totp_code }),
  verifyMfa: (mfa_token, totp_code) => req('POST', '/auth/2fa/verify', { mfa_token, totp_code }),
  azureLogin: (access_token) => req('POST', '/auth/azure', { access_token }),

  // Users extras
  inviteUser: (userId) => req('POST', `/users/${userId}/invite`),

  // Reports export
  downloadReport: async (format) => {
    const token = localStorage.getItem('tb_token');
    const base = (import.meta.env.VITE_API_URL || '') + '/api';
    const res = await fetch(`${base}/reports/summary/export/${format}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-beacon-report.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  },

  submitSatisfaction: (id, score, note = '') =>
    req('POST', `/tickets/${id}/satisfaction`, { score, note }),

  splitTicket: (id, body) => req('POST', `/tickets/${id}/split`, body),
  mergeTicket: (id, target_ticket_number) => req('POST', `/tickets/${id}/merge`, { target_ticket_number }),

  // Integrations
  teamsNotify: (webhook_url, payload) => req('POST', '/integrations/teams-notify', { webhook_url, payload }),

  // Claude proxy (same callClaude shape)
  claude: (system, user, model = 'claude-sonnet-4-6') =>
    req('POST', '/claude', {
      model,
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: user }],
    }).then(data => {
      const text = data.content?.find(b => b.type === 'text')?.text || '{}';
      try {
        return JSON.parse(text.replace(/```json|```/g, '').trim());
      } catch {
        return { raw: text };
      }
    }),
};

export const api = DEMO ? mockApi : _realApi;
