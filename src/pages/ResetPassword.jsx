import { useState } from 'react'
import { supabase } from '../supabase'
import { useNavigate } from 'react-router-dom'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('كلمة المرور لازم تكون 6 حروف أو أرقام على الأقل')
      return
    }
    if (password !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقين')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError('حصل خطأ، جرّب تطلب رابط تعيين كلمة مرور جديد من صفحة الدخول')
    } else {
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 2000)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" dir="rtl"
      style={{ fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", background: 'linear-gradient(160deg, #f0f7ff 0%, #e8f4f8 40%, #f5f9ff 100%)' }}>

      <div className="w-full max-w-md rounded-3xl p-8 shadow-2xl" style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.9)',
        boxShadow: '0 20px 60px rgba(14,90,200,0.12), 0 4px 20px rgba(0,0,0,0.06)',
      }}>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-3 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #0e5ac8, #06b6d4)' }}>
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: '#1e293b' }}>تعيين كلمة مرور جديدة</h1>
          <p className="text-sm" style={{ color: '#0e5ac8' }}>اكتب كلمة المرور الجديدة بتاعتك</p>
        </div>

        {error && (
          <div className="mb-5 flex items-center gap-3 p-4 rounded-2xl text-sm"
            style={{ background: 'linear-gradient(135deg, #fee2e2, #fecaca)', border: '1px solid #fca5a5', color: '#991b1b' }}>
            <span className="font-medium">{error}</span>
          </div>
        )}

        {success ? (
          <div className="flex items-center gap-3 p-4 rounded-2xl text-sm"
            style={{ background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)', border: '1px solid #6ee7b7', color: '#065f46' }}>
            <span className="font-medium">تم تغيير كلمة المرور بنجاح، جاري تحويلك...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: '#374151' }}>كلمة المرور الجديدة</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password}
                  onChange={e => setPassword(e.target.value)} required
                  className="w-full pr-4 pl-11 py-3.5 rounded-2xl text-right text-sm transition-all outline-none"
                  style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', color: '#1e293b' }}
                  onFocus={e => { e.currentTarget.style.border = '1.5px solid #0e5ac8'; e.currentTarget.style.background = '#fff' }}
                  onBlur={e => { e.currentTarget.style.border = '1.5px solid #e2e8f0'; e.currentTarget.style.background = '#f8fafc' }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#94a3b8' }}>
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

            <div>
              <label className="block text-sm font-semibold mb-2" style={{ color: '#374151' }}>تأكيد كلمة المرور</label>
              <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)} required
                className="w-full px-4 py-3.5 rounded-2xl text-right text-sm transition-all outline-none"
                style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', color: '#1e293b' }}
                onFocus={e => { e.currentTarget.style.border = '1.5px solid #0e5ac8'; e.currentTarget.style.background = '#fff' }}
                onBlur={e => { e.currentTarget.style.border = '1.5px solid #e2e8f0'; e.currentTarget.style.background = '#f8fafc' }}
              />
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-4 rounded-2xl text-white font-bold text-base transition-all"
              style={{
                background: loading ? 'linear-gradient(135deg, #93c5fd, #67e8f9)' : 'linear-gradient(135deg, #0e5ac8 0%, #0284c7 50%, #06b6d4 100%)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}>
              {loading ? 'جاري الحفظ...' : 'حفظ كلمة المرور'}
            </button>
          </form>
        )}

      </div>
    </div>
  )
}
