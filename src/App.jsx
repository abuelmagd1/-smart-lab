import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewPatient from './pages/NewPatient'
import Results from './pages/Results'
import AIAssistant from './pages/AIAssistant'
import Reports from './pages/Reports'
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AddLab from './pages/admin/AddLab'
import AdminNotifications from './pages/admin/AdminNotifications'

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

  if (session === undefined || (session && role === null)) return null

  return (
    <BrowserRouter>
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
    </BrowserRouter>
  )
}

export default App