import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatAge } from '../utils/referenceRanges'

const statusStyle = {
  'تم التجميع': { bg: '#f3f4f6', color: '#374151', label: 'تم استلام العينة' },
  'تم الاستلام': { bg: '#dbeafe', color: '#1e40af', label: 'العينة في المعمل' },
  'قيد التحليل': { bg: '#fef3c7', color: '#92400e', label: 'قيد التحليل حاليًا' },
  'معتمد': { bg: '#d1fae5', color: '#065f46', label: 'النتيجة جاهزة ومعتمدة' },
}

export default function PatientPortal() {
  const { code } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const fetchData = async () => {
    setLoading(true)
    setNotFound(false)
    const { data: result, error } = await supabase.rpc('get_patient_portal_data', { p_code: code })
    if (error || !result || !result.name) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setData(result)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl" style={{ background: '#f8f9ff' }}>
        <div className="text-sm" style={{ color: '#6b7280' }}>جاري تحميل النتيجة...</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl" style={{ background: '#f8f9ff' }}>
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm text-center" style={{ border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
          <h1 className="text-lg font-bold mb-2" style={{ color: '#1a2456' }}>مش لاقيين النتيجة دي</h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>
            الرابط ده ممكن يكون غلط أو مش متاح دلوقتي. تواصل مع المعمل عشان يبعتلك الرابط الصحيح.
          </p>
        </div>
      </div>
    )
  }

  const allApproved = data.tests?.length > 0 && data.tests.every(t => t.status === 'معتمد')

  return (
    <div className="min-h-screen p-4" dir="rtl" style={{ background: '#f8f9ff' }}>
      <div className="max-w-md mx-auto space-y-4 py-4">

        {/* هيدر المعمل */}
        <div className="text-center">
          <div style={{ fontSize: '32px' }}>🔬</div>
          <h1 className="text-lg font-bold mt-1" style={{ color: '#1a2456' }}>{data.lab_name || 'نتيجة التحليل'}</h1>
        </div>

        {/* بيانات المريض */}
        <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #e5e7eb' }}>
          <p className="text-base font-bold" style={{ color: '#1a2456' }}>{data.name}</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            {formatAge(data.age, data.age_unit)} • {data.gender}{data.doctor ? ' • دكتور: ' + data.doctor : ''}
          </p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            تاريخ الزيارة: {new Date(data.created_at).toLocaleDateString('ar-EG')}
          </p>
        </div>

        {/* حالة عامة */}
        <div className="rounded-2xl p-4 text-center"
          style={{ background: allApproved ? '#d1fae5' : '#fef3c7', border: '1px solid ' + (allApproved ? '#a7f3d0' : '#fde68a') }}>
          <p className="text-sm font-bold" style={{ color: allApproved ? '#065f46' : '#92400e' }}>
            {allApproved ? '✅ كل النتائج جاهزة ومعتمدة' : '⏳ لسه في نتائج قيد التحضير'}
          </p>
        </div>

        {/* التحاليل */}
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
          {(!data.tests || data.tests.length === 0) ? (
            <p className="text-sm text-center py-8" style={{ color: '#6b7280' }}>مفيش تحاليل مسجلة</p>
          ) : (
            data.tests.map((t, i) => {
              const style = statusStyle[t.status] || statusStyle['تم التجميع']
              return (
                <div key={i} className="p-4" style={{ borderTop: i > 0 ? '1px solid #f1f3f4' : 'none' }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold" style={{ color: '#1a2456' }}>{t.name}</p>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: style.bg, color: style.color }}>
                      {style.label}
                    </span>
                  </div>
                  {t.status === 'معتمد' && (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-lg font-bold" style={{ color: '#1a2456' }}>
                        {t.value || '-'} {t.unit || ''}
                        {t.flag && (
                          <span className="text-sm mr-1" style={{ color: t.flag === 'H' ? '#dc2626' : '#2563eb' }}>{t.flag}</span>
                        )}
                      </p>
                      {t.normal_range && (
                        <p className="text-xs" style={{ color: '#9ca3af' }}>المعدل الطبيعي: {t.normal_range}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <p className="text-xs text-center" style={{ color: '#9ca3af' }}>
          لأي استفسار، تواصل مباشرة مع المعمل{data.lab_phone ? ' على ' + data.lab_phone : ''}.
        </p>
      </div>
    </div>
  )
}