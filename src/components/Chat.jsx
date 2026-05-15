import { useState, useEffect, useRef, useCallback } from 'react';
import { C } from '../constants/theme.js';
import { api } from '../utils/api.js';
import { useToast } from '../utils/toast.jsx';

const STATUS_COLOR = { online: '#4ade80', away: '#fbbf24', busy: '#ef4444', offline: '#6b7280' };
const STATUS_LABEL = { online: 'Online', away: 'Away', busy: 'Busy', offline: 'Offline' };

function Avatar({ name, size = 34, status }) {
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: C.accentDim, border: `1px solid ${C.accent}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.35, fontWeight: 700, color: C.accentLight,
      }}>
        {initials}
      </div>
      {status && (
        <span style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 10, height: 10, borderRadius: '50%',
          background: STATUS_COLOR[status] || '#6b7280',
          border: `2px solid ${C.surface}`,
        }} />
      )}
    </div>
  );
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function Chat({ currentUser }) {
  const toast = useToast();
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  const loadAgents = useCallback(() => {
    api.chatAgents().then(setAgents).catch(() => {});
  }, []);

  const loadMessages = useCallback(() => {
    if (!selectedAgent) return;
    api.chatMessages(selectedAgent.id).then(msgs => {
      setMessages(msgs);
      // Refresh agents to reset unread count
      loadAgents();
    }).catch(() => {});
  }, [selectedAgent, loadAgents]);

  useEffect(() => { loadAgents(); }, [loadAgents]);

  useEffect(() => {
    if (!selectedAgent) return;
    loadMessages();
    pollRef.current = setInterval(loadMessages, 5000);
    return () => clearInterval(pollRef.current);
  }, [selectedAgent, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e) {
    e?.preventDefault();
    if (!input.trim() || !selectedAgent) return;
    setSending(true);
    try {
      const msg = await api.chatSend(selectedAgent.id, input.trim());
      setMessages(prev => [...prev, msg]);
      setInput('');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  }

  const filtered = agents.filter(a =>
    a.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const totalUnread = agents.reduce((s, a) => s + (a.unread_count || 0), 0);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: C.bg }}>
      {/* Agent list */}
      <div style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', background: C.surface }}>
        <div style={{ padding: '16px 14px 10px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>
            Messages
            {totalUnread > 0 && (
              <span style={{ marginLeft: 8, background: C.accent, color: C.white, borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 7px' }}>
                {totalUnread}
              </span>
            )}
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents…"
            style={{ width: '100%', background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', color: C.text, fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map(agent => {
            const selected = selectedAgent?.id === agent.id;
            return (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', cursor: 'pointer',
                  background: selected ? C.accentDim : 'transparent',
                  borderLeft: `3px solid ${selected ? C.accent : 'transparent'}`,
                }}
              >
                <Avatar name={agent.full_name} size={36} status={agent.profile_status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: agent.unread_count > 0 ? 700 : 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {agent.full_name}
                  </div>
                  <div style={{ fontSize: 10, color: STATUS_COLOR[agent.profile_status] || C.muted }}>
                    {STATUS_LABEL[agent.profile_status] || 'Online'}
                    <span style={{ color: C.dim, marginLeft: 4 }}>· {agent.role.replace(/_/g, ' ')}</span>
                  </div>
                </div>
                {agent.unread_count > 0 && (
                  <span style={{ background: C.accent, color: C.white, borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px', flexShrink: 0 }}>
                    {agent.unread_count}
                  </span>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 24, fontSize: 12, color: C.dim, textAlign: 'center' }}>No agents found</div>
          )}
        </div>

        {/* Own status */}
        <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Your status</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {Object.entries(STATUS_COLOR).map(([s, color]) => (
              <button
                key={s}
                onClick={async () => {
                  try {
                    await api.chatUpdateProfile(s, undefined);
                    loadAgents();
                  } catch (e) { toast(e.message, 'error'); }
                }}
                title={STATUS_LABEL[s]}
                style={{
                  width: 22, height: 22, borderRadius: '50%', border: `2px solid ${C.border}`,
                  background: color, cursor: 'pointer', flexShrink: 0,
                  opacity: currentUser.profile_status === s ? 1 : 0.35,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Message thread */}
      {selectedAgent ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Thread header */}
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, background: C.surface, flexShrink: 0 }}>
            <Avatar name={selectedAgent.full_name} size={36} status={selectedAgent.profile_status} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{selectedAgent.full_name}</div>
              <div style={{ fontSize: 11, color: STATUS_COLOR[selectedAgent.profile_status] || C.muted }}>
                {STATUS_LABEL[selectedAgent.profile_status] || 'Online'}
                {selectedAgent.profile_bio && <span style={{ color: C.dim }}> · {selectedAgent.profile_bio}</span>}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: C.dim, fontSize: 13, marginTop: 40 }}>
                No messages yet. Say hello to {selectedAgent.full_name.split(' ')[0]}!
              </div>
            )}
            {messages.map((msg, i) => {
              const isMine = msg.sender_id === currentUser.id;
              const showDate = i === 0 || new Date(messages[i-1].created_at).toDateString() !== new Date(msg.created_at).toDateString();
              return (
                <div key={msg.id}>
                  {showDate && (
                    <div style={{ textAlign: 'center', fontSize: 10, color: C.dim, margin: '8px 0' }}>
                      {new Date(msg.created_at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
                    {!isMine && <Avatar name={selectedAgent.full_name} size={28} />}
                    <div style={{ maxWidth: '70%' }}>
                      <div style={{
                        padding: '8px 12px', borderRadius: isMine ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                        background: isMine ? C.accent : C.card,
                        border: isMine ? 'none' : `1px solid ${C.border}`,
                        color: isMine ? C.white : C.text,
                        fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
                      }}>
                        {msg.content}
                      </div>
                      <div style={{ fontSize: 10, color: C.dim, marginTop: 3, textAlign: isMine ? 'right' : 'left' }}>
                        {fmtTime(msg.created_at)}
                        {isMine && msg.read_at && <span style={{ marginLeft: 6 }}>✓✓</span>}
                      </div>
                    </div>
                    {isMine && <Avatar name={currentUser.full_name} size={28} />}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, background: C.surface, display: 'flex', gap: 10, flexShrink: 0 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={`Message ${selectedAgent.full_name.split(' ')[0]}…`}
              style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 14px', color: C.text, fontSize: 13, outline: 'none' }}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              style={{ padding: '0 18px', background: input.trim() ? C.accent : C.accentDim, border: 'none', borderRadius: 8, color: C.white, fontSize: 14, fontWeight: 700, cursor: input.trim() ? 'pointer' : 'default' }}
            >
              ↑
            </button>
          </form>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: C.dim }}>
          <div style={{ fontSize: 32 }}>💬</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>Select an agent to start messaging</div>
          <div style={{ fontSize: 12, color: C.dim }}>Agent-to-agent messages only — clients cannot see this</div>
        </div>
      )}
    </div>
  );
}
