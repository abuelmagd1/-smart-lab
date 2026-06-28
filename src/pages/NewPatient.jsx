import { useState, useEffect } from 'react'
import { supabase } from '../supabase'
import BarcodeLabel from '../components/BarcodeLabel'

export default function NewPatient() {
  const [form, setForm] = useState({ name: '', phone: '', age: '', birth_date: '', gender: '', doctor: '', notes: '' })
  const [testCatalog, setTestCatalog] = useState([])
  const [selectedTests, setSelectedTests] = useState([])
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [lastPatient, setLastPatient] = useState(null)
  const [showBarcode, setShowBarcode] = useState(false)

  useEffect(() => { fetchTests() }, [])

  const fetchTests = async () => {
    const { data } = await supabase.from('test_catalog').select('*').order('category')
    setTestCatalog(data || [])
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

  const handleSubmit = async () => {
    if (!form.name) return alert('من فضلك ادخل اسم المريض')

    const ageNum = parseInt(form.age)
    if (!form.age || isNaN(ageNum)) return alert('من فضلك ادخل سن صحيح للمريض')

    if (selectedTests.length === 0) return alert('اختار تحليل واحد على الأقل')

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

    if (error) { alert('حدث خطأ أثناء حفظ بيانات المريض: ' + error.message); setLoading(false); return }

    const { error: testsError } = await supabase.from('tests').insert(
      selectedTests.map(t => ({ patient_id: patient.id, name: t.name, normal_range: t.normal_range, unit: t.unit, status: 'تم التجميع' }))
    )

    if (testsError) {
      alert('تم حفظ بيانات المريض، لكن حصل خطأ أثناء حفظ التحاليل: ' + testsError.message + '\nراجع التحاليل من صفحة "نتائج التحاليل" وأضفها يدويًا لو لزم الأمر.')
      setLoading(false)
      return
    }

    setLoading(false)
    setSuccess(true)
    setLastPatient(patient)
    setForm({ name: '', phone: '', age: '', birth_date: '', gender: '', doctor: '', notes: '' })
    setSelectedTests([])
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

      <div className="bg-white rounded-xl p-6 space-y-6" style={{ border: '1px solid var(--outline-variant)' }}>

        {/* بيانات المريض */}
        <div>
          <h2 className="font-semibold mb-4" style={{ color: 'var(--on-surface)' }}>بيانات المريض</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { label: 'الاسم بالكامل', key: 'name', type: 'text', placeholder: 'أحمد محمد علي' },
              { label: 'رقم الهاتف', key: 'phone', type: 'tel', placeholder: '01012345678' },
              { label: 'السن', key: 'age', type: 'number', placeholder: '30' },
              { label: 'تاريخ الميلاد', key: 'birth_date', type: 'date', placeholder: '' },
              { label: 'اسم الدكتور', key: 'doctor', type: 'text', placeholder: 'د. محمد أحمد' },
            ].map(field => (
              <div key={field.key}>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>{field.label}</label>
                <input type={field.type} placeholder={field.placeholder} value={form[field.key]}
                  onChange={e => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full px-4 py-3 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                  onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
                  onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
                />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>النوع</label>
              <select value={form.gender} onChange={e => setForm(prev => ({ ...prev, gender: e.target.value }))}
                className="w-full px-4 py-3 rounded-lg outline-none text-right"
                style={{ border: '1px solid var(--outline-variant)', fontSize: '14px', background: 'white' }}>
                <option value="">اختر...</option>
                <option value="ذكر">ذكر</option>
                <option value="أنثى">أنثى</option>
              </select>
            </div>
          </div>
        </div>

        {/* التحاليل */}
        <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold" style={{ color: 'var(--on-surface)' }}>
              التحاليل المطلوبة
              {selectedTests.length > 0 && (
                <span className="mr-2 text-xs px-2 py-1 rounded-full text-white" style={{ background: 'var(--primary-container)' }}>
                  {selectedTests.length} محدد
                </span>
              )}
            </h2>
          </div>

          {/* بحث */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <input type="text" placeholder="ابحث عن تحليل..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg outline-none text-right"
              style={{ border: '1px solid var(--outline-variant)', fontSize: '13px', minWidth: '200px' }}
            />
          </div>

          {/* كاتيجوريز */}
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

          {/* قائمة التحاليل */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 max-h-64 overflow-y-auto">
            {filtered.map(test => (
              <label key={test.id} onClick={() => toggleTest(test)}
                className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all"
                style={{
                  border: `1px solid ${selectedTests.find(t => t.id === test.id) ? 'var(--primary-container)' : 'var(--outline-variant)'}`,
                  background: selectedTests.find(t => t.id === test.id) ? '#e8f0fe' : 'white'
                }}>
                <input type="checkbox" checked={!!selectedTests.find(t => t.id === test.id)} onChange={() => {}} className="w-3 h-3 accent-blue-600" />
                <div>
                  <p className="text-xs font-medium" style={{ color: 'var(--on-surface)' }}>{test.name}</p>
                  <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{test.unit}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* ملاحظات */}
        <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>ملاحظات</label>
          <textarea rows={3} placeholder="أي ملاحظات إضافية..." value={form.notes}
            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg outline-none text-right resize-none"
            style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
            onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
            onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
          />
        </div>

        {/* أزرار */}
        <div className="flex gap-3 justify-end" style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
          <button onClick={() => { setForm({ name: '', phone: '', age: '', birth_date: '', gender: '', doctor: '', notes: '' }); setSelectedTests([]) }}
            className="px-6 py-2 rounded-lg text-sm font-medium"
            style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
            إلغاء
          </button>
          <button onClick={handleSubmit} disabled={loading}
            className="px-6 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'var(--primary-container)', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>
    </div>
  )
}
