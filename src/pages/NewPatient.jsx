import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import BarcodeLabel from '../components/BarcodeLabel'
import { useToast } from '../components/Toast'

export default function NewPatient() {
  const showToast = useToast()
  const [form, setForm] = useState({ name: '', phone: '', age: '', birth_date: '', gender: '', doctor: '', notes: '' })
  const [testCatalog, setTestCatalog] = useState([])
  const [panels, setPanels] = useState([])
  const [panelItemsMap, setPanelItemsMap] = useState({})
  const [selectedTests, setSelectedTests] = useState([])
  const [selectedPanels, setSelectedPanels] = useState([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [loading, setLoading] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [lastPatient, setLastPatient] = useState(null)
  const [showBarcode, setShowBarcode] = useState(false)
  const [editingTest, setEditingTest] = useState(null)
  const [editingPanel, setEditingPanel] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => { fetchTests(); fetchPanels() }, [])

  const fetchTests = async () => {
    const { data } = await supabase.from('test_catalog').select('*').order('category')
    setTestCatalog(data || [])
    setCatalogLoading(false)
  }

  const fetchPanels = async () => {
    const { data: panelsData } = await supabase.from('test_panels').select('*').order('name')
    setPanels(panelsData || [])

    const { data: itemsData } = await supabase
      .from('test_panel_items')
      .select('*')
      .order('display_order')

    const map = {}
    ;(itemsData || []).forEach(item => {
      if (!map[item.panel_id]) map[item.panel_id] = []
      map[item.panel_id].push(item)
    })
    setPanelItemsMap(map)
  }

  const categories = ['All', ...new Set(testCatalog.map(t => t.category))]

  const filtered = testCatalog.filter(t => {
    const matchCategory = activeCategory === 'All' || t.category === activeCategory
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase())
    return matchCategory && matchSearch
  })

  const toggleTest = (test) => {
    setSelectedTests(prev => prev.find(t => t.id === test.id)
      ? prev.filter(t => t.id !== test.id)
      : [...prev, test])
  }

  const togglePanel = (panel) => {
    setSelectedPanels(prev => prev.find(p => p.id === panel.id)
      ? prev.filter(p => p.id !== panel.id)
      : [...prev, panel])
  }

  const saveTestEdit = async () => {
    setSavingEdit(true)
    const priceNum = parseFloat(editingTest.price)
    const { error } = await supabase.from('test_catalog').update({
      unit: editingTest.unit,
      normal_range: editingTest.normal_range,
      price: isNaN(priceNum) ? 0 : priceNum,
    }).eq('id', editingTest.id)

    setSavingEdit(false)
    if (error) {
      showToast('حدث خطأ أثناء حفظ التعديل: ' + error.message, 'error')
      return
    }
    setEditingTest(null)
    showToast('تم تحديث بيانات التحليل بنجاح', 'success')
    fetchTests()
  }

  const savePanelEdit = async () => {
    setSavingEdit(true)
    const priceNum = parseFloat(editingPanel.price)
    const { error } = await supabase.from('test_panels').update({
      price: isNaN(priceNum) ? 0 : priceNum,
    }).eq('id', editingPanel.id)

    setSavingEdit(false)
    if (error) {
      showToast('حدث خطأ أثناء حفظ التعديل: ' + error.message, 'error')
      return
    }
    setEditingPanel(null)
    showToast('تم تحديث سعر الباقة بنجاح', 'success')
    fetchPanels()
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      showToast('من فضلك ادخل اسم المريض', 'warning')
      return
    }

    const ageNum = parseInt(form.age)
    if (!form.age || isNaN(ageNum)) {
      showToast('من فضلك ادخل سن صحيح للمريض', 'warning')
      return
    }

    if (selectedTests.length === 0 && selectedPanels.length === 0) {
      showToast('اختار تحليل أو باقة واحدة على الأقل', 'warning')
      return
    }

    setLoading(true)

    const { data: patient, error } = await supabase
      .from('patients')
      .insert([{
        name: form.name,
        age: ageNum,
        gender: form.gender,
        phone: form.phone,
        doctor: form.doctor,
        notes: form.notes,
        birth_date: form.birth_date || null
      }])
      .select().single()

    if (error) {
      showToast('حدث خطأ أثناء حفظ بيانات المريض: ' + error.message, 'error')
      setLoading(false)
      return
    }

    const singleTestRows = selectedTests.map(t => ({
      patient_id: patient.id,
      name: t.name,
      normal_range: t.normal_range,
      unit: t.unit,
      status: 'تم التجميع',
      result_type: 'single',
      price: t.price || 0,
    }))

    const panelRows = []
    selectedPanels.forEach(panel => {
      const items = panelItemsMap[panel.id] || []
      const instanceId = crypto.randomUUID()
      items.forEach(item => {
        let normalRange = item.normal_range
        let absoluteRange = null

        if (item.result_type === 'relative_absolute' && item.normal_range?.includes('|')) {
          const [rel, abs] = item.normal_range.split('|')
          normalRange = rel.trim()
          absoluteRange = abs.trim()
        }

        panelRows.push({
          patient_id: patient.id,
          name: item.name,
          unit: item.unit,
          normal_range: normalRange,
          absolute_range: absoluteRange,
          status: 'تم التجميع',
          panel_id: panel.id,
          panel_code: panel.code,
          panel_instance_id: instanceId,
          section: item.section,
          result_type: item.result_type,
          display_order: item.display_order,
          price: panel.price || 0,
        })
      })
    })

    const allRows = [...singleTestRows, ...panelRows]

    const { error: testsError } = await supabase.from('tests').insert(allRows)

    if (testsError) {
      showToast('تم حفظ بيانات المريض، لكن حصل خطأ أثناء حفظ التحاليل. راجع صفحة نتائج التحاليل.', 'warning', 6000)
      setLoading(false)
      return
    }

    setLoading(false)
    setSuccess(true)
    setLastPatient(patient)
    showToast(`تم تسجيل المريض "${form.name}" بنجاح`, 'success')
    setForm({ name: '', phone: '', age: '', birth_date: '', gender: '', doctor: '', notes: '' })
    setSelectedTests([])
    setSelectedPanels([])
    setTimeout(() => setSuccess(false), 3000)
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>تسجيل مريض جديد</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>أدخل بيانات المريض والتحاليل المطلوبة</p>
      </div>

      {success && (
        <div className="mb-4 p-4 rounded-xl text-sm font-medium flex items-center justify-between flex-wrap gap-3" style={{ background: '#d1fae5', color: '#065f46' }}>
          <span>✅ تم حفظ بيانات المريض بنجاح!</span>
          {lastPatient && (
            <button onClick={() => setShowBarcode(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ background: '#065f46' }}>
              🏷️ طباعة باركود العينة
            </button>
          )}
        </div>
      )}

      {showBarcode && (
        <BarcodeLabel patient={lastPatient} onClose={() => setShowBarcode(false)} />
      )}

      {/* مودال تعديل تحليل مفرد */}
      {editingTest && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" dir="rtl">
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--on-surface)' }}>تعديل: {editingTest.name}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>وحدة القياس</label>
                <input type="text" value={editingTest.unit || ''}
                  onChange={e => setEditingTest(prev => ({ ...prev, unit: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>المعدل الطبيعي</label>
                <input type="text" value={editingTest.normal_range || ''}
                  onChange={e => setEditingTest(prev => ({ ...prev, normal_range: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>السعر (جنيه)</label>
                <input type="number" value={editingTest.price ?? ''}
                  onChange={e => setEditingTest(prev => ({ ...prev, price: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setEditingTest(null)} disabled={savingEdit}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={saveTestEdit} disabled={savingEdit}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: 'var(--primary-container)', opacity: savingEdit ? 0.7 : 1 }}>
                {savingEdit ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال تعديل باقة */}
      {editingPanel && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" dir="rtl">
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--on-surface)' }}>تعديل سعر: {editingPanel.name}</h2>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>السعر (جنيه)</label>
              <input type="number" value={editingPanel.price ?? ''}
                onChange={e => setEditingPanel(prev => ({ ...prev, price: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg outline-none text-right"
                style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setEditingPanel(null)} disabled={savingEdit}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={savePanelEdit} disabled={savingEdit}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: 'var(--primary-container)', opacity: savingEdit ? 0.7 : 1 }}>
                {savingEdit ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-6 space-y-6" style={{ border: '1px solid var(--outline-variant)' }}>

        {/* بيانات المريض */}
        <div>
          <h2 className="font-semibold mb-4" style={{ color: 'var(--on-surface)' }}>بيانات المريض</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { label: 'الاسم بالكامل', key: 'name', type: 'text', placeholder: 'أحمد محمد علي', required: true },
              { label: 'رقم الهاتف', key: 'phone', type: 'tel', placeholder: '01012345678' },
              { label: 'السن', key: 'age', type: 'number', placeholder: '30', required: true },
              { label: 'تاريخ الميلاد', key: 'birth_date', type: 'date', placeholder: '' },
              { label: 'اسم الدكتور', key: 'doctor', type: 'text', placeholder: 'د. محمد أحمد' },
            ].map(field => (
              <div key={field.key}>
                <label htmlFor={field.key} className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>
                  {field.label}{field.required && <span style={{ color: '#dc2626' }}> *</span>}
                </label>
                <input id={field.key} type={field.type} placeholder={field.placeholder} value={form[field.key]}
                  onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                  onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
                  onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
                />
              </div>
            ))}
            <div>
              <label htmlFor="gender" className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>النوع</label>
              <select id="gender" value={form.gender} onChange={e => setForm(prev => ({ ...prev, gender: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg outline-none text-right"
                style={{ border: '1px solid var(--outline-variant)', fontSize: '14px', background: 'white' }}>
                <option value="">اختر...</option>
                <option value="ذكر">ذكر</option>
                <option value="أنثى">أنثى</option>
              </select>
            </div>
          </div>
        </div>

        {/* الباقات (زي CBC) */}
        {catalogLoading ? (
          <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
            <div className="animate-pulse space-y-2">
              <div style={{ height: '16px', width: '160px', background: '#f1f3f4', borderRadius: '6px' }} />
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {[1, 2].map(i => (
                  <div key={i} style={{ height: '48px', background: '#f1f3f4', borderRadius: '10px' }} />
                ))}
              </div>
            </div>
          </div>
        ) : panels.length > 0 && (
          <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
            <h2 className="font-semibold mb-4" style={{ color: 'var(--on-surface)' }}>
              الباقات (تحاليل مجمّعة)
              {selectedPanels.length > 0 && (
                <span className="mr-2 text-xs px-2 py-1 rounded-full text-white" style={{ background: '#065f46' }}>
                  {selectedPanels.length} محدد
                </span>
              )}
            </h2>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {panels.map(panel => {
                const isSelected = !!selectedPanels.find(p => p.id === panel.id)
                const itemsCount = (panelItemsMap[panel.id] || []).length
                return (
                  <div key={panel.id}
                    className="flex items-center gap-2 p-3 rounded-lg transition-all"
                    style={{
                      border: `1px solid ${isSelected ? '#065f46' : 'var(--outline-variant)'}`,
                      background: isSelected ? '#d1fae5' : 'white'
                    }}>
                    <label onClick={() => togglePanel(panel)} className="flex items-center gap-2 flex-1 cursor-pointer">
                      <input type="checkbox" checked={isSelected} onChange={() => togglePanel(panel)} className="w-4 h-4 accent-green-700" />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--on-surface)' }}>{panel.name}</p>
                        <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
                          {itemsCount} بند{panel.price ? ` • ${panel.price} جنيه` : ''}
                        </p>
                      </div>
                    </label>
                    <button onClick={() => setEditingPanel({ ...panel })}
                      aria-label={`تعديل سعر ${panel.name}`}
                      className="text-xs px-2 py-1 rounded-lg"
                      style={{ background: '#e8f0fe', color: 'var(--primary-container)' }}>
                      ✏️
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* التحاليل المفردة */}
        <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: 'var(--on-surface)' }}>
              التحاليل المفردة
              {selectedTests.length > 0 && (
                <span className="mr-2 text-xs px-2 py-1 rounded-full text-white" style={{ background: 'var(--primary-container)' }}>
                  {selectedTests.length} محدد
                </span>
              )}
            </h2>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            <input type="text" placeholder="ابحث عن تحليل..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg outline-none text-right"
              style={{ border: '1px solid var(--outline-variant)', fontSize: '13px', minWidth: '200px' }}
            />
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  background: activeCategory === cat ? 'var(--primary-container)' : '#f1f3f4',
                  color: activeCategory === cat ? 'white' : 'var(--on-surface-variant)'
                }}>
                {cat}
              </button>
            ))}
          </div>

          {catalogLoading ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="animate-pulse" style={{ height: '44px', background: '#f1f3f4', borderRadius: '10px' }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--on-surface-variant)' }}>
              لا توجد تحاليل مطابقة لبحثك
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 max-h-64 overflow-y-auto">
              {filtered.map(test => {
                const isSelected = !!selectedTests.find(t => t.id === test.id)
                return (
                  <div key={test.id}
                    className="flex items-center gap-1 p-2 rounded-lg transition-all"
                    style={{
                      border: `1px solid ${isSelected ? 'var(--primary-container)' : 'var(--outline-variant)'}`,
                      background: isSelected ? '#e8f0fe' : 'white'
                    }}>
                    <label onClick={() => toggleTest(test)} className="flex items-center gap-2 flex-1 cursor-pointer">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleTest(test)} className="w-3 h-3 accent-blue-600" />
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--on-surface)' }}>{test.name}</p>
                        <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
                          {test.unit}{test.price ? ` • ${test.price} جنيه` : ''}
                        </p>
                      </div>
                    </label>
                    <button onClick={() => setEditingTest({ ...test })}
                      aria-label={`تعديل ${test.name}`}
                      className="text-xs px-1.5 py-1 rounded-lg flex-shrink-0"
                      style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>
                      ✏️
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ملاحظات */}
        <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
          <label htmlFor="notes" className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>ملاحظات</label>
          <textarea id="notes" rows={3} placeholder="أي ملاحظات إضافية..." value={form.notes}
            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg outline-none text-right resize-none"
            style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
            onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
            onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
          />
        </div>

        {/* أزرار */}
        <div className="flex gap-3 justify-end" style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
          <button onClick={() => { setForm({ name: '', phone: '', age: '', birth_date: '', gender: '', doctor: '', notes: '' }); setSelectedTests([]); setSelectedPanels([]) }}
            className="px-6 py-2 rounded-lg text-sm font-medium"
            style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
            إلغاء
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-6 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2"
            style={{ background: 'var(--primary-container)', opacity: loading ? 0.7 : 1 }}>
            {loading && (
              <span style={{
                width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: 'white', borderRadius: '50%', display: 'inline-block',
                animation: 'lab-spin-btn 0.7s linear infinite',
              }} />
            )}
            {loading ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes lab-spin-btn {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
