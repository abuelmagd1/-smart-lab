export default function EmptyState({ icon, title, subtitle, action }) {
  const displayIcon = icon || '📭'
  return (
    <div className="flex flex-col items-center justify-center text-center" style={{ padding: '48px 20px' }} dir="rtl">
      <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.7 }}>{displayIcon}</div>
      <p className="text-sm font-medium" style={{ color: 'var(--on-surface)' }}>{title}</p>
      {subtitle && (
        <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)', maxWidth: '280px' }}>{subtitle}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
