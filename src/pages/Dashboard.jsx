import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabase'

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

// بيحدد المريض ده وقع في أي فترة زمنية بناءً على تاريخ تسجيله
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

// بيبحث في كل البيانات المرتبطة بالمريض: اسمه، تليفونه، دكتوره، سنه، نوعه، وأسماء/حالة تحاليله
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

export default function Dashboard() {
  const { settings } = useOutletContext()
  const [patients, setPatients] = useState([])
  const [now, setNow] = useState(new Date())
  const [periodFilter, setPeriodFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchData()
    // تحديث الوقت كل دقيقة
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const fetchData = async () => {
    const { data } = await supabase
      .from('patients')
      .select('*, tests(*)')
      .order('created_at', { ascending: false })

    setPatients(data || [])
  }

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

  const filteredPatients = patients
    .filter(p => periodFilter === 'all' || getBucket(p.created_at) === periodFilter)
    .filter(p => matchesSearch(p, search))

  // الكروت الإحصائية فوق دايمًا بتعكس نتائج اليوم بس، مهما كان الفلتر المختار في الجدول تحت
  const todayPatients = patients.filter(p => getBucket(p.created_at) === 'today')
  const todayTests = todayPatients.flatMap(p => p.tests || [])
  const inProgressStages = ['تم التجميع', 'تم الاستلام', 'قيد التحليل']
  const stats = {
    total: todayPatients.length,
    pending: todayTests.filter(t => inProgressStages.includes(t.status)).length,
    done: todayTests.filter(t => t.status === 'معتمد').length,
  }

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((s, i) => (
          <div key={i} className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl" style={{ border: '1px solid var(--outline-variant)' }}>
        <div className="p-4 space-y-3" style={{ borderBottom: '1px solid var(--outline-variant)' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold" style={{ color: 'var(--on-surface)' }}>المرضى</h2>
            <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
              {filteredPatients.length} نتيجة
            </span>
          </div>

          {/* فلتر الفترة الزمنية */}
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

          {/* البحث الشامل */}
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

        {filteredPatients.length === 0 ? (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--on-surface-variant)' }}>
            لا يوجد مرضى مطابقين
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ background: '#f1f3f4' }}>
                <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>اسم المريض</th>
                <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>التحاليل</th>
                <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                  <td className="p-3 text-sm font-medium" style={{ color: 'var(--on-surface)' }}>{p.name}</td>
                  <td className="p-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>{p.tests?.map(t => t.name).join(', ')}</td>
                  <td className="p-3">
                    <span className="text-xs font-medium px-2 py-1 rounded-full"
                      style={{ background: statusStyle[p.tests?.[0]?.status]?.bg || '#fef3c7', color: statusStyle[p.tests?.[0]?.status]?.color || '#92400e' }}>
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
