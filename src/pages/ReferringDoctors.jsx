import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useToast } from '../components/Toast'
import { calculatePatientRevenue, getDateBucket, PERIOD_FILTERS } from '../utils/financeUtils'
import { exportToCSV } from '../utils/exportUtils'

export default function ReferringDoctors() {
  const showToast = useToast()
  const [doctors, setDoctors] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [periodFilter, setPeriodFilter] = useState('month')
  const [editDoctor, setEditDoctor] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [doctorsRes, patientsRes] = await Promise.all([
      supabase.from('referring_doctors').select('*').order('name'),
      supabase.from('patients').select('id, doctor, created_at, tests(price, panel_instance_id)'),
    ])
    if (doctorsRes.error) showToast('فشل تحميل قائمة الأطباء: ' + doctorsRes.error.message, 'error')
    if (patientsRes.error) showToast('فشل تحميل بيانات المرضى: ' + patientsRes.error.message, 'error')
    setDoctors(doctorsRes.data || [])
    setPatients(patientsRes.data || [])
    setLoading(false)
  }

  const filteredPatients = patients.filter(p =>
    periodFilter === 'all' || getDateBucket(p.created_at) === periodFilter
  )

  // بيجمع بيانات كل دكتور: عدد المرضى المحوّلين + إجمالي قيمة تحاليلهم في الفترة المختارة
  const doctorStats = {}
  filteredPatients.forEach(p => {
    const doctorName = (p.doctor || '').trim()
    if (!doctorName) return
    if (!doctorStats[doctorName]) doctorStats[doctorName] = { patientsCount: 0, revenue: 0 }
    doctorStats[doctorName].patientsCount += 1
    doctorStats[doctorName].revenue += calculatePatientRevenue(p)
  })

  // أطباء مسجلين في جدول العمولات (اللي هيظهروا في الجدول الرئيسي مع حساب العمولة)
  const registeredRows = doctors.map(d => {
    const stats = doctorStats[d.name.trim()] || { patientsCount: 0, revenue: 0 }
    const commission = stats.revenue * (Number(d.commission_percent) || 0) / 100
    return { ...d, ...stats, commission }
  })

  // أسماء ظهرت في بيانات المرضى بس مش مسجلة في جدول referring_doctors - عشان الأدمن يعرف يضيفهم
  const registeredNames = new Set(doctors.map(d => d.name.trim()))
  const unregisteredNames = Object.keys(doctorStats).filter(name => !registeredNames.has(name))

  const totalCommission = registeredRows.reduce((sum, r) => sum + r.commission, 0)

  const openAdd = (prefillName) => {
    setEditDoctor({ name: prefillName || '', phone: '', commission_percent: '', notes: '', is_active: true })
  }
  const openEdit = (doctor) => setEditDoctor({ ...doctor })

  const saveDoctor = async () => {
    if (!editDoctor.name?.trim()) {
      showToast('من فضلك اكتب اسم الدكتور', 'warning')
      return
    }
    setSaving(true)
    const payload = {
      name: editDoctor.name.trim(),
      phone: editDoctor.phone?.trim() || null,
      commission_percent: parseFloat(editDoctor.commission_percent) || 0,
      notes: editDoctor.notes?.trim() || null,
      is_active: editDoctor.is_active !== false,
    }

    const { error } = editDoctor.id
      ? await supabase.from('referring_doctors').update(payload).eq('id', editDoctor.id)
      : await supabase.from('referring_doctors').insert([payload])

    setSaving(false)
    if (error) {
      showToast('فشل حفظ بيانات الدكتور: ' + error.message, 'error')
      return
    }
    showToast('✅ تم حفظ بيانات الدكتور بنجاح', 'success')
    setEditDoctor(null)
    fetchAll()
  }

  const deleteDoctor = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    const { error } = await supabase.from('referring_doctors').delete().eq('id', deleteConfirm.id)
    setDeleting(false)
    if (error) {
      showToast('فشل حذف الدكتور: ' + error.message, 'error')
      return
    }
    showToast('🗑️ تم حذف الدكتور', 'success')
    setDeleteConfirm(null)
    fetchAll()
  }

  const exportReport = () => {
    exportToCSV('تقرير_عمولات_الأطباء', [
      { key: 'name', label: 'اسم الدكتور' },
      { key: 'patientsCount', label: 'عدد المرضى المحوّلين' },
      { key: 'revenue', label: 'إجمالي قيمة التحاليل' },
      { key: 'commission_percent', label: 'نسبة العمولة %' },
      { key: 'commission', label: 'مبلغ العمولة' },
    ], registeredRows)
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>الأطباء المحوّلون والعمولات</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>تتبع الأطباء اللي بيحوّلولك مرضى وحساب عمولتهم تلقائيًا</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportReport}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>
            📊 تصدير Excel
          </button>
          <button onClick={() => openAdd()}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#1a2456' }}>
            ➕ إضافة دكتور
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-3">
        <div className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
          <div className="text-2xl mb-2">👨‍⚕️</div>
          <div className="text-2xl font-bold" style={{ color: '#1a2456' }}>{doctors.length}</div>
          <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>أطباء مسجلين</div>
        </div>
        <div className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
          <div className="text-2xl mb-2">💰</div>
          <div className="text-2xl font-bold" style={{ color: '#065f46' }}>{totalCommission.toFixed(2)}</div>
          <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>إجمالي العمولات المستحقة (جنيه)</div>
        </div>
        <div className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
          <div className="text-2xl mb-2">⚠️</div>
          <div className="text-2xl font-bold" style={{ color: unregisteredNames.length > 0 ? '#dc2626' : '#1a2456' }}>{unregisteredNames.length}</div>
          <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>أطباء غير مسجلين في العمولات</div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
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

      {/* Modal إضافة/تعديل دكتور */}
      {editDoctor && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" dir="rtl">
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--on-surface)' }}>
              {editDoctor.id ? 'تعديل بيانات الدكتور' : 'إضافة دكتور جديد'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>اسم الدكتور *</label>
                <input type="text" value={editDoctor.name || ''}
                  onChange={e => setEditDoctor(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="لازم يطابق الاسم المكتوب في بيانات المرضى بالظبط"
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>رقم الموبايل</label>
                <input type="text" value={editDoctor.phone || ''}
                  onChange={e => setEditDoctor(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>نسبة العمولة %</label>
                <input type="number" value={editDoctor.commission_percent ?? ''}
                  onChange={e => setEditDoctor(prev => ({ ...prev, commission_percent: e.target.value }))}
                  placeholder="مثال: 10"
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>ملاحظات</label>
                <textarea rows={2} value={editDoctor.notes || ''}
                  onChange={e => setEditDoctor(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right resize-none"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium" style={{ color: 'var(--on-surface)' }}>نشط</label>
                <button onClick={() => setEditDoctor(prev => ({ ...prev, is_active: !prev.is_active }))}
                  className="relative transition-all"
                  style={{ width: '44px', height: '24px', borderRadius: '999px', background: editDoctor.is_active !== false ? 'var(--primary-container)' : '#d1d5db' }}>
                  <span className="absolute top-0.5 transition-all" style={{
                    width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                    right: editDoctor.is_active !== false ? '3px' : '23px',
                  }} />
                </button>
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setEditDoctor(null)} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={saveDoctor} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: '#1a2456', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal تأكيد الحذف */}
      {deleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" dir="rtl">
            <h2 className="font-bold text-lg mb-2" style={{ color: '#dc2626' }}>⚠️ تأكيد الحذف</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--on-surface-variant)' }}>
              هيتم حذف الدكتور <strong>{deleteConfirm.name}</strong> من قائمة العمولات (مش هيأثر على بيانات المرضى الحاليين).
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={deleteDoctor} disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: '#dc2626', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'جاري الحذف...' : 'حذف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>جاري التحميل...</div>
      ) : (
        <>
          <div className="bg-white rounded-xl overflow-hidden mb-6" style={{ border: '1px solid var(--outline-variant)' }}>
            {registeredRows.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>
                لسه مفيش أطباء مسجلين. دوس "➕ إضافة دكتور" تبدأ.
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#f1f3f4' }}>
                    <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الدكتور</th>
                    <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>مرضى محوّلين</th>
                    <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>إجمالي التحاليل</th>
                    <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>نسبة العمولة</th>
                    <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>مبلغ العمولة</th>
                    <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {registeredRows.map(d => (
                    <tr key={d.id} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                      <td className="p-3 text-sm font-medium" style={{ color: 'var(--on-surface)' }}>
                        {d.name}
                        {d.is_active === false && (
                          <span className="text-xs mr-2 px-1.5 py-0.5 rounded-full" style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>غير نشط</span>
                        )}
                      </td>
                      <td className="p-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>{d.patientsCount}</td>
                      <td className="p-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>{d.revenue.toFixed(2)} جنيه</td>
                      <td className="p-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>{d.commission_percent}%</td>
                      <td className="p-3 text-sm font-semibold" style={{ color: '#065f46' }}>{d.commission.toFixed(2)} جنيه</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(d)}
                            className="px-3 py-1 rounded-lg text-xs font-medium"
                            style={{ background: '#e8f0fe', color: 'var(--primary-container)' }}>
                            ✏️
                          </button>
                          <button onClick={() => setDeleteConfirm(d)}
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
            )}
          </div>

          {unregisteredNames.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: '#fef3c7', border: '1px solid #fde68a' }}>
              <p className="text-sm font-bold mb-2" style={{ color: '#92400e' }}>
                ⚠️ في {unregisteredNames.length} اسم دكتور ظاهر في بيانات المرضى بس مش مسجل في قائمة العمولات:
              </p>
              <div className="flex flex-wrap gap-2">
                {unregisteredNames.map(name => (
                  <button key={name} onClick={() => openAdd(name)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg"
                    style={{ background: 'white', color: '#92400e', border: '1px solid #fde68a' }}>
                    + سجّل "{name}"
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}