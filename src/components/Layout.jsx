import { Outlet, NavLink } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import ErrorBoundary from '../components/ErrorBoundary'

const navItems = [
  { label: 'لوحة التحكم', icon: '📊', path: '/dashboard' },
  { label: 'مريض جديد', icon: '➕', path: '/new-patient' },
  { label: 'نتائج التحاليل', icon: '🔬', path: '/results' },
  { label: 'المساعد الذكي', icon: '🤖', path: '/ai-assistant' },
  { label: 'التقارير', icon: '📄', path: '/reports' },
]

// بيحسب حالة اشتراك المعمل الحالي: منتهي / قرب ينتهي (٧ أيام أو أقل) / سارٍ / مش معروف
const getSubscriptionStatus = (expiresAt) => {
  if (!expiresAt) return null
  const expiry = new Date(expiresAt)
  const now = new Date()
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysLeft < 0) {
    return { key: 'expired', daysLeft, message: `اشتراكك منتهي من ${Math.abs(daysLeft)} يوم. كلّم إدارة النظام فورًا لتجديد الاشتراك وتجنب توقف الخدمة.` }
  }
  if (daysLeft <= 7) {
    return { key: 'soon', daysLeft, message: `اشتراكك هينتهي خلال ${daysLeft} يوم. برجاء التواصل مع إدارة النظام للتجديد قبل انتهائه.` }
  }
  return null
}

export default function Layout() {
  const [showNotifications, setShowNotifications] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [adminNotifications, setAdminNotifications] = useState([])
  const [lastSeenAt, setLastSeenAt] = useState(null)
  const [user, setUser] = useState(null)
  const [labName, setLabName] = useState('نظام إدارة المعامل الطبية')
  const [profileData, setProfileData] = useState({
    labName: 'نظام إدارة المعامل الطبية',
    doctorName: '', qualification: '', address: '', phone: '', email: '',
  })
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState({})
  const [savingProfile, setSavingProfile] = useState(false)
  const [showPasswordSection, setShowPasswordSection] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [msg, setMsg] = useState({ text: '', type: '' })

  // حالة اشتراك المعمل الحالي (لو قرب ينتهي أو انتهى) + هل البانر متقفل النهاردة
  const [subscriptionStatus, setSubscriptionStatus] = useState(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // Refs لقوائم الإشعارات والإعدادات، مستخدمة عشان نقفلهم لما تدوس برّاهم أو تدوس Escape
  const notificationsRef = useRef(null)
  const settingsRef = useRef(null)

  // شات "لابو" محفوظ هنا طول ما الـ Layout مش بيعمل remount
  // (يعني طول ما إنت جوه السيستم ومنقلتش بين الصفحات بـ refresh كامل)
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: 'أهلاً! أنا لابو 👋 قولي إيه اللي تعمله وأنا هعمله فوراً!' }
  ])
  const chatHistoryRef = useRef([])

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('appSettings')
      return saved ? JSON.parse(saved) : { fontSize: 'medium', timeFormat: '12', darkMode: false }
    } catch {
      return { fontSize: 'medium', timeFormat: '12', darkMode: false }
    }
  })

  useEffect(() => {
    getUser()
  }, [])

  // تطبيق حجم الخط فور تحميل الصفحة
  useEffect(() => {
    const sizeMap = { small: '13px', medium: '15px', large: '17px' }
    document.body.style.fontSize = sizeMap[settings.fontSize]
  }, [settings.fontSize])

  // تطبيق/إلغاء الوضع الليلي على عنصر <html> عشان يغطي الصفحة كلها بما فيها أي نوافذ منبثقة
  useEffect(() => {
    document.documentElement.classList.toggle('dark', !!settings.darkMode)
  }, [settings.darkMode])

  // قفل قائمة الإشعارات/الإعدادات لما تدوس برّاهم، أو تدوس Escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showNotifications && notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setShowNotifications(false)
      }
      if (showSettings && settingsRef.current && !settingsRef.current.contains(e.target)) {
        setShowSettings(false)
      }
    }
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setShowNotifications(false)
        setShowSettings(false)
        setShowProfile(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [showNotifications, showSettings])

  const saveSettings = (newSettings) => {
    setSettings(newSettings)
    localStorage.setItem('appSettings', JSON.stringify(newSettings))
    const sizeMap = { small: '13px', medium: '15px', large: '17px' }
    document.body.style.fontSize = sizeMap[newSettings.fontSize]
  }

  const getUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setUser(null)
      return
    }

    setUser(user)
    const { data, error } = await supabase.from('lab_settings').select('*').eq('user_id', user.id).maybeSingle()
    if (error) {
      console.error('فشل جلب بيانات المعمل:', error)
    }
    if (data) {
      const profile = {
        labName: data.lab_name || 'نظام إدارة المعامل الطبية',
        doctorName: data.doctor_name || '',
        qualification: data.qualification || '',
        address: data.address || '',
        phone: data.phone || '',
        email: data.email || '',
      }
      setProfileData(profile)
      setLabName(data.lab_name || 'نظام إدارة المعامل الطبية')

      // فحص حالة الاشتراك وعرض بانر لو قرب/انتهى
      const status = getSubscriptionStatus(data.subscription_expires_at)
      setSubscriptionStatus(status)
      if (status) {
        const today = new Date().toDateString()
        const dismissedOn = localStorage.getItem(`sub_banner_dismissed_${user.id}`)
        setBannerDismissed(dismissedOn === today)
      }
    }

    // قراءة آخر وقت فتح فيه هذا الحساب الإشعارات (محفوظ لكل حساب لوحده)
    const savedSeenAt = localStorage.getItem(`notif_last_seen_${user.id}`)
    setLastSeenAt(savedSeenAt)

    fetchAdminNotifications(user.id)
  }

  const fetchAdminNotifications = async (userId) => {
    try {
      // مسح الإشعارات اللي عدى عليها أسبوع كامل
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      await supabase.from('admin_notifications').delete().lt('created_at', weekAgo)

      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .or(`target_user_id.is.null,target_user_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) {
        console.error('فشل جلب الإشعارات:', error)
        return
      }
      setAdminNotifications(data || [])
    } catch (err) {
      console.error('حصل خطأ غير متوقع أثناء جلب الإشعارات:', err)
    }
  }

  // إخفاء بانر تنبيه الاشتراك لحد بكرة (بيرجع يظهر تاني اليوم اللي بعده لو لسه المشكلة قايمة)
  const dismissSubscriptionBanner = () => {
    if (!user) return
    localStorage.setItem(`sub_banner_dismissed_${user.id}`, new Date().toDateString())
    setBannerDismissed(true)
  }

  // فتح/قفل قائمة الإشعارات، ولما تفتح بنسجل إن المستخدم شافها لحد دلوقتي
  const toggleNotifications = () => {
    const opening = !showNotifications
    setShowNotifications(opening)
    setShowSettings(false)
    setShowProfile(false)

    if (opening && user) {
      const now = new Date().toISOString()
      localStorage.setItem(`notif_last_seen_${user.id}`, now)
      setLastSeenAt(now)
    }
  }

  const startEdit = () => {
    setEditData({ ...profileData })
    setEditMode(true)
    setMsg({ text: '', type: '' })
  }

  const cancelEdit = () => {
    setEditMode(false)
    setEditData({})
    setMsg({ text: '', type: '' })
  }

  const saveProfile = async () => {
    if (savingProfile) return
    setSavingProfile(true)
    setMsg({ text: '', type: '' })
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setMsg({ text: 'يجب تسجيل الدخول أولاً', type: 'error' })
        return
      }

      const trimmedData = {
        lab_name: (editData.labName || '').trim(),
        doctor_name: (editData.doctorName || '').trim(),
        qualification: (editData.qualification || '').trim(),
        address: (editData.address || '').trim(),
        phone: (editData.phone || '').trim(),
        email: (editData.email || '').trim(),
        updated_at: new Date().toISOString(),
      }

      const { data: existing } = await supabase.from('lab_settings').select('id').eq('user_id', user.id).maybeSingle()

      const { error } = existing
        ? await supabase.from('lab_settings').update(trimmedData).eq('user_id', user.id)
        : await supabase.from('lab_settings').insert([{ user_id: user.id, ...trimmedData }])

      if (error) {
        setMsg({ text: 'فشل حفظ البيانات: ' + error.message, type: 'error' })
        return
      }

      const savedProfile = {
        labName: trimmedData.lab_name,
        doctorName: trimmedData.doctor_name,
        qualification: trimmedData.qualification,
        address: trimmedData.address,
        phone: trimmedData.phone,
        email: trimmedData.email,
      }
      setProfileData(savedProfile)
      setLabName(savedProfile.labName || 'نظام إدارة المعامل الطبية')
      setEditMode(false)
      setMsg({ text: 'تم حفظ البيانات بنجاح ✅', type: 'success' })
      setTimeout(() => setMsg({ text: '', type: '' }), 2000)
    } catch (err) {
      setMsg({ text: 'حصل خطأ غير متوقع: ' + err.message, type: 'error' })
    } finally {
      setSavingProfile(false)
    }
  }

  const changePassword = async () => {
    if (changingPassword) return
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMsg({ text: 'من فضلك اكمل كل الحقول', type: 'error' }); return
    }
    if (newPassword !== confirmPassword) {
      setMsg({ text: 'كلمة السر الجديدة مش متطابقة', type: 'error' }); return
    }
    if (newPassword.length < 6) {
      setMsg({ text: 'كلمة السر لازم تكون 6 حروف على الأقل', type: 'error' }); return
    }

    setChangingPassword(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email, password: currentPassword,
      })
      if (signInError) {
        setMsg({ text: 'كلمة السر الحالية غلط', type: 'error' }); return
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setMsg({ text: 'حدث خطأ: ' + error.message, type: 'error' }); return
      }
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setShowPasswordSection(false)
      setMsg({ text: 'تم تغيير كلمة السر بنجاح ✅', type: 'success' })
      setTimeout(() => setMsg({ text: '', type: '' }), 2000)
    } catch (err) {
      setMsg({ text: 'حصل خطأ غير متوقع: ' + err.message, type: 'error' })
    } finally {
      setChangingPassword(false)
    }
  }

  // عداد "الجديد" بيحسب بس الإشعارات اللي وصلت بعد آخر مرة فتح فيها المستخدم القائمة
  const totalBadge = adminNotifications.filter(n =>
    !lastSeenAt || new Date(n.created_at) > new Date(lastSeenAt)
  ).length

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--surface)' }} dir="rtl">

      <aside className="w-64 bg-white flex flex-col" style={{ borderLeft: '1px solid var(--outline-variant)', minHeight: '100vh' }}>
        <div className="p-5" style={{ borderBottom: '1px solid var(--outline-variant)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center text-white text-lg flex-shrink-0"
              style={{ background: 'var(--primary-container)' }}>
              🔬
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>Smart Lab</p>
              <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>System</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item, i) => (
            <NavLink key={i} to={item.path}
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-all"
              style={({ isActive }) => ({
                background: isActive ? '#e8f0fe' : 'transparent',
                color: isActive ? 'var(--primary-container)' : 'var(--on-surface-variant)',
                fontWeight: isActive ? '600' : '400',
                borderRight: isActive ? '4px solid var(--primary-container)' : '4px solid transparent',
              })}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4" style={{ borderTop: '1px solid var(--outline-variant)' }}>
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowProfile(true); setShowNotifications(false); setShowSettings(false); setEditMode(false); setShowPasswordSection(false); setMsg({ text: '', type: '' }) }} aria-label="فتح الملف الشخصي"
              className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ background: 'var(--primary-container)' }}>
              أ
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--on-surface)' }}>الكيميائي</p>
              <p className="text-xs truncate" style={{ color: 'var(--on-surface-variant)' }}>{user?.email}</p>
            </div>
            <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
              className="text-xs px-2 py-1 rounded-lg flex-shrink-0"
              style={{ background: '#fee2e2', color: '#dc2626' }}>
              خروج
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1">
        <div className="bg-white px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--outline-variant)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--on-surface)' }}>{labName}</h2>
          <div className="flex items-center gap-3">

            {/* الإشعارات - الإدمن فقط */}
            <div className="relative" ref={notificationsRef}>
              <button onClick={toggleNotifications} className="text-xl relative" aria-label="فتح الإشعارات">
                🔔
                {totalBadge > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-white flex items-center justify-center"
                    style={{ background: '#dc2626', fontSize: '10px' }}>
                    {totalBadge}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="absolute left-0 top-10 bg-white rounded-xl shadow-xl z-50 w-80" style={{ border: '1px solid var(--outline-variant)' }} dir="rtl">
                  <div className="p-4" style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--on-surface)' }}>إشعارات الإدارة</h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {adminNotifications.length === 0 ? (
                      <p className="p-4 text-sm text-center" style={{ color: 'var(--on-surface-variant)' }}>لا توجد إشعارات</p>
                    ) : adminNotifications.map((n, i) => (
                      <div key={i} className="p-3" style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                        <p className="text-sm font-medium" style={{ color: n.title === 'تنبيه اشتراك' ? '#dc2626' : '#1a2456' }}>
                          {n.title === 'تنبيه اشتراك' ? '💳 ' : ''}{n.title}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>{n.message}</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--outline)' }}>
                          {new Date(n.created_at).toLocaleString('ar-EG')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* الإعدادات */}
            <div className="relative" ref={settingsRef}>
              <button onClick={() => { setShowSettings(!showSettings); setShowNotifications(false); setShowProfile(false) }} className="text-xl" aria-label="فتح الإعدادات">⚙️</button>
              {showSettings && (
                <div className="absolute left-0 top-10 bg-white rounded-xl shadow-xl z-50 w-72" style={{ border: '1px solid var(--outline-variant)' }} dir="rtl">
                  <div className="p-4" style={{ borderBottom: '1px solid var(--outline-variant)' }}>
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--on-surface)' }}>الإعدادات</h3>
                  </div>
                  <div className="p-4 space-y-5">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--on-surface)' }}>حجم الخط</label>
                      <div className="flex gap-2">
                        {[
                          { val: 'small', label: 'صغير' },
                          { val: 'medium', label: 'متوسط' },
                          { val: 'large', label: 'كبير' },
                        ].map(opt => (
                          <button key={opt.val}
                            onClick={() => saveSettings({ ...settings, fontSize: opt.val })}
                            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                            style={{
                              background: settings.fontSize === opt.val ? 'var(--primary-container)' : '#f1f3f4',
                              color: settings.fontSize === opt.val ? 'white' : 'var(--on-surface-variant)',
                              border: settings.fontSize === opt.val ? 'none' : '1px solid var(--outline-variant)',
                            }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: 'var(--on-surface)' }}>تنسيق الوقت</label>
                      <div className="flex gap-2">
                        {[
                          { val: '12', label: '12 ساعة', example: '3:30 PM' },
                          { val: '24', label: '24 ساعة', example: '15:30' },
                        ].map(opt => (
                          <button key={opt.val}
                            onClick={() => saveSettings({ ...settings, timeFormat: opt.val })}
                            className="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all"
                            style={{
                              background: settings.timeFormat === opt.val ? 'var(--primary-container)' : '#f1f3f4',
                              color: settings.timeFormat === opt.val ? 'white' : 'var(--on-surface-variant)',
                              border: settings.timeFormat === opt.val ? 'none' : '1px solid var(--outline-variant)',
                            }}>
                            <div>{opt.label}</div>
                            <div style={{ fontSize: '11px', opacity: 0.8 }}>{opt.example}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium" style={{ color: 'var(--on-surface)' }}>🌙 الوضع الليلي</label>
                        <button onClick={() => saveSettings({ ...settings, darkMode: !settings.darkMode })}
                          aria-label="تبديل الوضع الليلي" aria-pressed={!!settings.darkMode}
                          className="relative transition-all"
                          style={{ width: '44px', height: '24px', borderRadius: '999px', background: settings.darkMode ? 'var(--primary-container)' : '#d1d5db' }}>
                          <span className="absolute top-0.5 transition-all" style={{
                            width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                            right: settings.darkMode ? '3px' : '23px',
                          }} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* بانر تنبيه اشتراك المعمل - ظاهر فوق كل الصفحات لو الاشتراك قرب/انتهى ولحد ما يتقفل */}
        {subscriptionStatus && !bannerDismissed && (
          <div className="px-6 py-3 flex items-center justify-between gap-3 flex-wrap"
            style={{
              background: subscriptionStatus.key === 'expired' ? '#fee2e2' : '#fef3c7',
              borderBottom: '1px solid ' + (subscriptionStatus.key === 'expired' ? '#fecaca' : '#fde68a'),
            }}>
            <p className="text-sm font-medium" style={{ color: subscriptionStatus.key === 'expired' ? '#dc2626' : '#92400e' }}>
              {subscriptionStatus.key === 'expired' ? '⛔' : '⏰'} {subscriptionStatus.message}
            </p>
            <button onClick={dismissSubscriptionBanner}
              className="text-xs font-medium px-3 py-1 rounded-lg flex-shrink-0"
              style={{
                background: 'rgba(0,0,0,0.06)',
                color: subscriptionStatus.key === 'expired' ? '#dc2626' : '#92400e',
              }}>
              ✕ إخفاء لحد بكرة
            </button>
          </div>
        )}

        {/* Profile Modal */}
        {showProfile && (
          <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md" style={{ maxHeight: '90vh', overflowY: 'auto' }} dir="rtl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-lg" style={{ color: 'var(--on-surface)' }}>الملف الشخصي</h2>
                <button onClick={() => { setShowProfile(false); setEditMode(false); setShowPasswordSection(false); setMsg({ text: '', type: '' }) }} className="text-xl">✕</button>
              </div>

              <div className="flex items-center gap-3 mb-5 p-3 rounded-xl" style={{ background: '#f1f3f4' }}>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--on-surface)' }}>{profileData.labName}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>{user?.email}</p>
                </div>
              </div>

              {msg.text && (
                <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: msg.type === 'success' ? '#d1fae5' : '#fee2e2', color: msg.type === 'success' ? '#065f46' : '#dc2626' }}>
                  {msg.text}
                </div>
              )}

              <div className="space-y-3 mb-4">
                {[
                  { label: 'اسم المعمل', key: 'labName', placeholder: 'Smart Lab System' },
                  { label: 'اسم الدكتور / المدير', key: 'doctorName', placeholder: 'د. محمد أحمد' },
                  { label: 'المؤهل الدراسي', key: 'qualification', placeholder: 'بكالوريوس علوم - كيمياء حيوية' },
                  { label: 'العنوان', key: 'address', placeholder: 'القاهرة، مصر' },
                  { label: 'رقم الموبايل', key: 'phone', placeholder: '01012345678' },
                  { label: 'البريد الإلكتروني', key: 'email', placeholder: 'lab@example.com' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--on-surface-variant)' }}>{f.label}</label>
                    {editMode ? (
                      <input type="text" value={editData[f.key] || ''} placeholder={f.placeholder}
                        onChange={e => setEditData(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg outline-none text-right"
                        style={{ border: '2px solid var(--primary-container)', fontSize: '14px' }}
                      />
                    ) : (
                      <p className="px-3 py-2 rounded-lg text-sm text-right" style={{ background: '#f9fafb', color: profileData[f.key] ? 'var(--on-surface)' : 'var(--on-surface-variant)', border: '1px solid var(--outline-variant)' }}>
                        {profileData[f.key] || f.placeholder}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {!editMode ? (
                <button onClick={startEdit}
                  className="w-full py-2 rounded-lg text-sm font-medium text-white mb-3"
                  style={{ background: 'var(--primary-container)' }}>
                  ✏️ تعديل البيانات
                </button>
              ) : (
                <div className="flex gap-2 mb-3">
                  <button onClick={cancelEdit} disabled={savingProfile}
                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                    style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)', opacity: savingProfile ? 0.5 : 1 }}>
                    إلغاء
                  </button>
                  <button onClick={saveProfile} disabled={savingProfile}
                    className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ background: 'var(--primary-container)', opacity: savingProfile ? 0.7 : 1 }}>
                    {savingProfile ? 'جاري الحفظ...' : 'حفظ'}
                  </button>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1rem' }}>
                {!showPasswordSection ? (
                  <button onClick={() => { setShowPasswordSection(true); setMsg({ text: '', type: '' }) }}
                    className="w-full py-2 rounded-lg text-sm font-medium"
                    style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                    🔑 تغيير كلمة السر
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-medium" style={{ color: 'var(--on-surface)' }}>تغيير كلمة السر</p>
                    {[
                      { label: 'كلمة السر الحالية', val: currentPassword, set: setCurrentPassword },
                      { label: 'كلمة السر الجديدة', val: newPassword, set: setNewPassword },
                      { label: 'تأكيد كلمة السر الجديدة', val: confirmPassword, set: setConfirmPassword },
                    ].map((f, i) => (
                      <div key={i}>
                        <label className="block text-xs font-medium mb-1" style={{ color: 'var(--on-surface-variant)' }}>{f.label}</label>
                        <input type="password" value={f.val} onChange={e => f.set(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg outline-none text-right"
                          style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                          onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
                          onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
                        />
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button onClick={() => { setShowPasswordSection(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword('') }} disabled={changingPassword}
                        className="flex-1 py-2 rounded-lg text-sm"
                        style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)', opacity: changingPassword ? 0.5 : 1 }}>
                        إلغاء
                      </button>
                      <button onClick={changePassword} disabled={changingPassword}
                        className="flex-1 py-2 rounded-lg text-sm text-white font-medium"
                        style={{ background: 'var(--primary-container)', opacity: changingPassword ? 0.7 : 1 }}>
                        {changingPassword ? 'جاري التغيير...' : 'تغيير'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--outline-variant)' }}>
                <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
                  className="w-full py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#fee2e2', color: '#dc2626' }}>
                  تسجيل الخروج
                </button>
              </div>
            </div>
          </div>
        )}

        <ErrorBoundary key={typeof window !== 'undefined' ? window.location.pathname : 'route'}>
          <Outlet context={{ settings, chatMessages, setChatMessages, chatHistoryRef }} />
        </ErrorBoundary>
      </main>
    </div>
  )
}