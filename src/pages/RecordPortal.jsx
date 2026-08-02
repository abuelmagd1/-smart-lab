import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

const SECTION_LABELS = { RBC: 'RBC', Platelet: 'Platelet', WBC: 'WBC', WBC_DIFF: 'WBC - Diff' }

// نفس منطق فصل التحاليل المفردة عن الباقات المستخدم في صفحة التقارير الداخلية بالظبط
const splitTests = (tests) => {
  const singleTests = []
  const panelGroups = {}
  ;(tests || []).forEach(t => {
    if (t.panel_instance_id) {
      if (!panelGroups[t.panel_instance_id]) {
        panelGroups[t.panel_instance_id] = { panel_code: t.panel_code, items: [], comment: t.comment || '' }
      }
      panelGroups[t.panel_instance_id].items.push(t)
      if (t.comment) panelGroups[t.panel_instance_id].comment = t.comment
    } else {
      singleTests.push(t)
    }
  })
  Object.keys(panelGroups).forEach(key => {
    panelGroups[key].items.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
  })
  return { singleTests, panelGroups }
}

const calcStatus = (value, range) => {
  const num = parseFloat(String(value || '').replace(',', '.'))
  const matches = String(range || '').match(/-?\d+(\.\d+)?/g)
  if (isNaN(num) || !matches || matches.length < 2) return null
  const nums = matches.map(parseFloat).sort((a, b) => a - b)
  if (num > nums[1]) return 'مرتفع'
  if (num < nums[0]) return 'منخفض'
  return 'طبيعي'
}

// بطاقة باقة (زي CBC) مقسّمة بأقسام ملوّنة - نفس تنسيق صفحة التقارير الداخلية بالظبط
function PanelCard({ group, colors, fs }) {
  const { hc, tc, ttc, rHigh, rLow, rNormal } = colors
  const bySection = {}
  group.items.forEach(item => {
    const sec = item.section || 'أخرى'
    if (!bySection[sec]) bySection[sec] = []
    bySection[sec].push(item)
  })
  const flagColor = (flag) => (flag === 'H' ? rHigh : flag === 'L' ? rLow : rNormal)

  return (
    <div style={{ border: `2px solid ${hc}`, borderRadius: '6px', overflow: 'hidden', marginBottom: '10px' }}>
      <div style={{ background: hc, color: 'white', textAlign: 'center', padding: '5px', fontSize: `${fs + 1}px`, fontWeight: 'bold', letterSpacing: '1px' }}>
        {group.panel_code || 'COMPLETE BLOOD COUNT'}
      </div>
      <div style={{ padding: '6px 10px' }}>
        {Object.entries(bySection).map(([section, items]) => {
          const isDiff = section === 'WBC_DIFF'
          return (
            <div key={section}>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px' }}>
                <tbody>
                  <tr style={{ background: `${tc}12` }}>
                    {isDiff ? (
                      <>
                        <td style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: `${fs}px`, color: tc }}>{SECTION_LABELS[section] || section}</td>
                        <td colSpan={2} style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: `${fs - 1}px`, color: tc, textAlign: 'center' }}>Relative %</td>
                        <td colSpan={2} style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: `${fs - 1}px`, color: tc, textAlign: 'center' }}>Absolute</td>
                      </>
                    ) : (
                      <td colSpan={5} style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: `${fs}px`, color: tc }}>■  {SECTION_LABELS[section] || section}</td>
                    )}
                  </tr>
                  {items.map((item, idx) => isDiff ? (
                    <tr key={idx}>
                      <td style={{ padding: '3px 8px', fontSize: `${fs}px`, color: ttc }}>{item.name}</td>
                      <td style={{ padding: '3px 8px', fontSize: `${fs}px`, color: flagColor(item.flag), fontWeight: item.flag ? 'bold' : 'normal' }}>
                        {item.flag ? <b>{item.flag} </b> : null}{item.relative_value || '---'}
                      </td>
                      <td style={{ padding: '3px 8px', fontSize: `${fs - 1}px`, color: '#666' }}>{item.normal_range || ''}</td>
                      <td style={{ padding: '3px 8px', fontSize: `${fs}px`, color: flagColor(item.flag), fontWeight: item.flag ? 'bold' : 'normal' }}>
                        {item.flag ? <b>{item.flag} </b> : null}{item.absolute_value || '---'}
                      </td>
                      <td style={{ padding: '3px 8px', fontSize: `${fs - 1}px`, color: '#666' }}>{item.absolute_range || ''}</td>
                    </tr>
                  ) : (
                    <tr key={idx}>
                      <td colSpan={2} style={{ padding: '3px 8px', fontSize: `${fs}px`, color: ttc, fontWeight: 'bold' }}>{item.name}</td>
                      <td style={{ padding: '3px 8px', fontSize: `${fs}px`, color: flagColor(item.flag), fontWeight: item.flag ? 'bold' : 'normal' }}>
                        {item.flag ? <b>{item.flag} </b> : null}{item.value || '---'}
                      </td>
                      <td style={{ padding: '3px 8px', fontSize: `${fs - 1}px`, color: '#666' }}>{item.unit || ''}</td>
                      <td style={{ padding: '3px 8px', fontSize: `${fs - 1}px`, color: '#666' }}>{item.normal_range || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ borderBottom: '1px dashed #ccc', margin: '4px 0' }} />
            </div>
          )
        })}
        {group.comment && (
          <div style={{ marginTop: '8px', padding: '6px 8px', background: '#f8f9fa', borderRight: `3px solid ${tc}`, fontSize: `${fs - 1}px`, color: '#333' }}>
            <strong style={{ color: tc }}>Comment: </strong>{group.comment}
          </div>
        )}
      </div>
    </div>
  )
}

// كارت التقرير بشكل صفحة الطباعة الرسمية بالظبط - هيدر بانر، شبكة بيانات، جداول
function ReportCard({ visit, profileData, colors, fontFamily, fs, labName, doctorName, footerNote }) {
  const { hc, tc, ttc, rHigh, rLow, rNormal } = colors
  const { singleTests, panelGroups } = splitTests(visit.tests)

  const genderText = profileData.gender === 'ذكر' ? 'Male' : profileData.gender === 'أنثى' ? 'Female' : (profileData.gender || '-')
  const ageUnitLabel = profileData.age_unit === 'Months' ? 'Months' : profileData.age_unit === 'Days' ? 'Days' : 'Years'
  const visitDate = new Date(visit.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const printDate = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div dir="ltr" className="report-card" style={{ background: 'white', fontFamily, fontSize: `${fs}px`, color: '#000', padding: '25px 30px', borderRadius: '10px', border: '1px solid #e5e7eb', marginBottom: '20px' }}>
      <hr style={{ border: 'none', borderTop: `2px solid ${hc}`, margin: '0 0 10px' }} />

      <div style={{ background: hc, color: 'white', textAlign: 'center', padding: '7px', fontSize: `${fs + 2}px`, fontWeight: 'bold', marginBottom: '14px', borderRadius: '3px', letterSpacing: '1px' }}>
        Laboratory Report
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 30px', flex: 1 }}>
          {[
            ['Patient Name :', profileData.name],
            ['Print Date :', printDate],
            ['Sex / Age :', `${genderText} / ${profileData.age || '-'} ${ageUnitLabel}`],
            ['Visit Date :', visitDate],
            ['Referred By :', visit.doctor || '-'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', gap: '5px', fontSize: `${fs}px` }}>
              <span style={{ fontWeight: 'bold', color: hc, whiteSpace: 'nowrap' }}>{label}</span>
              <span style={{ color: '#333' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '8px 0' }} />

      {Object.values(panelGroups).map((group, i) => (
        <PanelCard key={i} group={group} colors={colors} fs={fs} />
      ))}

      {singleTests.length === 0 && Object.keys(panelGroups).length === 0 ? (
        <p style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '13px' }}>لا توجد تحاليل مسجلة</p>
      ) : singleTests.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px' }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: `${fs}px`, fontWeight: 'bold', color: '#333', borderBottom: `2px solid ${tc}`, borderTop: '1px solid #ddd', width: '35%' }}>Test Name</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: `${fs}px`, fontWeight: 'bold', color: '#333', borderBottom: `2px solid ${tc}`, borderTop: '1px solid #ddd', width: '20%' }}>Result</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: `${fs}px`, fontWeight: 'bold', color: '#333', borderBottom: `2px solid ${tc}`, borderTop: '1px solid #ddd', width: '15%' }}>Unit</th>
              <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: `${fs}px`, fontWeight: 'bold', color: '#333', borderBottom: `2px solid ${tc}`, borderTop: '1px solid #ddd', width: '30%' }}>Reference range</th>
            </tr>
          </thead>
          <tbody>
            {singleTests.map((t, ti) => {
              const status = calcStatus(t.value, t.normal_range)
              const isAbnormal = status === 'مرتفع' || status === 'منخفض'
              const color = status === 'مرتفع' ? rHigh : status === 'منخفض' ? rLow : rNormal
              return (
                <tr key={ti} style={{ background: ti % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee', color: ttc }}>■  {t.name}</td>
                  <td style={{ padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee', color, fontWeight: isAbnormal ? 'bold' : 'normal' }}>{t.value || '---'}</td>
                  <td style={{ padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee', color: ttc }}>{t.unit || ''}</td>
                  <td style={{ padding: '6px 10px', fontSize: `${fs}px`, borderBottom: '1px solid #eee', color: ttc }}>{t.normal_range || '---'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <div style={{ marginTop: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '12px', borderTop: `2px solid ${hc}` }}>
        <div style={{ width: '100px', height: '65px', border: `2px dashed ${hc}`, borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${fs}px`, color: hc, fontWeight: 'bold', direction: 'rtl' }}>
          ختم المعمل
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: `${fs + 1}px`, fontWeight: 'bold', color: hc, marginBottom: '25px' }}>Dr. {doctorName || '-'}</div>
          <div style={{ width: '160px', borderBottom: `1px solid ${hc}`, margin: '0 auto' }} />
        </div>
      </div>

      {footerNote && (
        <div style={{ marginTop: '10px', fontSize: `${fs - 1}px`, color: '#666', textAlign: 'center' }}>{footerNote}</div>
      )}
    </div>
  )
}

export default function RecordPortal() {
  const { code } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [viewMode, setViewMode] = useState('latest') // 'latest' | 'all'
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const reportRef = useRef(null)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const fetchData = async () => {
    setLoading(true)
    setNotFound(false)
    const { data: result, error } = await supabase.rpc('get_profile_portal_data', { p_code: code })
    if (error || !result || !result.name) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setData(result)
    setLoading(false)
  }

  // بيطبع الصفحة مباشرة من غير ما يفتح أي تاب أو نافذة جديدة - أضمن طريقة، مفيش خطر
  // إن التطبيق يتعلق لما ترجعله (زي ما كان بيحصل مع window.open)
  const handlePrint = () => {
    window.print()
  }

  // بيحوّل التقرير (أو التقارير) الظاهرة على الشاشة لملف PDF وينزّله على الجهاز مباشرة
  const handleDownloadPdf = async () => {
    if (!reportRef.current) return
    setDownloadingPdf(true)
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
      const imgData = canvas.toDataURL('image/png')

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pageWidth
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      let heightLeft = imgHeight
      let position = 0
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      pdf.save('سجل-' + (data?.name || 'المريض') + '.pdf')
    } catch {
      // تجاهل بصمت - الزرار هيرجع لحالته العادية والمستخدم يقدر يجرب تاني
    } finally {
      setDownloadingPdf(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl" style={{ background: '#f8f9ff' }}>
        <div className="text-sm" style={{ color: '#6b7280' }}>جاري تحميل السجل...</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl" style={{ background: '#f8f9ff' }}>
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm text-center" style={{ border: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
          <h1 className="text-lg font-bold mb-2" style={{ color: '#1a2456' }}>مش لاقيين السجل ده</h1>
          <p className="text-sm" style={{ color: '#6b7280' }}>الرابط ده ممكن يكون غلط أو مش متاح دلوقتي. تواصل مع المعمل عشان يبعتلك الرابط الصحيح.</p>
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
  const colors = { hc, tc, ttc, rHigh, rLow, rNormal }
  const fontFamily = d.font_family || 'Arial, sans-serif'
  const fs = 12

  const visits = data.visits || []
  const visitsToShow = viewMode === 'latest' ? visits.slice(0, 1) : visits

  const profileData = { name: data.name, age: data.age, age_unit: data.age_unit, gender: data.gender }

  return (
    <div dir="rtl" style={{ background: '#eef1f8', minHeight: '100vh' }}>

      <div className="no-print" style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <span className="text-sm font-medium" style={{ color: hc }}>🔬 {data.lab_name || 'سجل المريض'}</span>
        <div className="flex gap-2">
          <button onClick={handleDownloadPdf} disabled={downloadingPdf}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2"
            style={{ background: '#065f46', opacity: downloadingPdf ? 0.7 : 1 }}>
            {downloadingPdf && (
              <span style={{ width: '11px', height: '11px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'record-portal-spin 0.7s linear infinite' }} />
            )}
            {downloadingPdf ? 'جاري التجهيز...' : '📥 تحميل PDF'}
          </button>
          <button onClick={handlePrint}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: hc }}>
            🖨️ طباعة
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '820px', margin: '20px auto', padding: '20px' }}>

        {visits.length > 1 && (
          <div className="no-print flex rounded-xl overflow-hidden mb-4" style={{ border: '1px solid #e5e7eb' }}>
            <button onClick={() => setViewMode('latest')}
              className="flex-1 py-2.5 text-sm font-medium"
              style={{ background: viewMode === 'latest' ? hc : 'white', color: viewMode === 'latest' ? 'white' : '#6b7280' }}>
              آخر زيارة بس
            </button>
            <button onClick={() => setViewMode('all')}
              className="flex-1 py-2.5 text-sm font-medium"
              style={{ background: viewMode === 'all' ? hc : 'white', color: viewMode === 'all' ? 'white' : '#6b7280' }}>
              سجلي الطبي كامل
            </button>
          </div>
        )}

        <div ref={reportRef}>
          {visits.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center" style={{ border: '1px solid #e5e7eb' }}>
              <p className="text-sm" style={{ color: '#9ca3af' }}>لسه مفيش زيارات مسجلة</p>
            </div>
          ) : (
            visitsToShow.map(visit => (
              <ReportCard
                key={visit.id}
                visit={visit}
                profileData={profileData}
                colors={colors}
                fontFamily={fontFamily}
                fs={fs}
                labName={data.lab_name}
                doctorName={data.doctor_name}
                footerNote={d.footer_note}
              />
            ))
          )}
        </div>

        <p className="no-print text-xs text-center mt-4" style={{ color: '#9ca3af' }}>
          لأي استفسار، تواصل مباشرة مع المعمل{data.lab_phone ? ' على ' + data.lab_phone : ''}.
        </p>
      </div>

      <style>{`
        @keyframes record-portal-spin { to { transform: rotate(360deg); } }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 8mm; size: A4; }
        }
      `}</style>
    </div>
  )
}