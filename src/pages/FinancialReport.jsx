import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useToast } from '../components/Toast'
import { calculatePatientRevenue, getDateBucket, PERIOD_FILTERS } from '../utils/financeUtils'
import { exportToCSV } from '../utils/exportUtils'

export default function FinancialReport() {
  const showToast = useToast()
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodFilter, setPeriodFilter] = useState('month')

  useEffect(() => { fetchPatients() }, [])

  const fetchPatients = async () => {
    const { data, error } = await supabase
      .from('patients')
      .select('id, name, doctor, paid, created_at, tests(name, price, panel_instance_id)')
      .order('created_at', { ascending: false })
    if (error) showToast('فشل تحميل البيانات: ' + error.message, 'error')
    setPatients(data || [])
    setLoading(false)
  }

  const filtered = patients.filter(p =>
    periodFilter === 'all' || getDateBucket(p.created_at) === periodFilter
  )

  let totalCollected = 0
  let totalPending = 0
  const testCounts = {}

  filtered.forEach(p => {
    const revenue = calculatePatientRevenue(p)
    if (p.paid) totalCollected += revenue
    else totalPending += revenue

    const seenPanelInstances = new Set()
    ;(p.tests || []).forEach(t => {
      // بنعد كل بند باسمه، بس البنود اللي جوه نفس الباقة بتتعد مرة واحدة تحت اسم الباقة نفسها
      // (مش هنا الغرض إحصاء كل مكوّن CBC لوحده، الغرض معرفة "التحاليل الأكتر طلبًا")
      const key = t.name
      testCounts[key] = (testCounts[key] || 0) + 1
    })
  })

  const topTests = Object.entries(testCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)

  const totalRevenue = totalCollected + totalPending
  const paidPatientsCount = filtered.filter(p => p.paid).length
  const unpaidPatientsCount = filtered.filter(p => !p.paid).length

  const exportReport = () => {
    const rows = filtered.map(p => ({
      name: p.name,
      doctor: p.doctor || '-',
      date: new Date(p.created_at).toLocaleDateString('ar-EG'),
      revenue: calculatePatientRevenue(p).toFixed(2),
      status: p.paid ? 'مدفوع' : 'غير مدفوع',
    }))
    exportToCSV('التقرير_المالي', [
      { key: 'name', label: 'اسم المريض' },
      { key: 'doctor', label: 'الدكتور' },
      { key: 'date', label: 'التاريخ' },
      { key: 'revenue', label: 'القيمة (جنيه)' },
      { key: 'status', label: 'حالة الدفع' },
    ], rows)
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>التقرير المالي</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>نظرة سريعة على التحصيل والمتبقي وأكتر التحاليل طلبًا</p>
        </div>
        <button onClick={exportReport}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>
          📊 تصدير Excel
        </button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {PERIOD_FILTERS.map(f => (
          <button key={f.key} onClick={() => setPeriodFilter(f.key)}
            className="px-3 py-1 rounded-full text-xs font-medium transition-all"
            style={{
              background: periodFilter === f.key ? 'var(--primary-container)' : '#f1f3f4',
              color: periodFilter === f.key ? 'white' : 'var(--on-surface-variant)'
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>جاري التحميل...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
            <div className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
              <div className="text-2xl mb-2">💰</div>
              <div className="text-2xl font-bold" style={{ color: '#065f46' }}>{totalCollected.toFixed(2)}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>تم تحصيله ({paidPatientsCount} مريض)</div>
            </div>
            <div className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
              <div className="text-2xl mb-2">⏳</div>
              <div className="text-2xl font-bold" style={{ color: '#dc2626' }}>{totalPending.toFixed(2)}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>متبقي ({unpaidPatientsCount} مريض)</div>
            </div>
            <div className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
              <div className="text-2xl mb-2">📈</div>
              <div className="text-2xl font-bold" style={{ color: '#1a2456' }}>{totalRevenue.toFixed(2)}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>إجمالي قيمة التحاليل</div>
            </div>
            <div className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
              <div className="text-2xl mb-2">👥</div>
              <div className="text-2xl font-bold" style={{ color: '#1a2456' }}>{filtered.length}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>عدد المرضى في الفترة</div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-5" style={{ border: '1px solid var(--outline-variant)' }}>
            <h2 className="font-semibold mb-4" style={{ color: 'var(--on-surface)' }}>🔬 أكتر التحاليل طلبًا في الفترة دي</h2>
            {topTests.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--on-surface-variant)' }}>مفيش بيانات كفاية في الفترة دي</p>
            ) : (
              <div className="space-y-2">
                {topTests.map(([name, count]) => {
                  const maxCount = topTests[0][1]
                  const widthPercent = Math.max(8, (count / maxCount) * 100)
                  return (
                    <div key={name} className="flex items-center gap-3">
                      <span className="text-sm w-32 flex-shrink-0 truncate" style={{ color: 'var(--on-surface)' }}>{name}</span>
                      <div className="flex-1 rounded-full overflow-hidden" style={{ background: '#f1f3f4', height: '18px' }}>
                        <div style={{ width: widthPercent + '%', height: '100%', background: 'var(--primary-container)', borderRadius: '999px' }} />
                      </div>
                      <span className="text-xs font-medium w-8 text-left" style={{ color: 'var(--on-surface-variant)' }}>{count}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}