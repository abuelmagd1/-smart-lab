import { useEffect, useRef, useState } from 'react'

// بيحرّك أي رقم من قيمته القديمة لقيمته الجديدة بحركة سلسة (ease-out) بدل ما يتغير فجأة.
// بيستخدم requestAnimationFrame (مش setInterval) عشان الحركة تفضل ناعمة وخفيفة على الأداء
export default function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(0)
  const startTimeRef = useRef(null)
  const startValueRef = useRef(0)
  const rafRef = useRef(null)

  useEffect(() => {
    const numericTarget = Number(target) || 0
    startValueRef.current = value
    startTimeRef.current = null
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const step = (timestamp) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      const current = startValueRef.current + (numericTarget - startValueRef.current) * eased
      setValue(current)
      if (progress < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration])

  return value
}