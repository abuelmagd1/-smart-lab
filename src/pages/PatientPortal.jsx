import { useEffect, useState, useRef, Fragment } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import JsBarcode from 'jsbarcode'
import { getBarcodeCode } from '../components/BarcodeLabel'

const SECTION_LABELS = { RBC: 'RBC', Platelet: 'Platelet', WBC: 'WBC', WBC_DIFF: 'WBC - Diff' }

const HISTORY_COLUMNS = [
  { key: 'WBCs - Total', label: 'WBCs' },
  { key: 'Neutrophil', label: 'Neut', abs: true },
  { key: 'Lymphocytes', label: 'Lymp', abs: true },
  { key: 'Monocytes', label: 'Mono', abs: true },
  { key: 'Eosinophil', label: 'Eosin', abs: true },
  { key: 'Basophil', label: 'Baso', abs: true },
  { key: 'RBCs Count', label: 'RBCs' },
  { key: 'Haemoglobin', label: 'Hgb' },
  { key: 'HCT', label: 'Hct' },
  { key: 'MCV', label: 'MCV' },
  { key: 'MCH', label: 'MCH' },
  { key: 'MCHC', label: 'MCHC' },
  { key: 'Platelet Count', label: 'PLT' },
]

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
        COMPLETE BLOOD COUNT
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
                        <td style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: `${fs}px`, color: tc }}>{SECTION_LABELS[section]}</td>
                        <td colSpan={2} style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: `${fs - 1}px`, color: tc, textAlign: 'center' }}>Relative %</td>
                        <td colSpan={2} style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: `${fs - 1}px`, color: tc, textAlign: 'center' }}>Absolute</td>
                      </>
                    ) : (
                      <td colSpan={5} style={{ padding: '4px 8px', fontWeight: 'bold', fontSize: `${fs}px`, color: tc }}>■  {SECTION_LABELS[section] || section}</td>
                    )}
                  </tr>
                  {items.map(item => isDiff ? (
                    <tr key={item.name}>
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
                    <tr key={item.name}>
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

// رسم بياني بسيط (Sparkline) لاتجاه قيمة معينة عبر الزيارات السابقة - SVG خام بدون أي مكتبة
function TrendChart({ rows, metricKey, label, color }) {
  const points = rows
    .map(r => ({ date: r.date, value: parseFloat((r.byName[metricKey] || {}).value) }))
    .filter(p => !isNaN(p.value))
    .reverse()

  if (points.length < 2) return null

  const width = 260, height = 64, padding = 8
  const values = points.map(p => p.value)
  const minV = Math.min(...values)
  const maxV = Math.max(...values)
  const range = maxV - minV || 1
  const coords = points.map((p, i) => ({
    x: padding + (i / (points.length - 1)) * (width - padding * 2),
    y: height - padding - ((p.value - minV) / range) * (height - padding * 2),
  }))
  const pathD = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ')

  return (
    <div style={{ marginTop: '10px', padding: '10px', background: '#f8f9fa', borderRadius: '10px' }}>
      <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#374151', marginBottom: '4px' }}>📈 اتجاه {label} عبر آخر {points.length} زيارات</div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <path d={pathD} fill="none" stroke={color || '#1a2456'} strokeWidth="2" />
        {coords.map((c, i) => <circle key={i} cx={c.x} cy={c.y} r="3" fill={color || '#1a2456'} />)}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#6b7280' }}>
        <span>أقل: {minV}</span><span>أعلى: {maxV}</span>
      </div>
    </div>
  )
}

function HistorySection({ colors, rows, fs, showTrendCharts }) {
  if (!rows.length) return null
  const rowsWithMap = rows.map(r => {
    const byName = {}
    ;(r.tests || []).forEach(t => { byName[t.name] = t })
    return { date: r.date, byName }
  })

  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ fontSize: `${fs}px`, fontWeight: 'bold', color: colors.tc, marginBottom: '4px' }}>Patient History In Our Lab</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: '3px 5px', fontSize: '9px', border: '1px solid #ccc', background: '#f0f0f0' }}></th>
            {HISTORY_COLUMNS.map(c => (
              <th key={c.key} style={{ padding: '3px 5px', fontSize: '9px', border: '1px solid #ccc', background: '#f0f0f0' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowsWithMap.map((row, i) => (
            <tr key={i}>
              <td style={{ padding: '3px 5px', fontSize: '9px', border: '1px solid #ccc', fontWeight: 'bold' }}>{new Date(row.date).toLocaleDateString('en-GB')}</td>
              {HISTORY_COLUMNS.map(c => {
                const item = row.byName[c.key]
                const val = c.abs ? (item ? item.absolute_value : '-') : (item ? item.value : '-')
                return <td key={c.key} style={{ padding: '3px 5px', fontSize: '9px', border: '1px solid #ccc', textAlign: 'center' }}>{val || '-'}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {showTrendCharts && (
        <>
          <TrendChart rows={rowsWithMap} metricKey="Haemoglobin" label="الهيموجلوبين (Hgb)" color="#dc2626" />
          <TrendChart rows={rowsWithMap} metricKey="Platelet Count" label="الصفائح الدموية (PLT)" color="#1a2456" />
        </>
      )}
    </div>
  )
}

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

  useEffect(() => {
    if (data?.barcode_seq && barcodeCanvasRef.current) {
      try {
        JsBarcode(barcodeCanvasRef.current, getBarcodeCode(data), {
          format: 'CODE128', width: 1.5, height: 40, displayValue: true, fontSize: 11, margin: 4,
          lineColor: data.design?.barcode_color || '#1a2456',
        })
      } catch { /* تجاهل فشل رسم الباركود، مش نكسر الصفحة */ }
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
  const fs = 12
  const headerTitle = d.header_title || 'Laboratory Report'
  const fontFamily = d.font_family || 'Arial, sans-serif'
  const showBarcode = d.show_barcode !== false && data.barcode_seq
  const showStampBox = d.show_stamp_box !== false
  const showSignatureLine = d.show_signature_line !== false
  const showHistory = d.show_history !== false
  const showTrendCharts = d.show_trend_charts !== false

  const genderText = data.gender === 'ذكر' ? 'Male' : data.gender === 'أنثى' ? 'Female' : (data.gender || '-')
  const ageUnitLabel = data.age_unit === 'Months' ? 'Months' : data.age_unit === 'Days' ? 'Days' : 'Years'
  const visitDate = new Date(data.created_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const printDate = new Date().toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const { singleTests, panelGroups } = splitTests(data.tests)
  const groups = {}
  singleTests.forEach(t => {
    const cat = t.category || 'General'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(t)
  })
  const hasPanels = Object.keys(panelGroups).length > 0

  return (
    <div dir="rtl" style={{ background: '#eef1f8', minHeight: '100vh' }}>

      <div className="no-print" style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="text-sm font-medium" style={{ color: '#1a2456' }}>🔬 {data.lab_name || 'نتيجة التحليل'}</span>
        <button onClick={() => window.print()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: hc }}>
          🖨️ طباعة التقرير
        </button>
      </div>

      <div style={{ maxWidth: '820px', margin: '20px auto', padding: '20px' }}>
        <div dir="ltr" style={{ background: 'white', fontFamily, fontSize: `${fs}px`, color: '#000', padding: '25px 30px', borderRadius: '10px', border: '1px solid #e5e7eb' }}>

          <hr style={{ border: 'none', borderTop: `2px solid ${hc}`, margin: '0 0 10px' }} />

          <div style={{ background: hc, color: 'white', textAlign: 'center', padding: '7px', fontSize: `${fs + 2}px`, fontWeight: 'bold', marginBottom: '14px', borderRadius: '3px', letterSpacing: '1px' }}>
            {headerTitle}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 30px', flex: 1 }}>
              {[
                ['Patient Name :', data.name],
                ['Print Date :', printDate],
                ['Sex / Age :', `${genderText} / ${data.age || '-'} ${ageUnitLabel}`],
                ['Visit Date :', visitDate],
                ['Referred By :', data.doctor || '-'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: '5px', fontSize: `${fs}px` }}>
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

          {Object.values(panelGroups).map((group, i) => (
            <PanelCard key={i} group={group} colors={colors} fs={fs} />
          ))}

          {showHistory && hasPanels && (
            <HistorySection colors={colors} rows={data.history || []} fs={fs} showTrendCharts={showTrendCharts} />
          )}

          {singleTests.length === 0 && !hasPanels ? (
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
                {Object.entries(groups).map(([category, tests]) => (
                  <Fragment key={category}>
                    <tr style={{ background: `${tc}18` }}>
                      <td colSpan={4} style={{ padding: '6px 10px', fontWeight: 'bold', fontSize: `${fs + 1}px`, color: tc, borderTop: `1px solid ${tc}40`, borderBottom: `1px solid ${tc}40` }}>■  {category}</td>
                    </tr>
                    {tests.map((t, ti) => {
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
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: '12px', borderTop: `2px solid ${hc}` }}>
            {showStampBox ? (
              <div style={{ width: '100px', height: '65px', border: `2px dashed ${hc}`, borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: `${fs}px`, color: hc, fontWeight: 'bold', direction: 'rtl' }}>
                ختم المعمل
              </div>
            ) : <div />}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: `${fs + 1}px`, fontWeight: 'bold', color: hc, marginBottom: '25px' }}>Dr. {data.doctor_name || '-'}</div>
              {showSignatureLine && <div style={{ width: '160px', borderBottom: `1px solid ${hc}`, margin: '0 auto' }} />}
            </div>
          </div>

          {d.footer_note && (
            <div style={{ marginTop: '10px', fontSize: `${fs - 1}px`, color: '#666', textAlign: 'center' }}>{d.footer_note}</div>
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