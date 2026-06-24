import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

export default function AdminDashboard() {
  const [labs, setLabs] = useState([])
  const [loading, setLoading] = useState(true)
  const [editLab, setEditLab] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [search, setSearch] = useState('')
  const [newLogoFile, setNewLogoFile] = useState(null)
  const [newLogoPreview, setNewLogoPreview] = useState(null)

  useEffect(() => { fetchLabs() }, [])

  const fetchLabs = async () => {
    const { data } = await supabase
      .from('lab_settings')
      .select('*')
      .order('created_at', { ascending: false })
    setLabs(data || [])
    setLoading(false)
  }

  const compressImage = (file, maxSize = 300, quality = 0.75) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          let { width, height } = img
          if (width > height) {
            if (width > maxSize) { height = height * (maxSize / width); width = maxSize }
          } else {
            if (height > maxSize) { width = width * (maxSize / height); height = maxSize }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality)
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })
  }

  const handleEditLogoChange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const compressed = await compressImage(file)
    setNewLogoFile(compressed)
    setNewLogoPreview(URL.createObjectURL(compressed))
  }

  const openEdit = (lab) => {
    setEditLab(lab)
    setNewLogoFile(null)
    setNewLogoPreview(null)
  }

  const saveLab = async () => {
    let logoUrl = editLab.logo_url

    if (newLogoFile) {
      const fileName = `${editLab.user_id}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(fileName, newLogoFile, { upsert: true, contentType: 'image/jpeg' })

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
        logoUrl = `${urlData.publicUrl}?t=${Date.now()}`
      }
    }

    await supabase.from('lab_settings').update({
      lab_name: editLab.lab_name,
      owner_name: editLab.owner_name,
      doctor_name: editLab.doctor_name,
      address: editLab.address,
      phone: editLab.phone,
      email: editLab.email,
      qualification: editLab.qualification,
      logo_url: logoUrl,
    }).eq('id', editLab.id)

    setEditLab(null)
    setNewLogoFile(null)
    setNewLogoPreview(null)
    fetchLabs()
  }

  const deleteLab = async (lab) => {
    // مسح اللوجو من الـ Storage لو موجود
    if (lab.logo_url) {
      await supabase.storage.from('logos').remove([`${lab.user_id}.jpg`])
    }
    // مسح بيانات المعمل
    await supabase.from('lab_settings').delete().eq('id', lab.id)
    // مسح الدور من profiles
    await supabase.from('profiles').delete().eq('id', lab.user_id)

    setDeleteConfirm(null)
    fetchLabs()
  }

  const filtered = labs.filter(l =>
    (l.lab_name || '').includes(search) ||
    (l.owner_name || '').includes(search) ||
    (l.doctor_name || '').includes(search)
  )

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>المعامل المشتركة</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>كل المعامل والدكاترة المسجلين في النظام</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        <div className="bg-white rounded-xl p-4" style={{ border: '1px solid var(--outline-variant)' }}>
          <div className="text-2xl mb-2">🏢</div>
          <div className="text-2xl font-bold" style={{ color: '#1a2456' }}>{labs.length}</div>
          <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>إجمالي المعامل</div>
        </div>
      </div>

      <input type="text" placeholder="ابحث عن معمل أو دكتور..." value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-4 py-2 rounded-lg outline-none text-right mb-4"
        style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
        onFocus={e => e.target.style.border = '2px solid #1a2456'}
        onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
      />

      {/* Modal تعديل */}
      {editLab && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-screen overflow-y-auto" dir="rtl">
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--on-surface)' }}>تعديل بيانات المعمل</h2>

            {/* اللوجو */}
            <div className="flex flex-col items-center gap-3 mb-4">
              <div className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center"
                style={{ border: '2px dashed var(--outline-variant)', background: '#f8f9ff' }}>
                {newLogoPreview
                  ? <img src={newLogoPreview} alt="logo" className="w-full h-full object-cover" />
                  : editLab.logo_url
                    ? <img src={editLab.logo_url} alt="logo" className="w-full h-full object-cover" />
                    : <span className="text-3xl">🔬</span>
                }
              </div>
              <label className="cursor-pointer text-sm font-medium px-4 py-2 rounded-lg"
                style={{ background: '#e8eaf6', color: '#1a2456' }}>
                📷 {editLab.logo_url || newLogoPreview ? 'تغيير اللوجو' : 'رفع لوجو'}
                <input type="file" accept="image/*" onChange={handleEditLogoChange} className="hidden" />
              </label>
            </div>

            <div className="space-y-3">
              {[
                { label: 'اسم المعمل', key: 'lab_name' },
                { label: 'اسم صاحب المعمل', key: 'owner_name' },
                { label: 'اسم الدكتور', key: 'doctor_name' },
                { label: 'العنوان', key: 'address' },
                { label: 'رقم الموبايل', key: 'phone' },
                { label: 'البريد الإلكتروني', key: 'email' },
                { label: 'المؤهل الدراسي', key: 'qualification' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>{f.label}</label>
                  <input type="text" value={editLab[f.key] || ''}
                    onChange={e => setEditLab(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg outline-none text-right"
                    style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => { setEditLab(null); setNewLogoFile(null); setNewLogoPreview(null) }}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={saveLab}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: '#1a2456' }}>
                حفظ التعديلات
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
            <p className="text-sm mb-2" style={{ color: 'var(--on-surface-variant)' }}>
              هيتم حذف معمل <strong>{deleteConfirm.lab_name}</strong> وكل بياناته نهائيًا من اللوحة.
            </p>
            <p className="text-xs mb-5" style={{ color: '#92400e', background: '#fef3c7', padding: '8px', borderRadius: '8px' }}>
              ملحوظة: حساب الدكتور لتسجيل الدخول هيفضل موجود في Authentication، لازم تمسحه يدويًا من Supabase لو عاوز تقفله نهائي.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={() => deleteLab(deleteConfirm)}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: '#dc2626' }}>
                حذف نهائي
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>جاري التحميل...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>لا توجد معامل مسجلة</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(lab => (
            <div key={lab.id} className="bg-white rounded-xl p-4 flex items-center justify-between" style={{ border: '1px solid var(--outline-variant)' }}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 text-2xl" style={{ background: '#f1f3f4' }}>
                  {lab.logo_url ? <img src={lab.logo_url} alt="logo" className="w-full h-full object-cover" /> : '🔬'}
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--on-surface)' }}>{lab.lab_name || 'بدون اسم'}</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                    {lab.doctor_name || lab.owner_name || '-'} • {lab.email}
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--on-surface-variant)' }}>
                    📍 {lab.address || '-'} • 📞 {lab.phone || '-'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => openEdit(lab)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: '#1a2456' }}>
                  ✏️ تعديل
                </button>
                <button onClick={() => setDeleteConfirm(lab)}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#fee2e2', color: '#dc2626' }}>
                  🗑️ حذف
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}