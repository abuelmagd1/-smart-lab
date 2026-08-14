import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import BarcodeLabel from '../components/BarcodeLabel'
import ProfileQRCode from '../components/ProfileQRCode'
import { useToast } from '../components/Toast'
import useUnsavedChanges from '../hooks/useUnsavedChanges'
import { getReferenceRange, ageToApproxDays } from '../utils/referenceRanges'

export default function ExistingPatientVisit() {
  const showToast = useToast()
  const location = useLocation()

  // خطوة 1: البحث عن المريض واختياره
  const [profileSearch, setProfileSearch] = useState('')
  const [profiles, setProfiles] = useState([])
  const [searchingProfiles, setSearchingProfiles] = useState(false)
  const [selectedProfile, setSelectedProfile] = useState(null)
  const searchDebounceRef = useRef(null)

  // خطوة 2: بيانات الزيارة والتحاليل
  const [visitDoctor, setVisitDoctor] = useState('')
  const [visitNotes, setVisitNotes] = useState('')
  const [visitAge, setVisitAge] = useState('')
  const [testCatalog, setTestCatalog] = useState([])
  const [panels, setPanels] = useState([])
  const [panelItemsMap, setPanelItemsMap] = useState({})
  const [selectedTests, setSelectedTests] = useState([])
  const [selectedPanels, setSelectedPanels] = useState([])
  const [testSearch, setTestSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [lastVisit, setLastVisit] = useState(null)
  const [showBarcode, setShowBarcode] = useState(false)
  const [showQRCode, setShowQRCode] = useState(false)

  useUnsavedChanges(!!(selectedProfile && (selectedTests.length > 0 || selectedPanels.length > 0)))

  const searchProfiles = async (q) => {
    setSearchingProfiles(true)
    const { data, error } = await supabase
      .from('patient_profiles')
      .select('*')
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(20)
    setSearchingProfiles(false)
    if (error) {
      showToast('حصل خطأ أثناء البحث: ' + error.message, 'error', 5000)
      return
    }
    setProfiles(data || [])
  }

  const fetchTests = async () => {
    const { data, error } = await supabase.from('test_catalog').select('*').order('category')
    if (error) showToast('حصل خطأ أثناء تحميل قائمة التحاليل: ' + error.message, 'error', 5000)
    setTestCatalog(data || [])
    setCatalogLoading(false)
  }

  const fetchPanels = async () => {
    const { data: panelsData, error } = await supabase.from('test_panels').select('*').order('name')
    if (error) showToast('حصل خطأ أثناء تحميل الباقات: ' + error.message, 'error', 5000)
    setPanels(panelsData || [])

    const { data: itemsData } = await supabase.from('test_panel_items').select('*').order('display_order')
    const map = {}
    ;(itemsData || []).forEach(item => {
      if (!map[item.panel_id]) map[item.panel_id] = []
      map[item.panel_id].push(item)
    })
    setPanelItemsMap(map)
  }

  const selectProfile = (profile) => {
    setSelectedProfile(profile)
    setVisitAge(profile.age ?? '')
    setVisitDoctor('')
    setVisitNotes('')
    setSelectedTests([])
    setSelectedPanels([])
  }

  useEffect(() => { fetchTests(); fetchPanels() }, [])

  useEffect(() => {
    const targetId = location.state?.autoSelectProfileId
    if (!targetId) return
    supabase.from('patient_profiles').select('*').eq('id', targetId).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          showToast('حصل خطأ أثناء تحميل بيانات المريض: ' + error.message, 'error', 5000)
          return
        }
        if (data) selectProfile(data)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  // بحث فوري (مع تأخير بسيط) عن ملفات المرضى بالاسم أو رقم الهاتف
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    if (!profileSearch.trim()) { setProfiles([]); return }
    searchDebounceRef.current = setTimeout(() => searchProfiles(profileSearch.trim()), 350)
    return () => clearTimeout(searchDebounceRef.current)
  }, [profileSearch])

  const changeProfile = () => {
    setSelectedProfile(null)
    setProfileSearch('')
    setProfiles([])
  }

  const categories = ['All', ...new Set(testCatalog.map(t => t.category))]
  const filtered = testCatalog.filter(t => {
    const matchCategory = activeCategory === 'All' || t.category === activeCategory
    const matchSearch = t.name.toLowerCase().includes(testSearch.toLowerCase())
    return matchCategory && matchSearch
  })

  const toggleTest = (test) => {
    setSelectedTests(prev => prev.find(t => t.id === test.id) ? prev.filter(t => t.id !== test.id) : [...prev, test])
  }
  const togglePanel = (panel) => {
    setSelectedPanels(prev => prev.find(p => p.id === panel.id) ? prev.filter(p => p.id !== panel.id) : [...prev, panel])
  }

  const formatRange = (range) => {
    if (!range) return null
    const { min_value, max_value } = range
    if (min_value == null || max_value == null) return null
    return `${min_value}-${max_value}`
  }

  const resolveNormalRange = async (testName, component, ageDays, gender, fallbackRange) => {
    try {
      const range = await getReferenceRange(testName, component, ageDays, gender)
      return formatRange(range) || fallbackRange
    } catch {
      return fallbackRange
    }
  }

  const handleSubmit = async () => {
    if (!selectedProfile) return
    if (selectedTests.length === 0 && selectedPanels.length === 0) {
      showToast('اختار تحليل أو باقة واحدة على الأقل', 'warning')
      return
    }

    const ageNum = parseInt(visitAge)
    if (!visitAge || isNaN(ageNum)) {
      showToast('من فضلك ادخل سن صحيح للمريض في الزيارة دي', 'warning')
      return
    }

    setLoading(true)

    const ageDays = selectedProfile.birth_date
      ? Math.floor((new Date() - new Date(selectedProfile.birth_date)) / (1000 * 60 * 60 * 24))
      : ageToApproxDays(ageNum, selectedProfile.age_unit || 'Years')

    // بننشئ صف "زيارة" جديد في نفس جدول patients الحالي، بس مربوط بملف المريض الثابت
    // عن طريق profile_id - باقي النظام (نتائج/تقارير) يفضل شغال زي ما هو من غير أي تغيير
    const { data: visit, error } = await supabase
      .from('patients')
      .insert([{
        profile_id: selectedProfile.id,
        name: selectedProfile.name,
        age: ageNum,
        age_unit: selectedProfile.age_unit || 'Years',
        gender: selectedProfile.gender,
        phone: selectedProfile.phone,
        doctor: visitDoctor,
        notes: visitNotes,
        birth_date: selectedProfile.birth_date || null,
      }])
      .select().single()

    if (error) {
      showToast('حدث خطأ أثناء حفظ الزيارة: ' + error.message, 'error', 5000)
      setLoading(false)
      return
    }

    const singleTestRows = await Promise.all(selectedTests.map(async (t) => ({
      patient_id: visit.id,
      name: t.name,
      normal_range: await resolveNormalRange(t.name, null, ageDays, selectedProfile.gender, t.normal_range),
      unit: t.unit,
      status: 'تم التجميع',
      result_type: 'single',
      price: t.price || 0,
    })))

    const panelRows = []
    for (const panel of selectedPanels) {
      const items = panelItemsMap[panel.id] || []
      const instanceId = crypto.randomUUID()

      const rows = await Promise.all(items.map(async (item) => {
        let normalRange = item.normal_range
        let absoluteRange = null

        if (item.result_type === 'relative_absolute' && item.normal_range?.includes('|')) {
          const [rel, abs] = item.normal_range.split('|')
          normalRange = rel.trim()
          absoluteRange = abs.trim()
        } else {
          normalRange = await resolveNormalRange(panel.code, item.name, ageDays, selectedProfile.gender, item.normal_range)
        }

        return {
          patient_id: visit.id,
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
        }
      }))

      panelRows.push(...rows)
    }

    const { error: testsError } = await supabase.from('tests').insert([...singleTestRows, ...panelRows])

    setLoading(false)

    if (testsError) {
      showToast('تم حفظ الزيارة، لكن حصل خطأ أثناء حفظ التحاليل. راجع صفحة نتائج التحاليل.', 'warning', 6000)
      return
    }

    setSuccess(true)
    setLastVisit(visit)
    showToast(`تم تسجيل زيارة جديدة لـ"${selectedProfile.name}" بنجاح`, 'success')
    setSelectedTests([])
    setSelectedPanels([])
    setVisitDoctor('')
    setVisitNotes('')
    setTimeout(() => setSuccess(false), 4000)
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>زيارة جديدة لمريض موجود</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>دوّر على المريض في سجلك، واختار بس التحاليل الجديدة</p>
      </div>

      {success && (
        <div className="mb-4 p-4 rounded-xl text-sm font-medium flex items-center justify-between flex-wrap gap-3" style={{ background: '#d1fae5', color: '#065f46' }}>
          <span>✅ تم تسجيل الزيارة بنجاح!</span>
          {lastVisit && (
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setShowBarcode(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: '#065f46' }}>
                🏷️ طباعة باركود العينة
              </button>
              {selectedProfile?.portal_code && (
                <>
                  <button onClick={() => setShowQRCode(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'white', color: '#065f46' }}>
                    📱 طباعة QR سجل المريض
                  </button>
                  <button onClick={() => {
                    const link = window.location.origin + '/my-record/' + selectedProfile.portal_code
                    navigator.clipboard?.writeText(link)
                    showToast('✅ اتنسخ رابط سجل المريض (ثابت، يصلح لكل الزيارات)', 'success')
                  }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: 'white', color: '#065f46' }}>
                    🔗 نسخ رابط سجل المريض
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {showBarcode && <BarcodeLabel patient={lastVisit} onClose={() => setShowBarcode(false)} />}
      {showQRCode && <ProfileQRCode profile={selectedProfile} onClose={() => setShowQRCode(false)} />}

      {!selectedProfile ? (
        // ==================== خطوة 1: البحث عن المريض ====================
        <div className="bg-white rounded-xl p-6" style={{ border: '1px solid var(--outline-variant)' }}>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--on-surface)' }}>
            ابحث بالاسم أو رقم الهاتف
          </label>
          <input type="text" autoFocus placeholder="مثلاً: أحمد أو 0101234..." value={profileSearch}
            onChange={e => setProfileSearch(e.target.value)}
            className="w-full px-4 py-3 rounded-lg outline-none text-right mb-4"
            style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
            onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
            onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
          />

          {searchingProfiles ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--on-surface-variant)' }}>جاري البحث...</p>
          ) : profileSearch.trim() && profiles.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm mb-2" style={{ color: 'var(--on-surface-variant)' }}>مفيش مريض بالاسم أو الرقم ده</p>
              <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
                لو ده مريض جديد فعلاً، استخدم صفحة "مريض جديد" من القائمة
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {profiles.map(p => (
                <button key={p.id} onClick={() => selectProfile(p)}
                  className="w-full flex items-center justify-between p-3 rounded-lg text-right transition-all"
                  style={{ border: '1px solid var(--outline-variant)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--on-surface)' }}>{p.name || 'بدون اسم'}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>
                      {p.age ? `${p.age} ${p.age_unit === 'Years' ? 'سنة' : p.age_unit === 'Months' ? 'شهر' : 'يوم'}` : ''}
                      {p.gender ? ` • ${p.gender}` : ''}
                      {p.phone ? ` • ${p.phone}` : ''}
                    </p>
                  </div>
                  <span style={{ color: 'var(--primary-container)' }}>اختيار ←</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        // ==================== خطوة 2: بيانات الزيارة والتحاليل ====================
        <div className="bg-white rounded-xl p-6 space-y-6" style={{ border: '1px solid var(--outline-variant)' }}>

          <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: '#e8f0fe' }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--primary-container)' }}>{selectedProfile.name}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>
                {selectedProfile.gender}{selectedProfile.phone ? ' • ' + selectedProfile.phone : ''}
              </p>
            </div>
            <button onClick={changeProfile} className="text-xs font-medium" style={{ color: 'var(--primary-container)' }}>
              تغيير المريض ✕
            </button>
          </div>

          <div>
            <h2 className="font-semibold mb-4" style={{ color: 'var(--on-surface)' }}>بيانات الزيارة دي</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>
                  السن دلوقتي<span style={{ color: '#dc2626' }}> *</span>
                </label>
                <input type="number" value={visitAge} onChange={e => setVisitAge(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>اسم الدكتور</label>
                <input type="text" placeholder="د. محمد أحمد" value={visitDoctor} onChange={e => setVisitDoctor(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>ملاحظات</label>
                <input type="text" placeholder="اختياري" value={visitNotes} onChange={e => setVisitNotes(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
            </div>
          </div>

          {panels.length > 0 && (
            <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
              <h2 className="font-semibold mb-4" style={{ color: 'var(--on-surface)' }}>
                الباقات
                {selectedPanels.length > 0 && (
                  <span className="mr-2 text-xs px-2 py-1 rounded-full text-white" style={{ background: '#065f46' }}>{selectedPanels.length} محدد</span>
                )}
              </h2>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {panels.map(panel => {
                  const isSelected = !!selectedPanels.find(p => p.id === panel.id)
                  const itemsCount = (panelItemsMap[panel.id] || []).length
                  return (
                    <label key={panel.id} onClick={() => togglePanel(panel)}
                      className="flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-all"
                      style={{ border: `1px solid ${isSelected ? '#065f46' : 'var(--outline-variant)'}`, background: isSelected ? '#d1fae5' : 'white' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => togglePanel(panel)} className="w-4 h-4 accent-green-700" />
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--on-surface)' }}>{panel.name}</p>
                        <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{itemsCount} بند{panel.price ? ` • ${panel.price} جنيه` : ''}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
            <h2 className="font-semibold mb-4" style={{ color: 'var(--on-surface)' }}>
              التحاليل المفردة
              {selectedTests.length > 0 && (
                <span className="mr-2 text-xs px-2 py-1 rounded-full text-white" style={{ background: 'var(--primary-container)' }}>{selectedTests.length} محدد</span>
              )}
            </h2>

            <input type="text" placeholder="ابحث عن تحليل..." value={testSearch} onChange={e => setTestSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg outline-none text-right mb-4"
              style={{ border: '1px solid var(--outline-variant)', fontSize: '13px' }} />

            <div className="flex gap-2 mb-4 flex-wrap">
              {categories.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                  style={{ background: activeCategory === cat ? 'var(--primary-container)' : '#f1f3f4', color: activeCategory === cat ? 'white' : 'var(--on-surface-variant)' }}>
                  {cat}
                </button>
              ))}
            </div>

            {catalogLoading ? (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="animate-pulse" style={{ height: '44px', background: '#f1f3f4', borderRadius: '10px' }} />)}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--on-surface-variant)' }}>لا توجد تحاليل مطابقة لبحثك</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 max-h-64 overflow-y-auto">
                {filtered.map(test => {
                  const isSelected = !!selectedTests.find(t => t.id === test.id)
                  return (
                    <label key={test.id} onClick={() => toggleTest(test)}
                      className="flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all"
                      style={{ border: `1px solid ${isSelected ? 'var(--primary-container)' : 'var(--outline-variant)'}`, background: isSelected ? '#e8f0fe' : 'white' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleTest(test)} className="w-3 h-3 accent-blue-600" />
                      <div>
                        <p className="text-xs font-medium" style={{ color: 'var(--on-surface)' }}>{test.name}</p>
                        <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{test.unit}{test.price ? ` • ${test.price} جنيه` : ''}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end" style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
            <button onClick={changeProfile}
              className="px-6 py-2 rounded-lg text-sm font-medium"
              style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
              إلغاء
            </button>
            <button onClick={handleSubmit} disabled={loading}
              className="px-6 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2"
              style={{ background: 'var(--primary-container)', opacity: loading ? 0.7 : 1 }}>
              {loading && (
                <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block', animation: 'lab-spin-btn2 0.7s linear infinite' }} />
              )}
              {loading ? 'جاري الحفظ...' : 'حفظ الزيارة'}
            </button>
          </div>
        </div>
      )}
      <style>{`
        @keyframes lab-spin-btn2 { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}