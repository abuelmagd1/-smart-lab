import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { ToastProvider } from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import NetworkStatusWatcher from './components/NetworkStatusWatcher'
import SessionWatcher from './components/SessionWatcher'
import ReferringDoctors from './pages/ReferringDoctors'
import Supplies from './pages/Supplies'
import PatientPortal from './pages/PatientPortal'


const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const NewPatient = lazy(() => import('./pages/NewPatient'))
const Results = lazy(() => import('./pages/Results'))
const AIAssistant = lazy(() => import('./pages/AIAssistant'))
const Reports = lazy(() => import('./pages/Reports'))
const Statistics = lazy(() => import('./pages/Statistics'))
const Layout = lazy(() => import('./components/Layout'))
const AdminLayout = lazy(() => import('./components/AdminLayout'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AddLab = lazy(() => import('./pages/admin/AddLab'))
const AdminNotifications = lazy(() => import('./pages/admin/AdminNotifications'))

function App() {
  const [session, setSession] = useState(undefined)
  const [role, setRole] = useState(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState(undefined) // undefined = لسه بنتأكد، null = مفيش تاريخ انتهاء (مفتوح)، Date = تاريخ الانتهاء

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) fetchRole(session.user.id)
      else { setRole(null); setSubscriptionStatus(undefined) }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const fetchRole = async (userId) => {
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
    if (error) {
      console.error('فشل جلب صلاحية المستخدم:', error)
    }
    const userRole = data?.role || 'doctor'
    setRole(userRole)

    if (userRole === 'doctor') {
      checkSubscription(userId)
    } else {
      setSubscriptionStatus(null)
    }
  }

  const checkSubscription = async (userId) => {
    const { data } = await supabase.from('lab_settings').select('subscription_expires_at').eq('user_id', userId).maybeSingle()
    setSubscriptionStatus(data?.subscription_expires_at ? new Date(data.subscription_expires_at) : null)
  }

  const isSubscriptionExpired = role === 'doctor' && subscriptionStatus instanceof Date && subscriptionStatus.getTime() < Date.now()

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>جارٍ التحميل...</div>
      </div>
    )
  }

  if (session && (role === null || subscriptionStatus === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>جارٍ تجهيز الحساب...</div>
      </div>
    )
  }

  if (session && isSubscriptionExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="bg-white rounded-2xl p-8 w-full max-w-md text-center" style={{ border: '1px solid var(--outline-variant)' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏰</div>
          <h1 className="text-lg font-bold mb-2" style={{ color: 'var(--on-surface)' }}>انتهى اشتراكك</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--on-surface-variant)' }}>
            اشتراكك في النظام انتهى بتاريخ {subscriptionStatus.toLocaleDateString('ar-EG')}. بياناتك محفوظة وآمنة، تواصل مع الدعم الفني لتجديد الاشتراك.
          </p>
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--primary-container)' }}>
            تسجيل الخروج
          </button>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
      <ToastProvider>
        <NetworkStatusWatcher />
        <SessionWatcher />
        <BrowserRouter>
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center" dir="rtl"><div className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>جارٍ تحميل الصفحة...</div></div>}>
            <Routes>
              <Route path="/login" element={!session ? <Login /> : <Navigate to={role === 'admin' ? '/admin' : '/dashboard'} />} />
              <Route path="/" element={<Navigate to={!session ? '/login' : role === 'admin' ? '/admin' : '/dashboard'} />} />
              <Route path="/portal/:code" element={<PatientPortal />} />
              <Route element={session && role === 'doctor' ? <Layout /> : <Navigate to="/login" />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/new-patient" element={<NewPatient />} />
                <Route path="/results" element={<Results />} />
                <Route path="/ai-assistant" element={<AIAssistant />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/statistics" element={<Statistics />} />
                <Route path="/supplies" element={<Supplies />} />
                <Route path="/referring-doctors" element={<ReferringDoctors />} />
            
              </Route>

              <Route element={session && role === 'admin' ? <AdminLayout /> :<Navigate to="/login" />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/add-lab" element={<AddLab />} />
                
                <Route path="/admin/notifications" element={<AdminNotifications />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App