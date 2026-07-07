import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

export default function AdminNotifications() {
  const [labs, setLabs] = useState([])
  const [sentNotifications, setSentNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({ title: '', message: '', target: 'all' })

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    // مسح الإشعارات اللي عدى عليها أسبوع كامل
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('admin_notifications').delete().lt('created_at', weekAgo)

    const { data: labsData } = await supabase
      .from('lab_settings')
      .select('user_id, lab_name, doctor_name')
      .order('lab_name')
    setLabs(labsData || [])

    const { data: notifData } = await supabase
      .from('admin_notifications')
      .select('*')
      .order('created_at', { ascending: false })
    setSentNotifications(notifData || [])

    setLoading(false)
  }

  const sendNotification = async () => {
    if (!form.title || !form.message) return alert('من فضلك ادخل العنوان والرسالة')
    setSending(true)

    await supabase.from('admin_notifications').insert([{
      title: form.title,
      message: form.message,
      target_user_id: form.target === 'all' ? null : form.target,
    }])

    setSending(false)
    setSuccess(true)
    setForm({ title: '', message: '', target: 'all' })
    fetchData()
    setTimeout(() => setSuccess(false), 3000)
  }

  const deleteNotification = async (id) => {
    if (!window.confirm('هتحذف الإشعار ده؟')) return
    await supabase.from('admin_notifications').delete().eq('id', id)
    fetchData()
  }

  const getTargetLabel = (targetUserId) => {
    if (!targetUserId) return 'كل الدكاترة'
    const lab = labs.find(l => l.user_id === targetUserId)
    return lab ? `${lab.lab_name} (${lab.doctor_name})` : 'دكتور محذوف'
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--on-surface)', fontFamily: 'var(--font-display)' }}>إرسال إشعار</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>بعت إشعار لكل الدكاترة أو دكتور معين</p>
      </div>

      {success && (
        <div className="mb-4 p-4 rounded-xl text-sm font-medium" style={{ background: '#d1fae5', color: '#065f46' }}>
          ✅ تم إرسال الإشعار بنجاح!
        </div>
      )}

      <div className="bg-white rounded-xl p-6 space-y-4 mb-6" style={{ border: '1px solid var(--outline-variant)' }}>
        <div>
          <label htmlFor="target" className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>المستلم</label>
          <select id="target" value={form.target} onChange={e => setForm(p => ({ ...p, target: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg outline-none text-right"
            style={{ border: '1px solid var(--outline-variant)', fontSize: '14px', background: 'white' }}>
            <option value="all">📢 كل الدكاترة</option>
            {labs.map(lab => (
              <option key={lab.user_id} value={lab.user_id}>
                🏢 {lab.lab_name} ({lab.doctor_name})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>عنوان الإشعار</label>
          <input id="title" type="text" value={form.title} placeholder="مثال: تحديث جديد في النظام"
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg outline-none text-right"
            style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
          />
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-medium mb-1" style={{ color: 'var(--on-surface)' }}>نص الرسالة</label>
          <textarea id="message" rows={3} value={form.message} placeholder="اكتب الرسالة هنا..."
            onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
            className="w-full px-4 py-3 rounded-lg outline-none text-right resize-none"
            style={{ border: '1px solid var(--outline-variant)', fontSize: '14px' }}
          />
        </div>

        <div className="flex justify-end">
          <button onClick={sendNotification} disabled={sending}
            className="px-6 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#1a2456', opacity: sending ? 0.7 : 1 }}>
            {sending ? 'جاري الإرسال...' : '📤 إرسال الإشعار'}
          </button>
        </div>
      </div>

      <h2 className="font-semibold mb-3" style={{ color: 'var(--on-surface)' }}>الإشعارات المرسلة</h2>

      {loading ? (
        <div className="text-center py-10" style={{ color: 'var(--on-surface-variant)' }}>جاري التحميل...</div>
      ) : sentNotifications.length === 0 ? (
        <div className="text-center py-10 text-sm" style={{ color: 'var(--on-surface-variant)' }}>لا توجد إشعارات مرسلة</div>
      ) : (
        <div className="space-y-3">
          {sentNotifications.map(n => (
            <div key={n.id} className="bg-white rounded-xl p-4 flex items-center justify-between" style={{ border: '1px solid var(--outline-variant)' }}>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--on-surface)' }}>{n.title}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--on-surface-variant)' }}>{n.message}</p>
                <p className="text-xs mt-2" style={{ color: '#1a2456' }}>
                  📍 {getTargetLabel(n.target_user_id)} • {new Date(n.created_at).toLocaleString('ar-EG')}
                </p>
              </div>
              <button onClick={() => deleteNotification(n.id)}
                className="px-3 py-1 rounded-lg text-xs font-medium flex-shrink-0"
                style={{ background: '#fee2e2', color: '#dc2626' }}>
                🗑️ حذف
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}