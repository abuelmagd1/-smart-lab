import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'
import EmptyState from '../components/EmptyState'
import useDebounce from '../hooks/useDebounce'
import { useToast } from '../components/Toast'
import { summarizeFinances } from '../utils/financeUtils'

const statusStyle = {
  'تم التجميع': { bg: '#f3f4f6', color: '#374151' },
  'تم الاستلام': { bg: '#dbeafe', color: '#1e40af' },
  'قيد التحليل': { bg: '#fef3c7', color: '#92400e' },
  'معتمد': { bg: '#d1fae5', color: '#065f46' },
}

const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

const periodFilters = [
  { key: 'all', label: 'الكل' },
  { key: 'today', label: 'اليوم' },
  { key: 'yesterday', label: 'امبارح' },
  { key: 'week', label: 'آخر أسبوع' },
  { key: 'month', label: 'آخر شهر' },
  { key: 'older', label: 'قبل ذلك' },
]

const getBucket = (dateStr) => {
  const date = new Date(dateStr)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 7)
  const startOfMonth = new Date(startOfToday); startOfMonth.setDate(startOfMonth.getDate() - 30)

  if (date >= startOfToday) return 'today'
  if (date >= startOfYesterday) return 'yesterday'
  if (date >= startOfWeek) return 'week'
  if (date >= startOfMonth) return 'month'
  return 'older'
}

const matchesSearch = (p, term) => {
  if (!term) return true
  const t = term.trim().toLowerCase()
  if (!t) return true

  const fields = [p.name, p.phone, p.doctor, p.gender, String(p.age ?? '')]
  if (fields.some(f => f?.toLowerCase().includes(t))) return true

  return !!p.tests?.some(test =>
    test.name?.toLowerCase().includes(t) ||
    test.status?.toLowerCase().includes(t) ||
    test.value?.toLowerCase?.().includes(t)
  )
}

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-4 animate-pulse" style={{ border: '1px solid var(--outline-variant)' }}>
      <div style={{ width: '28px', height: '28px', background: '#f1f3f4', borderRadius: '8px', marginBottom: '10px' }} />
      <div style={{ width: '48px', height: '24px', background: '#f1f3f4', borderRadius: '6px', marginBottom: '8px' }} />
      <div style={{ width: '110px', height: '12px', background: '#f1f3f4', borderRadius: '6px' }} />
    </div>
  )
}

function TableRowSkeleton() {
  return (
    <tr style={{ borderTop: '1px solid var(--outline-variant)' }}>
      <td className="p-3"><div className="animate-pulse" style={{ height: '14px', width: '110px', background: '#f1f3f4', borderRadius: '6px' }} /></td>
      <td className="p-3"><div className="animate-pulse" style={{ height: '14px', width: '160px', background: '#f1f3f4', borderRadius: '6px' }} /></td>
      <td className="p-3"><div className="animate-pulse" style={{ height: '20px', width: '80px', background: '#f1f3f4', borderRadius: '999px' }} /></td>
    </tr>
  )
}

export default function Dashboard() {
  const { settings } = useOutletContext()
  const showToast = useToast()
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [now, setNow] = useState(new Date())
  const [periodFilter, setPeriodFilter] = useState('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  // نفس فكرة Results.jsx بالظبط: أول صفحة بتفتح بعد تسجيل الدخول أهم صفحة
  // تفضل خفيفة - آخر 90 يوم افتراضيًا، والسجل الكامل بصمت بس لو فعلاً محتاجينه
  const RECENT_DAYS = 90
  const [historyMode, setHistoryMode] = useState('recent')

  const fetchData = async (mode) => {
    var useMode = mode || historyMode
    setLoadError(false)
    var query = supabase.from('patients').select('*, tests(*)').order('created_at', { ascending: false })
    if (useMode === 'recent') {
      var cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - RECENT_DAYS)
      query = query.gte('created_at', cutoff.toISOString())
    }
    const { data, error } = await query

    if (error) {
      console.error('فشل جلب بيانات المرضى:', error)
      setLoadError(true)
      showToast('حصل خطأ أثناء تحميل بيانات المرضى، جرّب تحدّث الصفحة', 'error')
      setLoading(false)
      return
    }

    setPatients(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData('recent')
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  // زي Results.jsx بالظبط: البحث وفلتر "قبل ذلك" لازم يشوفوا التاريخ الكامل
  useEffect(() => {
    if (historyMode === 'full') return
    if (debouncedSearch.trim() !== '' || periodFilter === 'older') {
      setHistoryMode('full')
      fetchData('full')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, periodFilter])

  const getFormattedDate = () => {
    const day = dayNames[now.getDay()]
    const date = now.getDate()
    const month = monthNames[now.getMonth()]
    const year = now.getFullYear()
    return `${day}، ${date} ${month} ${year}`
  }

  const getFormattedTime = () => {
    return now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: settings?.timeFormat === '12',
    })
  }

  const [weeklyExpenses, setWeeklyExpenses] = useState([])
  const [labNameForReport, setLabNameForReport] = useState('')
  const [showWeeklyReport, setShowWeeklyReport] = useState(false)

  // بيانات آخر 7 أيام كفاية عشان التقرير الأسبوعي - جدول المصروفات صغير عادةً
  // فمفيش داعي نحمّله مع باقي بيانات الصفحة الرئيسية طول الوقت، بنجيبه بس
  // لما المستخدم فعليًا يفتح كارت التقرير الأسبوعي
  const fetchWeeklyExpenses = async () => {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const [expensesRes, labRes] = await Promise.all([
      supabase.from('lab_expenses').select('*').gte('expense_date', weekAgo.toISOString()),
      supabase.from('lab_settings').select('lab_name').eq('user_id', (await supabase.auth.getUser()).data.user?.id).maybeSingle(),
    ])
    setWeeklyExpenses(expensesRes.data || [])
    setLabNameForReport(labRes.data?.lab_name || '')
  }

  const weekAgoDate = new Date()
  weekAgoDate.setDate(weekAgoDate.getDate() - 7)
  const weeklyPatients = patients.filter(p => p.created_at && new Date(p.created_at) >= weekAgoDate)
  const weeklyStats = summarizeFinances(weeklyPatients, weeklyExpenses)

  const weeklyReportText =
    '📊 التقرير الأسبوعي - ' + (labNameForReport || 'المعمل') + '\n' +
    'من ' + weekAgoDate.toLocaleDateString('ar-EG') + ' لحد النهاردة\n\n' +
    '👥 عدد المرضى: ' + weeklyStats.totalPatients + '\n' +
    '🧪 عدد التحاليل: ' + weeklyStats.totalOrders + '\n' +
    '💰 الإيراد: ' + weeklyStats.totalRevenue.toLocaleString('ar-EG') + ' جنيه\n' +
    '✅ المحصّل: ' + weeklyStats.collected.toLocaleString('ar-EG') + ' جنيه\n' +
    '⏳ المعلّق: ' + weeklyStats.pending.toLocaleString('ar-EG') + ' جنيه\n' +
    (weeklyStats.totalExpenses > 0 ? '📉 المصروفات: ' + weeklyStats.totalExpenses.toLocaleString('ar-EG') + ' جنيه\n' : '') +
    (weeklyStats.ranked.length > 0 ? '\n🔝 أكتر تحليل مطلوب: ' + weeklyStats.ranked[0].name + ' (' + weeklyStats.ranked[0].count + ' مرة)' : '')

  const shareWeeklyReportWhatsApp = () => {
    // wa.me هو رابط واتساب الرسمي المجاني بالكامل - بيفتح واتساب (تطبيق أو
    // ويب) مع نص جاهز، والمستخدم بس يختار لمين يبعت ويدوس إرسال. مفيش أي
    // API أو تكلفة خالص، بس مش أوتوماتيك 100% - محتاج ضغطة إرسال يدوية
    const url = 'https://wa.me/?text=' + encodeURIComponent(weeklyReportText)
    window.open(url, '_blank')
  }

  const copyWeeklyReport = async () => {
    try {
      await navigator.clipboard.writeText(weeklyReportText)
      showToast('تم نسخ التقرير - الصقه في إيميل أو أي مكان تاني ✅')
    } catch {
      showToast('تعذّر النسخ التلقائي، انسخ النص يدويًا من الكارت', 'error')
    }
  }

  const filteredPatients = patients
    .filter(p => periodFilter === 'all' || getBucket(p.created_at) === periodFilter)
    .filter(p => matchesSearch(p, debouncedSearch))

  const todayPatients = patients.filter(p => getBucket(p.created_at) === 'today')
  const todayTests = todayPatients.flatMap(p => p.tests || [])
  const inProgressStages = ['تم التجميع', 'تم الاستلام', 'قيد التحليل']
  const stats = {
    total: todayPatients.length,
    pending: todayTests.filter(t => inProgressStages.includes(t.status)).length,
    done: todayTests.filter(t => t.status === 'معتمد').length,
  }

  // تحاليل "متأخرة": لسه في حالة غير معتمدة وعدّى على تسجيل المريض أكتر من DELAY_THRESHOLD_HOURS
  // (بنحسبها من وقت تسجيل المريض لأننا معندناش تاريخ منفصل لتغيير حالة كل تحليل)
  const DELAY_THRESHOLD_HOURS = 3
  const delayedItems = []
  patients.forEach(p => {
    const hoursSince = (now.getTime() - new Date(p.created_at).getTime()) / (1000 * 60 * 60)
    if (hoursSince < DELAY_THRESHOLD_HOURS) return
    ;(p.tests || []).forEach(t => {
      if (inProgressStages.includes(t.status)) {
        delayedItems.push({ patientName: p.name, testName: t.name, hoursSince: Math.floor(hoursSince) })
      }
    })
  })

  const statCards = [
    { label: 'مرضى اليوم', value: stats.total, icon: '👥', color: '#1a73e8' },
    { label: 'تحاليل قيد التنفيذ اليوم', value: stats.pending, icon: '⏳', color: '#f59e0b' },
    { label: 'تحاليل معتمدة اليوم', value: stats.done, icon: '✅', color: '#10b981' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>لوحة التحكم</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
          {getFormattedDate()} • {getFormattedTime()}
        </p>
      </div>

      {!loading && delayedItems.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
          <p className="text-sm font-bold mb-2" style={{ color: '#92400e' }}>
            ⏰ فيه {delayedItems.length} تحليل متأخر (عدّى عليه أكتر من {DELAY_THRESHOLD_HOURS} ساعات من غير اعتماد)
          </p>
          <div className="space-y-1">
            {delayedItems.slice(0, 5).map((d, i) => (
              <p key={i} className="text-xs" style={{ color: '#92400e' }}>
                • <strong>{d.patientName}</strong> - {d.testName} (من {d.hoursSince} ساعة)
              </p>
            ))}
            {delayedItems.length > 5 && (
              <p className="text-xs" style={{ color: '#92400e' }}>و {delayedItems.length - 5} تحليل تاني...</p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl p-4 mb-4 bg-white" style={{ border: '1px solid var(--outline-variant)' }}>
        <button onClick={() => { setShowWeeklyReport(!showWeeklyReport); if (!showWeeklyReport) fetchWeeklyExpenses() }}
          className="w-full flex items-center justify-between text-sm font-medium" style={{ color: 'var(--on-surface)' }}>
          <span>📊 التقرير الأسبوعي (آخر 7 أيام) - جاهز يتبعت لواتساب أو إيميل</span>
          <span>{showWeeklyReport ? '▲' : '▼'}</span>
        </button>
        {showWeeklyReport && (
          <div className="mt-3">
            <pre className="text-xs p-3 rounded-lg whitespace-pre-wrap" dir="rtl" style={{ background: 'var(--surface)', color: 'var(--on-surface-variant)', fontFamily: 'inherit' }}>
              {weeklyReportText}
            </pre>
            <div className="flex gap-2 mt-3">
              <button onClick={shareWeeklyReportWhatsApp} className="flex-1 py-2 rounded-lg text-sm font-medium text-white" style={{ background: '#25D366' }}>
                📱 مشاركة على واتساب
              </button>
              <button onClick={copyWeeklyReport} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>
                📋 نسخ (للإيميل)
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          statCards.map((s, i) => (
            <div key={i} className="bg-white rounded-xl p-4" style={{ border:'1px solid var(--outline-variant)' }}>
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
              <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>{s.label}</div>
            </div>
          ))
        )}
      </div>

      <div className="bg-white rounded-xl" style={{ border: '1px solid var(--outline-variant)' }}>
        <div className="p-4 space-y-3" style={{ borderBottom: '1px solid var(--outline-variant)' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold" style={{ color: 'var(--on-surface)'}}>المرضى</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
                {loading ? '...' : `${filteredPatients.length} نتيجة`}
              </span>
              {historyMode === 'recent' && (
                <button
                  onClick={() => { setHistoryMode('full'); fetchData('full') }}
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}
                  title={'حاليًا بتشوف آخر ' + RECENT_DAYS + ' يوم بس - دوس هنا لعرض كل سجل المعمل'}
                >
                  📜 عرض كل السجل
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {periodFilters.map(f => (
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

          <div className="relative">
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--on-surface-variant)' }}>🔍</span>
            <input type="text" placeholder="ابحث بالاسم، التليفون، الدكتور، اسم التحليل، الحالة..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pr-9 pl-4 py-2 rounded-lg outline-none text-right"
              style={{ border: '1px solid var(--outline-variant)', fontSize: '13px' }}
              onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
              onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
            />
          </div>
        </div>

        {loading ? (
          <table className="w-full">
            <thead>
              <tr style={{ background: '#f1f3f4' }}>
                <th className="text-right p-3 text-xs font-semibold" style={{color: 'var(--on-surface-variant)' }}>اسم المريض</th>
                <th className="text-right p-3 text-xs font-semibold" style={{color: 'var(--on-surface-variant)' }}>التحاليل</th>
                <th className="text-right p-3 text-xs font-semibold" style={{color: 'var(--on-surface-variant)' }}>الحالة</th>
              </tr>
            </thead>
            <tbody>
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
              <TableRowSkeleton />
            </tbody>
          </table>
        ) : loadError ? (
          <EmptyState
            icon="⚠️"
            title="مقدرناش نجيب بيانات المرضى"
            subtitle="حصل خطأ أثناء الاتصال بالسيرفر. جرّب تحدّث الصفحة، ولو المشكلة استمرت كلّم الدعم الفني."
          />
        ) : filteredPatients.length === 0 ? (
          <EmptyState
            icon="👥"
            title="لا يوجد مرضى مطابقين"
            subtitle={search || periodFilter !== 'all' ? 'جرّب تغيّر كلمة البحثأو الفترة الزمنية' : 'لسه مفيش مرضى مسجلين، سجّل أول مريض من صفحة "مريض جديد"'}
          />
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ background: '#f1f3f4' }}>
                <th className="text-right p-3 text-xs font-semibold" style={{color: 'var(--on-surface-variant)' }}>اسم المريض</th>
                <th className="text-right p-3 text-xs font-semibold" style={{color: 'var(--on-surface-variant)' }}>التحاليل</th>
                <th className="text-right p-3 text-xs font-semibold" style={{color: 'var(--on-surface-variant)' }}>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                  <td className="p-3 text-sm font-medium" style={{ color: 'var(--on-surface)' }}>{p.name}</td>
                  <td className="p-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>{p.tests?.map(t => t.name).join(', ')}</td>
                  <td className="p-3">
                    <span className="text-xs font-medium px-2 py-1 rounded-full"
                      style={{ background: statusStyle[p.tests?.[0]?.status]?.bg || '#fef3c7', color: statusStyle[p.tests?.[0]?.status]?.color || '#92400e'}}>
                      {p.tests?.[0]?.status || 'تم التجميع'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}