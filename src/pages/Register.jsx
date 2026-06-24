import { useState } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'

export default function Register() {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    ownerName: '',
    labName: '',
    address: '',
    phone: '',
    qualification: '',
  })
  const navigate = useNavigate()

  const handleLogoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const handleRegister = async () => {
    setError('')

    if (!form.email || !form.password || !form.ownerName || !form.labName) {
      setError('من فضلك ملي كل الحقول المطلوبة')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('كلمة المرور مش متطابقة')
      return
    }
    if (form.password.length < 6) {
      setError('كلمة المرور لازم تكون 6 حروف على الأقل')
      return
    }

    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    })

    if (signUpError) {
      setError('حدث خطأ: ' + signUpError.message)
      setLoading(false)
      return
    }

    let logoUrl = null
    if (logoFile) {
      const fileExt = logoFile.name.split('.').pop()
      const fileName = `${data.user.id}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, logoFile, { upsert: true })

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
        logoUrl = urlData.publicUrl
      }
    }

    await supabase.from('lab_settings').insert([{
      user_id: data.user.id,
      owner_name: form.ownerName,
      lab_name: form.labName,
      address: form.address,
      phone: form.phone,
      email: form.email,
      qualification: form.qualification,
      logo_url: logoUrl,
    }])

    setLoading(false)
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-10" style={{ background: 'var(--surface)' }} dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-lg p-8" style={{ border: '1px solid var(--outline-variant)', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>

        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3" style={{ background: 'var(--primary-container)' }}>
            🔬
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>
            Smart Lab System
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>إنشاء حساب جديد</p>
        </div>

        {/* Steps */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  background: step >= s ? 'var(--primary-container)' : '#f1f3f4',
                  color: step >= s ? 'white' : 'var(--on-surface-variant)'
                }}>
                {s}
              </div>
              {s < 2 && <div className="w-16 h-1 rounded" style={{ background: step > s ? 'var(--primary-container)' : '#f1f3f4' }}></div>}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#fee2e2', color: '#991b1b' }}>
            {error}
          </div>
        )}

        {/* Step 1: بيانات الدخول */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-semibold mb-2" style={{ color: 'var(--on-surface)' }}>بيانات الدخول</h2>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>البريد الإلكتروني *</label>
              <input type="email" value={form.email} placeholder="lab@example.com"
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg outline-none text-right"
                style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
                onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>كلمة المرور *</label>
              <input type="password" value={form.password} placeholder="••••••••"
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg outline-none text-right"
                style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
                onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>تأكيد كلمة المرور *</label>
              <input type="password" value={form.confirmPassword} placeholder="••••••••"
                onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg outline-none text-right"
                style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
                onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
              />
            </div>

            <button onClick={() => {
              if (!form.email || !form.password || !form.confirmPassword) { setError('ملي كل الحقول'); return }
              if (form.password !== form.confirmPassword) { setError('كلمة المرور مش متطابقة'); return }
              if (form.password.length < 6) { setError('كلمة المرور لازم تكون 6 حروف على الأقل'); return }
              setError('')
              setStep(2)
            }}
              className="w-full py-3 rounded-lg text-white font-semibold"
              style={{ background: 'var(--primary-container)' }}>
              التالي ←
            </button>
          </div>
        )}

        {/* Step 2: بيانات المعمل */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-semibold mb-2" style={{ color: 'var(--on-surface)' }}>بيانات المعمل</h2>

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
                style={{ background: '#e8f0fe', color: 'var(--primary-container)' }}>
                📷 رفع لوجو المعمل
                <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
              </label>
            </div>

            {[
              { label: 'اسم صاحب المعمل *', key: 'ownerName', placeholder: 'د. محمد أحمد' },
              { label: 'اسم المعمل *', key: 'labName', placeholder: 'معمل النور' },
              { label: 'العنوان', key: 'address', placeholder: 'القاهرة، مصر' },
              { label: 'رقم الموبايل', key: 'phone', placeholder: '01012345678' },
              { label: 'المؤهل الدراسي', key: 'qualification', placeholder: 'بكالوريوس علوم' },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>{f.label}</label>
                <input type="text" value={form[f.key]} placeholder={f.placeholder}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                  onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
                  onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
                />
              </div>
            ))}

            <div className="flex gap-3">
              <button onClick={() => setStep(1)}
                className="flex-1 py-3 rounded-lg font-semibold text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                → السابق
              </button>
              <button onClick={handleRegister} disabled={loading}
                className="flex-1 py-3 rounded-lg text-white font-semibold text-sm"
                style={{ background: 'var(--primary-container)', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'جاري التسجيل...' : 'إنشاء الحساب ✓'}
              </button>
            </div>
          </div>
        )}

        <p className="text-center text-sm mt-4" style={{ color: 'var(--on-surface-variant)' }}>
          عندك حساب؟{' '}
          <button onClick={() => navigate('/login')} className="font-medium" style={{ color: 'var(--primary-container)' }}>
            سجل دخول
          </button>
        </p>

      </div>
    </div>
  )
}