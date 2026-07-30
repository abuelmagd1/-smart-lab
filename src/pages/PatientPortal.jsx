import { useEffect, useState, useRef, Fragment } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import JsBarcode from 'jsbarcode'
import { getBarcodeCode } from '../components/BarcodeLabel'

export default function PatientPortal() {
  const { code } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const barcodeCanvasRef = useRef(null)

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

  // بنرسم الباركود بعد ما البيانات توصل ويتحط الـ canvas فعليًا في الصفحة
  useEffect(() => {
    if (data?.barcode_seq && barcodeCanvasRef.current) {
      try {
        JsBarcode(barcodeCanvasRef.current, getBarcodeCode(data), {
          format: 'CODE128',
          width: 1.5,
          height: 40,
          displayValue: true,
          fontSize: 11,
          margin: 4,
          lineColor: data.design?.barcode_color || '#1a2456',
        })
      } catch { /* لو الكود فاضي أو غير صالح، نتجاهل رسم الباركود بس مش نكسر الصفحة */ }
    }
  }, [data])

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

  const d = data.design || {}
  const hc = d.header_color || '#1a2456'
  const tc = d.table_color || '#1a2456'
  const ttc = d.table_text_color || '#333333'
  const rNormal = d.result_normal_color || '#000000'
  const rHigh = d.result_high_color || '#dc2626'
  const rLow = d.result_low_color || '#2563eb'
  const headerTitle = d.header_title || 'Laboratory Report'
  const fontFamily = d.font_family || 'Arial, sans-serif'
  const showBarcode = d.show_barcode !== false && data.barcode_seq
  const showStampBox = d.show_stamp_box !== false
  const showSignatureLine = d.show_signature_line !== false

  const genderText = data.gender === 'ذكر' ? 'Male' : data.gender === 'أنثى' ? 'Female' : (data.gender || '-')
  const visitDate = new Date(data.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const printDate = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  // بنحسب الحالة (مرتفع/منخفض/طبيعي) من القيمة والمعدل الطبيعي، بنفس منطق صفحة التقارير الداخلية
  const calcStatus = (value, range) => {
    const num = parseFloat(String(value || '').replace(',', '.'))
    const matches = String(range || '').match(/-?\d+(\.\d+)?/g)
    if (isNaN(num) || !matches || matches.length < 2) return null
    const nums = matches.map(parseFloat).sort((a, b) => a - b)
    if (num > nums[1]) return 'مرتفع'
    if (num < nums[0]) return 'منخفض'
    return 'طبيعي'
  }

  // تجميع التحاليل حسب الفئة (category) - نفس طريقة صفحة التقارير الداخلية
  const groups = {}
  ;(data.tests || []).forEach(t => {
    const cat = t.category || 'General'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(t)
  })

  const showUnit = true
  const showRange = true

  return (
    <div dir="rtl" style={{ background: '#eef1f8', minHeight: '100vh' }}>

      {/* شريط علوي بس على الشاشة، مش بيتطبع خالص */}
      <div className="no-print" style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="text-sm font-medium" style={{ color: '#1a2456' }}>🔬 {data.lab_name || 'نتيجة التحليل'}</span>
        <button onClick={() => window.print()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: hc }}>
          🖨️ طباعة التقرير
        </button>
      </div>

      {/* التقرير نفسه - LTR بنفس تنسيق تقرير المعمل الداخلي بالظبط */}
      <div style={{ maxWidth: '820px', margin: '20px auto', padding: '20px' }}>
        <div dir="ltr" style={{ background: 'white', fontFamily, fontSize: '12px', color: '#000', padding: '25px 30px', borderRadius: '10px', border: '1px solid #e5e7eb' }}>

          <hr style={{ border: 'none', borderTop: `2px solid ${hc}`, margin: '0 0 10px' }} />

          <div style={{ background: hc, color: 'white', textAlign: 'center', padding: '7px', fontSize: '14px', fontWeight: 'bold', marginBottom: '14px', borderRadius: '3px', letterSpacing: '1px' }}>
            {headerTitle}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 30px', flex: 1 }}>
              {[
                ['Patient Name :', data.name],
                ['Print Date :', printDate],
                ['Sex / Age :', `${genderText} / ${data.age || '-'} ${data.age_unit === 'Months' ? 'Months' : data.age_unit === 'Days' ? 'Days' : 'Years'}`],
                ['Visit Date :', visitDate],
                ['Referred By :', data.doctor || '-'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: '5px', fontSize: '12px' }}>
                  <span style={{ fontWeight: 'bold', color: hc, whiteSpace: 'nowrap' }}>{label}</span>
                  <span style={{ color: '#333' }}>{value}</span>
                </div>
              ))}
            </div>

            {showBarcode && (
              <div style={{ textAlign: 'center', paddingRight: '10px', borderRight: '1px solid #eee', marginRight: '10px', flexShrink: 0 }}>
                <div style={{ fontSize: '9px', fontWeight: 'bold', color: d.barcode_color || hc, marginBottom: '3px', letterSpacing: '1px' }}>PATIENT ID</div>
                <canvas ref={barcodeCanvasRef} />
              </div>
            )}
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '8px 0' }} />

          {Object.keys(groups).length === 0 ? (
            <p style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '13px' }}>لا توجد تحاليل مسجلة</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
              <thead>
                <tr style={{ background: '#f0f0f0' }}>
                  <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#333', borderBottom: `2px solid ${tc}`, borderTop: '1px solid #ddd', width: '35%' }}>Test Name</th>
                  <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#333', borderBottom: `2px solid ${tc}`, borderTop: '1px solid #ddd', width: '20%' }}>Result</th>
                  {showUnit && <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#333', borderBottom: `2px solid ${tc}`, borderTop: '1px solid #ddd', width: '15%' }}>Unit</th>}
                  {showRange && <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#333', borderBottom: `2px solid ${tc}`, borderTop: '1px solid #ddd', width: '30%' }}>Reference range</th>}
                </tr>
              </thead>
              <tbody>
                {Object.entries(groups).map(([category, tests]) => (
                  <Fragment key={category}>
                    <tr style={{ background: `${tc}18` }}>
                      <td colSpan={2 + (showUnit ? 1 : 0) + (showRange ? 1 : 0)} style={{ padding: '6px 10px', fontWeight: 'bold', fontSize: '13px', color: tc, borderTop: `1px solid ${tc}40`, borderBottom: `1px solid ${tc}40` }}>
                        ■  {category}
                      </td>
                    </tr>
                    {tests.map((t, ti) => {
                      const status = calcStatus(t.value, t.normal_range)
                      const isAbnormal = status === 'مرتفع' || status === 'منخفض'
                      const color = status === 'مرتفع' ? rHigh : status === 'منخفض' ? rLow : rNormal
                      return (
                        <tr key={ti} style={{ background: ti % 2 === 0 ? 'white' : '#fafafa' }}>
                          <td style={{ padding: '6px 10px', fontSize: '12px', borderBottom: '1px solid #eee', color: ttc }}>■  {t.name}</td>
                          <td style={{ padding: '6px 10px', fontSize: '12px', borderBottom: '1px solid #eee', color, fontWeight: isAbnormal ? 'bold' : 'normal' }}>{t.value || '---'}</td>
                          {showUnit && <td style={{ padding: '6px 10px', fontSize: '12px', borderBottom: '1px solid #eee', color: ttc }}>{t.unit || ''}</td>}
                          {showRange && <td style={{ padding: '6px 10px', fontSize: '12px', borderBottom: '1px solid #eee', color: ttc }}>{t.normal_range || '---'}</td>}
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '12px', borderTop: `2px solid ${hc}` }}>
            {showStampBox ? (
              <div style={{ width: '100px', height: '65px', border: `2px dashed ${hc}`, borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: hc, fontWeight: 'bold', direction: 'rtl' }}>
                ختم المعمل
              </div>
            ) : <div />}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: hc, marginBottom: '25px' }}>Dr. {data.doctor_name || '-'}</div>
              {showSignatureLine && <div style={{ width: '160px', borderBottom: `1px solid ${hc}`, margin: '0 auto' }} />}
            </div>
          </div>

          {d.footer_note && (
            <div style={{ marginTop: '10px', fontSize: '11px', color: '#666', textAlign: 'center' }}>{d.footer_note}</div>
          )}
        </div>

        <p className="no-print text-xs text-center mt-4" style={{ color: '#9ca3af' }}>
          لأي استفسار، تواصل مباشرة مع المعمل{data.lab_phone ? ' على ' + data.lab_phone : ''}.
        </p>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 8mm; size: A4; }
        }
      `}</style>
    </div>
  )
}