import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const statusStyle = {
  'مكتمل': { bg: '#d1fae5', color: '#065f46' },
  'معلق': { bg: '#fef3c7', color: '#92400e' },
}

const periodFilters = [
  { key: 'all', label: 'الكل' },
  { key: 'today', label: 'اليوم' },
  { key: 'yesterday', label: 'الامس' },
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

export default function Results() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [resultInput, setResultInput] = useState({})
  const [editPatient, setEditPatient] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [editTest, setEditTest] = useState(null)

  useEffect(() => { fetchPatients() }, [])

  const fetchPatients = async () => {
    const { data } = await supabase.from('patients').select('*, tests(*)').order('created_at', { ascending: false })
    setPatients(data || [])
    setLoading(false)
  }

  const updateTest = async (testId, value, status) => {
    await supabase.from('tests').update({ value, status }).eq('id', testId)
    fetchPatients()
  }

  const deleteTest = async (testId) => {
    if (!window.confirm('هتحذف التحليل ده؟')) return
    await supabase.from('tests').delete().eq('id', testId)
    fetchPatients()
  }

  const updateTestDetails = async () => {
    await supabase.from('tests').update({
      name: editTest.name,
      normal_range: editTest.normal_range,
      unit: editTest.unit,
    }).eq('id', editTest.id)
    setEditTest(null)
    fetchPatients()
  }

  const deletePatient = async (id) => {
    await supabase.from('tests').delete().eq('patient_id', id)
    await supabase.from('patients').delete().eq('id', id)
    setDeleteConfirm(null)
    setSelected(null)
    fetchPatients()
  }

  const updatePatient = async () => {
    await supabase.from('patients').update({
      name: editPatient.name,
      age: parseInt(editPatient.age),
      gender: editPatient.gender,
      phone: editPatient.phone,
      doctor: editPatient.doctor,
    }).eq('id', editPatient.id)
    setEditPatient(null)
    fetchPatients()
  }

  const filtered = patients
    .filter(p => periodFilter === 'all' || getBucket(p.created_at) === periodFilter)
    .filter(p => p.name.includes(search))

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>نتائج التحاليل</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>إدخال وإدارة نتائج التحاليل</p>
      </div>

      {/* فلتر الفترة الزمنية */}
      <div className="flex gap-2 mb-4 flex-wrap">
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
        <span className="text-xs self-center mr-1" style={{ color: 'var(--on-surface-variant)' }}>
          {filtered.length} نتيجة
        </span>
      </div>

      <input type="text" placeholder="ابحث عن مريض..." value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-4 py-2 rounded-lg outline-none text-right mb-4"
        style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
        onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
        onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
      />

      {/* Modal تعديل المريض */}
      {editPatient && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" dir="rtl">
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--on-surface)' }}>تعديل بيانات المريض</h2>
            <div className="space-y-3">
              {[
                { label: 'الاسم', key: 'name' },
                { label: 'السن', key: 'age', type: 'number' },
                { label: 'الهاتف', key: 'phone' },
                { label: 'الدكتور', key: 'doctor' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>{f.label}</label>
                  <input type={f.type || 'text'} value={editPatient[f.key] || ''}
                    onChange={e => setEditPatient(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg outline-none text-right"
                    style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                  />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>النوع</label>
                <select value={editPatient.gender || ''} onChange={e => setEditPatient(prev => ({ ...prev, gender: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px', background: 'white' }}>
                  <option value="">اختر...</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setEditPatient(null)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={updatePatient}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: 'var(--primary-container)' }}>
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal حذف المريض */}
      {deleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" dir="rtl">
            <h2 className="font-bold text-lg mb-2" style={{ color: '#dc2626' }}>⚠️ تأكيد الحذف</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--on-surface-variant)' }}>
              هيتم حذف المريض <strong>{deleteConfirm.name}</strong> وكل تحاليله نهائياً. مش هترجع!
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={() => deletePatient(deleteConfirm.id)}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: '#dc2626' }}>
                حذف نهائي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal تعديل التحليل */}
      {editTest && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" dir="rtl">
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--on-surface)' }}>تعديل التحليل</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>اسم التحليل</label>
                <input type="text" value={editTest.name || ''}
                  onChange={e => setEditTest(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>المعدل الطبيعي</label>
                <input type="text" value={editTest.normal_range || ''}
                  onChange={e => setEditTest(prev => ({ ...prev, normal_range: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>الوحدة</label>
                <input type="text" value={editTest.unit || ''}
                  onChange={e => setEditTest(prev => ({ ...prev, unit: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setEditTest(null)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={updateTestDetails}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: 'var(--primary-container)' }}>
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: 'var(--on-surface-variant)' }}>
          لا يوجد مرضى مطابقين
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(p => (
            <div key={p.id} className="bg-white rounded-xl" style={{ border: '1px solid var(--outline-variant)' }}>
              <div className="flex items-center justify-between p-4 cursor-pointer"
                style={{ borderBottom: selected?.id === p.id ? '1px solid var(--outline-variant)' : 'none' }}
                onClick={() => setSelected(selected?.id === p.id ? null : p)}>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--on-surface)' }}>{p.name}</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                    {p.age} سنة • {p.doctor} • {p.tests?.length} تحليل
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-2 py-1 rounded-full"
                    style={{ background: statusStyle[p.tests?.[0]?.status]?.bg || '#fef3c7', color: statusStyle[p.tests?.[0]?.status]?.color || '#92400e' }}>
                    {p.tests?.[0]?.status || 'معلق'}
                  </span>
                  <button onClick={e => { e.stopPropagation(); setEditPatient(p) }}
                    className="px-3 py-1 rounded-lg text-xs font-medium"
                    style={{ background: '#e8f0fe', color: 'var(--primary-container)' }}>
                    ✏️ تعديل
                  </button>
                  <button onClick={e => { e.stopPropagation(); setDeleteConfirm(p) }}
                    className="px-3 py-1 rounded-lg text-xs font-medium"
                    style={{ background: '#fee2e2', color: '#dc2626' }}>
                    🗑️ حذف
                  </button>
                  <span style={{ color: 'var(--on-surface-variant)' }}>{selected?.id === p.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {selected?.id === p.id && (
                <div className="p-4">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: '#f1f3f4' }}>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>التحليل</th>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>المعدل الطبيعي</th>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>النتيجة</th>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الحالة</th>
                        <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.tests?.map(t => (
                        <tr key={t.id} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                          <td className="p-3 text-sm font-medium" style={{ color: 'var(--on-surface)' }}>
                            {t.name}
                            {t.unit && <span className="text-xs mr-1" style={{ color: 'var(--on-surface-variant)' }}>({t.unit})</span>}
                          </td>
                          <td className="p-3 text-xs" style={{ color: 'var(--on-surface-variant)' }}>{t.normal_range || '-'}</td>
                          <td className="p-3">
                            <input type="text" defaultValue={t.value || ''}
                              onChange={e => setResultInput(prev => ({ ...prev, [t.id]: e.target.value }))}
                              placeholder="أدخل النتيجة..."
                              className="px-3 py-1 rounded-lg outline-none text-right w-full"
                              style={{ border: '1px solid var(--outline-variant)', fontSize: '13px' }}
                            />
                          </td>
                          <td className="p-3">
                            <span className="text-xs font-medium px-2 py-1 rounded-full"
                              style={{ background: statusStyle[t.status]?.bg || statusStyle['معلق'].bg, color: statusStyle[t.status]?.color || statusStyle['معلق'].color }}>
                              {t.status || 'معلق'}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex gap-1">
                              <button onClick={() => {
                                const value = resultInput[t.id] ?? t.value ?? ''
                                const status = value.trim() !== '' ? 'مكتمل' : 'معلق'
                                updateTest(t.id, value, status)
                              }}
                                className="px-3 py-1 rounded-lg text-xs text-white font-medium"
                                style={{ background: 'var(--primary-container)' }}>
                                حفظ
                              </button>
                              <button onClick={() => setEditTest(t)}
                                className="px-3 py-1 rounded-lg text-xs font-medium"
                                style={{ background: '#e8f0fe', color: 'var(--primary-container)' }}>
                                ✏️
                              </button>
                              <button onClick={() => deleteTest(t.id)}
                                className="px-3 py-1 rounded-lg text-xs font-medium"
                                style={{ background: '#fee2e2', color: '#dc2626' }}>
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}