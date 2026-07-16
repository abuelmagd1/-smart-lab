export default function LoadingSpinner({ label, size, fullHeight }) {
  const spinnerSize = size || 36
  const wrapperStyle = fullHeight
    ? { minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }
    : { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '40px 0' }

  return (
    <div style={wrapperStyle} dir="rtl">
      <div
        style={{
          width: spinnerSize,
          height: spinnerSize,
          border: '3px solid #e8f0fe',
          borderTopColor: 'var(--primary-container)',
          borderRadius: '50%',
          animation: 'lab-spin 0.7s linear infinite',
        }}
      />
      {label && (
        <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>{label}</p>
      )}
      <style>{`
        @keyframes lab-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
