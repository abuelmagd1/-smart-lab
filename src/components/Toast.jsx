import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

let idCounter = 0

const typeStyles = {
  success: { bg: '#d1fae5', color: '#065f46', icon: '✅' },
  error: { bg: '#fee2e2', color: '#dc2626', icon: '⚠️' },
  info: { bg: '#e8f0fe', color: '#1a2456', icon: 'ℹ️' },
  warning: { bg: '#fef3c7', color: '#92400e', icon: '⚡' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const showToast = useCallback((message, type, duration, action) => {
    const finalType = type || 'info'
    const finalDuration = duration || 3500
    const id = ++idCounter
    setToasts(prev => [...prev, { id, message, type: finalType, action: action || null }])
    setTimeout(() => removeToast(id), finalDuration)
    return id
  }, [removeToast])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: '10px',
          maxWidth: '380px',
          pointerEvents: 'none',
        }}
        dir="rtl"
      >
        {toasts.map(t => {
          const s = typeStyles[t.type] || typeStyles.info
          return (
            <div key={t.id}
              style={{
                background: s.bg,
                color: s.color,
                padding: '12px 16px',
                borderRadius: '12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
                fontSize: '14px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                animation: 'toast-slide-in 0.25s ease',
                pointerEvents: 'auto',
              }}>
              <span style={{ flexShrink: 0 }}>{s.icon}</span>
              <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
              {t.action && (
                <button onClick={() => { t.action.onClick(); removeToast(t.id) }}
                  style={{
                    background: 'rgba(0,0,0,0.08)',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    color: s.color,
                    fontSize: '13px',
                    fontWeight: 700,
                    padding: '5px 10px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}>
                  {t.action.label}
                </button>
              )}
              <button onClick={() => removeToast(t.id)}
                aria-label="إغلاق التنبيه"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: s.color,
                  fontSize: '15px',
                  lineHeight: 1,
                  opacity: 0.6,
                  flexShrink: 0,
                }}>
                ✕
              </button>
            </div>
          )
        })}
      </div>
      <style>{`
        @keyframes toast-slide-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast لازم يتستخدم جوه ToastProvider')
  }
  return ctx.showToast
}
