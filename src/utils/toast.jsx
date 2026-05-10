import { createContext, useContext, useState, useCallback } from 'react';
import { C } from '../constants/theme.js';

const ToastContext = createContext(null);

let _id = 0;

const STYLES = {
  success: { bg: '#052010', border: '#14532d', text: '#4ade80', icon: '✓' },
  error:   { bg: '#2d0a0a', border: '#7f1d1d', text: '#f87171', icon: '✕' },
  info:    { bg: C.card,    border: C.border,   text: C.muted,  icon: 'ℹ' },
};

function ToastItem({ toast, onDismiss }) {
  const s = STYLES[toast.type] || STYLES.info;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      background: s.bg, border: `1px solid ${s.border}`,
      borderRadius: 8, padding: '10px 14px',
      minWidth: 260, maxWidth: 380,
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      animation: 'tb-slide-in 0.2s ease',
    }}>
      <span style={{ color: s.text, fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: s.text, lineHeight: 1.45 }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{ background: 'none', border: 'none', color: s.text, fontSize: 16, cursor: 'pointer', lineHeight: 1, opacity: 0.6, padding: 0, flexShrink: 0 }}
      >×</button>
    </div>
  );
}

function ToastContainer({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <>
      <style>{`
        @keyframes tb-slide-in {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{
        position: 'fixed', top: 16, right: 16,
        display: 'flex', flexDirection: 'column', gap: 8,
        zIndex: 999,
      }}>
        {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />)}
      </div>
    </>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message, type = 'info', duration = null) => {
    const id = ++_id;
    const ms = duration ?? (type === 'error' ? 6000 : 4000);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), ms);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
