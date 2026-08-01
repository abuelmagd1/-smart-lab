import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import ProfileQRCode from '../components/ProfileQRCode'
import { useToast } from '../components/Toast'

export default function PatientRecords() {
  const navigate = useNavigate()
  const showToast = useToast()
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [visits, setVisits] = useState([])
  const [visitsLoading, setVisitsLoading] = useState(false)
  const [showQRCode, setShowQRCode] = useState(false)

  useEffect(() => { fetchProfiles() }, [])

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

  const filtered = profiles.filter(p => {
    if (!search.trim()) return true
    const q = search.trim()
    return p.name?.includes(q) || p.phone?.includes(q)
  })

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

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>سجلات المرضى</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>ملفات المرضى الثابتة، روابط سجلاتهم، وأكواد QR</p>
      </div>

      {showQRCode && <ProfileQRCode profile={selectedProfile} onClose={() => setShowQRCode(false)} />}

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
          <div className="flex items-center justify-between mb-5">
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