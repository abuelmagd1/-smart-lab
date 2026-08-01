import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'

const SECTION_LABELS = { RBC: 'RBC', Platelet: 'Platelet', WBC: 'WBC', WBC_DIFF: 'WBC - Diff' }

const statusStyle = {
  'تم التجميع': { bg: '#f3f4f6', color: '#374151', label: 'تم استلام العينة' },
  'تم الاستلام': { bg: '#dbeafe', color: '#1e40af', label: 'العينة في المعمل' },
  'قيد التحليل': { bg: '#fef3c7', color: '#92400e', label: 'قيد التحليل حاليًا' },
  'معتمد': { bg: '#d1fae5', color: '#065f46', label: 'النتيجة جاهزة ومعتمدة' },
}

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

function VisitCard({ visit, colors, fontFamily, fs }) {
  const { hc, ttc, rHigh, rLow, rNormal } = colors
  const allApproved = visit.tests?.length > 0 && visit.tests.every(t => t.status === 'معتمد')
  const visitDate = new Date(visit.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })
  const { singleTests, panelGroups } = splitTests(visit.tests)
  const hasPanels = Object.keys(panelGroups).length > 0

  return (
    <div className="bg-white rounded-2xl overflow-hidden mb-4" style={{ border: '1px solid #e5e7eb', fontFamily }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ background: `${hc}0d`, borderBottom: '1px solid #e5e7eb' }}>
        <div>
          <p className="text-sm font-bold" style={{ color: hc }}>📅 {visitDate}</p>
          {visit.doctor && <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>د. {visit.doctor}</p>}
        </div>
        <span className="text-xs font-medium px-2 py-1 rounded-full flex-shrink-0"
          style={{ background: allApproved ? '#d1fae5' : '#fef3c7', color: allApproved ? '#065f46' : '#92400e' }}>
          {allApproved ? '✅ جاهزة' : '⏳ قيد التحضير'}
        </span>
      </div>

      <div className="p-3">
        {!visit.tests || visit.tests.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: '#9ca3af' }}>مفيش تحاليل مسجلة في الزيارة دي</p>
        ) : (
          <>
            {Object.values(panelGroups).map((group, i) => (
              <PanelCard key={i} group={group} colors={colors} fs={fs} />
            ))}

            {singleTests.length > 0 && (
              <div className={hasPanels ? 'mt-2' : ''}>
                {singleTests.map((t, i) => {
                  const style = statusStyle[t.status] || statusStyle['تم التجميع']
                  const status = calcStatus(t.value, t.normal_range)
                  const valueColor = status === 'مرتفع' ? rHigh : status === 'منخفض' ? rLow : rNormal
                  return (
                    <div key={i} className="p-3" style={{ borderTop: i > 0 ? '1px solid #f1f3f4' : 'none' }}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold" style={{ color: ttc }}>{t.name}</p>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: style.bg, color: style.color }}>
                          {style.label}
                        </span>
                      </div>
                      {t.status === 'معتمد' && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <p className="text-lg font-bold" style={{ color: valueColor }}>
                            {t.value || '-'} {t.unit || ''}
                            {t.flag && <span className="text-sm mr-1">{t.flag}</span>}
                          </p>
                          {t.normal_range && <p className="text-xs" style={{ color: '#9ca3af' }}>المعدل الطبيعي: {t.normal_range}</p>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function RecordPortal() {
  const { code } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [viewMode, setViewMode] = useState('latest') // 'latest' | 'all'

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

  return (
    <div className="min-h-screen p-4" dir="rtl" style={{ background: '#f8f9ff' }}>
      <div className="max-w-md mx-auto space-y-4 py-4">

        <div className="rounded-2xl p-5 text-center text-white" style={{ background: hc, fontFamily }}>
          <div style={{ fontSize: '28px' }}>🔬</div>
          <h1 className="text-base font-bold mt-1">{data.lab_name || 'سجل المريض'}</h1>
        </div>

        <div className="bg-white rounded-2xl p-5" style={{ border: '1px solid #e5e7eb' }}>
          <p className="text-base font-bold" style={{ color: hc }}>{data.name}</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            {data.age ? `${data.age} ${data.age_unit === 'Years' ? 'سنة' : data.age_unit === 'Months' ? 'شهر' : 'يوم'}` : ''}
            {data.gender ? ' • ' + data.gender : ''}
          </p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            {visits.length} زيارة مسجّلة في سجلك
          </p>
        </div>

        {visits.length > 1 && (
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
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

        {visits.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center" style={{ border: '1px solid #e5e7eb' }}>
            <p className="text-sm" style={{ color: '#9ca3af' }}>لسه مفيش زيارات مسجلة</p>
          </div>
        ) : (
          visitsToShow.map(visit => (
            <VisitCard key={visit.id} visit={visit} colors={colors} fontFamily={fontFamily} fs={fs} />
          ))
        )}

        {d.footer_note && (
          <p className="text-xs text-center" style={{ color: '#6b7280' }}>{d.footer_note}</p>
        )}

        <p className="text-xs text-center" style={{ color: '#9ca3af' }}>
          لأي استفسار، تواصل مباشرة مع المعمل{data.lab_phone ? ' على ' + data.lab_phone : ''}.
        </p>
      </div>
    </div>
  )
}