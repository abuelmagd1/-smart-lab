import { useState } from 'react'
import { supabase } from '../../supabase'

export default function AddLab() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [form, setForm] = useState({
    email: '',
    password: '',
    ownerName: '',
    doctorName: '',
    labName: '',
    address: '',
    phone: '',
    qualification: '',
  })

  const compressImage = (file, maxSize = 300, quality = 0.75) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
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
          canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality)
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })
  }

  const handleLogoChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const compressed = await compressImage(file)
    setLogoFile(compressed)
    setLogoPreview(URL.createObjectURL(compressed))
  }

  const resetForm = () => {
    setForm({ email: '', password: '', ownerName: '', doctorName: '', labName: '', address: '', phone: '', qualification: '' })
    setLogoFile(null)
    setLogoPreview(null)
  }

  const handleSubmit = async () => {
    setError('')

    if (!form.email || !form.password || !form.labName || !form.doctorName) {
      setError('من فضلك ملي الحقول المطلوبة (الإيميل، الباسورد، اسم المعمل، اسم الدكتور)')
      return
    }
    if (form.password.length < 6) {
      setError('كلمة المرور لازم تكون 6 حروف على الأقل')
      return
    }

    setLoading(true)

    // 1. حفظ جلسة الأدمن الحالية
    const { data: { session: adminSession } } = await supabase.auth.getSession()

    // 2. إنشاء حساب الدكتور الجديد
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })

    if (signUpError) {
      setError('حدث خطأ: ' + signUpError.message)
      setLoading(false)
      return
    }

    const newUserId = signUpData.user.id

    // 3. رفع اللوجو لو موجود (بعد الضغط)
    let logoUrl = null
    if (logoFile) {
      const fileName = `${newUserId}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, logoFile, { upsert: true, contentType: 'image/jpeg' })

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
        logoUrl = urlData.publicUrl
      }
    }

    // 4. إضافة الدور (دكتور) في profiles
    await supabase.from('profiles').insert([{
      id: newUserId,
      email: form.email,
      role: 'doctor',
    }])

    // 5. إضافة بيانات المعمل في lab_settings
    await supabase.from('lab_settings').insert([{
      user_id: newUserId,
      owner_name: form.ownerName,
      doctor_name: form.doctorName,
      lab_name: form.labName,
      address: form.address,
      phone: form.phone,
      email: form.email,
      qualification: form.qualification,
      logo_url: logoUrl,
    }])

    // 6. استرجاع جلسة الأدمن
    if (adminSession) {
      await supabase.auth.setSession({
        access_token: adminSession.access_token,
        refresh_token: adminSession.refresh_token,
      })
    }

    setLoading(false)
    setSuccess(true)
    resetForm()
    setTimeout(() => setSuccess(false), 4000)
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>إضافة معمل جديد</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>أنشئ حساب دكتور جديد ببيانات معمله</p>
      </div>

      {success && (
        <div className="mb-4 p-4 rounded-xl text-sm font-medium" style={{ background: '#d1fae5', color: '#065f46' }}>
          ✅ تم إنشاء المعمل والحساب بنجاح!
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#991b1b' }}>
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl p-6 space-y-6" style={{ border: '1px solid var(--outline-variant)' }}>

        {/* لوجو */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center"
            style={{ border: '2px dashed var(--outline-variant)', background: '#f8f9ff' }}>
            {logoPreview
              ? <img src={logoPreview} alt="logo" className="w-full h-full object-cover" />
              : <span className="text-3xl">🔬</span>
            }
          </div>
          <label className="cursor-pointer text-sm font-medium px-4 py-2 rounded-lg"
            style={{ background: '#e8eaf6', color: '#1a2456' }}>
            📷 رفع لوجو المعمل
            <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
          </label>
        </div>

        {/* بيانات الدخول */}
        <div>
          <h2 className="font-semibold mb-4" style={{ color: 'var(--on-surface)' }}>بيانات تسجيل الدخول</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="lab-email" className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>البريد الإلكتروني *</label>
              <input id="lab-email" type="email" value={form.email} placeholder="doctor@lab.com"
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg outline-none text-right"
                style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
              />
            </div>
            <div>
              <label htmlFor="lab-password" className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>كلمة المرور *</label>
              <input id="lab-password" type="password" value={form.password} placeholder="••••••••"
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg outline-none text-right"
                style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
              />
            </div>
          </div>
        </div>

        {/* بيانات المعمل */}
        <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
          <h2 className="font-semibold mb-4" style={{ color: 'var(--on-surface)' }}>بيانات المعمل والدكتور</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { label: 'اسم المعمل *', key: 'labName', placeholder: 'معمل النور' },
              { label: 'اسم الدكتور *', key: 'doctorName', placeholder: 'محمد أحمد' },
              { label: 'اسم صاحب المعمل', key: 'ownerName', placeholder: 'محمد أحمد' },
              { label: 'العنوان', key: 'address', placeholder: 'القاهرة، مصر' },
              { label: 'رقم الموبايل', key: 'phone', placeholder: '01012345678' },
              { label: 'المؤهل الدراسي', key: 'qualification', placeholder: 'بكالوريوس علوم' },
            ].map(f => (
              <div key={f.key}>
                <label htmlFor={f.key} className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>{f.label}</label>
                <input id={f.key} type="text" value={form[f.key]} placeholder={f.placeholder}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 justify-end" style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
          <button onClick={resetForm}
            className="px-6 py-2 rounded-lg text-sm font-medium"
            style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
            إلغاء
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-6 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#1a2456', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'جاري الإنشاء...' : 'إنشاء المعمل'}
          </button>
        </div>
      </div>
    </div>
  )
}