import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { formatAge } from '../utils/referenceRanges'

const DEFAULT_PORTAL_DESIGN = {
  header_color: '#1a2456',
  header_title: 'Laboratory Report',
  table_color: '#1a2456',
  table_text_color: '#333333',
  result_normal_color: '#000000',
  result_high_color: '#dc2626',
  result_low_color: '#2563eb',
  barcode_color: '#1a2456',
  font_family: 'Arial, sans-serif',
  show_barcode: true,
  show_stamp_box: true,
  show_signature_line: true,
  footer_note: '',
}

const statusStyleBase = {
  'تم التجميع': { label: 'تم استلام العينة' },
  'تم الاستلام': { label: 'العينة في المعمل' },
  'قيد التحليل': { label: 'قيد التحليل حاليًا' },
  'معتمد': { label: 'النتيجة جاهزة ومعتمدة' },
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

  // بندمج تصميم التقرير الراجع من الدالة مع قيم افتراضية، عشان لو أي حقل مش موجود
  // (مثلاً معمل لسه معملش أي تخصيص) الصفحة تفضل شغالة بشكل افتراضي محترم بدل ما تتكسر
  const design = { ...DEFAULT_PORTAL_DESIGN, ...(data.design || {}) }
  const fontFamily = design.font_family || DEFAULT_PORTAL_DESIGN.font_family

  const statusStyle = {
    'تم التجميع': { ...statusStyleBase['تم التجميع'], bg: '#f3f4f6', color: '#374151' },
    'تم الاستلام': { ...statusStyleBase['تم الاستلام'], bg: '#dbeafe', color: '#1e40af' },
    'قيد التحليل': { ...statusStyleBase['قيد التحليل'], bg: '#fef3c7', color: '#92400e' },
    'معتمد': { ...statusStyleBase['معتمد'], bg: '#d1fae5', color: '#065f46' },
  }

  const allApproved = data.tests?.length > 0 && data.tests.every(t => t.status === 'معتمد')

  const flagColor = (flag) => {
    if (flag === 'H') return design.result_high_color
    if (flag === 'L') return design.result_low_color
    return design.result_normal_color
  }

  return (
    <div className="min-h-screen p-4" dir="rtl" style={{ background: '#f8f9ff', fontFamily }}>
      <div className="max-w-md mx-auto space-y-4 py-4">

        {/* هيدر المعمل - بلون التقرير المعتمد في إعدادات المعمل */}
        <div className="rounded-2xl p-5 text-center text-white" style={{ background: design.header_color }}>
          <div style={{ fontSize: '28px' }}>🔬</div>
          <h1 className="text-base font-bold mt-1">{data.lab_name || design.header_title}</h1>
        </div>

        {/* بيانات المريض */}
        <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #e5e7eb' }}>
          <p className="text-base font-bold" style={{ color: design.header_color }}>{data.name}</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            {formatAge(data.age, data.age_unit)} • {data.gender}{data.doctor ? ' • دكتور: ' + data.doctor : ''}
          </p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            تاريخ الزيارة: {new Date(data.created_at).toLocaleDateString('ar-EG')}
          </p>
          {design.show_barcode && data.barcode_seq && (
            <p className="text-xs mt-2 font-mono" style={{ color: design.barcode_color }}>
              كود العينة: {data.barcode_seq}
            </p>
          )}
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
                    <p className="text-sm font-semibold" style={{ color: design.table_text_color }}>{t.name}</p>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: style.bg, color: style.color }}>
                      {style.label}
                    </span>
                  </div>
                  {t.status === 'معتمد' && (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-lg font-bold" style={{ color: flagColor(t.flag) }}>
                        {t.value || '-'} {t.unit || ''}
                        {t.flag && (
                          <span className="text-sm mr-1">{t.flag}</span>
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

        {design.footer_note && (
          <p className="text-xs text-center" style={{ color: '#6b7280' }}>{design.footer_note}</p>
        )}

        {design.show_signature_line && data.doctor_name && (
          <p className="text-xs text-center" style={{ color: design.header_color, fontWeight: 'bold' }}>
            Dr. {data.doctor_name}
          </p>
        )}

        <p className="text-xs text-center" style={{ color: '#9ca3af' }}>
          لأي استفسار، تواصل مباشرة مع المعمل{data.lab_phone ? ' على ' + data.lab_phone : ''}.
        </p>
      </div>
    </div>
  )
}