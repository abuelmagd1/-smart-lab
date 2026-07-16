import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// نفس منطق فصل التحاليل المفردة عن الباقات المستخدم في صفحة التقارير
const splitTests = (patient) => {
  const singleTests = []
  const panelGroups = {}
  const allTests = patient.tests || []
  for (let i = 0; i < allTests.length; i++) {
    const t = allTests[i]
    if (t.panel_instance_id) {
      if (!panelGroups[t.panel_instance_id]) {
        panelGroups[t.panel_instance_id] = { panel_code: t.panel_code, items: [] }
      }
      panelGroups[t.panel_instance_id].items.push(t)
    } else {
      singleTests.push(t)
    }
  }
  return { singleTests, panelGroups }
}

const periodOptions = [
  { key: 'today', label: 'اليوم', icon: '📅' },
  { key: 'week', label: 'آخر 7 أيام', icon: '🗓️' },
  { key: 'month', label: 'الشهر الحالي', icon: '📆' },
  { key: 'custom', label: 'فترة مخصصة', icon: '🎯' },
]

const getRange = (periodType, customStart, customEnd) => {
  const now = new Date()
  let start, end
  if (periodType === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    end = new Date(start)
    end.setDate(end.getDate() + 1)
  } else if (periodType === 'week') {
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    end.setDate(end.getDate() + 1)
    start = new Date(end)
    start.setDate(start.getDate() - 7)
  } else if (periodType === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  } else {
    start = customStart ? new Date(customStart) : new Date(now.getFullYear(), now.getMonth(), 1)
    end = customEnd ? new Date(new Date(customEnd).getTime() + 24 * 60 * 60 * 1000) : new Date()
  }
  return { start, end }
}

const getPreviousRange = (start, end) => {
  const duration = end.getTime() - start.getTime()
  const prevEnd = new Date(start)
  const prevStart = new Date(start.getTime() - duration)
  return { start: prevStart, end: prevEnd }
}

const formatRangeLabel = (start, end) => {
  const opts = { day: '2-digit', month: '2-digit', year: 'numeric' }
  const endDisplay = new Date(end.getTime() - 1)
  return start.toLocaleDateString('ar-EG', opts) + '  →  ' + endDisplay.toLocaleDateString('ar-EG', opts)
}

const computeStats = (patientsList) => {
  let totalRevenue = 0
  let totalOrders = 0
  const doctorsMap = {}
  const rankMap = {}

  patientsList.forEach(p => {
    if (p.doctor) {
      doctorsMap[p.doctor] = (doctorsMap[p.doctor] || 0) + 1
    }
    const { singleTests, panelGroups } = splitTests(p)

    singleTests.forEach(t => {
      totalRevenue += parseFloat(t.price) || 0
      totalOrders += 1
      const key = t.name
      if (!rankMap[key]) rankMap[key] = { name: key, count: 0, type: 'مفرد', revenue: 0 }
      rankMap[key].count += 1
      rankMap[key].revenue += parseFloat(t.price) || 0
    })

    Object.values(panelGroups).forEach(g => {
      const price = g.items && g.items[0] ? g.items[0].price : 0
      totalRevenue += parseFloat(price) || 0
      totalOrders += 1
      const key = g.panel_code || 'باقة'
      if (!rankMap[key]) rankMap[key] = { name: key, count: 0, type: 'باقة', revenue: 0 }
      rankMap[key].count += 1
      rankMap[key].revenue += parseFloat(price) || 0
    })
  })

  const ranked = Object.values(rankMap).sort((a, b) => b.count - a.count)
  const topDoctors = Object.entries(doctorsMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return {
    totalPatients: patientsList.length,
    totalRevenue,
    totalOrders,
    ranked,
    topDoctors,
  }
}

const pctChange = (current, previous) => {
  if (previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

const DeltaBadge = ({ value }) => {
  if (value === 0) return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>
      = 0%
    </span>
  )
  const up = value > 0
  return (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: up ? '#d1fae5' : '#fee2e2', color: up ? '#065f46' : '#dc2626' }}>
      {up ? '▲' : '▼'} {Math.abs(value)}%
    </span>
  )
}

export default function Statistics() {
  const [periodType, setPeriodType] = useState('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [allPatients, setAllPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAllRanked, setShowAllRanked] = useState(false)
  const [patientSearch, setPatientSearch] = useState('')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('patients')
      .select('*, tests(*)')
      .order('created_at', { ascending: false })
    setAllPatients(data || [])
    setLoading(false)
  }

  const { start, end } = getRange(periodType, customStart, customEnd)
  const { start: prevStart, end: prevEnd } = getPreviousRange(start, end)

  const inRange = (dateStr, s, e) => {
    const d = new Date(dateStr)
    return d >= s && d < e
  }

  const currentPatients = allPatients.filter(p => inRange(p.created_at, start, end))
  const previousPatients = allPatients.filter(p => inRange(p.created_at, prevStart, prevEnd))

  const stats = computeStats(currentPatients)
  const prevStats = computeStats(previousPatients)

  const avgPerPatient = stats.totalPatients > 0 ? (stats.totalRevenue / stats.totalPatients) : 0

  const maxCount = stats.ranked.length > 0 ? stats.ranked[0].count : 1
  const visibleRanked = showAllRanked ? stats.ranked : stats.ranked.slice(0, 8)

  const filteredPatients = currentPatients.filter(p => p.name?.includes(patientSearch))

  const cards = [
    { label: 'عدد المرضى', value: stats.totalPatients.toLocaleString('ar-EG'), delta: pctChange(stats.totalPatients, prevStats.totalPatients), icon: '👥', color: '#1a2456' },
    { label: 'عدد الطلبات (تحاليل + باقات)', value: stats.totalOrders.toLocaleString('ar-EG'), delta: pctChange(stats.totalOrders, prevStats.totalOrders), icon: '🧪', color: '#0e7490' },
    { label: 'الإيراد الإجمالي', value: stats.totalRevenue.toLocaleString('ar-EG') + ' جنيه', delta: pctChange(stats.totalRevenue, prevStats.totalRevenue), icon: '💰', color: '#065f46' },
    { label: 'متوسط الإيراد لكل مريض', value: avgPerPatient.toLocaleString('ar-EG', { maximumFractionDigits: 0 }) + ' جنيه', delta: null, icon: '📊', color: '#92400e' },
  ]

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>الإحصائيات والتقارير المالية</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>عدد المرضى، التحاليل الأكثر طلبًا، والإيراد حسب الفترة</p>
      </div>

      {/* اختيار الفترة */}
      <div className="bg-white rounded-xl p-4 mb-5" style={{ border: '1px solid var(--outline-variant)' }}>
        <div className="flex gap-2 flex-wrap mb-2">
          {periodOptions.map(opt => (
            <button key={opt.key} onClick={() => setPeriodType(opt.key)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
              style={{
                background: periodType === opt.key ? 'var(--primary-container)' : '#f1f3f4',
                color: periodType === opt.key ? 'white' : 'var(--on-surface-variant)',
              }}>
              <span>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        {periodType === 'custom' && (
          <div className="flex gap-3 flex-wrap items-end mt-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--on-surface-variant)' }}>من تاريخ</label>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="px-3 py-2 rounded-lg outline-none text-sm"
                style={{ border: '1px solid var(--outline-variant)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--on-surface-variant)' }}>إلى تاريخ</label>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="px-3 py-2 rounded-lg outline-none text-sm"
                style={{ border: '1px solid var(--outline-variant)' }} />
            </div>
          </div>
        )}

        <p className="text-xs mt-3" style={{ color: 'var(--on-surface-variant)' }}>
          الفترة المعروضة: <strong style={{ color: 'var(--on-surface)' }}>{formatRangeLabel(start, end)}</strong>
          <span className="mx-2">•</span>
          مقارنة تلقائية بفترة سابقة بنفس المدة
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16" style={{ color: 'var(--on-surface-variant)' }}>جاري تحميل الإحصائيات...</div>
      ) : (
        <>
          {/* بطاقات الملخص */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4 mb-6">
            {cards.map((c, i) => (
              <div key={i} className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                    style={{ background: `${c.color}15` }}>
                    {c.icon}
                  </div>
                  {c.delta !== null && <DeltaBadge value={c.delta} />}
                </div>
                <p className="text-xl font-bold" style={{ color: c.color }}>{c.value}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>{c.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

            {/* التحاليل الأكثر طلبًا */}
            <div className="lg:col-span-2 bg-white rounded-xl p-5" style={{ border: '1px solid var(--outline-variant)' }}>
              <h2 className="font-semibold mb-4" style={{ color: 'var(--on-surface)' }}>🏆 التحاليل الأكثر طلبًا</h2>

              {stats.ranked.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--on-surface-variant)' }}>لا توجد بيانات في هذه الفترة</p>
              ) : (
                <div className="space-y-3">
                  {visibleRanked.map((item, i) => (
                    <div key={item.name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--on-surface-variant)' }}>{i + 1}</span>
                          <span className="text-sm font-medium" style={{ color: 'var(--on-surface)' }}>{item.name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                            style={{
                              background: item.type === 'باقة' ? '#e0f2fe' : '#f1f3f4',
                              color: item.type === 'باقة' ? '#0369a1' : 'var(--on-surface-variant)'
                            }}>
                            {item.type}
                          </span>
                        </div>
                        <span className="text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>
                          {item.count} طلب • {item.revenue.toLocaleString('ar-EG')} جنيه
                        </span>
                      </div>
                      <div className="w-full rounded-full overflow-hidden" style={{ height: '8px', background: '#f1f3f4' }}>
                        <div style={{
                          width: `${(item.count / maxCount) * 100}%`,
                          height: '100%',
                          background: item.type === 'باقة' ? '#0369a1' : 'var(--primary-container)',
                          borderRadius: '999px',
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                    </div>
                  ))}

                  {stats.ranked.length > 8 && (
                    <button onClick={() => setShowAllRanked(!showAllRanked)}
                      className="text-xs font-medium mt-2"
                      style={{ color: 'var(--primary-container)' }}>
                      {showAllRanked ? 'عرض أقل ▲' : `عرض الكل (${stats.ranked.length}) ▼`}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* الأطباء الأكثر تحويلاً */}
            <div className="bg-white rounded-xl p-5" style={{ border: '1px solid var(--outline-variant)' }}>
              <h2 className="font-semibold mb-4" style={{ color: 'var(--on-surface)' }}>👨‍⚕️ الأطباء الأكثر تحويلاً</h2>
              {stats.topDoctors.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: 'var(--on-surface-variant)' }}>لا توجد بيانات</p>
              ) : (
                <div className="space-y-3">
                  {stats.topDoctors.slice(0, 8).map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--on-surface-variant)' }}>{i + 1}</span>
                        <span className="text-sm" style={{ color: 'var(--on-surface)' }}>{d.name}</span>
                      </div>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: '#e8f0fe', color: 'var(--primary-container)' }}>
                        {d.count} مريض
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* قائمة المرضى في الفترة */}
          <div className="bg-white rounded-xl p-5 mt-5" style={{ border: '1px solid var(--outline-variant)' }}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="font-semibold" style={{ color: 'var(--on-surface)' }}>
                مرضى الفترة المحددة
                <span className="mr-2 text-xs px-2 py-1 rounded-full text-white" style={{ background: 'var(--primary-container)' }}>
                  {currentPatients.length}
                </span>
              </h2>
              <input type="text" placeholder="ابحث باسم المريض..." value={patientSearch}
                onChange={e => setPatientSearch(e.target.value)}
                className="px-3 py-2 rounded-lg outline-none text-sm text-right"
                style={{ border: '1px solid var(--outline-variant)', minWidth: '220px' }} />
            </div>

            {filteredPatients.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--on-surface-variant)' }}>لا يوجد مرضى مطابقين</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ background: '#f1f3f4' }}>
                      <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الاسم</th>
                      <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>التاريخ</th>
                      <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الدكتور</th>
                      <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>عدد الطلبات</th>
                      <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.map(p => {
                      const { singleTests, panelGroups } = splitTests(p)
                      const orderCount = singleTests.length + Object.keys(panelGroups).length
                      let cost = 0
                      singleTests.forEach(t => { cost += parseFloat(t.price) || 0 })
                      Object.values(panelGroups).forEach(g => {
                        cost += parseFloat(g.items && g.items[0] ? g.items[0].price : 0) || 0
                      })
                      return (
                        <tr key={p.id} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                          <td className="p-3 text-sm font-medium" style={{ color: 'var(--on-surface)' }}>{p.name}</td>
                          <td className="p-3 text-xs" style={{ color: 'var(--on-surface-variant)' }}>
                            {new Date(p.created_at).toLocaleDateString('ar-EG')}
                          </td>
                          <td className="p-3 text-xs" style={{ color: 'var(--on-surface-variant)' }}>{p.doctor || '-'}</td>
                          <td className="p-3 text-xs" style={{ color: 'var(--on-surface-variant)' }}>{orderCount}</td>
                          <td className="p-3 text-xs font-semibold" style={{ color: '#065f46' }}>{cost.toLocaleString('ar-EG')} جنيه</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
