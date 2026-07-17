import { useEffect, useRef } from 'react'
import { supabase } from '../supabase'
import { useToast } from './Toast'

export default function SessionWatcher() {
  const showToast = useToast()
  const warnedRef = useRef(false)

  useEffect(() => {
    const interval = setInterval(async () => {
      const { data } = await supabase.auth.getSession()
      const session = data && data.session
      if (!session || !session.expires_at) return

      const msLeft = session.expires_at * 1000 - Date.now()

      if (msLeft > 0 && msLeft < 2 * 60 * 1000 && !warnedRef.current) {
        warnedRef.current = true
        showToast('جلستك هتنتهي خلال دقيقتين، احفظ شغلك عشان ميضيعش', 'warning', 10000)
      }

      if (msLeft > 3 * 60 * 1000) {
        warnedRef.current = false
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [showToast])

  return null
}
