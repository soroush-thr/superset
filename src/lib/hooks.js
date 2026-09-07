import { useEffect, useState } from 'react'

/** Debounce a value: the returned value lags `delayMs` behind `value`,
 *  coalescing rapid changes (search input, keystroke-driven recompute). */
export function useDebounced(value, delayMs) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(t)
  }, [value, delayMs])
  return debounced
}
