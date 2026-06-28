import { useEffect, useState, useRef, Fragment } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import JsBarcode from 'jsbarcode'
import { getBarcodeCode } from '../components/BarcodeLabel'

const resultColor = {
  'طبيعي': { color: '#065f46', bg: '#d1fae5' },
  'مرتفع': { color: '#92400e', bg: '#fef3c7' },
  'منخفض': { color: '#1e40af', bg: '#dbeafe' },
  'تم التجميع': { color: '#374151', bg: '#f3f4f6' },
  'تم الاستلام': { color: '#1e40af', bg: '#dbeafe' },
  'قيد التحليل': { color: '#92400e', bg: '#fef3c7' },
  'معتمد': { color: '#065f46', bg: '#d1fae5' },
}

export default function Reports() {
  const location = useLocation()
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [settings, setSettings] = useState(null)
  const [design, setDesign] = useState({
    report_header_color: '#1a2456',
    report_table_color: '#1a2456',
    report_font_size: '11',
    report_table_text_color: '#333333',
    report_result_normal_color: '#000000',
    report_result_high_color: '#dc2626',
    report_result_low_color: '#2563eb',
  })
  const [savingDesign, setSavingDesign] = useState(false)
  const [designSaved, setDesignSaved] = useState(false)
  const previewRef = useRef(null)
  const barcodeCanvasRef = useRef(null)

  useEffect(() => { fetchPatients(); fetchSettings() }, [])

  useEffect(() => {
    const targetId = location.state?.autoSelectPatientId
    if (!loading && targetId && patients.length) {
      const match = patients.find(p => p.id === targetId)
      if (match) setSelectedPatient(match)
    }
  }, [loading, patients, location.state])

  const fetchPatients = async () => {
    const { data } = await supabase
      .from('patients')
      .select('*, tests(*)')
      .order('created_at', { ascending: false })
    setPatients(data || [])
    setLoading(false)
  }

  const fetchSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('lab_settings').select('*').eq('user_id', user.id).single()
    if (data) {
      setSettings(data)
      setDesign({
        report_header_color: data.report_header_color || '#1a2456',
        report_table_color: data.report_table_color || '#1a2456',
        report_font_size: data.report_font_size || '11',
        report_table_text_color: data.report_table_text_color || '#333333',
        report_result_normal_color: data.report_result_normal_color || '#000000',
        report_result_high_color: data.report_result_high_color || '#dc2626',
        report_result_low_color: data.report_result_low_color || '#2563eb',
      })
    }
  }

  const saveDesign = async () => {
    setSavingDesign(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('lab_settings').update(design).eq('user_id', user.id)
    setSettings(prev => ({ ...prev, ...design }))
    setSavingDesign(false)
    setDesignSaved(true)
    setTimeout(() => setDesignSaved(false), 2000)
  }

  const filtered = patients.filter(p => p.name?.includes(search))
  const fs = parseInt(design.report_font_size) || 11

  const groupedTests = (patient) => {
    const groups = {}
    patient.tests?.forEach(t => {
      const cat = t.category || 'General'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(t)
    })
    return groups
  }

  const calcResultStatus = (value, range) => {
    const num = parseFloat(String(value).replace(',', '.'))
    if (isNaN(num) || !range) return null
    const matches = String(range).match(/-?\d+(\.\d+)?/g)
    if (!matches || matches.length < 2) return null
    const nums = matches.map(parseFloat).sort((a, b) => a - b)
    const [low, high] = nums
    if (num > high) return 'مرتفع'
    if (num < low) return 'منخفض'
    return 'طبيعي'
  }

 const printReport = () => {
  if (!selectedPatient) return

  let barcodeDataUrl = ''
  let barcodeCode = ''
  try {
    const canvas = barcodeCanvasRef.current
    if (canvas && selectedPatient.barcode_seq) {
      barcodeCode = getBarcodeCode(selectedPatient)
      JsBarcode(canvas, barcodeCode, {
        format: 'CODE128',
        width: 1.5,
        height: 35,
        displayValue: true,
        fontSize: 10,
        margin: 3,
      })
      barcodeDataUrl = canvas.toDataURL('image/png')
    }
  } catch { }

  const printContents = previewRef.current.innerHTML
  const genderText = selectedPatient.gender === 'ذكر' ? 'Male' : 'Female'
  const printDate = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const visitDate = new Date(selectedPatient.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const hc = design.report_header_color

  const patientInfoWithBarcode = `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px 30px; flex:1;">
        ${[
          ['Patient Name :', selectedPatient.name],
          ['Print Date :', printDate],
          ['Sex / Age :', `${genderText} / ${selectedPatient.age || '-'} Years`],
          ['Visit Date :', visitDate],
          ['Referred By :', selectedPatient.doctor || '-'],
        ].map(([label, value]) => `
          <div style="display:flex; gap:5px; font-size:${fs}px;">
            <span style="font-weight:bold; color:${hc}; white-space:nowrap;">${label}</span>
            <span style="color:#333;">${value}</span>
          </div>
        `).join('')}
      </div>
      ${barcodeDataUrl ? `
        <div style="text-align:center; padding-right:10px;">
          <img src="${barcodeDataUrl}" style="height:55px;" />
          <div style="font-size:9px; font-weight:bold; color:${hc}; margin-top:2px;">${barcodeCode}</div>
        </div>
      ` : ''}
    </div>
  `

  // استبدل قسم بيانات المريض في الـ preview بالنسخة اللي فيها باركود
  const modifiedContents = printContents.replace(
    /<div style="margin-bottom: 12px;">[\s\S]*?<\/div>\s*<hr/,
    patientInfoWithBarcode + '<hr'
  )

  const win = window.open('', '_blank')
  win.document.write(`
    <html dir="ltr">
    <head>
      <title>Laboratory Report - ${selectedPatient.name}</title>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; padding: 20px 25px; background: white; font-size: ${fs}px; color: #000; }
        .preview-container { max-width: 100%; }
        @media print { @page { margin: 8mm; size: A4; } }
      </style>
    </head>
    <body><div class="preview-container">${modifiedContents}</div></body>
    </html>
  `)
  win.document.close()
  setTimeout(() => win.print(), 800)
}

  const PreviewReport = ({ patient }) => {
    if (!patient || !settings) return null

    const doctorName = settings.doctor_name || 'اسم الطبيب'
    const printDate = new Date().toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
    const visitDate = new Date(patient.created_at).toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
    const genderText = patient.gender === 'ذكر' ? 'Male' : patient.gender === 'أنثى' ? 'Female' : patient.gender || '-'
    const groups = groupedTests(patient)

    const hc = design.report_header_color
    const tc = design.report_table_color
    const ttc = design.report_table_text_color
    const rNormal = design.report_result_normal_color
    const rHigh = design.report_result_high_color
    const rLow = design.report_result_low_color

    return (
      <div style={{ fontFamily: 'Arial, sans-serif', fontSize: `${fs}px`, color: '#000', background: 'white', padding: '20px 25px' }}>

        {/* Header فاضي - للطباعة على ورقة هيدر جاهزة */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'center', gap: '8mm', marginBottom: '6mm' }}>
          <div style={{ height: '90px' }}></div>
          <div style={{ height: '90px' }}></div>
          <div style={{ height: '90px' }}></div>
        </div>

        <hr style={{ border: 'none', borderTop: `2px solid ${hc}`, margin: '10px 0' }} />

        {/* Title */}
        <div style={{ background: hc, color: 'white', textAlign: 'center', padding: '6px', fontSize: `${fs + 2}px`, fontWeight: 'bold', marginBottom: '12px', borderRadius: '3px', letterSpacing: '1px' }}>
          Laboratory Report
        </div>

        {/* Patient Info */}
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 30px' }}>
            {[
              ['Patient Name :', patient.name],
              ['Print Date :', printDate],
              ['Sex / Age :', `${genderText} / ${patient.age || '-'} Years`],
              ['Visit Date :', visitDate],
              ['Referred By :', patient.doctor || '-'],
            ].map(([label, value], i) => (
              <div key={i} style={{ display: 'flex', gap: '5px', fontSize: `${fs}px` }}>
                <span style={{ fontWeight: 'bold', color: hc, whiteSpace: 'nowrap' }}>{label}</span>
                <span style={{ color: '#333' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '8px 0' }} />

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5px' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              {['Test Name', 'Result', 'Unit', 'Reference range'].map((h, i) => (
                <th key={i} style={{
                  padding: '7px 10px', textAlign: 'left', fontSize: `${fs}px`,
                  fontWeight: 'bold', color: '#333',
                  borderBottom: `2px solid ${tc}`, borderTop: '1px solid #ddd',
                  width: i === 0 ? '35%' : i === 1 ? '20%' : i === 2 ? '15%' : '30%'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([category, tests]) => (
              <Fragment key={category}>
                <tr style={{ background: `${tc}18` }}>
                  <td colSpan={4} style={{
                    padding: '6px 10px', fontWeight: 'bold', fontSize: `${fs + 1}px`,
                    color: tc, borderTop: `1px solid ${tc}40`, borderBottom: `1px solid ${tc}40`
                  }}>■ {category}</td>
                </tr>
                {tests.map((t, ti) => {
                  const computedStatus = calcResultStatus(t.value, t.normal_range) || t.status
                  return (
                    <tr key={ti} style={{ background: ti % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee', color: ttc }}>■ {t.name}</td>
                      <td style={{
                        padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee',
                        color: computedStatus === 'مرتفع' ? rHigh : computedStatus === 'منخفض' ? rLow : rNormal,
                        fontWeight: (computedStatus === 'مرتفع' || computedStatus === 'منخفض') ? 'bold' : 'normal'
                      }}>{t.value || '---'}</td>
                      <td style={{ padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee', color: ttc }}>{t.unit || ''}</td>
                      <td style={{ padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee', color: ttc }}>{t.normal_range || '---'}</td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ marginTop: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '12px', borderTop: `2px solid ${hc}` }}>
          <div style={{ width: '100px', height: '65px', border: `2px dashed ${hc}`, borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${fs}px`, color: hc, fontWeight: 'bold', direction: 'rtl' }}>
            ختم المعمل
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: `${fs + 1}px`, fontWeight: 'bold', color: hc, marginBottom: '25px' }}>Dr. {doctorName}</div>
            <div style={{ width: '160px', borderBottom: `1px solid ${hc}`, margin: '0 auto' }}></div>
          </div>
        </div>

      </div>
    )
  }

  return (
    <div className="p-6" dir="rtl">

      {/* canvas مخفي لتوليد الباركود */}
      <canvas ref={barcodeCanvasRef} style={{ display: 'none' }} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>التقارير</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>عرض وطباعة تقارير المرضى</p>
      </div>

      {!selectedPatient ? (
        <>
          <input type="text" placeholder="ابحث عن مريض..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-4 py-2 rounded-lg outline-none text-right mb-4"
            style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
            onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
            onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
          />

          {loading ? (
            <div className="text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>جاري التحميل...</div>
          ) : (
            <div className="space-y-4">
              {filtered.map(patient => (
                <div key={patient.id} className="bg-white rounded-xl p-5" style={{ border: '1px solid var(--outline-variant)' }}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="font-semibold" style={{ color: 'var(--on-surface)' }}>{patient.name}</h2>
                      <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                        {patient.age} سنة • {patient.gender} • {patient.doctor}
                      </p>
                    </div>
                    <button onClick={() => setSelectedPatient(patient)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                      style={{ background: 'var(--primary-container)' }}>
                      👁️ عرض التقرير
                    </button>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: '#f1f3f4' }}>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>التحليل</th>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>النتيجة</th>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patient.tests?.map((t, i) => (
                        <tr key={i} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                          <td className="p-3 text-sm font-medium" style={{ color: 'var(--on-surface)' }}>{t.name}</td>
                          <td className="p-3 text-sm" style={{ color: 'var(--on-surface)' }}>{t.value || '-'}</td>
                          <td className="p-3">
                            <span className="text-xs font-medium px-2 py-1 rounded-full"
                              style={{ background: resultColor[t.status]?.bg || '#fef3c7', color: resultColor[t.status]?.color || '#92400e' }}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex gap-4" style={{ alignItems: 'flex-start' }}>

          {/* بانيل التحكم */}
          <div className="bg-white rounded-xl p-4 flex-shrink-0" style={{ width: '220px', border: '1px solid var(--outline-variant)', position: 'sticky', top: '20px' }}>
            <h3 className="font-semibold text-sm mb-4" style={{ color: 'var(--on-surface)' }}>🎨 تصميم التقرير</h3>

            <div className="space-y-3">
              {[
                { label: 'لون الهيدر', key: 'report_header_color' },
                { label: 'لون الجدول', key: 'report_table_color' },
                { label: 'لون نص الجدول', key: 'report_table_text_color' },
                { label: 'لون النتيجة الطبيعية', key: 'report_result_normal_color' },
                { label: 'لون النتيجة المرتفعة', key: 'report_result_high_color' },
                { label: 'لون النتيجة المنخفضة', key: 'report_result_low_color' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between gap-2">
                  <label className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{item.label}</label>
                  <input type="color" value={design[item.key]}
                    onChange={e => setDesign(prev => ({ ...prev, [item.key]: e.target.value }))}
                    style={{ width: '36px', height: '28px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '2px' }}
                  />
                </div>
              ))}

              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--on-surface-variant)' }}>حجم الخط: {design.report_font_size}px</label>
                <input type="range" min="9" max="14" value={design.report_font_size}
                  onChange={e => setDesign(prev => ({ ...prev, report_font_size: e.target.value }))}
                  className="w-full"
                />
              </div>
            </div>

            <button onClick={saveDesign} disabled={savingDesign}
              className="w-full py-2 rounded-lg text-xs font-medium text-white mt-4"
              style={{ background: designSaved ? '#10b981' : 'var(--primary-container)', opacity: savingDesign ? 0.7 : 1 }}>
              {designSaved ? '✅ تم الحفظ' : savingDesign ? 'جاري...' : '💾 حفظ التصميم'}
            </button>

            <button onClick={printReport}
              className="w-full py-2 rounded-lg text-xs font-medium text-white mt-2"
              style={{ background: '#1a2456' }}>
              🖨️ طباعة التقرير
            </button>

            <button onClick={() => setSelectedPatient(null)}
              className="w-full py-2 rounded-lg text-xs font-medium mt-2"
              style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
              ← رجوع
            </button>
          </div>

          {/* البريفيو */}
          <div className="flex-1 bg-white rounded-xl overflow-hidden" style={{ border: '1px solid var(--outline-variant)' }}>
            <div ref={previewRef}>
              <PreviewReport patient={selectedPatient} />
            </div>
          </div>

        </div>
      )}
    </div>
  )
}