import { useEffect, useRef, useState } from 'react'

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

/** Keep the screen awake while `active` is true (e.g. a workout session is
 *  in progress). Silently does nothing where the Wake Lock API is
 *  unavailable -- this is a nice-to-have, not required for logging to work.
 *  Re-acquires on visibility change, since the OS releases the lock when the
 *  tab is backgrounded. */
export function useWakeLock(active) {
  const lockRef = useRef(null)

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined

    let cancelled = false

    async function acquire() {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (cancelled) {
          lock.release()
          return
        }
        lockRef.current = lock
      } catch {
        // ignored -- e.g. tab not visible, or permission denied
      }
    }

    acquire()

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      lockRef.current?.release()
      lockRef.current = null
    }
  }, [active])
}
