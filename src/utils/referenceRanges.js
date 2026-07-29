import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useToast } from '../components/Toast'
import AnimatedNumber from '../components/AnimatedNumber'

export default function Supplies() {
  const showToast = useToast()
  const [supplies, setSupplies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [editItem, setEditItem] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [adjustItem, setAdjustItem] = useState(null) // { supply, amount, reason }
  const [adjusting, setAdjusting] = useState(false)

  useEffect(() => { fetchSupplies() }, [])

  const fetchSupplies = async () => {
    const { data, error } = await supabase.from('lab_supplies').select('*').order('name')
    if (error) showToast('فشل تحميل المستلزمات: ' + error.message, 'error')
    setSupplies(data || [])
    setLoading(false)
  }

  const isLow = (s) => Number(s.current_quantity) <= Number(s.minimum_threshold)

  const filtered = supplies.filter(s =>
    (s.name || '').toLowerCase().includes(search.trim().toLowerCase()) ||
    (s.supplier || '').toLowerCase().includes(search.trim().toLowerCase())
  )

  const lowStockCount = supplies.filter(isLow).length

  const openAdd = () => setEditItem({ name: '', unit: 'وحدة', current_quantity: '', minimum_threshold: '', supplier: '', notes: '' })
  const openEdit = (item) => setEditItem({ ...item })

  const saveItem = async () => {
    if (!editItem.name?.trim()) {
      showToast('من فضلك اكتب اسم الصنف', 'warning')
      return
    }
    setSaving(true)
    const payload = {
      name: editItem.name.trim(),
      unit: editItem.unit?.trim() || 'وحدة',
      current_quantity: parseFloat(editItem.current_quantity) || 0,
      minimum_threshold: parseFloat(editItem.minimum_threshold) || 0,
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

  const openAdjust = (supply, mode) => setAdjustItem({ supply, mode, amount: '', reason: '' })

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

    await supabase.from('lab_supply_movements').insert([{
      supply_id: adjustItem.supply.id,
      change_amount: signedAmount,
      reason: adjustItem.reason?.trim() || (adjustItem.mode === 'add' ? 'إضافة مخزون' : 'استهلاك'),
    }])

    setAdjusting(false)
    showToast(adjustItem.mode === 'add' ? '✅ تم إضافة الكمية' : '✅ تم تسجيل الاستهلاك', 'success')
    setAdjustItem(null)
    fetchSupplies()
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>المستلزمات والكيماويات</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>تتبع المخزون وتنبيه تلقائي لما أي صنف يقرب ينقص</p>
        </div>
        <button onClick={openAdd}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: '#1a2456' }}>
          ➕ إضافة صنف
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-3">
        <div className="bg-white rounded-xl p-4 transition-all hover:shadow-md" style={{ border: '1px solid var(--outline-variant)' }}>
          <div className="text-2xl mb-2">📦</div>
          <div className="text-2xl font-bold" style={{ color: '#1a2456' }}><AnimatedNumber value={supplies.length} /></div>
          <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>إجمالي الأصناف</div>
        </div>
        <div className="bg-white rounded-xl p-4 transition-all hover:shadow-md" style={{ border: '1px solid var(--outline-variant)' }}>
          <div className="text-2xl mb-2">⚠️</div>
          <div className="text-2xl font-bold" style={{ color: lowStockCount > 0 ? '#dc2626' : '#1a2456' }}><AnimatedNumber value={lowStockCount} /></div>
          <div className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>أصناف محتاجة تجديد</div>
        </div>
      </div>

      <input type="text" placeholder="ابحث باسم الصنف أو المورد..." value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-4 py-2 rounded-lg outline-none text-right mb-4"
        style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
        onFocus={e => e.target.style.border = '2px solid #1a2456'}
        onBlur={e => e.target.style.border = '1px solid var(--outline-variant)'}
      />

      {/* Modal إضافة/تعديل صنف */}
      {editItem && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" dir="rtl">
            <h2 className="font-bold text-lg mb-4" style={{ color: 'var(--on-surface)' }}>
              {editItem.id ? 'تعديل بيانات الصنف' : 'إضافة صنف جديد'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>اسم الصنف *</label>
                <input type="text" value={editItem.name || ''}
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
                  <input type="number" value={editItem.current_quantity ?? ''}
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
                <input type="number" value={editItem.minimum_threshold ?? ''}
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
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={saveItem} disabled={saving}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: '#1a2456', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal إضافة/استهلاك كمية */}
      {adjustItem && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm" dir="rtl">
            <h2 className="font-bold text-lg mb-2" style={{ color: 'var(--on-surface)' }}>
              {adjustItem.mode === 'add' ? '➕ إضافة كمية' : '➖ تسجيل استهلاك'}
            </h2>
            <p className="text-sm mb-4" style={{ color: 'var(--on-surface-variant)' }}>
              الصنف: <strong>{adjustItem.supply.name}</strong> — المتاح حاليًا: {adjustItem.supply.current_quantity} {adjustItem.supply.unit}
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>الكمية</label>
                <input type="number" value={adjustItem.amount}
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
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={confirmAdjust} disabled={adjusting}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: adjustItem.mode === 'add' ? '#065f46' : '#92400e', opacity: adjusting ? 0.7 : 1 }}>
                {adjusting ? 'جاري الحفظ...' : 'تأكيد'}
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
              هيتم حذف صنف <strong>{deleteConfirm.name}</strong> وسجل حركته نهائيًا.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm(null)} disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: '1px solid var(--outline-variant)', color: 'var(--on-surface-variant)' }}>
                إلغاء
              </button>
              <button onClick={deleteItem} disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm text-white"
                style={{ background: '#dc2626', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'جاري الحذف...' : 'حذف'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid var(--outline-variant)' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="p-4 animate-pulse flex items-center gap-4" style={{ borderTop: i > 1 ? '1px solid var(--outline-variant)' : 'none' }}>
              <div style={{ width: '130px', height: '14px', background: '#f1f3f4', borderRadius: '6px' }} />
              <div style={{ width: '70px', height: '14px', background: '#f1f3f4', borderRadius: '6px' }} />
              <div style={{ width: '70px', height: '14px', background: '#f1f3f4', borderRadius: '6px' }} />
              <div style={{ width: '60px', height: '20px', background: '#f1f3f4', borderRadius: '999px' }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>
          {supplies.length === 0 ? 'لسه مفيش أصناف مسجلة. دوس "➕ إضافة صنف" تبدأ.' : 'لا توجد أصناف مطابقة للبحث'}
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid var(--outline-variant)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: '#f1f3f4' }}>
                <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الصنف</th>
                <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الكمية الحالية</th>
                <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الحد الأدنى</th>
                <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>المورد</th>
                <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>الحالة</th>
                <th className="text-right p-3 text-xs font-semibold" style={{ color: 'var(--on-surface-variant)' }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="transition-colors" style={{ borderTop: '1px solid var(--outline-variant)', background: isLow(s) ? '#fef2f2' : 'transparent' }}>
                  <td className="p-3 text-sm font-medium" style={{ color: 'var(--on-surface)' }}>{s.name}</td>
                  <td className="p-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>{s.current_quantity} {s.unit}</td>
                  <td className="p-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>{s.minimum_threshold} {s.unit}</td>
                  <td className="p-3 text-sm" style={{ color: 'var(--on-surface-variant)' }}>{s.supplier || '-'}</td>
                  <td className="p-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={isLow(s) ? { background: '#fee2e2', color: '#dc2626' } : { background: '#d1fae5', color: '#065f46' }}>
                      {isLow(s) ? '⚠️ ناقص' : '✅ كافي'}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 flex-wrap">
                      <button onClick={() => openAdjust(s, 'add')}
                        className="px-2 py-1 rounded-lg text-xs font-medium" style={{ background: '#d1fae5', color: '#065f46' }}>
                        ➕ إضافة
                      </button>
                      <button onClick={() => openAdjust(s, 'consume')}
                        className="px-2 py-1 rounded-lg text-xs font-medium" style={{ background: '#fef3c7', color: '#92400e' }}>
                        ➖ استهلاك
                      </button>
                      <button onClick={() => openEdit(s)}
                        className="px-2 py-1 rounded-lg text-xs font-medium" style={{ background: '#e8f0fe', color: 'var(--primary-container)' }}>
                        ✏️
                      </button>
                      <button onClick={() => setDeleteConfirm(s)}
                        className="px-2 py-1 rounded-lg text-xs font-medium" style={{ background: '#fee2e2', color: '#dc2626' }}>
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
  )
}