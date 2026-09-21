import React, { useEffect, useState } from 'react'

function secondsLeft(restEndsAt) {
  if (!restEndsAt) return 0
  return Math.max(0, Math.round((restEndsAt - Date.now()) / 1000))
}

/** Counts down from `restEndsAt`, an epoch-ms timestamp persisted on the
 *  session so the timer survives a tab switch or reload. */
export default function RestTimer({ restEndsAt, onCancel }) {
  const [remaining, setRemaining] = useState(() => secondsLeft(restEndsAt))

  useEffect(() => {
    if (!restEndsAt) {
      setRemaining(0)
      return undefined
    }
    setRemaining(secondsLeft(restEndsAt))
    const t = setInterval(() => setRemaining(secondsLeft(restEndsAt)), 250)
    return () => clearInterval(t)
  }, [restEndsAt])

  if (!restEndsAt || remaining <= 0) return null

  const mm = Math.floor(remaining / 60)
  const ss = String(remaining % 60).padStart(2, '0')

  return (
    <div className="sx-rest-timer" role="timer">
      <span className="sx-eyebrow">Rest</span>
      <span className="sx-num sx-rest-timer-clock">
        {mm}:{ss}
      </span>
      <button type="button" onClick={onCancel}>
        Skip rest
      </button>
    </div>
  )
}
