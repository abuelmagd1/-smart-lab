import { useState } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'

const mapAuthError = (error) => {
  const msg = (error?.message || '').toLowerCase()
  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
    return 'البريد الإلكتروني أو كلمة المرور غلط'
  }
  if (msg.includes('email not confirmed')) {
    return 'الحساب ده لسه محتاج تأكيد البريد الإلكتروني'
  }
  if (msg.includes('too many requests') || error?.status === 429) {
    return 'محاولات كتير في وقت قصير، استنى شوية وحاول تاني'
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'مفيش اتصال بالإنترنت دلوقتي، تأكد من الشبكة وحاول تاني'
  }
  return 'حصل خطأ أثناء تسجيل الدخول، حاول تاني'
}

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        console.error('Supabase login error:', error)
        setError(mapAuthError(error))
        return
      }

      navigate('/dashboard')
    } catch (err) {
      console.error('Unexpected login error:', err)
      setError(mapAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex" dir="rtl" style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" }}>

      {/* ===== LEFT PANEL – Branding ===== */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col items-center justify-center">
        <img src="/images/lab-bg.jpg" alt="lab" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(14,90,200,0.88) 0%, rgba(6,182,212,0.80) 60%, rgba(0,0,0,0.55) 100%)' }} />
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }} />
        <div className="absolute -bottom-32 -right-20 w-96 h-96 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #38bdf8 0%, transparent 70%)' }} />

        <div className="relative z-10 text-white text-center px-12 select-none">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl mb-8 shadow-2xl"
            style={{ background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(12px)', border: '1.5px solid rgba(255,255,255,0.3)' }}>
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.78 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          </div>

          <h1 className="text-4xl font-bold mb-3 tracking-wide drop-shadow-lg">Smart Lab System</h1>
          <p className="text-lg font-light mb-10 opacity-90">نظام إدارة المعمل الذكي</p>

          <div className="space-y-4">
            {[
              { icon: '🔬', text: 'تسجيل المرضى وإدارة نتائج التحاليل بكل سهولة' },
              { icon: '🤖', text: '"لابو" مساعدك الذكي يسجل ويرد على استفساراتك' },
              { icon: '🖨️', text: 'طباعة تقرير احترافي بنتيجة التحليل بضغطة واحدة' },
              { icon: '🔒', text: 'بياناتك محفوظة وآمنة على قاعدة بيانات مشفرة' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 rounded-2xl text-right"
                style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.18)' }}>
                <span className="text-xl">{f.icon}</span>
                <span className="text-sm font-medium opacity-95">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== RIGHT PANEL – Login Form ===== */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 relative"
        style={{ background: 'linear-gradient(160deg, #f0f7ff 0%, #e8f4f8 40%, #f5f9ff 100%)' }}>

        <div className="absolute inset-0 opacity-30" style={{
          backgroundImage: `radial-gradient(circle at 80% 20%, rgba(14,90,200,0.08) 0%, transparent 50%),
                            radial-gradient(circle at 10% 90%, rgba(6,182,212,0.08) 0%, transparent 50%)`,
        }} />

        <div className="relative w-full max-w-md">

          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-3 shadow-lg"
              style={{ background: 'linear-gradient(135deg, #0e5ac8, #06b6d4)' }}>
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.78 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold" style={{ color: '#0e5ac8' }}>Smart Lab System</h1>
          </div>

          {/* Card */}
          <div className="rounded-3xl p-8 shadow-2xl" style={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.9)',
            boxShadow: '0 20px 60px rgba(14,90,200,0.12), 0 4px 20px rgba(0,0,0,0.06)',
          }}>

            {/* Header */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold mb-1" style={{ color: '#1e293b' }}>مرحباً بك يا دكتور</h2>
              <p className="text-sm font-medium mt-2" style={{ color: '#0e5ac8' }}>سعداء بالتعامل مع حضرتك</p>
            </div>

            {/* Error */}
            {error && (
              <div role="alert" aria-live="polite" className="mb-5 flex items-center gap-3 p-4 rounded-2xl text-sm"
                style={{ background: 'linear-gradient(135deg, #fee2e2, #fecaca)', border: '1px solid #fca5a5', color: '#991b1b' }}>
                <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-4.75a.75.75 0 001.5 0v-4.5a.75.75 0 00-1.5 0v4.5zm.75-7.5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold mb-2" style={{ color: '#374151' }}>البريد الإلكتروني</label>
                <div className="relative">
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#94a3b8' }}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </span>
                  <input id="email" type="email" placeholder="example@lab.com" value={email}
                    onChange={e => setEmail(e.target.value)} required
                    className="w-full pr-11 pl-4 py-3.5 rounded-2xl text-right text-sm transition-all outline-none"
                    style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', color: '#1e293b' }}
                    onFocus={e => { e.currentTarget.style.border = '1.5px solid #0e5ac8'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(14,90,200,0.08)' }}
                    onBlur={e => { e.currentTarget.style.border = '1.5px solid #e2e8f0'; e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.boxShadow = 'none' }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold mb-2" style={{ color: '#374151' }}>كلمة المرور</label>
                <div className="relative">
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#94a3b8' }}>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <input id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password}
                    onChange={e => setPassword(e.target.value)} required
                    className="w-full pr-11 pl-11 py-3.5 rounded-2xl text-right text-sm transition-all outline-none"
                    style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', color: '#1e293b' }}
                    onFocus={e => { e.currentTarget.style.border = '1.5px solid #0e5ac8'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 0 0 4px rgba(14,90,200,0.08)' }}
                    onBlur={e => { e.currentTarget.style.border = '1.5px solid #e2e8f0'; e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.boxShadow = 'none' }}
                  />
                  <button type="button" aria-label={showPassword ? 'إخفاء' : 'إظهار'} aria-pressed={showPassword} aria-controls="password" onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: '#94a3b8' }}
                    onMouseOver={e => (e.currentTarget.style.color = '#0e5ac8')}
                    onMouseOut={e => (e.currentTarget.style.color = '#94a3b8')}>
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button type="submit" disabled={loading}
                className="w-full py-4 rounded-2xl text-white font-bold text-base transition-all"
                style={{
                  background: loading ? 'linear-gradient(135deg, #93c5fd, #67e8f9)' : 'linear-gradient(135deg, #0e5ac8 0%, #0284c7 50%, #06b6d4 100%)',
                  boxShadow: loading ? 'none' : '0 8px 24px rgba(14,90,200,0.35)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
                onMouseOver={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(14,90,200,0.45)' } }}
                onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = loading ? 'none' : '0 8px 24px rgba(14,90,200,0.35)' }}>
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    جاري الدخول...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14" />
                    </svg>
                    تسجيل الدخول
                  </span>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 mt-6 mb-5">
              <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>Created by</span>
              <div className="flex-1 h-px" style={{ background: '#e2e8f0' }} />
            </div>

            {/* Developer Info */}
            <div className="flex flex-col items-center gap-3 pb-2">

              <span className="font-bold text-base" style={{ color: '#1e293b' }} dir="ltr">Eng. Ahmed Abu Elmagd</span>

              <div className="flex items-center gap-6">

                {/* Facebook */}
                <a href="https://www.facebook.com/share/1As7dJBGZY/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 transition-opacity hover:opacity-70">
                  <span className="text-sm font-semibold" style={{ color: '#1e293b' }} dir="ltr">Ahmed Abu Elmagd</span>
                  <svg className="w-5 h-5" style={{ color: '#1877F2' }} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>

                {/* WhatsApp */}
                <a href="https://wa.me/201094997330" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 transition-opacity hover:opacity-70">
                  <span className="text-sm font-semibold" style={{ color: '#1e293b' }} dir="ltr">01094997330</span>
                  <svg className="w-5 h-5" style={{ color: '#25D366' }} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </a>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}