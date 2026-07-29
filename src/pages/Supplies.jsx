import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabase'
import { useToast } from '../components/Toast'

// بيحرّك رقم من صفر للقيمة المستهدفة بشكل ناعم - بيدي إحساس "حي" للأرقام الإحصائية
function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let startTime = null
    let raf
    const step = (ts) => {
      if (!startTime) startTime = ts
      const progress = Math.min((ts - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setValue(Math.round(target * eased))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

// بيقسّم النص لأجزاء عشان نظلل كلمة البحث المطابقة جوه النتيجة
const highlightMatch = (text, query) => {
  if (!query.trim() || !text) return text
  const idx = text.toLowerCase().indexOf(query.trim().toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: '#fef08a', color: 'inherit', borderRadius: '3px', padding: '0 1px' }}>
        {text.slice(idx, idx + query.trim().length)}
      </mark>
      {text.slice(idx + query.trim().length)}
    </>
  )
}

// بيحسب نسبة امتلاء المخزون لرسم البار المرئي، ولون يعبّر عن مدى الخطورة
const getStockLevel = (s) => {
  const current = Number(s.current_quantity) || 0
  const threshold = Number(s.minimum_threshold) || 0
  const safeMax = threshold > 0 ? threshold * 2.5 : Math.max(current, 1)
  const ratio = Math.max(0, Math.min(1, current / safeMax))
  let color = '#10b981' // أخضر - مطمئن
  if (current <= threshold) color = '#dc2626' // أحمر - ناقص فعليًا
  else if (ratio < 0.5) color = '#f59e0b' // أصفر - قرّب يخلص
  return { ratio, color }
}

export default function Supplies() {
  const showToast = useToast()
  const [supplies, setSupplies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showLowOnly, setShowLowOnly] = useState(false)

  const [editItem, setEditItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [adjustItem, setAdjustItem] = useState(null) // { supply, amount, reason }
  const [adjusting, setAdjusting] = useState(false)

  const nameInputRef = useRef(null)
  const amountInputRef = useRef(null)

  useEffect(() => { fetchSupplies() }, [])

  // إغلاق أي مودال مفتوح بزرار Escape - تجربة استخدام أفضل من غير ما تلمس الماوس
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return
      if (saving || deleting || adjusting) return // منع الإغلاق أثناء عملية شغالة فعليًا
      if (editItem) setEditItem(null)
      else if (deleteConfirm) setDeleteConfirm(null)
      else if (adjustItem) setAdjustItem(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editItem, deleteConfirm, adjustItem, saving, deleting, adjusting])

  // focus تلقائي على أول حقل لما أي مودال يفتح
  useEffect(() => {
    if (editItem && nameInputRef.current) nameInputRef.current.focus()
  }, [editItem])
  useEffect(() => {
    if (adjustItem && amountInputRef.current) amountInputRef.current.focus()
  }, [adjustItem])

  const fetchSupplies = async () => {
    const { data, error } = await supabase.from('lab_supplies').select('*').order('name')
    if (error) showToast('فشل تحميل المستلزمات: ' + error.message, 'error')
    setSupplies(data || [])
    setLoading(false)
  }

  const isLow = (s) => Number(s.current_quantity) <= Number(s.minimum_threshold)

  const filtered = supplies
    .filter(s =>
      (s.name || '').toLowerCase().includes(search.trim().toLowerCase()) ||
      (s.supplier || '').toLowerCase().includes(search.trim().toLowerCase())
    )
    .filter(s => !showLowOnly || isLow(s))
    // الأصناف الناقصة تطلع فوق - أهم حاجة يشوفها الكيميائي بسرعة
    .sort((a, b) => {
      const aLow = isLow(a) ? 0 : 1
      const bLow = isLow(b) ? 0 : 1
      if (aLow !== bLow) return aLow - bLow
      return (a.name || '').localeCompare(b.name || '', 'ar')
    })

  const lowStockCount = supplies.filter(isLow).length
  const healthyPercent = supplies.length ? Math.round(((supplies.length - lowStockCount) / supplies.length) * 100) : 100

  const animatedTotal = useCountUp(supplies.length)
  const animatedLow = useCountUp(lowStockCount)
  const animatedHealth = useCountUp(healthyPercent)

  const openAdd = () => setEditItem({ name: '', unit: 'وحدة', current_quantity: '', minimum_threshold: '', supplier: '', notes: '' })
  const openEdit = (item) => setEditItem({ ...item })

  const saveItem = async () => {
    const trimmedName = editItem.name?.trim()
    if (!trimmedName) {
      showToast('من فضلك اكتب اسم الصنف', 'warning')
      return
    }

    // تنبيه لو في صنف بنفس الاسم أصلاً (بدون حساسية لحالة الأحرف)، عشان نتجنب تكرار غير مقصود
    const duplicate = supplies.find(s =>
      s.name?.trim().toLowerCase() === trimmedName.toLowerCase() && s.id !== editItem.id
    )
    if (duplicate) {
      showToast('في صنف مسجل بنفس الاسم بالفعل: "' + duplicate.name + '". غيّر الاسم أو عدّل على الصنف الموجود', 'warning', 6000)
      return
    }

    const quantityNum = parseFloat(editItem.current_quantity)
    const thresholdNum = parseFloat(editItem.minimum_threshold)

    if (!editItem.id && editItem.current_quantity !== '' && (isNaN(quantityNum) || quantityNum < 0)) {
      showToast('الكمية الأولية لازم تكون رقم صحيح وأكبر من أو يساوي صفر', 'warning')
      return
    }
    if (editItem.minimum_threshold !== '' && (isNaN(thresholdNum) || thresholdNum < 0)) {
      showToast('الحد الأدنى لازم يكون رقم صحيح وأكبر من أو يساوي صفر', 'warning')
      return
    }

    setSaving(true)
    const payload = {
      name: trimmedName,
      unit: editItem.unit?.trim() || 'وحدة',
      current_quantity: isNaN(quantityNum) ? 0 : quantityNum,
      minimum_threshold: isNaN(thresholdNum) ? 0 : thresholdNum,
      supplier: editItem.supplier?.trim() || null,
      notes: editItem.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = editItem.id
      ? await supabase.from('lab_supplies').update(payload).eq('id', editItem.id)
      : await supabase.from('lab_supplies').insert([payload])

    setSaving(false)
    if (error) {
      showToast('فشل حفظ الصنف: ' + error.message, 'error')
      return
    }
    showToast('✅ تم حفظ الصنف بنجاح', 'success')
    setEditItem(null)
    fetchSupplies()
  }

  const deleteItem = async () => {
    if (!deleteConfirm) return
    setDeleting(true)
    const { error } = await supabase.from('lab_supplies').delete().eq('id', deleteConfirm.id)
    setDeleting(false)
    if (error) {
      showToast('فشل حذف الصنف: ' + error.message, 'error')
      return
    }
    showToast('🗑️ تم حذف الصنف', 'success')
    setDeleteConfirm(null)
    fetchSupplies()
  }

  const openAdjust = (supply, mode) => {
    if (mode === 'consume' && Number(supply.current_quantity) <= 0) {
      showToast('الصنف ده خالص خالص، مفيش كمية تتسجل كاستهلاك', 'warning')
      return
    }
    setAdjustItem({ supply, mode, amount: '', reason: '' })
  }

  const confirmAdjust = async () => {
    const amountNum = parseFloat(adjustItem.amount)
    if (!amountNum || amountNum <= 0) {
      showToast('من فضلك ادخل كمية صحيحة أكبر من صفر', 'warning')
      return
    }
    setAdjusting(true)
    const signedAmount = adjustItem.mode === 'add' ? amountNum : -amountNum
    const newQuantity = Number(adjustItem.supply.current_quantity) + signedAmount

    if (newQuantity < 0) {
      showToast('الكمية دي أكبر من المتاح فعليًا (' + adjustItem.supply.current_quantity + ')', 'warning')
      setAdjusting(false)
      return
    }

    const { error: updateError } = await supabase.from('lab_supplies').update({
      current_quantity: newQuantity,
      updated_at: new Date().toISOString(),
    }).eq('id', adjustItem.supply.id)

    if (updateError) {
      showToast('فشل تحديث الكمية: ' + updateError.message, 'error')
      setAdjusting(false)
      return
    }

    const { error: movementError } = await supabase.from('lab_supply_movements').insert([{
      supply_id: adjustItem.supply.id,
      change_amount: signedAmount,
      reason: adjustItem.reason?.trim() || (adjustItem.mode === 'add' ? 'إضافة مخزون' : 'استهلاك'),
    }])

    setAdjusting(false)

    // الكمية اتحدثت فعليًا حتى لو سجل الحركة فشل - المستخدم لازم يعرف إن في جزء ناقص
    if (movementError) {
      showToast('✅ تم تحديث الكمية، لكن حصل خطأ في تسجيل سجل الحركة: ' + movementError.message, 'warning', 7000)
    } else {
      showToast(adjustItem.mode === 'add' ? '✅ تم إضافة الكمية' : '✅ تم تسجيل الاستهلاك', 'success')
    }
    setAdjustItem(null)
    fetchSupplies()
  }

  const handleModalBackdropClick = (closeFn, isBusy) => (e) => {
    if (e.target !== e.currentTarget) return
    if (isBusy) return
    closeFn()
  }

  const StockBar = ({ supply }) => {
    const { ratio, color } = getStockLevel(supply)
    return (
      <div style={{ width: '100%', maxWidth: '90px' }}>
        <div style={{ height: '6px', borderRadius: '4px', background: '#eef0f2', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${Math.max(ratio * 100, 4)}%`, borderRadius: '4px',
            background: color, transition: 'width 0.5s ease-out',
          }} />
        </div>
      </div>
    )
  }

  const ActionButtons = ({ s }) => (
    <div className="flex gap-1 flex-wrap">
      <button onClick={() => openAdjust(s, 'add')}
        className="px-2 py-1 rounded-lg text-xs font-medium transition-transform"
        style={{ background: '#d1fae5', color: '#065f46' }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.94)'}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
        ➕ إضافة
      </button>
      <button onClick={() => openAdjust(s, 'consume')}
        disabled={Number(s.current_quantity) <= 0}
        className="px-2 py-1 rounded-lg text-xs font-medium transition-transform"
        style={{ background: '#fef3c7', color: '#92400e', opacity: Number(s.current_quantity) <= 0 ? 0.5 : 1, cursor: Number(s.current_quantity) <= 0 ? 'not-allowed' : 'pointer' }}
        title={Number(s.current_quantity) <= 0 ? 'الصنف خالص، مفيش كمية تتسجل كاستهلاك' : ''}
        onMouseDown={e => { if (Number(s.current_quantity) > 0) e.currentTarget.style.transform = 'scale(0.94)' }}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
        ➖ استهلاك
      </button>
      <button onClick={() => openEdit(s)}
        className="px-2 py-1 rounded-lg text-xs font-medium transition-transform"
        style={{ background: '#e8f0fe', color: 'var(--primary-container)' }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.94)'}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
        ✏️
      </button>
      <button onClick={() => setDeleteConfirm(s)}
        className="px-2 py-1 rounded-lg text-xs font-medium transition-transform"
        style={{ background: '#fee2e2', color: '#dc2626' }}
        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.94)'}
        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
        🗑️
      </button>
    </div>
  )

  return (
    <div className="p-6" dir="rtl">
      <style>{`
        @keyframes supFadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes supScaleIn {
          from { opacity: 0; transform: scale(0.94) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes supPulseRing {
          0% { box-shadow: 0 0 0 0 rgba(220,38,38,0.35); }
          70% { box-shadow: 0 0 0 8px rgba(220,38,38,0); }
          100% { box-shadow: 0 0 0 0 rgba(220,38,38,0); }
        }
        .sup-row-anim { animation: supFadeInUp 0.35s ease-out both; }
        .sup-modal-anim { animation: supScaleIn 0.22s ease-out both; }
        .sup-card-hover { transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .sup-card-hover:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(16,24,40,0.08); }
      `}</style>

      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>المستلزمات والكيماويات</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>تتبع المخزون وتنبيه تلقائي لما أي صنف يقرب ينقص</p>
        </div>
        <button onClick={openAdd}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white sup-card-hover"
          style={{ background: '#1a2456' }}>
          ➕ إضافة صنف
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-3">
        <div className="bg-white rounded-xl p-4 sup-card-hover" style={{ border: '1px solid var(--outline-variant)' }}>
          <div className="text-2xl mb-2">📦</div>
          <div className="text-2xl font-bold" style={{ color: '#1a2456' }}>{animatedTotal}</div>
          <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>إجمالي الأصناف</div>
        </div>

        <button onClick={() => setShowLowOnly(prev => !prev)}
          className="bg-white rounded-xl p-4 text-right sup-card-hover"
          style={{
            border: showLowOnly ? '2px solid #dc2626' : '1px solid var(--outline-variant)',
            animation: lowStockCount > 0 ? 'supPulseRing 2.2s infinite' : 'none',
          }}>
          <div className="text-2xl mb-2">⚠️</div>
          <div className="text-2xl font-bold" style={{ color: lowStockCount > 0 ? '#dc2626' : '#1a2456' }}>{animatedLow}</div>
          <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>
            أصناف محتاجة تجديد {showLowOnly ? '(معروض بس دول)' : ''}
          </div>
        </button>

        <div className="bg-white rounded-xl p-4 sup-card-hover col-span-2 lg:col-span-1" style={{ border: '1px solid var(--outline-variant)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-2xl">💚</div>
            <span className="text-xs font-bold" style={{ color: animatedHealth >= 80 ? '#065f46' : animatedHealth >= 50 ? '#92400e' : '#dc2626' }}>
              {animatedHealth}%
            </span>
          </div>
          <div style={{ height: '8px', borderRadius: '5px', background: '#eef0f2', overflow: 'hidden', marginBottom: '8px' }}>
            <div style={{
              height: '100%', width: `${animatedHealth}%`, borderRadius: '5px', transition: 'width 0.3s',
              background: animatedHealth >= 80 ? '#10b981' : animatedHealth >= 50 ? '#f59e0b' : '#dc2626',
            }} />
          </div>
          <div className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>معدل سلامة المخزون</div>
        </div>
      </div>

      <div className="relative mb-4">
        <input type="text" placeholder="ابحث باسم الصنف أو المورد..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-2 rounded-lg outline-none text-right transition-all"
          style={{ border: '1px solid var(--outline-variant)', fontSize: '14px', paddingLeft: search ? '36px' : '16px' }}
          onFocus={e => e.target.style.border = '2px solid #1a2456'}
          onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
        />
        {search && (
          <button onClick={() => setSearch('')} aria-label="مسح البحث"
            className="absolute top-1/2 flex items-center justify-center transition-transform"
            style={{ left: '8px', transform: 'translateY(-50%)', width: '22px', height: '22px', borderRadius: '50%', background: '#f1f3f4', color: 'var(--on-surface-variant)', fontSize: '13px', border: 'none', cursor: 'pointer' }}
            onMouseDown={e => e.currentTarget.style.transform = 'translateY(-50%) scale(0.9)'}
            onMouseUp={e => e.currentTarget.style.transform = 'translateY(-50%) scale(1)'}>
            ✕
          </button>
        )}
      </div>

      {/* Modal إضافة/تعديل صنف */}
      {editItem && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={handleModalBackdropClick(() => setEditItem(null), saving)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm sup-modal-anim" dir="rtl"
            onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); saveItem() } }}>
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--on-surface)' }}>
              {editItem.id ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>اسم الصنف *</label>
                <input ref={nameInputRef} type="text" value={editItem.name || ''}
                  onChange={e => setEditItem(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="مثال: كاشف الجلوكوز"
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>
                    {editItem.id ? 'الكمية الحالية' : 'الكمية الأولية'}
                  </label>
                  <input type="number" min="0" step="any" value={editItem.current_quantity ?? ''}
                    onChange={e => setEditItem(prev => ({ ...prev, current_quantity: e.target.value }))}
                    disabled={!!editItem.id}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg outline-none text-right"
                    style={{ border: '1px solid var(--outline-variant)', fontSize: '14px', opacity: editItem.id ? 0.6 : 1 }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>الوحدة</label>
                  <input type="text" value={editItem.unit || ''}
                    onChange={e => setEditItem(prev => ({ ...prev, unit: e.target.value }))}
                    placeholder="زجاجة / علبة / مل"
                    className="w-full px-3 py-2 rounded-lg outline-none text-right"
                    style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
                </div>
              </div>
              {editItem.id && (
                <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
                  💡 لتغيير الكمية استخدم زراير "➕ إضافة" أو "➖ استهلاك" من الجدول بدل التعديل هنا، عشان يتسجل في سجل الحركة.
                </p>
              )}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>الحد الأدنى للتنبيه</label>
                <input type="number" min="0" step="any" value={editItem.minimum_threshold ?? ''}
                  onChange={e => setEditItem(prev => ({ ...prev, minimum_threshold: e.target.value }))}
                  placeholder="مثال: 5"
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>المورد / الشركة</label>
                <input type="text" value={editItem.supplier || ''}
                  onChange={e => setEditItem(prev => ({ ...prev, supplier: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>ملاحظات</label>
                <textarea rows={2} value={editItem.notes || ''}
                  onChange={e => setEditItem(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right resize-none"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setEditItem(null)} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)', opacity: saving ? 0.6 : 1 }}>
                إلغاء
              </button>
              <button onClick={saveItem} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm text-white flex items-center gap-2"
                style={{ background: '#1a2456', opacity: saving ? 0.7 : 1 }}>
                {saving && (
                  <span className="animate-spin" style={{ width: '11px', height: '11px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block' }} />
                )}
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal إضافة/استهلاك كمية */}
      {adjustItem && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={handleModalBackdropClick(() => setAdjustItem(null), adjusting)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm sup-modal-anim" dir="rtl"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmAdjust() } }}>
            <h2 className="font-bold text-lg mb-2" style={{ color: 'var(--on-surface)' }}>
              {adjustItem.mode === 'add' ? '➕ إضافة كمية' : '➖ تسجيل استهلاك'}
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--on-surface-variant)' }}>
              الصنف: <strong>{adjustItem.supply.name}</strong> — المتاح حاليًا: {adjustItem.supply.current_quantity} {adjustItem.supply.unit}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>الكمية</label>
                <input ref={amountInputRef} type="number" min="0" step="any" value={adjustItem.amount}
                  onChange={e => setAdjustItem(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>السبب (اختياري)</label>
                <input type="text" value={adjustItem.reason}
                  onChange={e => setAdjustItem(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder={adjustItem.mode === 'add' ? 'مثال: توريد جديد' : 'مثال: استخدام يومي'}
                  className="w-full px-3 py-2 rounded-lg outline-none text-right"
                  style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }} />
              </div>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setAdjustItem(null)} disabled={adjusting}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)', opacity: adjusting ? 0.6 : 1 }}>
                إلغاء
              </button>
              <button onClick={confirmAdjust} disabled={adjusting}
                className="px-4 py-2 rounded-lg text-sm text-white flex items-center gap-2"
                style={{ background: adjustItem.mode === 'add' ? '#065f46' : '#92400e', opacity: adjusting ? 0.7 : 1 }}>
                {adjusting && (
                  <span className="animate-spin" style={{ width: '11px', height: '11px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block' }} />
                )}
                {adjusting ? 'جاري الحفظ...' : 'تأكيد'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal تأكيد الحذف */}
      {deleteConfirm && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={handleModalBackdropClick(() => setDeleteConfirm(null), deleting)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm sup-modal-anim" dir="rtl">
            <h2 className="font-bold text-lg mb-2" style={{ color: '#dc2626' }}>⚠️ تأكيد الحذف</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--on-surface-variant)' }}>
              هيتم حذف صنف <strong>{deleteConfirm.name}</strong> وسجل حركته نهائيًا. الإجراء ده مايتراجعش.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)', opacity: deleting ? 0.6 : 1 }}>
                إلغاء
              </button>
              <button onClick={deleteItem} disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm text-white flex items-center gap-2"
                style={{ background: '#dc2626', opacity: deleting ? 0.7 : 1 }}>
                {deleting && (
                  <span className="animate-spin" style={{ width: '11px', height: '11px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', display: 'inline-block' }} />
                )}
                {deleting ? 'جاري الحذف...' : 'حذف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        // Skeleton loading - إحساس إن الصفحة "حية" وبتتحمل، مش شاشة فاضية جامدة
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl p-4 flex items-center gap-4" style={{ border: '1px solid var(--outline-variant)' }}>
              <div className="animate-pulse rounded-lg" style={{ width: '40%', height: '14px', background: '#eef0f2' }} />
              <div className="animate-pulse rounded-lg" style={{ width: '15%', height: '14px', background: '#eef0f2' }} />
              <div className="animate-pulse rounded-lg" style={{ width: '15%', height: '14px', background: '#eef0f2' }} />
              <div className="animate-pulse rounded-full mr-auto" style={{ width: '70px', height: '20px', background: '#eef0f2' }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14" style={{ color: 'var(--on-surface-variant)' }}>
          <div className="text-5xl mb-3" style={{ animation: 'supFadeInUp 0.4s ease-out both' }}>
            {supplies.length === 0 ? '📭' : showLowOnly ? '🎉' : '🔍'}
          </div>
          <p className="text-sm font-medium mb-1">
            {supplies.length === 0
              ? 'لسه مفيش أصناف مسجلة'
              : showLowOnly
                ? 'مفيش أصناف ناقصة حاليًا!'
                : 'لا توجد أصناف مطابقة للبحث'}
          </p>
          <p className="text-xs" style={{ opacity: 0.8 }}>
            {supplies.length === 0 ? 'دوس "➕ إضافة صنف" تبدأ' : showLowOnly ? 'المخزون كله في وضع مطمئن 👍' : 'جرّب كلمة بحث مختلفة'}
          </p>
          {(search || showLowOnly) && supplies.length > 0 && (
            <div className="mt-3">
              <button onClick={() => { setSearch(''); setShowLowOnly(false) }}
                className="text-xs font-medium px-3 py-1.5 rounded-lg"
                style={{ background: '#e8f0fe', color: '#1a2456' }}>
                ↺ إلغاء البحث والفلتر
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* عرض كروت للموبايل - أوضح بكتير من جدول بيتعمله سكرول جانبي على شاشة صغيرة */}
          <div className="space-y-3 md:hidden">
            {filtered.map((s, i) => (
              <div key={s.id} className="sup-row-anim bg-white rounded-xl p-4 sup-card-hover"
                style={{ border: '1px solid var(--outline-variant)', background: isLow(s) ? '#fef2f2' : 'white', animationDelay: `${Math.min(i * 40, 400)}ms` }}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--on-surface)' }}>{highlightMatch(s.name, search)}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>{s.supplier ? highlightMatch(s.supplier, search) : 'بدون مورد'}</p>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                    style={isLow(s) ? { background: '#fee2e2', color: '#dc2626' } : { background: '#d1fae5', color: '#065f46' }}>
                    {isLow(s) ? '⚠️ ناقص' : '✅ كافي'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>
                    {s.current_quantity} / حد أدنى {s.minimum_threshold} {s.unit}
                  </span>
                  <StockBar supply={s} />
                </div>
                <ActionButtons s={s} />
              </div>
            ))}
          </div>

          {/* الجدول - للشاشات المتوسطة والكبيرة */}
          <div className="hidden md:block bg-white rounded-xl overflow-hidden overflow-x-auto" style={{ border: '1px solid var(--outline-variant)' }}>
            <table className="w-full">
              <thead>
                <tr style={{ background: '#f1f3f4' }}>
                  <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الصنف</th>
                  <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>مستوى المخزون</th>
                  <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الكمية الحالية</th>
                  <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الحد الأدنى</th>
                  <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>المورد</th>
                  <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الحالة</th>
                  <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr key={s.id} className="sup-row-anim"
                    style={{
                      borderTop: '1px solid var(--outline-variant)',
                      background: isLow(s) ? '#fef2f2' : 'transparent',
                      animationDelay: `${Math.min(i * 35, 350)}ms`,
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => { if (!isLow(s)) e.currentTarget.style.background = '#fafbfc' }}
                    onMouseLeave={e => { if (!isLow(s)) e.currentTarget.style.background = 'transparent' }}>
                    <td className="p-3 text-sm font-medium" style={{ color: 'var(--on-surface)' }}>{highlightMatch(s.name, search)}</td>
                    <td className="p-3"><StockBar supply={s} /></td>
                    <td className="p-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>{s.current_quantity} {s.unit}</td>
                    <td className="p-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>{s.minimum_threshold} {s.unit}</td>
                    <td className="p-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>{s.supplier ? highlightMatch(s.supplier, search) : '-'}</td>
                    <td className="p-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={isLow(s) ? { background: '#fee2e2', color: '#dc2626' } : { background: '#d1fae5', color: '#065f46' }}>
                        {isLow(s) ? '⚠️ ناقص' : '✅ كافي'}
                      </span>
                    </td>
                    <td className="p-3"><ActionButtons s={s} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}