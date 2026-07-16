import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import BarcodeLabel from '../components/BarcodeLabel'

const statusStyle = {
  'تم التجميع': { bg: '#f3f4f6', color: '#374151' },
  'تم الاستلام': { bg: '#dbeafe', color: '#1e40af' },
  'قيد التحليل': { bg: '#fef3c7', color: '#92400e' },
  'معتمد': { bg: '#d1fae5', color: '#065f46' },
}

const SAMPLE_STAGES = ['تم التجميع', 'تم الاستلام', 'قيد التحليل', 'معتمد']

const SECTION_LABELS = {
  RBC: 'RBC',
  Platelet: 'Platelet',
  WBC: 'WBC',
  WBC_DIFF: 'WBC - Diff',
}

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

// بيحسب لو القيمة برا المدى الطبيعي (H/L) عشان نلوّن ونعلّم زي النموذج
const calcFlag = (value, range) => {
  const num = parseFloat(String(value).replace(',', '.'))
  if (isNaN(num) || !range) return ''
  const matches = String(range).match(/-?\d+(\.\d+)?/g)
  if (!matches || matches.length < 2) return ''
  const nums = matches.map(parseFloat).sort((a, b) => a - b)
  const [low, high] = nums
  if (num > high) return 'H'
  if (num < low) return 'L'
  return ''
}

export default function Results() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [periodFilter, setPeriodFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [resultInput, setResultInput] = useState({})
  const [panelCommentInput, setPanelCommentInput] = useState({})
  const [editPatient, setEditPatient] = useState(null)
  const [barcodePatient, setBarcodePatient] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [editTest, setEditTest] = useState(null)

  useEffect(() => { fetchPatients() }, [])

  const fetchPatients = async () => {
    const { data } = await supabase.from('patients').select('*, tests(*)').order('created_at', { ascending: false })
    setPatients(data || [])
    setLoading(false)
  }

  // بيرجع { singleTests: [...], panelGroups: { instanceId: { panel_code, section groups, comment } } }
  const splitTests = (patient) => {
    const singleTests = []
    const panelGroups = {}
    ;(patient.tests || []).forEach(t => {
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
    Object.values(panelGroups).forEach(g => {
      g.items.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
    })
    return { singleTests, panelGroups }
  }

  const updateTest = async (testId, value, status) => {
    await supabase.from('tests').update({ value, status }).eq('id', testId)
    fetchPatients()
  }

  const updatePanelItem = async (testId, patch) => {
    await supabase.from('tests').update(patch).eq('id', testId)
    fetchPatients()
  }

  const savePanelComment = async (instanceId, itemIds) => {
    const comment = panelCommentInput[instanceId] ?? ''
    await supabase.from('tests').update({ comment }).in('id', itemIds)
    fetchPatients()
  }

  const deleteTest = async (testId) => {
    if (!window.confirm('هتحذف التحليل ده؟')) return
    await supabase.from('tests').delete().eq('id', testId)
    fetchPatients()
  }

  const deletePanel = async (itemIds) => {
    if (!window.confirm('هتحذف الباقة دي بكل بنودها؟')) return
    await supabase.from('tests').delete().in('id', itemIds)
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

  const finalizePanel = async (items) => {
    // اعتماد كل بنود الباقة دفعة واحدة بعد التأكد إن كل قيمة اتدخلت
    for (const item of items) {
      const input = resultInput[item.id] || {}
      const relValue = input.relative_value ?? item.relative_value ?? ''
      const absValue = input.absolute_value ?? item.absolute_value ?? ''
      const singleValue = input.value ?? item.value ?? ''

      if (item.result_type === 'relative_absolute') {
        const flag = calcFlag(absValue, item.absolute_range)
        await supabase.from('tests').update({
          relative_value: relValue,
          absolute_value: absValue,
          flag,
          status: 'معتمد',
        }).eq('id', item.id)
      } else {
        const flag = calcFlag(singleValue, item.normal_range)
        await supabase.from('tests').update({
          value: singleValue,
          flag,
          status: 'معتمد',
        }).eq('id', item.id)
      }
    }
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

      {barcodePatient && (
        <BarcodeLabel patient={barcodePatient} onClose={() => setBarcodePatient(null)} />
      )}

      {loading ? (
        <div className="text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: 'var(--on-surface-variant)' }}>
          لا يوجد مرضى مطابقين
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(p => {
            const { singleTests, panelGroups } = splitTests(p)
            const firstStatus = p.tests?.[0]?.status || 'تم التجميع'
            return (
              <div key={p.id} className="bg-white rounded-xl" style={{ border: '1px solid var(--outline-variant)' }}>
                <div className="flex items-center justify-between p-4"
                  style={{ borderBottom: selected?.id === p.id ? '1px solid var(--outline-variant)' : 'none' }}>
                  <div
                    className="flex-1 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-expanded={selected?.id === p.id}
                    aria-label={`عرض تفاصيل ${p.name}`}
                    onClick={() => setSelected(selected?.id === p.id ? null : p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelected(selected?.id === p.id ? null : p)
                      }
                    }}>
                    <p className="font-semibold" style={{ color: 'var(--on-surface)' }}>{p.name}</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                      {p.age} سنة • {p.doctor} • {p.tests?.length} بند
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-1 rounded-full"
                      style={{ background: statusStyle[firstStatus]?.bg || '#fef3c7', color: statusStyle[firstStatus]?.color || '#92400e' }}>
                      {firstStatus}
                    </span>
                    <button onClick={e => { e.stopPropagation(); setBarcodePatient(p) }}
                      className="px-3 py-1 rounded-lg text-xs font-medium"
                      style={{ background: '#fef3c7', color: '#92400e' }}>
                      🏷️ باركود
                    </button>
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
                  <div className="p-4 space-y-6">

                    {/* الباقات (زي CBC) */}
                    {Object.entries(panelGroups).map(([instanceId, group]) => {
                      const bySection = {}
                      group.items.forEach(item => {
                        const sec = item.section || 'أخرى'
                        if (!bySection[sec]) bySection[sec] = []
                        bySection[sec].push(item)
                      })
                      const itemIds = group.items.map(i => i.id)

                      return (
                        <div key={instanceId} className="rounded-xl overflow-hidden" style={{ border: '2px solid #1a2456' }}>
                          <div className="flex items-center justify-between px-4 py-2" style={{ background: '#1a2456' }}>
                            <span className="text-white text-sm font-bold">{group.panel_code}</span>
                            <button onClick={() => deletePanel(itemIds)}
                              className="text-xs px-2 py-1 rounded-lg text-white"
                              style={{ background: 'rgba(255,255,255,0.2)' }}>
                              🗑️ حذف الباقة
                            </button>
                          </div>

                          <div className="p-3">
                            {Object.entries(bySection).map(([section, items]) => (
                              <div key={section} className="mb-3">
                                <div className="text-xs font-bold mb-1 px-1" style={{ color: '#1a2456' }}>
                                  ■ {SECTION_LABELS[section] || section}
                                </div>
                                <table className="w-full mb-1">
                                  <tbody>
                                    {items.map(item => {
                                      const isDiff = item.result_type === 'relative_absolute'
                                      const relInput = resultInput[item.id]?.relative_value ?? item.relative_value ?? ''
                                      const absInput = resultInput[item.id]?.absolute_value ?? item.absolute_value ?? ''
                                      const singleInput = resultInput[item.id]?.value ?? item.value ?? ''
                                      return (
                                        <tr key={item.id} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                                          <td className="p-2 text-sm font-medium" style={{ width: '25%', color: 'var(--on-surface)' }}>
                                            {item.name}
                                            {item.flag && (
                                              <span className="mr-1 text-xs font-bold" style={{ color: item.flag === 'H' ? '#dc2626' : '#2563eb' }}>
                                                {item.flag}
                                              </span>
                                            )}
                                          </td>
                                          {isDiff ? (
                                            <>
                                              <td className="p-2" style={{ width: '25%' }}>
                                                <input type="text" defaultValue={relInput} placeholder="% نسبي"
                                                  onChange={e => setResultInput(prev => ({ ...prev, [item.id]: { ...prev[item.id], relative_value: e.target.value } }))}
                                                  className="px-2 py-1 rounded-lg outline-none text-right w-full"
                                                  style={{ border: '1px solid var(--outline-variant)', fontSize: '12px' }} />
                                                <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{item.normal_range}</span>
                                              </td>
                                              <td className="p-2" style={{ width: '25%' }}>
                                                <input type="text" defaultValue={absInput} placeholder="مطلق"
                                                  onChange={e => setResultInput(prev => ({ ...prev, [item.id]: { ...prev[item.id], absolute_value: e.target.value } }))}
                                                  className="px-2 py-1 rounded-lg outline-none text-right w-full"
                                                  style={{ border: '1px solid var(--outline-variant)', fontSize: '12px' }} />
                                                <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{item.absolute_range}</span>
                                              </td>
                                              <td className="p-2 text-xs" style={{ width: '25%', color: 'var(--on-surface-variant)' }}></td>
                                            </>
                                          ) : (
                                            <>
                                              <td className="p-2" style={{ width: '25%' }}>
                                                <input type="text" defaultValue={singleInput}
                                                  onChange={e => setResultInput(prev => ({ ...prev, [item.id]: { ...prev[item.id], value: e.target.value } }))}
                                                  className="px-2 py-1 rounded-lg outline-none text-right w-full"
                                                  style={{ border: '1px solid var(--outline-variant)', fontSize: '12px' }} />
                                              </td>
                                              <td className="p-2 text-xs" style={{ width: '25%', color: 'var(--on-surface-variant)' }}>{item.unit}</td>
                                              <td className="p-2 text-xs" style={{ width: '25%', color: 'var(--on-surface-variant)' }}>{item.normal_range}</td>
                                            </>
                                          )}
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ))}

                            {/* التعليق */}
                            <div className="mt-3">
                              <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--on-surface)' }}>تعليق (Comment)</label>
                              <textarea rows={2} defaultValue={group.comment}
                                onChange={e => setPanelCommentInput(prev => ({ ...prev, [instanceId]: e.target.value }))}
                                placeholder="- RBCs show ... - WBCs show ..."
                                className="w-full px-3 py-2 rounded-lg outline-none text-right resize-none"
                                style={{ border: '1px solid var(--outline-variant)', fontSize: '12px' }} />
                            </div>

                            <div className="flex gap-2 mt-3 justify-end">
                              <button onClick={() => savePanelComment(instanceId, itemIds)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                                style={{ background: '#e8f0fe', color: 'var(--primary-container)' }}>
                                حفظ التعليق
                              </button>
                              <button onClick={() => finalizePanel(group.items)}
                                className="px-3 py-1.5 rounded-lg text-xs text-white font-medium"
                                style={{ background: '#065f46' }}>
                                ✅ اعتماد نتائج الباقة
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {/* التحاليل المفردة */}
                    {singleTests.length > 0 && (
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
                          {singleTests.map(t => (
                            <tr key={t.id} style={{ borderTop: '1px solid var(--outline-variant)' }}>
                              <td className="p-3 text-sm font-medium" style={{ color: 'var(--on-surface)' }}>
                                {t.name}
                                {t.unit && <span className="text-xs mr-1" style={{ color: 'var(--on-surface-variant)' }}>({t.unit})</span>}
                              </td>
                              <td className="p-3 text-xs" style={{ color: 'var(--on-surface-variant)' }}>{t.normal_range || '-'}</td>
                              <td className="p-3">
                                <input type="text" defaultValue={t.value || ''}
                                  onChange={e => setResultInput(prev => ({ ...prev, [t.id]: { ...prev[t.id], value: e.target.value } }))}
                                  placeholder="أدخل النتيجة..."
                                  className="px-3 py-1 rounded-lg outline-none text-right w-full"
                                  style={{ border: '1px solid var(--outline-variant)', fontSize: '13px' }}
                                />
                              </td>
                              <td className="p-3">
                                <select defaultValue={t.status || 'تم التجميع'}
                                  onChange={e => setResultInput(prev => ({ ...prev, [t.id]: { ...prev[t.id], stage: e.target.value } }))}
                                  className="px-2 py-1 rounded-lg outline-none text-right text-xs font-medium"
                                  style={{
                                    background: statusStyle[t.status]?.bg || statusStyle['تم التجميع'].bg,
                                    color: statusStyle[t.status]?.color || statusStyle['تم التجميع'].color,
                                    border: '1px solid var(--outline-variant)'
                                  }}>
                                  {SAMPLE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </td>
                              <td className="p-3">
                                <div className="flex gap-1">
                                  <button onClick={() => {
                                    const value = resultInput[t.id]?.value ?? t.value ?? ''
                                    const manualStage = resultInput[t.id]?.stage ?? t.status ?? 'تم التجميع'
                                    const status = value.trim() !== '' ? 'معتمد' : (manualStage === 'معتمد' ? 'قيد التحليل' : manualStage)
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
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}