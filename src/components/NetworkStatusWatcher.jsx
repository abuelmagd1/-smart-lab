import { useEffect, useRef } from 'react'
import { useToast } from './Toast'

export default function NetworkStatusWatcher() {
  const showToast = useToast()
  const wasOffline = useRef(false)

  useEffect(() => {
    const handleOffline = () => {
      wasOffline.current = true
      showToast('انقطع الاتصال بالإنترنت، أي تعديل دلوقتي ممكن ميتحفظش', 'error', 8000)
    }

    const handleOnline = () => {
      if (wasOffline.current) {
        showToast('الاتصال بالإنترنت رجع تاني ✅', 'success')
        wasOffline.current = false
      }
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [showToast])

  return null
}
