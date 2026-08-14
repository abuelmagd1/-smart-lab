import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import ProfileQRCode from '../components/ProfileQRCode'
import { useToast } from '../components/Toast'

export default function PatientRecords() {
  const navigate = useNavigate()
  const location = useLocation()
  const showToast = useToast()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [visits, setVisits] = useState([])
  const [visitsLoading, setVisitsLoading] = useState(false)
  const [showQRCode, setShowQRCode] = useState(false)

  const [editData, setEditData] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)

  const [showMerge, setShowMerge] = useState(false)
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeResults, setMergeResults] = useState([])
  const [mergeTarget, setMergeTarget] = useState(null)
  const [merging, setMerging] = useState(false)

  const fetchProfiles = async () => {
    const { data, error } = await supabase
      .from('patient_profiles')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      showToast('حصل خطأ أثناء تحميل سجلات المرضى: ' + error.message, 'error', 5000)
    }
    setProfiles(data || [])
    setLoading(false)
  }

  const openProfile = async (profile) => {
    setSelectedProfile(profile)
    setVisitsLoading(true)
    const { data, error } = await supabase
      .from('patients')
      .select('id, created_at, doctor')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false })
    setVisitsLoading(false)
    if (error) {
      showToast('حصل خطأ أثناء تحميل تاريخ الزيارات: ' + error.message, 'error', 5000)
      setVisits([])
      return
    }
    setVisits(data || [])
  }

  useEffect(() => { fetchProfiles() }, [])

  // لو الصفحة اتفتحت من زرار "السجل الكامل" في صفحة تانية (نتايج/تقارير/سجلات)، نفتح الملف المطلوب تلقائي
  useEffect(() => {
    const targetId = location.state?.autoSelectProfileId
    if (!targetId) return
    supabase.from('patient_profiles').select('*').eq('id', targetId).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          showToast('حصل خطأ أثناء تحميل بيانات المريض: ' + error.message, 'error', 5000)
          return
        }
        if (data) openProfile(data)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state])

  const filtered = profiles.filter(p => {
    if (!search.trim()) return true
    const q = search.trim()
    return p.name?.includes(q) || p.phone?.includes(q)
  })

  const closeProfile = () => {
    setSelectedProfile(null)
    setVisits([])
  }

  const copyLink = (profile) => {
    const link = window.location.origin + '/my-record/' + profile.portal_code
    navigator.clipboard?.writeText(link)
    showToast('✅ اتنسخ رابط سجل المريض', 'success')
  }

  const startNewVisit = (profile) => {
    navigate('/existing-patient', { state: { autoSelectProfileId: profile.id } })
  }

  // ============ تعديل بيانات الملف ============
  const startEdit = () => {
    setEditData({
      name: selectedProfile.name || '',
      phone: selectedProfile.phone || '',
      age: selectedProfile.age ?? '',
      age_unit: selectedProfile.age_unit || 'Years',
      gender: selectedProfile.gender || '',
    })
  }

  const saveEdit = async () => {
    if (!editData.name.trim()) {
      showToast('من فضلك ادخل اسم المريض', 'warning')
      return
    }
    setSavingEdit(true)
    const { data, error } = await supabase
      .from('patient_profiles')
      .update({
        name: editData.name.trim(),
        phone: editData.phone.trim() || null,
        age: editData.age === '' ? null : parseInt(editData.age),
        age_unit: editData.age_unit,
        gender: editData.gender || null,
      })
      .eq('id', selectedProfile.id)
      .select().single()
    setSavingEdit(false)
    if (error) {
      showToast('حصل خطأ أثناء حفظ التعديل: ' + error.message, 'error', 5000)
      return
    }
    showToast('✅ تم تعديل بيانات الملف', 'success')
    setSelectedProfile(data)
    setEditData(null)
    fetchProfiles()
  }

  // ============ دمج ملفين مكررين ============
  const openMerge = () => {
    setShowMerge(true)
    setMergeSearch('')
    setMergeResults([])
    setMergeTarget(null)
  }

  const searchMergeCandidates = async (q) => {
    setMergeSearch(q)
    setMergeTarget(null)
    if (!q.trim()) { setMergeResults([]); return }
    const { data, error } = await supabase
      .from('patient_profiles')
      .select('*')
      .neq('id', selectedProfile.id)
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(10)
    if (error) {
      showToast('حصل خطأ أثناء البحث: ' + error.message, 'error', 5000)
      return
    }
    setMergeResults(data || [])
  }

  // بينقل كل زيارات الملف التاني لنفس الملف الحالي، وبعدين يمسح الملف التاني نهائيًا.
  // الملف الحالي (اللي فاتح دلوقتي) هو اللي بيفضل موجود ويحتفظ برابطه وكوده الدائم
  const confirmMerge = async () => {
    if (!mergeTarget) return
    setMerging(true)
    const { error: moveError } = await supabase
      .from('patients')
      .update({ profile_id: selectedProfile.id })
      .eq('profile_id', mergeTarget.id)

    if (moveError) {
      setMerging(false)
      showToast('حصل خطأ أثناء نقل الزيارات: ' + moveError.message, 'error', 5000)
      return
    }

    const { error: deleteError } = await supabase
      .from('patient_profiles')
      .delete()
      .eq('id', mergeTarget.id)

    setMerging(false)
    if (deleteError) {
      showToast('اتنقلت الزيارات، لكن حصل خطأ أثناء حذف الملف المكرر: ' + deleteError.message, 'error', 6000)
    } else {
      showToast('✅ تم الدمج بنجاح - كل زيارات "' + mergeTarget.name + '" بقت تحت "' + selectedProfile.name + '"', 'success', 6000)
    }
    setShowMerge(false)
    openProfile(selectedProfile)
    fetchProfiles()
  }

  return (
    <div className="p-4 sm:p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>سجلات المرضى</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>ملفات المرضى الثابتة، روابط سجلاتهم، وأكواد QR</p>
      </div>

      {showQRCode && <ProfileQRCode profile={selectedProfile} onClose={() => setShowQRCode(false)} />}

      {/* مودال تعديل بيانات الملف */}
      {editData && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" dir="rtl">
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--on-surface)' }}>تعديل بيانات الملف</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>الاسم</label>
                <input type="text" value={editData.name} onChange={e => setEditData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right" style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>رقم الهاتف</label>
                <input type="text" value={editData.phone} onChange={e => setEditData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right" style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>السن</label>
                  <input type="number" value={editData.age} onChange={e => setEditData(prev => ({ ...prev, age: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg outline-none text-right" style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
                </div>
                <div style={{ width: '110px' }}>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>الوحدة</label>
                  <select value={editData.age_unit} onChange={e => setEditData(prev => ({ ...prev, age_unit: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg outline-none text-right" style={{ border: '1px solid var(--outline-variant)', fontSize: '14px', background: 'white' }}>
                    <option value="Years">سنة</option>
                    <option value="Months">شهر</option>
                    <option value="Days">يوم</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>النوع</label>
                <select value={editData.gender} onChange={e => setEditData(prev => ({ ...prev, gender: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right" style={{ border: '1px solid var(--outline-variant)', fontSize: '14px', background: 'white' }}>
                  <option value="">اختر...</option>
                  <option value="ذكر">ذكر</option>
                  <option value="أنثى">أنثى</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setEditData(null)} disabled={savingEdit}
                className="px-4 py-2 rounded-lg text-sm" style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={saveEdit} disabled={savingEdit}
                className="px-4 py-2 rounded-lg text-sm text-white" style={{ background: 'var(--primary-container)', opacity: savingEdit ? 0.7 : 1 }}>
                {savingEdit ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال دمج ملفين */}
      {showMerge && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" dir="rtl">
            <h2 className="font-bold text-lg mb-2" style={{ color: 'var(--on-surface)' }}>دمج مع ملف مكرر</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--on-surface-variant)' }}>
              دوّر على الملف المكرر التاني. كل زياراته هتتنقل لملف <strong>{selectedProfile?.name}</strong> الحالي، وبعدين الملف المكرر هيتمسح نهائيًا.
            </p>
            <input type="text" autoFocus placeholder="ابحث بالاسم أو الهاتف..." value={mergeSearch}
              onChange={e => searchMergeCandidates(e.target.value)}
              className="w-full px-3 py-2 rounded-lg outline-none text-right mb-3" style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />

            {mergeResults.length > 0 && (
              <div className="space-y-1 mb-3" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {mergeResults.map(m => (
                  <button key={m.id} onClick={() => setMergeTarget(m)}
                    className="w-full text-right p-2 rounded-lg text-sm"
                    style={{ background: mergeTarget?.id === m.id ? '#ede9fe' : '#f9fafb', border: mergeTarget?.id === m.id ? '1.5px solid #5b21b6' : '1px solid transparent' }}>
                    {m.name || 'بدون اسم'} {m.phone ? '• ' + m.phone : ''}
                  </button>
                ))}
              </div>
            )}

            {mergeTarget && (
              <div className="p-3 rounded-lg mb-3 text-xs" style={{ background: '#fef3c7', color: '#92400e' }}>
                ⚠️ هيتم مسح ملف "{mergeTarget.name}" نهائيًا بعد نقل زياراته. الإجراء ده مش قابل للتراجع.
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowMerge(false)} disabled={merging}
                className="px-4 py-2 rounded-lg text-sm" style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={confirmMerge} disabled={!mergeTarget || merging}
                className="px-4 py-2 rounded-lg text-sm text-white" style={{ background: '#dc2626', opacity: (!mergeTarget || merging) ? 0.6 : 1 }}>
                {merging ? 'جاري الدمج...' : 'تأكيد الدمج والحذف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!selectedProfile ? (
        <>
          <input type="text" placeholder="ابحث بالاسم أو رقم الهاتف..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-4 py-2 rounded-lg outline-none text-right mb-4"
            style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
            onFocus={e => e.target.style.border = '2px solid var(--primary-container)'}
            onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
          />

          {loading ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>جاري التحميل...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>
              {search ? 'مفيش مريض مطابق للبحث' : 'لسه مفيش سجلات مرضى'}
            </p>
          ) : (
            <div className="space-y-2">
              {filtered.map(p => (
                <button key={p.id} onClick={() => openProfile(p)}
                  className="w-full flex items-center justify-between p-4 rounded-xl text-right transition-all bg-white"
                  style={{ border: '1px solid var(--outline-variant)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--on-surface)' }}>{p.name || 'بدون اسم'}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>
                      {p.age ? `${p.age} ${p.age_unit === 'Years' ? 'سنة' : p.age_unit === 'Months' ? 'شهر' : 'يوم'}` : ''}
                      {p.gender ? ` • ${p.gender}` : ''}
                      {p.phone ? ` • ${p.phone}` : ''}
                    </p>
                  </div>
                  <span style={{ color: 'var(--primary-container)' }}>التفاصيل ←</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl p-6" style={{ border: '1px solid var(--outline-variant)' }}>
          <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
            <div>
              <h2 className="font-bold text-lg" style={{ color: 'var(--on-surface)' }}>{selectedProfile.name}</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                {selectedProfile.age ? `${selectedProfile.age} ${selectedProfile.age_unit === 'Years' ? 'سنة' : selectedProfile.age_unit === 'Months' ? 'شهر' : 'يوم'}` : ''}
                {selectedProfile.gender ? ` • ${selectedProfile.gender}` : ''}
                {selectedProfile.phone ? ` • ${selectedProfile.phone}` : ''}
              </p>
            </div>
            <button onClick={closeProfile} className="text-sm font-medium" style={{ color: 'var(--on-surface-variant)' }}>
              ← رجوع للقائمة
            </button>
          </div>

          <div className="flex gap-2 flex-wrap mb-6">
            <button onClick={() => startNewVisit(selectedProfile)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'var(--primary-container)' }}>
              ➕ تسجيل زيارة جديدة له
            </button>
            {selectedProfile.portal_code && (
              <>
                <button onClick={() => setShowQRCode(true)}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#e8f0fe', color: 'var(--primary-container)' }}>
                  📱 عرض وطباعة QR كود
                </button>
                <button onClick={() => copyLink(selectedProfile)}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#e8f0fe', color: 'var(--primary-container)' }}>
                  🔗 نسخ رابط السجل
                </button>
              </>
            )}
            <button onClick={startEdit}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: '#f1f3f4', color: 'var(--on-surface-variant)' }}>
              ✏️ تعديل البيانات
            </button>
            <button onClick={openMerge}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: '#fef3c7', color: '#92400e' }}>
              🔗 دمج مع ملف مكرر
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: '1.5rem' }}>
            <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--on-surface)' }}>
              سجل الزيارات {visits.length > 0 && `(${visits.length})`}
            </h3>
            {visitsLoading ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--on-surface-variant)' }}>جاري التحميل...</p>
            ) : visits.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--on-surface-variant)' }}>لسه مفيش زيارات مسجلة لهذا المريض</p>
            ) : (
              <div className="space-y-2">
                {visits.map(v => (
                  <div key={v.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: '#f9fafb' }}>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--on-surface)' }}>
                        {new Date(v.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                      {v.doctor && <p className="text-xs mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>د. {v.doctor}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}