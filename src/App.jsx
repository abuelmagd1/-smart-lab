import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy, useEffect, useState } from 'react'
import { supabase } from './supabase'

const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const NewPatient = lazy(() => import('./pages/NewPatient'))
const Results = lazy(() => import('./pages/Results'))
const AIAssistant = lazy(() => import('./pages/AIAssistant'))
const Reports = lazy(() => import('./pages/Reports'))
const Layout = lazy(() => import('./components/Layout'))
const AdminLayout = lazy(() => import('./components/AdminLayout'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AddLab = lazy(() => import('./pages/admin/AddLab'))
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications'))

function App() {
  const [session, setSession] = useState(undefined)
  const [role, setRole] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
      else setRole(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const fetchRole = async (userId) => {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
    if (error) {
      console.error('فشل جلب صلاحية المستخدم:', error)
    }
    setRole(data?.role || 'doctor')
  }

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>جارٍ التحميل...</div>
      </div>
    )
  }

  if (session && role === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>جارٍ تجهيز الحساب...</div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center" dir="rtl"><div className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>جارٍ تحميل الصفحة...</div></div>}>
        <Routes>
          <Route path="/login" element={!session ? <Login /> : <Navigate to={role === 'admin' ? '/admin' : '/dashboard'} />} />
          <Route path="/" element={<Navigate to={!session ? '/login' : role === 'admin' ? '/admin' : '/dashboard'} />} />

          {/* مسارات الدكتور */}
          <Route element={session && role === 'doctor' ? <Layout /> : <Navigate to="/login" />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/new-patient" element={<NewPatient />} />
            <Route path="/results" element={<Results />} />
            <Route path="/ai-assistant" element={<AIAssistant />} />
            <Route path="/reports" element={<Reports />} />
          </Route>

          {/* مسارات الأدمن */}
          <Route element={session && role === 'admin' ? <AdminLayout /> : <Navigate to="/login" />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/add-lab" element={<AddLab />} />
            <Route path="/admin/notifications" element={<AdminNotifications />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App