import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

// بيحسب حالة الاشتراك: منتهي / قرب ينتهي (أقل من 7 أيام) / سارٍ
const getSubscriptionStatus = (lab) => {
  if (!lab.subscription_expires_at) {
    return { key: 'unknown', label: 'مش محدد', bg: '#f1f3f4', color: 'var(--on-surface-variant)', daysLeft: null }
  }
  const expiry = new Date(lab.subscription_expires_at)
  const now = new Date()
  const msLeft = expiry.getTime() - now.getTime()
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))

  if (daysLeft < 0) {
    return { key: 'expired', label: `منتهي من ${Math.abs(daysLeft)} يوم`, bg: '#fee2e2', color: '#dc2626', daysLeft }
  }
  if (daysLeft <= 7) {
    return { key: 'soon', label: `باقي ${daysLeft} يوم`, bg: '#fef3c7', color: '#92400e', daysLeft }
  }
  return { key: 'active', label: `باقي ${daysLeft} يوم`, bg: '#d1fae5', color: '#065f46', daysLeft }
}

const RENEW_OPTIONS = [
  { val: '1', label: 'شهر واحد' },
  { val: '3', label: '3 شهور' },
  { val: '6', label: '6 شهور' },
  { val: '12', label: 'سنة كاملة' },
]

export default function AdminDashboard() {
  const [labs, setLabs] = useState([])
  const [loading, setLoading] = useState(true)
  const [editLab, setEditLab] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [renewLab, setRenewLab] = useState(null) // { lab, months }
  const [renewing, setRenewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [search, setSearch] = useState('')
  const [newLogoFile, setNewLogoFile] = useState(null)
  const [newLogoPreview, setNewLogoPreview] = useState(null)
  const [logoError, setLogoError] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  // رسالة تأكيد/خطأ عامة تظهر فوق الصفحة بعد أي عملية (حفظ/حذف/تجديد/تفعيل)
  const [feedback, setFeedback] = useState({ text: '', type: '' })

  const showFeedback = (text, type = 'success') => {
    setFeedback({ text, type })
    setTimeout(() => setFeedback({ text: '', type: '' }), 3500)
  }

  const fetchLabs = async () => {
    const { data, error } = await supabase
      .from('lab_settings')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      showFeedback('فشل تحميل قائمة المعامل: ' + error.message, 'error')
    }
    setLabs(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchLabs() }, [])

  // بيرفض (reject) لو فشلت قراءة الملف أو معالجته، بدل ما يعلّق للأبد من غير أي رسالة خطأ
  const compressImage = (file, maxSize = 300, quality = 0.75) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('فشل قراءة ملف الصورة'))
      reader.onload = (e) => {
        const img = new Image()
        img.onerror = () => reject(new Error('الملف ده مش صورة صالحة'))
        img.onload = () => {
          let { width, height } = img
          if (width > height) {
            if (width > maxSize) { height = height * (maxSize / width); width = maxSize }
          } else {
            if (height > maxSize) { width = width * (maxSize / height); height = maxSize }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob(blob => {
            if (blob) resolve(blob)
            else reject(new Error('فشل ضغط الصورة'))
          }, 'image/jpeg', quality)
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })
  }

  const handleEditLogoChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setLogoError('من فضلك اختار ملف صورة صحيح')
      return
    }
    try {
      const compressed = await compressImage(file)
      setNewLogoFile(compressed)
      setNewLogoPreview(URL.createObjectURL(compressed))
      setLogoError('')
    } catch (err) {
      setLogoError('حصل خطأ في معالجة الصورة: ' + err.message)
    }
  }

  const openEdit = (lab) => {
    setEditLab(lab)
    setNewLogoFile(null)
    setNewLogoPreview(null)
    setLogoError('')
  }

  const saveLab = async () => {
    setSaving(true)
    try {
      let logoUrl = editLab.logo_url

      if (newLogoFile) {
        const fileName = `${editLab.user_id}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('logos')
          .upload(fileName, newLogoFile, { upsert: true, contentType: 'image/jpeg' })

        if (uploadError) {
          showFeedback('فشل رفع اللوجو، هنكمل حفظ باقي البيانات: ' + uploadError.message, 'error')
        } else {
          const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
          logoUrl = `${urlData.publicUrl}?t=${Date.now()}`
        }
      }

      const { error } = await supabase.from('lab_settings').update({
        lab_name: (editLab.lab_name || '').trim(),
        owner_name: (editLab.owner_name || '').trim(),
        doctor_name: (editLab.doctor_name || '').trim(),
        address: (editLab.address || '').trim(),
        phone: (editLab.phone || '').trim(),
        email: (editLab.email || '').trim(),
        qualification: (editLab.qualification || '').trim(),
        logo_url: logoUrl,
      }).eq('id', editLab.id)

      if (error) {
        showFeedback('فشل حفظ التعديلات: ' + error.message, 'error')
        return
      }

      setEditLab(null)
      setNewLogoFile(null)
      setNewLogoPreview(null)
      await fetchLabs()
      showFeedback('تم حفظ التعديلات بنجاح ✅')
    } catch (err) {
      showFeedback('حصل خطأ غير متوقع: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const deleteLab = async (lab) => {
    setDeletingId(lab.id)
    try {
      // مسح اللوجو من الـ Storage لو موجود
      if (lab.logo_url) {
        await supabase.storage.from('logos').remove([`${lab.user_id}.jpg`])
      }
      // مسح بيانات المعمل
      const { error: settingsError } = await supabase.from('lab_settings').delete().eq('id', lab.id)
      if (settingsError) {
        showFeedback('فشل حذف المعمل: ' + settingsError.message, 'error')
        return
      }
      // مسح الدور من profiles
      const { error: profileError } = await supabase.from('profiles').delete().eq('id', lab.user_id)
      if (profileError) {
        showFeedback('اتمسح المعمل لكن فشل مسح صلاحية الحساب: ' + profileError.message, 'error')
      } else {
        showFeedback('تم حذف المعمل بنجاح 🗑️')
      }

      setDeleteConfirm(null)
      await fetchLabs()
    } catch (err) {
      showFeedback('حصل خطأ غير متوقع أثناء الحذف: ' + err.message, 'error')
    } finally {
      setDeletingId(null)
    }
  }

  // نسخ كود التفعيل بضغطة واحدة، مع تلميح بصري مؤقت إن النسخ نجح
  const copyActivationCode = (lab) => {
    if (!lab.activation_code) return
    navigator.clipboard?.writeText(lab.activation_code)
    setCopiedId(lab.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  // تفعيل/إيقاف المعمل بدون حذف الكود — لو عميل بيتأخر في السداد مثلاً، توقفه من هنا بدل الحذف النهائي
  const toggleActive = async (lab) => {
    setTogglingId(lab.id)
    const { error } = await supabase.from('lab_settings').update({ is_active: !lab.is_active }).eq('id', lab.id)
    if (error) {
      showFeedback('فشل تغيير حالة التفعيل: ' + error.message, 'error')
    } else {
      showFeedback(lab.is_active !== false ? 'تم إيقاف المعمل ⏸️' : 'تم تفعيل المعمل ▶️')
    }
    await fetchLabs()
    setTogglingId(null)
  }

  const openRenew = (lab) => setRenewLab({ lab, months: '1' })

  // بيجدد الاشتراك: لو الاشتراك لسه سارٍ، بيضيف المدة فوق تاريخ الانتهاء الحالي (مايضيعش أيام مدفوعة).
  // لو منتهي بالفعل، بيبدأ العد من دلوقتي.
  const confirmRenew = async () => {
    if (!renewLab) return
    setRenewing(true)
    try {
      const currentExpiry = renewLab.lab.subscription_expires_at
        ? new Date(renewLab.lab.subscription_expires_at)
        : null
      const now = new Date()
      const base = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now

      const newExpiry = new Date(base)
      newExpiry.setMonth(newExpiry.getMonth() + parseInt(renewLab.months))

      const { error } = await supabase.from('lab_settings').update({
        subscription_expires_at: newExpiry.toISOString(),
        is_active: true, // التجديد بيشيل حالة الإيقاف تلقائيًا لو كان موقوف بسبب انتهاء الاشتراك
      }).eq('id', renewLab.lab.id)

      if (error) {
        showFeedback('فشل تجديد الاشتراك: ' + error.message, 'error')
        return
      }

      setRenewLab(null)
      await fetchLabs()
      showFeedback('تم تجديد الاشتراك بنجاح 💳')
    } catch (err) {
      showFeedback('حصل خطأ غير متوقع: ' + err.message, 'error')
    } finally {
      setRenewing(false)
    }
  }

  const searchLower = search.trim().toLowerCase()
  const filtered = labs.filter(l =>
    (l.lab_name || '').toLowerCase().includes(searchLower) ||
    (l.owner_name || '').toLowerCase().includes(searchLower) ||
    (l.doctor_name || '').toLowerCase().includes(searchLower) ||
    (l.activation_code || '').toLowerCase().includes(searchLower)
  )

  const expiringSoonCount = labs.filter(l => {
    const status = getSubscriptionStatus(l)
    return status.key === 'soon' || status.key === 'expired'
  }).length

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>المعامل المشتركة</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>كل المعامل والدكاترة المسجلين في النظام</p>
      </div>

      {feedback.text && (
        <div className="mb-4 p-3 rounded-lg text-sm font-medium"
          style={{
            background: feedback.type === 'error' ? '#fee2e2' : '#d1fae5',
            color: feedback.type === 'error' ? '#991b1b' : '#065f46',
          }}>
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        <div className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
          <div className="text-2xl mb-2">🏢</div>
          <div className="text-2xl font-bold" style={{ color: '#1a2456' }}>{labs.length}</div>
          <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>إجمالي المعامل</div>
        </div>
        <div className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
          <div className="text-2xl mb-2">🔌</div>
          <div className="text-2xl font-bold" style={{ color: '#065f46' }}>{labs.filter(l => l.is_active !== false).length}</div>
          <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>معامل مفعّلة</div>
        </div>
        <div className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
          <div className="text-2xl mb-2">⏳</div>
          <div className="text-2xl font-bold" style={{ color: expiringSoonCount > 0 ? '#dc2626' : '#1a2456' }}>{expiringSoonCount}</div>
          <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>محتاجة تجديد</div>
        </div>
      </div>

      <label htmlFor="lab-search" className="sr-only">البحث عن معمل أو دكتور أو كود تفعيل</label>
      <input id="lab-search" type="text" placeholder="ابحث عن معمل أو دكتور أو كود تفعيل..." value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-4 py-2 rounded-lg outline-none text-right mb-4"
        style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
        onFocus={e => e.target.style.border = '2px solid #1a2456'}
        onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
      />

      {/* Modal تعديل */}
      {editLab && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-screen overflow-y-auto" dir="rtl">
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--on-surface)' }}>تعديل بيانات المعمل</h2>

            {/* اللوجو */}
            <div className="flex flex-col items-center gap-3 mb-4">
              <div className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center"
                style={{ border: '2px dashed var(--outline-variant)', background: '#f8f9ff' }}>
                {newLogoPreview
                  ? <img src={newLogoPreview} alt="logo" className="w-full h-full object-cover" />
                  : editLab.logo_url
                    ? <img src={editLab.logo_url} alt="logo" className="w-full h-full object-cover" />
                    : <span className="text-3xl">🔬</span>
                }
              </div>
              <label className="cursor-pointer text-sm font-medium px-4 py-2 rounded-lg"
                style={{ background: '#e8eaf6', color: '#1a2456' }}>
                📷 {editLab.logo_url || newLogoPreview ? 'تغيير اللوجو' : 'رفع لوجو'}
                <input type="file" accept="image/*" onChange={handleEditLogoChange} className="hidden" />
              </label>
              {logoError && (
                <p className="text-xs" style={{ color: '#dc2626' }}>{logoError}</p>
              )}
            </div>

            <div className="space-y-3">
              {[
                { label: 'اسم المعمل', key: 'lab_name' },
                { label: 'اسم صاحب المعمل', key: 'owner_name' },
                { label: 'اسم الدكتور', key: 'doctor_name' },
                { label: 'العنوان', key: 'address' },
                { label: 'رقم الموبايل', key: 'phone' },
                { label: 'البريد الإلكتروني', key: 'email' },
                { label: 'المؤهل الدراسي', key: 'qualification' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>{f.label}</label>
                  <input type="text" value={editLab[f.key] || ''}
                    onChange={e => setEditLab(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg outline-none text-right"
                    style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => { setEditLab(null); setNewLogoFile(null); setNewLogoPreview(null); setLogoError('') }} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)', opacity: saving ? 0.5 : 1 }}>
                إلغاء
              </button>
              <button onClick={saveLab} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: '#1a2456', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal تأكيد الحذف */}
      {deleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" dir="rtl">
            <h2 className="font-bold text-lg mb-2" style={{ color: '#dc2626' }}>⚠️ تأكيد الحذف</h2>
            <p className="text-sm mb-2" style={{ color: 'var(--on-surface-variant)' }}>
              هيتم حذف معمل <strong>{deleteConfirm.lab_name}</strong> وكل بياناته نهائيًا من اللوحة.
            </p>
            <p className="text-xs mb-5" style={{ color: '#92400e', background: '#fef3c7', padding: '8px', borderRadius: '8px' }}>
              ملحوظة: حساب الدكتور لتسجيل الدخول هيفضل موجود في Authentication، لازم تمسحه يدويًا من Supabase لو عاوز تقفله نهائي.
              لو محتاج توقف المعمل مؤقتًا بدل الحذف النهائي، استخدم سويتش "مفعّل" في الكارت بدل الحذف.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} disabled={deletingId === deleteConfirm.id}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={() => deleteLab(deleteConfirm)} disabled={deletingId === deleteConfirm.id}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: '#dc2626', opacity: deletingId === deleteConfirm.id ? 0.7 : 1 }}>
                {deletingId === deleteConfirm.id ? 'جاري الحذف...' : 'حذف نهائي'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal تجديد الاشتراك */}
      {renewLab && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" dir="rtl">
            <h2 className="font-bold text-lg mb-2" style={{ color: 'var(--on-surface)' }}>💳 تجديد اشتراك</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--on-surface-variant)' }}>
              معمل <strong>{renewLab.lab.lab_name}</strong>
            </p>

            {renewLab.lab.subscription_expires_at && (
              <p className="text-xs mb-4 px-3 py-2 rounded-lg"
                style={{
                  background: getSubscriptionStatus(renewLab.lab).bg,
                  color: getSubscriptionStatus(renewLab.lab).color
                }}>
                الحالة الحالية: {getSubscriptionStatus(renewLab.lab).label}
                {' '}(ينتهي في {new Date(renewLab.lab.subscription_expires_at).toLocaleDateString('ar-EG')})
              </p>
            )}

            <p className="text-sm font-medium mb-2" style={{ color: 'var(--on-surface)' }}>مدة التجديد:</p>
            <div className="flex gap-2 flex-wrap mb-4">
              {RENEW_OPTIONS.map(opt => (
                <button key={opt.val} type="button"
                  onClick={() => setRenewLab(prev => ({ ...prev, months: opt.val }))}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: renewLab.months === opt.val ? '#1a2456' : '#f1f3f4',
                    color: renewLab.months === opt.val ? 'white' : 'var(--on-surface-variant)',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>

            <p className="text-xs mb-5" style={{ color: 'var(--on-surface-variant)' }}>
              {renewLab.lab.subscription_expires_at && new Date(renewLab.lab.subscription_expires_at).getTime() > Date.now()
                ? 'المدة هتتضاف فوق تاريخ الانتهاء الحالي، مش هتضيّع أي وقت متبقي.'
                : 'الاشتراك منتهي، فالمدة هتتحسب من النهاردة.'}
            </p>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setRenewLab(null)} disabled={renewing}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={confirmRenew} disabled={renewing}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: '#1a2456', opacity: renewing ? 0.7 : 1 }}>
                {renewing ? 'جاري التجديد...' : 'تأكيد التجديد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>لا توجد معامل مسجلة</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(lab => {
            const subStatus = getSubscriptionStatus(lab)
            return (
              <div key={lab.id} className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 text-2xl" style={{ background: '#f1f3f4' }}>
                      {lab.logo_url ? <img src={lab.logo_url} alt="logo" className="w-full h-full object-cover" /> : '🔬'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold" style={{ color: 'var(--on-surface)' }}>{lab.lab_name || 'بدون اسم'}</p>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: lab.is_active !== false ? '#d1fae5' : '#fee2e2',
                            color: lab.is_active !== false ? '#065f46' : '#dc2626'
                          }}>
                          {lab.is_active !== false ? 'مفعّل' : 'موقوف'}
                        </span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ background: subStatus.bg, color: subStatus.color }}>
                          💳 {subStatus.label}
                        </span>
                      </div>
                      <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                        {lab.doctor_name || lab.owner_name || '-'} • {lab.email}
                      </p>
                      <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                        📍 {lab.address || '-'} • 📞 {lab.phone || '-'}
                      </p>
                      {lab.subscription_expires_at && (
                        <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                          📅 ينتهي في {new Date(lab.subscription_expires_at).toLocaleDateString('ar-EG')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 flex-wrap">
                    <button onClick={() => openRenew(lab)}
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ background: '#e0e7ff', color: '#3730a3' }}>
                      💳 تجديد
                    </button>
                    <button onClick={() => toggleActive(lab)} disabled={togglingId === lab.id}
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{
                        background: lab.is_active !== false ? '#fef3c7' : '#d1fae5',
                        color: lab.is_active !== false ? '#92400e' : '#065f46',
                        opacity: togglingId === lab.id ? 0.6 : 1
                      }}>
                      {togglingId === lab.id ? '...' : (lab.is_active !== false ? '⏸️ إيقاف' : '▶️ تفعيل')}
                    </button>
                    <button onClick={() => openEdit(lab)}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ background: '#1a2456' }}>
                      ✏️ تعديل
                    </button>
                    <button onClick={() => setDeleteConfirm(lab)} disabled={deletingId === lab.id}
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ background: '#fee2e2', color: '#dc2626', opacity: deletingId === lab.id ? 0.6 : 1 }}>
                      {deletingId === lab.id ? '...' : '🗑️ حذف'}
                    </button>
                  </div>
                </div>

                {/* كود التفعيل الخاص بـ lab-bridge */}
                <div className="mt-3 pt-3 flex items-center gap-2 flex-wrap" style={{ borderTop: '1px dashed var(--outline-variant)' }}>
                  <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>🔑 كود تفعيل Lab Bridge:</span>
                  <code className="text-xs font-mono px-2 py-1 rounded-lg" style={{ background: '#f1f3f4', color: 'var(--on-surface)' }}>
                    {lab.activation_code || 'غير متوفر'}
                  </code>
                  {lab.activation_code && (
                    <button onClick={() => copyActivationCode(lab)}
                      className="text-xs font-medium px-2 py-1 rounded-lg"
                      style={{ background: '#e8eaf6', color: '#1a2456' }}>
                      {copiedId === lab.id ? '✅ اتنسخ' : '📋 نسخ'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}