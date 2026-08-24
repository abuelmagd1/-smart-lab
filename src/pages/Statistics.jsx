import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useToast } from '../components/Toast'
import { exportToCSV } from '../utils/exportUtils'
import { summarizeFinances, pctChange } from '../utils/financeUtils'
import AnimatedNumber from '../components/AnimatedNumber'

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

// بيحسب التكلفة الفعلية لمريض واحد - سعر كل باقة بيتاخد مرة واحدة بس (مش لكل بند جواها)
const patientCost = (patient) => {
  const { singleTests, panelGroups } = splitTests(patient)
  let cost = 0
  singleTests.forEach(t => { cost += parseFloat(t.price) || 0 })
  Object.values(panelGroups).forEach(g => {
    cost += parseFloat(g.items && g.items[0] ? g.items[0].price : 0) || 0
  })
  return cost
}

const periodOptions = [
  { key: 'today', label: 'اليوم', icon: '📅' },
  { key: 'week', label: 'آخر 7 أيام', icon: '🗓️' },
  { key: 'month', label: 'الشهر الحالي', icon: '📆' },
  { key: 'custom', label: 'فترة مخصصة', icon: '🎯' },
]

const EXPENSE_CATEGORIES = ['إيجار', 'كهرباء ومرافق', 'رواتب', 'صيانة', 'مستلزمات', 'أخرى']

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
  const showToast = useToast()
  const [periodType, setPeriodType] = useState('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [allPatients, setAllPatients] = useState([])
  const [allExpenses, setAllExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [showAllRanked, setShowAllRanked] = useState(false)
  const [patientSearch, setPatientSearch] = useState('')

  const [editExpense, setEditExpense] = useState(null)
  const [savingExpense, setSavingExpense] = useState(false)
  const [deleteExpenseConfirm, setDeleteExpenseConfirm] = useState(null)

  const fetchAll = async () => {
    setLoading(true)
    setLoadError(false)
    // بنجيب بس المدى المطلوب فعليًا لعرض الإحصائيات (الفترة الحالية + الفترة
    // اللي قبلها للمقارنة)، مش كل تاريخ المعمل من أول يوم - نفس الأرقام
    // بالظبط، بس تحميل أخف وأسرع مع نمو عدد المرضى بمرور الوقت
    const { start, end } = getRange(periodType, customStart, customEnd)
    const { start: rangeStart } = getPreviousRange(start, end)

    const [patientsRes, expensesRes] = await Promise.all([
      supabase.from('patients').select('*, tests(*)').order('created_at', { ascending: false })
        .gte('created_at', rangeStart.toISOString()).lt('created_at', end.toISOString()),
      supabase.from('lab_expenses').select('*').order('expense_date', { ascending: false })
        .gte('expense_date', rangeStart.toISOString()).lt('expense_date', end.toISOString()),
    ])

    if (patientsRes.error) {
      console.error('فشل جلب بيانات الإحصائيات:', patientsRes.error)
      setLoadError(true)
      showToast('حصل خطأ أثناء تحميل بيانات الإحصائيات، جرّب تحدّث الصفحة', 'error')
      setLoading(false)
      return
    }
    if (expensesRes.error) {
      showToast('فشل تحميل المصروفات: ' + expensesRes.error.message, 'error')
    }

    setAllPatients(patientsRes.data || [])
    setAllExpenses(expensesRes.data || [])
    setLoading(false)
  }

  // بيحمّل البيانات أول ما الصفحة تفتح، وبعدين أي مرة الفترة (أو التاريخ
  // المخصص) تتغيّر - عشان يجيب بس المدى المطلوب فعليًا في كل مرة
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll() }, [periodType, customStart, customEnd])

  const { start, end } = getRange(periodType, customStart, customEnd)
  const { start: prevStart, end: prevEnd } = getPreviousRange(start, end)

  const inRange = (dateStr, s, e) => {
    const d = new Date(dateStr)
    return d >= s && d < e
  }

  const currentPatients = allPatients.filter(p => inRange(p.created_at, start, end))
  const previousPatients = allPatients.filter(p => inRange(p.created_at, prevStart, prevEnd))
  const currentExpenses = allExpenses.filter(e => inRange(e.expense_date, start, end))
  const previousExpenses = allExpenses.filter(e => inRange(e.expense_date, prevStart, prevEnd))

  const stats = summarizeFinances(currentPatients, currentExpenses)
  const prevStats = summarizeFinances(previousPatients, previousExpenses)

  const avgPerPatient = stats.totalPatients > 0 ? (stats.totalRevenue / stats.totalPatients) : 0

  const maxCount = stats.ranked.length > 0 ? stats.ranked[0].count : 1
  const visibleRanked = showAllRanked ? stats.ranked : stats.ranked.slice(0, 8)

  const filteredPatients = currentPatients.filter(p => p.name?.includes(patientSearch))

  const cards = [
    { label: 'عدد المرضى', rawValue: stats.totalPatients, decimals: 0, suffix: '', delta: pctChange(stats.totalPatients, prevStats.totalPatients), icon: '👥', color: '#1a2456' },
    { label: 'عدد الطلبات (تحاليل + باقات)', rawValue: stats.totalOrders, decimals: 0, suffix: '', delta: pctChange(stats.totalOrders, prevStats.totalOrders), icon: '🧪', color: '#0e7490' },
    { label: 'الإيراد الإجمالي', rawValue: stats.totalRevenue, decimals: 0, suffix: ' جنيه', delta: pctChange(stats.totalRevenue, prevStats.totalRevenue), icon: '💰', color: '#065f46' },
    { label: 'متوسط الإيراد لكل مريض', rawValue: avgPerPatient, decimals: 0, suffix: ' جنيه', delta: null, icon: '📊', color: '#92400e' },
  ]

  const exportPatientsReport = () => {
    const rows = filteredPatients.map(p => ({
      name: p.name,
      date: new Date(p.created_at).toLocaleDateString('ar-EG'),
      doctor: p.doctor || '-',
      orders: splitTests(p).singleTests.length + Object.keys(splitTests(p).panelGroups).length,
      cost: patientCost(p).toFixed(2),
      status: p.paid ? 'مدفوع' : 'غير مدفوع',
    }))
    exportToCSV('تقرير_الإحصائيات', [
      { key: 'name', label: 'اسم المريض' },
      { key: 'date', label: 'التاريخ' },
      { key: 'doctor', label: 'الدكتور' },
      { key: 'orders', label: 'عدد الطلبات' },
      { key: 'cost', label: 'التكلفة (جنيه)' },
      { key: 'status', label: 'حالة الدفع' },
    ], rows)
  }

  const exportExpensesReport = () => {
    const rows = currentExpenses.map(e => ({
      date: new Date(e.expense_date).toLocaleDateString('ar-EG'),
      category: e.category || 'أخرى',
      description: e.description || '-',
      amount: parseFloat(e.amount).toFixed(2),
    }))
    exportToCSV('تقرير_المصروفات', [
      { key: 'date', label: 'التاريخ' },
      { key: 'category', label: 'البند' },
      { key: 'description', label: 'الوصف' },
      { key: 'amount', label: 'المبلغ (جنيه)' },
    ], rows)
  }

  const openAddExpense = () => setEditExpense({ amount: '', category: EXPENSE_CATEGORIES[0], description: '', expense_date: new Date().toISOString().slice(0, 10) })

  const saveExpense = async () => {
    const amountNum = parseFloat(editExpense.amount)
    if (!amountNum || amountNum <= 0) {
      showToast('من فضلك ادخل مبلغ صحيح أكبر من صفر', 'warning')
      return
    }
    setSavingExpense(true)
    const { error } = await supabase.from('lab_expenses').insert([{
      amount: amountNum,
      category: editExpense.category || 'أخرى',
      description: editExpense.description?.trim() || null,
      expense_date: editExpense.expense_date,
    }])
    setSavingExpense(false)
    if (error) {
      showToast('فشل حفظ المصروف: ' + error.message, 'error')
      return
    }
    showToast('✅ تم تسجيل المصروف', 'success')
    setEditExpense(null)
    fetchAll()
  }

  const deleteExpense = async () => {
    if (!deleteExpenseConfirm) return
    const { error } = await supabase.from('lab_expenses').delete().eq('id', deleteExpenseConfirm.id)
    if (error) {
      showToast('فشل حذف المصروف: ' + error.message, 'error')
      return
    }
    showToast('🗑️ تم حذف المصروف', 'success')
    setDeleteExpenseConfirm(null)
    fetchAll()
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>الإحصائيات والتقارير المالية</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>عدد المرضى، التحاليل الأكثر طلبًا، والإيراد حسب الفترة</p>
        </div>
        <button onClick={exportPatientsReport}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>
          📊 تصدير Excel
        </button>
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
        <div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4 mb-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-xl p-4 animate-pulse" style={{ border: '1px solid var(--outline-variant)' }}>
                <div style={{ width: '40px', height: '40px', background: '#f1f3f4', borderRadius: '12px', marginBottom: '12px' }} />
                <div style={{ width: '70px', height: '22px', background: '#f1f3f4', borderRadius: '6px', marginBottom: '8px' }} />
                <div style={{ width: '110px', height: '12px', background: '#f1f3f4', borderRadius: '6px' }} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-xl p-4 animate-pulse" style={{ border: '1px solid var(--outline-variant)' }}>
                <div style={{ width: '32px', height: '24px', background: '#f1f3f4', borderRadius: '6px', marginBottom: '10px' }} />
                <div style={{ width: '90px', height: '18px', background: '#f1f3f4', borderRadius: '6px', marginBottom: '8px' }} />
                <div style={{ width: '100px', height: '11px', background: '#f1f3f4', borderRadius: '6px' }} />
              </div>
            ))}
          </div>
        </div>
      ) : loadError ? (
        <div className="text-center py-16" style={{ color: 'var(--on-surface-variant)' }}>
          <div className="text-3xl mb-2">⚠️</div>
          مقدرناش نجيب بيانات الإحصائيات. جرّب تحدّث الصفحة.
        </div>
      ) : (
        <>
          {/* بطاقات الملخص */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4 mb-4">
            {cards.map((c, i) => (
              <div key={i} className="bg-white rounded-xl p-4 transition-all hover:shadow-md" style={{ border: '1px solid var(--outline-variant)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                    style={{ background: `${c.color}15` }}>
                    {c.icon}
                  </div>
                  {c.delta !== null && <DeltaBadge value={c.delta} />}
                </div>
                <p className="text-xl font-bold" style={{ color: c.color }}>
                  <AnimatedNumber value={c.rawValue} decimals={c.decimals} suffix={c.suffix} />
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>{c.label}</p>
              </div>
            ))}
          </div>

          {/* بطاقات المدفوع/غير المدفوع/المصروفات/صافي الربح */}
          <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
            <div className="bg-white rounded-xl p-4 transition-all hover:shadow-md" style={{ border: '1px solid var(--outline-variant)' }}>
              <div className="text-2xl mb-2">✅</div>
              <p className="text-xl font-bold" style={{ color: '#065f46' }}><AnimatedNumber value={stats.collected} suffix=" جنيه" /></p>
              <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>تم تحصيله فعليًا</p>
            </div>
            <div className="bg-white rounded-xl p-4 transition-all hover:shadow-md" style={{ border: '1px solid var(--outline-variant)' }}>
              <div className="text-2xl mb-2">⏳</div>
              <p className="text-xl font-bold" style={{ color: '#dc2626' }}><AnimatedNumber value={stats.pending} suffix=" جنيه" /></p>
              <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>متبقي (غير مدفوع)</p>
            </div>
            <div className="bg-white rounded-xl p-4 transition-all hover:shadow-md" style={{ border: '1px solid var(--outline-variant)' }}>
              <div className="text-2xl mb-2">🧾</div>
              <p className="text-xl font-bold" style={{ color: '#92400e' }}><AnimatedNumber value={stats.totalExpenses} suffix=" جنيه" /></p>
              <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>إجمالي المصروفات</p>
            </div>
            <div className="bg-white rounded-xl p-4 transition-all hover:shadow-md" style={{ border: '1px solid var(--outline-variant)' }}>
              <div className="text-2xl mb-2">📈</div>
              <p className="text-xl font-bold" style={{ color: stats.netProfit >= 0 ? '#065f46' : '#dc2626' }}><AnimatedNumber value={stats.netProfit} suffix=" جنيه" /></p>
              <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>صافي الربح (تحصيل - مصروفات)</p>
            </div>
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

          {/* المصروفات */}
          <div className="bg-white rounded-xl p-5 mt-5" style={{ border: '1px solid var(--outline-variant)' }}>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="font-semibold" style={{ color: 'var(--on-surface)' }}>
                🧾 مصروفات الفترة
                <span className="mr-2 text-xs px-2 py-1 rounded-full text-white" style={{ background: '#92400e' }}>
                  {currentExpenses.length}
                </span>
              </h2>
              <div className="flex gap-2">
                <button onClick={exportExpensesReport}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>
                  📊 تصدير
                </button>
                <button onClick={openAddExpense}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                  style={{ background: '#92400e' }}>
                  ➕ إضافة مصروف
                </button>
              </div>
            </div>

            {currentExpenses.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: 'var(--on-surface-variant)' }}>لا توجد مصروفات مسجلة في هذه الفترة</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ background: '#f1f3f4' }}>
                      <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>التاريخ</th>
                      <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>البند</th>
                      <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الوصف</th>
                      <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>المبلغ</th>
                      <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentExpenses.map(e => (
                      <tr key={e.id} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                        <td className="p-3 text-xs" style={{ color: 'var(--on-surface-variant)' }}>{new Date(e.expense_date).toLocaleDateString('ar-EG')}</td>
                        <td className="p-3 text-sm font-medium" style={{ color: 'var(--on-surface)' }}>{e.category || 'أخرى'}</td>
                        <td className="p-3 text-xs" style={{ color: 'var(--on-surface-variant)' }}>{e.description || '-'}</td>
                        <td className="p-3 text-sm font-semibold" style={{ color: '#92400e' }}>{parseFloat(e.amount).toLocaleString('ar-EG')} جنيه</td>
                        <td className="p-3">
                          <button onClick={() => setDeleteExpenseConfirm(e)}
                            className="px-2 py-1 rounded-lg text-xs font-medium" style={{ background: '#fee2e2', color: '#dc2626' }}>
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                      <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>حالة الدفع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPatients.map(p => {
                      const { singleTests, panelGroups } = splitTests(p)
                      const orderCount = singleTests.length + Object.keys(panelGroups).length
                      const cost = patientCost(p)
                      return (
                        <tr key={p.id} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                          <td className="p-3 text-sm font-medium" style={{ color: 'var(--on-surface)' }}>{p.name}</td>
                          <td className="p-3 text-xs" style={{ color: 'var(--on-surface-variant)' }}>
                            {new Date(p.created_at).toLocaleDateString('ar-EG')}
                          </td>
                          <td className="p-3 text-xs" style={{ color: 'var(--on-surface-variant)' }}>{p.doctor || '-'}</td>
                          <td className="p-3 text-xs" style={{ color: 'var(--on-surface-variant)' }}>{orderCount}</td>
                          <td className="p-3 text-xs font-semibold" style={{ color: '#065f46' }}>{cost.toLocaleString('ar-EG')} جنيه</td>
                          <td className="p-3">
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                              style={p.paid ? { background: '#d1fae5', color: '#065f46' } : { background: '#fee2e2', color: '#991b1b' }}>
                              {p.paid ? 'مدفوع' : 'غير مدفوع'}
                            </span>
                          </td>
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

      {/* Modal إضافة مصروف */}
      {editExpense && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" dir="rtl">
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--on-surface)' }}>إضافة مصروف جديد</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>المبلغ (جنيه) *</label>
                <input type="number" value={editExpense.amount}
                  onChange={e => setEditExpense(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>البند</label>
                <select value={editExpense.category} onChange={e => setEditExpense(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px', background: 'white' }}>
                  {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>التاريخ</label>
                <input type="date" value={editExpense.expense_date}
                  onChange={e => setEditExpense(prev => ({ ...prev, expense_date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>وصف (اختياري)</label>
                <textarea rows={2} value={editExpense.description}
                  onChange={e => setEditExpense(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right resize-none"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setEditExpense(null)} disabled={savingExpense}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={saveExpense} disabled={savingExpense}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: '#92400e', opacity: savingExpense ? 0.7 : 1 }}>
                {savingExpense ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal تأكيد حذف مصروف */}
      {deleteExpenseConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" dir="rtl">
            <h2 className="font-bold text-lg mb-2" style={{ color: '#dc2626' }}>⚠️ تأكيد الحذف</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--on-surface-variant)' }}>
              هيتم حذف مصروف <strong>{deleteExpenseConfirm.category}</strong> بقيمة {deleteExpenseConfirm.amount} جنيه نهائيًا.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteExpenseConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={deleteExpense}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: '#dc2626' }}>
                حذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}