import { Outlet, NavLink } from 'react-router-dom'
import { supabase } from '../supabase'

const navItems = [
  { label: 'لوحة التحكم', icon: '🏢', path: '/admin' },
  { label: 'إضافة معمل جديد', icon: '➕', path: '/admin/add-lab' },
  { label: 'إرسال إشعار', icon: '📢', path: '/admin/notifications' },
]

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen" style={{ background: 'var(--surface)' }} dir="rtl">

      {/* Sidebar */}
      <aside className="w-64 bg-white flex flex-col" style={{ borderLeft: '1px solid var(--outline-variant)', minHeight: '100vh' }}>

        {/* Logo */}
        <div className="p-5" style={{ borderBottom: '1px solid var(--outline-variant)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg" style={{ background: '#1a2456' }}>
              👑
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>Smart Lab</p>
              <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>لوحة الأدمن</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item, i) => (
            <NavLink
              key={i}
              to={item.path}
              end={item.path === '/admin'}
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all"
              style={({ isActive }) => ({
                background: isActive ? '#e8eaf6' : 'transparent',
                color: isActive ? '#1a2456' : 'var(--on-surface-variant)',
                fontWeight: isActive ? '600' : '400',
                borderRight: isActive ? '4px solid #1a2456' : '4px solid transparent',
              })}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-4" style={{ borderTop: '1px solid var(--outline-variant)' }}>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ background: '#1a2456' }}>
              👑
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--on-surface)' }}>الأدمن</p>
            </div>
            <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
              className="text-xs px-2 py-1 rounded-lg flex-shrink-0"
              style={{ background: '#fee2e2', color: '#dc2626' }}>
              خروج
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1">
        <div className="bg-white px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--outline-variant)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--on-surface)' }}>لوحة تحكم الأدمن</h2>
        </div>
        <Outlet />
      </main>

    </div>
  )
}