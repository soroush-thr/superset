import React, { useEffect, useRef, useState } from 'react'

function secondsLeft(restEndsAt) {
  if (!restEndsAt) return 0
  return Math.max(0, Math.round((restEndsAt - Date.now()) / 1000))
}

/** Counts down from `restEndsAt`, an epoch-ms timestamp persisted on the
 *  session so the timer survives a tab switch or reload. */
export default function RestTimer({ restEndsAt, onAdjust, onCancel }) {
  const [remaining, setRemaining] = useState(() => secondsLeft(restEndsAt))
  // The ring needs a denominator: the largest remaining value seen for this
  // rest (it grows when the user adds time, shrinks never).
  const totalRef = useRef(0)
  const lastEndRef = useRef(null)

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

  if (lastEndRef.current === null || restEndsAt < lastEndRef.current - 20000) totalRef.current = 0
  lastEndRef.current = restEndsAt
  totalRef.current = Math.max(totalRef.current, remaining)
  const progress = totalRef.current ? remaining / totalRef.current : 0
  const RING_R = 15
  const circumference = 2 * Math.PI * RING_R

  const mm = Math.floor(remaining / 60)
  const ss = String(remaining % 60).padStart(2, '0')

  return (
    <div className="sx-rest-timer" role="timer">
      <svg className="sx-rest-ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle className="sx-rest-ring-track" cx="18" cy="18" r={RING_R} />
        <circle
          className="sx-rest-ring-fill"
          cx="18"
          cy="18"
          r={RING_R}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <span className="sx-eyebrow">Rest</span>
      <span className="sx-num sx-rest-timer-clock">
        {mm}:{ss}
      </span>
      {onAdjust && (
        <>
          <button type="button" className="sx-rest-adjust" aria-label="15 seconds less rest" onClick={() => onAdjust(-15)}>
            −15
          </button>
          <button type="button" className="sx-rest-adjust" aria-label="15 seconds more rest" onClick={() => onAdjust(15)}>
            +15
          </button>
        </>
      )}
      <button type="button" onClick={onCancel}>
        Skip
      </button>
    </div>
  )
}
