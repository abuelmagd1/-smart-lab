import { useEffect, useState } from 'react'

export default function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay || 300)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
